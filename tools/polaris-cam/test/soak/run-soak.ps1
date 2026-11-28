# Polaris Cam Stage 3: one-command soak / throttled-upload stress test, with an automatic PASS/FAIL summary.
# Windows PowerShell 5.1 or PowerShell 7.
#
#   本機（真實 CamRelay + 真實 polaris-cam.exe + polaris-cam-selftest.exe --serve --hardware）：
#     powershell -ExecutionPolicy Bypass -File run-soak.ps1 -Mode local -Preset quick [-Bin <資料夾>]
#   正式後台（透明限速／斷線注入代理，使用者自己的 polaris-cam.exe，可開著 MSFS）：
#     powershell -ExecutionPolicy Bypass -File run-soak.ps1 -Mode live -Preset soak -Link https://efb-api.koz8738.com/live/cam/<token>
#
# Results go to -OutDir (default %TEMP%\polaris-cam-soak\<time>), never into the repository:
#   metrics.csv (every -SampleSec), summary.md, proxy-final.json, proxy-series.ndjson, proxy-events.log, polaris-cam.log, ...
#   run-soak.ps1 -Rejudge <that folder> writes its summary.md again from them (after the thresholds changed, say).
[CmdletBinding()]
param(
    [ValidateSet('local', 'live')][string]$Mode = 'local',
    [ValidateSet('quick', 'soak')][string]$Preset = 'quick',
    [int]$DurationMin = 0,
    [string]$Link = '',
    [string]$Bin = '',
    [int]$Port = 18787,
    [string]$OutDir = '',
    [int]$SampleSec = 5,
    [switch]$ShowWindow,  # local: show polaris-cam.exe's window normally (default: minimised, never taking the focus)
    [string]$Rejudge = ''   # only (re)write summary.md from the results already in that folder
)
$ErrorActionPreference = 'Stop'
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
if ($DurationMin -le 0) { if ($Preset -eq 'quick') { $DurationMin = 3 } else { $DurationMin = 180 } }
$DurationSec = $DurationMin * 60
$Here = $PSScriptRoot
$ProxyJs = Join-Path $Here 'soak-proxy.mjs'

function Say([string]$Text, [string]$Color = 'Gray') { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Text) -ForegroundColor $Color }
# a value, not nothing ('' -eq 0 is true in PowerShell, so 0 must not be compared with '')
function Has($v) { return ($null -ne $v) -and -not ($v -is [string] -and $v.Trim() -eq '') }
function Num($v) { if (-not (Has $v)) { return '' } return ([double]$v).ToString('0.##', $Inv) }
function Quote([string]$s) { return '"' + $s + '"' }
function Get-Http([string]$Path, [int]$TimeoutMs = 4000) {
    $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port$Path")
    $req.Proxy = $null; $req.Timeout = $TimeoutMs; $req.ReadWriteTimeout = $TimeoutMs
    $resp = $req.GetResponse()
    try { $sr = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8); return $sr.ReadToEnd() } finally { $resp.Close() }
}
function Start-Inactive([string]$Exe, [string]$Dir, [int]$Show) {
    if (-not ('PolarisSoak.Launch' -as [type])) {
        Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
namespace PolarisSoak {
  public static class Launch {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SI { public int cb; public string r, desk, title; public int x, y, w, h, cx, cy, fill, flags; public short show, r2; public IntPtr r3, i, o, e; }
    [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr p, t; public int pid, tid; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcessW(string app, System.Text.StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, int flags, IntPtr env, string dir, ref SI si, out PI pi);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    public static int Start(string exe, string dir, short show) {
      SI si = new SI(); si.cb = Marshal.SizeOf(typeof(SI)); si.flags = 1; si.show = show;   // STARTF_USESHOWWINDOW
      PI pi;
      if (!CreateProcessW(exe, new System.Text.StringBuilder("\"" + exe + "\""), IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, dir, ref si, out pi))
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      CloseHandle(pi.t); CloseHandle(pi.p); return pi.pid;
    }
  }
}
'@
    }
    $id = [PolarisSoak.Launch]::Start($Exe, $Dir, [int16]$Show)
    return Get-Process -Id $id
}
function Get-Metrics { try { return (Get-Http '/metrics') | ConvertFrom-Json } catch { return $null } }
function Get-Prop($o, [string]$Name, $Default = $null) {
    if ($null -eq $o) { return $Default }
    $p = $o.PSObject.Properties[$Name]; if ($null -eq $p -or $null -eq $p.Value) { return $Default } return $p.Value
}

$exitCode = $null; $endedAt = $null
if (-not $Rejudge) {
# ---------------------------------------------------------------- preparation
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 22+ is needed (node was not found on PATH).' }
$nodeVersion = (& $node.Source --version).Trim()
if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) { throw "Node.js 22+ is needed (found $nodeVersion)." }

if (-not $OutDir) { $OutDir = Join-Path $env:TEMP ('polaris-cam-soak\' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path
$repoRoot = $null
try { $repoRoot = (& git -C $Here rev-parse --show-toplevel 2>$null); if ($repoRoot) { $repoRoot = (Resolve-Path $repoRoot).Path } } catch { $repoRoot = $null }
if ($repoRoot -and $OutDir.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "-OutDir $OutDir is inside the git repository ($repoRoot): put the results elsewhere (the default is %TEMP%\polaris-cam-soak)."
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use: give another -Port." }

$token = ''
if ($Mode -eq 'live') {
    if (-not $Link) { throw '-Mode live needs -Link https://efb-api.koz8738.com/live/cam/<token> (copied from the back office).' }
    if ($Link.Trim() -notmatch '^https?://[^/]+/live/cam/([A-Za-z0-9_-]+)(/ws)?/?$') { throw '-Link must look like https://efb-api.koz8738.com/live/cam/<token>' }
    $token = $Matches[1]
} else {
    $bytes = New-Object byte[] 18
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}
$localLink = "http://127.0.0.1:$Port/live/cam/$token"

if ($Mode -eq 'local') {
    $others = @(Get-Process polaris-cam, polaris-cam-selftest -ErrorAction SilentlyContinue)
    if ($others.Count) {
        Say ('Another polaris-cam.exe / polaris-cam-selftest.exe is running (PID ' + (($others | ForEach-Object { $_.Id }) -join ', ') + ').') 'Red'
        Say 'Close it first: this test does not touch programs it did not start. Stopped.' 'Red'
        exit 2
    }
    # The self-test stands in for the bridge on Local\PolarisCam.Link.1, the link of this build. A bridge (or anything)
    # already holding that block would answer polaris-cam.exe too: then the test cannot be told apart from it.
    if (-not ('PolarisSoak.Native' -as [type])) {
        Add-Type -Namespace PolarisSoak -Name Native -MemberDefinition '[DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern System.IntPtr OpenFileMappingW(uint access, bool inherit, string name); [DllImport("kernel32.dll")] public static extern bool CloseHandle(System.IntPtr h);'
    }
    $linkName = 'Local\PolarisCam.Link.1'
    $h = [PolarisSoak.Native]::OpenFileMappingW(4, $false, $linkName)
    if ($h -ne [IntPtr]::Zero) {
        [PolarisSoak.Native]::CloseHandle($h) | Out-Null
        Say "$linkName is already open (a bridge in MSFS of this same build, or another test): the self-test would share it. Stopped." 'Red'
        exit 2
    }
    if (Get-Process FlightSimulator2024, FlightSimulator -ErrorAction SilentlyContinue) {
        Say "MSFS is running (its bridge is not on $linkName, so it is left alone); the graphics card is shared, so fps / GPU numbers include its load." 'Yellow'
    }
    if (-not $Bin) {
        $cache = Join-Path $env:TEMP 'polaris-cam-soak\bin'
        Push-Location $Here
        try {
            $runId = (& gh run list --workflow 'Build Polaris Cam' --status success --limit 1 --json databaseId --jq '.[0].databaseId' 2>$null)
        } finally { Pop-Location }
        if (-not $runId) {
            if (Test-Path (Join-Path $cache 'polaris-cam.exe')) { Say "gh found no run: using the cached bin $cache" 'Yellow'; $Bin = $cache }
            else { throw 'No -Bin and no successful "Build Polaris Cam" run found by gh (gh auth login?).' }
        } else {
            $Bin = Join-Path $env:TEMP "polaris-cam-soak\bin-$runId"
            if (-not (Test-Path (Join-Path $Bin 'polaris-cam.exe'))) {
                Say "Downloading the bin artifact of Build Polaris Cam run $runId to $Bin"
                New-Item -ItemType Directory -Force $Bin | Out-Null
                Push-Location $Here
                try { & gh run download $runId -n bin -D $Bin; if ($LASTEXITCODE) { throw "gh run download $runId failed" } } finally { Pop-Location }
            } else { Say "Using the cached bin of run $runId ($Bin)" }
        }
    }
    $Bin = (Resolve-Path $Bin).Path
    foreach ($exe in 'polaris-cam.exe', 'polaris-cam-selftest.exe') { if (-not (Test-Path (Join-Path $Bin $exe))) { throw "$exe is not in $Bin" } }
}

Say "Polaris Cam soak: mode $Mode, preset $Preset, $DurationMin min, results in $OutDir" 'Cyan'

# ---------------------------------------------------------------- start
$proxy = $null; $serve = $null; $window = $null; $ourWindow = $false
$settings = Join-Path $OutDir 'settings'
$expected = Join-Path $OutDir 'expected.txt'
$savedSettingsEnv = $env:POLARIS_CAM_SETTINGS; $savedWarpEnv = $env:POLARIS_CAM_WARP
$csvPath = Join-Path $OutDir 'metrics.csv'
$rows = New-Object System.Collections.Generic.List[object]
$crashed = $false; $crashAt = ''; $interrupted = $true; $final = $null
$startedAt = Get-Date
$cpuPrev = $null; $cpuPrevAt = $null
try {
    $proxyArgs = @((Quote $ProxyJs))
    if ($Mode -eq 'local') { $proxyArgs += @('--local', '--token', $token) } else { $proxyArgs += @('--upstream', (Quote $Link.Trim())) }
    $proxyArgs += @('--port', $Port, '--preset', $Preset, '--duration-min', $DurationMin, '--out-dir', (Quote $OutDir))
    $proxy = Start-Process -FilePath $node.Source -ArgumentList $proxyArgs -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $OutDir 'proxy.log') -RedirectStandardError (Join-Path $OutDir 'proxy-errors.log')
    $null = $proxy.Handle
    $ok = $false
    for ($i = 0; $i -lt 50; $i++) { Start-Sleep -Milliseconds 200; if ($proxy.HasExited) { break }; if (Get-Metrics) { $ok = $true; break } }
    if (-not $ok) { Get-Content (Join-Path $OutDir 'proxy-errors.log') -ErrorAction SilentlyContinue | Write-Host; throw 'soak-proxy.mjs did not start.' }
    Say "soak-proxy.mjs ($Mode) on 127.0.0.1:$Port, pid $($proxy.Id)"

    if ($Mode -eq 'local') {
        New-Item -ItemType Directory -Force $settings | Out-Null
        # UTF-16 with a byte-order mark, which the profile functions read as Unicode
        $ini = "[general]`r`nenabled=1`r`nheight=1080`r`nfps=30`r`ncameras=15`r`nwindows=0`r`n[remote]`r`nenabled=1`r`nurl=$localLink`r`n"
        [System.IO.File]::WriteAllText((Join-Path $settings 'polaris-cam.ini'), $ini, [System.Text.Encoding]::Unicode)
        $env:POLARIS_CAM_SETTINGS = $settings
        Remove-Item Env:POLARIS_CAM_WARP -ErrorAction SilentlyContinue   # the real graphics card
        $serveSec = $DurationSec + 150
        $serve = Start-Process (Join-Path $Bin 'polaris-cam-selftest.exe') -ArgumentList '--serve', $serveSec, (Quote $expected), '--hardware' -PassThru -WindowStyle Hidden `
            -WorkingDirectory $Bin -RedirectStandardOutput (Join-Path $OutDir 'serve.log') -RedirectStandardError (Join-Path $OutDir 'serve-errors.log')
        $null = $serve.Handle
        Start-Sleep 2
        if ($serve.HasExited) { Get-Content (Join-Path $OutDir 'serve.log') -ErrorAction SilentlyContinue | Write-Host; throw "polaris-cam-selftest.exe --serve ended at once ($($serve.ExitCode))." }
        Say "polaris-cam-selftest.exe --serve $serveSec --hardware, pid $($serve.Id) (4 moving 1080p cameras on the graphics card)"
        # never taking the keyboard: a flight, or whatever has the focus, keeps it. Minimised (SW_SHOWMINNOACTIVE) unless
        # -ShowWindow (SW_SHOWNOACTIVATE): a click in it (a camera unticked) would change what is measured.
        $show = 7; if ($ShowWindow) { $show = 4 }
        $window = Start-Inactive (Join-Path $Bin 'polaris-cam.exe') $Bin $show
        $null = $window.Handle
        $ourWindow = $true
        Say "polaris-cam.exe pid $($window.Id), link $localLink"
        Say "Watch it live in Chrome/Edge: http://127.0.0.1:$Port/view" 'Cyan'
    } else {
        Write-Host ''
        Say 'In YOUR polaris-cam.exe, put this link in the 遠端 (remote) field instead of the real one:' 'Cyan'
        Say "    $localLink" 'Green'
        Say 'and keep the back office (/admin#bc) open, so that someone watches. Ctrl+C ends the test early.' 'Cyan'
        Write-Host ''
    }

    $header = 'time,elapsedSec,phase,throttleKbps,mode,Alive,WorkingSetMB,PrivateMB,Handles,Threads,CpuPct,GpuUtilPct,EncUtilPct,VramMB,watchers,pubConnected,totalFps,totalKbps,totalGaps,gapKeyViolations,reconnects,connections,disconnectsInjected,slowViewerPFramesWhilePaused,viewerGapKeyViolations,fastViewerFps'
    [System.IO.File]::WriteAllText($csvPath, $header + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
    $warmMax = 60; if ($Mode -eq 'live') { $warmMax = 300 }
    $deadline = (Get-Date).AddSeconds($warmMax + $DurationSec + 90)
    $lastPhase = ''
    while ((Get-Date) -lt $deadline) {
        $t = Get-Date
        # polaris-cam.exe: ours, or (live) the user's
        $p = $null
        if ($ourWindow) { if (-not $window.HasExited) { $p = $window } }
        else { $p = @(Get-Process polaris-cam -ErrorAction SilentlyContinue) | Select-Object -First 1 }
        $alive = 0; $ws = ''; $priv = ''; $handles = ''; $threads = ''; $cpu = ''
        if ($p) {
            try {
                $p.Refresh(); $alive = 1
                $ws = $p.WorkingSet64 / 1MB; $priv = $p.PrivateMemorySize64 / 1MB; $handles = $p.HandleCount; $threads = $p.Threads.Count
                $tp = $p.TotalProcessorTime.TotalMilliseconds
                if ($null -ne $cpuPrev) { $cpu = 100 * ($tp - $cpuPrev) / (($t - $cpuPrevAt).TotalMilliseconds * [Environment]::ProcessorCount) }
                $cpuPrev = $tp; $cpuPrevAt = $t
            } catch { $alive = 0 }
        } elseif ($ourWindow -and -not $crashed) {
            $crashed = $true; $crashAt = $t.ToString('HH:mm:ss')
            Say "polaris-cam.exe ENDED during the test (exit code $($window.ExitCode); 0 is a normal close, i.e. its window was closed)." 'Red'
        }
        $gpu = ''; $enc = ''; $vram = ''
        try {
            $line = (& nvidia-smi --query-gpu=utilization.gpu,utilization.encoder,memory.used --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
            if ($line) { $f = $line.Split(','); $gpu = $f[0].Trim(); $enc = $f[1].Trim(); $vram = $f[2].Trim() }
        } catch { }
        $m = Get-Metrics
        $phase = 'n/a'; if ($m) { $phase = $m.phase; if ($m.step) { $phase = $phase + '/' + $m.step } }
        $fastFps = ''; if ($m -and (Get-Prop $m.viewers 'fast')) { $fastFps = $m.viewers.fast.fps5s }
        $row = [ordered]@{
            time = $t.ToString('s'); elapsedSec = [int]($t - $startedAt).TotalSeconds; phase = $phase; throttleKbps = (Get-Prop $m 'throttleKbps'); mode = $Mode
            Alive = $alive; WorkingSetMB = $ws; PrivateMB = $priv; Handles = $handles; Threads = $threads; CpuPct = $cpu
            GpuUtilPct = $gpu; EncUtilPct = $enc; VramMB = $vram; watchers = (Get-Prop $m 'watchers'); pubConnected = [int][bool](Get-Prop $m 'pubConnected' $false)
            totalFps = (Get-Prop $m 'totalFps'); totalKbps = (Get-Prop $m 'totalKbps'); totalGaps = (Get-Prop $m 'totalGaps'); gapKeyViolations = (Get-Prop $m 'gapKeyViolations')
            reconnects = (Get-Prop $m 'reconnects'); connections = (Get-Prop $m 'connections'); disconnectsInjected = (Get-Prop $m 'disconnectsInjected')
            slowViewerPFramesWhilePaused = (Get-Prop $m 'slowViewerPFramesWhilePaused'); viewerGapKeyViolations = (Get-Prop $m 'viewerGapKeyViolations'); fastViewerFps = $fastFps
        }
        $rows.Add([pscustomobject]$row)
        $cells = foreach ($v in $row.Values) { if ($v -is [double] -or $v -is [single] -or $v -is [decimal]) { Num $v } else { [string]$v } }
        [System.IO.File]::AppendAllText($csvPath, ($cells -join ',') + "`r`n")
        if ($phase -ne $lastPhase) { Say "== phase $phase" 'Cyan'; $lastPhase = $phase }
        Say ("{0,-28} limit {1,5} kbps | up {2,6} fps {3,8} kbps | gaps {4} bad {5} | WS {6} MB H {7} | GPU {8}% NVENC {9}% VRAM {10} MB" -f `
            $phase, (Get-Prop $m 'throttleKbps' '-'), (Get-Prop $m 'totalFps' '-'), (Get-Prop $m 'totalKbps' '-'), (Get-Prop $m 'totalGaps' '-'), (Get-Prop $m 'gapKeyViolations' '-'), (Num $ws), $handles, $gpu, $enc, $vram)
        if ($m -and $m.done) { $interrupted = $false; break }
        if (-not $m -and $proxy.HasExited) { Say 'soak-proxy.mjs ended unexpectedly.' 'Red'; break }
        if ($crashed) { break }
        $sleep = $SampleSec * 1000 - [int]((Get-Date) - $t).TotalMilliseconds
        if ($sleep -gt 0) { Start-Sleep -Milliseconds $sleep }
    }
    if ($interrupted -and -not $crashed) { Say 'The run did not reach its end (time-out or proxy gone).' 'Yellow' }
} finally {
    # the phases are closed first, so that taking the program down is not counted inside one
    try { Get-Http '/control?stop=1' | Out-Null } catch { }
    try { $txt = Get-Http '/metrics'; [System.IO.File]::WriteAllText((Join-Path $OutDir 'metrics-final.json'), $txt); $final = $txt | ConvertFrom-Json } catch { }
    try { [System.IO.File]::WriteAllText((Join-Path $OutDir 'proxy-final-full.json'), (Get-Http '/metrics?full=1' 15000)) } catch { }
    if ($ourWindow -and $window -and -not $window.HasExited) {
        $window.CloseMainWindow() | Out-Null
        if (-not $window.WaitForExit(15000)) { Say 'polaris-cam.exe did not close when asked: ended.' 'Yellow'; $window.Kill() }
        else { Say "polaris-cam.exe closed (exit code $($window.ExitCode))" }
    }
    if ($serve) {
        Set-Content "$expected.stop" 'stop'
        if (-not $serve.WaitForExit(20000)) { $serve.Kill() }
        Say "polaris-cam-selftest.exe ended ($($serve.ExitCode))"
    }
    if ($proxy -and -not $proxy.HasExited) {
        try { Get-Http '/control?quit=1' | Out-Null } catch { }
        if (-not $proxy.WaitForExit(5000)) { Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue }
    }
    if ($Mode -eq 'local') {
        Copy-Item (Join-Path $settings 'polaris-cam.log') (Join-Path $OutDir 'polaris-cam.log') -ErrorAction SilentlyContinue
    } else {
        $userLog = Join-Path $env:APPDATA 'Polaris Cam\polaris-cam.log'
        if ($env:POLARIS_CAM_SETTINGS) { $userLog = Join-Path $env:POLARIS_CAM_SETTINGS 'polaris-cam.log' }
        Copy-Item $userLog (Join-Path $OutDir 'polaris-cam.log') -ErrorAction SilentlyContinue
    }
    $env:POLARIS_CAM_SETTINGS = $savedSettingsEnv
    if ($null -ne $savedWarpEnv) { $env:POLARIS_CAM_WARP = $savedWarpEnv }
    if ($window) { try { if ($window.HasExited) { $exitCode = $window.ExitCode } } catch { } }
    $endedAt = Get-Date
    $info = [ordered]@{ mode = $Mode; preset = $Preset; durationMin = $DurationMin; port = $Port; bin = $Bin; startedAt = $startedAt.ToString('s'); endedAt = $endedAt.ToString('s')
        crashed = $crashed; crashAt = $crashAt; exitCode = $exitCode; interrupted = $interrupted; sampleSec = $SampleSec }
    try { [System.IO.File]::WriteAllText((Join-Path $OutDir 'run-info.json'), ($info | ConvertTo-Json)) } catch { }
}
} else {
    # -Rejudge: the results of an earlier run
    $OutDir = (Resolve-Path $Rejudge).Path
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($r in @(Import-Csv (Join-Path $OutDir 'metrics.csv'))) { $r.elapsedSec = [int]$r.elapsedSec; $rows.Add($r) }
    $final = $null; try { $final = [System.IO.File]::ReadAllText((Join-Path $OutDir 'metrics-final.json')) | ConvertFrom-Json } catch { }
    $infoPath = Join-Path $OutDir 'run-info.json'
    if (Test-Path $infoPath) {
        $info = [System.IO.File]::ReadAllText($infoPath) | ConvertFrom-Json
        $Mode = $info.mode; $Preset = $info.preset; $DurationMin = $info.durationMin; $Port = $info.port; $Bin = $info.bin; $SampleSec = $info.sampleSec
        $startedAt = [datetime]$info.startedAt; $endedAt = [datetime]$info.endedAt; $crashed = $info.crashed; $crashAt = $info.crashAt; $exitCode = $info.exitCode; $interrupted = $info.interrupted
    } else {   # a run from before run-info.json: what the files say
        if ($final) { $Mode = $(if ($final.mode -eq 'upstream') { 'live' } else { 'local' }); $Preset = $final.preset; $DurationMin = [int]($final.durationSec / 60); $Port = $final.port }
        $startedAt = [datetime]$rows[0].time; $endedAt = [datetime]$rows[$rows.Count - 1].time
        $crashed = $false; $crashAt = ''; $interrupted = -not ($final -and $final.done)
        $firstAlive = $false
        foreach ($r in $rows) { if ($r.Alive -eq '1') { $firstAlive = $true } elseif ($firstAlive -and -not $crashed) { $crashed = $true; $crashAt = $r.time } }
        if ($Mode -eq 'local') { $Bin = '(see serve.log)' }
    }
    Say "Re-judging $OutDir ($Mode / $Preset)" 'Cyan'
}

# ---------------------------------------------------------------- summary.md
function Avg($list) { $a = @($list | Where-Object { Has $_ } | ForEach-Object { [double]$_ }); if (-not $a.Count) { return $null } return ($a | Measure-Object -Average).Average }
function MaxOf($list) { $a = @($list | Where-Object { Has $_ } | ForEach-Object { [double]$_ }); if (-not $a.Count) { return $null } return ($a | Measure-Object -Maximum).Maximum }
function Median($list) { $a = @($list | Where-Object { Has $_ } | ForEach-Object { [double]$_ } | Sort-Object); if (-not $a.Count) { return $null } return $a[[int][math]::Floor($a.Count / 2)] }
function PhaseRows([string]$name, [int]$skipSec = 0) {
    $sel = @($rows | Where-Object { $_.phase -eq $name -or $_.phase.StartsWith($name + '/') })
    if ($skipSec -gt 0 -and $sel.Count) { $first = $sel[0].elapsedSec; $sel = @($sel | Where-Object { $_.elapsedSec -ge $first + $skipSec }) }
    return $sel
}
$checks = New-Object System.Collections.Generic.List[object]
function Check([string]$name, $pass, [string]$detail) {
    $state = 'SKIP'; if ($pass -eq $true) { $state = 'PASS' } elseif ($pass -eq $false) { $state = 'FAIL' }
    $checks.Add([pscustomobject]@{ name = $name; state = $state; detail = $detail })
}
$phases = @(); if ($final) { $phases = @($final.phases) }
function Ph([string]$name, [string]$step = '') { return @($phases | Where-Object { $_.name -eq $name -and $_.step -eq $step }) }
$onCams = 4; if ($final -and $final.hello -and $final.hello.cams) { $onCams = @($final.hello.cams | Where-Object { $_.on }).Count }

$md = New-Object System.Text.StringBuilder
function L([string]$s = '') { [void]$md.AppendLine($s) }
$verdictPlaceholder = '@@VERDICT@@'
L "# Polaris Cam Stage 3 壓測報告（$Mode / $Preset）"
L ''
L $verdictPlaceholder
L ''
L "- 開始：$($startedAt.ToString('yyyy-MM-dd HH:mm:ss'))　結束：$(if ($endedAt) { $endedAt.ToString('yyyy-MM-dd HH:mm:ss') } else { '-' })　設定時長：$DurationMin 分鐘"
L "- 模式：``$Mode``　預設：``$Preset``　連接埠：$Port　結果目錄：``$OutDir``"
if ($Mode -eq 'local') { L "- 程式：``$Bin``（polaris-cam.exe + polaris-cam-selftest.exe --serve --hardware，CamRelay 取自 repo 的 cam.js）" }
$gpuName = ''; try { $gpuName = (& nvidia-smi --query-gpu=name --format=csv,noheader 2>$null | Select-Object -First 1) } catch { }
if ($gpuName) { L "- 顯示卡：$gpuName" }
if ($final) {
    $hv = ''; $hc = ''; if ($final.hello) { $hv = $final.hello.v; $hc = @($final.hello.cams | ForEach-Object { "$($_.i):$($_.codec)$(if ($_.on) { '' } else { '(off)' }) $($_.w)x$($_.h)" }) -join '、' }
    L "- polaris-cam hello：v``$hv``，$hc"
    L "- 連線次數 $($final.connections)、注入斷線 $($final.disconnectsInjected)、非注入斷線 $($final.unexpectedDisconnects)（含測試結束關閉）、封鎖期拒連 $($final.refusedConnections)"
}
if ($interrupted) { L '- **注意：這次執行沒有跑完全部階段（中斷、逾時或 proxy 結束）。**' }
L ''
L '## 各階段摘要'
L ''
L '| 階段 | 秒 | 限速 kbps | 上傳 fps | 尾段 fps | 上傳 kbps | 關鍵格 | 缺格(次/格) | 缺格無關鍵格 | 快觀眾 fps | GPU% | NVENC% |'
L '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
foreach ($p in $phases) {
    $label = $p.name; if ($p.step) { $label = "$($p.name)/$($p.step)" }; if ($p.cycle -gt 0) { $label = "$label (#$($p.cycle + 1))" }
    $pr = @($rows | Where-Object { $_.elapsedSec -ge 0 -and $_.phase -eq ($(if ($p.step) { "$($p.name)/$($p.step)" } else { $p.name })) })
    $lim = 'none'; if ($p.kbpsLimit) { $lim = $p.kbpsLimit }
    L ("| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7}/{8} | {9} | {10} | {11} | {12} |" -f $label, (Num $p.durationS), $lim, (Num $p.totalFps), (Num $p.tailFps), (Num $p.totalKbps), $p.keyframes, $p.seqGaps, $p.gapFrames, $p.gapKeyViolations, (Num $p.fastViewerFps), (Num (Avg ($pr | ForEach-Object { $_.GpuUtilPct }))), (Num (Avg ($pr | ForEach-Object { $_.EncUtilPct }))))
}
L ''
L '每顆鏡頭（各階段 fps）：'
L ''
L '| 階段 | cam0 | cam1 | cam2 | cam3 | codec |'
L '|---|---:|---:|---:|---:|---|'
foreach ($p in $phases) {
    $label = $p.name; if ($p.step) { $label = "$($p.name)/$($p.step)" }
    $c = @($p.cams)
    L ("| {0} | {1} | {2} | {3} | {4} | {5} |" -f $label, (Num $c[0].fps), (Num $c[1].fps), (Num $c[2].fps), (Num $c[3].fps), (($p.codecs) -join ' '))
}

# memory
$alive = @($rows | Where-Object { $_.Alive -eq 1 -and (Has $_.WorkingSetMB) })
$baseRows = @(PhaseRows 'baseline' 10 | Where-Object { $_.Alive -eq 1 -and (Has $_.WorkingSetMB) })
if (-not $baseRows.Count) { $baseRows = @($alive | Select-Object -First 3) }
$wsBase = Median ($baseRows | ForEach-Object { $_.WorkingSetMB }); $pvBase = Median ($baseRows | ForEach-Object { $_.PrivateMB }); $hBase = Median ($baseRows | ForEach-Object { $_.Handles })
$wsPeak = MaxOf ($alive | ForEach-Object { $_.WorkingSetMB }); $pvPeak = MaxOf ($alive | ForEach-Object { $_.PrivateMB }); $hPeak = MaxOf ($alive | ForEach-Object { $_.Handles })
$lastAlive = $alive | Select-Object -Last 1
$wsEnd = $null; $pvEnd = $null; $hEnd = $null; if ($lastAlive) { $wsEnd = [double]$lastAlive.WorkingSetMB; $pvEnd = [double]$lastAlive.PrivateMB; $hEnd = [double]$lastAlive.Handles }
L ''
L '## 記憶體與 Handle 趨勢（polaris-cam.exe）'
L ''
L '| | 基線（baseline 中位數） | 峰值 | 結束 |'
L '|---|---:|---:|---:|'
L ("| WorkingSet MB | {0} | {1} | {2} |" -f (Num $wsBase), (Num $wsPeak), (Num $wsEnd))
L ("| Private MB | {0} | {1} | {2} |" -f (Num $pvBase), (Num $pvPeak), (Num $pvEnd))
L ("| Handles | {0} | {1} | {2} |" -f (Num $hBase), (Num $hPeak), (Num $hEnd))
$vramRows = @($rows | Where-Object { (Has $_.VramMB) })
if ($vramRows.Count) { L ("| VRAM MB（整張卡） | {0} | {1} | {2} |" -f (Num (Median (@($vramRows | Select-Object -First 6) | ForEach-Object { $_.VramMB }))), (Num (MaxOf ($vramRows | ForEach-Object { $_.VramMB }))), (Num ($vramRows[-1].VramMB))) }

# ---------------------------------------------------------------- PASS / FAIL
$f = $final
$base = Ph 'baseline' | Select-Object -First 1
$rec = Ph 'recovery' | Select-Object -Last 1
$sev = @(Ph 'severe_congestion')
$disc = @(Ph 'disconnect_blackout')
$watched = $true; if ($Mode -eq 'live') { $watched = $f -and $f.totals.frames -gt 0 }

# 1 alive
$aliveAll = (@($rows | Where-Object { $_.Alive -ne 1 }).Count -eq 0) -and $rows.Count -gt 0
if ($Mode -eq 'local') { Check '1. polaris-cam.exe 全程存活無崩潰' ((-not $crashed) -and $aliveAll) ("取樣 $($rows.Count) 次，存活 $(@($rows | Where-Object { $_.Alive -eq 1 }).Count) 次" + $(if ($crashed) { "；$crashAt 結束（exit $exitCode$(if ($exitCode -eq 0) { '：正常結束碼，表示視窗被關閉（WM_CLOSE），不是當機' } else { '：非 0，疑似當機' })）" } else { '' })) }
else { Check '1. polaris-cam.exe 全程存活無崩潰' $(if ($rows.Count) { $aliveAll } else { $null }) "取樣 $($rows.Count) 次，存活 $(@($rows | Where-Object { $_.Alive -eq 1 }).Count) 次（使用者自己的程式）" }

# 2 h264 in baseline and recovery
if ($f -and $base -and $rec -and $watched) {
    $ok2 = $true; $d2 = @()
    foreach ($p in @($base, $rec)) {
        $h = @($p.cams | Where-Object { $_.codec -eq 'h264' -and $_.frames -gt 0 }).Count
        $d2 += "$($p.name)：$h/$onCams 路 H.264"
        if ($h -lt $onCams) { $ok2 = $false }
    }
    if ($f.unexpectedFallbacks -gt 0) { $ok2 = $false }
    $d2 += "非預期退回 JPEG $($f.unexpectedFallbacks) 次"
    Check '2. 4 路在 baseline 與 recovery 穩定以 H.264 上傳' $ok2 ($d2 -join '；')
} else { Check '2. 4 路在 baseline 與 recovery 穩定以 H.264 上傳' $null '沒有資料（未跑到或沒有人觀看）' }

# 3 severe congestion
if ($f -and $sev.Count -and $watched) {
    $s = $sev[0]
    $limited = ($s.totalKbps -le $s.kbpsLimit * 1.3 + 40)
    $dropped = ($s.gapFrames -gt 0)
    $invariantsOk = ($f.gapKeyViolations -eq 0 -and $f.startNonKey -eq 0 -and $f.viewerGapKeyViolations -eq 0)
    Check '3. severe_congestion 確實限速／丟格，且 gapKeyViolations === 0' ($limited -and $dropped -and $invariantsOk) ("上傳 $(Num $s.totalKbps) kbps（限 $($s.kbpsLimit)）、缺格 $($s.seqGaps) 次共 $($s.gapFrames) 格；全程 gapKeyViolations $($f.gapKeyViolations)、連線首格非關鍵格 $($f.startNonKey)、觀眾端缺格無關鍵格 $($f.viewerGapKeyViolations)")
} else { Check '3. severe_congestion 確實限速／丟格，且 gapKeyViolations === 0' $null '沒有資料' }

# 4 reconnect
if ($f -and $disc.Count) {
    $d = $disc[0]
    $lat = @($f.reconnectLatenciesMs); $hl = @($f.reconnectHelloMs)
    $ok4 = ($f.disconnectsInjected -gt 0) -and (-not $f.reconnectPending)
    if ($watched) { $ok4 = $ok4 -and ($lat.Count -ge $f.disconnectsInjected) -and ($d.tailFps -gt 0) } else { $ok4 = $ok4 -and ($hl.Count -ge $f.disconnectsInjected) }
    Check '4. disconnect_blackout 注入後自動重連成功且恢復串流' $ok4 ("注入 $($f.disconnectsInjected) 次；重連後 hello $((($hl | ForEach-Object { "$_ ms" }) -join ', '))；4 路關鍵格恢復 $((($lat | ForEach-Object { "$_ ms" }) -join ', '))（皆自注入起算，含 10 s 拒連）；該階段尾段 $(Num $d.tailFps) fps")
} else { Check '4. disconnect_blackout 注入後自動重連成功且恢復串流' $null '沒有資料' }

# 5 recovery fps
if ($base -and $rec -and $watched) {
    $ratio = 0; if ($base.tailFps -gt 0) { $ratio = $rec.tailFps / $base.tailFps }
    Check '5. recovery 階段 fps 回到基準（不累積延遲）' ($ratio -ge 0.9) ("baseline 尾段 $(Num $base.tailFps) fps → recovery 尾段 $(Num $rec.tailFps) fps（$(Num ($ratio * 100))%，門檻 90%）；recovery 缺格 $($rec.seqGaps) 次")
} else { Check '5. recovery 階段 fps 回到基準（不累積延遲）' $null '沒有資料' }

# 6 idle and resume
if ($Mode -eq 'local') {
    $idle = Ph 'idle_and_resume' 'idle' | Select-Object -Last 1
    $res = Ph 'idle_and_resume' 'resume' | Select-Object -Last 1
    if ($idle -and $res -and $base) {
        $idleEnc = MaxOf (PhaseRows 'idle_and_resume/idle' 6 | ForEach-Object { $_.EncUtilPct })
        $baseEnc = Avg (PhaseRows 'baseline' 5 | ForEach-Object { $_.EncUtilPct })
        $encOk = $true; $encLimit = 2; if ($null -ne $baseEnc) { $encLimit = [math]::Max(2, 0.2 * $baseEnc) }
        if ($null -ne $idleEnc) { $encOk = $idleEnc -le $encLimit }
        $resumeKey = Get-Prop $res 'resumeAllKeyMs'
        $resOk = ($null -ne $resumeKey) -and ($resumeKey -le 5000) -and ($res.tailFps -ge 0.8 * $base.tailFps)
        Check '6. idle_and_resume：watch=0 停送且 NVENC≈0%，watch=1 立即續播' (($idle.idleFramesAfterGrace -eq 0) -and $encOk -and $resOk) `
            ("idle（3 s 後）收到 $($idle.idleFramesAfterGrace) 格；idle NVENC 最高 $(Num $idleEnc)%（門檻 $(Num $encLimit)%，baseline 平均 $(Num $baseEnc)%）；恢復後首格 $(Get-Prop $res 'resumeFirstFrameMs') ms、4 路關鍵格 $resumeKey ms；resume 尾段 $(Num $res.tailFps) fps")
    } else { Check '6. idle_and_resume：watch=0 停送且 NVENC≈0%，watch=1 立即續播' $null '沒有資料' }
} else { Check '6. idle_and_resume（僅 local 模式）' $null 'live 模式觀看人數由正式後台決定，改跑 normal_cruise' }

# 7 memory
if ($null -ne $wsBase -and $null -ne $wsEnd) {
    $wsGrow = $wsEnd - $wsBase; $pvGrow = $pvEnd - $pvBase; $hGrow = $hEnd - $hBase
    $ok7 = ($wsGrow -le [math]::Max(150, 0.5 * $wsBase)) -and ($pvGrow -le [math]::Max(150, 0.5 * $pvBase)) -and ($hGrow -le [math]::Max(300, 0.5 * $hBase))
    $slope = ''
    if ($alive.Count -ge 60) {   # a long run: the trend of its second half, MB per hour
        $half = @($alive | Select-Object -Last ([int]($alive.Count / 2)))
        $n = $half.Count; $sx = 0.0; $sy = 0.0; $sxx = 0.0; $sxy = 0.0
        foreach ($r in $half) { $x = [double]$r.elapsedSec / 3600; $y = [double]$r.PrivateMB; $sx += $x; $sy += $y; $sxx += $x * $x; $sxy += $x * $y }
        $den = $n * $sxx - $sx * $sx
        if ($den -ne 0) { $b = ($n * $sxy - $sx * $sy) / $den; $slope = "；後半段 Private 趨勢 $(Num $b) MB/小時（門檻 30）"; if ($b -gt 30) { $ok7 = $false } }
    }
    Check '7. 記憶體與 Handle 無持續失控暴漲' $ok7 ("WorkingSet $(Num $wsBase)→$(Num $wsEnd) MB（峰值 $(Num $wsPeak)）、Private $(Num $pvBase)→$(Num $pvEnd) MB、Handles $(Num $hBase)→$(Num $hEnd)$slope")
} else { Check '7. 記憶體與 Handle 無持續失控暴漲' $null '沒有 polaris-cam.exe 的取樣' }

# 8 CamRelay slow viewer (local)
if ($Mode -eq 'local' -and $f -and (Get-Prop $f.viewers 'slow')) {
    $sv = $f.viewers.slow
    $ok8 = ($f.slowViewerPFramesWhilePaused -eq 0) -and ($f.viewerGapKeyViolations -eq 0) -and ($sv.cutPauses -gt 0) -and ($sv.resumeSlow -eq 0) -and ($sv.resumes -gt 0)
    if ($sv.probeKeys -gt 0 -and $sv.probeMinIntervalMs -gt 0 -and $sv.probeMinIntervalMs -lt 2500) { $ok8 = $false }
    Check '8. CamRelay 慢觀眾保護（暫停 P-frame、每 3 s 關鍵格探測、恢復續播）' $ok8 ("暫停期間被截斷 $($sv.cutPauses) 次、截斷後收到 P-frame $($f.slowViewerPFramesWhilePaused) 格（須 0）、探測關鍵格 $($sv.probeKeys) 格（最短間隔 $($sv.probeMinIntervalMs) ms）、恢復 $($sv.resumes) 路次（最慢 $($sv.resumeMaxMs) ms，>6 s 的 $($sv.resumeSlow) 次）；觀眾端缺格無關鍵格 $($f.viewerGapKeyViolations)")
}

# 0 nobody changed the settings meanwhile (polaris-cam.exe logs "settings:" only when they change)
$logFile = Join-Path $OutDir 'polaris-cam.log'
$manual = @()
if (Test-Path $logFile) {
    $all = @(Get-Content $logFile -Encoding Unicode -ErrorAction SilentlyContinue)
    $mark = -1; for ($i = 0; $i -lt $all.Count; $i++) { if ($all[$i] -like '==== *') { $mark = $i } }   # this run's part of the log
    if ($mark -ge 0) { $manual = @($all[$mark..($all.Count - 1)] | Where-Object { $_ -match '^\S+\s+settings:' }) }
}
if ($Mode -eq 'local') {
    $checks.Insert(0, [pscustomobject]@{ name = '0. 測試期間無人手動更改 polaris-cam 設定'; state = $(if ($manual.Count) { 'FAIL' } else { 'PASS' })
        detail = $(if ($manual.Count) { "polaris-cam.log 有 $($manual.Count) 筆設定變更（數據不可信）：" + (($manual | Select-Object -First 4) -join '；') } else { '設定全程為 1080p 30 fps、cameras 0xf、遠端開' }) })
} elseif ($manual.Count) {
    $checks.Insert(0, [pscustomobject]@{ name = '0. 測試期間的設定變更（live：僅供參考）'; state = 'SKIP'; detail = (($manual | Select-Object -First 4) -join '；') })
}

L ''
L '## Pass / Fail 門檻檢查'
L ''
L '| 檢查 | 結果 | 說明 |'
L '|---|---|---|'
foreach ($c in $checks) { $mark = $c.state; if ($c.state -eq 'PASS') { $mark = '✅ PASS' } elseif ($c.state -eq 'FAIL') { $mark = '❌ FAIL' } else { $mark = '➖ SKIP' }; L "| $($c.name) | $mark | $($c.detail) |" }

# notes from the log (UTF-16, as polaris-cam.exe writes it)
$logPath = Join-Path $OutDir 'polaris-cam.log'
if (Test-Path $logPath) {
    $logLines = @(Get-Content $logPath -Encoding Unicode -ErrorAction SilentlyContinue)
    $remoteLines = @($logLines | Where-Object { $_ -match 'remote:|h264|H.264|fallback|encoder' })
    L ''
    L "## polaris-cam.log（遠端相關，共 $($remoteLines.Count) 行，前 40 行）"
    L ''
    L '```'
    foreach ($x in ($remoteLines | Select-Object -First 40)) { L $x }
    L '```'
}
if ($f -and $f.events) {
    L ''
    L '## proxy 最後事件'
    L ''
    L '```'
    foreach ($x in @($f.events | Select-Object -Last 25)) { L $x }
    L '```'
}
L ''
L "檔案：``metrics.csv``（每 $SampleSec 秒）、``metrics-final.json``、``proxy-final-full.json``（含每秒序列）、``proxy-series.ndjson``、``proxy-events.log``、``polaris-cam.log``$(if ($Mode -eq 'local') { '、``serve.log``' })"

$fails = @($checks | Where-Object { $_.state -eq 'FAIL' }).Count
$passes = @($checks | Where-Object { $_.state -eq 'PASS' }).Count
$verdict = "**總結：PASS**（$passes 項通過，$(@($checks | Where-Object { $_.state -eq 'SKIP' }).Count) 項略過）"
if ($fails -gt 0 -or $interrupted -or $crashed) { $verdict = "**總結：FAIL**（$fails 項未通過$(if ($interrupted) { '，執行未完成' } else { '' })）" }
$text = $md.ToString().Replace($verdictPlaceholder, $verdict)
$summaryPath = Join-Path $OutDir 'summary.md'
[System.IO.File]::WriteAllText($summaryPath, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ''
foreach ($c in $checks) { $col = 'Gray'; if ($c.state -eq 'PASS') { $col = 'Green' } elseif ($c.state -eq 'FAIL') { $col = 'Red' }; Write-Host ("  {0,-5} {1}" -f $c.state, $c.name) -ForegroundColor $col }
Say ($verdict.Replace('**', '')) $(if ($fails -gt 0 -or $interrupted -or $crashed) { 'Red' } else { 'Green' })
Say "summary: $summaryPath" 'Cyan'
if ($fails -gt 0 -or $interrupted -or $crashed) { exit 1 }
exit 0

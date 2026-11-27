# Polaris Cam: the build's window test, on Windows without a simulator.
#
#   pwsh test/window-test.ps1 -Bin <folder with the three .exe> -Out <folder for what it finds>
#
# polaris-cam-selftest.exe stands in for the bridge inside MSFS. The real polaris-cam.exe is started
# against it twice: at 720p with its previews only, then at 1080p with its output windows. Each time
# the screen is saved as a picture, and a second polaris-cam.exe (--check) reads every camera's
# newest picture back through Direct3D 11 from another process, as OBS's source will see it; what
# it reads must be what the bridge sent.
param([Parameter(Mandatory)][string]$Bin, [string]$Out = 'window-test')
$ErrorActionPreference = 'Stop'
$Bin = (Resolve-Path $Bin).Path
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
# the software adapter may have another number in each process
$env:POLARIS_CAM_WARP = '1'
$expected = Join-Path $Out 'expected.txt'
$settings = Join-Path $env:APPDATA 'Polaris Cam'

function Save-Screen([string]$Path) {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Left, $screen.Top, 0, 0, $bitmap.Size)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $bitmap.Dispose()
    Write-Output "saved $Path ($($screen.Width)x$($screen.Height))"
}
function Write-Settings([int]$Height, [int]$Windows) {
    New-Item -ItemType Directory -Force $settings | Out-Null
    # UTF-16 with a byte-order mark, which the profile functions read as Unicode
    [System.IO.File]::WriteAllText((Join-Path $settings 'polaris-cam.ini'),
        "[general]`r`nenabled=1`r`nheight=$Height`r`nfps=30`r`ncameras=15`r`nwindows=$Windows`r`n", [System.Text.Encoding]::Unicode)
}
function Start-Window { Start-Process (Join-Path $Bin 'polaris-cam.exe') -PassThru }
function Stop-Window($Window, [string]$Name) {
    $Window.CloseMainWindow() | Out-Null
    if (-not $Window.WaitForExit(15000)) { $Window.Kill(); throw 'the window did not close when asked' }
    Copy-Item (Join-Path $settings 'polaris-cam.log') (Join-Path $Out "$Name-window.log") -ErrorAction SilentlyContinue
    Get-Content (Join-Path $Out "$Name-window.log") -ErrorAction SilentlyContinue
}
function Test-Pictures([string]$Name, [string]$Size) {
    # the stand-in writes expected.txt once every camera sends that size
    for ($i = 0; $i -lt 120; $i++) {
        if ((Test-Path $expected) -and ((Get-Content $expected -Raw) -match $Size)) { break }
        Start-Sleep -Milliseconds 500
    }
    $read = Join-Path $Out "$Name-read.txt"
    $check = Start-Process (Join-Path $Bin 'polaris-cam.exe') -ArgumentList '--check', "`"$read`"" -PassThru -Wait
    $want = if (Test-Path $expected) { (Get-Content $expected) -join "`n" } else { '(nothing)' }
    $got = if (Test-Path $read) { (Get-Content $read) -join "`n" } else { '(nothing)' }
    Write-Output "sent:`n$want`nread (exit code $($check.ExitCode)):`n$got"
    if ($check.ExitCode -ne 0) { throw "${Name}: polaris-cam.exe --check failed with $($check.ExitCode)" }
    if ($want -ne $got -or $want -notmatch $Size) { throw "${Name}: the window read other pixels than the bridge sent" }
    Write-Output "${Name}: every camera's picture read back as sent"
}

try { Set-DisplayResolution -Width 1920 -Height 1080 -Force | Out-Null } catch { Write-Output "screen size unchanged: $_" }
$failed = $null
$serve = Start-Process (Join-Path $Bin 'polaris-cam-selftest.exe') -ArgumentList '--serve', '240', "`"$expected`"" -PassThru -NoNewWindow `
    -RedirectStandardOutput (Join-Path $Out 'serve.log') -RedirectStandardError (Join-Path $Out 'serve-errors.log')
$null = $serve.Handle  # so that its exit code can be read once it has ended
try {
    Start-Sleep 2
    Write-Output '== 720p, four cameras, previews only'
    Write-Settings 720 0
    $window = Start-Window
    Start-Sleep 12
    Save-Screen (Join-Path $Out 'window-720.png')
    Test-Pictures '720' '1280x720'
    Stop-Window $window '720'

    Write-Output '== 1080p, four cameras, with the output windows'
    Write-Settings 1080 1
    $window = Start-Window
    Start-Sleep 15
    Test-Pictures '1080' '1920x1080'
    Save-Screen (Join-Path $Out 'window-1080.png')
    Stop-Window $window '1080'
} catch {
    $failed = $_
    Get-Process polaris-cam -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
} finally {
    Set-Content "$expected.stop" 'stop'
    if (-not $serve.WaitForExit(20000)) { $serve.Kill() }
    Write-Output '== the stand-in bridge'
    Get-Content (Join-Path $Out 'serve.log') -ErrorAction SilentlyContinue
    Get-Content (Join-Path $Out 'serve-errors.log') -ErrorAction SilentlyContinue
}
if ($failed) { throw $failed }
if ($serve.ExitCode -ne 0) { throw "the stand-in bridge ended with $($serve.ExitCode)" }
Write-Output 'window test passed'

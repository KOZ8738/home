# Polaris Cam Stage 3: optional system-level upload limit for polaris-cam.exe, with Windows' own QoS policies
# (New-NetQosPolicy). Windows PowerShell 5.1 or PowerShell 7, run as administrator.
#
#   throttle-qos.ps1 -Action apply  -Kbps 1500     limit polaris-cam.exe's outgoing traffic to 1500 kbit/s
#   throttle-qos.ps1 -Action status                show the policy (and whether it is there)
#   throttle-qos.ps1 -Action remove                take it away
#
# Notes:
# - Windows does not run loopback traffic (127.0.0.1) through the QoS packet scheduler: this limits polaris-cam.exe
#   only towards the real network (the back office over the Internet), not towards soak-proxy.mjs on this computer.
#   For a limit that needs no administrator and works on 127.0.0.1, use soak-proxy.mjs (run-soak.ps1) instead.
# - The policy is kept in the ActiveStore by default: it goes at the next restart even if -Action remove is forgotten.
#   -Persistent keeps it in the local store (it survives restarts until removed).
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('apply', 'remove', 'status')][string]$Action,
    [int]$Kbps = 0,
    [string]$App = 'polaris-cam.exe',
    [string]$Name = 'PolarisCamSoakThrottle',
    [switch]$Persistent
)
$ErrorActionPreference = 'Stop'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Get-Command New-NetQosPolicy -ErrorAction SilentlyContinue)) {
    Write-Host 'New-NetQosPolicy is not available on this Windows (the NetQos module is missing).' -ForegroundColor Red
    exit 2
}
$store = 'ActiveStore'; if ($Persistent) { $store = 'localhost' }
function Get-Policies {
    $found = @()
    foreach ($s in 'ActiveStore', 'localhost') {
        $found += @(Get-NetQosPolicy -PolicyStore $s -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $Name } |
            ForEach-Object { [pscustomobject]@{ Store = $s; Name = $_.Name; App = $_.AppPathNameMatchCondition; Kbps = [math]::Round($_.ThrottleRateAction / 1000); Network = $_.NetworkProfile } })
    }
    return $found
}

if ($Action -eq 'status') {
    $p = @(Get-Policies)
    if (-not $p.Count) { Write-Host "No QoS policy '$Name': $App is not limited by Windows QoS." -ForegroundColor Yellow }
    else { $p | Format-Table -AutoSize | Out-String | Write-Host }
    if (-not (Test-Admin)) { Write-Host '(not administrator: ActiveStore policies of other sessions may not be listed)' -ForegroundColor DarkGray }
    exit 0
}
if (-not (Test-Admin)) {
    Write-Host "-Action $Action needs an administrator PowerShell (right-click > Run as administrator). Nothing was changed." -ForegroundColor Red
    exit 3
}
if ($Action -eq 'remove') {
    $p = @(Get-Policies)
    foreach ($x in $p) { Remove-NetQosPolicy -Name $Name -PolicyStore $x.Store -Confirm:$false; Write-Host "removed '$Name' from $($x.Store)" -ForegroundColor Green }
    if (-not $p.Count) { Write-Host "No QoS policy '$Name' to remove." -ForegroundColor Yellow }
    exit 0
}
# apply
if ($Kbps -lt 8) { Write-Host '-Action apply needs -Kbps <N> (8 or more; kilobits per second, as the soak phases use).' -ForegroundColor Red; exit 2 }
foreach ($x in @(Get-Policies)) { Remove-NetQosPolicy -Name $Name -PolicyStore $x.Store -Confirm:$false }
New-NetQosPolicy -Name $Name -PolicyStore $store -AppPathNameMatchCondition $App -ThrottleRateActionBitsPerSecond ([uint64]$Kbps * 1000) `
    -NetworkProfile All -IPProtocolMatchCondition TCP | Out-Null
Write-Host "Windows QoS now limits $App to $Kbps kbit/s outgoing ($store). Undo: throttle-qos.ps1 -Action remove" -ForegroundColor Green
Get-Policies | Format-Table -AutoSize | Out-String | Write-Host

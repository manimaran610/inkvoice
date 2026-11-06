param(
  [string]$InstallRoot = "$env:ProgramData\Inkvoice"
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this cleanup script from an elevated PowerShell window (Run as administrator)."
  }
}

function Repair-CleanupPathPermissions([string]$Path) {
  if (-not (Test-Path $Path)) {
    return
  }
  & takeown.exe /F $Path /R /D Y | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not take ownership of '$Path'."
  }
  & icacls.exe $Path /grant "*S-1-5-32-544:(OI)(CI)F" /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not grant Administrators access to '$Path'."
  }
}

Assert-Administrator

$appRoot = Join-Path $InstallRoot "app"
$binRoot = Join-Path $InstallRoot "bin"
$siteRoot = Join-Path $InstallRoot "iis\site"
$bunExe = Join-Path $binRoot "bun.exe"
$taskName = "Inkvoice Local Server"
$siteName = "InkvoiceLocal"

Write-Host "Cleaning the previous Inkvoice deployment..."
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task -and $task.State -in @("Running", "Queued")) {
  Stop-ScheduledTask -TaskName $taskName
  $stopDeadline = (Get-Date).AddSeconds(30)
  do {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task -or $task.State -notin @("Running", "Queued")) {
      break
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $stopDeadline)
  if ($task -and $task.State -in @("Running", "Queued")) {
    throw "The Inkvoice background task would not stop. Restart Windows, then run this cleanup script again."
  }
}

if (Get-Module -ListAvailable -Name WebAdministration) {
  Import-Module WebAdministration
  if (Get-Website -Name $siteName -ErrorAction SilentlyContinue) {
    Stop-Website -Name $siteName
    Remove-Website -Name $siteName
  }
}

if (Test-Path $bunExe) {
  $fullBunPath = [IO.Path]::GetFullPath($bunExe)
  $bunProcesses = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'bun.exe'" |
    Where-Object { $_.ExecutablePath -ieq $fullBunPath }
  foreach ($bunProcess in $bunProcesses) {
    Stop-Process -Id $bunProcess.ProcessId -Force -ErrorAction Stop
    Wait-Process -Id $bunProcess.ProcessId -Timeout 20 -ErrorAction SilentlyContinue
    if (Get-Process -Id $bunProcess.ProcessId -ErrorAction SilentlyContinue) {
      throw "Could not stop the Inkvoice Bun process (PID $($bunProcess.ProcessId))."
    }
  }
}

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Repair-CleanupPathPermissions $appRoot
Repair-CleanupPathPermissions $binRoot
Repair-CleanupPathPermissions $siteRoot
foreach ($oldPath in @($appRoot, $binRoot, $siteRoot)) {
  if (Test-Path $oldPath) {
    try {
      Remove-Item $oldPath -Recurse -Force -ErrorAction Stop
    } catch {
      throw "Could not remove '$oldPath'. Close any process using it and rerun this cleanup script as Administrator. Original error: $($_.Exception.Message)"
    }
  }
}

Write-Host "Cleanup complete. The database, settings, and server log were preserved under '$InstallRoot'."
Write-Host "You can now rerun install-windows-iis.ps1 as Administrator."

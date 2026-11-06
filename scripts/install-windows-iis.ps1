param(
  [string]$Repository = "https://github.com/manimaran610/inkvoice/archive/refs/heads/main.zip",
  [string]$InstallRoot = "$env:ProgramData\Inkvoice",
  [int]$IisPort = 8088,
  [int]$BackendPort = 3000
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated PowerShell window (Run as administrator)."
  }
}

function Invoke-MsiInstall([string]$Url, [string]$Name) {
  $installer = Join-Path $env:TEMP $Name
  Invoke-WebRequest -Uri $Url -OutFile $installer
  $process = Start-Process msiexec.exe -ArgumentList @("/i", "`"$installer`"", "/qn", "/norestart") -Wait -PassThru
  Remove-Item $installer -Force -ErrorAction SilentlyContinue
  if ($process.ExitCode -notin @(0, 1638, 3010)) {
    throw "$Name installation failed with exit code $($process.ExitCode)."
  }
  if ($process.ExitCode -eq 3010) {
    throw "Windows needs to restart after installing $Name. Restart, then run this script again."
  }
}

function New-RandomSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  $generator.GetBytes($bytes)
  $generator.Dispose()
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Stop-InstalledBunProcess([string]$Path) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  $processes = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'bun.exe'" |
    Where-Object { $_.ExecutablePath -ieq $fullPath }
  foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    Wait-Process -Id $process.ProcessId -Timeout 20 -ErrorAction SilentlyContinue
    if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) {
      throw "Could not stop the existing Inkvoice Bun process (PID $($process.ProcessId)). Close it in Task Manager and rerun this installer as Administrator."
    }
  }
}

function Repair-DeploymentPathPermissions([string]$Path) {
  if (-not (Test-Path $Path)) {
    return
  }
  & takeown.exe /F $Path /R /D Y | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not take ownership of '$Path'. Run the installer from an elevated PowerShell window."
  }
  & icacls.exe $Path /grant "*S-1-5-32-544:(OI)(CI)F" /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not grant Administrators access to '$Path'."
  }
}

Assert-Administrator
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ([Environment]::Is64BitOperatingSystem -eq $false) {
  throw "The local IIS installer currently supports 64-bit Windows only."
}

$appRoot = Join-Path $InstallRoot "app"
$dataRoot = Join-Path $InstallRoot "data"
$binRoot = Join-Path $InstallRoot "bin"
$iisRoot = Join-Path $InstallRoot "iis"
$siteRoot = Join-Path $iisRoot "site"
$settingsPath = Join-Path $InstallRoot "settings.json"
$runnerPath = Join-Path $InstallRoot "run-inkvoice.ps1"
$taskName = "Inkvoice Local Server"
$siteName = "InkvoiceLocal"
$appcmd = Join-Path $env:windir "System32\inetsrv\appcmd.exe"
$bunExe = Join-Path $binRoot "bun.exe"

Write-Host "Preparing Inkvoice installation..."
$previousTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($previousTask -and $previousTask.State -in @("Running", "Queued")) {
  Write-Host "Stopping the previous Inkvoice background task..."
  Stop-ScheduledTask -TaskName $taskName
  $stopDeadline = (Get-Date).AddSeconds(30)
  do {
    $previousTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $previousTask -or $previousTask.State -notin @("Running", "Queued")) {
      break
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $stopDeadline)
  if ($previousTask -and $previousTask.State -in @("Running", "Queued")) {
    throw "The previous Inkvoice task would not stop. Restart Windows, then run this installer again as Administrator."
  }
}

if (Get-Module -ListAvailable -Name WebAdministration) {
  Import-Module WebAdministration
  if (Get-Website -Name $siteName -ErrorAction SilentlyContinue) {
    Write-Host "Stopping the previous Inkvoice IIS site..."
    Stop-Website -Name $siteName
  }
}
Stop-InstalledBunProcess $bunExe
Repair-DeploymentPathPermissions $appRoot
Repair-DeploymentPathPermissions $binRoot
Repair-DeploymentPathPermissions $siteRoot

Write-Host "Removing previous application files (database and settings are preserved)..."
foreach ($oldPath in @($appRoot, $bunExe)) {
  if (Test-Path $oldPath) {
    try {
      Remove-Item $oldPath -Recurse -Force -ErrorAction Stop
    } catch {
      throw "Could not remove previous deployment file '$oldPath'. Run cleanup-windows-iis.ps1 as Administrator, then rerun the installer. Original error: $($_.Exception.Message)"
    }
  }
}

New-Item -ItemType Directory -Force -Path $InstallRoot, $dataRoot, $binRoot, $siteRoot | Out-Null

$iisFeatures = @(
  "IIS-WebServerRole",
  "IIS-WebServer",
  "IIS-CommonHttpFeatures",
  "IIS-DefaultDocument",
  "IIS-StaticContent",
  "IIS-HttpErrors",
  "IIS-ManagementConsole"
)
Enable-WindowsOptionalFeature -Online -FeatureName $iisFeatures -All -NoRestart | Out-Null

$rewriteUrl = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"
$arrUrl = "https://go.microsoft.com/fwlink/?LinkID=615136"
Invoke-MsiInstall $rewriteUrl "iis-url-rewrite.msi"
Invoke-MsiInstall $arrUrl "iis-arr.msi"

if (-not (Test-Path $appcmd)) {
  throw "IIS did not finish installing. Restart Windows and run this script again."
}

$modules = & $appcmd list modules
if (-not ($modules | Select-String "RewriteModule")) {
  throw "IIS URL Rewrite is not loaded. Restart Windows and run this script again."
}
if (-not ($modules | Select-String "ApplicationRequestRouting")) {
  throw "IIS ARR is not loaded. Restart Windows and run this script again."
}

Write-Host "Downloading Inkvoice source..."
$sourceZip = Join-Path $env:TEMP "inkvoice-main.zip"
$sourceTemp = Join-Path $env:TEMP "inkvoice-source"
Remove-Item $sourceTemp -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest -Uri $Repository -OutFile $sourceZip
Expand-Archive -Path $sourceZip -DestinationPath $sourceTemp -Force
$sourceRoot = Get-ChildItem $sourceTemp -Directory |
  Where-Object { Test-Path (Join-Path $_.FullName "package.json") } |
  Select-Object -First 1
if (-not $sourceRoot) {
  throw "Could not find the Inkvoice source in the downloaded archive."
}

Write-Host "Downloading Bun for Windows..."
$bunZip = Join-Path $env:TEMP "bun-windows-x64.zip"
$bunTemp = Join-Path $env:TEMP "bun-windows-x64"
Remove-Item $bunTemp -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest -Uri "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip" -OutFile $bunZip
Expand-Archive -Path $bunZip -DestinationPath $bunTemp -Force
$bunSource = Get-ChildItem $bunTemp -Filter "bun.exe" -Recurse | Select-Object -First 1
if (-not $bunSource) {
  throw "Could not find bun.exe in the downloaded Bun archive."
}
try {
  Unblock-File -Path $bunSource.FullName
  Copy-Item $bunSource.FullName $bunExe -Force -ErrorAction Stop
} catch {
  throw "Could not install bun.exe to '$bunExe'. The file may still be locked or denied by Windows. Download cleanup-windows-iis.ps1 from the Inkvoice repository, run it as Administrator, then rerun this installer. Original error: $($_.Exception.Message)"
}
try {
  Unblock-File -Path $bunExe
  & $bunExe --version
  if ($LASTEXITCODE -ne 0) {
    throw "Bun exited with code $LASTEXITCODE."
  }
} catch {
  throw "Windows denied execution of '$bunExe'. Check Windows Security/antivirus quarantine and allow the official Bun executable, then rerun the installer. Original error: $($_.Exception.Message)"
}

Move-Item $sourceRoot.FullName $appRoot
Remove-Item $sourceTemp, $sourceZip, $bunTemp, $bunZip -Recurse -Force -ErrorAction SilentlyContinue

Push-Location $appRoot
try {
  & $bunExe install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "bun install failed with exit code $LASTEXITCODE." }
  & $bunExe run build
  if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}

if (Test-Path $settingsPath) {
  $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
  $adminPassword = $settings.ADMIN_PASS
  $jwtSecret = $settings.JWT_SECRET
} else {
  $adminPassword = New-RandomSecret 24
  $jwtSecret = New-RandomSecret 48
}

$settings = [ordered]@{
  ADMIN_USER = "admin"
  ADMIN_PASS = $adminPassword
  JWT_SECRET = $jwtSecret
  DATABASE_PATH = (Join-Path $dataRoot "invoice.db")
  PORT = "$BackendPort"
  HOST = "127.0.0.1"
  NODE_ENV = "production"
  COOKIE_SECURE = "false"
  ALLOWED_ORIGINS = "http://localhost:$IisPort,http://127.0.0.1:$IisPort"
}
$settings | ConvertTo-Json | Set-Content -Path $settingsPath -Encoding ascii

@'
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$settings = Get-Content (Join-Path $root "settings.json") -Raw | ConvertFrom-Json
foreach ($property in $settings.PSObject.Properties) {
  [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, "Process")
}
Set-Location (Join-Path $root "app")
& (Join-Path $root "bin\bun.exe") run packages/backend/src/index.ts *>> (Join-Path $root "server.log")
exit $LASTEXITCODE
'@ | Set-Content -Path $runnerPath -Encoding ascii

$aclSids = @("*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F")
& icacls.exe $InstallRoot /inheritance:r /grant $aclSids /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not secure the Inkvoice installation directory."
}

$webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="Inkvoice reverse proxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:$BackendPort/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
"@
$webConfig | Set-Content -Path (Join-Path $siteRoot "web.config") -Encoding utf8
& icacls.exe $siteRoot /grant "*S-1-5-32-568:(OI)(CI)RX" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not grant IIS access to the reverse-proxy configuration."
}

& $appcmd set config -section:system.webServer/proxy /enabled:"True" /commit:apphost | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not enable IIS Application Request Routing proxy mode."
}
Import-Module WebAdministration
if (Get-Website -Name $siteName -ErrorAction SilentlyContinue) {
  Stop-Website -Name $siteName
  Remove-Website -Name $siteName
}
New-Website -Name $siteName -PhysicalPath $siteRoot -IPAddress "127.0.0.1" -Port $IisPort | Out-Null
New-WebBinding -Name $siteName -Protocol http -IPAddress "::1" -Port $IisPort | Out-Null
Set-Service -Name W3SVC -StartupType Automatic
Start-Service -Name W3SVC

$powershell = Join-Path $env:windir "System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction `
  -Execute $powershell `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runnerPath`"" `
  -WorkingDirectory $InstallRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$taskSettings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $taskSettings `
  -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Waiting for the Inkvoice backend and IIS proxy to become healthy..."
$healthUrl = "http://127.0.0.1:$BackendPort/health"
$iisHealthUrl = "http://localhost:$IisPort/health"
$healthDeadline = (Get-Date).AddSeconds(90)
$healthError = "No health response received yet."
$isHealthy = $false
do {
  try {
    $backendHealth = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
    $iisHealth = Invoke-RestMethod -Uri $iisHealthUrl -TimeoutSec 5
    if ($backendHealth.status -eq "ok" -and $iisHealth.status -eq "ok") {
      $isHealthy = $true
      break
    }
    $healthError = "Backend status: $($backendHealth.status); IIS status: $($iisHealth.status)."
  } catch {
    $healthError = $_.Exception.Message
  }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $healthDeadline)

if (-not $isHealthy) {
  $currentTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
  $taskState = if ($currentTask) { $currentTask.State } else { "not found" }
  $lastTaskResult = if ($taskInfo) { $taskInfo.LastTaskResult } else { "unavailable" }
  throw "Inkvoice deployment did not become healthy within 90 seconds. Task state: $taskState; last task result: $lastTaskResult. Last health check: $healthError. Check '$InstallRoot\server.log'. If this is a rerun, download cleanup-windows-iis.ps1 from the Inkvoice repository, run it as Administrator, then retry."
}

Write-Host ""
Write-Host "SUCCESS: Inkvoice is deployed and healthy."
Write-Host "Backend and IIS health checks passed."
Write-Host "Open: $iisHealthUrl (health check)"
Write-Host "Application: http://localhost:$IisPort"
Write-Host "Username: admin"
Write-Host "Password: $adminPassword"
Write-Host "SQLite database: $(Join-Path $dataRoot 'invoice.db')"
Write-Host "Server log: $(Join-Path $InstallRoot 'server.log')"
Write-Host ""
Write-Host "The app is bound to this PC only. The first setup needs internet; runtime does not."
Write-Host "Email, online payments, exchange-rate lookups, SSO, and PEPPOL need internet."

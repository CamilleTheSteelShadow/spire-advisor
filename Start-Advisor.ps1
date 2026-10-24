param([switch]$NoBrowser, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$address = 'http://127.0.0.1:18765'
try {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { 'C:\nvm4w\nodejs\node.exe' }
  if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js is missing. Install Node.js 22 or newer from https://nodejs.org/' }
  $version = & $nodePath --version
  if ([int]($version.TrimStart('v').Split('.')[0]) -lt 22) { throw ('Node.js 22+ is required. Detected: ' + $version) }
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'server.mjs'))) { throw 'server.mjs is missing. Extract the entire project folder first.' }
  if ($CheckOnly) { Write-Host ('Launcher check passed. Node ' + $version); exit 0 }
  $ready = $false
  try { $status = Invoke-RestMethod -Uri ($address + '/api/status') -TimeoutSec 2; $ready = ($null -ne $status.token -and $null -ne $status.config) } catch {}
  if (-not $ready) {
    $logs = Join-Path $PSScriptRoot 'work'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $taskServer = Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'server.log') -RedirectStandardError (Join-Path $logs 'server-error.log')
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      Start-Sleep -Milliseconds 350
      try { $status = Invoke-RestMethod -Uri ($address + '/api/status') -TimeoutSec 1; $ready = ($null -ne $status.token -and $null -ne $status.config) } catch {}
      if ($ready) { break }
      if ($taskServer.HasExited) { break }
    }
    if (-not $ready) { throw ('Cannot start the advisor. See logs in: ' + $logs) }
    [System.IO.File]::WriteAllText((Join-Path $logs 'server.pid'), [string]$taskServer.Id)
  }
  Write-Host ('Advisor is ready: ' + $address) -ForegroundColor Green
  if (-not $NoBrowser) { Start-Process -FilePath (Join-Path $PSScriptRoot 'desktop\SpireAdvisor.exe') -WorkingDirectory $PSScriptRoot }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}

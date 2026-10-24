param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
try {
  $address='http://127.0.0.1:18765'
  $status=$null; $restoreAuto=$false; $restoreMode='live'
  try {$status=Invoke-RestMethod -Uri ($address+'/api/status') -TimeoutSec 2} catch {}
  if($null -ne $status) {
    $restoreAuto=$status.auto -eq $true; $restoreMode=$status.mode
    if(-not $status.token -or $null -eq $status.config) {throw 'Port 18765 belongs to another application. Refusing to stop it.'}
    if([version]$status.version -ge [version]'0.1.22'){
      Invoke-RestMethod -Uri ($address+'/api/shutdown') -Method Post -Headers @{'X-Advisor-Token'=$status.token} -ContentType 'application/json' -Body '{}' -TimeoutSec 3 | Out-Null
      Start-Sleep -Milliseconds 700
    }else{
    $pidFile=Join-Path $PSScriptRoot 'work\server.pid'
    if(-not (Test-Path -LiteralPath $pidFile)){throw 'Advisor PID file not found. Close the old advisor process manually and retry.'}
    $advisorPid=[int]([System.IO.File]::ReadAllText($pidFile).Trim())
    $connections=@(Get-NetTCPConnection -LocalPort 18765 -State Listen -ErrorAction Stop)
    if(-not ($connections.OwningProcess -contains $advisorPid)){throw 'Advisor PID does not match its listening port. Refusing to stop another process.'}
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$advisorPid)
    if($process.Name -ne 'node.exe' -or $process.CommandLine -notmatch 'server\.mjs'){throw 'Process does not match the advisor. Refusing to stop it.'}
    Stop-Process -Id $advisorPid -ErrorAction Stop
    Start-Sleep -Milliseconds 500
    }
  }
  & (Join-Path $PSScriptRoot 'Start-Advisor.ps1') -NoBrowser
  if($LASTEXITCODE -ne 0){throw 'Advisor did not start.'}
  $status=Invoke-RestMethod -Uri ($address+'/api/status') -TimeoutSec 3
  if($status.version -ne '0.1.22'){throw 'An older advisor is still running.'}
  $headers=@{'X-Advisor-Token'=$status.token}
  Invoke-RestMethod -Uri ($address+'/api/mode') -Method Post -Headers $headers -ContentType 'application/json' -Body (ConvertTo-Json @{mode=$restoreMode} -Compress) -TimeoutSec 5 | Out-Null
  if($restoreAuto){Invoke-RestMethod -Uri ($address+'/api/auto') -Method Post -Headers $headers -ContentType 'application/json' -Body '{"enabled":true}' -TimeoutSec 5 | Out-Null}
  Write-Host 'Advisor v0.1.22 is ready. API settings were preserved.' -ForegroundColor Green
  if(-not $NoBrowser){Start-Process -FilePath (Join-Path $PSScriptRoot 'desktop\SpireAdvisor.exe') -WorkingDirectory $PSScriptRoot}
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}

param([string]$GameDir = 'D:\SteamLibrary\steamapps\common\Slay the Spire 2', [switch]$NoRestart)
$ErrorActionPreference = 'Stop'
try {
  $game = (Resolve-Path -LiteralPath $GameDir).Path
  if (-not (Test-Path -LiteralPath (Join-Path $game 'SlayTheSpire2.exe'))) { throw 'Invalid game directory.' }
  $destination = Join-Path $game 'mods'
  if (-not (Test-Path -LiteralPath (Join-Path $destination 'STS2_MCP.dll'))) { throw 'Install STS2_MCP first.' }
  $files = @('SpireAdvisorDeck.dll', 'SpireAdvisorDeck.json')
  foreach ($file in $files) {
    $sourceFile = Join-Path (Join-Path $PSScriptRoot 'mod') $file
    $destFile = Join-Path $destination $file
    if (-not (Test-Path -LiteralPath $sourceFile)) { throw ('Missing patch: ' + $file) }
    if ($file -eq 'SpireAdvisorDeck.dll' -and (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash -ne '70E73F3856E81A7961CA12DBE6B175C3A6A262C0288B67D53934276ECFAFB026') { throw 'Patch checksum mismatch.' }
    if (Test-Path -LiteralPath $destFile) {
      if ((Get-FileHash -LiteralPath $sourceFile).Hash -eq (Get-FileHash -LiteralPath $destFile).Hash) { continue }
      if (Get-Process -Name 'SlayTheSpire2' -ErrorAction SilentlyContinue) { throw 'Exit the game before replacing an older deck patch.' }
      Copy-Item -LiteralPath $destFile -Destination ($destFile + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    }
    Copy-Item -LiteralPath $sourceFile -Destination $destFile -Force
    if ((Get-FileHash -LiteralPath $sourceFile).Hash -ne (Get-FileHash -LiteralPath $destFile).Hash) { throw ('Copy verification failed: ' + $file) }
  }
  Write-Host 'Reader patch v0.6.0 installed (deck + shop + upgrade previews + event map context + no shop auto-open + reward map context). Restart the game; keep Spire Advisor Deck Reader enabled.' -ForegroundColor Green
  Write-Host 'Your original STS2_MCP files, game saves and API configuration were not changed.'
  if ($NoRestart) { exit 0 }
  & (Join-Path $PSScriptRoot 'Restart-Advisor.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Patch installed, but advisor restart failed. Please restart the advisor manually.' }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}

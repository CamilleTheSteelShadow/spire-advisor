param([string]$GameDir = 'D:\SteamLibrary\steamapps\common\Slay the Spire 2')
$ErrorActionPreference = 'Stop'
try {
  $game = (Resolve-Path -LiteralPath $GameDir).Path
  if (-not (Test-Path -LiteralPath (Join-Path $game 'SlayTheSpire2.exe'))) { throw '所选目录没有 SlayTheSpire2.exe，请检查游戏安装位置。' }
  if (Get-Process -Name 'SlayTheSpire2' -ErrorAction SilentlyContinue) { throw '请先退出游戏，再安装模组。' }
  $source = Join-Path $PSScriptRoot 'mod'
  $destination = Join-Path $game 'mods'
  $files = @('STS2_MCP.dll', 'STS2_MCP.json', 'SpireAdvisorDeck.dll', 'SpireAdvisorDeck.json')
  $expected = 'F429E781D1BFC7FB24B20B6D88BDA78C40A29AC0DA658349EB4D0F861B325810'
  if ((Get-FileHash -LiteralPath (Join-Path $source 'STS2_MCP.dll') -Algorithm SHA256).Hash -ne $expected) { throw '模组文件校验失败，请重新下载。' }
  if ((Get-FileHash -LiteralPath (Join-Path $source 'SpireAdvisorDeck.dll') -Algorithm SHA256).Hash -ne '70E73F3856E81A7961CA12DBE6B175C3A6A262C0288B67D53934276ECFAFB026') { throw '读取补丁文件校验失败。' }
  foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $file))) { throw ('缺少模组文件：' + $file) }
    if (Test-Path -LiteralPath (Join-Path $destination $file)) { throw ('已存在同名模组文件，未覆盖：' + (Join-Path $destination $file)) }
  }
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $source $file) -Destination (Join-Path $destination $file) }
  foreach ($file in $files) {
    if ((Get-FileHash -LiteralPath (Join-Path $source $file)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $destination $file)).Hash) { throw ('复制后校验失败：' + $file) }
  }
  Write-Host ('安装完成：' + $destination) -ForegroundColor Green
  Write-Host '请启动游戏，同时启用 STS2 MCP 和 Spire Advisor Deck Reader，然后在助手中选择“连接游戏”。'
  Write-Host '模组加载兼容性尚需在当前游戏版本中验证。删除复制的四个模组文件可撤销安装。'
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}

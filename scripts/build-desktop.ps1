param([string]$SdkPath)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if(-not $SdkPath){$SdkPath=[IO.Path]::GetFullPath((Join-Path $root '..\..\work\webview2-sdk\package'))}
$desktop=Join-Path $root 'desktop';New-Item -ItemType Directory -Path $desktop -Force|Out-Null
foreach($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')){Copy-Item -LiteralPath (Join-Path $SdkPath ('lib\net462\'+$name)) -Destination $desktop -Force}
Copy-Item -LiteralPath (Join-Path $SdkPath 'runtimes\win-x64\native\WebView2Loader.dll') -Destination $desktop -Force
Copy-Item -LiteralPath (Join-Path $SdkPath 'LICENSE.txt') -Destination (Join-Path $desktop 'WebView2-LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $SdkPath 'NOTICE.txt') -Destination (Join-Path $desktop 'WebView2-NOTICE.txt') -Force
Add-Type -AssemblyName System.Drawing
$bitmap=New-Object Drawing.Bitmap(64,64);$graphics=[Drawing.Graphics]::FromImage($bitmap);$graphics.SmoothingMode='AntiAlias';$graphics.Clear([Drawing.Color]::FromArgb(16,26,32))
$brush=New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(216,183,122))
$graphics.FillRectangle($brush,23,20,18,31);$graphics.FillRectangle($brush,18,16,28,8);$graphics.FillRectangle($brush,18,50,28,5);$graphics.FillRectangle($brush,20,10,5,10);$graphics.FillRectangle($brush,30,10,5,10);$graphics.FillRectangle($brush,40,10,5,10)
$icoPath=Join-Path $desktop 'advisor.ico';$icon=[Drawing.Icon]::FromHandle($bitmap.GetHicon());$stream=[IO.File]::Create($icoPath);try{$icon.Save($stream)}finally{$stream.Dispose();$icon.Dispose();$brush.Dispose();$graphics.Dispose();$bitmap.Dispose()}
$manifest=Join-Path $desktop 'app.manifest'
[IO.File]::WriteAllText($manifest,'<?xml version="1.0" encoding="utf-8"?><assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1"><assemblyIdentity name="SpireAdvisor.Desktop" version="1.0.0.0"/><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo><application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness></windowsSettings></application><compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application></compatibility></assembly>')
$refs=@('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll',(Join-Path $desktop 'Microsoft.Web.WebView2.Core.dll'),(Join-Path $desktop 'Microsoft.Web.WebView2.WinForms.dll'))
function Compile-Desktop($Source,$Destination,$References){
 $provider=New-Object Microsoft.CSharp.CSharpCodeProvider
 $options=New-Object CodeDom.Compiler.CompilerParameters
 $options.GenerateExecutable=$true;$options.OutputAssembly=$Destination
 $options.CompilerOptions='/target:winexe /platform:x64 /win32icon:"'+$icoPath+'" /win32manifest:"'+$manifest+'"'
 foreach($ref in $References){[void]$options.ReferencedAssemblies.Add($ref)}
 $result=$provider.CompileAssemblyFromSource($options,[IO.File]::ReadAllText($Source))
 if($result.Errors.HasErrors){$result.Errors|ForEach-Object {$_.ToString()};throw 'Desktop compilation failed'}
 $provider.Dispose()
}
Compile-Desktop (Join-Path $root 'desktop-src\AdvisorDesktop.cs') (Join-Path $desktop 'SpireAdvisor.exe') $refs
Compile-Desktop (Join-Path $root 'desktop-src\Launcher.cs') (Join-Path $root '尖塔领航.exe') @('System.dll','System.Windows.Forms.dll')
Write-Output 'Desktop application built.'
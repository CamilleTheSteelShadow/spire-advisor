# 桌面组件来源

Microsoft.Web.WebView2 SDK 1.0.4258.31，来自微软发布的 NuGet 包：
https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4258.31

下载地址：https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4258.31/microsoft.web.webview2.1.0.4258.31.nupkg

使用 net462 的 Core / WinForms DLL 与 win-x64 的 WebView2Loader.dll。附带上游 LICENSE 与 NOTICE；微软 Core DLL 的 Authenticode 签名已验证为 Valid。

SHA-256：

- Microsoft.Web.WebView2.Core.dll: D60E6E94245078CB56E44EBD5F360DC04BF18E460136BE93BFC4CFCA43B98505
- Microsoft.Web.WebView2.WinForms.dll: 6A9E6856F23C463783C3AFB0CA5D78F56324C86657162CCB16D5227B3233B32A
- WebView2Loader.dll: 3426DCC55FDFB8B5E7AC623CF33B4CCF283FBF68A0C5A65BDDFDB4D749A8ABEE

应用源码位于 ../desktop-src/，构建脚本为 ../scripts/build-desktop.ps1。应用及图标由本项目创建，不包含浏览器安装包、API 配置或游戏 DLL。当前使用电脑已安装的 Evergreen WebView2 Runtime。

部署参考：https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution

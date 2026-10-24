using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program {
 public static string Root=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,".."));
 public const string Address="http://127.0.0.1:18765";
 public const string Caption="尖塔领航 · 桌面版";
 public static bool Smoke;
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindow(string name,string caption);
 [DllImport("user32.dll")]static extern bool ShowWindowAsync(IntPtr window,int state);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")]static extern bool PostMessage(IntPtr window,int message,IntPtr w,IntPtr l);
 public const int ShowMessage=0x8001;
 [STAThread]static void Main(string[] args){
  try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
  Smoke=Array.IndexOf(args,"--smoke-test")>=0;
  bool first;using(var mutex=new Mutex(true,"Local\\SpireAdvisorDesktop-18765",out first)){
   if(!first){var handle=FindWindow(null,Caption);if(handle!=IntPtr.Zero){PostMessage(handle,ShowMessage,IntPtr.Zero,IntPtr.Zero);ShowWindowAsync(handle,9);SetForegroundWindow(handle);}return;}
   Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   Application.Run(new AdvisorForm());
  }
 }
 public static async Task<string> Request(string path,string token=null,string body=null){
  var req=(HttpWebRequest)WebRequest.Create(Address+path);req.Proxy=null;req.Timeout=6000;
  if(body!=null){req.Method="POST";req.ContentType="application/json";req.Headers["X-Advisor-Token"]=token;using(var writer=new StreamWriter(await req.GetRequestStreamAsync()))await writer.WriteAsync(body);}
  using(var response=await req.GetResponseAsync())using(var reader=new StreamReader(response.GetResponseStream()))return await reader.ReadToEndAsync();
 }
 public static void Report(object value){Directory.CreateDirectory(Path.Combine(Root,"work"));File.WriteAllText(Path.Combine(Root,"work","desktop-check.json"),new JavaScriptSerializer().Serialize(value));}
}

class AdvisorForm:Form {
 WebView2 web;NotifyIcon tray;Label loading;bool quit,shutdown;bool tipShown;string token;
 public AdvisorForm(){
  Text=Program.Caption;Width=1360;Height=900;MinimumSize=new Size(920,650);StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(15,24,29);
  var iconPath=Path.Combine(Program.Root,"desktop","advisor.ico");if(File.Exists(iconPath))Icon=new Icon(iconPath);
  loading=new Label{Dock=DockStyle.Fill,ForeColor=Color.FromArgb(216,183,122),Text="正在打开尖塔领航…",TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Microsoft YaHei UI",16)};Controls.Add(loading);
  tray=new NotifyIcon{Text="尖塔领航",Icon=Icon,Visible=true};var menu=new ContextMenuStrip();
  menu.Items.Add("打开助手",null,(s,e)=>Restore());menu.Items.Add("退出助手",null,async(s,e)=>await ExitAdvisor());tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>Restore();
  Shown+=async(s,e)=>await Initialize();FormClosing+=(s,e)=>{if(!quit&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();if(!tipShown){tray.ShowBalloonTip(2500,"尖塔领航","助手已留在托盘，自动分析和通知会继续。双击托盘图标可打开。",ToolTipIcon.Info);tipShown=true;}}};
  FormClosed+=(s,e)=>{tray.Visible=false;tray.Dispose();if(web!=null)web.Dispose();};
 }
 protected override void WndProc(ref Message m){if(m.Msg==Program.ShowMessage){Restore();return;}base.WndProc(ref m);}
 void Restore(){Show();if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Activate();}
 async Task Initialize(){
  try{
   await Task.Run(()=>{
    var psi=new ProcessStartInfo("powershell.exe","-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+Path.Combine(Program.Root,"Start-Advisor.ps1")+"\" -NoBrowser"){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Program.Root};
    using(var process=Process.Start(psi)){if(!process.WaitForExit(30000)){throw new Exception("后台服务启动超时，请查看 work 中的日志。");}if(process.ExitCode!=0)throw new Exception("后台服务未能启动，请查看 work 中的日志。");}
   });
   var status=new JavaScriptSerializer().DeserializeObject(await Program.Request("/api/status")) as System.Collections.Generic.Dictionary<string,object>;
   if(status==null||!status.ContainsKey("token")||!status.ContainsKey("config"))throw new Exception("助手服务校验失败。");token=Convert.ToString(status["token"]);
   await RestoreSession(status);
   web=new WebView2{Dock=DockStyle.Fill,DefaultBackgroundColor=BackColor};Controls.Add(web);web.BringToFront();
   var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.Root,"work","desktop-profile"));await web.EnsureCoreWebView2Async(environment);
   web.CoreWebView2.Settings.AreDevToolsEnabled=false;web.CoreWebView2.Settings.IsStatusBarEnabled=false;web.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;
   web.CoreWebView2.NavigationStarting+=(s,e)=>{Uri uri;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port!=18765)e.Cancel=true;};
   web.CoreWebView2.NewWindowRequested+=(s,e)=>{e.Handled=true;};web.CoreWebView2.PermissionRequested+=(s,e)=>{e.State=CoreWebView2PermissionState.Deny;};
   web.CoreWebView2.DownloadStarting+=(s,e)=>{e.Cancel=true;};
   web.CoreWebView2.NavigationCompleted+=async(s,e)=>{
    if(!e.IsSuccess){loading.Text="界面加载失败，请重启助手。";loading.BringToFront();return;}loading.Visible=false;
    if(Program.Smoke){try{await Task.Delay(1800);var result=await web.CoreWebView2.ExecuteScriptAsync("(() => {document.getElementById('settingsOpen').click();const settings=document.getElementById('settings').open,profiles=document.getElementById('savedProfile').options.length;document.getElementById('settings').close();return {title:document.title,hasSettings:settings,profiles:profiles,hasAnalyze:!!document.getElementById('analyze'),origin:location.origin};})()");Close();bool hidden=!Visible;Restore();using(var file=File.Create(Path.Combine(Program.Root,"work","desktop-preview.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file);Program.Report(new {ok=true,runtime=environment.BrowserVersionString,page=new JavaScriptSerializer().DeserializeObject(result),closeToTray=hidden,restored=Visible});}catch{Program.Report(new {ok=false,error="界面自检失败"});}quit=true;Close();}
   };
   web.CoreWebView2.Navigate(Program.Address);
  }catch(Exception){loading.Text="桌面助手暂时无法启动。请检查 WebView2 运行组件及 work 中的启动日志。";if(Program.Smoke){Program.Report(new {ok=false,error="桌面启动失败"});quit=true;Close();}}
 }
 async Task RestoreSession(System.Collections.Generic.Dictionary<string,object> status){
  if(Program.Smoke)return;
  var file=Path.Combine(Program.Root,"work","desktop-session.json");if(!File.Exists(file))return;
  try{var saved=new JavaScriptSerializer().DeserializeObject(File.ReadAllText(file)) as System.Collections.Generic.Dictionary<string,object>;
   if(Convert.ToString(status["mode"])=="demo"&&saved!=null&&saved.ContainsKey("mode")&&Convert.ToString(saved["mode"])=="live"){
    await Program.Request("/api/mode",token,"{\"mode\":\"live\"}");if(saved.ContainsKey("auto")&&Convert.ToBoolean(saved["auto"]))await Program.Request("/api/auto",token,"{\"enabled\":true}");
   }
  }catch{}
 }
 async Task ExitAdvisor(){
  if(shutdown)return;shutdown=true;
  try{var s=new JavaScriptSerializer().DeserializeObject(await Program.Request("/api/status")) as System.Collections.Generic.Dictionary<string,object>;if(s!=null){Directory.CreateDirectory(Path.Combine(Program.Root,"work"));File.WriteAllText(Path.Combine(Program.Root,"work","desktop-session.json"),new JavaScriptSerializer().Serialize(new {mode=s["mode"],auto=s["auto"]}));await Program.Request("/api/shutdown",Convert.ToString(s["token"]),"{}");}}catch{}
  quit=true;Close();
 }
}

param([string]$StatePath,[int]$Port=18765,[switch]$CheckOnly,[switch]$PreviewSounds,[string]$RenderPreview)
$ErrorActionPreference='Stop'
if($Port -lt 1024 -or $Port -gt 65535){throw 'Invalid port'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Windows.Forms','System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class AdvisorDpi {
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")]static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("shcore.dll")]static extern int SetProcessDpiAwareness(int mode);
 [DllImport("user32.dll")]static extern bool SetProcessDPIAware();
 public static void Enable(){try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{try{SetProcessDpiAwareness(2);}catch{try{SetProcessDPIAware();}catch{}}}try{SetThreadDpiAwarenessContext(new IntPtr(-4));}catch{}}
}
public static class AdvisorDrawing {
 public static GraphicsPath Round(Rectangle bounds,int radius){var p=new GraphicsPath();int d=radius*2;p.AddArc(bounds.Left,bounds.Top,d,d,180,90);p.AddArc(bounds.Right-d,bounds.Top,d,d,270,90);p.AddArc(bounds.Right-d,bounds.Bottom-d,d,d,0,90);p.AddArc(bounds.Left,bounds.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 [DllImport("uxtheme.dll",CharSet=CharSet.Unicode)]static extern int SetWindowTheme(IntPtr handle,string theme,string sub);
 public static void DarkScroll(Control control){try{SetWindowTheme(control.Handle,"DarkMode_Explorer",null);}catch{}}
}
public class AdvisorNotificationForm : Form {
 public AdvisorNotificationForm(){DoubleBuffered=true;}
 protected override bool ShowWithoutActivation {get{return true;}}
 protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x08000000;p.ClassStyle|=0x00020000;return p;}}
 protected override void OnResize(EventArgs e){base.OnResize(e);if(Width>40&&Height>40){using(var p=AdvisorDrawing.Round(new Rectangle(0,0,Width,Height),18)){var old=Region;Region=new Region(p);if(old!=null)old.Dispose();}}}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var path=AdvisorDrawing.Round(new Rectangle(0,0,Width-1,Height-1),18))using(var pen=new Pen(Color.FromArgb(53,73,78))){e.Graphics.DrawPath(pen,path);}}
}
public class AdvisorMapNode {public string Id,Label,Type;public int Col,Layer;public bool Current,Recommended;}
public class AdvisorMapEdge {public string From,To;public bool Recommended;}
public class AdvisorMapView : Control {
 public AdvisorMapNode[] Nodes=new AdvisorMapNode[0];public AdvisorMapEdge[] Edges=new AdvisorMapEdge[0];public int Columns=7;
 public AdvisorMapView(){DoubleBuffered=true;SetStyle(ControlStyles.ResizeRedraw,true);}
 PointF Position(AdvisorMapNode n){float s=DeviceDpi/96f;return new PointF(30*s+(Width-60*s)*n.Col/(float)Math.Max(1,Columns-1),Height-49*s-n.Layer*(Height-92*s)/2f);}
 protected override void OnPaint(PaintEventArgs e){
  base.OnPaint(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
  float scale=DeviceDpi/96f;
  using(var small=new Font("Microsoft YaHei UI",8))using(var glyph=new Font("Microsoft YaHei UI",10,FontStyle.Bold)){
   foreach(var edge in Edges){var a=Array.Find(Nodes,n=>n.Id==edge.From);var b=Array.Find(Nodes,n=>n.Id==edge.To);if(a==null||b==null)continue;
    var p=Position(a);var q=Position(b);float dx=q.X-p.X,dy=q.Y-p.Y,len=(float)Math.Sqrt(dx*dx+dy*dy);if(len<1)continue;
    float r=18*scale;p.X+=dx/len*r;p.Y+=dy/len*r;q.X-=dx/len*r;q.Y-=dy/len*r;
    using(var pen=new Pen(edge.Recommended?Color.FromArgb(231,193,119):Color.FromArgb(59,79,87),edge.Recommended?3*scale:1.2f*scale)){
     if(edge.Recommended)pen.EndCap=LineCap.ArrowAnchor;else pen.DashStyle=DashStyle.Dot;g.DrawLine(pen,p,q);
    }
   }
   for(int layer=0;layer<3;layer++){if(!Array.Exists(Nodes,n=>n.Layer==layer))continue;var y=Position(new AdvisorMapNode{Layer=layer}).Y;TextRenderer.DrawText(g,layer==0?"当前":layer==1?"下一站":"再下一站",small,new Point(0,(int)y-(int)(41*scale)),Color.FromArgb(113,139,146));}
   foreach(var n in Nodes){var p=Position(n);float r=15*scale;
    var color=n.Current?Color.FromArgb(143,207,186):n.Recommended?Color.FromArgb(231,193,119):Color.FromArgb(126,149,155);
    using(var fill=new SolidBrush(n.Current?Color.FromArgb(34,71,65):n.Recommended?Color.FromArgb(65,55,35):Color.FromArgb(25,39,46)))g.FillEllipse(fill,p.X-r,p.Y-r,2*r,2*r);
    using(var pen=new Pen(color,n.Current||n.Recommended?2*scale:scale))g.DrawEllipse(pen,p.X-r,p.Y-r,2*r,2*r);
    string icon=n.Current?"你":n.Label=="战斗"?"战":n.Label=="精英"?"精":n.Label=="营火"?"火":n.Label=="商店"?"店":n.Label=="宝箱"?"宝":n.Label=="首领"?"王":n.Label=="事件"?"事":"?";
    TextRenderer.DrawText(g,icon,glyph,new Rectangle((int)(p.X-r),(int)(p.Y-r),(int)(2*r),(int)(2*r)),color,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);
    string text=n.Current?"当前位置":n.Label+" · "+(n.Col+1);
    TextRenderer.DrawText(g,text,small,new Rectangle((int)(p.X-36*scale),(int)(p.Y+18*scale),(int)(72*scale),(int)(22*scale)),color,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);
   }
  }
 }
}
public class AdvisorButton : Button {
 bool hover;
 public Color NormalColor {get;set;}
 public Color HoverColor {get;set;}
 public AdvisorButton(){SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);NormalColor=Color.FromArgb(216,183,122);HoverColor=Color.FromArgb(234,205,152);Cursor=Cursors.Hand;}
 protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
 protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
 protected override void OnPaint(PaintEventArgs e){e.Graphics.Clear(Parent.BackColor);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=AdvisorDrawing.Round(new Rectangle(0,0,Width-1,Height-1),10))using(var b=new SolidBrush(hover?HoverColor:NormalColor)){e.Graphics.FillPath(b,p);}TextRenderer.DrawText(e.Graphics,Text,Font,ClientRectangle,ForeColor,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);}
}
'@
[AdvisorDpi]::Enable()
[Windows.Forms.Application]::EnableVisualStyles()
[Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)
$script:sounds=@{}
foreach($kind in @('start','success','error','cancel')){
 try{
  $player=New-Object Media.SoundPlayer
  $player.SoundLocation=Join-Path $PSScriptRoot ('assets\sounds\'+$kind+'.wav')
  $player.Load();$script:sounds[$kind]=$player
 }catch{if($CheckOnly -or $PreviewSounds){throw}}
}
function Play-AdvisorSound([string]$Kind){
 if($Kind -eq 'test'){$Kind='start'}
 if($script:sounds.ContainsKey($Kind)){$script:sounds[$Kind].Play();return}
 switch($Kind){'start'{[Media.SystemSounds]::Asterisk.Play()}'success'{[Media.SystemSounds]::Exclamation.Play()}'error'{[Media.SystemSounds]::Hand.Play()}'cancel'{[Media.SystemSounds]::Question.Play()}}
}
if($CheckOnly){foreach($player in $script:sounds.Values){$player.Dispose()};Write-Output 'Windows notification components ready (DPI aware); four distinct sounds loaded';return}
if($PreviewSounds){try{foreach($kind in @('start','success','error','cancel')){Write-Output $kind;$script:sounds[$kind].PlaySync();Start-Sleep -Milliseconds 1100}}finally{foreach($player in $script:sounds.Values){$player.Dispose()}};return}
$form=New-Object AdvisorNotificationForm
$form.Text='尖塔领航';$form.FormBorderStyle='None';$form.ShowInTaskbar=$false;$form.TopMost=$true
$form.StartPosition='Manual';$form.AutoScaleDimensions=[Drawing.SizeF]::new(96,96);$form.AutoScaleMode='Dpi';$form.ClientSize=New-Object Drawing.Size(500,354)
$form.BackColor=[Drawing.ColorTranslator]::FromHtml('#101a20');$form.ForeColor=[Drawing.ColorTranslator]::FromHtml('#e8eeeb')
$form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10)
$brand=New-Object Windows.Forms.Label;$brand.Text='S P I R E   A D V I S O R';$brand.SetBounds(28,23,300,22);$brand.Font=New-Object Drawing.Font('Segoe UI',8,[Drawing.FontStyle]::Bold);$brand.ForeColor=[Drawing.ColorTranslator]::FromHtml('#d8b77a')
$title=New-Object Windows.Forms.Label;$title.SetBounds(26,53,400,34);$title.Font=New-Object Drawing.Font('Microsoft YaHei UI',17,[Drawing.FontStyle]::Bold)
$status=New-Object Windows.Forms.Label;$status.SetBounds(344,24,96,20);$status.TextAlign='MiddleRight';$status.Font=New-Object Drawing.Font('Microsoft YaHei UI',9)
$track=New-Object Windows.Forms.Panel;$track.SetBounds(28,97,444,2);$track.BackColor=[Drawing.ColorTranslator]::FromHtml('#26393f')
$progress=New-Object Windows.Forms.Panel;$progress.SetBounds(0,0,100,2);$progress.BackColor=[Drawing.ColorTranslator]::FromHtml('#d8b77a');$track.Controls.Add($progress)
$body=New-Object Windows.Forms.TextBox;$body.SetBounds(28,118,444,155);$body.Multiline=$true;$body.ReadOnly=$true;$body.ScrollBars='None';$body.BorderStyle='None';$body.WordWrap=$true;$body.TabStop=$false
$body.Font=New-Object Drawing.Font('Microsoft YaHei UI',11);$body.BackColor=$form.BackColor;$body.ForeColor=[Drawing.ColorTranslator]::FromHtml('#e1e9e7')
$mapView=New-Object AdvisorMapView;$mapView.SetBounds(28,118,444,290);$mapView.Visible=$false;$mapView.BackColor=$form.BackColor
$mapLegend=New-Object Windows.Forms.Label;$mapLegend.SetBounds(28,410,444,22);$mapLegend.Text='金色连线：推荐走法    青色节点：你的位置';$mapLegend.Font=New-Object Drawing.Font('Microsoft YaHei UI',9);$mapLegend.ForeColor=[Drawing.ColorTranslator]::FromHtml('#94abb0');$mapLegend.Visible=$false
$close=New-Object AdvisorButton;$close.Text='×';$close.SetBounds(450,15,32,32);$close.ForeColor=[Drawing.ColorTranslator]::FromHtml('#98aeb2');$close.Font=New-Object Drawing.Font('Segoe UI',15);$close.NormalColor=$form.BackColor;$close.HoverColor=[Drawing.ColorTranslator]::FromHtml('#2a3a40');$close.Add_Click({$form.Close()})
$view=New-Object AdvisorButton;$view.Text='查看详情  →';$view.SetBounds(350,298,122,34);$view.ForeColor=[Drawing.ColorTranslator]::FromHtml('#162126');$view.Font=New-Object Drawing.Font('Microsoft YaHei UI',9,[Drawing.FontStyle]::Bold)
$view.Add_Click({Start-Process -FilePath (Join-Path $PSScriptRoot '尖塔领航.exe') -WorkingDirectory $PSScriptRoot})
$hint=New-Object Windows.Forms.Label;$hint.SetBounds(28,304,310,24);$hint.ForeColor=[Drawing.ColorTranslator]::FromHtml('#94abb0');$hint.Font=New-Object Drawing.Font('Microsoft YaHei UI',9)
$form.Controls.AddRange(@($brand,$title,$status,$track,$body,$close,$view,$hint,$mapView,$mapLegend))
[AdvisorDrawing]::DarkScroll($body)
$area=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location=New-Object Drawing.Point(($area.Right-$form.Width-18),($area.Bottom-$form.Height-18))
$script:revision=-1;$script:deadline=$null;$script:lastSoundKind=$null
$update={
 try{
  $stream=[IO.File]::Open($StatePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  try{$reader=[IO.StreamReader]::new($stream,[Text.Encoding]::UTF8);$content=$reader.ReadToEnd()}finally{$stream.Dispose()}
  $state=$content|ConvertFrom-Json
  if($state.revision -ne $script:revision){
   $script:revision=$state.revision
   $title.Text=switch($state.kind){'start'{'正在寻找更好的选择'}'success'{'下一步，已有答案。'}'error'{'暂时未能完成分析'}'cancel'{'本次分析已中断'}default{'让下一步，更清楚。'}}
   $status.Text=switch($state.kind){'start'{'●  分析中'}'success'{'●  已完成'}'error'{'●  未完成'}'cancel'{'●  已中断'}default{'●  界面预览'}}
   $accent=switch($state.kind){'success'{'#8ccbb3'}'error'{'#e39b91'}'cancel'{'#b4a49a'}default{'#d8b77a'}}
   $status.ForeColor=[Drawing.ColorTranslator]::FromHtml($accent);$progress.BackColor=$status.ForeColor
   $script:phase=$state.kind
   $body.Text=([string]$state.message) -replace "\r?\n","`r`n"
   $hasMap=$null -ne $state.map -and @($state.map.nodes).Count -gt 0
   $scale=$form.DeviceDpi/96.0
   $mapView.Visible=$hasMap;$mapLegend.Visible=$hasMap
   if($hasMap){
    $mapView.Columns=[int]$state.map.columns
    $mapView.Nodes=[AdvisorMapNode[]]@($state.map.nodes|ForEach-Object{$n=New-Object AdvisorMapNode;$n.Id=$_.id;$n.Label=$_.label;$n.Type=$_.type;$n.Col=[int]$_.col;$n.Layer=[int]$_.layer;$n.Current=[bool]$_.current;$n.Recommended=[bool]$_.recommended;$n})
    $mapView.Edges=[AdvisorMapEdge[]]@($state.map.edges|ForEach-Object{$e=New-Object AdvisorMapEdge;$e.From=$_.from;$e.To=$_.to;$e.Recommended=[bool]$_.recommended;$e})
    $form.ClientSize=[Drawing.Size]::new([int](500*$scale),[int](548*$scale));$body.SetBounds([int](28*$scale),[int](438*$scale),[int](444*$scale),[int](54*$scale));$view.Top=[int](500*$scale);$hint.Top=[int](506*$scale)
    $title.Text='往哪里走，看这两步。';$mapView.Invalidate()
   }else{$form.ClientSize=[Drawing.Size]::new([int](500*$scale),[int](354*$scale));$body.SetBounds([int](28*$scale),[int](118*$scale),[int](444*$scale),[int](155*$scale));$view.Top=[int](298*$scale);$hint.Top=[int](304*$scale)}
   $area=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea
   if(!$RenderPreview){$form.Location=[Drawing.Point]::new($area.Right-$form.Width-18,$area.Bottom-$form.Height-18)}
   $body.ScrollBars=if($body.Text.Length -gt 180 -or $body.Lines.Length -gt 5){'Vertical'}else{'None'}
   if($state.kind -in @('error','cancel')){$script:deadline=[DateTime]::Now.AddSeconds(3)}else{$script:deadline=$null}
   if(!$RenderPreview -and $state.kind -ne $script:lastSoundKind){Play-AdvisorSound $state.kind;$script:lastSoundKind=$state.kind}
  }
 }catch{}
 if($null -ne $script:deadline){$left=[Math]::Max(0,[int][Math]::Ceiling(($script:deadline-[DateTime]::Now).TotalSeconds));$hint.Text=([string]$left+' 秒后自动关闭');if($left -eq 0){$form.Close()}}
 else{$hint.Text=if($script:phase -eq 'start'){'安心继续游戏，结果将在此更新'}else{'结果会保留，关闭由你决定'}}
 if($script:phase -eq 'start'){$progress.Width=100;$progress.Left=($progress.Left+14)%344}else{$progress.Left=0;$progress.Width=444}
}
$timer=New-Object Windows.Forms.Timer;$timer.Interval=200;$timer.Add_Tick($update)
if($RenderPreview){$form.Location=[Drawing.Point]::new(-10000,-10000);$form.Show();& $update;[Windows.Forms.Application]::DoEvents();$bitmap=[Drawing.Bitmap]::new($form.Width,$form.Height);try{$form.DrawToBitmap($bitmap,[Drawing.Rectangle]::new(0,0,$form.Width,$form.Height));$bitmap.Save($RenderPreview,[Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose();$form.Dispose();$timer.Dispose();foreach($player in $script:sounds.Values){$player.Dispose()}};return}
$form.Add_Shown({& $update;[Console]::WriteLine('SHOWN');[Console]::Out.Flush();$timer.Start()})
try{[Windows.Forms.Application]::Run($form)}finally{$timer.Dispose();$form.Dispose();foreach($player in $script:sounds.Values){$player.Stop();$player.Dispose()}}

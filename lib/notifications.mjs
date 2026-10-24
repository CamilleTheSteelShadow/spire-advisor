import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function createNotifier({root,dataRoot,port,platform=process.platform,launch=spawn}){
  const file=join(dataRoot,'notifications.local.json'),folder=join(dataRoot,'work','notifications');
  let enabled=true,lastError=null,active=null,queue=Promise.resolve();
  try{enabled=JSON.parse(await readFile(file,'utf8')).enabled!==false;}catch(e){if(e.code!=='ENOENT')lastError='通知设置读取失败，已使用默认设置。';}
  const supported=platform==='win32';
  const status=()=>({supported,enabled,lastError});
  async function setEnabled(value){
    if(typeof value!=='boolean')throw new Error('通知开关必须是布尔值。');
    await writeFile(file+'.tmp',JSON.stringify({enabled:value}));await rename(file+'.tmp',file);enabled=value;
    if(!enabled)active?.child?.kill();return status();
  }
  async function writeState(record,kind,detail,map){
    const content={revision:++record.revision,kind,message:String(detail??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,3000),map:kind==='success'||kind==='test'?map??null:null};
    await writeFile(record.file+'.tmp',JSON.stringify(content),{mode:0o600});await rename(record.file+'.tmp',record.file);
  }
  function notify(kind='success',detail='',id=null,map=null){
    if(!['start','success','error','cancel','test'].includes(kind))return Promise.reject(new Error('未知通知类型。'));
    if(!detail)detail=({start:'AI 分析中，请稍候……',success:'AI 分析完成，请查看建议。',error:'分析失败，请查看助手中的原因。',cancel:'本次分析已中断。',test:'【通知测试】分析中持续显示；成功后在此窗口显示结论，点击 × 手动关闭。'})[kind];
    const job=queue.then(async()=>{
      if(!supported||!enabled)return false;
      if(kind!=='start'&&kind!=='test'&&id&&active?.id!==id)return false;
      if(kind!=='start'&&kind!=='test'&&active){
        if(active.closed)return false;
        await writeState(active,kind,detail,map);lastError=null;return true;
      }
      active?.child?.kill();await mkdir(folder,{recursive:true});
      const record={id:id??randomUUID(),file:join(folder,randomUUID()+'.json'),revision:0,child:null,closed:false};
      await writeState(record,kind,detail,map);
      active=record;
      return new Promise(resolve=>{
        let settled=false,output='',timer;
        const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);if(active===record)lastError=ok?null:'Windows 通知未能显示，请点击测试通知重试。';resolve(ok);};
        try{
          const child=launch('powershell.exe',['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',join(root,'Notify-Advisor.ps1'),'-StatePath',record.file,'-Port',String(port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
          record.child=child;
          child.stdout.on('data',chunk=>{output+=String(chunk);if(output.includes('SHOWN'))finish(true);});
          child.stderr.on('data',()=>{});
          child.on('error',()=>finish(false));
          child.on('close',()=>{record.closed=true;void rm(record.file,{force:true}).catch(()=>{});finish(false);});
          timer=setTimeout(()=>{child.kill();finish(false);},10000);
        }catch{record.closed=true;finish(false);void rm(record.file,{force:true}).catch(()=>{});}
      });
    });queue=job.catch(()=>{});return job;
  }
  return {status,setEnabled,notify,close:()=>active?.child?.kill()};
}

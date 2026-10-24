import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function loadProfiles(file){
  let disk;
  try{disk=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('本地 AI 配置读取失败，请检查配置文件。');}
  let data=disk?.version===2&&Array.isArray(disk.profiles)?disk:{version:2,activeId:'legacy',profiles:[{id:'legacy',name:disk?.model?'原有 AI 配置':'默认配置',baseUrl:'https://api.openai.com/v1',model:'',apiKey:'',jsonMode:true,...disk}]};
  if(!data.profiles.length||!data.profiles.some(p=>p.id===data.activeId))throw new Error('AI 配置列表无效。');
  let queue=Promise.resolve();
  const active=()=>data.profiles.find(p=>p.id===data.activeId);
  const publicProfile=p=>({id:p.id,name:p.name,baseUrl:p.baseUrl,model:p.model,jsonMode:p.jsonMode!==false,hasKey:!!p.apiKey});
  const publicConfig=()=>({...publicProfile(active()),activeId:data.activeId,profiles:data.profiles.map(publicProfile)});
  function update(fn){const job=queue.then(async()=>{const next=fn(structuredClone(data));await writeFile(file+'.tmp',JSON.stringify(next,null,2),{mode:0o600});await rename(file+'.tmp',file);data=next;return publicConfig();});queue=job.catch(()=>{});return job;}
  async function save(input){return update(next=>{
    const id=input.profileId===undefined?next.activeId:input.profileId;
    const previous=id?next.profiles.find(p=>p.id===id):null;
    if(id&&!previous)throw new Error('该 AI 配置不存在，请刷新后重试。');
    if(!previous&&next.profiles.length>=30)throw new Error('最多保存 30 个 AI 配置。');
    let url;try{url=new URL(String(input.baseUrl));}catch{throw new Error('接口地址格式不正确。');}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('接口地址格式不正确。');
    if(url.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('远程 AI 接口请使用 HTTPS。');
    const model=String(input.model??'').trim(),name=String(input.name??previous?.name??model).trim();
    if(!model||model.length>150)throw new Error('请输入模型名称。');
    if(!name||name.length>80)throw new Error('配置名称须为 1～80 个字符。');
    const profile={id:previous?.id??randomUUID(),name,baseUrl:url.href.replace(/\/+$/,''),model,jsonMode:input.jsonMode!==false,apiKey:input.clearKey?'':String(input.apiKey??'').trim()||previous?.apiKey||''};
    if(previous)next.profiles[next.profiles.findIndex(p=>p.id===id)]=profile;else next.profiles.push(profile);
    next.activeId=profile.id;return next;
  });}
  const activate=id=>update(next=>{if(!next.profiles.some(p=>p.id===id))throw new Error('该 AI 配置不存在。');next.activeId=id;return next;});
  return {active,publicConfig,save,activate};
}

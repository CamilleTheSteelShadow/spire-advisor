import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Controller } from './lib/controller.mjs';
import { askAI } from './lib/ai.mjs';
import { choices, capabilities, shoppingPlans, readableAdvice } from './lib/state.mjs';
import { readGameState, BridgeError } from './lib/bridge.mjs';
import { createNotifier } from './lib/notifications.mjs';
import { loadProfiles } from './lib/profiles.mjs';
import { strategyInfo } from './lib/strategy.mjs';
import {createAIErrorLogger} from './lib/ai-error-log.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.ADVISOR_PORT ?? 18765);
const origin=`http://127.0.0.1:${port}`;
const token=randomBytes(24).toString('hex');
const dataRoot=process.env.ADVISOR_DATA_DIR ?? root;
await mkdir(dataRoot,{recursive:true});
const logAIError=await createAIErrorLogger(join(dataRoot,'logs'));
const notifier=await createNotifier({root,dataRoot,port});
const configPath=join(dataRoot,'config.local.json');
const profiles=await loadProfiles(configPath);
let config=profiles.active();
const historyDir=join(dataRoot,'history');
await mkdir(historyDir,{recursive:true});
const controller=new Controller({
  notify:(kind,detail,id,map)=>notifier.notify(kind,detail,id,map),
  analyze:(state,opts)=>askAI(state,config,{...opts,logError:logAIError}),
  record:async row=>{
    await writeFile(join(historyDir,`${Date.now()}-${randomBytes(4).toString('hex')}.json`),JSON.stringify(row,null,2));
    const files=(await readdir(historyDir)).filter(x=>/^\d+-[a-f0-9]+\.json$/.test(x)).sort();
    // History is bounded in the UI; files remain available for deliberate offline review.
    historyFiles=files.slice(-100);
  },
});
let historyFiles=(await readdir(historyDir)).filter(x=>/^\d+-[a-f0-9]+\.json$/.test(x)).sort().slice(-100);
const demo=async kind=>JSON.parse(await readFile(join(root,'examples',`${kind}.json`),'utf8'));
controller.set(await demo('map'),'demo');
const GAME_POLL_MS=500; // Two matching reads confirm a new decision within about 0.5–1 second.
let stable=0, polling=false;
async function poll(){
  if(polling||controller.mode!=='live')return;
  polling=true;
  try {
    const raw=await readGameState();
    if(controller.mode!=='live')return;
    const changed=controller.set(raw,'live');controller.connected=true;stable=changed?0:stable+1;
    if(stable>=1&&controller.autoReady())void controller.recommend(true,{automatic:true});
  }catch(e){if(controller.mode==='live'){stable=0;controller.disconnect(e instanceof BridgeError?e.message:'尚未连接模组。请启动游戏、启用 STS2_MCP 模组，然后进入单人对局。');}}
  finally{polling=false;}
}
const timer=setInterval(poll,GAME_POLL_MS);
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1500000)throw new Error('请求超过 1.5 MB。');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('请求不是有效的 JSON。');}}
const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
export const server=http.createServer(async(req,res)=>{
  try{
    if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return json(res,403,{error:'仅允许本机访问。'});
    const path=new URL(req.url,origin).pathname;
    if(req.method==='POST'&&(req.headers['x-advisor-token']!==token||(req.headers.origin&&![origin,`http://localhost:${port}`].includes(req.headers.origin))))return json(res,403,{error:'请求来源无效，请刷新助手页面。'});
    if(req.method==='GET'&&staticFiles[path]){
      const [file,type]=staticFiles[path];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"});res.end(await readFile(join(root,'public',file)));return;
    }
    if(req.method==='GET'&&path==='/api/status')return json(res,200,{version:'0.1.22',pollIntervalMs:GAME_POLL_MS,strategy:strategyInfo,token,notifications:notifier.status(),mode:controller.mode,connected:controller.connected,auto:controller.auto,state:controller.state,advice:controller.advice,error:controller.error,busy:controller.busy,analysisAutomatic:controller.analysisAutomatic,viewingMap:controller.viewingMap,viewingUpgrade:controller.viewingUpgrade,viewingDeck:controller.viewingDeck,options:controller.state?choices(controller.state):[],capabilities:controller.state?capabilities(controller.state):null,plans:controller.state?.kind==='shop'?shoppingPlans(controller.state):[],config:profiles.publicConfig()});
    if(req.method==='GET'&&path==='/api/history'){
      const rows=await Promise.all(historyFiles.slice(-40).reverse().map(async name=>{try{const row=JSON.parse(await readFile(join(historyDir,name),'utf8'));return {at:row.at,kind:row.state.kind,source:row.state.source,summary:readableAdvice(row.advice,row.state).summary,engine:row.advice.engine};}catch{return null;}}));
      return json(res,200,rows.filter(Boolean));
    }
    if(req.method!=='POST')return json(res,404,{error:'页面不存在。'});
    const data=await body(req);
    if(path==='/api/shutdown'){json(res,200,{ok:true});setTimeout(shutdown,75);return;}
    if(path==='/api/notifications')return json(res,200,await notifier.setEnabled(data.enabled));
    if(path==='/api/notifications/test'){
      if(!notifier.status().supported)throw new Error('Windows 浮窗通知仅支持 Windows。');
      if(!notifier.status().enabled)throw new Error('请先开启 Windows 浮窗通知。');
      const phase=['start','success','error','cancel'].includes(data.phase)?data.phase:'test';
      const message={start:'【生命周期测试】正在分析。这个窗口会持续显示，等待测试结果。',success:'【生命周期测试完成】结果已更新到原窗口。此窗口不会自动关闭，请点击 × 关闭。',error:'【失败测试】请求失败；本提示将在 3 秒后自动关闭。',cancel:'【中断测试】请求已中断；本提示将在 3 秒后自动关闭。'}[phase];
      if(!await notifier.notify(phase,message,'test-window'))throw new Error('Windows 通知未能显示，请检查本地助手是否正常运行。');
      return json(res,200,{ok:true});
    }
    if(path==='/api/config'||path==='/api/config/activate'){
      const result=path==='/api/config'?await profiles.save(data):await profiles.activate(data.profileId);
      config=profiles.active();controller.invalidate();controller.cache.clear();
      return json(res,200,{ok:true,config:result});
    }
    if(path==='/api/mode'){
      if(!['live','demo','import'].includes(data.mode))throw new Error('未知数据来源。');
      const raw=data.mode==='demo'?await demo('map'):null;
      controller.invalidate();controller.state=null;controller.lastMap=null;controller.mode=data.mode;controller.auto=false;controller.connected=false;stable=0;
      if(raw)controller.set(raw,'demo');if(data.mode==='live')void poll();
      return json(res,200,{ok:true});
    }
    if(path==='/api/demo'){
      if(!['map','card_reward','event','shop'].includes(data.kind))throw new Error('未知演示场景。');
      controller.mode='demo';controller.connected=false;controller.auto=false;controller.set(await demo(data.kind),'demo');
      return json(res,200,{ok:true});
    }
    if(path==='/api/import'){
      controller.set(data.state,'import');controller.lastMap=null;controller.mode='import';controller.connected=false;controller.auto=false;
      return json(res,200,{ok:true});
    }
    if(path==='/api/auto'){
      if(data.enabled&&(!config.apiKey||!config.model))throw new Error('请先配置 AI 接口。');
      if(data.enabled&&controller.advice?.engine==='rules')controller.invalidate();
      controller.auto=data.enabled===true;return json(res,200,{ok:true});
    }
    if(path==='/api/analyze'){
      if(controller.state?.kind==='shop'&&(controller.state.shop?.available===false||controller.state.shop?.error||!Array.isArray(controller.state.shop?.items)))throw new Error('商店商品尚未完整读取，已暂停分析。请稍候；若持续失败，请更新商店读取补丁。');
      if(controller.state&&!controller.state.player.deck_available)throw new Error('尚未读取完整卡组。请启用 Spire Advisor Deck Reader 补丁后重启游戏；助手不会按空卡组生成建议。');
      if(!controller.supported())throw new Error('当前未处于可分析的地图、选牌、事件、商店、篝火或升级选牌界面。');
      if(data.state_id!==controller.state.id)throw new Error('局面已变化，请等待页面刷新后重新分析。');
      if(controller.mode==='live'&&!controller.connected)throw new Error('游戏连接已断开。');
      void controller.recommend(data.engine!=='rules');return json(res,202,{ok:true});
    }
    return json(res,404,{error:'接口不存在。'});
  }catch(e){json(res,400,{error:e.message});}
});
server.listen(port,'127.0.0.1',()=>console.log(`尖塔领航已启动：${origin}\n关闭此进程即可停止。密钥仅保存在 config.local.json，分享项目时请排除此文件。`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，请打开 ${origin}，或设置 ADVISOR_PORT。`:e.message);clearInterval(timer);process.exitCode=1;});
let stopping=false;
export function shutdown(){if(stopping)return;stopping=true;clearInterval(timer);controller.invalidate();notifier.close();server.close();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

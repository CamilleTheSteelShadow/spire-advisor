import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createNotifier} from '../lib/notifications.mjs';
import {Controller} from '../lib/controller.mjs';
async function dir(){const work=join(process.cwd(),'work');await mkdir(work,{recursive:true});return mkdtemp(join(work,'notification-test-'));}
function launcher(success=true){const calls=[];return {calls,launch:(...args)=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{child.killed=true;child.emit('close',0);};calls.push({args,child});setImmediate(()=>success?child.stdout.emit('data','SHOWN\r\n'):child.emit('error',new Error('not available')));return child;}};}
const stateFile=call=>call.args[1][call.args[1].indexOf('-StatePath')+1];
test('开始和完成更新同一窗口；新分析替换旧窗口，过期结束不会覆盖新结果',async()=>{
 const fake=launcher(),n=await createNotifier({root:process.cwd(),dataRoot:await dir(),port:18765,platform:'win32',launch:fake.launch});
 assert.equal(await n.notify('start','分析中','one'),true);const path=stateFile(fake.calls[0]);
 assert.equal(await n.notify('success','结论中文 $(literal)','one'),true);assert.equal(fake.calls.length,1);
 assert.equal(JSON.parse(await readFile(path,'utf8')).message,'结论中文 $(literal)');
 await n.notify('start','第二次','two');assert.equal(fake.calls.length,2);assert.equal(fake.calls[0].child.killed,true);
 assert.equal(await n.notify('cancel','旧请求','one'),false);assert.equal(JSON.parse(await readFile(stateFile(fake.calls[1]),'utf8')).kind,'start');
 const map={nodes:[{id:'0,0',current:true}],edges:[],columns:7};
 await n.notify('success','两步路线','two',map);assert.deepEqual(JSON.parse(await readFile(stateFile(fake.calls[1]),'utf8')).map,map);
 await n.notify('error','失败原因','two');const failed=JSON.parse(await readFile(stateFile(fake.calls[1]),'utf8'));assert.equal(failed.kind,'error');assert.equal(failed.map,null);
 assert.equal(fake.calls[1].args[2].windowsHide,true);assert.ok(!fake.calls[1].args[1].includes('结论中文 $(literal)'));n.close();
});
test('手动关闭不会重新弹出同一次结果，通知开关持久化且禁用后不发窗',async()=>{
 const dataRoot=await dir(),fake=launcher(),n=await createNotifier({root:process.cwd(),dataRoot,port:18765,platform:'win32',launch:fake.launch});
 await n.notify('start','开始','one');fake.calls[0].child.kill();assert.equal(await n.notify('success','结果','one'),false);
 await n.setEnabled(false);assert.equal(await n.notify('start'),false);const restored=await createNotifier({root:process.cwd(),dataRoot,port:18765,platform:'win32',launch:fake.launch});assert.equal(restored.status().enabled,false);
 await assert.rejects(()=>n.notify('injected-command'),/未知/);await assert.rejects(()=>n.setEnabled('yes'),/布尔/);n.close();
});
test('原生窗口启动失败可报告，非 Windows 不发窗',async()=>{
 const fake=launcher(false),n=await createNotifier({root:process.cwd(),dataRoot:await dir(),port:18765,platform:'win32',launch:fake.launch});assert.equal(await n.notify('start'),false);assert.match(n.status().lastError,/未能显示/);n.close();
 const other=await createNotifier({root:process.cwd(),dataRoot:await dir(),port:18765,platform:'linux',launch:()=>assert.fail('不应启动')});assert.equal(await other.notify(),false);
});
test('自动或手动 AI 以同一个请求编号发送开始、成功和中断，过期请求不发送成功',async()=>{
 const raw={state_type:'rest_site',run:{act:1,floor:7},player:{hp:40,max_hp:80,gold:10,deck:[]},rest_site:{options:[{id:'HEAL',name:'休息',index:0,is_enabled:true}]}};
 const events=[];let resolve;const c=new Controller({notify:async(...args)=>events.push(args),analyze:()=>new Promise(r=>resolve=r)});
 c.set(raw,'live');let pending=c.recommend(true,{automatic:true});await Promise.resolve();resolve({engine:'ai',summary:'建议休息',choice_ids:['rest:0']});await pending;await Promise.resolve();assert.equal(events[0][0],'start');assert.equal(events[1][0],'success');assert.equal(events[1][1],'建议休息');assert.equal(events[0][2],events[1][2]);
 c.invalidate();c.cache.clear();pending=c.recommend();await Promise.resolve();c.invalidate();resolve({engine:'ai',summary:'过期'});await pending;await Promise.resolve();assert.deepEqual(events.map(e=>e[0]),['start','success','start','cancel']);
});

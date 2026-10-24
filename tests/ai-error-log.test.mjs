import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,readFile} from 'node:fs/promises';

import {join} from 'node:path';
import {createAIErrorLogger} from '../lib/ai-error-log.mjs';
import {askAI} from '../lib/ai.mjs';
import {normalize} from '../lib/state.mjs';
await mkdir(join(process.cwd(),'work'),{recursive:true});
const state=normalize({state_type:'card_reward',player:{hp:50,max_hp:80,gold:20,deck:[]},card_reward:{cards:[{name:'牌',index:0}]}});
const config={baseUrl:'https://user:password@example.test/v1?key=private',apiKey:'test-private-key',model:'mock'};
test('接口错误写入可定位日志，不保存密钥、URL 凭据、响应正文或游戏状态',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'work','advisor-log-')),logError=await createAIErrorLogger(dir);
 const cfg={...config,baseUrl:'https://user:password@example.test/v1'};
 await assert.rejects(()=>askAI(state,cfg,{logError,fetcher:async()=>new Response('<html>test-private-key private-body</html>',{headers:{'content-type':'text/html'}})}),/网页/);
 const file=(await readdir(dir))[0],text=await readFile(join(dir,file),'utf8'),row=JSON.parse(text);
 assert.equal(row.stage,'response_decode');assert.equal(row.http_status,200);assert.equal(row.content_type,'text/html');assert.ok(row.elapsed_ms>=0);assert.equal(row.endpoint,'https://example.test');assert.ok(row.request_id);
 for(const forbidden of ['test-private-key','private-body','password','player','Authorization'])assert.ok(!text.includes(forbidden));
});
test('HTTP、超时、模型格式与合法选项错误均记录；成功请求不写错误日志',async()=>{
 const logs=[],logError=async r=>logs.push(r);
 const cfg={...config,baseUrl:'https://example.test/v1'};
 for(const fetcher of [async()=>new Response('private-body',{status:429}),async()=>{throw new DOMException('private-body','TimeoutError');},async()=>new Response(JSON.stringify({choices:[{message:{content:'not json'}}]})),async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'bad',choice_ids:['card:999'],reasons:[],risks:[]})}}]}))])await assert.rejects(()=>askAI(state,cfg,{logError,fetcher}));
 assert.deepEqual(logs.map(r=>r.error_type),['http','timeout','model_json','validation']);assert.ok(!JSON.stringify(logs).includes('private-body'));
 await askAI(state,cfg,{logError,fetcher:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'选牌',choice_ids:['card:0'],reasons:[],risks:[]})}}]}))});assert.equal(logs.length,4);
});
test('日志串行写入为完整 JSON 行，达到上限轮换且忽略额外字段',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'work','advisor-log-')),log=await createAIErrorLogger(dir,{maxBytes:160});
 await Promise.all(Array.from({length:8},(_,i)=>log({at:'now',stage:'http',message:'记录'+i,body:'secret'})));
 const files=await readdir(dir);assert.equal(files.length,2);assert.ok(files.some(n=>n.endsWith('.previous')));
 for(const file of files){const text=await readFile(join(dir,file),'utf8');for(const line of text.trim().split('\n'))assert.ok(JSON.parse(line).message);assert.ok(!text.includes('secret'));}
});

test('缺失字段、类型错误、包裹层和未知选项均有具体诊断，不记录答案正文',async()=>{
 const cfg={...config,baseUrl:'https://example.test/v1'},logs=[];
 const valid={summary:'private-answer',choice_ids:['card:0'],reasons:[],risks:[]};
 const cases=[{...valid,risks:undefined},{...valid,reasons:'private-answer'},{result:valid},{...valid,choice_ids:['card:999']}];
 for(const value of cases)await assert.rejects(()=>askAI(state,cfg,{logError:async r=>logs.push(r),fetcher:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value),reasoning_content:'private-reasoning'}}],usage:{completion_tokens:50}}))}));
 assert.match(logs[0].message,/risks 缺失/);
 assert.deepEqual(logs[0].diagnostics.required_fields.find(f=>f.field==='risks'),{field:'risks',expected:'array',actual:'missing',status:'missing'});
 assert.equal(logs[1].diagnostics.required_fields.find(f=>f.field==='reasons').actual,'string');
 assert.ok(logs[2].diagnostics.parsed_shape.fields.result.fields.summary);
 assert.deepEqual(logs[3].diagnostics.unknown_choice_ids,['card:999']);
 assert.equal(logs[0].diagnostics.usage.completion_tokens,50);
 assert.ok(!JSON.stringify(logs).includes('private-answer'));assert.ok(!JSON.stringify(logs).includes('private-reasoning'));
});

test('响应字段名和服务商错误码也脱敏，不因嵌套诊断泄露密钥',async()=>{
 const logs=[],cfg={...config,baseUrl:'https://example.test/v1'};
 await assert.rejects(()=>askAI(state,cfg,{logError:async r=>logs.push(r),fetcher:async()=>new Response(JSON.stringify({error:{code:'test-private-key',message:'private-body'},'Bearer sk-secrettest':{foo:'private-body'}}))}));
 const text=JSON.stringify(logs);assert.ok(!text.includes('test-private-key'));assert.ok(!text.includes('sk-secrettest'));assert.ok(!text.includes('private-body'));assert.equal(logs[0].diagnostics.provider_error_code,'[REDACTED]');
});

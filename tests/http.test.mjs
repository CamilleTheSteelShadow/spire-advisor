import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {once} from 'node:events';

test('本地 HTTP 服务：四类演示、请求验证、建议和密钥隔离',async()=>{
  process.env.ADVISOR_PORT='18769';
  const work=join(process.cwd(),'work');await mkdir(work,{recursive:true});
  process.env.ADVISOR_DATA_DIR=await mkdtemp(join(work,'spire-advisor-test-'));
  const {server,shutdown}=await import('../server.mjs');
  try {
    if(!server.listening)await once(server,'listening');
    const base='http://127.0.0.1:18769';
    const read=async()=>await(await fetch(base+'/api/status',{signal:AbortSignal.timeout(5000)})).json();
    let s=await read();const token=s.token;
    const post=(path,data,extra={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Advisor-Token':token,...extra},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});
    assert.equal(s.mode,'demo');assert.ok(!('apiKey'in s.config));
    assert.equal((await fetch(base+'/')).status,200);
    assert.equal((await fetch(base+'/config.local.json')).status,404);
    assert.equal((await post('/api/demo',{kind:'shop'},{Origin:'https://untrusted.example'})).status,403);
    assert.equal((await post('/api/analyze',{engine:'rules',state_id:'old-state'})).status,400);
    for(const kind of ['map','card_reward','event','shop']){
      assert.equal((await post('/api/demo',{kind})).status,200);
      s=await read();assert.equal(s.state.kind,kind);assert.ok(s.options.length);
      assert.equal((await post('/api/analyze',{engine:'rules',state_id:s.state.id})).status,202);
      s=await read();assert.equal(s.advice.engine,'rules');
    }
    const rest={state_type:'rest_site',run:{act:1,floor:7},player:{hp:52,max_hp:80,gold:38,deck:[{index:0,name:'测试牌',type:'Attack',is_upgraded:false}]},rest_site:{options:[{index:0,id:'HEAL',name:'休息',description:'回复24点生命',is_enabled:true},{index:1,id:'SMITH',name:'锻造',is_enabled:true}]}};
    assert.equal((await post('/api/import',{state:rest})).status,200);
    s=await read();assert.equal(s.state.kind,'rest_site');assert.equal(s.options.length,2);
    assert.equal((await post('/api/analyze',{engine:'rules',state_id:s.state.id})).status,202);
    s=await read();assert.equal(s.advice.engine,'rules');
    // Restore the shop used by the subsequent missing-deck check.
    assert.equal((await post('/api/demo',{kind:'shop'})).status,200);
    const saved=await post('/api/config',{baseUrl:'https://provider.example/v1',model:'test',apiKey:'local-test-key',jsonMode:true});
    assert.equal(saved.status,200,await saved.text());
    s=await read();const originalProfile=s.config.activeId;
    assert.equal(s.config.profiles.length,1);
    const extra=await post('/api/config',{profileId:'',name:'第二配置',baseUrl:'https://second.example/v1',model:'second',apiKey:'second-test-key'});
    assert.equal(extra.status,200);s=await read();assert.equal(s.config.profiles.length,2);assert.equal(s.config.model,'second');
    assert.equal((await post('/api/config/activate',{profileId:originalProfile})).status,200);
    s=await read();assert.equal(s.config.model,'test');assert.equal(s.config.hasKey,true);
    assert.ok(!JSON.stringify(s).includes('second-test-key'));
    assert.equal((await post('/api/config/activate',{profileId:'missing'})).status,400);
    const text=await(await fetch(base+'/api/status')).text();assert.ok(!text.includes('local-test-key'));assert.equal(JSON.parse(text).config.hasKey,true);
    const history=await(await fetch(base+'/api/history')).text();assert.ok(!history.includes('local-test-key'));
    s=await read();const missing=structuredClone(s.state);const importRaw={state_type:missing.kind,run:missing.run,player:missing.player,shop:missing.shop};delete importRaw.player.deck;delete importRaw.player.deck_available;
    assert.equal((await post('/api/import',{state:importRaw})).status,200);
    s=await read();assert.equal(s.state.player.deck_available,false);
    assert.equal((await post('/api/analyze',{engine:'ai',state_id:s.state.id})).status,400);
    assert.equal((await post('/api/config',{baseUrl:'http://remote.example/v1',model:'test'})).status,400);
    assert.equal((await fetch(base+'/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    const closed=once(server,'close');assert.equal((await post('/api/shutdown',{})).status,200);await closed;
  }finally{shutdown();}
});

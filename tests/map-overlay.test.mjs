import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/controller.mjs';

const rest=()=>({state_type:'rest_site',run:{act:1,floor:7,ascension:6},player:{hp:52,max_hp:80,gold:38,deck:[{name:'目标',index:0,type:'Attack',is_upgraded:false}]},rest_site:{can_proceed:false,options:[{index:0,id:'HEAL',name:'休息',is_enabled:true}]}});
const overlay=r=>({...structuredClone(r),state_type:'map',rest_site:undefined,map:{current_position:{col:1,row:6,type:'RestSite'},nodes:[],next_options:[]}});
const reply={summary:'休息',choice_ids:['rest:0'],reasons:[],risks:[],engine:'ai'};
function setup(){let resolve,reject,signal;const records=[];const c=new Controller({analyze:(_,opts)=>{signal=opts.signal;return new Promise((res,rej)=>{resolve=res;reject=rej;});},record:async r=>records.push(r)});const r=rest();c.set(r,'live');const pending=c.recommend();return {c,r,pending,records,resolve:value=>resolve(value),reject:err=>reject(err),signal:()=>signal};}
test('仅查看地图保留篝火请求、完成结果与通知所需的局面编号，返回后复用',async()=>{
  const x=setup(),id=x.c.state.id;
  x.c.set(overlay(x.r),'live');assert.equal(x.c.viewingMap,true);assert.equal(x.c.state.id,id);assert.equal(x.c.busy,true);assert.equal(x.signal().aborted,false);assert.equal(x.c.supported(),false);
  x.resolve(reply);await x.pending;
  assert.equal(x.c.advice.state_id,id);assert.equal(x.records.length,1);assert.equal(x.records[0].state.kind,'rest_site');
  x.c.set(overlay(x.r),'live');assert.equal(x.c.advice.summary,'休息');
  x.c.set(x.r,'live');assert.equal(x.c.viewingMap,false);assert.equal(x.c.supported(),true);assert.equal(x.c.advice.state_id,id);
});
test('反复打开关闭地图不中断，地图信息可供下一次分析参考',async()=>{
  const x=setup();for(let i=0;i<3;i++){x.c.set(overlay(x.r),'live');x.c.set(x.r,'live');}
  assert.equal(x.signal().aborted,false);assert.equal(x.c.lastMap.act,1);
  x.resolve(reply);await x.pending;assert.ok(x.c.advice);
});
test('真实资源变化、换楼层、换房间或卡牌选择均取消旧请求且不记录',async()=>{
  for(const change of [r=>r.player.hp++,r=>r.player.gold++,r=>r.player.deck[0].is_upgraded=true,r=>r.run.floor++,r=>r.map.current_position.col++,r=>{r.state_type='card_select';r.card_select={screen_type:'transform',cards:[]};}]){
    const x=setup();x.c.set(overlay(x.r),'live');const changed=overlay(x.r);change(changed);x.c.set(changed,'live');
    assert.equal(x.signal().aborted,true);x.resolve(reply);await x.pending;assert.equal(x.c.advice,null);assert.equal(x.records.length,0);assert.equal(x.c.viewingMap,false);
  }
});
test('返回篝火后选项已消耗会使旧请求失效',async()=>{
  const x=setup();x.c.set(overlay(x.r),'live');const done=rest();done.rest_site.can_proceed=true;done.rest_site.options[0].is_enabled=false;x.c.set(done,'live');
  assert.equal(x.signal().aborted,true);x.resolve(reply);await x.pending;assert.equal(x.c.advice,null);
});
test('没有篝火分析、演示导入、缺失位置或不同节点类型不作为查看地图处理',()=>{
  for(const source of ['live','demo','import']){const c=new Controller({analyze:async()=>reply});const r=rest();c.set(r,source);c.set(overlay(r),source);assert.equal(c.state.kind,'map');assert.equal(c.viewingMap,false);}
});
test('查看地图期间失败保留错误，不会当作请求完成或重发',async()=>{
  const x=setup();x.c.set(overlay(x.r),'live');x.reject(new Error('服务超时'));await x.pending;x.c.set(overlay(x.r),'live');
  assert.equal(x.c.state.kind,'rest_site');assert.equal(x.c.error,'服务超时');assert.equal(x.c.busy,false);assert.equal(x.records.length,0);
});

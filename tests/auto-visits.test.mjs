import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/controller.mjs';
const player=()=>({hp:40,max_hp:80,gold:100,deck:[{index:0,name:'牌',type:'Attack',is_upgraded:false}]});
const raw=kind=>({state_type:kind,run:{act:1,floor:7},player:player(),map:{current_position:{col:1,row:6,type:'Monster'},nodes:[{col:1,row:7,type:'Boss',children:[]},{col:2,row:7,type:'Boss',children:[]}],next_options:[{col:1,row:7,type:'Boss'},{col:2,row:7,type:'Boss'}]},rest_site:{can_proceed:false,options:[{index:0,id:'HEAL',name:'休息',is_enabled:true}]},shop:{items:[{index:0,name:'商品',category:'card',price:20}]},event:{options:[{index:0,name:'选择'}]},card_reward:{cards:[{index:0,name:'牌'}]}});
function controller(){const c=new Controller({analyze:async()=>({engine:'ai',summary:'建议',choice_ids:[]})});c.mode='live';c.auto=true;return c;}
test('五类决策均可自动分析；每处一次，失败和选项变化也不自动重试',async()=>{
 for(const kind of ['map','rest_site','shop','event','card_reward']){const c=controller(),r=raw(kind);c.set(r,'live');assert.equal(!!c.autoReady(),true);await c.recommend(true,{automatic:true});assert.equal(!!c.autoReady(),false);r.player.gold-=20;c.set(r,'live');assert.equal(!!c.autoReady(),false);r.run.floor++;c.set(r,'live');assert.equal(!!c.autoReady(),true);}
 for(const kind of ['card_select','overlay']){const c=controller();c.set(raw(kind),'live');assert.equal(!!c.autoReady(),false);}
 const c=controller();c.analyze=async()=>{throw Error('失败');};c.set(raw('shop'),'live');await c.recommend(true,{automatic:true});assert.equal(!!c.autoReady(),false);
});
test('地图打开卡组保持请求，关闭后不重新自动分析',async()=>{
 const c=controller(),r=raw('map');let resolve,signal;c.analyze=(_,o)=>{signal=o.signal;return new Promise(res=>resolve=res);};c.set(r,'live');const pending=c.recommend(true,{automatic:true});
 c.set({...r,state_type:'overlay',overlay:{screen_type:'NDeckViewScreen'}},'live');assert.equal(c.viewingDeck,true);assert.equal(signal.aborted,false);assert.equal(!!c.autoReady(),false);
 c.set(r,'live');assert.equal(c.viewingDeck,false);assert.equal(signal.aborted,false);resolve({engine:'ai',summary:'路线',choice_ids:[]});await pending;assert.equal(!!c.autoReady(),false);
});
test('篝火点锻造保持原请求；真正升级后失效但不会自动发第二次请求',async()=>{
 const c=controller(),r=raw('rest_site');let resolve,signal;c.analyze=(_,o)=>{signal=o.signal;return new Promise(res=>resolve=res);};c.set(r,'live');const pending=c.recommend(true,{automatic:true});
 c.set({...r,state_type:'card_select',card_select:{screen_type:'upgrade',cards:r.player.deck}},'live');assert.equal(c.viewingUpgrade,true);assert.equal(signal.aborted,false);assert.equal(!!c.autoReady(),false);
 const done=structuredClone(r);done.player.deck[0].is_upgraded=true;done.rest_site.can_proceed=true;c.set(done,'live');assert.equal(signal.aborted,true);resolve({engine:'ai',summary:'旧',choice_ids:[]});await pending;assert.equal(c.advice,null);assert.equal(!!c.autoReady(),false);
});
test('新奖励或事件新选项触发一次，查看卡组和原样返回不重发',async()=>{
 for(const kind of ['card_reward','event']){
  const c=controller(),r=raw(kind);c.set(r,'live');await c.recommend(true,{automatic:true});
  c.set({...r,state_type:'overlay',overlay:{screen_type:'NDeckViewScreen'}},'live');assert.equal(c.viewingDeck,true);assert.equal(!!c.autoReady(),false);
  c.set(r,'live');assert.equal(!!c.autoReady(),false);
  if(kind==='card_reward')r.card_reward.cards[0].name='新奖励';else r.event.options[0].name='下一阶段选项';
  c.set(r,'live');assert.equal(!!c.autoReady(),true);await c.recommend(true,{automatic:true});assert.equal(!!c.autoReady(),false);
 }
});
test('下一站只有一个节点不自动分析，即使后续存在分叉；重复节点不计作岔路',async()=>{
 const c=controller(),r=raw('map');let calls=0;c.analyze=async()=>{calls++;return {engine:'ai',summary:'路线'};};
 r.map.next_options=[{col:1,row:7,type:'Monster'}];r.map.nodes[0].children=[{col:1,row:8},{col:2,row:8}];c.set(r,'live');
 assert.equal(!!c.autoReady(),false);await c.recommend(true,{automatic:true});assert.equal(calls,0);
 r.map.next_options.push({...r.map.next_options[0]});c.set(r,'live');assert.equal(!!c.autoReady(),false);
 r.map.next_options.push({col:2,row:7,type:'Boss'});c.set(r,'live');assert.equal(!!c.autoReady(),true);
 await c.recommend(true,{automatic:true});assert.equal(calls,1);
});

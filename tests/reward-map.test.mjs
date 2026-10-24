import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/controller.mjs';
const reward=()=>({state_type:'card_reward',run:{act:1,floor:5},player:{hp:50,max_hp:80,gold:40,deck:[]},card_reward:{cards:[{name:'候选',index:0}],can_skip:true}});
const map=(r,pending=true)=>({...structuredClone(r),state_type:'map',card_reward:undefined,room_context:{available:true,is_event_room:false,reward_state_available:true,card_reward_pending:pending},map:{current_position:{col:1,row:4,type:'Monster'},nodes:[{col:1,row:5,type:'Boss',children:[]},{col:2,row:5,type:'Boss',children:[]}],next_options:[{col:1,row:5},{col:2,row:5}]}});
test('奖励选牌查看地图保留请求，反复打开关闭、完成后查看也不重发',async()=>{
 let resolve,signal,calls=0;const events=[],r=reward(),c=new Controller({analyze:(_,opts)=>{calls++;signal=opts.signal;return new Promise(r=>resolve=r);},notify:async(...e)=>events.push(e)});c.auto=true;c.set(r,'live');
 const job=c.recommend(true,{automatic:true});
 for(let i=0;i<3;i++){assert.equal(c.set(map(r),'live'),false);assert.equal(c.state.kind,'card_reward');assert.equal(c.viewingMap,true);assert.equal(signal.aborted,false);assert.equal(!!c.autoReady(),false);c.set(r,'live');assert.equal(c.viewingMap,false);}
 c.set(map(r),'live');resolve({engine:'ai',summary:'选择候选',choice_ids:['card:0']});await job;await Promise.resolve();assert.equal(calls,1);assert.ok(!events.some(e=>e[0]==='cancel'));assert.equal(c.advice.summary,'选择候选');c.set(r,'live');assert.equal(!!c.autoReady(),false);
});
test('跳过后即使卡组不变也能规划；真正选牌、资源变化和换层使旧分析失效',async()=>{
 const r=reward(),c=new Controller({analyze:async()=>({engine:'ai',summary:'候选',choice_ids:['card:0']})});c.auto=true;c.set(r,'live');await c.recommend();c.set(map(r),'live');assert.equal(c.state.kind,'card_reward');
 c.set(map(r,false),'live');assert.equal(c.state.kind,'map');assert.equal(c.viewingMap,false);assert.equal(!!c.autoReady(),true);
 c.set(r,'live');const chosen=map(r,false);chosen.player.deck.push({name:'候选'});c.set(chosen,'live');assert.equal(c.state.kind,'map');assert.equal(c.advice,null);
 c.set(r,'live');const moved=map(r);moved.run.floor++;c.set(moved,'live');assert.equal(c.viewingMap,false);
});
test('启动时已经在奖励地图预览、或完成状态读不到，都不会误发路线请求',()=>{
 const r=reward();for(const available of [true,false]){const c=new Controller({analyze:async()=>{}});c.auto=true;const m=map(r);m.room_context.reward_state_available=available;c.set(m,'live');assert.equal(!!c.autoReady(),false);}
 const c=new Controller({analyze:async()=>{}});c.auto=true;c.set(r,'live');c.set(map(r),'live');c.set(r,'live');assert.equal(!!c.autoReady(),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/controller.mjs';
const event=()=>({state_type:'event',run:{act:1,floor:5},player:{hp:40,max_hp:80,gold:100,deck:[]},event:{event_id:'test',options:[{index:0,title:'接受',is_proceed:false},{index:1,title:'离开',is_proceed:true}]},room_context:{available:true,is_event_room:true,is_finished:false}});
const map=(r,finished=false,fork=true)=>({...structuredClone(r),state_type:'map',event:undefined,room_context:{available:true,is_event_room:true,is_finished:finished},map:{current_position:{col:1,row:4,type:'Unknown'},nodes:[{col:1,row:5,type:'Boss',children:[]},{col:2,row:5,type:'Boss',children:[]}],next_options:fork?[{col:1,row:5},{col:2,row:5}]:[{col:1,row:5}]}});
function setup(analyze=async()=>({engine:'ai',summary:'接受',choice_ids:['event:0']})){const c=new Controller({analyze});c.mode='live';c.auto=true;return c;}
test('事件中查看有岔路的地图保留原分析，不取消、不发新请求',async()=>{
 let resolve,signal,calls=0;const c=setup((_,opts)=>{calls++;signal=opts.signal;return new Promise(r=>resolve=r);}),r=event();c.set(r,'live');const pending=c.recommend(true,{automatic:true});
 c.set(map(r),'live');assert.equal(c.state.kind,'event');assert.equal(c.viewingMap,true);assert.equal(signal.aborted,false);assert.equal(!!c.autoReady(),false);await c.recommend(true,{automatic:true});assert.equal(calls,1);
 resolve({engine:'ai',summary:'接受',choice_ids:['event:0']});await pending;c.set(map(r),'live');assert.equal(!!c.autoReady(),false);c.set(r,'live');assert.equal(!!c.autoReady(),false);
});
test('尚未开始事件分析时打开地图也不触发路线分析，返回后可分析事件',()=>{
 const c=setup(),r=event();c.set(r,'live');c.set(map(r),'live');assert.equal(!!c.autoReady(),false);c.set(r,'live');assert.equal(!!c.autoReady(),true);
});
test('选完后直接开地图，无需观察到中间界面；仅有岔路才规划',async()=>{
 for(const fork of [true,false]){const c=setup(),r=event();c.set(r,'live');c.set(map(r),'live');const completed=map(r,true,fork);completed.player.gold+=10;c.set(completed,'live');assert.equal(c.state.kind,'map');assert.equal(c.viewingMap,false);assert.equal(!!c.autoReady(),fork);if(fork){await c.recommend(true,{automatic:true});assert.equal(!!c.autoReady(),false);}}
});
test('助手启动在事件地图中、标记缺失或事件多阶段尚未结束时，不误触发路线',()=>{
 const r=event();for(const context of [{available:true,is_event_room:true,is_finished:false},{available:false}]){const c=setup(),raw=map(r);raw.room_context=context;c.set(raw,'live');assert.equal(!!c.autoReady(),false);}
 const c=setup();c.set(r,'live');const partial=map(r);partial.player.gold-=10;c.set(partial,'live');assert.equal(!!c.autoReady(),false);
});
test('只剩离开按钮不再自动分析事件，旧模组可按已观察到的完成页面回到路线',()=>{
 const c=setup(),r=event();delete r.room_context;r.event.options=[{index:0,title:'离开',is_proceed:true}];c.set(r,'live');assert.equal(!!c.autoReady(),false);const finished=map(r,true);delete finished.room_context;c.set(finished,'live');assert.equal(!!c.autoReady(),true);
});

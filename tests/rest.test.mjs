import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,choices,validateAdvice} from '../lib/state.mjs';
import {Controller} from '../lib/controller.mjs';
import {askAI} from '../lib/ai.mjs';

const raw=()=>({state_type:'rest_site',run:{act:1,floor:7},player:{hp:52,max_hp:80,gold:38,deck:[
  {index:0,id:'X',name:'同名牌',type:'Attack',is_upgraded:false,description:'造成伤害。'},
  {index:1,id:'X',name:'同名牌',type:'Attack',is_upgraded:false},
  {index:2,name:'已升级',type:'Skill',is_upgraded:true},
  {index:3,name:'不可升级',type:'Skill',is_upgraded:false,can_upgrade:false},
  {index:4,name:'诅咒',type:'Curse',is_upgraded:false}
]},rest_site:{options:[{index:0,id:'HEAL',name:'休息',description:'回复24点生命',is_enabled:true},{index:1,id:'SMITH',name:'锻造',is_enabled:true},{index:2,id:'OTHER',name:'禁用',is_enabled:false}]}});
const advice=ids=>({summary:'建议',choice_ids:ids,reasons:[],risks:[],confidence:'low'});
test('篝火保留实际治疗描述，目标精确到重复卡牌位置，排除禁用操作和不可升级牌',()=>{
  const s=normalize(raw()),opts=choices(s);
  assert.equal(s.rest_site.options[0].description,'回复24点生命');
  assert.deepEqual(opts.map(o=>o.id),['rest:0','rest:1:card:0','rest:1:card:1']);
  assert.equal(opts[1].data.eligibility_verified,false);
  assert.match(opts[1].description,/不要推测/);
  assert.doesNotThrow(()=>validateAdvice(advice(['rest:1:card:1']),s));
  assert.throws(()=>validateAdvice(advice(['rest:1:card:2']),s));
  assert.throws(()=>validateAdvice(advice(['rest:0','rest:1:card:0']),s));
  assert.throws(()=>validateAdvice(advice([]),s));
});
test('篝火选项变化会使已有建议失效，无可用操作时不分析',()=>{
  const c=new Controller({analyze:async()=>advice(['rest:0'])});
  const r=raw();c.set(r,'live');assert.equal(c.supported(),true);const id=c.state.id;
  r.rest_site.options.forEach(o=>o.is_enabled=false);c.set(r,'live');
  assert.notEqual(c.state.id,id);assert.equal(c.supported(),false);
  r.player.max_hp=0;assert.throws(()=>normalize(r));
});
test('升级效果包含实际前后描述和费用；可多次升级的已升级牌保留',()=>{
  const r=raw(),card=r.player.deck[2];card.can_upgrade=true;card.cost='2';card.description='原效果';card.upgrade_preview_available=true;card.upgrade_preview={cost:'1',description:'新效果',keywords:['保留']};
  const s=normalize(r),option=choices(s).find(o=>o.id==='rest:1:card:2');
  assert.ok(option);assert.match(option.description,/费用 2.*原效果/);assert.match(option.description,/费用 1.*新效果/);
  assert.equal(option.data.eligibility_verified,true);assert.deepEqual(option.data.card.upgrade_preview.keywords,['保留']);
  const previous=s.id;card.upgrade_preview.description='变化效果';assert.notEqual(normalize(r).id,previous);
  card.upgrade_preview_available=false;const unavailable=choices(normalize(r)).find(o=>o.id==='rest:1:card:2');
  assert.match(unavailable.description,/尚未读到/);assert.ok(!unavailable.description.includes('变化效果'));
});
test('升级界面只使用当前界面的候选位置，其他选牌或确认预览不推荐',()=>{
  const r=raw();r.state_type='card_select';r.card_select={screen_type:'upgrade',cards:[{index:6,name:'目标'}]};
  assert.deepEqual(choices(normalize(r)).map(o=>o.id),['upgrade:6']);
  r.card_select.preview_showing=true;assert.deepEqual(choices(normalize(r)),[]);
  r.card_select.preview_showing=false;r.card_select.screen_type='transform';assert.deepEqual(choices(normalize(r)),[]);
});
test('AI 收到篝火事实和历史路线，输出目标接受验证，不调用实际 API',async()=>{
  let input;
  const s=normalize(raw());
  const result=await askAI(s,{baseUrl:'https://provider.example/v1',model:'test',apiKey:'test-only'},{historyMap:{act:1,map:{nodes:[]}},fetcher:async(url,opts)=>{
    input=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(advice(['rest:1:card:0']))}}]}));
  }});
  const data=JSON.parse(input.messages[1].content);
  assert.equal(data.state.rest_site.options[0].description,'回复24点生命');
  assert.equal(data.history_map.act,1);assert.match(input.messages[0].content,/不能.*编造升级数值/);
  assert.equal(result.choice_ids[0],'rest:1:card:0');
});

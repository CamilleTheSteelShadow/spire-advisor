import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,choices,cardSelection,validateAdvice,notificationConclusion} from '../lib/state.mjs';
import {Controller} from '../lib/controller.mjs';
import {askAI} from '../lib/ai.mjs';
const raw=()=>({state_type:'card_select',run:{act:1,floor:5},player:{hp:60,max_hp:80,gold:50,deck:[]},card_select:{screen_type:'simple_select',prompt:'选择2张普通牌加入到你的牌组。',preview_showing:false,can_confirm:false,cards:Array.from({length:5},(_,i)=>({id:`CARD_${i}`,name:`卡牌${i+1}`,index:i,cost:'1',description:'获得格挡',type:'Skill'}))}});
const advice={summary:'选择卡牌1与卡牌3',choice_ids:['select:0','select:2'],reasons:['补足防御'],risks:[],confidence:'medium'};
test('事件 5 选 2 按界面要求校验两张不同候选，不误当升级或单选',()=>{
 const s=normalize(raw());assert.equal(cardSelection(s).min,2);assert.equal(choices(s).length,5);
 assert.deepEqual(validateAdvice(advice,s).choice_ids,advice.choice_ids);
 for(const ids of [['select:0'],['select:0','select:1','select:2'],['select:0','select:0'],['select:0','select:99']])assert.throws(()=>validateAdvice({...advice,choice_ids:ids},s));
 assert.match(notificationConclusion(advice,s),/加入牌组：卡牌1（界面第 1 张） ＋ 卡牌3（界面第 3 张）/);
 for(const prompt of ['选择2张牌消耗。','选择至多2张普通牌加入你的牌组。','选择9张普通牌加入你的牌组。','选择卡牌。']){const r=raw();r.card_select.prompt=prompt;assert.equal(cardSelection(normalize(r)),null);assert.equal(choices(normalize(r)).length,0);}
});
test('同一批多选候选只自动分析一次，点击卡牌、确认按钮变化及查看卡组不重复请求',async()=>{
 let resolve,calls=0;const c=new Controller({analyze:()=>{calls++;return new Promise(r=>resolve=r);}});c.auto=true;
 const r=raw();c.set(r,'live');assert.equal(c.autoReady(),true);const job=c.recommend(true,{automatic:true});
 const clicked=structuredClone(r);clicked.card_select.can_confirm=true;clicked.card_select.cards[0].is_selected=true;
 assert.equal(c.set(clicked,'live'),false);assert.equal(c.busy,true);assert.equal(c.autoReady(),false);
 c.set({...r,state_type:'overlay',overlay:{screen_type:'deck'}},'live');assert.equal(c.viewingDeck,true);assert.equal(c.busy,true);
 c.set(r,'live');resolve({...advice,engine:'ai'});await job;assert.equal(c.autoReady(),false);assert.equal(calls,1);
 const next=raw();next.card_select.cards[0].id='NEW_OFFER';c.set(next,'live');assert.equal(c.autoReady(),true);
});
test('AI 请求携带实机多选数量，接受完整两张组合，不调用实际服务',async()=>{
 const s=normalize(raw());let input;
 const result=await askAI(s,{baseUrl:'https://example.test/v1',model:'mock',apiKey:'test-only'},{fetcher:async(_,opts)=>{input=JSON.parse(JSON.parse(opts.body).messages[1].content);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(advice)}}]}));}});
 assert.equal(input.selection_constraints.action,'add_to_deck');assert.equal(input.selection_constraints.min,2);assert.equal(input.selection_constraints.max,2);
 assert.deepEqual(result.choice_ids,advice.choice_ids);
});

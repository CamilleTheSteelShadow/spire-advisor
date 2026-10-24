import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalize,choices} from '../lib/state.mjs';
import {askAI} from '../lib/ai.mjs';
import {decisionReference,strategyInfo} from '../lib/strategy.mjs';
const example=async kind=>normalize(JSON.parse(await readFile(new URL(`../examples/${kind}.json`,import.meta.url),'utf8')));
const response=ids=>({summary:'测试建议',choice_ids:ids,reasons:['短板与准备度：测试'],risks:[],confidence:'low'});
const config={baseUrl:'https://provider.example/v1',model:'test-model',apiKey:'test-only',jsonMode:true};

test('固定上游提交和原始快照有校验记录，可追溯到用户指定仓库',async()=>{
 const source=JSON.parse((await readFile(new URL('../strategy/SOURCE.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 assert.equal(source.repository,strategyInfo.repository);assert.equal(source.commit,strategyInfo.commit);assert.ok(source.files.length>=8);
 for(const file of source.files){const bytes=await readFile(new URL('../strategy/upstream/'+file.path.replaceAll('\\','/'),import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(),file.sha256);}
});
test('按当前场景加载策略，限制提示长度，保留事实优先和经验分值的边界',async()=>{
 for(const kind of ['map','card_reward','event','shop']){
  const s=await example(kind),reference=decisionReference(s,choices(s));
  assert.equal(reference.commit,strategyInfo.commit);assert.ok(reference.scene_rules.length);assert.ok(reference.references.includes('references/deck_strength_evaluation.md'));assert.ok(JSON.stringify(reference).length<6000);assert.equal(reference.priorities[0],'当前实机事实与合法选项');assert.match(reference.limits.join(' '),/经验权重/);
 }
 const card=await example('card_reward');assert.equal(decisionReference(card,choices(card)).skip_is_legal,true);card.card_reward.can_skip=false;assert.equal(decisionReference(card,choices(card)).skip_is_legal,false);
});
test('兼容 API 的实际请求包含参考框架，返回保留来源，输出仍由合法选项验证',async()=>{
 const s=await example('card_reward');let request;
 const result=await askAI(s,config,{fetcher:async(_,opts)=>{request=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response(['card:0']))}}]}));}});
 const payload=JSON.parse(request.messages[1].content);
 assert.equal(payload.decision_reference.repository,strategyInfo.repository);assert.match(payload.decision_reference.scene_rules.join(' '),/跳过/);assert.match(request.messages[0].content,/JSON 输出规则/);assert.equal(result.strategy.commit,strategyInfo.commit);
 s.card_reward.can_skip=false;
 await assert.rejects(()=>askAI(s,config,{fetcher:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response(['skip']))}}]}))}),/不存在/);
});
test('篝火参考使用实机升级变化，并不要求固定血量阈值或默认升级痛击',()=>{
 const s=normalize({state_type:'rest_site',run:{act:1,floor:7},player:{hp:50,max_hp:80,gold:10,deck:[]},rest_site:{options:[{index:0,id:'HEAL',name:'休息',is_enabled:true}]}});
 const reference=decisionReference(s,choices(s));assert.match(reference.scene_rules.join(' '),/升级前后/);assert.match(reference.scene_rules.join(' '),/不能机械执行/);assert.match(reference.scene_rules.join(' '),/不要默认升级痛击/);
});

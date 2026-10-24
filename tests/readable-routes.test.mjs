import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalize,choices,validateAdvice,readableAdvice,notificationConclusion} from '../lib/state.mjs';
import {Controller} from '../lib/controller.mjs';
import {mapNotification} from '../lib/map-notification.mjs';

test('路线内部编号转换成与地图一致的方案和中文节点，保留合法选择 ID',async()=>{
  const state=normalize(JSON.parse(await readFile(new URL('../examples/map.json',import.meta.url),'utf8')));
  const opts=choices(state),first=opts[0],other=opts.at(-1);
  const input={summary:`选择 ${first.id}`,choice_ids:[first.id],reasons:[`优于 ${other.id}；${first.id} 更合适`],risks:['route:99:99 已失效'],confidence:'medium'};
  const out=validateAdvice(input,state,opts);
  assert.deepEqual(out.choice_ids,[first.id]);
  assert.match(out.summary,/方案 1（/);
  assert.match(out.summary,/普通战斗|精英|营火|商店|未知|首领/);
  assert.ok(out.reasons[0].includes(`方案 ${opts.length}（`));
  assert.ok(!JSON.stringify([out.summary,out.reasons,out.risks]).includes('route:'));
  assert.match(out.risks[0],/已不在当前候选中/);
  assert.equal(input.summary,`选择 ${first.id}`);
  assert.deepEqual(readableAdvice(out,state,opts),out);
  assert.throws(()=>validateAdvice({...input,choice_ids:['route:99:99']},state,opts),/不存在/);
});

test('地图通知按实际选中路径展示方向、左右顺序和列位置，不能只依赖方案序号',async()=>{
  const raw=JSON.parse(await readFile(new URL('../examples/map.json',import.meta.url),'utf8'));
  raw.map.next_options.reverse();
  const state=normalize(raw),opts=choices(state),right=opts.find(o=>o.path[0].col===3);
  const advice={summary:'推荐方案 2',choice_ids:[right.id],engine:'ai'};
  const message=notificationConclusion(advice,state,opts);
  assert.match(message,/下一站：向右走，精英/);
  assert.match(message,/可选下一站从左数第 2 个；地图从左数第 4 列/);
  assert.match(message,/后续路线：/);
  const events=[],c=new Controller({analyze:async()=>advice,notify:async(...args)=>events.push(args)});
  c.set(raw,'live');await c.recommend();await Promise.resolve();
  assert.equal(events.find(e=>e[0]==='success')[1],mapNotification(state,advice).message);
  assert.deepEqual(events.find(e=>e[0]==='success')[3],mapNotification(state,advice).map);
  assert.equal(notificationConclusion({summary:'休息'}, {kind:'rest_site'}),'休息');
  assert.match(notificationConclusion({summary:'方案已失效',choice_ids:['missing']},state),/未能定位/);
});

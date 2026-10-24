import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalize,choices,coord} from '../lib/state.mjs';
import {mapNotification} from '../lib/map-notification.mjs';
const sample=async()=>normalize(JSON.parse(await readFile(new URL('../examples/map.json',import.meta.url),'utf8')));
test('地图浮窗只展示当前位置和后两层，按实际坐标保留左右位置并高亮合法走法',async()=>{
 const s=await sample(),route=choices(s).find(o=>o.path[0].col===3),view=mapNotification(s,{choice_ids:[route.id],summary:'非常长的理由'.repeat(100)});
 assert.equal(view.map.nodes.filter(n=>n.current).length,1);assert.equal(view.map.nodes.length,5);assert.equal(view.map.nodes.filter(n=>n.recommended).length,3);
 assert.equal(view.map.columns,7);assert.ok(view.map.nodes.every(n=>n.layer>=0&&n.layer<=2));assert.equal(view.map.edges.filter(e=>e.recommended).length,2);
 assert.match(view.message,/下一站：精英 · 从左数第 4 列\n再下一站：战斗/);assert.ok(view.message.length<100);
 assert.ok(!view.message.includes('非常长'));assert.ok(!view.map.nodes.some(n=>n.label==='首领'));
 for(const edge of view.map.edges.filter(e=>e.recommended)){assert.ok(view.map.nodes.some(n=>n.id===edge.from&&n.recommended));assert.ok(view.map.nodes.some(n=>n.id===edge.to&&n.recommended));}
});
test('缺失当前位置或实际连线时回退文字，不编造小地图；临近终点仅画剩余节点',async()=>{
 const s=await sample(),route=choices(s)[0];
 assert.equal(mapNotification({...s,map:{...s.map,current_position:null}},{choice_ids:[route.id]}),null);
 assert.equal(mapNotification(s,{choice_ids:['missing']}),null);
 const end={...s,map:{current_position:{col:2,row:10},next_options:[{col:2,row:11}],nodes:s.map.nodes.filter(n=>n.row>=10)}};
 const endRoute=choices(end)[0],view=mapNotification(end,{choice_ids:[endRoute.id]});assert.ok(view);assert.equal(view.map.nodes.filter(n=>n.layer>0).length,1);assert.equal(view.map.edges.length,1);
 assert.equal(mapNotification({kind:'shop'},{}),null);
});

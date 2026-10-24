import test from 'node:test';
import assert from 'node:assert/strict';
import {gameText} from '../lib/game-text.mjs';
import {normalize,choices} from '../lib/state.mjs';
import {askAI} from '../lib/ai.mjs';
const path='res://images/packed/sprite_fonts/ironclad_energy_icon.png';
test('能量图标按实际个数转换，覆盖卡牌、药水、遗物与升级预览，原数据不变',()=>{
 for(const icon of [path,'[ironclad_energy_icon.png]',`[${path}]`,`[img]${path}[/img]`])assert.equal(gameText(`获得${icon}${icon}。`),'获得2 点能量。');
 assert.equal(gameText('获得2点格挡。res://unknown.png'),'获得2点格挡。res://unknown.png');
 const raw={state_type:'card_reward',player:{hp:50,max_hp:80,gold:30,deck:[{description:path,upgrade_preview:{description:path+path}}],relics:[{description:path}],potions:[{description:path+path}]},card_reward:{cards:[{name:'放血',description:`获得${path}${path}。`}]}};
 const s=normalize(raw);assert.equal(s.player.deck[0].upgrade_preview.description,'2 点能量');assert.equal(s.player.relics[0].description,'1 点能量');assert.equal(s.player.potions[0].description,'2 点能量');assert.equal(choices(s)[0].description,'获得2 点能量。');assert.equal(raw.player.deck[0].description,path);
});
test('AI 的完整输入与历史地图转换图标，明确请求非流式数据',async()=>{
 const s=normalize({state_type:'card_reward',player:{hp:40,max_hp:80,gold:20,deck:[]},card_reward:{cards:[{name:'卡牌',description:path+path}]}});
 await askAI(s,{baseUrl:'https://example.test/v1',apiKey:'test-only',model:'mock'},{historyMap:{note:path},fetcher:async(_,opts)=>{
  const body=JSON.parse(opts.body);assert.equal(body.stream,false);assert.ok(!body.messages[1].content.includes('ironclad_energy_icon'));assert.match(body.messages[1].content,/2 点能量/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'选这张牌',choice_ids:['card:0'],reasons:[],risks:[]})}}]}));
 }});
});

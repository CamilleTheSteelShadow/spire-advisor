import { createHash } from 'node:crypto';
import {readableGameData} from './game-text.mjs';
import {adviceFields} from './ai-diagnostics.mjs';

export const label = x => String(x?.name ?? x?.card_name ?? x?.relic_name ?? x?.potion_name ?? x?.title ?? (x?.category === 'card_removal' ? '删除一张牌' : x?.id ?? '未命名'));
export const describe = x => String(x?.description ?? x?.card_description ?? x?.relic_description ?? x?.potion_description ?? '');
const list = x => Array.isArray(x) ? x : [];
const number = (x, fallback = 0) => Number.isFinite(Number(x)) ? Number(x) : fallback;
export const coord = x => Array.isArray(x) ? `${x[0]},${x[1]}` : `${x.col},${x.row}`;
export const fingerprint = x => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);
export const shopReady = state => state.kind!=='shop'||(state.shop?.available!==false&&!state.shop?.error&&Array.isArray(state.shop?.items));

export function upgradeDetails(card) {
  const after=card?.upgrade_preview;
  if(card?.upgrade_preview_available!==true||!after)return '升级效果尚未读到，请以游戏预览为准；不要推测具体升级数值。';
  return `升级前（费用 ${card.cost??card.card_cost??'未知'}）：${describe(card)}\n升级后（费用 ${after.cost??after.card_cost??'未知'}）：${describe(after)}`;
}

// This adapter consumes the read-only STS2MCP GET /api/v1/singleplayer response.
export function normalize(raw, source = 'import') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.state_type !== 'string') throw new Error('局面 JSON 必须包含 state_type。请导入 STS2MCP 状态或示例文件。');
  raw=readableGameData(raw);
  const p = raw.player ?? {};
  const state = {
    source, kind: raw.state_type, run: raw.run ?? {},
    player: { ...p, hp: number(p.hp), max_hp: number(p.max_hp), gold: number(p.gold), deck: list(p.deck), deck_available: p.deck_available !== false && Array.isArray(p.deck), relics: list(p.relics), potions: list(p.potions), max_potion_slots: number(p.max_potion_slots, 3) },
    map: raw.map ?? null, event: raw.event ?? null, shop: raw.shop ?? null, card_reward: raw.card_reward ?? null,
    card_select: raw.card_select ?? null, rest_site: raw.rest_site ?? null, overlay:raw.overlay??null, room_context:raw.room_context??null,
  };
  if (['map', 'event', 'shop', 'card_reward', 'rest_site', 'card_select'].includes(state.kind) && (state.player.max_hp <= 0 || state.player.hp < 0 || state.player.hp > state.player.max_hp || state.player.gold < 0)) throw new Error('局面缺少有效的血量、最大血量或金币，暂不生成建议。');
  if (state.player.deck.length > 500 || list(state.map?.nodes).length > 500 || list(state.shop?.items).length > 40) throw new Error('局面数据超出支持范围。');
  state.id = fingerprint(state);
  return state;
}

export function capabilities(state) {
  const deck = state.player.deck;
  const count = re => deck.filter(c => re.test(describe(c))).length;
  return {
    deck_size: state.player.deck_available ? deck.length : null,
    attacks: deck.filter(c => /attack|攻击/i.test(c.type ?? c.card_type ?? '')).length,
    block_cards: count(/\bblock\b|格挡/i), draw_cards: count(/\bdraw\b|抽.*牌/i),
    scaling_cards: count(/strength|dexterity|focus|力量|敏捷|集中/i),
    aoe_cards: count(/all enemies|所有敌人|全体敌人/i),
    note: '关键词统计，仅用作提示；不能代表精确战力。',
  };
}

export function typeName(t = '') {
  return ({monster:'普通战斗',elite:'精英',restsite:'营火',rest:'营火',shop:'商店',merchant:'商店',unknown:'未知',questionmark:'未知',treasure:'宝箱',boss:'首领',ancient:'远古事件',unassigned:'未知'})[String(t).toLowerCase()] ?? t;
}

export function cardValue(card, state) {
  const cap = capabilities(state), text = describe(card);
  let value = 2;
  if (/block|格挡/i.test(text)) value += cap.block_cards < 4 ? 3 : 0.5;
  if (/draw|抽.*牌/i.test(text)) value += cap.draw_cards < 2 ? 2.5 : 1;
  if (/all enemies|所有敌人|全体敌人/i.test(text)) value += cap.aoe_cards === 0 ? 3 : 1;
  if (/strength|dexterity|focus|力量|敏捷|集中/i.test(text)) value += cap.scaling_cards === 0 ? 2 : 1;
  if (/attack|攻击/i.test(card.type ?? card.card_type ?? '') && cap.attacks < 7) value += 2;
  const cost = card.cost ?? card.card_cost;
  if (Number(cost) >= 3) value -= 2;
  if (cap.deck_size >= 22) value -= 2;
  return value;
}

function routeStep(node, state, hp) {
  const t = String(node.type).toLowerCase();
  const max = state.player.max_hp;
  // Deliberately conservative, uncalibrated estimates. Never shown as real battle predictions.
  if (t === 'monster') return { hp: hp - max * .10, gain: 4 };
  if (t === 'elite') return { hp: hp - max * .24, gain: 9 + Math.min(2, state.player.potions.length) };
  if (['restsite','rest'].includes(t)) return { hp: Math.min(max, hp + max * .25), gain: hp < max * .55 ? 6 : 3 };
  if (['shop','merchant'].includes(t)) return { hp, gain: Math.min(8, state.player.gold / 40) };
  if (t === 'treasure') return { hp, gain: 6 };
  if (t === 'boss') return { hp, gain: 0 };
  return { hp: hp - max * .03, gain: 2 };
}

export function routes(state) {
  const map = state.map ?? {}, nodes = new Map(list(map.nodes).map(n => [coord(n), n]));
  const results = [];
  const starts = list(map.next_options).slice(0, 12);
  for (const [startIndex, start] of starts.entries()) {
    let frontier = [{ path: [], next: coord(start), hp: state.player.hp, score: 0 }];
    let finished = [];
    for (let depth = 0; depth < 40 && frontier.length; depth++) {
      const expanded = [];
      for (const branch of frontier) {
        const node = nodes.get(branch.next) ?? (branch.path.length === 0 ? start : null);
        if (!node || branch.path.some(n => coord(n) === coord(node))) continue;
        const step = routeStep(node, state, branch.hp);
        const path = [...branch.path, {col: node.col, row: node.row, type: node.type}];
        const danger = Math.max(0, state.player.max_hp * .25 - step.hp) / state.player.max_hp * 35;
        const score = branch.score + step.gain - danger;
        const item = { path, hp: step.hp, score };
        if (!list(node.children).length || String(node.type).toLowerCase() === 'boss') finished.push(item);
        else for (const child of node.children) expanded.push({ ...item, next: coord(child) });
      }
      frontier = expanded.sort((a,b) => b.score - a.score).slice(0, 96);
      finished = finished.sort((a,b) => b.score - a.score).slice(0, 6);
    }
    const best = [...finished, ...frontier].sort((a,b) => b.score - a.score).slice(0, 3);
    best.forEach((r,i) => results.push({ id: `route:${startIndex}:${i}`, label: r.path.map(n => `${typeName(n.type)}(${n.col},${n.row})`).join(' → '), score: Math.round(r.score * 10)/10, path: r.path, estimated_hp: Math.round(r.hp), description: '路线搜索使用未校准的通用损血假设，仅用于候选排序；每个分叉保留至多三条路线。' }));
  }
  return results.map((route,i)=>({...route,display_name:`方案 ${i+1}`}));
}

export function cardSelection(state) {
  const s=state.card_select;
  if(state.kind!=='card_select'||s?.screen_type!=='simple_select')return null;
  const prompt=String(s.prompt??'').trim();
  const match=prompt.match(/^选择\s*(\d+)\s*张[^。\n]*加入(?:到)?你的牌组[。.!！]?$/u)
    ??prompt.match(/^(?:Choose|Select)\s+(\d+)\s+cards?[^.\n]*\badd\b[^.\n]*\b(?:your )?deck[.!]?$/i);
  const count=Number(match?.[1]);
  if(!Number.isInteger(count)||count<1||count>list(s.cards).length||s.preview_showing)return null;
  return {action:'add_to_deck',min:count,max:count,prompt,source:'game_ui_prompt'};
}

export function cardSelectionKey(state){
  const rule=cardSelection(state);if(!rule)return null;
  return fingerprint({rule,cards:list(state.card_select.cards).map((c,i)=>({index:c.index??i,id:c.id,name:label(c),description:describe(c),cost:c.cost,is_upgraded:c.is_upgraded}))});
}

export function choices(state) {
  if (!shopReady(state)) return [];
  if (state.kind === 'rest_site') return list(state.rest_site?.options).filter(o=>o.is_enabled===true).flatMap((o,i)=>{
    const id=`rest:${o.index??i}`;
    if(o.id!=='SMITH')return [{id,label:label(o),description:describe(o),data:o,score:0}];
    return state.player.deck.filter(c=>c.can_upgrade===true||(c.can_upgrade!==false&&c.is_upgraded===false&&/^(attack|skill|power)$/i.test(c.type??c.card_type??''))).map(c=>({id:`${id}:card:${c.index??state.player.deck.indexOf(c)}`,label:`锻造：${label(c)}（卡组第 ${(c.index??state.player.deck.indexOf(c))+1} 张）`,description:upgradeDetails(c),data:{action:o,card:c,eligibility_verified:c.can_upgrade===true},score:0}));
  });
  if (state.kind === 'card_select'&&state.card_select?.screen_type==='upgrade'&&!state.card_select.preview_showing) return list(state.card_select.cards).filter(c=>c.can_upgrade!==false).map((c,i)=>({id:`upgrade:${c.index??i}`,label:`升级：${label(c)}（界面第 ${(c.index??i)+1} 张）`,description:upgradeDetails(c),data:c,score:0}));
  if(cardSelection(state))return list(state.card_select.cards).map((c,i)=>({id:`select:${c.index??i}`,label:`${label(c)}（界面第 ${(c.index??i)+1} 张）`,description:`费用 ${c.cost??'未知'}：${describe(c)}`,data:c,score:cardValue(c,state)}));
  if (state.kind === 'map') return routes(state);
  if (state.kind === 'card_reward') return [
    ...list(state.card_reward?.cards).map((c,i) => ({id:`card:${c.index ?? i}`,label:label(c),description:describe(c),data:c,score:cardValue(c,state)})),
    ...(state.card_reward?.can_skip === true ? [{id:'skip',label:'跳过选牌',description:'不向卡组添加卡牌',score:1}] : []),
  ];
  if (state.kind === 'event') return list(state.event?.options).filter(o => !o.is_locked && !o.was_chosen && o.enabled !== false).map((o,i) => ({id:`event:${o.index ?? i}`,label:label(o),description:describe(o),data:o,score:0}));
  if (state.kind === 'shop') return list(state.shop?.items).filter(i => i.is_stocked !== false && i.can_afford !== false && Number.isInteger(i.price) && i.price >= 0 && i.price <= state.player.gold).map((x,i) => ({id:`item:${x.index ?? i}`,label:label(x),description:describe(x),price:x.price,category:x.category,data:x,score:x.category==='card' ? cardValue(x,state) : x.category==='relic' ? 5 : x.category==='potion' ? (state.player.hp/state.player.max_hp < .5 ? 4 : 2) : 3}));
  return [];
}

export function shoppingPlans(state, options = choices(state)) {
  let beam = [{ ids: [], cost: 0, score: 0, potions: 0 }];
  const slots = Math.max(0, state.player.max_potion_slots - state.player.potions.length);
  for (const item of options) {
    const more = beam.filter(p => p.cost + item.price <= state.player.gold && (item.category !== 'potion' || p.potions < slots)).map(p => ({ids:[...p.ids,item.id],cost:p.cost+item.price,score:p.score+item.score,potions:p.potions+(item.category==='potion'?1:0)}));
    beam = [...beam,...more].sort((a,b) => b.score-a.score || a.cost-b.cost).slice(0,256);
  }
  return [{ids:[],cost:0,score:0},...beam.filter(p=>p.ids.length).slice(0,12)];
}

export function readableAdvice(advice, state, options = choices(state)) {
  advice=readableGameData(advice);
  if (state.kind !== 'map') return advice;
  const names = new Map(options.map((o,i)=>[o.id,`方案 ${i+1}（${list(o.path).map(n=>typeName(n.type)).join(' → ')}）`]));
  const text = value => String(value).replace(/\broute:\d+:\d+\b/g,id=>names.get(id)??'其他路线（已不在当前候选中）');
  return {...advice,summary:text(advice.summary),reasons:list(advice.reasons).map(text),risks:list(advice.risks).map(text)};
}

export function notificationConclusion(advice, state, options = choices(state)) {
  if(cardSelection(state))return `加入牌组：${(advice.choice_ids??[]).map(id=>options.find(o=>o.id===id)?.label??'请在助手确认目标').join(' ＋ ')}\n${advice.summary}`;
  if (state.kind !== 'map') return advice.summary;
  const route=options.find(o=>o.id===advice.choice_ids?.[0]),next=route?.path?.[0];
  if (!next) return `未能定位推荐的下一站，请在助手地图中确认。\n${advice.summary}`;
  const starts=[...new Map(list(state.map?.next_options).map(n=>[coord(n),n])).values()].sort((a,b)=>a.col-b.col||a.row-b.row);
  const rank=starts.findIndex(n=>coord(n)===coord(next)),current=state.map?.current_position;
  const direction=Number.isFinite(current?.col)?next.col<current.col?'向左走':next.col>current.col?'向右走':'沿当前列走':'';
  const column=n=>Number.isFinite(n.col)?`地图从左数第 ${n.col+1} 列`:'位置未知';
  const location=rank>=0?`可选下一站从左数第 ${rank+1} 个；${column(next)}`:column(next);
  const later=route.path.slice(1).map(n=>`${typeName(n.type)}（第 ${n.col+1} 列）`).join(' → ');
  return [`下一站：${direction?direction+'，':''}${typeName(next.type)}`,location,later?`后续路线：${later}`:null,`推荐理由：${advice.summary}`].filter(Boolean).join('\n');
}

export function validateAdvice(advice, state, options = choices(state)) {
  const invalid=adviceFields(advice).filter(f=>f.status!=='ok');
  if(invalid.length)throw new Error(`AI 返回格式不完整：${invalid.map(f=>`${f.field} ${f.status==='missing'?'缺失':`类型错误（应为 ${f.expected}，实际 ${f.actual}）`}`).join('；')}。`);
  if (advice.summary.length > 3000 || [...advice.reasons,...advice.risks].some(x=>typeof x!=='string'||x.length>3000)) throw new Error('AI 返回的说明格式错误。');
  if (advice.reasons.length > 12 || advice.risks.length > 12) throw new Error('AI 说明过长。');
  if (new Set(advice.choice_ids).size !== advice.choice_ids.length) throw new Error('AI 返回了重复选项。');
  const selected = advice.choice_ids.map(id => options.find(o=>o.id===id));
  if (selected.some(x=>!x)) throw new Error('AI 推荐了当前不存在的选项。');
  const selection=cardSelection(state);
  if(selection&&selected.length!==selection.min)throw new Error(`当前选牌必须推荐 ${selection.min} 张不同的牌。`);
  if (state.kind !== 'shop' && !selection && selected.length !== 1) throw new Error('当前局面必须推荐一个选项。');
  if (state.kind === 'shop') {
    if (selected.reduce((n,x)=>n+x.price,0) > state.player.gold) throw new Error('AI 购买方案超出金币预算。');
    if (selected.filter(x=>x.category==='potion').length + state.player.potions.length > state.player.max_potion_slots) throw new Error('药水栏不足；请先在游戏中腾出栏位，再重新分析。');
  }
  return readableAdvice({summary:advice.summary,choice_ids:advice.choice_ids,reasons:advice.reasons,risks:advice.risks,confidence:['low','medium','high'].includes(advice.confidence)?advice.confidence:'low'},state,options);
}

export function heuristic(state, options = choices(state)) {
  if (!options.length && state.kind !== 'shop') return null;
  let ids;
  if (state.kind==='shop') ids=shoppingPlans(state,options)[1]?.ids ?? [];
  else if (['event','rest_site','card_select'].includes(state.kind)) return {summary:'此局面需要 AI 判断，请点击 AI 分析获取具体建议。',choice_ids:[],reasons:['已列出当前候选；篝火会比较回复需求与具体卡牌的升级价值。'],risks:['升级候选以游戏实际可选牌及升级预览为准。'],confidence:'low',engine:'rules'};
  else ids=[options.reduce((a,b)=>a.score>=b.score?a:b).id];
  return {summary:state.kind==='map'?'根据通用风险假设筛选的候选路线':state.kind==='shop'?'预算内的初步购买组合':'根据卡组关键词短板筛选的候选',choice_ids:ids,reasons:['当前是规则预览，未调用 AI。','已检查选项有效性；商店方案已检查金币和药水栏位。'],risks:[state.kind==='map'?'损血参数尚未校准，尚不能精确评估卡组、药水和遗物的战斗表现。':'关键词规则不能充分判断卡牌与遗物配合；请配置 AI 获得完整分析。'],confidence:'low',engine:'rules'};
}

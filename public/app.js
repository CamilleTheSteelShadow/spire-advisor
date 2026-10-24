const $=id=>document.getElementById(id);
let latest=null,token='',renderKey='',currentView='advisor',refreshing=false;
const kindNames={map:'地图路线',card_reward:'奖励选牌',event:'事件选项',shop:'商店购买',card_select:'卡牌选择',menu:'等待进入对局',monster:'战斗进行中',elite:'精英战斗中',boss:'首领战斗中',rewards:'请在游戏中打开奖励卡牌',rest_site:'篝火：休息或锻造',game_over:'对局已结束'};
const typeNames={monster:'普通战斗',elite:'精英',restsite:'营火',rest:'营火',shop:'商店',merchant:'商店',unknown:'未知',treasure:'宝箱',boss:'首领',ancient:'远古事件'};
const e=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const clear=n=>n.replaceChildren();
const strategyStatus=e('p','strategy-status');strategyStatus.hidden=true;
document.querySelector('.advice-panel .panel-title').after(strategyStatus);
async function post(path,data={}){
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Advisor-Token':token},body:JSON.stringify(data)});
  const result=await res.json();if(!res.ok)throw new Error(result.error??'请求失败');return result;
}
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
// Completion tracking uses state identity so cancelled or superseded requests never announce success.
class AnalysisTracker {
  previous=null;
  started=0;
  update(s,now=Date.now()) {
    const p=this.previous;
    let outcome=null;
    if(s.busy&&(!p?.busy||p.state?.id!==s.state?.id))this.started=now;
    if(p&&p.state?.id===s.state?.id&&!s.busy){
      const fresh=s.advice?.engine==='ai'&&s.advice.at!==p.advice?.at;
      if(fresh)outcome='success';
      else if(p.busy&&s.error&&!s.advice)outcome='error';
    }
    if(!s.busy)this.started=0;
    this.previous=s;
    return outcome;
  }
}
const analysisTracker=new AnalysisTracker();
const reminderControls=e('div','reminder-controls');
const desktopButton=e('button','secondary'),desktopHelp=e('span','fine');desktopButton.type='button';
const testDesktopButton=e('button','secondary','测试 Windows 通知');testDesktopButton.type='button';testDesktopButton.hidden=true;
const waitingStatus=e('p','analysis-wait');waitingStatus.id='analysisWaiting';waitingStatus.setAttribute('role','status');waitingStatus.hidden=true;
reminderControls.append(desktopButton,testDesktopButton,desktopHelp);
document.querySelector('.advice-panel .actions').after(waitingStatus,reminderControls);
function updateDesktopButton(){
  const native=latest?.notifications;
  if(native?.supported){
    desktopButton.disabled=false;desktopButton.textContent=native.enabled?'关闭 Windows 浮窗通知':'开启 Windows 浮窗通知';
    testDesktopButton.hidden=false;testDesktopButton.disabled=!native.enabled;
    desktopHelp.textContent=native.lastError??'本地助手直接弹出 Windows 浮窗，无需浏览器在前台。独占全屏若遮挡浮窗，可使用无边框窗口模式。';
    return;
  }
  desktopButton.disabled=true;desktopButton.textContent='Windows 通知需重启助手';testDesktopButton.hidden=true;desktopHelp.textContent='请使用新版本地助手，以在 Windows 中接收分析提醒。';
}
desktopButton.onclick=async()=>{try{await post('/api/notifications',{enabled:!latest.notifications.enabled});await refresh();}catch(err){toast(err.message);}};
updateDesktopButton();
testDesktopButton.onclick=async()=>{testDesktopButton.disabled=true;try{await post('/api/notifications/test');toast('Windows 测试浮窗已弹出，请查看屏幕右下角。');}catch(err){toast(err.message);}finally{updateDesktopButton();}};
function updateWaiting(){
  const busy=analysisTracker.previous?.busy;
  waitingStatus.hidden=!busy;
  if(busy){const seconds=Math.max(0,Math.floor((Date.now()-analysisTracker.started)/1000));waitingStatus.textContent=`AI 正在分析 · 已等待 ${seconds} 秒${seconds>=30?' · 仍在等待服务响应，完成后会提醒':''}`;}
  document.title=busy?'分析中… · 尖塔领航':'尖塔领航 · AI 决策助手';
}
setInterval(updateWaiting,1000);
const name=x=>x.name??x.card_name??x.relic_name??x.potion_name??x.title??'未命名';
const desc=x=>x.description??x.card_description??x.relic_description??x.potion_description??'';
function upgradeComparison(card){
  if(card?.upgrade_preview_available!==true||!card.upgrade_preview)return null;
  const wrap=e('div','upgrade-comparison');
  for(const [title,value] of [['升级前',card],['升级后',card.upgrade_preview]]){
    const column=e('div','upgrade-column');column.append(e('strong','',title),e('small','',`费用：${value.cost??value.card_cost??'未知'}${value.star_cost!=null?` · 星星：${value.star_cost}`:''}`),e('p','',desc(value)));
    if(value.keywords?.length)column.append(e('p','fine',`关键词：${value.keywords.map(k=>typeof k==='string'?k:k.title??k.name??k.description??'').filter(Boolean).join('、')}`));
    wrap.append(column);
  }
  return wrap;
}
let activeResource='deck';
function renderResources(){
  const p=latest?.state?.player,kind=activeResource,items=p?.[kind]??[];
  for(const button of document.querySelectorAll('[data-resource]')){
    const active=button.dataset.resource===kind;
    button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
    button.textContent=`${{deck:'卡组',relics:'遗物',potions:'药水'}[button.dataset.resource]} · ${p?.[button.dataset.resource]?.length??0}`;
  }
  $('inventory').setAttribute('aria-labelledby',`resource-${kind}`);clear($('inventory'));
  if(!p||kind==='deck'&&!p.deck_available){$('inventory').append(e('p','muted','当前资源尚未读取，请检查游戏连接。'));return;}
  if(!items.length){$('inventory').append(e('p','muted',kind==='potions'?'当前没有携带药水。':kind==='relics'?'当前没有遗物。':'当前卡组没有卡牌。'));return;}
  const list=e('div','resource-list');
  items.forEach((x,i)=>{
    const item=e('article','resource-item'),head=e('div','choice-head');
    head.append(e('h3','',`${name(x)}${x.is_upgraded?' +':''}`),e('small','muted',kind==='deck'?`第 ${i+1} 张 · 费用 ${x.cost??x.card_cost??'未知'}`:`${i+1}`));
    item.append(head,e('p','',desc(x)||'暂无效果描述'));
    if(kind==='deck'){const comparison=upgradeComparison(x);if(comparison){const details=e('details','resource-upgrade');details.append(e('summary','','查看升级前后对比'),comparison);item.append(details);}}
    list.append(item);
  });
  $('inventory').append(list);
}
function openResources(kind){activeResource=kind;renderResources();if(!$('resources').open)$('resources').showModal();}
document.querySelectorAll('[data-resource]').forEach(button=>{
  button.onclick=()=>{activeResource=button.dataset.resource;renderResources();};
  button.onkeydown=event=>{const keys=['deck','relics','potions'];let index=keys.indexOf(activeResource);if(event.key==='ArrowRight')index=(index+1)%3;else if(event.key==='ArrowLeft')index=(index+2)%3;else if(event.key==='Home')index=0;else if(event.key==='End')index=2;else return;event.preventDefault();activeResource=keys[index];renderResources();$(`resource-${activeResource}`).focus();};
});
// Native SVG keeps the map sharp at every window size and follows the real map coordinates.
const ns='http://www.w3.org/2000/svg';
const svgEl=(tag,attrs={},text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
const mapKey=n=>Array.isArray(n)?`${n[0]},${n[1]}`:`${n.col},${n.row}`;
const roomKind=t=>({rest:'restsite',merchant:'shop',questionmark:'unknown',unassigned:'unknown',start:'ancient'})[String(t??'unknown').toLowerCase()]??String(t??'unknown').toLowerCase();
const roomLabel=t=>typeNames[roomKind(t)]??typeNames[String(t).toLowerCase()]??'未知';
const routeNumber=(s,route)=>s.options.indexOf(route)+1;
let mapMemory={key:'',route:null,focus:false,scroll:null};
function roomIcon(type,x=0,y=0,size=22){
  const g=svgEl('g',{transform:`translate(${x} ${y}) scale(${size/24})`,fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'});
  const paths={
    monster:['M-8-9 8 7M-9-4-4-9M4 9 9 4M8-9-8 7M4-9 9-4M-9 4-4 9'],
    elite:['M-8 4C-15-11 15-11 8 4L5 6V10H-5V6Z','M-6-1h2M4-1h2M-2 8v2M2 8v2'],
    restsite:['M0-11C3-4 10-3 8 4 6 13-7 13-8 5-10 0-5-3-4-6-4 0 0-2 0-11Z','M0 2C4 7 3 10 0 10S-4 7 0 2Z'],
    shop:['M-9-5H9V10H-9ZM-4-5V-8C-4-13 4-13 4-8V-5'],
    treasure:['M-10-3Q-10-9 0-9T10-3V8H-10ZM-10-1H10M-2-2H2V3H-2Z'],
    boss:['M-10-6-5-1 0-10 5-1 10-6 8 7H-8ZM-7 11H7'],
    ancient:['M0-12 10 0 0 12-10 0ZM-3-2Q3-6 3 0T-3 2'],
  };
  if(paths[roomKind(type)])paths[roomKind(type)].forEach(d=>g.append(svgEl('path',{d})));
  else g.append(svgEl('text',{x:0,y:6,'text-anchor':'middle',fill:'currentColor',stroke:'none','font-size':20,'font-weight':600},'?'));
  return g;
}
function routeSummary(route){
  const counts=new Map();for(const n of route?.path??[]){const t=roomKind(n.type);if(t==='boss'||t==='ancient')continue;counts.set(t,(counts.get(t)??0)+1);}
  return [...counts].map(([t,count])=>`${count} ${roomLabel(t)}`).join(' · ');
}
function nextStepLabel(route){
  const n=route?.path?.[0];return n?`下一步：${roomLabel(n.type)} · 第 ${Number(n.col)+1} 列`:'等待路线建议';
}
function renderMap(s){
  const raw=s.state.map??{}, routes=s.options.filter(o=>o.path?.length), recommended=routes.find(o=>s.advice?.choice_ids?.includes(o.id));
  const memoryKey=`${s.state.id}:${recommended?.id??''}:${s.advice?.engine??''}`;
  if(mapMemory.key!==memoryKey)mapMemory={key:memoryKey,route:recommended?.id??null,focus:false,scroll:null};
  const nodes=new Map();
  const add=n=>{if(n&&Number.isFinite(Number(n.col))&&Number.isFinite(Number(n.row)))nodes.set(mapKey(n),{...n,col:Number(n.col),row:Number(n.row)});};
  for(const n of raw.nodes??[])add(n);
  for(const n of raw.next_options??[])if(!nodes.has(mapKey(n)))add(n);
  const current=raw.current_position;
  if(current&&!nodes.has(mapKey(current)))add(current);
  if(!nodes.size){$('scene').append(e('p','muted','地图数据尚未就绪，打开游戏地图后会自动显示。'));return;}
  const available=new Set((raw.next_options??[]).map(mapKey)), visited=new Set((raw.visited??[]).map(mapKey)), currentKey=current?mapKey(current):null;
  const edges=new Map();
  const edgeKey=(a,b)=>`${a}>${b}`;
  const addEdge=(a,b)=>{if(a!==b&&nodes.has(a)&&nodes.has(b))edges.set(edgeKey(a,b),{from:a,to:b});};
  for(const [id,n] of nodes)for(const child of n.children??[])addEdge(id,mapKey(child));
  // next_options is authoritative even when the bridge omits the current node's children.
  if(currentKey)for(const n of raw.next_options??[])addEdge(currentKey,mapKey(n));
  const future=new Set(available),queue=[...available];
  for(let i=0;i<queue.length;i++)for(const edge of edges.values())if(edge.from===queue[i]&&!future.has(edge.to)){future.add(edge.to);queue.push(edge.to);}
  const columns=[...nodes.values()].map(n=>n.col), rows=[...new Set([...nodes.values()].map(n=>n.row))].sort((a,b)=>a-b);
  const minCol=Math.min(...columns),maxCol=Math.max(...columns),width=640,top=66,bottom=72,gap=86,height=top+bottom+Math.max(0,rows.length-1)*gap;
  const position=n=>({x:maxCol===minCol?width/2:70+(n.col-minCol)/(maxCol-minCol)*(width-140),y:top+(rows.length-1-rows.indexOf(n.row))*gap});
  const shell=e('div','map-shell'),heading=e('div','map-heading');
  heading.append(e('span','map-direction','↑ 从下往上走'),e('span','muted',raw.boss?.name?`首领：${raw.boss.name}`:'本章地图'));shell.append(heading);
  const legend=e('div','map-legend');
  for(const [cls,label] of [['current','当前位置'],['available','可选下一站'],['recommended',s.advice?.engine==='rules'?'规则建议':'推荐路线'],['preview','预览路线']]){const item=e('span',`map-key ${cls}`);item.append(e('i'),document.createTextNode(label));legend.append(item);}shell.append(legend);
  const viewport=e('div','map-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','本章路线图，可滚动查看；首领在顶部，当前位置在下方');
  const canvas=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,class:'map-svg',role:'group','aria-label':'地图节点与真实连线'});viewport.append(canvas);shell.append(viewport);
  const bottomBar=e('div','map-controls'),focus=e('label','toggle'),check=e('input');check.type='checkbox';check.checked=mapMemory.focus;focus.append(check,document.createTextNode('聚焦所选路线'));
  const locate=e('button','secondary','定位当前');locate.type='button';locate.disabled=!current;bottomBar.append(focus,locate);shell.append(bottomBar);
  const hint=e('div','map-next'),chips=e('div','map-route-picker');shell.append(hint,chips);
  const fullText=e('details','map-text-details');fullText.append(e('summary','','文字路线（展开查看）'));const fullTextBody=e('p','muted');fullText.append(fullTextBody);shell.append(fullText);
  $('scene').append(shell);
  const routeNodes=route=>new Set((route?.path??[]).map(mapKey));
  const routeEdges=route=>{const ids=(route?.path??[]).map(mapKey);if(currentKey&&available.has(ids[0]))ids.unshift(currentKey);return new Set(ids.slice(1).map((id,i)=>edgeKey(ids[i],id)));};
  const recommendedNodes=routeNodes(recommended),recommendedEdges=routeEdges(recommended);
  const badge=(group,x,y,text,cls)=>{const w=Math.max(54,text.length*12+18),g=svgEl('g',{class:`map-badge ${cls}`,transform:`translate(${x} ${y})`});g.append(svgEl('rect',{x:-w/2,y:-10,width:w,height:20,rx:10}),svgEl('text',{'text-anchor':'middle',y:4},text));group.append(g);};
  function choose(route){mapMemory.route=route?.id??null;draw();}
  function draw(){
    clear(canvas);clear(chips);
    const selected=routes.find(o=>o.id===mapMemory.route),selectedNodes=routeNodes(selected),selectedEdges=routeEdges(selected),isPreview=selected&&selected.id!==recommended?.id;
    const defs=svgEl('defs'),pattern=svgEl('pattern',{id:'map-dot-grid',width:24,height:24,patternUnits:'userSpaceOnUse'});pattern.append(svgEl('circle',{cx:1,cy:1,r:1,fill:'#27343a'}));defs.append(pattern);canvas.append(defs,svgEl('rect',{width,height,fill:'url(#map-dot-grid)'}));
    rows.forEach(row=>{const y=position({col:minCol,row}).y;canvas.append(svgEl('text',{x:16,y:y+4,class:'map-floor-number'},String(row)),svgEl('line',{x1:43,x2:width-25,y1:y,y2:y,class:'map-row-guide'}));});
    const line=(edge,cls)=>{const a=position(nodes.get(edge.from)),b=position(nodes.get(edge.to));const g=svgEl('path',{d:`M${a.x},${a.y} C${a.x},${a.y-39} ${b.x},${b.y+39} ${b.x},${b.y}`,class:cls,fill:'none'});canvas.append(g);};
    for(const [id,edge] of edges){const focused=mapMemory.focus&&selected&&!selectedEdges.has(id);line(edge,`map-edge${visited.has(edge.from)&&visited.has(edge.to)?' walked':''}${!future.has(edge.to)&&edge.from!==currentKey?' inactive':''}${focused?' dimmed':''}`);}
    for(const id of recommendedEdges){const edge=edges.get(id);if(edge)line(edge,`map-edge recommended${mapMemory.focus&&isPreview&&!selectedEdges.has(id)?' dimmed':''}`);}
    if(isPreview)for(const id of selectedEdges){const edge=edges.get(id);if(edge)line(edge,'map-edge preview');}
    for(const [id,n] of [...nodes].sort((a,b)=>a[1].row-b[1].row)){
      const p=position(n),isCurrent=id===currentKey,isNext=id===(selected?.path?.[0]?mapKey(selected.path[0]):null),candidate=routes.find(r=>r.path.some(k=>mapKey(k)===id));
      const cls=['map-node',roomKind(n.type),visited.has(id)?'visited':'',future.has(id)?'future':'',available.has(id)?'available':'',recommendedNodes.has(id)?'recommended':'',isPreview&&selectedNodes.has(id)?'preview':'',isCurrent?'current':'',mapMemory.focus&&selected&&!selectedNodes.has(id)&&!isCurrent?'dimmed':''].filter(Boolean).join(' ');
      const node=svgEl('g',{class:cls,transform:`translate(${p.x} ${p.y})`});
      const nodeTitle=`${roomLabel(n.type)}，第 ${n.col+1} 列${isCurrent?'，当前位置':''}${available.has(id)?'，可选下一站':''}${isNext?'，所选路线的下一站':''}`;
      node.append(svgEl('title',{},nodeTitle));node.setAttribute('aria-label',nodeTitle);
      if(candidate&&!isCurrent){node.setAttribute('role','button');node.setAttribute('tabindex','0');const pick=()=>choose(selectedNodes.has(id)?selected:recommendedNodes.has(id)?recommended:candidate);node.addEventListener('click',pick);node.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();pick();}});}
      if(isCurrent||available.has(id)||isNext)node.append(svgEl('circle',{r:isNext?28:26,class:'map-node-halo'}));
      node.append(svgEl('circle',{r:20,class:'map-node-disc'}),roomIcon(n.type),svgEl('text',{x:0,y:37,'text-anchor':'middle',class:'map-room-label'},isCurrent?'你在这里':roomLabel(n.type)));
      if(isNext)badge(node,0,-37,isPreview?'预览下一步':'下一步',isPreview?'preview':'recommended');
      canvas.append(node);
    }
    const overview=e('button',`map-route-chip${!selected?' active':''}`,'全图');overview.type='button';overview.onclick=()=>choose(null);chips.append(overview);
    for(const route of routes){const button=e('button',`map-route-chip${route.id===selected?.id?' active':''}${route.id===recommended?.id?' is-recommended':''}`,`${route.id===recommended?.id?'★ ':''}方案 ${routeNumber(s,route)}`);button.type='button';button.setAttribute('aria-pressed',String(route.id===selected?.id));button.title=routeSummary(route);button.onclick=()=>choose(route);chips.append(button);}
    clear(hint);
    if(selected){hint.className=`map-next${isPreview?' preview':''}`;hint.append(e('strong','',nextStepLabel(selected)),e('span','',`${isPreview?'预览方案':s.advice?.engine==='rules'?'规则建议 · 方案':'推荐方案'} ${routeNumber(s,selected)} · ${routeSummary(selected)}`));fullTextBody.textContent=selected.label;}
    else{hint.className='map-next neutral';hint.append(e('strong','','点击 AI 分析，推荐路线会在图上点亮'),e('span','','也可点击方案或地图节点预览路线。'));fullTextBody.textContent='选择一个方案后显示对应文字路线。';}
  }
  check.onchange=()=>{mapMemory.focus=check.checked;draw();};
  const locateCurrent=()=>{if(!current)return;const scale=canvas.getBoundingClientRect().width/width;viewport.scrollTop=position(current).y*scale-viewport.clientHeight*.68;};
  locate.onclick=locateCurrent;viewport.addEventListener('scroll',()=>{mapMemory.scroll=viewport.scrollTop;},{passive:true});
  draw();requestAnimationFrame(()=>{if(!viewport.isConnected)return;if(mapMemory.scroll!==null)viewport.scrollTop=mapMemory.scroll;else locateCurrent();});
}
function render(s){
  analysisTracker.update(s);
  updateWaiting();
  latest=s;token=s.token;$('source').value=s.mode;$('auto').checked=s.auto;
  updateDesktopButton();
  renderProfilePicker(s.config);
  strategyStatus.hidden=!s.strategy;
  if(s.strategy){strategyStatus.textContent=`策略参考：${s.strategy.name} · 实机数据优先`;strategyStatus.title=`固定版本 ${s.strategy.commit}\n${s.strategy.repository}`;}
  $('connectionText').textContent=s.mode==='live'?(s.connected?'游戏已连接':'等待游戏连接'):s.mode==='demo'?'演示数据':'手动导入';
  $('dot').classList.toggle('live',s.connected);
  $('notice').textContent=s.mode==='demo'?'当前为虚构演示局面，用于体验流程；卡牌与事件数值不代表游戏实际内容。':s.mode==='live'?'实机模式：自动读取游戏状态。进入地图、选牌、事件、商店或篝火界面后可分析。':'手动导入模式：建议只适用于这份局面，游戏变化后需要重新导入。';
  if(s.state&&!s.state.player.deck_available)$('notice').textContent='完整卡组尚未读取。请启用 Spire Advisor Deck Reader 补丁后重启游戏。已暂停建议生成，避免把缺失数据当作空卡组。';
  const shopReady=s.state?.kind!=='shop'||(s.state.shop?.available!==false&&!s.state.shop?.error&&Array.isArray(s.state.shop?.items));
  if(!shopReady)$('notice').textContent='商店商品尚未完整读取，已暂停建议。请稍候；若持续失败，请更新商店读取补丁。';
  if(s.auto&&s.state?.kind==='map'&&!s.busy&&new Set((s.state.map?.next_options??[]).map(n=>`${n.col},${n.row}`)).size===1)$('notice').textContent='下一站只有一条可走路线，已跳过自动 AI 分析；需要规划更远路线时仍可手动分析。';
  if(s.viewingMap)$('notice').textContent=`你正在游戏中查看地图。下方保留刚才的${({event:'事件',card_reward:'奖励选牌',card_select:'事件选牌',rest_site:'篝火'})[s.state?.kind]??'决策'}局面，原分析会继续，不会触发路线自动分析。`;
  if(s.state?.kind==='map'&&(s.state.room_context?.available===false||(s.state.room_context?.is_event_room&&s.state.room_context.is_finished!==true)))$('notice').textContent='事件尚未确认结束，当前仅查看地图，已暂停路线自动分析。事件结束后，有岔路才会自动规划。';
  if(s.viewingUpgrade)$('notice').textContent='你已打开锻造选牌。保留进入篝火时的分析，不会重复自动分析；实际升级后旧局面会失效。';
  if(s.viewingDeck)$('notice').textContent='你正在游戏中查看卡组，原局面与分析保持不变，不会重复触发自动分析。';
  $('demoTabs').hidden=s.mode!=='demo';
  document.querySelectorAll('[data-demo]').forEach(b=>b.classList.toggle('active',b.dataset.demo===s.state?.kind));
  const key=JSON.stringify([s.state?.id,s.advice,s.error,s.busy,s.mode,s.viewingMap,s.viewingUpgrade,s.viewingDeck]);
  if(key===renderKey)return;renderKey=key;
  const p=s.state?.player;clear($('stats'));
  for(const [title,value,cls,resource] of [['当前生命',p?`${p.hp} / ${p.max_hp}`:'—','hp'],['持有金币',p?`${p.gold} G`:'—','coin'],['卡组规模',p?(p.deck_available?`${p.deck.length} 张`:'未读取'):'—','','deck'],['持有遗物',p?`${p.relics.length} 件`:'—','','relics'],['药水栏位',p?`${p.potions.length} / ${p.max_potion_slots}`:'—','','potions']]){
    const d=e(resource?'button':'div',`stat${resource?' stat-action':''}`);d.append(e('small','',title),e('strong',cls,value));
    if(resource){d.type='button';d.setAttribute('aria-haspopup','dialog');d.setAttribute('aria-controls','resources');d.setAttribute('aria-label',`${title} ${value}，点击查看详情`);d.append(e('span','stat-hint','查看详情 ↗'));d.onclick=()=>openResources(resource);}
    $('stats').append(d);
  }
  $('situationTitle').textContent=s.state?.kind==='card_select'&&s.state.card_select?.screen_type==='upgrade'?'锻造：选择升级卡牌':(s.state?.kind==='card_select'?s.state.card_select?.prompt:null)??kindNames[s.state?.kind]??'等待可分析的局面';
  $('floorTag').textContent=s.state?`第 ${s.state.run.act??'?'} 章 · ${s.state.run.floor??'?'} 层`:'等待数据';
  clear($('scene'));
  if(s.state?.kind==='event'){$('scene').append(e('h3','',s.state.event?.event_name??'事件'),e('p','muted',s.state.event?.body??''));}
  if(s.state?.kind==='map')renderMap(s);
  if(s.state?.kind==='rest_site')$('scene').append(e('p','muted',s.state.player.deck.some(c=>c.upgrade_preview_available)?'比较休息与具体锻造目标，以下展示游戏计算的升级前后效果；卡组位置用于区分同名牌。':'比较休息与具体锻造目标。尚未读到升级预览，请更新读取补丁并重启游戏。'));
  if(!s.options.length){const d=e('div','empty');d.append(e('div','empty-symbol','◇'),e('p','',s.error??(!shopReady?'商品读取尚未完成，暂不生成购买或离店建议。':s.state?.kind==='shop'?'当前没有可购买的商品，可分析是否离店。':'进入地图、奖励选牌、事件、商店或篝火后，这里将显示可选方案。')));$('scene').append(d);}
  const selected=new Set(s.advice?.choice_ids??[]);
  for(const option of s.options){
    if(s.state?.kind==='map')continue;
    const d=e('article',`choice${selected.has(option.id)?' chosen':''}`);const head=e('div','choice-head');
    head.append(e('h3','',option.path?`方案 ${routeNumber(s,option)}`:option.label),e('small','',option.price!==undefined?`${option.price} G`:selected.has(option.id)?'当前推荐':''));d.append(head);
    if(option.path){const path=e('div','route-path');option.path.forEach((node,i)=>{if(i)path.append(e('span','route-arrow','→'));path.append(e('span','route-node',`${typeNames[String(node.type).toLowerCase()]??node.type} ${node.col},${node.row}`));});d.append(path,e('div','route-note','合法连线候选 · 规则排序仅供参考'));}
    else {const comparison=(s.state?.kind==='rest_site'||s.state?.card_select?.screen_type==='upgrade')?upgradeComparison(option.data?.card??option.data):null;d.append(comparison??e('p','',option.description));}
    $('scene').append(d);
  }
  clear($('advice'));$('engineTag').textContent=s.busy?'正在分析':s.advice?.engine==='ai'?`AI · ${s.advice.model}`:s.advice?'规则预览':'尚未分析';
  if(s.error)$('advice').append(e('p','error',s.error));
  if(s.busy){const d=e('div','empty');d.append(e('div','empty-symbol','✦'),e('p','','正在比较选择，结合卡组、资源与后续路线生成建议……'));$('advice').append(d);}
  else if(s.advice){
    const a=s.advice;$('advice').append(e('h3','advice-title',a.summary));
    const names=a.choice_ids.map(id=>s.options.find(o=>o.id===id)?.label??id);
    if(names.length)$('advice').append(e('div','selected-labels',s.state.kind==='map'?nextStepLabel(s.options.find(o=>selected.has(o.id))):s.state.kind==='shop'?`购买顺序：${names.join(' → ')} · 合计 ${s.options.filter(o=>selected.has(o.id)).reduce((n,o)=>n+o.price,0)} G`:names.join(' → ')));
    else if(s.state.kind==='shop')$('advice').append(e('div','selected-labels','保留金币，离开商店'));
    if(s.state.kind==='rest_site'||s.state.card_select?.screen_type==='upgrade'){const option=s.options.find(o=>selected.has(o.id)),comparison=upgradeComparison(option?.data?.card??option?.data);if(comparison)$('advice').append(comparison);}
    let explanation=$('advice');
    if(s.state.kind==='map'){
      const route=s.options.find(o=>selected.has(o.id)),steps=e('div','map-upcoming');
      for(const [i,n] of (route?.path??[]).slice(0,3).entries()){const step=e('div','map-upcoming-step'),icon=svgEl('svg',{viewBox:'-16 -16 32 32',width:30,height:30});icon.append(roomIcon(n.type));step.append(e('small','',i===0?'下一站':`第 ${i+1} 站`),icon,e('span','',roomLabel(n.type)));steps.append(step);}
      if(route)$('advice').append(steps,e('p','fine','金色路线为当前建议；点击其他方案可预览。路线会随局面变化重新规划。'));
      explanation=e('details','map-explanation');explanation.append(e('summary','','查看推荐理由与风险'));$('advice').append(explanation);
    }
    explanation.append(e('div','advice-label','为什么这样选'));
    a.reasons.forEach((text,i)=>{const d=e('div','reason');d.append(e('span','',String(i+1).padStart(2,'0')),e('div','',text));explanation.append(d);});
    if(a.risks.length)explanation.append(e('div','advice-label','需要留意'));
    a.risks.forEach(text=>explanation.append(e('p','risk',`△ ${text}`)));
    explanation.append(e('p','fine',`主观确信程度：${{low:'低',medium:'中',high:'高'}[a.confidence]??'低'}，不代表胜率。`));
  }else{const d=e('div','empty');d.append(e('div','empty-symbol','✦'),e('p','','准备好后，点击下方分析。你也可以先用规则预览体验完整流程。'));$('advice').append(d);}
  const supported=!s.viewingMap&&!s.viewingUpgrade&&!s.viewingDeck&&s.state&&p.deck_available&&shopReady&&['map','card_reward','shop','event','rest_site','card_select'].includes(s.state.kind)&&(s.options.length||s.state.kind==='shop');
  $('analyze').disabled=!supported||s.busy;$('rules').disabled=!supported||s.busy;
  $('analyze').textContent=s.busy?'正在分析…':s.config.hasKey&&s.config.model?'✦ AI 分析当前局面':'✦ 配置 AI 并分析';
  if($('resources').open)renderResources();
}
async function refresh(){if(refreshing)return;refreshing=true;try{const res=await fetch('/api/status');if(!res.ok)throw new Error();render(await res.json());}catch{$('connectionText').textContent='助手服务已停止';$('analyze').disabled=true;$('rules').disabled=true;$('auto').disabled=true;$('notice').textContent='本地助手服务已停止，当前显示的是旧局面。请重新启动助手。';}finally{refreshing=false;}}
let profilePickerKey='';
const savedProfiles=()=>latest.config.profiles??[{...latest.config,id:'legacy',name:'原有 AI 配置'}];
function renderProfilePicker(config){
  const key=JSON.stringify(config);if(key===profilePickerKey)return;profilePickerKey=key;
  clear($('activeProfile'));for(const p of config.profiles??[{...config,id:'legacy',name:'原有 AI 配置'}]){const option=e('option','',`${p.name} · ${p.model||'未配置模型'}`);option.value=p.id;$('activeProfile').append(option);}
  $('activeProfile').value=config.activeId??'legacy';
}
function fillProfileEditor(profile){
  const c=profile??{baseUrl:'https://api.openai.com/v1',model:'',name:'',jsonMode:true};
  $('profileName').value=c.name??'原有 AI 配置';$('baseUrl').value=c.baseUrl;$('model').value=c.model;$('apiKey').value='';
  $('apiKey').placeholder=c.hasKey?'已保存；留空保留本配置密钥':'请输入密钥';$('keyStatus').textContent=c.hasKey?'此配置已保存密钥，留空即可保留。':'新配置不会继承其他配置的密钥。';$('jsonMode').checked=c.jsonMode!==false;$('clearKey').checked=false;$('settingsError').textContent='';
}
function openSettings(){
  clear($('savedProfile'));for(const p of savedProfiles()){const option=e('option','',p.name);option.value=p.id;$('savedProfile').append(option);}
  const fresh=e('option','','＋ 新建配置');fresh.value='';$('savedProfile').append(fresh);$('savedProfile').value=latest.config.activeId??'legacy';fillProfileEditor(savedProfiles().find(p=>p.id===$('savedProfile').value));$('settings').showModal();
}
$('savedProfile').onchange=()=>fillProfileEditor(savedProfiles().find(p=>p.id===$('savedProfile').value));
$('newProfile').onclick=()=>{$('savedProfile').value='';fillProfileEditor(null);$('profileName').focus();};
$('activeProfile').onchange=async()=>{try{await post('/api/config/activate',{profileId:$('activeProfile').value});await refresh();toast('已切换 AI 配置，新分析将使用所选接口和模型。');}catch(err){$('activeProfile').value=latest.config.activeId??'legacy';toast(err.message);}};
$('settingsOpen').onclick=openSettings;
$('settingsForm').onsubmit=async ev=>{ev.preventDefault();try{await post('/api/config',{profileId:$('savedProfile').value,name:$('profileName').value,baseUrl:$('baseUrl').value,model:$('model').value,apiKey:$('apiKey').value,jsonMode:$('jsonMode').checked,clearKey:$('clearKey').checked});$('apiKey').value='';$('settings').close();toast('AI 配置已保存并启用。');await refresh();}catch(err){$('settingsError').textContent=err.message;}};
$('source').onchange=async()=>{try{await post('/api/mode',{mode:$('source').value});await refresh();}catch(err){toast(err.message);}};
$('auto').onchange=async()=>{try{await post('/api/auto',{enabled:$('auto').checked});await refresh();}catch(err){$('auto').checked=false;toast(err.message);}};
document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=async()=>{try{await post('/api/demo',{kind:b.dataset.demo});await refresh();}catch(err){toast(err.message);}});
async function analyze(engine){if(engine==='ai'&&(!latest.config.hasKey||!latest.config.model)){openSettings();return;}try{await post('/api/analyze',{engine,state_id:latest.state?.id});await refresh();}catch(err){toast(err.message);}}
$('analyze').onclick=()=>analyze('ai');$('rules').onclick=()=>analyze('rules');
$('importOpen').onclick=()=>{$('importError').textContent='';$('importDialog').showModal();};
$('file').onchange=async()=>{const file=$('file').files[0];if(file){if(file.size>1500000){$('importError').textContent='文件超过 1.5 MB';return;}$('jsonInput').value=await file.text();}};
$('importForm').onsubmit=async ev=>{ev.preventDefault();try{await post('/api/import',{state:JSON.parse($('jsonInput').value)});$('importDialog').close();await refresh();}catch(err){$('importError').textContent=err.message;}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
async function history(){clear($('history'));try{const rows=await(await fetch('/api/history')).json();if(!rows.length)$('history').append(e('p','muted','分析一次局面后，建议会保存在这里。'));rows.forEach(row=>{const d=e('div','history-row');d.append(e('small','',`${new Date(row.at).toLocaleString('zh-CN')} · ${kindNames[row.kind]??row.kind} · ${{demo:'演示',live:'实机',import:'导入'}[row.source]} · ${row.engine==='ai'?'AI':'规则'}`),e('p','',row.summary));$('history').append(d);});}catch{toast('读取记录失败');}}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{currentView=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));$('advisorView').hidden=currentView!=='advisor';$('historyView').hidden=currentView!=='history';if(currentView==='history')void history();});
$('refreshHistory').onclick=history;
await refresh();setInterval(refresh,1200);

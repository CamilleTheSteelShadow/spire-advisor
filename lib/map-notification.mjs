import {choices,coord} from './state.mjs';

const names={monster:'战斗',elite:'精英',restsite:'营火',rest:'营火',shop:'商店',merchant:'商店',unknown:'未知',questionmark:'未知',treasure:'宝箱',boss:'首领',ancient:'事件'};
const label=n=>names[String(n.type).toLowerCase()]??'未知';
export function mapNotification(state,advice){
  if(state.kind!=='map')return null;
  const current=state.map?.current_position;
  if(!Number.isInteger(current?.col)||!Number.isInteger(current?.row))return null;
  const all=state.map.nodes??[],next=state.map.next_options??[];
  const rows=[...new Set(all.filter(n=>n.row>current.row).map(n=>n.row))].sort((a,b)=>a-b).slice(0,2);
  const path=choices(state).find(o=>o.id===advice.choice_ids?.[0])?.path?.slice(0,2);
  if(!path?.length||!next.some(n=>coord(n)===coord(path[0])))return null;
  const shown=[current,...all.filter(n=>rows.includes(n.row))];
  if(path.some(n=>!shown.some(s=>coord(s)===coord(n))))return null;
  const gold=new Set([coord(current),...path.map(coord)]),goldEdges=new Set();
  for(let i=0;i<path.length;i++)goldEdges.add(`${coord(i?path[i-1]:current)}>${coord(path[i])}`);
  const nodes=[...new Map(shown.map(n=>[coord(n),{id:coord(n),col:n.col,layer:coord(n)===coord(current)?0:rows.indexOf(n.row)+1,label:label(n),type:String(n.type??'unknown').toLowerCase(),current:coord(n)===coord(current),recommended:gold.has(coord(n))}])).values()];
  const ids=new Set(nodes.map(n=>n.id)),edges=[];
  for(const source of shown){
    for(const child of coord(source)===coord(current)?next:source.children??[]){
      const from=coord(source),to=coord(child);
      if(ids.has(to))edges.push({from,to,recommended:goldEdges.has(`${from}>${to}`)});
    }
  }
  if([...goldEdges].some(key=>!edges.some(e=>`${e.from}>${e.to}`===key)))return null;
  const columns=Math.max(7,...all.map(n=>n.col+1));
  return {message:path.map((n,i)=>`${i?'再下一站':'下一站'}：${label(n)} · 从左数第 ${n.col+1} 列`).join('\n'),map:{nodes,edges,columns}};
}

// Known in-game red energy glyph: one icon represents one energy.
const icon=String.raw`(?:\[img(?:=[^\]]*)?\])?(?:\[(?:res:\/\/images\/packed\/sprite_fonts\/)?ironclad_energy_icon\.png\]|res:\/\/images\/packed\/sprite_fonts\/ironclad_energy_icon\.png)(?:\[\/img\])?`;
const group=new RegExp(`(?:${icon}\\s*)+`,'g');
export function gameText(value){
  return String(value).replace(group,run=>`${[...run.matchAll(new RegExp(icon,'g'))].length} 点能量`);
}
export function readableGameData(value){
  if(typeof value==='string')return gameText(value);
  if(Array.isArray(value))return value.map(readableGameData);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,readableGameData(item)]));
  return value;
}

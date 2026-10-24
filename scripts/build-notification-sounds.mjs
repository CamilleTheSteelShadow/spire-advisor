import {mkdir,writeFile} from 'node:fs/promises';

// Short, distinct synthesized chimes. No external audio or system sound scheme.
export const cues={
  start:[[523.25,100],[659.25,130]],
  success:[[698.46,180]],
  error:[[440,170],[329.63,170],[220,250]],
  cancel:[[392,90],[293.66,150]],
};
const rate=44100,gap=55;
export function wave(notes,gain=1){
  const samples=[];
  for(const [hz,ms] of notes){
    const size=Math.round(rate*ms/1000);
    for(let i=0;i<size;i++){
      const t=i/rate,envelope=Math.min(1,i/(rate*.012),(size-1-i)/(rate*.035));
      samples.push(Math.round(8500*gain*envelope*(Math.sin(2*Math.PI*hz*t)+.18*Math.sin(4*Math.PI*hz*t))/1.18));
    }
    samples.push(...Array(Math.round(rate*gap/1000)).fill(0));
  }
  const out=Buffer.alloc(44+samples.length*2);
  out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
  out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
  out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
  out.write('data',36);out.writeUInt32LE(samples.length*2,40);
  samples.forEach((value,i)=>out.writeInt16LE(value,44+i*2));return out;
}
const folder=new URL('../assets/sounds/',import.meta.url);
await mkdir(folder,{recursive:true});
for(const [kind,notes] of Object.entries(cues))await writeFile(new URL(`${kind}.wav`,folder),wave(notes,kind==='success'?.5:1));

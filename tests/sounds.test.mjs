import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('四类状态有不同的有效 PCM 音效，播放时长短于自动关闭时间',async()=>{
  const hashes=[];
  for(const kind of ['start','success','error','cancel']){
    const wav=await readFile(new URL(`../assets/sounds/${kind}.wav`,import.meta.url));
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
    assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),1);
    assert.equal(wav.readUInt32LE(40),wav.length-44);
    const seconds=(wav.length-44)/wav.readUInt32LE(28);
    assert.ok(seconds>.15&&seconds<1);
    hashes.push(createHash('sha256').update(wav).digest('hex'));
  }
  assert.equal(new Set(hashes).size,4);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the browser's actual tracker without sending AI requests or needing browser permissions.
const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const trackerSource=source.slice(source.indexOf('class AnalysisTracker {'),source.indexOf('const analysisTracker='));
const Tracker=vm.runInNewContext(`${trackerSource};AnalysisTracker`);
const state=(id,busy=false,advice=null,error=null)=>({state:{id},busy,advice,error});
const ai=at=>({engine:'ai',at});

test('initial and repeated advice never notify; new AI completion notifies exactly once',()=>{
  const tracker=new Tracker();
  assert.equal(tracker.update(state('a',false,ai('old'))),null);
  assert.equal(tracker.update(state('a',true,null),1000),null);
  assert.equal(tracker.started,1000);
  assert.equal(tracker.update(state('a',true,null),2000),null);
  assert.equal(tracker.started,1000);
  assert.equal(tracker.update(state('a',false,ai('new'))),'success');
  assert.equal(tracker.started,0);
  assert.equal(tracker.update(state('a',false,ai('new'))),null);
});
test('fast AI replies between polls notify, rule previews do not',()=>{
  const tracker=new Tracker();tracker.update(state('a'));
  assert.equal(tracker.update(state('a',false,{engine:'rules',at:'1'})),null);
  assert.equal(tracker.update(state('a',false,ai('2'))),'success');
});
test('failed request notifies once; cancellation and changed scenes never announce completion',()=>{
  const tracker=new Tracker();tracker.update(state('a',true));
  assert.equal(tracker.update(state('a',false,null,'timeout')),'error');
  assert.equal(tracker.update(state('a',false,null,'timeout')),null);
  tracker.update(state('a',true));
  assert.equal(tracker.update(state('b',false,ai('old'))),null);
  tracker.update(state('b',true));
  assert.equal(tracker.update(state('b')),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAIResponse,readAPIResponse} from '../lib/ai-response.mjs';
import {validateAdvice,normalize} from '../lib/state.mjs';
const advice={summary:'文字内有 {括号} 和 "引号"',choice_ids:['event:0'],reasons:['理由'],risks:[],confidence:'low'};
test('服务商外层响应区分空白、网页、流式、损坏 JSON 和接口格式，不泄露响应正文',async()=>{
 const secret='test-private-provider-body';
 for(const [body,type,message] of [['','application/json',/空响应/],[`<html>${secret}</html>`,'text/html',/网页/],[`data: ${secret}`,'text/event-stream',/流式/],[`{"partial":"${secret}`,'application/json',/不完整/],[JSON.stringify({error:{message:secret}}),'application/json',/错误结果/],[JSON.stringify({output:secret}),'application/json',/缺少/]]){
  await assert.rejects(()=>readAPIResponse(new Response(body,{headers:{'Content-Type':type}})),e=>message.test(e.message)&&!e.message.includes(secret));
 }
 await assert.rejects(()=>readAPIResponse({text:async()=>{throw new Error(secret);}}),e=>/途中断开/.test(e.message)&&!e.message.includes(secret));
 const good={choices:[{message:{content:JSON.stringify(advice)}}]};
 assert.deepEqual(await readAPIResponse(new Response('\uFEFF\n\n'+JSON.stringify(good))),good);
});
test('接受纯 JSON、代码块或说明中唯一完整 JSON，并正确处理字符串中的括号',()=>{
 const json=JSON.stringify(advice);
 for(const text of [json,'```json\n'+json+'\n```','说明：\n'+json+'\n以上是建议。'])assert.deepEqual(parseAIResponse(text),advice);
});
test('截断、空正文、多结果、损坏 JSON 各自明确报错，不把任意文本当作建议',()=>{
 assert.throws(()=>parseAIResponse('{"summary":','length'),/截断/);
 assert.throws(()=>parseAIResponse(''),/正文为空/);
 assert.throws(()=>parseAIResponse('{}\n{}'),/多个/);
 assert.throws(()=>parseAIResponse('{"summary":"abc}'),/格式/);
 assert.throws(()=>parseAIResponse('说明 {summary: "无效"}'),/格式/);
});
test('提取出的完整 JSON 仍需通过实际选项校验',()=>{
 const state=normalize({state_type:'event',player:{hp:40,max_hp:80,gold:5,deck:[]},event:{options:[{index:0,name:'可用'}]}});
 const bad=parseAIResponse('说明：'+JSON.stringify({...advice,choice_ids:['event:999']}));
 assert.throws(()=>validateAdvice(bad,state),/不存在/);
});

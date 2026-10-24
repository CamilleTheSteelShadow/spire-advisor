import {replyShape} from './ai-diagnostics.mjs';

export async function readAPIResponse(res,report=()=>{}){
  let text;
  try{text=await res.text();}catch{throw new Error('AI 接口响应在读取途中断开，未收到完整数据。请稍后手动重试。');}
  const clean=text.replace(/^\uFEFF/,'').trim();
  report({response_characters:text.length,response_empty:clean.length===0});
  if(!clean)throw new Error('AI 接口返回了空响应，没有收到分析数据。请稍后手动重试或检查服务商状态。');
  if(clean.length>2000000)throw new Error('AI 接口响应过大，已停止解析。');
  let payload;
  try{payload=JSON.parse(clean);}catch{
    if(/^<(?:!doctype|html|head|body)\b/i.test(clean)||/text\/html/i.test(res.headers?.get('content-type')??''))throw new Error('AI 接口返回了网页内容，未收到 JSON 数据，可能是网关错误页或接口地址不正确。');
    if(/text\/event-stream/i.test(res.headers?.get('content-type')??'')||/^(?:data:|event:|:)/m.test(clean))throw new Error('AI 接口返回了流式数据，但助手请求的是非流式 JSON。请检查服务商的接口兼容性。');
    throw new Error('AI 接口返回的 JSON 不完整或格式损坏，可能是传输中断或服务商响应异常。请稍后手动重试。');
  }
  report({response_shape:replyShape(payload),provider_error_code:['string','number'].includes(typeof payload?.error?.code)?String(payload.error.code).slice(0,100):undefined});
  if(payload?.error)throw new Error('AI 服务返回了错误结果，没有提供分析内容。请检查服务商的额度、模型和服务状态。');
  if(!Array.isArray(payload?.choices)||!payload.choices[0]?.message)throw new Error('AI 接口返回了 JSON，但缺少 Chat Completions 的回复字段。请检查接口类型与服务商兼容性。');
  return payload;
}

export function parseAIResponse(text,finishReason){
  if(finishReason==='length')throw new Error('AI 回复被截断，未能取得完整建议。请提高服务商的输出上限或换用当前配置中的其他模型，再手动重试。');
  if(finishReason==='content_filter')throw new Error('AI 服务未提供完整回复，当前建议不可用。');
  if(typeof text!=='string'||!text.trim())throw new Error('AI 返回的正文为空，请检查模型是否将内容仅放在推理字段中。');
  if(text.length>200000)throw new Error('AI 返回内容过长，暂不解析。');
  const clean=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(clean);}catch{}
  // Accept one complete JSON object surrounded by prose, never repair broken JSON
  // or evaluate generated text. Quoted braces and escaped quotes are respected.
  const found=[];let start=-1,depth=0,quoted=false,escaped=false;
  for(let i=0;i<clean.length;i++){
    const c=clean[i];
    if(start<0){if(c==='{'){start=i;depth=1;}continue;}
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0){try{found.push(JSON.parse(clean.slice(start,i+1)));}catch{}start=-1;}
  }
  if(found.length===1)return found[0];
  throw new Error(found.length>1?'AI 返回了多个 JSON 结果，无法确认应采用哪一个，请手动重试。':'AI 回复不符合 JSON 格式。请检查当前配置的 JSON 模式；若已开启，模型仍可能未遵守格式，请手动重试或切换模型。');
}

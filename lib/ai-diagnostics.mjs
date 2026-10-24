export const valueType=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
export function replyShape(value,depth=0){
  const type=valueType(value);
  if(type==='string')return {type,length:value.length};
  if(type==='array')return {type,length:value.length,items:depth<3?value.slice(0,3).map(v=>replyShape(v,depth+1)):undefined};
  if(type==='object')return {type,fields:depth<3?Object.fromEntries(Object.entries(value).slice(0,32).map(([k,v])=>[k,replyShape(v,depth+1)])):undefined};
  return {type};
}
export function adviceFields(value){
  return Object.entries({summary:'string',choice_ids:'array',reasons:'array',risks:'array'}).map(([field,expected])=>{
    const present=value!==null&&typeof value==='object'&&Object.hasOwn(value,field);
    const actual=present?valueType(value[field]):'missing';
    return {field,expected,actual,status:actual===expected?'ok':present?'wrong_type':'missing'};
  });
}
export function sanitizeDiagnostics(value,secrets=[]){
  if(typeof value==='string'){
    let text=value;for(const secret of secrets.filter(Boolean))text=text.replaceAll(secret,'[REDACTED]');
    return text.replace(/Bearer\s+\S+|\bsk-[A-Za-z0-9_-]+/gi,'[REDACTED]').replace(/[\u0000-\u001f]/g,' ').slice(0,500);
  }
  if(Array.isArray(value))return value.slice(0,40).map(v=>sanitizeDiagnostics(v,secrets));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,40).map(([k,v])=>[sanitizeDiagnostics(k,secrets),sanitizeDiagnostics(v,secrets)]));
  return value;
}

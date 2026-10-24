export class BridgeError extends Error {}

export function bridgeMessage(status, payload = {}) {
  const detail=String(payload.error??'')+' '+String(payload.stack_trace??'');
  if(status===500 && (payload.exception_type==='System.MissingMethodException'||/Method not found/i.test(detail))) {
    if(/BuildShopState|MerchantRoom.*Inventory/.test(detail))return '商店读取模组与当前游戏版本不兼容。请运行「修复商店读取.cmd」后重启游戏。';
    return '读取模组调用了当前游戏版本已变更的接口，需要更新兼容补丁。';
  }
  if(status===409)return '当前读取接口只支持单人对局，请确认游戏模式。';
  if(status===500)return '游戏模组读取当前局面失败（HTTP 500）。这不是 AI 接口错误，请检查读取模组。';
  return `游戏读取接口返回 HTTP ${status}，暂时无法获取当前局面。`;
}

export async function readGameState({fetcher=fetch,url='http://127.0.0.1:15526/api/v1/singleplayer'}={}) {
  const res=await fetcher(url,{signal:AbortSignal.timeout(5000),redirect:'error'});
  let payload;
  try {payload=await res.json();}catch{throw new BridgeError(bridgeMessage(res.status));}
  if(!res.ok)throw new BridgeError(bridgeMessage(res.status,payload));
  return payload;
}

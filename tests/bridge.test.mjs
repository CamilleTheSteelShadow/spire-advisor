import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeMessage,readGameState,BridgeError} from '../lib/bridge.mjs';

test('商店旧接口异常明确提示兼容问题，不误报单人模式',()=>{
  const text=bridgeMessage(500,{exception_type:'System.MissingMethodException',error:"Method not found: 'MerchantRoom.get_Inventory()'",stack_trace:'at STS2_MCP.McpMod.BuildShopState'});
  assert.match(text,/商店.*不兼容/);assert.ok(!text.includes('单人'));assert.ok(!text.includes('DeepSeek'));
});
test('409 模式冲突和普通 500 分别处理',()=>{assert.match(bridgeMessage(409),/单人/);assert.match(bridgeMessage(500),/读取当前局面失败/);});
test('状态读取保留成功响应，失败不丢失错误类型',async()=>{
  const raw={state_type:'shop',shop:{available:true,items:[]}};
  assert.deepEqual(await readGameState({fetcher:async()=>new Response(JSON.stringify(raw))}),raw);
  await assert.rejects(()=>readGameState({fetcher:async()=>new Response(JSON.stringify({exception_type:'System.MissingMethodException',error:'MerchantRoom.get_Inventory()'}),{status:500})}),e=>e instanceof BridgeError&&e.message.includes('修复商店读取.cmd'));
});

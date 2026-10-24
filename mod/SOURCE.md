# 社区桥接模组

上游：https://github.com/Gennadiyev/STS2MCP

发布版本：0.4.0，文件来自该仓库官方 GitHub release。

下载地址：
- https://github.com/Gennadiyev/STS2MCP/releases/download/0.4.0/STS2_MCP.dll
- https://raw.githubusercontent.com/Gennadiyev/STS2MCP/0.4.0/mod_manifest.json （保存为 STS2_MCP.json；release 附件下载中断，改用同标签清单）

许可证：MIT，见 LICENSE.txt。模组维护者与本助手作者不同。

助手只读取 GET /api/v1/singleplayer。模组本身也提供控制接口；本项目不会调用它们。具体游戏版本的加载与运行兼容性需实机验证。

STS2_MCP.dll SHA-256（本次下载）：F429E781D1BFC7FB24B20B6D88BDA78C40A29AC0DA658349EB4D0F861B325810

## 完整卡组、升级预览与商店兼容补丁 v0.6.0

`SpireAdvisorDeck.dll`、`SpireAdvisorDeck.json` 为本项目新增的只读导出补丁，源码位于 `../mod-src/`。补丁在游戏开始正常帧回调后挂接原模组的玩家信息构建方法，补充永久卡组与卡牌深拷贝上的单次升级预览，并将旧版商店读取调用转向当前游戏的 GetLocalInventory()，不改原模组文件或存档。基于本机游戏 v0.107.1 的 .NET 9 程序集编译。

SpireAdvisorDeck.dll SHA-256：70E73F3856E81A7961CA12DBE6B175C3A6A262C0288B67D53934276ECFAFB026

事件地图兼容：在地图和事件状态中补充 room_context，使用 EventRoom.LocalMutableEvent.IsFinished 判断当前实际事件是否结束；只查看地图不会被视为完成事件。读取失败会明确标记 available=false，助手暂停该情况下的路线自动分析。

v0.5.0 移除 STS2_MCP 状态读取过程中的自动 OpenInventory 调用，保留玩家主动点击商人的行为。读取商品无需打开商品界面。

v0.6.0：只读观察奖励选牌界面现有的完成 Task，导出 reward_state_available / card_reward_pending。不会调用 OptionSelected，也不会改变选牌流程；可区分地图预览与已选牌、已跳过。接口字段变化或 Task 尚未就绪时暂停路线自动分析。

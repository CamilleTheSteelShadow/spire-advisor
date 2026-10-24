AI 接口错误会自动记录到本文件夹的 `ai-errors-日期.jsonl`，每行是一条记录。

包含北京时间对应的日期文件、UTC 精确时间、请求编号、服务域名、模型、场景、请求耗时、HTTP 状态、响应类型和错误阶段/提示。

错误阶段：transport（网络）、http（HTTP 状态异常）、response_decode（接口响应解析）、model_json（模型回答格式）、validation（建议不符合当前选项）。取消和超时另有标记。

不记录密钥、请求头、接口 URL 的路径/查询参数、完整游戏局面或服务商响应正文。错误发生前没有启用日志的请求无法补记。

每个文件约 2 MB 后轮换，保留一个 previous 文件；最多保留 14 个日志文件。日志写入失败不会覆盖原接口错误。

详细诊断 v2（v0.1.19 起）：diagnostics.required_fields 逐项列出 expected、actual、status（ok / missing / wrong_type）。parsed_shape 保留实际字段名、类型与嵌套层级，字符串仅记长度，数组仅记长度与少量元素的结构，不保存答案文字或推理正文。还包括 JSON 模式、候选数、返回选择数、不合法选项编号、响应长度、message 结构、结束原因和服务商报告的 token 用量。服务商 JSON 错误结果的错误码会脱敏记录。
旧日志无法恢复当时响应。若 required_fields 全部缺失而 parsed_shape 有 result/data 字段，通常说明模型添加了包裹层；字段 actual 为 string 而 expected 为 array，说明模型把列表写成了文本。应以具体日志为准。

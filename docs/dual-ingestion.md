# 两路导入，一份早报格式

现有生成使用 Responses/Web Search，导入仅校验 JSON 并保存。浏览、切换版本和准备播报都不会触发新闻生成。网页新增“生成早报”“导入早报”和小型版本选择框；只有明确点击生成才会搜索，刷新不再自动生成缺失日报。

沿用 `lib/brief/schema.ts` 的 MorningBrief，内容仍为 `items` 与 `todaysSignal`，不引入第二套 sections。新增可选 `sourceType`（generated/imported_chatgpt/manual）和 `createdAt`。旧存档缺少元数据时按 generated 和 generatedAt 读取。导入需要完整 canonical JSON，来源省略时按 imported_chatgpt；不会自动改写不兼容结构。所有来源URL仍须HTTPS。校验不等于独立事实核查，导入来源的真实性由提供方负责。

每个日期文件增加 `versions`，`brief` 始终是当前版本，其他渲染和 Realtime 读取路径无需分叉。首次导入成为当前版本，同日后续导入默认不激活；网页默认勾选激活，用户可以取消。旧版本保留，明确点击“设为当前早报”才切换。写入使用原子替换及日期锁，冲突返回409，不覆盖进行中的生成。失败重试不会重复创建版本。后续生成也保留旧版本。

## 发布接口

`POST /api/morning-briefs/import`

请求体：`{ "brief": <完整MorningBrief>, "activate": true, "idempotencyKey": "唯一请求标识" }`。也可通过 `Idempotency-Key` 请求头提供标识。成功返回 `{ok, briefId, date, active}`。相同标识和内容幂等返回；相同标识不同内容返回409。无效JSON/字段返回400和字段问题；认证失败401/403。单次最多1MB。

本机网页使用同源且限回环地址的访问边界；脚本/未来外部发布工具须使用 `Authorization: Bearer <BRIEF_PUBLISH_TOKEN>`。在服务端 `.env.local` 配置足够长的随机 token，未配置时外部发布关闭。不能使用 OpenAI API key 作为发布 token，不得放入浏览器。当前服务仍只监听本机，尚未部署公网地址。

`GET /api/morning-briefs?date=YYYY-MM-DD` 返回版本摘要和派生的 active 状态。

`POST /api/morning-briefs` 接受 `{date,id,version}` 并激活已存版本。

## 使用示例

复制已有早报 JSON 中的 `brief` 对象（不要复制最外层任务状态），将 `sourceType` 设为 `manual` 或 `imported_chatgpt`，在导入弹窗粘贴。服务器会分配新的 id/version，保存创建时间，原有版本不覆盖。导入失败时粘贴内容会保留。开发验证应使用临时测试目录，避免把演示新闻导入真实日期。

本期未制作 ChatGPT Action/App/MCP，只提供可供后续工具调用的同一发布接口。未来还需部署受保护HTTPS入口并接入授权发布工具；不会读取或抓取ChatGPT聊天记录。

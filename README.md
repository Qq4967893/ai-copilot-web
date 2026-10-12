# ai-copilot-web

AI Copilot 的前端（技术设计 §2.3）。负责 Chat UI、流式展示、结构化结果渲染、后台
深链和反馈。Agent 推理和业务规则都不在这里 —— 前端不判断业务，只负责把服务端给的
东西如实呈现。

当前是**基础架构阶段**：工程框架、传输层、流式链路、错误模型和校验都已立稳，但还
没有任何业务展示组件。

后端的 Agent 实现由 `ai-copilot-api` 的 `agent.impl` 配置决定：`echo` 不调 LLM，
确定性、不烧 token，适合前端开发和 CI；`operations` 是真实的 Operations Copilot
Agent。前端对两者一视同仁 —— 事件契约是同一套。

## 能力

已实现：

- Vite + React + TypeScript + Tailwind v4 + shadcn/ui（组件项目内持有）
- SSE-over-POST 流式客户端：分帧、增量渲染、取消、多字节安全解码
- 统一错误模型，与 `ai-copilot-api` 的错误信封逐字段一致
- 新建会话状态机（技术设计 §4.7）：首次发消息时才创建服务端会话
- 应用外壳：侧边栏（品牌 / 新建会话 / 历史会话 / 当前用户）、⌘K、移动端抽屉
- 会话列表 UI，接 `/conversations`（只取第一页，暂无分页与删除）
- 回答反馈 UI：复制 / 有帮助 / 无帮助
- 受限 Markdown 渲染 + XSS 防护 + URL scheme 白名单（技术设计 §4.4）
- 最小 Design Tokens（技术设计 §4.2）
- 分层依赖规则，由 ESLint 强制
- Vitest + React Testing Library，67 个单测 + 4 个对接真实后端的联调用例

**尚未实现**（各自留了说明）：

- `components/copilot/` 的 `result` / `table` / `timeline` / `evidence` / `navigation`
  —— EchoAgent 不产出这些事件，没有真实数据可渲染。类型契约已镜像在
  `src/api/events.ts`，各目录职责见 `src/components/copilot/README.md`
- 会话列表的分页与删除 —— `src/api/conversations.ts` 的 `listConversations`
  （`next_cursor`）和 `deleteConversation` 都已实现并测过，只是侧边栏没接
- 反馈的原因选择 —— PRD §10.9.2 要求 7 个可选原因，后端只有 rating + 自由文本
  comment，见 `src/features/feedback/index.ts`。反馈也**没有读取路径**
  （`MessageOut` 无 feedback 字段），赞/踩刷新后即丢
- 推荐追问 —— 设计稿有 `.followups`，但 `src/api/types.ts` 和 `src/api/events.ts`
  里没有任何字段承载它，后端契约已冻结。硬编码假问题会被真点开，所以不做
- 推荐问题、使用帮助页 —— 同上
- 登录 —— 项目根 `README.md` 第 4 条，MVP 无登录。接缝在 `src/features/auth/`
- OpenTelemetry / 前端埋点 —— 项目根 `README.md` 第 3 条，`src/lib/observability.ts`
  是带说明的空实现
- i18n、暗色模式 —— 文档未要求，当前中文硬编码 + 仅亮色
- Playwright E2E —— 浏览器层面的端到端。当前 `make test-live` 已经覆盖了传输和
  契约层，缺的是真实浏览器里的交互
- Dockerfile / CI 配置 —— 部署方式未定，两个兄弟仓库目前也都没有

## 目录与依赖方向

目录结构按技术设计 §26.1。依赖只能自上而下，由 `eslint.config.js` 的
`no-restricted-imports` 真实拦截，不是靠自觉：

```text
routes      →  features  →  components  →  lib
                    ↓            ↓           ↑
                   api ──────────────────────┘
```

硬规则：

- 一律用 `@/` 绝对路径，不出现 `../` 跨目录引用。
- `routes` 不直接调传输层，走 `features` 的 hook。
- `components` 是纯展示层，不依赖 `api` 传输模块，也不依赖 `features`；数据由 props 传入。
- `features` 不依赖 `routes`。
- `lib` 是最底层，不反向依赖任何上层。
- `@/api/types` 和 `@/api/events` 是纯类型模块，不受上述限制 —— 组件用它们标注
  props 是正常的。

改动路由、模块结构或目录边界时，同步更新本文件。

## 配置

前端 baseURL 恒为相对路径 `/api`：开发时 Vite proxy 转发到 `ai-copilot-api`，生产由
反向代理转发。前后端同源，因此没有 CORS 问题，浏览器也不需要知道后端地址。

唯一的开关是 dev proxy 的目标地址：

```bash
cp .env.example .env    # 只在需要改端口时才需要
```

| 变量                  | 默认值                  | 说明           |
| --------------------- | ----------------------- | -------------- |
| `VITE_DEV_API_TARGET` | `http://127.0.0.1:8082` | 仅本地开发生效 |

注意 `VITE_` 开头的变量会被编译进产物，**不要放任何密钥**。

后端那套「环境变量 > JSON 文件 > 默认值 + 启动即校验」的配置体系没有照搬 —— 前端
只有一个开关，搬一套校验框架是过度设计。将来真需要校验的运行时配置，加在
`src/lib/config.ts` 里，并且要在挂载之前跑、失败直接报错。

## 本地运行

需要先把 `ai-copilot-api` 跑起来（它需要一个 MySQL 8）：

```bash
cd ../ai-copilot-api && make migrate && make run    # 127.0.0.1:8082
```

然后：

```bash
make install
make dev            # http://localhost:5173
```

端口固定 5173 且 `strictPort`，被占用时直接失败而不是悄悄换一个。

其他 target：`make lint` / `make fmt` / `make typecheck` / `make test` / `make build`。
`make check` 跑完整的 lint + typecheck + test + build，对齐技术设计 §27.1 的 CI 五步。

## API

前端用到的端点，契约详见 `src/api/`：

```text
POST   /api/conversations                       建会话（首次发消息时才调）
GET    /api/conversations?limit=&cursor=        列表，游标分页（已实现，未接 UI）
GET    /api/conversations/{id}                  详情，刷新页面时恢复消息
DELETE /api/conversations/{id}                  软删除（已实现，未接 UI）
POST   /api/conversations/{id}/messages         发消息，返回 SSE 流
POST   /api/messages/{id}/feedback              反馈（已实现，未接 UI）
```

类型是手写的，不走 OpenAPI 代码生成：后端活的 `/openapi.json` 对 JSON 路由准确，但
流式路由只标注成 `StreamingResponse`、错误信封是异常处理器产出的 FastAPI 看不见 ——
而这两块恰好是前端最需要的，仍得手写。整个接口面只有 6 个类型，维护一条只覆盖一半
的生成链不划算。改动时对照 `ai-copilot-api/app/api/schemas.py`。

### 流式

`POST /api/conversations/{id}/messages` 返回 `text/event-stream`。因为是带 body 的
POST，浏览器的 `EventSource` 用不了，客户端是手写的（`src/api/sse.ts`）。

三条必须守住的行为契约（已逐行对照 `ai-copilot-api/app/api/messages.py` 确认）：

- **流开始前**的错误是普通 HTTP 错误 + JSON 信封。此时服务端什么都没落库，整轮可以
  干净重试 —— 客户端用 `throw` 表达。
- **流开始后**的失败是 HTTP 200 里的一个 `error` 事件，助手消息落库为 `failed`，
  **已产出内容保留** —— 客户端 resolve 成 `stream-error`，不 throw。
- 客户端断开时助手消息落库为 `cancelled`，已产出内容同样保留。

还有一条文档里没写但很要命的：**服务端不发心跳帧，所以连接被掐断和正常结束在字节
层面完全一样**。因此「流结束了却既没收到 `message.completed` 也没收到 `error`」必须
当作失败处理，否则会把一段截断的回答当成完整回答展示给运营。

另外两处时机约定：

- 流式期间**不拉会话详情** —— 后端 `list_messages` 不按状态过滤，此刻助手消息在库里
  是一条 `content` 为空的 `pending` 记录，拉回来会把屏幕上正在流的内容冲掉。
- 取消之后**不失效查询** —— 取消路径的落库在服务端是一个游离的 asyncio task
  （fire-and-forget），立刻重新拉会读到中间状态。`completed` 和 `error` 路径则是先
  `await` 落库再发帧，失效是安全的。

发送**永不自动重试**：后端没有幂等键，重发会真的多出一条用户消息和一次 Agent Run。
重试只能由用户显式触发。

## 安全

技术设计 §4.4 的硬要求是「不支持任意 HTML，Markdown 渲染需要做 XSS 防护和 URL scheme
过滤」，§24.1 把 XSS 列为重点测试项。做法：

- 用 `react-markdown` 且**永不引入 `rehype-raw`**。它不走 `dangerouslySetInnerHTML`，
  不引 `rehype-raw` 时原始 HTML 被整体丢弃 —— 这是结构上的保证，而不是依赖一份
  sanitize 配置写得对。这条是不可退让的规则。
- 元素白名单严格对齐 §4.4，**不含 `img`**（没列在能力里，且是 onerror 载体）。
- 链接经 scheme 白名单过滤，只放行 `http` / `https` / `mailto` 和相对路径。
- 消息按 `content_type` 分派渲染，**不是**按 `role`：用户消息是 `text`、助手消息是
  `markdown`。今天两者等价，但一旦有工具回显用户输入，按 role 判断就成了 XSS 路径。
- 后台深链只渲染服务端给的 `url`，前端绝不自行拼接（技术设计 §13.4）。

策略集中在 `src/lib/markdown.ts`，改渲染前先读那个文件。

## 测试

```bash
make test         # 不依赖后端，CI 跑这个
make test-live    # 对接真实 ai-copilot-api 的联调用例，默认跳过
```

`make test-live` 会把同一套客户端代码跑在真实服务端吐出的字节上，覆盖建会话 → 流式
→ 落库全链路，以及三条行为契约。默认地址 `http://127.0.0.1:8082`，可用
`COPILOT_LIVE_API` 覆盖。它和 `tests/sse.test.ts` 互补：那边用构造的字节流精确覆盖
边界条件（含中文被切在 chunk 边界上），这边证明同一套解析代码吃得下真实字节。

用 Vitest + React Testing Library，测试放在与 `src/` 平级的 `tests/`（技术设计 §26.1）。
覆盖的是 §24.1 点名的重点：流式分帧、新建会话、消息渲染、错误状态、长文本、XSS。

刻意不用 MSW：这里最需要的能力是精确控制 chunk 边界 —— 尤其是把一个中文字符的
UTF-8 字节切成两半，验证解码器不会吐乱码。手写 `ReadableStream`（`tests/helpers/sse.ts`）
比 MSW 更直接也更可控。

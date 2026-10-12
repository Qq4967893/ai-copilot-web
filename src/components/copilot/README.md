# components/copilot

Copilot 业务组件。应用外壳（侧边栏等）不在这里，在 `components/layout/`。

技术设计 §4.3 规划的完整分层是：

```text
components/copilot/
├── message/        # 本轮已实现：消息列表、气泡、受限 Markdown 渲染
├── composer/       # 本轮已实现：输入框
├── result/         # 未实现
├── table/          # 未实现
├── timeline/       # 未实现
├── evidence/       # 未实现
└── navigation/     # 未实现
```

本轮（基础架构阶段）只建 `message/` 和 `composer/`。后五个目录没有创建，因为
EchoAgent 不产出对应事件，没有任何真实数据可渲染 —— 建一堆空目录只会让人以为
已经有东西了。

## 未实现目录各自将渲染什么

渲染契约已经在后端冻结（`ai-copilot-api/app/agent/response.py`），TS 镜像在
`src/api/events.ts`。接真 Agent 时按下表对应：

| 目录          | 对应事件            | 对应类型                       | 说明                                                                       |
| ------------- | ------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `result/`     | `result.data`       | `ResultBlock`                  | 按 `kind` 分派到下面三种之一                                               |
| `table/`      | `result.data`       | `ResultBlock{kind:'table'}`    | 简单表格。必须套 `overflow-x-auto`，否则宽表撑破布局                       |
| `timeline/`   | `result.data`       | `ResultBlock{kind:'timeline'}` | 时间线。PRD §10.7.2 要求复杂查询优先用表格和时间线                         |
| `evidence/`   | `result.evidence`   | `Evidence`                     | 回答依据。`type` 区分事实/规则/实现/推断，**必须可区分**（技术设计 §15.2） |
| `navigation/` | `result.navigation` | `NavigationItem`               | 后台深链。`url` 一律用服务端给的值，前端**绝不**自行拼接（技术设计 §13.4） |

`ResultBlock{kind:'key_value'}` 和 `{kind:'list'}` 也归 `result/`。

## 设计稿里有、但本轮没做的

- **推荐追问**（设计稿 `design-mock-chat.html` 的 `.followups`）。`src/api/types.ts`
  和 `src/api/events.ts` 里没有任何字段承载它，后端契约已冻结。两条路都不好：
  硬编码假问题等于往内部工具里塞会被真点开的谎话，建一个永不渲染的组件等于死代码。
  等后端加了字段再做。

## 注意事项

- `message/MarkdownContent.tsx` 是**唯一**的富文本出口。XSS 策略集中在
  `src/lib/markdown.ts`，改渲染前先读那个文件的注释。
- 气泡按 `content_type` 分派渲染方式，**不是**按 `role`。后端给用户消息打
  `text`、给助手消息打 `markdown`（见 `app/conversation/service.py`）。今天两者
  等价，但一旦某个工具回显用户输入，按 role 判断就会把用户内容当 Markdown 渲染。
- 技术设计 §2.3 明确不向前端暴露：Chain-of-Thought、隐式推理步骤、内部 Prompt、
  内部凭证、未过滤的 Tool 原始敏感数据。加组件时别把 `tool.*` 的原始 payload 直接摊开。

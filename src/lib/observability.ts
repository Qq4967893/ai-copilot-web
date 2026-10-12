/**
 * 前端可观测性 —— 占位实现。
 *
 * 项目根 README 第 3 条：MVP 阶段不实现 OpenTelemetry / Metric 的具体代码，只留
 * 预留模板和说明。对应后端的 app/observability/otel.py，那边也是一个带注释的 no-op。
 *
 * 真要接的时候，这里需要做的事：
 *
 * 1. 引入 @opentelemetry/sdk-trace-web + @opentelemetry/instrumentation-fetch，
 *    在 main.tsx 挂载之前初始化。
 * 2. 打通 trace 链路：技术设计 §19.1 的链路是从 Browser 起算的
 *    （Browser → ai-copilot-api → Agent Run → MCP Call → internal-mcp-server → 下游 API）。
 *    后端目前只认 X-Copilot-Request-Id，还没有 W3C traceparent；要真正串起来，
 *    得先在 ai-copilot-api 侧接 OTel，两边同时改。
 * 3. 关联 ID（技术设计 §19.2）：trace_id / conversation_id / message_id /
 *    agent_run_id / tool_call_id。前端手上有前三个。
 * 4. 产品指标（技术设计 §19.6）：helpful_rate / navigation_click_rate 等需要前端埋点，
 *    其中 navigation_click_rate 要求后台深链的点击可被统计。
 *
 * 在那之前，排查问题靠 X-Copilot-Request-Id：前端每个请求都会带上，后端日志里的
 * request_id 是同一个值。见 lib/request-id.ts。
 */

export function setupObservability(): void {
  // 有意为空。见上方说明。
}

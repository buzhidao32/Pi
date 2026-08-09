// ============================================================
// llm.ts — 和 LLM 对话的唯一入口（发请求、重试、解析响应）
//
// 深度复刻①：流式输出（SSE）
//   - 发请求带 stream:true
//   - 边收边把增量文本通过 onDelta 回调出去（实时显示）
//   - 同时把每块拼成完整 message 返回（agent 循环不需要大改）
//
// 接线（import）说明：
//   import { API_URL } from "./config"   → 用 config.ts 里的配置
//   import type { ... } from "./types"    → 用 types.ts 里的类型
// ============================================================

import { API_URL, API_KEY, MODEL } from "./config";
import type { Message, ToolDef, ToolCall, ChatResponse } from "./types";

// ---- SSE 解析器（把"字节流"切成"一个个 data: 事件"） ----
// 这是流式的核心难点，单独抽成一个函数，读起来清晰。
// 它是个【异步生成器】(async generator)：每次 yield 出一个解析好的事件对象。
async function* parseSSE(res: Response): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder(); // 把二进制 chunk 解码成字符串
  let buffer = ""; // 累积缓冲（网络分块可能把一条事件拆成两半）

  // 边收边处理：res.body 是可读流
  for await (const chunk of res.body as ReadableStream<Uint8Array>) {
    // 把二进制小段解码成文本，拼进缓冲
    buffer += decoder.decode(chunk, { stream: true });

    // 按空行("\n\n")切分 SSE 事件。一条事件 = data: {...}\n\n
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sep); // 取出这一条事件
      buffer = buffer.slice(sep + 2); // 剩下的是后续事件

      // 只处理以 "data: " 开头的行
      const line = rawEvent.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;

      const payload = line.slice(6); // 去掉 "data: " 前缀
      if (payload === "[DONE]") return; // 结束标记

      try {
        yield JSON.parse(payload); // 把 JSON 字符串解析成对象，交给调用方
      } catch {
        // 解析失败的一小块忽略掉（可能是不完整的数据）
      }
    }
  }
}

// ---- 合并流式 tool_calls 增量 ----
// 非流式时 tool_calls 是完整数组；流式时它是"分块拼出来"的：
//   第一块: {index:0, id:"call_1", function:{name:"bash"}}
//   第二块: {index:0, function:{arguments:"{\"command"}}
//   第三块: {index:0, function:{arguments:"\":\"ls\"}"}}
// 所以要把同一 index 的块拼起来。
function mergeDeltaToolCall(accumulated: ToolCall[], deltaToolCall: Record<string, unknown>): ToolCall[] {
  const index = (deltaToolCall.index as number) ?? 0;
  // 如果这个 index 还没出现过，先建一个空壳
  if (!accumulated[index]) {
    accumulated[index] = { id: "", type: "function", function: { name: "", arguments: "" } };
  }
  const target = accumulated[index];
  // 逐字段拼接增量
  if (deltaToolCall.id) target.id = deltaToolCall.id as string;
  if ((deltaToolCall.function as Record<string, unknown>)?.name) {
    target.function.name += (deltaToolCall.function as Record<string, unknown>).name as string;
  }
  if ((deltaToolCall.function as Record<string, unknown>)?.arguments) {
    target.function.arguments += (deltaToolCall.function as Record<string, unknown>).arguments as string;
  }
  return accumulated;
}

// ---- 对话（流式版） ----
// onDelta 回调：每收到一段增量文本就调用它（用于实时打印）。
// 返回的仍是完整 message（含拼好的 content 和 tool_calls），
// 所以 agent 循环基本不用改。
export async function chat(
  messages: Message[],
  tools?: ToolDef[],
  onDelta?: (delta: string) => void,
): Promise<ChatResponse> {
  for (let attempt = 1; ; attempt++) {
    const body: Record<string, unknown> = { model: MODEL, messages, stream: true };
    if (tools) body.tools = tools;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    // 可重试的错误：429 限流、5xx 服务器故障。等 1s、2s、4s…
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const delay = 1000 * attempt;
      console.log(`\n(上游 ${res.status}，${delay / 1000}s 后重试…)`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API 错误 ${res.status}: ${text}`);
    }

    // ---- 流式解析主循环 ----
    let content = ""; // 累积完整文本
    let toolCalls: ToolCall[] = []; // 累积工具调用
    let usage: ChatResponse["usage"];

    for await (const event of parseSSE(res)) {
      const choice = (event.choices as { delta?: { content?: string; tool_calls?: unknown[] } }[] | undefined)?.[0];
      const delta = choice?.delta;

      // 增量文本：拼进 content，同时回调给调用方实时显示
      if (delta?.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }

      // 增量工具调用：合并进 toolCalls
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          toolCalls = mergeDeltaToolCall(toolCalls, tc as Record<string, unknown>);
        }
      }

      // usage 统计（有些端点支持流式返回 usage）
      if (event.usage) usage = event.usage as ChatResponse["usage"];
    }

    // 组装最终 message（与之前非流式返回的结构一致）
    const message: Message = { role: "assistant", content };
    if (toolCalls.length > 0) message.tool_calls = toolCalls;

    return { message, usage };
  }
}

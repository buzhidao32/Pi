// ============================================================
// llm.ts — 和 LLM 对话的唯一入口（发请求、重试、解析响应）
//
// 接线（import）说明：
//   import { API_URL } from "./config"   → 用 config.ts 里的配置
//   import type { ... } from "./types"    → 用 types.ts 里的类型
// 注意 "./config" 不用写 .ts 后缀（TS 会自动找）
// ============================================================

import { API_URL, API_KEY, MODEL } from "./config";
import type { Message, ToolDef, ChatResponse } from "./types";

// 发一次请求给 LLM，拿到完整消息（可能含 tool_calls）
// 带自动重试：429(限流)/5xx(服务器错误) 时按指数退避重试几次
export async function chat(messages: Message[], tools?: ToolDef[]): Promise<ChatResponse> {
  for (let attempt = 1; ; attempt++) {
    const body: Record<string, unknown> = { model: MODEL, messages };
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

    const data = (await res.json()) as {
      choices: { message: Message; finish_reason: string }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return { message: data.choices[0].message, usage: data.usage };
  }
}

// ============================================================
// compact.ts — 上下文压缩（深度复刻⑤）＋迭代摘要（深度复刻⑦）
//
// 对标 pi: packages/agent/src/harness/compaction/compaction.ts
// pi 做的："历史对话太长 → 估算超了 → 找切点（保留最近一点）→
//           用 LLM 出摘要 → 摘要顶替旧历史"。
//
// ⑦ 的升级：摘要从"从零重压"变成【迭代更新】。
//   第一次压缩：把旧历史整段交给 initial 摘要
//   以后再压：历史里已经有上一次的摘要，只把"上次摘要之后新增的旧消息"
//             交给 update（带上旧摘要），增量合并 → 永远只留一条摘要。
//   对标 pi 的 UPDATE_SUMMARIZATION_PROMPT：新增消息 + <previous-summary> 一起喂。
//
// 关键设计（和③execute ④truncate 一脉相承）：
//   本文件是【纯逻辑】，不认识网络、不认识 LLM——
//   initial/update 两个摘要函数由外部注入，测试塞假的，不碰真 API。
// ============================================================

import type { Message } from "./types";

// ---- 1. 估算 ----
// 保守估算：大约 4 个字符 ≈ 1 个 token。
// （英文平均每 token 约 4 字符，中文更省；保守只会"早压缩"，不会爆。）
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// 估算整段历史用了多少 token（每条约略加一点固定开销）
export function estimateContextTokens(messages: Message[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.content.length;
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        chars += tc.function.name.length + tc.function.arguments.length;
      }
    }
    chars += 6; // 每条消息的"包装"（role、id 等）也占 token
  }
  return Math.ceil(chars / 4);
}

// 超没超触发线（agent 在每次问 LLM 前检查）
export function shouldCompact(messages: Message[], maxChars: number): boolean {
  return estimateContextTokens(messages) * 4 > maxChars; // 用字符数比较，好读
}

// ---- 2. 找切点 ----
// 返回"要保留的第一个下标"：它和它之后的消息留下，之前的历史拿去压缩。
// 版本 ⑦：加了个 fromIndex —— 压缩只针对"上次摘要之后"这段历史，
// 老摘要本身和它更早的内容不再重算。
// 规则：从尾巴往回攒保留预算；无论如何至少保住"最后一次用户提问"那一整轮；
//       保留段必须从"用户消息"开头（不能从 tool 回复中间开局）。
export function findCutIndex(messages: Message[], keepChars: number, fromIndex = 1): number {
  // 找 [fromIndex..末尾] 里最近一条 user 消息（找不到 = 这段没用户内容，不压）
  let lastUser = -1;
  for (let i = messages.length - 1; i >= fromIndex; i--) {
    if (messages[i].role === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser === -1) return messages.length;

  let used = 0;
  let cut = messages.length;
  for (let i = messages.length - 1; i >= fromIndex; i--) {
    used += messages[i].content.length + 6;
    if (used >= keepChars || i === lastUser) {
      cut = i;
      break;
    }
  }

  // 保底：预算再小，也不要把"最后一次用户提问"压掉
  cut = Math.min(cut, lastUser);

  // 让保留段从"用户消息"开头（可能落在 assistant/tool 上，往后拨到 user）
  while (cut < messages.length && messages[cut].role !== "user") cut++;

  return cut; // === 数组长度 → 没东西可压
}

// ---- 3. 把历史序列化成纯文本（给摘要用）----
export function serializeHistory(msgs: Message[]): string {
  return msgs
    .map((m) => {
      switch (m.role) {
        case "user":
          return `用户: ${m.content}`;
        case "assistant":
          return `助手: ${m.content || "[调用了工具]"}`;
        case "tool":
          return `工具结果: ${m.content}`;
        default:
          return `系统: ${m.content}`;
      }
    })
    .join("\n\n");
}

// ---- 4. 找"上一次的摘要" ----
// 我们塞回去的摘要是一条 system 消息、内容以 SUMMARY_PREFIX 开头。
// 找最后一条这样的消息 → 拿到它和里面的摘要文本（供 update 合并）。
export const SUMMARY_PREFIX = "【历史对话压缩摘要】";

export function findLastSummary(messages: Message[]): { index: number; text: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "system" && m.content.startsWith(SUMMARY_PREFIX)) {
      return { index: i, text: m.content.slice(SUMMARY_PREFIX.length).trim() };
    }
  }
  return null;
}

// ---- 5. 压缩主流程（迭代摘要版）----
// handlers 由外部注入：
//   initial(historyText)            → 第一次压缩：从零写摘要
//   update(previous, newHistory)    → 以后压缩：旧摘要 + 新增历史，增量合并
// 返回新的消息数组：[系统人设, 摘要(唯一一条), ...最近保留的对话]
export interface SummarizeHandlers {
  initial: (historyText: string) => Promise<string>;
  update: (previousSummary: string, newHistoryText: string) => Promise<string>;
}

export async function compactHistory(
  messages: Message[],
  handlers: SummarizeHandlers,
  keepChars: number,
): Promise<Message[]> {
  if (messages.length < 3) return messages; // 太短，不值得压

  const prev = findLastSummary(messages);
  const start = prev ? prev.index + 1 : 1; // 只压"上次摘要"之后的旧历史

  const cut = findCutIndex(messages, keepChars, start);
  if (cut <= start || cut >= messages.length) return messages; // 没有旧历史可压，或全都得留

  // 这轮新增的"旧消息"（上次摘要之后、切点之前）
  const newHistoryText = serializeHistory(messages.slice(start, cut));

  // 迭代核心：有旧摘要 → update（增量合并）；没有 → initial（从零写）
  const summaryText = prev
    ? await handlers.update(prev.text, newHistoryText)
    : await handlers.initial(newHistoryText);
  if (!summaryText.trim()) return messages; // 摘要为空就别动手

  const summaryMsg: Message = {
    role: "system",
    content: `${SUMMARY_PREFIX}\n${summaryText}`,
  };
  // 旧的摘要消息被"吃掉"了——返回里只有这一条最新的
  return [messages[0], summaryMsg, ...messages.slice(cut)];
}
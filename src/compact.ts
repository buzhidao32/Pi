// ============================================================
// compact.ts — 上下文压缩（深度复刻⑤）
//
// 对标 pi: packages/agent/src/harness/compaction/compaction.ts
// pi 做的："历史对话太长 → 估算超了 → 找切点（保留最近一点）→
//           把更早的历史拿去让 LLM 出摘要 → 摘要顶替旧历史"。
// 我们复刻同一套骨架，但简化：
//   - 估算：chars/4（pi 也用它做保守估算）
//   - 触发线、保留预算：两个数字（config.ts）
//   - 切点：从尾巴往回攒，至少保住"最后一轮用户提问"
//   - 摘要：由注入进来的 summarize 函数生成（测试时塞假的）
//
// 关键设计（和③的 execute、④的 truncate 一脉相承）：
//   本文件是【纯逻辑】，不认识网络、不认识 LLM——
//   摘要由外部注入，所以它能被测试凭空测，不用真调 API。
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
// 规则：从尾巴往回攒保留预算；无论如何至少保住"最后一次用户提问"那一整轮；
//       保留段必须从"用户消息"开头（不能从 tool 回复中间开局）。
export function findCutIndex(messages: Message[], keepChars: number): number {
  // 找最近一条 user 消息（找不到 = 全是系统消息，没必要压缩）
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 1; i--) {
    if (messages[i].role === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser === -1) return messages.length;

  let used = 0;
  let cut = messages.length;
  for (let i = messages.length - 1; i >= 1; i--) {
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

// ---- 4. 压缩主流程 ----
// summarize 由外部注入：(历史纯文本) => Promise<摘要文本>
// 返回新的消息数组：[系统人设, 摘要, ...最近保留的对话]
export async function compactHistory(
  messages: Message[],
  summarize: (historyText: string) => Promise<string>,
  keepChars: number,
): Promise<Message[]> {
  if (messages.length < 3) return messages; // 太短，不值得压

  const cut = findCutIndex(messages, keepChars);
  if (cut <= 1 || cut >= messages.length) return messages; // 没有旧历史可压，或全都得留

  const oldBlock = messages.slice(1, cut); // 下标 0 的 system 人设永远保留
  const summaryText = await summarize(serializeHistory(oldBlock));
  if (!summaryText.trim()) return messages; // 摘要为空就别动手

  const summaryMsg: Message = {
    role: "system", // 摘要当"系统上下文"给模型看（多 system 消息各主流端点都支持）
    content: `【历史对话压缩摘要】\n${summaryText}`,
  };
  return [messages[0], summaryMsg, ...messages.slice(cut)];
}
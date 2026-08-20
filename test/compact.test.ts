// ============================================================
// test/compact.test.ts — 上下文压缩（深度复刻⑤）
//
// 测 src/compact.ts 的承诺：
//   1. 估算：chars/4 保守换算（estimateTokens / estimateContextTokens）
//   2. 触发：超不超触发线（shouldCompact）
//   3. 切点：从尾巴往回攒、至少保住最后一轮用户提问、保留段从"用户"开头
//   4. 序列化：历史 → 纯文本（给 LLM 做摘要）
//   5. 压缩主流程：注入假 summarize，验证"旧历史被摘要顶替、最近的还留着"、
//      摘要被塞成系统消息、原数组不被改动、太短/空摘要不折腾
// ============================================================

import { describe, it, expect, vi } from "vitest";
import {
  estimateTokens,
  estimateContextTokens,
  shouldCompact,
  findCutIndex,
  serializeHistory,
  compactHistory,
} from "../src/compact";
import type { Message } from "../src/types";

// 造消息的小工具
const m = (role: Message["role"], content: string): Message =>
  role === "tool"
    ? { role, content, tool_call_id: "call_1" }
    : { role, content };

// 一个 7 条消息的"长对话"（system + 一轮+一轮）
const longHistory = (): Message[] => [
  m("system", "你是一个助手"),
  m("user", "第一问"), // 1
  m("assistant", "第一答"), // 2
  m("tool", "工具结果1"), // 3
  m("user", "第二问"), // 4 ← 最后一次用户提问
  m("assistant", "第二答"), // 5
  m("tool", "工具结果2"), // 6
];

describe("估算", () => {
  it("estimateTokens：约 4 字符 = 1 token，向上取整", () => {
    expect(estimateTokens("hello")).toBe(2); // ceil(5/4)
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(8))).toBe(2); // ceil(8/4)
  });

  it("estimateContextTokens：内容 + 少量包装开销", () => {
    const msgs = [m("user", "x".repeat(40))];
    expect(estimateContextTokens(msgs)).toBe(12); // ceil((40+6)/4)
  });
});

describe("触发", () => {
  it("总字符数超过触发线 → 要压缩", () => {
    const msgs = [m("user", "b".repeat(1000)), m("assistant", "c".repeat(1000))];
    // 估算 tokens：(1000+6 + 1000+6)/4 = 503，503*4 = 2012 字符
    expect(shouldCompact(msgs, 2000)).toBe(true);
    expect(shouldCompact(msgs, 3000)).toBe(false);
  });
});

describe("切点 findCutIndex", () => {
  it("预算再小也至少保住最后一次用户提问那一整轮", () => {
    const msgs = longHistory();
    // keepChars=0：理论上每次累加都超，但保底切在最近一次 user（下标4）
    expect(findCutIndex(msgs, 0)).toBe(4);
  });

  it("预算足够时：从尾巴往回攒，切点不会落在 tool 回复中间", () => {
    const msgs = longHistory();
    // 预算只够最后 3 条（tool2 / 第二答 / 第二问）→ 切点拨回用户消息开头
    const cut = findCutIndex(msgs, 10);
    expect(cut).toBe(4);
    expect(msgs[cut].role).toBe("user"); // 保留段一定从"用户"开头
  });

  it("全是系统消息（没有用户）→ 返回数组长度（没东西可压）", () => {
    const msgs = [m("system", "a"), m("system", "b")];
    expect(findCutIndex(msgs, 0)).toBe(2);
  });
});

describe("序列化 serializeHistory", () => {
  it("转成带角色前缀的纯文本", () => {
    const text = serializeHistory([m("user", "hi"), m("assistant", "hello")]);
    expect(text).toBe("用户: hi\n\n助手: hello");
  });

  it("assistant 没内容时标注'调用了工具'", () => {
    const text = serializeHistory([m("assistant", "")]);
    expect(text).toBe("助手: [调用了工具]");
  });
});

describe("压缩主流程 compactHistory", () => {
  it("旧历史被摘要顶替，最近的对话原样保留，摘要变成系统消息", async () => {
    const summarize = vi.fn(async () => "第一轮做完了一个读文件任务");
    const msgs = longHistory();

    const compacted = await compactHistory(msgs, summarize, 6);

    // summarize 拿到的是被剪掉的历史（下标 1..3：第一问/第一答/工具结果1）
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledWith("用户: 第一问\n\n助手: 第一答\n\n工具结果: 工具结果1");

    expect(compacted.length).toBe(5); // system + 摘要 + 3 条最近的
    expect(compacted[0]).toBe(msgs[0]); // 系统人设原样保留
    expect(compacted[1].role).toBe("system");
    expect(compacted[1].content).toContain("第一轮做完了一个读文件任务");
    expect(compacted[2].content).toBe("第二问"); // 最近的对话原样
    expect(compacted[3].content).toBe("第二答");
    expect(compacted[4].content).toBe("工具结果2");
  });

  it("历史太短（少于 3 条）→ 不调 summarize，原样返回", async () => {
    const summarize = vi.fn(async () => "S");
    const msgs = [m("system", "a"), m("user", "b")];
    const out = await compactHistory(msgs, summarize, 6);
    expect(out).toBe(msgs); // 同一引用
    expect(summarize).not.toHaveBeenCalled();
  });

  it("摘要为空 → 不动历史", async () => {
    const summarize = vi.fn(async () => "");
    const msgs = longHistory();
    const out = await compactHistory(msgs, summarize, 6);
    expect(out).toBe(msgs);
  });

  it("纯函数：压缩不修改传入的原数组", async () => {
    const summarize = vi.fn(async () => "S");
    const msgs = longHistory();
    const original = JSON.stringify(msgs);
    await compactHistory(msgs, summarize, 6);
    expect(JSON.stringify(msgs)).toBe(original); // 原数组没被动过
  });
});
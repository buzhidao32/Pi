// ============================================================
// test/compact.test.ts — 上下文压缩（深度复刻⑤ + ⑦ 迭代摘要）
//
// 测 src/compact.ts 的承诺：
//   1. 估算：chars/4 保守换算（estimateTokens / estimateContextTokens）
//   2. 触发：超不超触发线（shouldCompact）
//   3. 切点：从尾巴往回攒、至少保住最后一轮用户提问、保留段从"用户"开头、
//      ⑦ 的 fromIndex 只压"上次摘要之后"的
//   4. 序列化：历史 → 纯文本
//   5. 找上次摘要：findLastSummary 认得出自己写的摘要消息
//   6. 压缩主流程（注入 initial/update 假函数）：
//      - 第一次：调 initial，不调 update
//      - 之后：调 update（旧摘要+新增），initial 不再调，结果只留一条摘要
//      - 太短 / 空摘要 / 纯函数不改原数组
// ============================================================

import { describe, it, expect, vi } from "vitest";
import {
  estimateTokens,
  estimateContextTokens,
  shouldCompact,
  findCutIndex,
  serializeHistory,
  findLastSummary,
  compactHistory,
  SUMMARY_PREFIX,
  type SummarizeHandlers,
} from "../src/compact";
import type { Message } from "../src/types";

// 造消息的小工具
const m = (role: Message["role"], content: string): Message =>
  role === "tool" ? { role, content, tool_call_id: "call_1" } : { role, content };

// system 人设 + 一串对话
const longHistory = (): Message[] => [
  m("system", "你是一个助手"),
  m("user", "第一问"),
  m("assistant", "第一答"),
  m("tool", "工具结果1"),
  m("user", "第二问"),
  m("assistant", "第二答"),
  m("tool", "工具结果2"),
];

// 带一条旧摘要的历史（下标 1 是摘要，之后是新加的对话）
const historyWithSummary = (): Message[] => [
  m("system", "你是一个助手"),
  m("system", `${SUMMARY_PREFIX}\n旧摘要内容`),
  m("user", "问题A"),
  m("assistant", "回复A"),
  m("tool", "结果A"),
  m("user", "问题B"),
  m("assistant", "回复B"),
  m("tool", "结果B"),
];

// 造一对"假摘要函数"：initial/update 都是 spy，返回可预测的字符串
const makeHandlers = (): {
  handlers: SummarizeHandlers;
  initial: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} => {
  const initial = vi.fn(async (historyText: string) => `I:${historyText}`);
  const update = vi.fn(async (previous: string, newHistory: string) => `U(${previous}): ${newHistory}`);
  return { handlers: { initial, update }, initial, update };
};

describe("估算", () => {
  it("estimateTokens：约 4 字符 = 1 token，向上取整", () => {
    expect(estimateTokens("hello")).toBe(2);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(8))).toBe(2);
  });

  it("estimateContextTokens：内容 + 少量包装开销", () => {
    expect(estimateContextTokens([m("user", "x".repeat(40))])).toBe(12); // ceil((40+6)/4)
  });
});

describe("触发", () => {
  it("总字符数超过触发线 → 要压缩", () => {
    const msgs = [m("user", "b".repeat(1000)), m("assistant", "c".repeat(1000))];
    expect(shouldCompact(msgs, 2000)).toBe(true);
    expect(shouldCompact(msgs, 3000)).toBe(false);
  });
});

describe("切点 findCutIndex", () => {
  it("预算再小也至少保住最后一次用户提问那一整轮", () => {
    expect(findCutIndex(longHistory(), 0)).toBe(4);
  });

  it("预算足够时：保留段落在用户消息开头", () => {
    const cut = findCutIndex(longHistory(), 10);
    expect(cut).toBe(4);
    expect(longHistory()[cut].role).toBe("user");
  });

  it("⑦ fromIndex：切点不会跑到'上次摘要'之前", () => {
    const msgs = historyWithSummary(); // 下标 1 是旧摘要
    const cut = findCutIndex(msgs, 0, 2); // 只在摘要之后找
    expect(cut).toBeGreaterThanOrEqual(2);
    expect(cut).toBe(5); // 落在"问题B"（最后一次用户提问）
  });

  it("fromIndex 超出范围（没有可压的）→ 返回数组长度", () => {
    const msgs = historyWithSummary();
    expect(findCutIndex(msgs, 0, 8)).toBe(8); // 范围空了
  });

  it("全是系统消息（没有用户）→ 返回数组长度", () => {
    expect(findCutIndex([m("system", "a"), m("system", "b")], 0)).toBe(2);
  });
});

describe("序列化 serializeHistory", () => {
  it("转成带角色前缀的纯文本", () => {
    expect(serializeHistory([m("user", "hi"), m("assistant", "hello")])).toBe("用户: hi\n\n助手: hello");
  });

  it("assistant 没内容时标注'调用了工具'", () => {
    expect(serializeHistory([m("assistant", "")])).toBe("助手: [调用了工具]");
  });
});

describe("findLastSummary 找上次摘要", () => {
  it("找不到 → null", () => {
    expect(findLastSummary(longHistory())).toBeNull();
  });

  it("找得到 → 返回下标 + 摘要文本（不含前缀）", () => {
    const r = findLastSummary(historyWithSummary());
    expect(r).not.toBeNull();
    expect(r!.index).toBe(1);
    expect(r!.text).toBe("旧摘要内容");
  });

  it("多条摘要取最后一条", () => {
    const msgs = [
      m("system", "a"),
      m("system", `${SUMMARY_PREFIX}\n最早`),
      m("user", "x"),
      m("system", `${SUMMARY_PREFIX}\n最近`),
    ];
    expect(findLastSummary(msgs)?.index).toBe(3);
    expect(findLastSummary(msgs)?.text).toBe("最近");
  });
});

describe("压缩主流程 compactHistory（⑦ 迭代摘要）", () => {
  it("第一次压缩：只调 initial，旧历史变摘要，最近的保留", async () => {
    const { handlers, initial, update } = makeHandlers();
    const msgs = longHistory();

    const compacted = await compactHistory(msgs, handlers, 6);

    expect(initial).toHaveBeenCalledTimes(1);
    expect(initial).toHaveBeenCalledWith("用户: 第一问\n\n助手: 第一答\n\n工具结果: 工具结果1");
    expect(update).not.toHaveBeenCalled(); // 没有旧摘要，绝不走增量

    expect(compacted.length).toBe(5); // system + 摘要 + 3 条最近
    expect(compacted[0]).toBe(msgs[0]);
    expect(compacted[1].role).toBe("system");
    expect(compacted[1].content).toContain("I:用户: 第一问");
    expect(compacted[2].content).toBe("第二问");
    expect(compacted[4].content).toBe("工具结果2");
  });

  it("已有旧摘要：只调 update（旧摘要+新增），initial 不再调，结果只留一条摘要", async () => {
    const { handlers, initial, update } = makeHandlers();
    const msgs = historyWithSummary();

    const compacted = await compactHistory(msgs, handlers, 8);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("旧摘要内容", "用户: 问题A\n\n助手: 回复A\n\n工具结果: 结果A");
    expect(initial).not.toHaveBeenCalled();

    expect(compacted.length).toBe(5); // system + 1 条新摘要 + 问题B/回复B/结果B
    expect(compacted[1].content).toContain("U(旧摘要内容)");
    // 旧摘要消息被"吃掉"了：全片只出现一条摘要
    expect(compacted.filter((x) => x.role === "system" && x.content.startsWith(SUMMARY_PREFIX)).length).toBe(1);
    expect(compacted[2].content).toBe("问题B"); // 最近对话原样保留
    expect(compacted[4].content).toBe("结果B");
  });

  it("历史太短（少于 3 条）→ 两个函数都不调，原样返回", async () => {
    const { handlers, initial, update } = makeHandlers();
    const msgs = [m("system", "a"), m("user", "b")];
    const out = await compactHistory(msgs, handlers, 6);
    expect(out).toBe(msgs);
    expect(initial).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("摘要为空 → 不动历史", async () => {
    const empty = vi.fn(async () => "");
    const msgs = longHistory();
    const out = await compactHistory(msgs, { initial: empty, update: empty }, 6);
    expect(out).toBe(msgs); // 同一引用：一字未动
  });
});
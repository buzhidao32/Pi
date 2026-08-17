// ============================================================
// test/parallel.test.ts — 多工具并行执行器（深度复刻③）
//
// 测 execute.ts 的核心承诺：
//   1. 并行：一批工具同时开工（用"同时活跃数"证明，比看时钟更准）
//   2. 顺序：结果按调用顺序回喂（先调的不一定先跑完）
//   3. 串行回退：批里有一个 sequential 工具 → 整批排队（活跃数永不超 1）
//   4. 错误隔离：一个工具挂掉，其他照常完成，整批不炸
//   5. 未知工具 / 参数解析失败 → 变成错误结果，不中断
//
// 关键技巧：不 import agent.ts（它会连真 LLM），只 import execute.ts，
// 因为它只依赖类型，可以塞假的工具进来测。
// ============================================================

import { describe, it, expect } from "vitest";
import { executeToolCalls, toToolMessages } from "../src/execute";
import type { Tool, ToolCall, ToolExecutionMode } from "../src/types";

// ---- 小工具们 ----

// 睡眠（Node 的 setTimeout 包一层 Promise）
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 全局"活跃计数器"：每个工具的 run 开始 +1、结束 -1。
// 并行时它会到 2；串行时永远到不了 2 —— 这就是铁证。
const tracker = { active: 0, maxActive: 0 };

interface FakeToolOptions {
  delay: number; // 假装慢（模拟 I/O 等待）
  label: string; // 跑完返回的内容
  throwError?: boolean; // 要不要故意抛异常
  mode?: ToolExecutionMode; // 默认并行
}

// 造一个假的工具（不碰真实文件系统）
function fakeTool(name: string, opts: FakeToolOptions): Tool {
  return {
    def: { type: "function", function: { name, description: "", parameters: {} } },
    executionMode: opts.mode,
    run: async () => {
      tracker.active++; // 开工：活跃数 +1
      tracker.maxActive = Math.max(tracker.maxActive, tracker.active);
      await sleep(opts.delay); // 等待期间让别人跑
      tracker.active--; // 收工：活跃数 -1
      if (opts.throwError) throw new Error(`假装失败: ${opts.label}`);
      return opts.label;
    },
  };
}

// 造一个假的 LLM 工具调用消息
function call(id: string, name: string, args: unknown): ToolCall {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

const reset = () => {
  tracker.active = 0;
  tracker.maxActive = 0;
};

describe("executeToolCalls 并行模式", () => {
  it("两个工具同时跑：活跃数到 2，结果按调用顺序回喂", async () => {
    reset();
    const slow = fakeTool("slow", { delay: 80, label: "慢的" });
    const fast = fakeTool("fast", { delay: 15, label: "快的" });
    const calls = [call("1", "slow", {}), call("2", "fast", {})];

    const results = await executeToolCalls(calls, { slow, fast }, "parallel");

    expect(tracker.maxActive).toBe(2); // 铁证：确实重叠了
    // 结果顺序 = 调用顺序，哪怕 slow 最后才跑完
    expect(results.map((r) => r.result)).toEqual(["慢的", "快的"]);
    expect(results.map((r) => r.toolCall.id)).toEqual(["1", "2"]);
  });

  it("parallel 比 sequential 快（受最慢的支配，不是总和）", async () => {
    reset();
    const a = fakeTool("a", { delay: 60, label: "A" });
    const b = fakeTool("b", { delay: 30, label: "B" });
    const calls = [call("1", "a", {}), call("2", "b", {})];

    const t0 = Date.now();
    await executeToolCalls(calls, { a, b }, "parallel");
    const parallelMs = Date.now() - t0;

    reset();
    const t1 = Date.now();
    await executeToolCalls(calls, { a, b }, "sequential");
    const sequentialMs = Date.now() - t1;

    // 并行 ≈ 60ms（最慢的），串行 ≈ 90ms（总和）
    // 留足余量：并行必须明显快于串行
    expect(parallelMs).toBeLessThan(sequentialMs - 15);
  });
});

describe("executeToolCalls 串行回退", () => {
  it("批里有一个 sequential 工具 → 整批排队（活跃数永不超 1）", async () => {
    reset();
    const bossy = fakeTool("bossy", { delay: 30, label: "独占", mode: "sequential" });
    const normal = fakeTool("normal", { delay: 10, label: "普通" });
    const calls = [call("1", "bossy", {}), call("2", "normal", {})];

    const results = await executeToolCalls(calls, { bossy, normal }, "parallel");

    expect(tracker.maxActive).toBe(1); // 铁证：没有任何重叠
    expect(results.map((r) => r.result)).toEqual(["独占", "普通"]);
  });

  it("全局 mode=sequential 强制串行（即使所有工具都可并行）", async () => {
    reset();
    const a = fakeTool("a", { delay: 20, label: "A" });
    const b = fakeTool("b", { delay: 10, label: "B" });
    const calls = [call("1", "a", {}), call("2", "b", {})];

    await executeToolCalls(calls, { a, b }, "sequential");

    expect(tracker.maxActive).toBe(1);
  });
});

describe("executeToolCalls 错误隔离", () => {
  it("一个工具抛异常 → 变成错误结果，另一个照常完成", async () => {
    reset();
    const broken = fakeTool("broken", { delay: 10, label: "坏", throwError: true });
    const fine = fakeTool("fine", { delay: 10, label: "好" });
    const calls = [call("1", "broken", {}), call("2", "fine", {})];

    // 关键：整批要 resolve（不抛出来），否则 agent 循环就崩了
    const results = await executeToolCalls(calls, { broken, fine }, "parallel");

    expect(results[0].result).toContain("工具执行出错");
    expect(results[0].result).toContain("假装失败");
    expect(results[1].result).toBe("好"); // 队友没被牵连
  });

  it("未知工具 / 参数解析失败 → 变成错误结果，不中断整批", async () => {
    reset();
    const fine = fakeTool("fine", { delay: 5, label: "好" });

    // 一个不存在的工具名，一个参数不是合法 JSON（正常不会发生，但防御）
    const calls: ToolCall[] = [
      call("1", "ghost", {}),
      {
        id: "2",
        type: "function",
        function: { name: "fine", arguments: "{这不是 JSON" },
      },
      call("3", "fine", {}),
    ];

    const results = await executeToolCalls(calls, { fine }, "parallel");

    expect(results[0].result).toContain("未知工具 ghost");
    expect(results[1].result).toContain("参数解析出错");
    expect(results[2].result).toBe("好"); // 第三个照常跑了
  });
});

describe("toToolMessages 回喂配对", () => {
  it("按调用顺序生成 tool 消息，tool_call_id 一一对上", async () => {
    const results = [
      { toolCall: call("c1", "read", { path: "a" }), result: "内容A" },
      { toolCall: call("c2", "write", { path: "b" }), result: "已写B" },
    ];
    const messages = toToolMessages(results);
    expect(messages.map((m) => m.role)).toEqual(["tool", "tool"]);
    expect(messages.map((m) => m.content)).toEqual(["内容A", "已写B"]);
    expect(messages.map((m) => m.tool_call_id)).toEqual(["c1", "c2"]);
  });
});
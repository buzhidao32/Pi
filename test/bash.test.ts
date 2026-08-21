// ============================================================
// test/bash.test.ts — bash 工具（深度复刻⑧：超时机制）
//
// 测 bash.ts 的承诺：
//   1. resolveTimeoutMs 校验：undefined 不限制 / 秒→毫秒 / 非法值抛错 / 超上限抛错
//   2. 集成（真跑一条命令）：
//      - 正常命令在超时内完成 → 正常返回
//      - 卡住的命令超时 → 被终止 + 报"超时" + 不会真等满
// ============================================================

import { describe, it, expect } from "vitest";
import { resolveTimeoutMs, run as bashRun } from "../src/tools/bash";

describe("resolveTimeoutMs 校验", () => {
  it("undefined → undefined（默认不限制）", () => {
    expect(resolveTimeoutMs(undefined)).toBeUndefined();
  });

  it("正常秒数 → 毫秒", () => {
    expect(resolveTimeoutMs(5)).toBe(5000);
    expect(resolveTimeoutMs(0.2)).toBe(200);
  });

  it("0 / 负数 / NaN / 字符串非数字 → 抛错", () => {
    expect(() => resolveTimeoutMs(0)).toThrow("大于 0");
    expect(() => resolveTimeoutMs(-3)).toThrow("大于 0");
    expect(() => resolveTimeoutMs(NaN)).toThrow("大于 0");
    expect(() => resolveTimeoutMs("abc")).toThrow("大于 0");
  });

  it("超过上限 → 抛错", () => {
    expect(() => resolveTimeoutMs(100000)).toThrow("最大 600 秒");
  });
});

describe("bash 超时集成（真跑命令）", () => {
  it("正常命令在超时内完成 → 正常返回", async () => {
    const out = await bashRun({ command: "echo hi", timeout: 10 });
    expect(out).toContain("hi");
  });

  it("卡住的命令超时 → 被终止并提示，不等满", async () => {
    const t0 = Date.now();
    const out = await bashRun({ command: 'node -e "setTimeout(()=>{}, 5000)"', timeout: 0.2 });
    const elapsed = Date.now() - t0;

    expect(out).toContain("超时"); // 友好提示
    expect(out).toContain("0.2"); // 提示里带超时秒数
    expect(elapsed).toBeLessThan(3000); // 别真等 5 秒
  });

  it("不传 timeout 的正常命令照常执行（默认不限制）", async () => {
    const out = await bashRun({ command: "echo hi" });
    expect(out).toContain("hi");
  });
});
// ============================================================
// test/session.test.ts — session.ts 的自动化测试
//
// 测试代码的三件套（vitest）：
//   describe("组名")   → 把相关的测试分组
//   it("描述")          → 一个具体测试
//   expect(x).toBe(y)   → 断言：x 应该等于 y
//
// 这一组测什么：session 的"存→取→空"三个行为
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { saveSession, loadSession } from "../src/session";

const FILE = "sessions/latest.json";

// beforeEach / afterEach：每个测试【前】/【后】自动跑一次
beforeEach(() => {
  // 测试前确保没有旧文件（避免干扰）
  if (existsSync(FILE)) unlinkSync(FILE);
});

afterEach(() => {
  // 测试后清理，不留垃圾
  if (existsSync(FILE)) unlinkSync(FILE);
});

describe("saveSession 和 loadSession", () => {
  it("保存后能读回相同内容（存→取 往返）", async () => {
    const msgs = [
      { role: "system", content: "你是助手" },
      { role: "user", content: "你好" },
    ];
    await saveSession(msgs as never); // 保存（异步，要 await）
    const loaded = loadSession(); // 读回（同步）
    expect(loaded).toEqual(msgs); // 读回的应该和存的一样
  });

  it("loadSession 在文件不存在时返回空数组", () => {
    const loaded = loadSession();
    expect(loaded).toEqual([]); // 没有文件 → 空数组
  });

  it("保存后文件确实存在且是数组", async () => {
    await saveSession([{ role: "user", content: "x" }] as never);
    expect(existsSync(FILE)).toBe(true); // 文件该存在
    const data = JSON.parse(readFileSync(FILE, "utf-8"));
    expect(Array.isArray(data)).toBe(true); // 内容该是数组
  });
});

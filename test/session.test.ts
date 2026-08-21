// ============================================================
// test/session.test.ts — 多会话持久化（深度复刻⑥）
//
// 测 session.ts 的承诺：
//   1. sanitizeName：会话名 → 安全文件名（危险字符被替换、防穿越）
//   2. 存→取 往返：saveSession 后 loadSession 能读回一样的消息
//   3. 列表：多个会话按最近更新倒序、元信息完整
//   4. 不存在的会话 → 空数组
//   5. 删除会话 / 兼容旧版裸数组文件
//   6. mostRecentSession：没有会话时是 null
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  mostRecentSession,
  sanitizeName,
  sessionFilePath,
} from "../src/session";
import type { Message } from "../src/types";

const DIR = "sessions";

const msgs = (n: number): Message[] => [{ role: "system", content: "你是助手" }, { role: "user", content: `消息${n}` }];

// 每个测试前清空会话目录，测完再清（不留垃圾）
beforeEach(() => rmSync(DIR, { recursive: true, force: true }));
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe("sanitizeName 文件名安全", () => {
  it("危险字符全替换成下划线，中文保留", () => {
    expect(sanitizeName("a/b:c*d")).toBe("a_b_c_d");
    expect(sanitizeName("代码重构")).toBe("代码重构");
  });
  it("空串/纯空格/纯点 → 兜底 default", () => {
    expect(sanitizeName("  ")).toBe("default");
    expect(sanitizeName("...")).toBe("default"); // 前置点被剥掉
  });
});

describe("多会话 存→取 往返", () => {
  it("保存一个会话，能读回相同消息（信封格式落盘）", async () => {
    const m = msgs(1);
    await saveSession("测试", m);
    expect(loadSession("测试")).toEqual(m);

    // 落盘格式：信封（有 meta.messages），不是裸数组
    const raw = JSON.parse(readFileSync(sessionFilePath("测试"), "utf-8"));
    expect(Array.isArray(raw.messages)).toBe(true);
    expect(typeof raw.createdAt).toBe("number");
  });

  it("多个会话互不干扰", async () => {
    await saveSession("A", msgs(1));
    await saveSession("B", msgs(2));
    expect(loadSession("A")[1].content).toBe("消息1");
    expect(loadSession("B")[1].content).toBe("消息2");
  });

  it("不存在的会话 → 空数组", () => {
    expect(loadSession("不存在")).toEqual([]);
  });
});

describe("会话列表", () => {
  it("按最近更新倒序，元信息完整", async () => {
    await saveSession("旧会话", msgs(1));
    await new Promise((r) => setTimeout(r, 5)); // 让时间戳错开
    await saveSession("新会话", msgs(2));

    const all = listSessions();
    expect(all.length).toBe(2);
    expect(all[0].name).toBe("新会话"); // 最近更新的排最前
    expect(all[0].messageCount).toBe(2);
    expect(all[1].name).toBe("旧会话");
  });

  it("空目录 → 空列表，mostRecentSession → null", () => {
    expect(listSessions()).toEqual([]);
    expect(mostRecentSession()).toBeNull();
  });
});

describe("删除 / 兼容旧格式", () => {
  it("deleteSession 删除文件，再读为空", async () => {
    await saveSession("要删", msgs(1));
    await deleteSession("要删");
    expect(existsSync(sessionFilePath("要删"))).toBe(false);
    expect(loadSession("要删")).toEqual([]);
  });

  it("旧版裸数组文件（latest.json 那种）也能读", async () => {
    // 手工造一个"整文件就是消息数组"的旧格式文件
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, "legacy.json"), JSON.stringify(msgs(9)), "utf-8");
    expect(loadSession("legacy")[1].content).toBe("消息9");
    expect(listSessions()[0].messageCount).toBe(2);
  });
});
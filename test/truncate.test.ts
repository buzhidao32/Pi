// ============================================================
// test/truncate.test.ts — 工具输出截断（深度复刻④）
//
// 测 tools/truncate.ts 的承诺：
//   1. 没超长 → 原样返回（最常见的路径）
//   2. head 留开头几行 / tail 留末尾几行（pi 的两种策略）
//   3. 单行超长 → 退化成字符级截断（但只切那一行）
//   4. truncateLine：单行限长 + 截断标记
//   5. bash 的 formatResult：截断后附指引通知
//   6. 集成：read 工具读到"一行 5000 字符"的文件，不会撑爆
// ============================================================

import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { truncateLines, truncateLine, MAX_TOOL_RESULT_CHARS, MAX_LINE_CHARS, type TruncateResult } from "../src/tools/truncate";
import { formatResult } from "../src/tools/bash";
import { run as readRun } from "../src/tools/read";

const ok = (r: TruncateResult) => ({
  content: r.content,
  truncated: r.truncated,
  originalLength: r.originalLength,
  droppedLines: r.droppedLines,
});

describe("truncateLines", () => {
  it("没超长 → 原样返回，不截断", () => {
    expect(ok(truncateLines("hello", 100, "head"))).toEqual({
      content: "hello",
      truncated: false,
      originalLength: 5,
      droppedLines: 0,
    });
  });

  it("刚好卡在上限 → 也不截断", () => {
    expect(truncateLines("a".repeat(10), 10, "head").truncated).toBe(false);
  });

  it("head 模式：留开头几行（装得下就整行留，绝不切半个字）", () => {
    const r = truncateLines("aaaaa\nbbbbb\nccccc", 12, "head");
    expect(r.content).toBe("aaaaa\nbbbbb"); // 第 3 行装不下就被丢
    expect(r.truncated).toBe(true);
    expect(r.droppedLines).toBe(1);
  });

  it("tail 模式：留末尾几行（bash 的策略：错误通常在最后）", () => {
    const r = truncateLines("aaaaa\nbbbbb\nccccc", 12, "tail");
    expect(r.content).toBe("bbbbb\nccccc");
    expect(r.droppedLines).toBe(1);
  });

  it("单行本身超长 → 退化成字符级截断（只切那一行）", () => {
    const r = truncateLines("x".repeat(100), 20, "head");
    expect(r.content).toBe("x".repeat(20)); // 前 20 个字符
    expect(r.truncated).toBe(true);
    expect(r.droppedLines).toBe(0); // 整份就一行，没丢"行"
  });
});

describe("truncateLine", () => {
  it("短行原样返回", () => {
    expect(truncateLine("hello", 10)).toBe("hello");
  });

  it("长行截断到上限 + 带截断标记", () => {
    const out = truncateLine("x".repeat(50), 10);
    expect(out.startsWith("x".repeat(10))).toBe(true);
    expect(out).toContain("此行过长");
  });
});

describe("bash formatResult", () => {
  it("短输出原样返回（最常见路径不打搅）", () => {
    expect(formatResult("ok")).toBe("ok");
  });

  it("超长输出：只留尾部 + 附指引通知（含原始长度和丢弃行数）", () => {
    const raw = "line1\n" + "y".repeat(9000);
    const out = formatResult(raw);

    expect(out.includes("[输出过长已截断")).toBe(true);
    expect(out.includes("9006")).toBe(true); // 原始字符数 line1\n(6) + 9000
    expect(out.includes("丢了 1 行")).toBe(true);
    expect(out.startsWith("yyyy")).toBe(true); // 巨型行保持在末尾
    expect(out).toContain("重定向到文件"); // 有拿回完整输出的指引
    expect(out.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 200); // 通知本身很小
  });
});

describe("read 工具集成（单行巨长文件）", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-truncate-read-"));
  const file = join(tempDir, "huge-line.txt");
  writeFileSync(file, "a".repeat(5000) + "\n正常行\n");

  afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

  it("一行 5000 字符 → 截断到 MAX_LINE_CHARS，且行号还在", async () => {
    const out = await readRun({ path: file });
    expect(out).toContain("此行过长"); // 截断标记在
    expect(out).toContain("2\t正常行"); // 后面的行不受影响
    expect(out.includes("1\t" + "a".repeat(MAX_LINE_CHARS + 1))).toBe(false); // 不会整行塞进来
  });
});
// ============================================================
// test/read.test.ts — read 工具的自动化测试
//
// 测 read 工具的 offset/limit 逻辑（你学过的 1-indexed 换算）：
//   文件内容 a b c d e，读 offset=3 limit=2 → 应该返回 3\tc 和 4\td
//
// 这里用到临时目录（os.tmpdir + 随机名），测完删除，不留垃圾。
// ============================================================

import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as readRun } from "../src/tools/read";

// 建一个一次性临时目录，存测试文件
const tempDir = mkdtempSync(join(tmpdir(), "pi-read-test-"));
const file = join(tempDir, "x.txt");
writeFileSync(file, "a\nb\nc\nd\ne\n");

// 测完删掉临时目录
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe("read 工具", () => {
  it("读全部行，带行号", async () => {
    const out = await readRun({ path: file });
    // 第一行应该是 "1\ta"
    expect(out).toContain("1\ta");
    expect(out).toContain("5\te");
  });

  it("offset=3 limit=2 → 从第3行读2行，行号3和4", async () => {
    const out = await readRun({ path: file, offset: 3, limit: 2 });
    expect(out).toContain("3\tc"); // 第3行内容 c
    expect(out).toContain("4\td"); // 第4行内容 d
    expect(out).not.toContain("5\te"); // 不该有第5行
  });

  it("文件不存在时返回错误文本（不崩溃）", async () => {
    const out = await readRun({ path: join(tempDir, "nope.txt") });
    expect(out).toContain("读取失败"); // 错误信息里含"读取失败"
  });

  it("超出文件末尾的行数提示继续读", async () => {
    // 读 offset=4，limit=2，文件有5行 → 还剩1行没读 → 有提示
    const out = await readRun({ path: file, offset: 4, limit: 2 });
    expect(out).toContain("offset=6"); // 提示用 offset=6 继续
  });
});

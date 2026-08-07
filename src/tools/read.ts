// ============================================================
// tools/read.ts — read 工具：读文件内容
//
// 对应 pi: packages/coding-agent/src/core/tools/read.ts
// pi 那个有 357 行（图像处理、UI 高亮…），我们只留核心：
//   读文件 → 按 offset/limit 切行 → 太长就提示"用 offset 继续"
//
// 新增的 Node 语法：
//   import { readFile } from "node:fs/promises"
//     = Python 的 open(...).read()，但异步 + 返回 Promise
// ============================================================

import { readFile } from "node:fs/promises";
import type { ToolDef } from "../types";

// 一次最多返回多少行（防止超长文件把上下文撑爆）
const DEFAULT_MAX_LINES = 200;

// 给 LLM 看的"说明书"
export const def: ToolDef = {
  type: "function",
  function: {
    name: "read",
    description:
      "读取一个文件的内容。支持 offset（从第几行开始，第 1 行是 1）和 limit（最多读几行）。文件太长时用 offset 继续读。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "要读取的文件路径（相对或绝对）" },
        offset: { type: "number", description: "从第几行开始读（1 开始），默认 1" },
        limit: { type: "number", description: "最多读多少行，默认 200" },
      },
      required: ["path"],
    },
  },
};

// 实际执行
export async function run(args: Record<string, unknown>): Promise<string> {
  const path = String(args.path ?? "");
  if (!path) return "错误：缺少 path 参数";

  // offset 从 1 开始计数，用户说第 3 行 = 数组下标 2
  const offset = typeof args.offset === "number" ? args.offset : 1;
  const limit = typeof args.limit === "number" ? args.limit : DEFAULT_MAX_LINES;

  try {
    const text = await readFile(path, "utf-8"); // 读整个文件为字符串
    const lines = text.split("\n"); // 按换行符切成数组

    // 数组切片（JS 的 slice = Python 的 [a:b]）
    const start = Math.max(0, offset - 1); // 1-indexed → 0-indexed
    const end = Math.min(start + limit, lines.length);
    const selected = lines.slice(start, end);

    // 行号前缀：让 LLM 知道每行是第几行，方便它引用
    const numbered = selected.map((line, i) => `${start + i + 1}\t${line}`).join("\n");

    // 如果文件还有更多内容没读完，提示用 offset 继续
    const more = lines.length - end;
    const hint = more > 0 ? `\n\n[文件共 ${lines.length} 行，已显示 ${end - start} 行，还有 ${more} 行。用 offset=${end + 1} 继续读。]` : "";

    return numbered + hint;
  } catch (err) {
    // 文件不存在等错误 → 返回错误文本给 LLM（而不是崩溃）
    return `读取失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

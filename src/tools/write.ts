// ============================================================
// tools/write.ts — write 工具：写入文件（创建或覆盖）
//
// 对应 pi: packages/coding-agent/src/core/tools/write.ts
//
// 新增 Node 语法：
//   import { writeFile, mkdir } from "node:fs/promises"
//     = Python 的 open(path, "w").write(content)
//   import { dirname } from "node:path"
//     = Python 的 os.path.dirname(path)
//   import { fileURLToPath } from "node:url" → 本项目用不到
// ============================================================

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ToolDef } from "../types";

// 给 LLM 看的"说明书"
export const def: ToolDef = {
  type: "function",
  function: {
    name: "write",
    description: "创建一个新文件或覆盖已有文件。用于生成代码、保存文件。内容用 content 参数完整传入。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "要写入的文件路径（相对或绝对）" },
        content: { type: "string", description: "要写入的完整文件内容" },
      },
      required: ["path", "content"],
    },
  },
};

// 实际执行
export async function run(args: Record<string, unknown>): Promise<string> {
  const path = String(args.path ?? "");
  const content = String(args.content ?? "");
  if (!path) return "错误：缺少 path 参数";

  try {
    // 先确保父目录存在（等价 Python 的 os.makedirs(dirname, exist_ok=True)）
    // 否则写入 a/b/c.txt 而 a/b 不存在时会报错
    await mkdir(dirname(path), { recursive: true });

    // 写入文件（覆盖）。等价 Python 的 open(path, "w").write(content)
    await writeFile(path, content, "utf-8");

    return `已写入文件 ${path}（${content.length} 字符）`;
  } catch (err) {
    return `写入失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

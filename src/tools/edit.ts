// ============================================================
// tools/edit.ts — edit 工具：精确查找并替换文件中的一段
//
// 对应 pi: packages/coding-agent/src/core/tools/edit.ts
// pi 支持一次多处替换（edits 数组），我们先做单处替换，但保留
// 它最重要的安全机制：old_text 必须【唯一匹配】，否则拒绝。
// （防止 LLM 想改一处，结果文件里有两处相同，误改了别的）
//
// 关键算法（Python 翻译）：
//   content.index(old_text)             → str.index(old)
//   content.index(old, start+1)         → 找第二次出现，判断是否唯一
//   content.replace(old, new) 但只替换第一次
// ============================================================

import { readFile, writeFile } from "node:fs/promises";
import type { ToolDef } from "../types";

// 给 LLM 看的"说明书"
export const def: ToolDef = {
  type: "function",
  function: {
    name: "edit",
    description:
      "精确修改文件中的一段文字。old_text 必须与文件中的内容完全一致，且只能出现一次；new_text 是替换后的内容。用于修改代码，比如改函数名、修 bug、改配置。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "要修改的文件路径" },
        old_text: { type: "string", description: "要被替换的原文（必须完全匹配且唯一）" },
        new_text: { type: "string", description: "替换成的新内容" },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
};

// 实际执行
export async function run(args: Record<string, unknown>): Promise<string> {
  const path = String(args.path ?? "");
  const oldText = String(args.old_text ?? "");
  const newText = String(args.new_text ?? "");
  if (!path || !oldText) return "错误：缺少 path 或 old_text 参数";

  try {
    const content = await readFile(path, "utf-8");

    // 第一步：找 old_text 第一次出现的位置
    const firstIndex = content.indexOf(oldText);
    if (firstIndex === -1) {
      return "错误：文件中找不到要替换的 old_text。请检查原文是否完全一致（注意空格、换行）。";
    }

    // 第二步：检查是否唯一（从 firstIndex+1 再找一次）
    const secondIndex = content.indexOf(oldText, firstIndex + 1);
    if (secondIndex !== -1) {
      return "错误：old_text 在文件中出现多次，无法确定改哪一处。请提供更多上下文让它唯一。";
    }

    // 第三步：替换（只替换第一次出现，因为已确认唯一）
    // content.slice(0, firstIndex) = 替换点之前的部分
    // + newText                         = 新内容
    // + content.slice(firstIndex + oldText.length) = 替换点之后的部分
    const newContent = content.slice(0, firstIndex) + newText + content.slice(firstIndex + oldText.length);

    await writeFile(path, newContent, "utf-8");
    return `已成功替换文件 ${path} 中的 1 处内容`;
  } catch (err) {
    return `编辑失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

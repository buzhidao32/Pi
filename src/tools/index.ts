// ============================================================
// tools/index.ts — 工具注册表（汇总所有工具）
//
// 这里是"接线中心"：从各个工具文件 import 进来，汇总成字典。
// agent 循环只需要认识这一个文件。
//
// 加新工具 = 在 tools/ 加个文件 + 在这里登记一行（超简单）。
//
// 深度复刻③：每个工具可以声明自己的执行模式 executionMode：
//   - 不写      → 默认并行（read/write：读不同文件互不干扰）
//   - "sequential" → 必须串行（bash：shell 有全局状态，两条命令
//     同时跑会互相干扰；edit：对同一文件"先读后写"，并行会互相踩）
//   调度规则见 src/execute.ts —— 批里有一个串行工具，整批都串行。
// ============================================================

import * as bash from "./bash";
import * as read from "./read";
import * as write from "./write";
import * as edit from "./edit";
import type { Tool, ToolDef } from "../types";

// 工具字典：名字 → 工具
// 现在四个工具都齐了：bash / read / write / edit
export const tools: Record<string, Tool> = {
  bash: { def: bash.def, run: bash.run, executionMode: "sequential" },
  read: { def: read.def, run: read.run },
  write: { def: write.def, run: write.run },
  edit: { def: edit.def, run: edit.run, executionMode: "sequential" },
};

// 把所有工具的说明书抽成数组，发给 LLM
export function getToolDefs(): ToolDef[] {
  return Object.values(tools).map((t) => t.def);
}
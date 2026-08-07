// ============================================================
// tools/index.ts — 工具注册表（汇总所有工具）
//
// 这里是"接线中心"：从各个工具文件 import 进来，汇总成字典。
// agent 循环只需要认识这一个文件。
//
// 加新工具 = 在 tools/ 加个文件 + 在这里登记一行（超简单）。
// ============================================================

import * as bash from "./bash";
import * as read from "./read";
import * as write from "./write";
import * as edit from "./edit";
import type { ToolDef } from "../types";

// 每个工具的"形状"：说明书 def + 实现 run
export interface Tool {
  def: ToolDef;
  run: (args: Record<string, unknown>) => Promise<string>;
}

// 工具字典：名字 → 工具
// 现在四个工具都齐了：bash / read / write / edit
export const tools: Record<string, Tool> = {
  bash: { def: bash.def, run: bash.run },
  read: { def: read.def, run: read.run },
  write: { def: write.def, run: write.run },
  edit: { def: edit.def, run: edit.run },
};

// 把所有工具的说明书抽成数组，发给 LLM
export function getToolDefs(): ToolDef[] {
  return Object.values(tools).map((t) => t.def);
}

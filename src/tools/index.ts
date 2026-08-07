// ============================================================
// tools/index.ts — 工具注册表（汇总所有工具）
//
// 这里是"接线中心"：从各个工具文件 import 进来，
// 汇总成一个字典。agent 循环只需要认识这一个文件，
// 加新工具 = 在 tools/ 加个文件 + 在这里登记一行。
// ============================================================

import * as bash from "./bash";
import type { ToolDef } from "../types";

// 每个工具的"形状"：说明书 def + 实现 run
export interface Tool {
  def: ToolDef;
  run: (args: Record<string, unknown>) => Promise<string>;
}

// 工具字典：名字 → 工具。
// 以后加 read/write/edit 就是在这里加三行。
export const tools: Record<string, Tool> = {
  bash: {
    def: bash.def, // 从 bash.ts 拿说明书
    run: bash.run, // 从 bash.ts 拿实现
  },
};

// 把所有工具的说明书抽成数组，发给 LLM
export function getToolDefs(): ToolDef[] {
  return Object.values(tools).map((t) => t.def);
}

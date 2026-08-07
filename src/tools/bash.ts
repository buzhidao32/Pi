// ============================================================
// tools/bash.ts — bash 工具
//
// 每个工具文件只做一件事：定义自己（def）和实现自己（run）。
// 真正的"注册表"在 tools/index.ts 里，把所有工具汇总。
// ============================================================

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef } from "../types";

// 把 Node 回调式的 exec 变成 Promise 式，方便 await
const execAsync = promisify(exec);

// 给 LLM 看的"说明书"：我叫 bash，参数是一个 command 字符串（必填）
export const def: ToolDef = {
  type: "function",
  function: {
    name: "bash",
    description: "执行一条 shell 命令并返回输出。用于读文件、列目录、跑程序等。",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的 shell 命令" },
      },
      required: ["command"],
    },
  },
};

// 实际执行逻辑
export async function run(args: Record<string, unknown>): Promise<string> {
  const command = String(args.command ?? "");
  try {
    // maxBuffer 设大一点，防止输出过长被截断
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
    return stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
  } catch (err) {
    // 命令执行失败（非零退出码）时，把错误回传给 LLM，让它能据此调整
    const e = err as { stderr?: string; stdout?: string; message: string };
    return `命令执行失败（退出码非 0）：\n${e.stderr || e.stdout || e.message}`;
  }
}

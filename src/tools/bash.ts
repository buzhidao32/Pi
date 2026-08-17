// ============================================================
// tools/bash.ts — bash 工具
//
// 每个工具文件只做一件事：定义自己（def）和实现自己（run）。
// 真正的"注册表"在 tools/index.ts 里，把所有工具汇总。
//
// 深度复刻④：输出截断策略（对标 pi 的 bash 工具）
//   - pi 的 bash 用 truncateTail（留尾巴）：命令的"结尾"最重要，
//     报错信息通常就在最后几行。
//   - 我们简化成"留末尾若干行/字符"，超长时在结果里附指引，
//     告诉 LLM 怎么拿回完整输出（pi 是存临时文件，我们指引重定向）。
// ============================================================

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef } from "../types";
import { truncateLines, MAX_TOOL_RESULT_CHARS } from "./truncate";

// 把 Node 回调式的 exec 变成 Promise 式，方便 await
const execAsync = promisify(exec);

// 给 LLM 看的"说明书"：我叫 bash，参数是一个 command 字符串（必填）
// 注意：说明书里要写明截断规则（对标 pi），LLM 才有预期，
// 不会以为"输出就只有这么点"。
export const def: ToolDef = {
  type: "function",
  function: {
    name: "bash",
    description:
      "执行一条 shell 命令并返回输出。用于读文件、列目录、跑程序等。输出最多保留末尾 6000 字符，超长部分会截断并附提示。",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的 shell 命令" },
      },
      required: ["command"],
    },
  },
};

// 截断 + 附指引通知。抽成纯函数：不带 I/O，方便测试。
export function formatResult(raw: string): string {
  const { content, truncated, originalLength, droppedLines } = truncateLines(
    raw,
    MAX_TOOL_RESULT_CHARS,
    "tail", // bash 策略：留尾巴
  );
  if (!truncated) return content;
  return (
    `${content}\n\n` +
    `[输出过长已截断：共 ${originalLength} 字符，这里保留末尾部分（丢了 ${droppedLines} 行）。` +
    "想看全部：用更精确的命令，或把输出重定向到文件（如 > out.txt）再用 read 工具读。]"
  );
}

// 实际执行逻辑
export async function run(args: Record<string, unknown>): Promise<string> {
  const command = String(args.command ?? "");
  try {
    // maxBuffer 设大一点，防止输出过长被截断
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
    const raw = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
    return formatResult(raw);
  } catch (err) {
    // 命令执行失败（非零退出码）时，把错误回传给 LLM，让它能据此调整
    const e = err as { stderr?: string; stdout?: string; message: string };
    return formatResult(`命令执行失败（退出码非 0）：\n${e.stderr || e.stdout || e.message}`);
  }
}
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
//
// 深度复刻⑧：超时机制（对标 pi 的 bash timeout）
//   - 可选的 timeout 参数（秒）：LLM 觉得命令可能卡住就传一个。
//   - 校验：必须是大 0 的有限数字，且不超过上限。
//   - 超时后 Node 会杀掉子进程，我们识别"被杀"标记（killed），
//     回报"命令超时（N 秒）"，让 LLM 调整策略而不是干等。
// ============================================================

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef } from "../types";
import { truncateLines, MAX_TOOL_RESULT_CHARS } from "./truncate";

// 把 Node 回调式的 exec 变成 Promise 式，方便 await
const execAsync = promisify(exec);

// 超时上限（秒）：防止 LLM 传一个离谱的"100000 秒"把自己坑死
const MAX_TIMEOUT_SECONDS = 600;

// 校验并换算 timeout：秒 → 毫秒（纯函数，方便测试）
// 返回 undefined = 不限制（默认，对标 pi：没有默认超时）
export function resolveTimeoutMs(timeout: unknown): number | undefined {
  if (timeout === undefined) return undefined;
  const n = typeof timeout === "number" ? timeout : Number(timeout);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("timeout 必须是大于 0 的秒数");
  }
  if (n > MAX_TIMEOUT_SECONDS) {
    throw new Error(`timeout 最大 ${MAX_TIMEOUT_SECONDS} 秒`);
  }
  return Math.round(n * 1000);
}

// 给 LLM 看的"说明书"：我叫 bash，参数是 command（必填）+ timeout（可选）
// 说明书里写明截断规则和超时规则，LLM 才有预期。
export const def: ToolDef = {
  type: "function",
  function: {
    name: "bash",
    description:
      "执行一条 shell 命令并返回输出。用于读文件、列目录、跑程序等。输出最多保留末尾 6000 字符，超长会截断并附提示；可选 timeout（秒）用于可能卡住的命令，超时会终止并提示。",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的 shell 命令" },
        timeout: {
          type: "number",
          description: "超时秒数（可选）。复杂或可能卡住的命令（安装、网络、长循环）建议设置，超时后命令会被终止。",
        },
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

  // 先校验 timeout（参数错误就别浪费一次执行）
  let timeoutMs: number | undefined;
  try {
    timeoutMs = resolveTimeoutMs(args.timeout);
  } catch (err) {
    return `参数错误: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    // maxBuffer 设大一点，防止输出过长被截断；timeout 可选传给 exec
    const execOptions: { maxBuffer: number; timeout?: number } = { maxBuffer: 10 * 1024 * 1024 };
    if (timeoutMs !== undefined) execOptions.timeout = timeoutMs;

    const { stdout, stderr } = await execAsync(command, execOptions);
    const raw = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
    return formatResult(raw);
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string; killed?: boolean; signal?: string };

    // 被超时/信号杀掉：error.killed === true（Node 在超时时杀子进程会打这个标记）
    if (e.killed) {
      // 秒数保留一位小数（0.2 秒不会被四舍五入成 0）
      const secs = timeoutMs !== undefined ? Number((timeoutMs / 1000).toFixed(1)) : "?";
      return formatResult(`命令超时（超过 ${secs} 秒，已被终止）：\n${e.stderr || e.stdout || e.message}`);
    }

    // 命令执行失败（非零退出码）时，把错误回传给 LLM，让它能据此调整
    return formatResult(`命令执行失败（退出码非 0）：\n${e.stderr || e.stdout || e.message}`);
  }
}
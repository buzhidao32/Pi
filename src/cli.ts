// ============================================================
// cli.ts — 命令行交互（读用户输入、把对话交给 agent、循环）
//
// 职责：只做"人机交互"，不碰 AI 逻辑。
// AI 逻辑在 agent.ts 里，这里只是调用它。
// ============================================================

import * as readline from "node:readline/promises";
import { agentLoop } from "./agent";
import type { Message } from "./types";

// 启动整个交互程序
export async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const messages: Message[] = [
    { role: "system", content: "你是帮助用户写代码的助手。你可以使用 bash 工具执行命令。" },
  ];

  console.log("my-pi v0.2 工具循环版（输入 exit 退出）");
  while (true) {
    let input: string | undefined;
    try {
      input = await rl.question("你> ");
    } catch {
      break; // 输入流关闭（管道 EOF 或 Ctrl+D）
    }
    if (input === undefined) break;
    if (input.trim() === "exit" || input.trim() === "quit") break;
    if (!input.trim()) continue;

    messages.push({ role: "user", content: input });
    try {
      await agentLoop(messages);
    } catch (err) {
      console.error("出错:", err instanceof Error ? err.message : err);
    }
  }
  rl.close();
}

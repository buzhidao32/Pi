// ============================================================
// cli.ts — 命令行交互（读用户输入、把对话交给 agent、循环）
//
// 职责：只做"人机交互"，不碰 AI 逻辑。
// AI 逻辑在 agent.ts 里，这里只是调用它。
// ============================================================

import * as readline from "node:readline/promises";
import { agentLoop } from "./agent";
import { loadSession, saveSession } from "./session";
import type { Message } from "./types";

// 启动整个交互程序
export async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 启动时尝试加载上次保存的会话（有就续聊，没有就新建）
  // 注意：loadSession 是同步的，不需要 await（避免打断 readline 读输入）
  const messages: Message[] = loadSession();
  if (messages.length === 0) {
    // 第一次运行：放一条 system 提示，定义 AI 人设
    messages.push({ role: "system", content: "你是帮助用户写代码的助手。你可以使用 bash 工具执行命令。" });
    console.log("my-pi v0.3 会话持久化版（输入 exit 退出）");
  } else {
    console.log(`my-pi v0.3 已恢复上次会话（${messages.length} 条消息），输入 exit 退出`);
  }

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
      // 每轮对话结束后保存历史 → 重启后能恢复
      await saveSession(messages);
    } catch (err) {
      console.error("出错:", err instanceof Error ? err.message : err);
    }
  }
  rl.close();
}

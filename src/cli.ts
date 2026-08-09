// ============================================================
// cli.ts — 命令行入口（交互 + 非交互 + 帮助）
//
// 职责：
//   1. 交互模式：读用户输入，循环对话（默认）
//   2. 非交互模式：--print "..." 直接处理一句话，跑完退出
//   3. 帮助：--help 显示用法
//
// AI 逻辑在 agent.ts 里，这里只负责"人怎么操作程序"。
// ============================================================

import * as readline from "node:readline/promises";
import { agentLoop } from "./agent";
import { loadSession, saveSession } from "./session";
import type { Message } from "./types";

// 命令行选项（index.ts 解析后传进来）
export interface CliOptions {
  prompt?: string; // 非交互模式的提示词
  model?: string; // 指定模型（预留）
  help?: boolean; // 是否显示帮助
}

// ---- 帮助信息 ----
function printHelp() {
  console.log(`my-pi — 从零实现的 AI 编码 agent

用法:
  my-pi                         交互模式（默认）
  my-pi -p "一句话"             非交互：直接处理这句话后退出
  my-pi --model <name>          指定模型
  my-pi -h / --help             显示本帮助

示例:
  my-pi -p "列出所有 .ts 文件"
  my-pi --model deepseek-v4-flash "帮我重构"
`);
}

// ---- 准备消息历史（加载或新建） ----
function prepareMessages(): Message[] {
  const messages: Message[] = loadSession();
  if (messages.length === 0) {
    // 第一次：放一条 system 提示，定义 AI 人设
    messages.push({ role: "system", content: "你是帮助用户写代码的助手。你可以使用 bash 工具执行命令。" });
  }
  return messages;
}

// ---- 交互模式：循环读输入 ----
async function runInteractive() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const messages = prepareMessages();
  if (messages.length > 1) {
    console.log(`my-pi 已恢复上次会话（${messages.length} 条消息），输入 exit 退出`);
  } else {
    console.log("my-pi 交互模式（输入 exit 退出）");
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
      await saveSession(messages); // 保存历史
    } catch (err) {
      console.error("出错:", err instanceof Error ? err.message : err);
    }
  }
  rl.close();
}

// ---- 非交互模式：处理一句话就退出 ----
async function runOnce(prompt: string) {
  const messages = prepareMessages();
  messages.push({ role: "user", content: prompt });
  try {
    await agentLoop(messages);
    await saveSession(messages); // 也保存，方便以后恢复
  } catch (err) {
    console.error("出错:", err instanceof Error ? err.message : err);
  }
}

// ---- 入口：根据选项分发 ----
export async function main(opts: CliOptions = {}) {
  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.prompt !== undefined) {
    await runOnce(opts.prompt); // 非交互
    return;
  }
  await runInteractive(); // 默认交互
}

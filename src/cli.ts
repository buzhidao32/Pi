// ============================================================
// cli.ts — 命令行入口（交互 + 非交互 + 会话管理 + 帮助）
//
// 职责：
//   1. 交互模式：读用户输入，循环对话（默认）
//   2. 非交互模式：--print "..." 直接处理一句话，跑完退出
//   3. 会话管理（深度复刻⑥）：--list / --session <名> / --new
//   4. 帮助：--help 显示用法
//
// AI 逻辑在 agent.ts 里，这里只负责"人怎么操作程序"。
// ============================================================

import * as readline from "node:readline/promises";
import { agentLoop } from "./agent";
import { loadSession, saveSession, listSessions, mostRecentSession, sanitizeName } from "./session";
import type { Message } from "./types";

// 命令行选项（index.ts 解析后传进来）
export interface CliOptions {
  prompt?: string; // 非交互模式的提示词
  model?: string; // 指定模型（预留）
  help?: boolean; // 是否显示帮助
  list?: boolean; // 是否列出所有会话
  session?: string; // 指定要用的会话名
  fresh?: boolean; // --new：强制开新会话，不恢复
}

// ---- 帮助信息 ----
function printHelp() {
  console.log(`my-pi — 从零实现的 AI 编码 agent

用法:
  my-pi                         交互模式（默认，恢复最近会话）
  my-pi -p "一句话"             非交互：直接处理这句话后退出
  my-pi --model <name>          指定模型
  my-pi --sequential            强制工具一个个串行执行（默认并行）
  my-pi --session <名>          用指定会话（不存在会自动新建）
  my-pi --new                   开新会话，不恢复旧历史
  my-pi --list                  列出所有会话
  my-pi -h / --help             显示本帮助

示例:
  my-pi -p "列出所有 .ts 文件"
  my-pi --model deepseek-v4-flash "帮我重构"
  my-pi --session 代码重构
  my-pi --list
`);
}

// ---- 会话选择 ----
// 优先级：--session 显式指定 > 最近更新的会话 > 默认 "default"
// --new 时忽略旧历史（但依然接受 --session 给新会话起名）
function resolveSessionName(opts: Pick<CliOptions, "session" | "fresh">): string {
  if (opts.session) return sanitizeName(opts.session);
  if (opts.fresh) return "default";
  return mostRecentSession()?.name ?? "default";
}

// ---- 列出所有会话 ----
async function printSessionList() {
  const all = listSessions();
  if (all.length === 0) {
    console.log("（还没有任何会话）");
    return;
  }
  console.log(`共 ${all.length} 个会话（按最近更新排序）：`);
  for (const s of all) {
    const time = new Date(s.updatedAt).toLocaleString("zh-CN");
    console.log(`  ${s.name.padEnd(16)} ${s.messageCount} 条  更新于 ${time}`);
  }
}

// ---- 准备消息历史（加载或新建） ----
function prepareMessages(name: string): Message[] {
  const messages: Message[] = loadSession(name);
  if (messages.length === 0) {
    // 第一次：放一条 system 提示，定义 AI 人设
    messages.push({ role: "system", content: "你是帮助用户写代码的助手。你可以使用 bash 工具执行命令。" });
  }
  return messages;
}

// ---- 交互模式：循环读输入 ----
async function runInteractive(name: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const messages = prepareMessages(name);
  if (messages.length > 1) {
    console.log(`my-pi [会话: ${name}] 已恢复（${messages.length} 条消息），输入 exit 退出`);
  } else {
    console.log(`my-pi [会话: ${name}] 交互模式（输入 exit 退出）`);
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
      await saveSession(name, messages); // 保存历史
    } catch (err) {
      console.error("出错:", err instanceof Error ? err.message : err);
    }
  }
  rl.close();
}

// ---- 非交互模式：处理一句话就退出 ----
async function runOnce(prompt: string, name: string) {
  const messages = prepareMessages(name);
  messages.push({ role: "user", content: prompt });
  try {
    await agentLoop(messages);
    await saveSession(name, messages); // 也保存，方便以后恢复
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
  if (opts.list) {
    await printSessionList();
    return;
  }

  const sessionName = resolveSessionName(opts);

  if (opts.prompt !== undefined) {
    await runOnce(opts.prompt, sessionName); // 非交互
    return;
  }
  await runInteractive(sessionName); // 默认交互
}
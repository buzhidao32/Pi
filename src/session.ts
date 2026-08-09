// ============================================================
// session.ts — 会话持久化：把对话历史存到文件，重启后能恢复
//
// 核心思路（用你会的函数）：
//   saveSession() → writeFile 把 messages 存成 JSON 文件
//   loadSession() → readFile 从 JSON 文件读回 messages
//
// 对照 pi: packages/session-backends/（pi 用可插拔的后端存储）
//
// 注意：loadSession 用【同步】readFileSync，不用 async readFile。
// 为什么？因为在 main() 里 `await loadSession()` 时，如果读文件是异步的，
// 事件循环会被"让出去"处理 stdin——管道输入还没被 rl.question 消费就 EOF 了。
// 同步读取不打断事件循环，能保证 readline 正常读到输入。
// ============================================================

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import type { Message } from "./types";

// 会话文件存放目录（相对项目根目录）
const SESSION_DIR = "sessions";
const SESSION_FILE = "sessions/latest.json";

// ---- 保存会话 ----
// 把整个消息数组写成 JSON 文件
export async function saveSession(messages: Message[]): Promise<void> {
  // 先确保目录存在（复用 write 工具里学过的 mkdir 技巧）
  await mkdir(SESSION_DIR, { recursive: true });
  // JSON.stringify(数组, null, 2) = Python json.dumps(arr, indent=2)
  // 缩进2格，方便人读
  await writeFile(SESSION_FILE, JSON.stringify(messages, null, 2), "utf-8");
}

// ---- 加载会话（同步版，避免打断事件循环） ----
export function loadSession(): Message[] {
  try {
    const text = readFileSync(SESSION_FILE, "utf-8");
    const data = JSON.parse(text); // JSON 字符串 → 数组
    return Array.isArray(data) ? (data as Message[]) : [];
  } catch {
    return []; // 文件不存在（第一次运行）→ 空数组
  }
}

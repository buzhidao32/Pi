// ============================================================
// session.ts — 多会话持久化（深度复刻⑥）
//
// 单文件版（M6）只能存"最近一次会话"；这一版升级成【会话管理器】：
//   每个会话一个文件：sessions/<安全名>.json
//   文件内容是"信封"：元信息（name/createdAt/updatedAt）+ messages
//   列表靠读目录自动发现，不需要单独的索引文件
//   兼容旧格式：文件内容是"裸数组"（旧版 latest.json）也能读
//
// 对照 pi: packages/agent/src/harness/session/
//   pi 的 SessionMetadata 有 id/createdAt/updatedAt/messageCount，
//   我们保留 name/createdAt/updatedAt/messageCount（名字即 id，够用）。
//
// 保留灵魂：loadSession 用【同步】readFileSync（见 M6 注释——
// 异步读会打断事件循环，让管道输入在 rl.question 消费前 EOF）。
// ============================================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Message } from "./types";

// 会话文件目录（相对项目根目录）
const DIR = "sessions";

// 一个会话的元信息（列表和交互提示要用）
export interface SessionMeta {
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// 文件里的"信封"：元信息 + 消息体
interface SessionEnvelope {
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

// ---- 名字工具 ----

// 会话名 → 安全文件名：去掉路径危险字符、防止目录穿越
export function sanitizeName(name: string): string {
  // Windows 文件名里 : \ / * ? " < > | 都是危险字符，全换成下划线
  // 前置的点也去掉，防止躲过"以 . 开头"的文件
  let cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "");
  if (!cleaned) cleaned = "default";
  return cleaned;
}

// 会话名 → 文件完整路径
export function sessionFilePath(name: string): string {
  return join(DIR, `${sanitizeName(name)}.json`);
}

// 从文件名（不带路径）反推"换个名字时的兜底名"
function nameFromFile(file: string): string {
  return basename(file, ".json");
}

// 读"信封"，兼容两种内容：新格式信封 / 旧格式裸数组（懒迁移）
function readEnvelope(file: string): SessionEnvelope | null {
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    const legacy = Array.isArray(data); // 旧格式：整个文件就是消息数组
    return {
      name: legacy || typeof data.name !== "string" ? nameFromFile(file) : data.name,
      createdAt: legacy || typeof data.createdAt !== "number" ? 0 : data.createdAt,
      updatedAt: legacy || typeof data.updatedAt !== "number" ? 0 : data.updatedAt,
      messages: legacy ? (data as Message[]) : Array.isArray(data.messages) ? (data.messages as Message[]) : [],
    };
  } catch {
    return null; // 文件不存在/坏了 → null
  }
}

// ---- 列表 ----

// 列出所有会话（按最近更新倒序）
export function listSessions(): SessionMeta[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readEnvelope(join(DIR, f)))
    .filter((e): e is SessionEnvelope => e !== null)
    .map((e) => ({
      name: e.name,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      messageCount: e.messages.length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt); // 最近更新的排最前
}

// 最近更新的会话（没有就 null）
export function mostRecentSession(): SessionMeta | null {
  return listSessions()[0] ?? null;
}

// ---- 读 ----

// 加载指定会话（同步！原因见文件头注释）
export function loadSession(name: string): Message[] {
  const file = sessionFilePath(name);
  if (!existsSync(file)) return [];
  return readEnvelope(file)?.messages ?? [];
}

// ---- 写 ----

// 保存会话（新建 = 第一次写；覆盖 = 已有同名）
export async function saveSession(name: string, messages: Message[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const clean = sanitizeName(name);
  const now = Date.now();
  // 是"更新"还是"新建"：优先沿用旧创建时间，否则用现在
  const prev = readEnvelope(sessionFilePath(clean));
  const envelope: SessionEnvelope = {
    name: clean,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    messages,
  };
  // JSON.stringify(信封, null, 2) = Python json.dumps(dict, indent=2)
  await writeFile(sessionFilePath(clean), JSON.stringify(envelope, null, 2), "utf-8");
}

// ---- 删 ----

export async function deleteSession(name: string): Promise<void> {
  const file = sessionFilePath(name);
  if (existsSync(file)) await rm(file, { force: true });
}
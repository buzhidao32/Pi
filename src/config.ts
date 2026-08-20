// ============================================================
// config.ts — 所有配置常量集中在这里
// 好处：以后想改 API 地址、模型、key，只改这一个文件。
//
// 支持多个 LLM 提供商，通过 PROVIDER 环境变量选择：
//   PROVIDER=opencode  → 用你的 opencode go 套餐（默认）
//   PROVIDER=dieqiyun → 用 dieqiyun 中转站
//   MOCK=1            → 用本地 mock 服务器（测试用）
//
// 密钥都从环境变量读，绝不写死在代码里（安全）。
// ============================================================

import type { ToolExecutionMode } from "./types";

// ---- 提供商选择 ----
const PROVIDER = process.env.PROVIDER ?? "opencode";

// MOCK=1 时走本地 mock 服务器（测试 agent 循环用）
const MOCK = process.env.MOCK === "1";

// ---- 各提供商的配置 ----
interface ProviderConfig {
  apiUrl: string;
  apiKey: string | undefined;
  model: string;
}

const providers: Record<string, ProviderConfig> = {
  // 你的 opencode go 套餐（默认）
  opencode: {
    apiUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    apiKey: process.env.OPENCODE_API_KEY,
    model: "deepseek-v4-flash",
  },
  // dieqiyun 中转站（备选）
  dieqiyun: {
    apiUrl: "https://hgapi.dieqiyun.top/v1/chat/completions",
    apiKey: process.env.DIEQIYUN_API_KEY,
    model: "gpt-5.6-luna",
  },
  // 本地 mock（测试用）
  mock: {
    apiUrl: "http://localhost:8787/v1/chat/completions",
    apiKey: "mock",
    model: "mock-model",
  },
};

// ---- 选中当前提供商 ----
const active = MOCK ? providers.mock : providers[PROVIDER];

export const API_URL = active.apiUrl;
export const API_KEY = active.apiKey;
// 模型：支持被命令行 --model 覆盖（通过 MY_PI_MODEL 环境变量传递）
export const MODEL = process.env.MY_PI_MODEL ?? active.model;

// 最多允许连续调多少次工具，防止死循环
export const MAX_TOOL_ROUNDS = 8;

// 工具执行模式（深度复刻③，对标 pi 的 toolExecution 配置项）：
//   "parallel"   = 默认，一批工具调用同时跑
//   "sequential" = 强制一个一个跑（排错时用，看哪个工具先动）
// 命令行加 --sequential 会设置环境变量 TOOL_EXECUTION（和 --model 同套路）
export const TOOL_EXECUTION: ToolExecutionMode =
  process.env.TOOL_EXECUTION === "sequential" ? "sequential" : "parallel";

// ---- 上下文压缩（深度复刻⑤，对标 pi 的 maxContextTokens / keepRecentTokens）----
// 历史对话总字符数超过它就触发"先压缩再继续"（保守估算 ≈ 4000 tokens）
export const MAX_CONTEXT_CHARS = 16000;
// 压缩时保留最近多少字符（让模型还能看到刚发生的那几轮对话）
export const RECENT_KEEP_CHARS = 5000;

if (!API_KEY) {
  console.error(`错误：缺少 ${PROVIDER} 提供商的环境变量 API key`);
  console.error("设置方法（PowerShell）：$env:OPENCODE_API_KEY=\"sk-xxx\"");
  process.exit(1);
}

// ============================================================
// config.ts — 所有配置常量集中在这里
// 好处：以后想改 API 地址、模型、key，只改这一个文件。
// （pi 里对应 settings / config 的概念）
// ============================================================

// MOCK=1 时走本地 mock 服务器（中转站限流时用于测试 agent 循环）
export const MOCK = process.env.MOCK === "1";

// 三元表达式：mock 模式下指向本地，否则指向真实中转站
export const API_URL = MOCK
  ? "http://localhost:8787/v1/chat/completions"
  : "https://hgapi.dieqiyun.top/v1/chat/completions";

export const API_KEY = MOCK ? "mock" : process.env.DIEQIYUN_API_KEY;
export const MODEL = "gpt-5.6-luna";

// 最多允许连续调多少次工具，防止死循环
export const MAX_TOOL_ROUNDS = 8;

if (!MOCK && !API_KEY) {
  console.error("错误：缺少环境变量 DIEQIYUN_API_KEY");
  process.exit(1);
}

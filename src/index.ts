// ============================================================
// my-pi 最小可用版 — M1：最小对话 agent（还没有工具）
//
// 目标：stdin 读一行 → 发给中转站 → 打印回复，循环往复。
// 对照 pi 源码：packages/ai/src/api/ 里的 OpenAI 请求构造
// ============================================================

import * as readline from "node:readline/promises";

// ---- 配置 ----
const API_URL = "https://hgapi.dieqiyun.top/v1/chat/completions";
const API_KEY = process.env.DIEQIYUN_API_KEY; // 你之前存的环境变量
const MODEL = "gpt-5.6-luna";

if (!API_KEY) {
  console.error("错误：缺少环境变量 DIEQIYUN_API_KEY");
  console.error('设置方法：在终端执行  $env:DIEQIYUN_API_KEY="sk-xxx"  (PowerShell)');
  process.exit(1);
}

// ---- 消息类型 ----
// TS 语法点：interface 声明一个"对象的形状"。message 在 API 里就是 {role, content}。
interface Message {
  role: "system" | "user" | "assistant"; // 联合类型：只能是这三个字符串之一
  content: string;
}

// ---- 核心：发一次请求给 LLM，拿到回复文本 ----
// 带自动重试：429(限流)/5xx(服务器错误) 时按指数退避重试几次
async function chat(messages: Message[]): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, messages }),
    });

    // 可重试的错误：429 限流、5xx 服务器故障。等 1s、2s、4s…
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const delay = 1000 * attempt;
      console.log(`\n(上游 ${res.status}，${delay / 1000}s 后重试…)`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    // 其他错误直接抛出
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API 错误 ${res.status}: ${text}`);
    }

    // OpenAI 兼容协议的标准响应结构：
    // { choices: [ { message: { role, content } } ], usage: {...} }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0].message.content;
  }
}

// ---- 入口 ----
async function main() {
  // readline：从终端读取用户输入，逐行
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 会话历史。把历史全部发给 LLM，LLM 才能"记得"之前的对话。
  // 这也是后面"多轮工具循环"的基石。
  const messages: Message[] = [
    { role: "system", content: "你是一个帮助用户写代码的助手。" },
  ];

  // 输入流关闭时（管道 EOF 或 Ctrl+D）readline 会自己关闭，
  // 之后再 question() 会抛 ERR_USE_AFTER_CLOSE，所以要 try/catch。
  console.log("my-pi v0.1（输入 exit 退出）");
  while (true) {
    let input: string | undefined;
    try {
      input = await rl.question("你> ");
    } catch {
      break; // 输入流已关闭，退出
    }
    if (input === undefined) break; // EOF
    if (input.trim() === "exit" || input.trim() === "quit") break;
    if (!input.trim()) continue;

    messages.push({ role: "user", content: input });
    try {
      const reply = await chat(messages);
      messages.push({ role: "assistant", content: reply });
      console.log(`\npi> ${reply}\n`);
    } catch (err) {
      console.error("出错:", err instanceof Error ? err.message : err);
    }
  }
  rl.close();
}

main();

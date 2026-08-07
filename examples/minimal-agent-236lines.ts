// ============================================================
// 【学习存档】最小完整 agent —— 236 行跑通 LLM 对话 + 工具调用 + agent 循环
//
// 这是 my-pi 项目 M1+M2 的完整代码备份（2026-08-07 保存）。
// 它用最短的代码演示了"AI agent 的本质流程"：
//   1. 发请求给 LLM（含工具说明书）
//   2. LLM 回复要么是答案、要么是"我要调工具"
//   3. 要调工具就执行，把结果回喂给 LLM
//   4. 循环直到 LLM 给纯文字答案
//
// 用途：
//  - 学习参考：理解一个 LLM 流程的最小完整骨架
//  - 面试讲解：拿它讲"agent 循环"原理，比一堆代码更有说服力
//  - 后续 M4 模块化重构后，这里是"重构前的原貌"，可对比
//
// 注意：这是存档，不参与项目主流程。主入口仍是 src/index.ts。
// 对照 pi 源码：
//  - 循环骨架   → packages/agent/src/agent-loop.ts
//  - bash 工具  → packages/coding-agent/src/core/tools/
// ============================================================

import * as readline from "node:readline/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

// 把 Node 回调式的 exec 变成 Promise 式，方便 await
const execAsync = promisify(exec);

// ---- 配置 ----
// MOCK=1 时走本地 mock 服务器（中转站限流时用于测试 agent 循环）
const MOCK = process.env.MOCK === "1";
const API_URL = MOCK ? "http://localhost:8787/v1/chat/completions" : "https://hgapi.dieqiyun.top/v1/chat/completions";
const API_KEY = MOCK ? "mock" : process.env.DIEQIYUN_API_KEY;
const MODEL = "gpt-5.6-luna";
const MAX_TOOL_ROUNDS = 8; // 最多允许连续调多少次工具，防止死循环

if (!MOCK && !API_KEY) {
  console.error("错误：缺少环境变量 DIEQIYUN_API_KEY");
  process.exit(1);
}

// ---- 类型定义 ----
// OpenAI 消息有 4 种角色（M1 只有 3 种，M2 新增 "tool"）
type Role = "system" | "user" | "assistant" | "tool";

// 发给 API 的消息
interface Message {
  role: Role;
  content: string;
  // 工具调用时，assistant 消息会带 tool_calls（M2 核心新增）
  tool_calls?: ToolCall[];
  // tool 角色的消息需要标注"这是对哪个工具调用的回应"
  tool_call_id?: string;
}

// 一个工具调用：LLM 说"我要调 X，参数是 Y"
interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON 字符串，需要 JSON.parse 解析
  };
}

// OpenAI function calling 的工具定义格式
interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object; // JSON Schema
  };
}

// 一次 chat 请求的响应
interface ChatResponse {
  message: Message;
  // 本次调用消耗的 token（学习用，打印出来看开销）
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// ---- LLM 对话（M1 的 chat 升级版）----
// 区别：多了 tools 参数，返回的不再是纯文本而是完整 message（可能含 tool_calls）
async function chat(messages: Message[], tools?: ToolDef[]): Promise<ChatResponse> {
  for (let attempt = 1; ; attempt++) {
    const body: Record<string, unknown> = { model: MODEL, messages };
    if (tools) body.tools = tools;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const delay = 1000 * attempt;
      console.log(`\n(上游 ${res.status}，${delay / 1000}s 后重试…)`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API 错误 ${res.status}: ${text}`);
    }

    // OpenAI 响应结构：choices[0].message 可能含 tool_calls
    const data = (await res.json()) as {
      choices: { message: Message; finish_reason: string }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return { message: data.choices[0].message, usage: data.usage };
  }
}

// ---- 工具注册表 ----
// 工具系统：把所有工具放在一个 map 里，LLM 按名字调用，执行时按名字查表。
// 这是 pi 工具系统的最小内核（pi 里叫 ToolRegistry）。
const tools: Record<string, { def: ToolDef; run: (args: Record<string, unknown>) => Promise<string> }> = {
  // bash 工具：执行 shell 命令
  bash: {
    def: {
      type: "function",
      function: {
        name: "bash",
        description: "执行一条 shell 命令并返回输出。用于读文件、列目录、跑程序等。",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "要执行的 shell 命令" },
          },
          required: ["command"],
        },
      },
    },
    // 执行逻辑
    async run(args) {
      const command = String(args.command ?? "");
      try {
        // maxBuffer 设大一点，防止输出过长被截断
        const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
        return stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
      } catch (err) {
        // 命令执行失败（非零退出码）时，把错误回传给 LLM，让它能据此调整
        const e = err as { stderr?: string; stdout?: string; message: string };
        return `命令执行失败（退出码非 0）：\n${e.stderr || e.stdout || e.message}`;
      }
    },
  },
};

// ---- agent 循环（核心！）----
// 这对应 pi 的 agent-loop.ts 最内层循环
async function agentLoop(messages: Message[]): Promise<void> {
  // 把当前可用工具的定义发给 LLM（只发名字和描述，不实现）
  const toolDefs = Object.values(tools).map((t) => t.def);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { message, usage } = await chat(messages, toolDefs);
    if (usage) {
      console.log(`\n[token: 输入${usage.prompt_tokens} 输出${usage.completion_tokens}]`);
    }

    // 情况 1：LLM 没有要求调用工具 → 这就是最终答案，结束循环
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log(`\npi> ${message.content}\n`);
      return;
    }

    // 情况 2：LLM 要求调用工具
    // 先把 assistant 的这条消息加入历史（含 tool_calls），
    // 否则 LLM 会困惑"谁发起的这些调用"
    messages.push(message);

    for (const toolCall of message.tool_calls) {
      console.log(`\n[调用工具] ${toolCall.function.name}(${toolCall.function.arguments})`);

      // 查表找到工具并执行
      const tool = tools[toolCall.function.name];
      let result: string;
      if (!tool) {
        result = `错误：未知工具 ${toolCall.function.name}`;
      } else {
        try {
          const args = JSON.parse(toolCall.function.arguments); // JSON 字符串 → 对象
          result = await tool.run(args);
        } catch (err) {
          result = `工具执行出错: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      // 关键：把工具结果作为 "tool" 角色消息回喂，必须带 tool_call_id
      // 告诉 LLM："这是对刚才那个调用的回应"
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
      });
    }
    // 回到循环头，LLM 会看到工具结果，再决定下一步
  }

  // 超出最大轮数，强制收尾
  console.log(`\n（超过 ${MAX_TOOL_ROUNDS} 轮工具调用，停止）`);
}

// ---- 入口 ----
async function main() {
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
      break;
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

main();

// ============================================================
// mock-llm.ts — 模拟一个"会用 bash 工具的 LLM"
// 用途：中转站限流时，用这个假服务器验证 M2 的 agent 循环逻辑。
// 它收到 /chat/completions 请求后：
//   1. 如果用户消息含"列目录"，第一轮回复 tool_calls 调 bash("ls")
//   2. 第二轮（收到 tool 结果后）回复最终文字答案
// 运行：npm run mock   然后  用 MOCK=1 环境变量跑 index.ts
// ============================================================

import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { messages } = JSON.parse(body);
      // 找出最近的 tool 消息：如果有，说明工具已执行，应给最终答案
      const lastTool = [...messages].reverse().find((m: any) => m.role === "tool");
      // 找出最近 user 消息
      const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
      const ask = (lastUser?.content || "") as string;

      let reply: any;
      if (lastTool) {
        // 第二轮：工具结果已经拿到，给最终答案
        reply = {
          role: "assistant",
          content: `模拟LLM说：我看到工具执行结果是 —— ${lastTool.content.slice(0, 80)}`,
        };
      } else if (ask.includes("列目录")) {
        // 第一轮：要求调用 bash 工具
        reply = {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_mock_1",
              type: "function",
              function: { name: "bash", arguments: JSON.stringify({ command: "ls" }) },
            },
          ],
        };
      } else {
        // 普通问题直接回答
        reply = { role: "assistant", content: `模拟LLM回答：你说了"${ask}"` };
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "mock",
          object: "chat.completion",
          choices: [{ index: 0, message: reply, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        })
      );
    });
  } else {
    res.writeHead(404).end("not found");
  }
});

server.listen(8787, () => console.log("Mock LLM 运行在 http://localhost:8787"));

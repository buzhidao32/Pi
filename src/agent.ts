// ============================================================
// agent.ts — agent 循环（核心！）
//
// 职责：反复"问 LLM → 要调工具就执行并回喂 → 再问"，
// 直到 LLM 给出纯文字答案。
//
// 它 import 了三个模块，正好演示"接线"：
//   llm.chat()     → 问 LLM
//   tools + getToolDefs → 工具表 + 说明书
//   config.MAX     → 防死循环上限
// ============================================================

import { chat } from "./llm";
import { tools, getToolDefs } from "./tools";
import { MAX_TOOL_ROUNDS } from "./config";
import type { Message } from "./types";

// 处理一轮完整的用户请求：可能多次调用工具
export async function agentLoop(messages: Message[]): Promise<void> {
  // 把当前可用工具的定义发给 LLM（只发名字和描述，不实现）
  const toolDefs = getToolDefs();

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

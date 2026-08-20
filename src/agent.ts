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
import { executeToolCalls, toToolMessages } from "./execute";
import { compactHistory, shouldCompact } from "./compact";
import { MAX_TOOL_ROUNDS, TOOL_EXECUTION, MAX_CONTEXT_CHARS, RECENT_KEEP_CHARS } from "./config";
import type { Message } from "./types";

// 深度复刻⑤：真实摘要——把历史纯文本发给 LLM，让它压缩成要点
async function summarizeWithLLM(historyText: string): Promise<string> {
  const { message, usage } = await chat(
    [
      {
        role: "system",
        content:
          "你是对话压缩助手。把用户给出的历史对话压缩成要点摘要。必须保留：关键决定、涉及的文件路径、错误信息、当前进度。不要编造不存在的内容，不要回答问题，只输出摘要。",
      },
      { role: "user", content: historyText },
    ],
    // 不传 tools：压缩不需要工具
  );
  if (usage) {
    console.log(`\n[压缩耗时: 输入${usage.prompt_tokens} 输出${usage.completion_tokens}]`);
  }
  return message.content;
}

// 处理一轮完整的用户请求：可能多次调用工具
export async function agentLoop(messages: Message[]): Promise<void> {
  // 把当前可用工具的定义发给 LLM（只发名字和描述，不实现）
  const toolDefs = getToolDefs();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // 深度复刻⑤：每次问 LLM 前，先看历史是不是太长，太长了先压缩再问。
    // 原地换血（splice 替换整个数组），cli.ts 手里的同一个数组也跟着变，
    // 之后 saveSession 存下来的就是压缩后的历史。
    if (shouldCompact(messages, MAX_CONTEXT_CHARS)) {
      const compacted = await compactHistory(messages, summarizeWithLLM, RECENT_KEEP_CHARS);
      if (compacted !== messages) {
        messages.splice(0, messages.length, ...compacted);
        console.log("\n[上下文过长，已压缩：更早的对话变成了一段摘要]");
      }
    }

    // 流式显示：标记是否已打印过 "pi> " 前缀（只打一次）
    let printedPrompt = false;

    const { message, usage } = await chat(messages, toolDefs, (delta) => {
      // onDelta 回调：每收到一段增量文本就执行
      // 第一次进来先打印 "pi> "，之后直接追加增量文本
      if (!printedPrompt) {
        process.stdout.write("\npi> ");
        printedPrompt = true;
      }
      process.stdout.write(delta); // 不带换行，一个字一个字蹦出来
    });

    // 流式结束时补一个换行（如果确实打印了内容）
    if (printedPrompt) {
      process.stdout.write("\n");
    }

    if (usage) {
      console.log(`\n[token: 输入${usage.prompt_tokens} 输出${usage.completion_tokens}]`);
    }

    // 情况 1：LLM 没有要求调用工具 → 这就是最终答案，结束循环
    // 注意：内容已经通过 onDelta 流式打印过了，这里不需要再 console.log
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log("");
      return;
    }

    // 情况 2：LLM 要求调用工具
    // 先把 assistant 的这条消息加入历史（含 tool_calls），
    // 否则 LLM 会困惑"谁发起的这些调用"
    messages.push(message);

    // 深度复刻③：交给执行器（见 src/execute.ts）——它会：
    //   调度层：全局串行 或 有工具声明 "sequential" → 串行，否则并行
    //   两阶段：先串行"准备"（查表/解析参数），再并行"执行"（Promise.all）
    //   按序回喂：结果保持调用顺序，配 tool_call_id 返回
    const results = await executeToolCalls(message.tool_calls, tools, TOOL_EXECUTION);
    messages.push(...toToolMessages(results));
    // 回到循环头，LLM 会看到工具结果，再决定下一步
  }

  // 超出最大轮数，强制收尾
  console.log(`\n（超过 ${MAX_TOOL_ROUNDS} 轮工具调用，停止）`);
}

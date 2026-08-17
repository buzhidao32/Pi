// ============================================================
// execute.ts — 工具执行器（深度复刻③：多工具并行）
//
// 职责：决定这一批工具调用怎么执行（并行 or 串行），
//       先按顺序"准备"，再并行"执行"，最后按序回喂给 LLM。
// 对应 pi: packages/agent/src/agent-loop.ts 的
//       executeToolCalls / executeToolCallsParallel / executeToolCallsSequential
// 深入讲解见 LEARN-TS.md 6.3
// ============================================================

import type { Message, Tool, ToolCall, ToolExecutionMode } from "./types";

// 一次执行结果：谁调的 + 结果字符串（回喂给 LLM 用）
export interface ExecutedCall {
  toolCall: ToolCall;
  result: string;
}

// 准备好的调用：已查表 + 解析参数，只差"跑"这一步
interface PreparedCall {
  toolCall: ToolCall;
  tool: Tool | undefined; // undefined = 未知工具
  args: Record<string, unknown>;
  error?: string; // 准备阶段就失败的（如参数不是合法 JSON）
}

// 调度层：全局串行，或批里任何工具声明"我必须串行" → 整批排队，否则并行
export async function executeToolCalls(
  toolCalls: ToolCall[],
  toolMap: Record<string, Tool>,
  mode: ToolExecutionMode,
): Promise<ExecutedCall[]> {
  const hasSequentialTool = toolCalls.some(
    (tc) => toolMap[tc.function.name]?.executionMode === "sequential",
  );

  const prepared = prepareCalls(toolCalls, toolMap); // 先准备（串行）
  if (mode === "sequential" || hasSequentialTool) {
    return executeSequential(prepared);
  }
  return executeParallel(prepared);
}

// 阶段A：准备（串行、按调用顺序）——查表、解析参数。只"验身份"不"干活"
function prepareCalls(toolCalls: ToolCall[], toolMap: Record<string, Tool>): PreparedCall[] {
  return toolCalls.map((toolCall) => {
    console.log(`\n[调用工具] ${toolCall.function.name}(${toolCall.function.arguments})`);

    const tool = toolMap[toolCall.function.name];
    if (!tool) {
      return { toolCall, tool: undefined, args: {}, error: undefined };
    }

    // JSON.parse 可能抛异常（参数不是合法 JSON），必须在准备阶段接住
    try {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      return { toolCall, tool, args };
    } catch (err) {
      return {
        toolCall,
        tool: undefined,
        args: {},
        error: `工具参数解析出错: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
}

// 串行路径：一个等一个（总耗时 = 所有工具耗时之和）
async function executeSequential(prepared: PreparedCall[]): Promise<ExecutedCall[]> {
  const results: ExecutedCall[] = [];
  for (const p of prepared) {
    results.push({ toolCall: p.toolCall, result: await runOne(p) });
  }
  return results;
}

// 并行路径：准备已串行做完，这里只把"跑"并发化
// 关键：async 函数一调用就"点火开跑"（跑到第一个 await 才让出），
//       map 等于把所有任务一次点着，Promise.all 等最慢的那个。
async function executeParallel(prepared: PreparedCall[]): Promise<ExecutedCall[]> {
  const results = await Promise.all(prepared.map((p) => runOne(p)));
  // Promise.all 结果数组保持输入顺序 → 按原顺序配对回喂
  return prepared.map((p, i) => ({ toolCall: p.toolCall, result: results[i] }));
}

// 跑一个。错误隔离：失败也转成字符串结果，绝不往外抛（否则整批 Promise.all 全崩）
async function runOne(p: PreparedCall): Promise<string> {
  if (p.error) return p.error;
  if (!p.tool) return `错误：未知工具 ${p.toolCall.function.name}`;
  try {
    return await p.tool.run(p.args);
  } catch (err) {
    return `工具执行出错: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// 把执行结果转成 "tool" 角色消息（配合 tool_call_id 回喂给 LLM）
export function toToolMessages(results: ExecutedCall[]): Message[] {
  return results.map(
    ({ toolCall, result }): Message => ({
      role: "tool", // "tool" 按 Message.role 检查，必须和 Message 对齐
      content: result,
      tool_call_id: toolCall.id,
    }),
  );
}
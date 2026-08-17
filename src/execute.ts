// ============================================================
// execute.ts — 工具执行器（深度复刻③：多工具并行）
//
// 对标 pi: packages/agent/src/agent-loop.ts 的三个函数
//   executeToolCalls          → 本文件的 executeToolCalls（调度层）
//   executeToolCallsParallel  → 本文件的 executeParallel（两阶段并行）
//   executeToolCallsSequential→ 本文件的 executeSequential（老老实实排队）
//
// pi 的真设计有三层，我们逐层复刻：
//
//   ① 调度层：先决定"这一批调用是并行还是串行？"
//      - 全局配置 mode === "sequential"             → 全体串行
//      - 批里任何一个工具声明了 executionMode="sequential" → 全体串行
//      - 否则 → 并行
//      （为什么一个要串行就全体串行？就像排队打饭——
//        小王插队说"我最先"，那整条队都得按他的顺序来，
//        没法让后面的人先打饭。）
//
//   ② 两阶段：并行不意味着"从头到尾都乱跑"
//      - 阶段A 准备（串行、按调用顺序）：查表找到工具、解析参数 JSON。
//        这叫"准备"。为什么要按顺序？校验和决定（这个工具存不存在、
//        参数合不合法）必须一个一个来，像安检排队。
//      - 阶段B 执行（并行）：把每个"准备好的任务"丢进 Promise.all，
//        让它们同时跑。工具跑的都是 I/O（读文件/跑命令），等待期间
//        CPU 闲着，正好给别人用。
//
//   ③ 按序回喂：Promise.all 的结果数组保持输入顺序，
//      所以哪怕第 2 个工具先跑完，回喂给 LLM 时还是按调用顺序排。
//      （配对靠 tool_call_id，顺序乱了 LLM 会懵）
//
// 额外设计：错误隔离。一个工具跑挂了，只把这个调用标记为错误，
// 不炸掉整批 —— 其他工具照常跑完，LLM 看到错误还能调整策略。
// ============================================================

import type { Message, Tool, ToolCall, ToolExecutionMode } from "./types";

// 一次执行结果：谁调的 + 结果字符串（回喂给 LLM 用）
export interface ExecutedCall {
  toolCall: ToolCall;
  result: string;
}

// 准备好的调用：已经查表 + 解析参数，只差"跑"这一步
interface PreparedCall {
  toolCall: ToolCall;
  tool: Tool | undefined; // undefined = 未知工具
  args: Record<string, unknown>;
  error?: string; // 准备阶段就失败的（参数解析出错）
}

// 调度层：根据全局模式和工具声明，决定并行还是串行
export async function executeToolCalls(
  toolCalls: ToolCall[],
  toolMap: Record<string, Tool>,
  mode: ToolExecutionMode,
): Promise<ExecutedCall[]> {
  // 批里有没有任何一个工具声明"我必须串行"？
  // 注意：Map 查不到的工具（未知工具）不算串行，默认可并行
  const hasSequentialTool = toolCalls.some(
    (tc) => toolMap[tc.function.name]?.executionMode === "sequential",
  );

  // 统一入口：先准备（串行），再分流
  const prepared = prepareCalls(toolCalls, toolMap);

  if (mode === "sequential" || hasSequentialTool) {
    return executeSequential(prepared);
  }
  return executeParallel(prepared);
}

// 阶段A：准备（串行）。按调用顺序逐个查表、解析参数、
// 打印 [调用工具] 日志。这里不做任何"跑"，所以必然按顺序发生。
function prepareCalls(toolCalls: ToolCall[], toolMap: Record<string, Tool>): PreparedCall[] {
  return toolCalls.map((toolCall) => {
    console.log(`\n[调用工具] ${toolCall.function.name}(${toolCall.function.arguments})`);

    const tool = toolMap[toolCall.function.name];
    if (!tool) {
      return { toolCall, tool: undefined, args: {}, error: undefined };
    }

    // 解析参数：LLM 给的 arguments 是 JSON 字符串，要转成对象
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

// 串行路径：一个等一个，绝不重叠（总耗时 = 所有工具耗时之和）
async function executeSequential(prepared: PreparedCall[]): Promise<ExecutedCall[]> {
  const results: ExecutedCall[] = [];
  for (const p of prepared) {
    results.push({ toolCall: p.toolCall, result: await runOne(p) });
  }
  return results;
}

// 并行路径：阶段A已经串行准备好了，这里只把"每个 run"并发起来
async function executeParallel(prepared: PreparedCall[]): Promise<ExecutedCall[]> {
  // prepared.map(...) 在同步循环里挨个调用 async 函数：
  // 每个 async 函数立刻开始执行（直到第一个 await 才让出），
  // 所以所有工具几乎同时开工；真正耗时的 I/O 全部重叠。
  // Promise.all 等待"最慢的那个"，结果数组保持输入顺序。
  const results = await Promise.all(prepared.map((p) => runOne(p)));
  return prepared.map((p, i) => ({ toolCall: p.toolCall, result: results[i] }));
}

// 执行一个准备好的调用。所有失败都被"接住"转成错误字符串，
// 绝不往外抛 —— 这就是错误隔离。
async function runOne(p: PreparedCall): Promise<string> {
  // 准备阶段就失败的（参数解析出错）
  if (p.error) return p.error;

  // 未知工具
  if (!p.tool) return `错误：未知工具 ${p.toolCall.function.name}`;

  try {
    return await p.tool.run(p.args);
  } catch (err) {
    return `工具执行出错: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// 供 agent 循环使用的小工具：把执行结果转成"tool 角色"消息
export function toToolMessages(results: ExecutedCall[]): Message[] {
  return results.map(
    ({ toolCall, result }): Message => ({
      role: "tool", // 告诉 TS"这是 Message"，"tool" 会按 Message.role 的类型检查
      content: result,
      tool_call_id: toolCall.id,
    }),
  );
}
// ============================================================
// types.ts — 所有共享类型定义
// 为什么单独放一个文件？因为 Message、ToolCall 这些类型，
// llm.ts、tools、agent.ts、cli.ts 都要用。
// 大家各自 import，不用重复写（"一处定义，多处复用"）。
// ============================================================

// OpenAI 消息有 4 种角色
export type Role = "system" | "user" | "assistant" | "tool";

// 发给 API 的消息
export interface Message {
  role: Role;
  content: string;
  // 工具调用时，assistant 消息会带 tool_calls
  tool_calls?: ToolCall[];
  // tool 角色的消息需要标注"这是对哪个工具调用的回应"
  tool_call_id?: string;
}

// 一个工具调用：LLM 说"我要调 X，参数是 Y"
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON 字符串，需要 JSON.parse 解析
  };
}

// 一个工具的"形状"：说明书 def + 实现 run + （可选）执行模式
// LLM 只看 def（说明书），agent 按名字查表用 run（实现）
export interface Tool {
  def: ToolDef;
  run: (args: Record<string, unknown>) => Promise<string>;
  // 默认并行；声明 "sequential" = "我必须在别的工具之前/之后独占执行"
  executionMode?: ToolExecutionMode;
}

// 工具执行模式（深度复刻③：对标 pi 的 ToolExecutionMode）
// "parallel"   = 可以和别的工具一起并行跑（默认）
// "sequential" = 必须独占执行，其他工具都得等它（比如 bash 改了全局状态、
//                edit 要对同一个文件"先读后写"，并行会互相踩脚）
export type ToolExecutionMode = "parallel" | "sequential";

// OpenAI function calling 的工具定义格式（给 LLM 看的说明书）
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object; // JSON Schema
  };
}

// 一次 chat 请求的响应
export interface ChatResponse {
  message: Message;
  // 本次调用消耗的 token（学习用，打印出来看开销）
  usage?: { prompt_tokens: number; completion_tokens: number };
}

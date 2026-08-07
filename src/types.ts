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

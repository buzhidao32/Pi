// ============================================================
// tools/truncate.ts — 截断工具（深度复刻④）
//
// 对标 pi: packages/coding-agent/src/core/tools/truncate.ts
// pi 有 truncateHead（留头）/ truncateTail（留尾）/ truncateLine（单行限长）
// 我们保留同样的三件事，但用【字符数】做唯一上限（pi 用行数+字节数双上限）。
//
// 铁律（pi 的原话）：绝不切半个字——按"整行"来留，
// 只有"单行就超长"这种极端情况才退化成字符级截断。
// ============================================================

// ---- 截断上限（对标 pi：2000 行 / 50KB / 单行 500 字符）----
// 为什么要有上限？上下文窗口是有限的，一个 bash 命令输出几 MB，
// 会把整个对话窗口撑爆，后面的消息全塞不下。
// pi 用"行数 + 字节数"双上限，我们简化成"字符数"一个上限，更好理解。
// 一个工具结果最多给 LLM 多少字符（超出部分截掉，只留头或尾）
export const MAX_TOOL_RESULT_CHARS = 6000;
// 单行最多多少字符（防止"一行就是 10MB"的压缩文件/打包代码）
export const MAX_LINE_CHARS = 1000;

// 截断的结果：切完了的内容 + 元信息（给提示语用）
export interface TruncateResult {
  content: string; // 截断后的内容
  truncated: boolean; // 有没有真的截断
  originalLength: number; // 原始字符数
  droppedLines: number; // 丢了多少行（算给 LLM 听）
}

// 按行截断：mode "head" = 留开头几行，mode "tail" = 留末尾几行
// 从目标端开始"攒整行"，攒到装不下 maxChars 为止。
export function truncateLines(text: string, maxChars: number, mode: "head" | "tail"): TruncateResult {
  // 没超长 → 原样返回（最常见的路径，不折腾）
  if (text.length <= maxChars) {
    return { content: text, truncated: false, originalLength: text.length, droppedLines: 0 };
  }

  const lines = text.split("\n");
  // tail 模式从后往前扫，最后再反转回来
  const iterator = mode === "head" ? lines : [...lines].reverse();
  const kept: string[] = [];
  let used = 0; // 已占用的字符数

  for (const line of iterator) {
    const cost = line.length + 1; // +1 是预留一个换行符的位置
    if (used + cost > maxChars && kept.length > 0) break; // 装不下更多整行了

    if (used + cost > maxChars) {
      // 极端情况：第一行（head 的开头行 / tail 的末尾行）本身就超长
      // 不得不退化成"字符级截断这一行"（pi 说的 edge case）
      kept.push(line.slice(0, maxChars - used));
      used = maxChars;
      break;
    }
    kept.push(line);
    used += cost;
  }

  const content = (mode === "head" ? kept : kept.reverse()).join("\n");
  return {
    content,
    truncated: true,
    originalLength: text.length,
    droppedLines: lines.length - kept.length,
  };
}

// 单行限长：一行太长的内容（比如压缩过的 JS 一整行几 MB）
// 从头部切到 maxLineChars，尾部加个标记告诉 LLM"这行被切了"
export function truncateLine(line: string, maxLineChars: number): string {
  return line.length <= maxLineChars
    ? line
    : `${line.slice(0, maxLineChars)}…[此行过长，已从第 ${maxLineChars} 字符处截断]`;
}
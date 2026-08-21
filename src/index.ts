// ============================================================
// index.ts — 入口文件：解析命令行参数，启动程序
//
// CLI 参数集合（深度复刻② 起步，③⑤⑥ 继续扩展）：
//   -p / --print "..."  非交互：直接处理这句话，跑完退出
//   --model xxx         指定模型
//   --sequential        强制工具串行执行（深度复刻③）
//   --session <名>      用指定会话（不存在会新建）
//   --new               开新会话不恢复（深度复刻⑥）
//   --list              列出所有会话
//   -h / --help         显示帮助
//
// process.argv = Node 给我们的命令行参数数组
// ============================================================

import { main, type CliOptions } from "./cli";

// ---- 命令行参数解析 ----
// process.argv.slice(2) 去掉前两个（node 路径和脚本路径），只留用户传的
const args = process.argv.slice(2);

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg === "-p" || arg === "--print") {
      opts.prompt = args[i + 1]; // 下一个参数就是要处理的话
      i++; // 跳过一个，避免把话当成参数再扫一遍
    } else if (arg === "--model") {
      opts.model = args[i + 1];
      // 把模型名传给 config（config 读 MY_PI_MODEL 环境变量）
      process.env.MY_PI_MODEL = args[i + 1];
      i++;
    } else if (arg === "--sequential") {
      // 强制工具串行执行（config 读 TOOL_EXECUTION 环境变量）
      process.env.TOOL_EXECUTION = "sequential";
    } else if (arg === "-l" || arg === "--list") {
      opts.list = true;
    } else if (arg === "--session") {
      opts.session = args[i + 1];
      i++;
    } else if (arg === "--new") {
      opts.fresh = true;
    }
    // 其他参数忽略（简化版）
  }
  return opts;
}

// ---- 入口 ----
const opts = parseArgs(args);
main(opts);
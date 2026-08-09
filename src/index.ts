// ============================================================
// index.ts — 入口文件：解析命令行参数，启动程序
//
// 新增：CLI 参数解析（深度复刻②）
//   -p / --print "..."  非交互：直接处理这句话，跑完退出
//   --model xxx         指定模型
//   -h / --help         显示帮助
//
// process.argv = Node 给我们的命令行参数数组
// ============================================================

import { main } from "./cli";

// ---- 命令行参数解析 ----
// process.argv.slice(2) 去掉前两个（node 路径和脚本路径），只留用户传的
const args = process.argv.slice(2);

interface CliOptions {
  prompt?: string; // 非交互模式的提示词
  model?: string; // 指定模型
  help?: boolean; // 是否显示帮助
}

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
    }
    // 其他参数忽略（简化版）
  }
  return opts;
}

// ---- 入口 ----
const opts = parseArgs(args);
main(opts);

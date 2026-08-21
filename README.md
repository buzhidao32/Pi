# my-pi — 从零实现的 AI 编码 Agent

> 一个用 TypeScript 从零手写的 **AI 编码 agent**（terminal coding agent），复刻了 [earendil-works/pi](https://github.com/earendil-works/pi) 的核心架构。
> 支持多 LLM 提供商、工具调用循环、会话持久化。

## ✨ 功能特性

- **Agent 循环**：反复"问 LLM → 执行工具 → 回喂结果 → 再问"，直到 LLM 给出答案
- **四工具**：`read`（读文件）/ `write`（写文件）/ `edit`（精确替换）/ `bash`（执行命令）
- **多工具并行**：一批工具调用先串行准备、再并行执行、按序回喂（`--sequential` 可强制串行）
- **输出截断**：bash 超长输出只留尾部、read 单行限长，截断时附指引，防上下文撑爆
- **工具超时**：bash 支持可选 timeout 秒数，卡住的命令超时自动终止并提示，不干等
- **上下文压缩**：历史对话超 16000 字符自动压成摘要，保留最近 5000 字符；摘要增量更新，不重复重压
- **多提供商**：支持 opencode go、dieqiyun 中转站、本地 mock（测试用），一键切换
- **多会话**：一会话一文件，`--list` 列表 / `--session <名>` 切换 / `--new` 开新，重启自动恢复最近会话
- **自动重试**：429 限流 / 5xx 服务器错误时指数退避重试
- **安全机制**：edit 工具要求 old_text 唯一匹配，防止误改；工具错误返回给 LLM 而非崩溃

## 🏗️ 架构

```
┌────────────────────────────────────────────────┐
│  index.ts   入口（启动）                         │
├────────────────────────────────────────────────┤
│  cli.ts     命令行交互 + 会话加载/保存            │
│  session.ts 会话持久化（JSON 文件）              │
├────────────────────────────────────────────────┤
│  agent.ts   Agent 循环（核心：调工具、回喂）      │
├────────────────────────────────────────────────┤
│  llm.ts     LLM 对话（发请求、重试、解析）        │
│  config.ts  多提供商配置（key 走环境变量）        │
│  types.ts   共享类型定义                         │
├────────────────────────────────────────────────┤
│  tools/     工具注册表 + read/write/edit/bash    │
└────────────────────────────────────────────────┘
```

**依赖方向**：`index → cli → agent → llm/tools`，上层只依赖下层，职责单一。

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置 API key（二选一，密钥只存环境变量，不进代码）
$env:OPENCODE_API_KEY = "sk-xxx"        # opencode go 套餐（默认）

# 3. 运行
npm run dev
```

### 切换提供商

```bash
# opencode go（默认，模型 deepseek-v4-flash）
npm run dev

# dieqiyun 中转站
$env:PROVIDER = "dieqiyun"
npm run dev

# 本地 mock 服务器（测试用，无需 API key）
$env:MOCK = "1"
npm run dev
```

## 🧪 测试

```bash
npm test        # 运行全部自动化测试（vitest）
npm run typecheck   # 类型检查
```

覆盖：会话存取的往返、文件不存在时的空数组、read 工具的 offset/limit 换算、错误处理、超长提示。

## 🧠 Agent 循环原理

```
用户输入
  → 发请求给 LLM（附上所有工具的说明书 def）
  → LLM 回复两种情况：
      ① 纯文字      → 最终答案，结束
      ② tool_calls  → LLM 说"我要调 X，参数是 Y"
  → agent 查表执行工具
  → 结果作为 role:"tool" 消息回喂（带 tool_call_id 配对）
  → 循环，直到 LLM 给纯文字答案
```

**关键设计**：
- 工具 = **说明书（def）+ 实现（run）** 分离——LLM 看说明书决定用哪个，agent 按名字查表执行
- **工具错误返回给 LLM** 而非崩溃——LLM 看到错误能调整策略
- **edit 必须唯一匹配**——防止误改多处相同内容

## 📁 项目结构

```
src/
├── index.ts       # 入口
├── cli.ts         # 命令行交互
├── agent.ts       # Agent 循环（核心）
├── llm.ts         # LLM 对话
├── session.ts     # 会话持久化
├── config.ts      # 多提供商配置
├── types.ts       # 共享类型
└── tools/         # 工具（read/write/edit/bash）
test/              # 自动化测试
examples/          # 最小完整版存档（236 行）
```

## 🔧 技术栈

- **TypeScript** + Node.js（原生 `fetch`、`node:fs/promises`）
- **vitest** 测试框架
- OpenAI 兼容 Chat Completions 协议

## 📝 License

MIT

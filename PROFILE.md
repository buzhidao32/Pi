# PROFILE.md — 我的学习画像

> 这份文档记录"我是谁、我在学什么、我该怎么被教"。新开对话时可以把这份文档发给 AI，让它快速了解我，用正确的方式教我。
> 内容与 Claude 的内部记忆同步更新，此文件是给自己看的版本。

## 我是谁

- **身份**：计算机专业在读学生，正在求职（目标：找到程序员工作）。
- **当前目标**：从零复刻 pi-coding-agent，做成**能写进简历的作品**（TypeScript + AI Agent 方向）。

## 我的编程基础（重要，教学方式由此决定）

- 学过 **Python 基础**（懂 `json.loads`、元组解包 `a, b = 3, 4`、`dict/list` 等概念）。
- 学过一点 **JavaScript 基础**，但**忘了很多**，需要经常复习。
- **TypeScript 一窍不通**，需要从 Python/JS 视角逐行翻译讲解。

## 我最有效的学习方式

1. **双翻译**：TS 代码要用 Python 和 JS 两种语言翻译给我看，不能只贴代码。
2. **分段确认**：一次只讲一段，讲完问"懂了吗"，确认后再继续。
3. **记忆口诀**：`{}` 解构按名字，`[]` 解构按位置；`JSON.parse` = Python `json.loads`；`??` 是空值合并。
4. **面试视角**：学的每个点，告诉我"面试官会怎么问、我该怎么答"。
5. **动手验证**：每学一段最好能实际跑起来看效果。

## 我的项目现状

- 复刻目标：GitHub 的 [earendil-works/pi](https://github.com/earendil-works/pi)（AI 编码 agent）
- 我的仓库：[buzhidao32/Pi](https://github.com/buzhidao32/Pi)
- 参考源码：`D:\Desktop\pi-reference`（已 clone）
- 用 OpenAI 兼容中转站，模型 `gpt-5.6-luna`

## 完成里程碑

- ✅ M1 最小对话 agent
- ✅ M2 工具调用循环（bash）+ mock 测试
- ⬜ M4 模块化重构（当前下一步）
- ⬜ M3 补全 read/write/edit 四工具
- ⬜ M6 会话持久化
- ⬜ M7 测试 + README 架构图

## 学习资料

- `LEARN-TS.md` —— TS↔Python↔JS 速查手册（项目根目录）
- `examples/minimal-agent-236lines.ts` —— 最小完整 agent 存档

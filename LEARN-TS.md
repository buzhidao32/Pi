# LEARN-TS.md — TS 小白速查手册（从 Python 视角）

> 你只学过 Python。这份手册专门帮你把 TS 语法"翻译"成 Python，看到不懂的直接查表。
> 用法：看代码时遇到不认识的关键字，在这里 Ctrl+F 搜。

## 0. 最重要的一句话

**Python 的类型注解是给人看的（运行不检查）；TS 的类型是编译器检查的（写错不让运行）。**
所以我们会先跑 `npx tsc --noEmit`（"类型体检"）再运行。

## 1. 快速翻译表

| TS 语法 | Python 对应 | 例子 |
|---|---|---|
| `const x = 5` | `x = 5` | 定义不可变变量 |
| `let x = 5` | `x = 5` | 定义可变变量 |
| `function f(a: number): string` | `def f(a: int) -> str` | 函数签名 |
| `async function f()` / `await f()` | `async def f()` / `await f()` | 一模一样 |
| `interface Message { name: string }` | 字段声明（类似 dataclass） | 描述对象形状 |
| `name?: string` | `name: str = None` | `?` = 可选字段 |
| `type Role = "a" \| "b"` | `Literal["a", "b"]` | 只能取这些值 |
| `string` | `str` | 字符串 |
| `number` | `int` / `float` | 数字 |
| `boolean` | `bool` | 布尔 |
| `null` | `None` | 空值 |
| `undefined` | `None`（但语义略不同） | 未定义 |
| `Record<string, T>` | `dict[str, T]` | 字典 |
| `T[]` | `list[T]` | 列表 |
| `Array<T>` | `list[T]` | 列表（另一种写法） |
| `{ name: x }` | `{"name": x}` | 对象字面量 |
| `x.y` | `x.y` / `x["y"]` | 取属性 |
| `(t) => t.def` | `lambda t: t.def` | 箭头函数 = lambda |
| `.map(t => t.def)` | `[t.def for t in xs]` | 对每个元素变换 |
| `.filter(t => t.x)` | `[t for t in xs if t.x]` | 过滤 |
| `.find(t => t.x)` | `next((t for t in xs if t.x), None)` | 找第一个匹配 |
| `.forEach(t => f(t))` | `for t in xs: f(t)` | 遍历 |
| `for (const x of xs)` | `for x in xs` | 遍历 |
| `for (const k in obj)` | `for k in dict` | 遍历字典键 |
| `x ? y : z` | `y if x else z` | 三元表达式 |
| `a && b` | `a and b` | 且 |
| `a \|\| b` | `a or b` | 或 |
| `!x` | `not x` | 非 |
| `` `hi ${name}` `` | `f"hi {name}"` | f-string |
| `\n` | `\n` | 换行 |
| `// 注释` | `# 注释` | 注释 |
| `err instanceof Error` | `isinstance(err, Exception)` | 类型判断 |
| `JSON.parse(s)` | `json.loads(s)` | JSON 字符串→对象 |
| `JSON.stringify(o)` | `json.dumps(o)` | 对象→JSON 字符串 |
| `import { a } from "mod"` | `from mod import a` | 导入特定成员 |
| `import * as m from "mod"` | `import mod` | 整包导入 |
| `export function f()` | 模块级函数（天然导出） | 导出 |
| `readFile(path, "utf-8")` | `open(path).read()` | 读文件（返回字符串） |
| `writeFile(path, content, "utf-8")` | `open(path, "w").write(content)` | 写文件（覆盖） |
| `mkdir(dir, { recursive: true })` | `os.makedirs(dir, exist_ok=True)` | 创建目录（含父目录） |
| `dirname(path)` | `os.path.dirname(path)` | 取父目录路径 |
| `text.split("\n")` | `text.split("\n")` | 按换行切成数组 |
| `arr.slice(a, b)` | `arr[a:b]` / `str[a:b]` | 切片（含 a 不含 b） |
| `str.indexOf(x)` | `str.index(x)` | 找 x 第一次出现的位置 |
| `str.indexOf(x, start)` | `str.index(x, start)` | 从 start 位置往后找 |
| `arr.map((x, i) => f(x, i))` | `[f(x, i) for i, x in enumerate(arr)]` | 遍历时带下标 |
| `arr.join("\n")` | `"\n".join(arr)` | 数组拼成字符串 |
| `typeof x === "number"` | `isinstance(x, (int, float))` | 判断类型 |

## 2. TS 特有、Python 没有的概念（重点记）

### 2.1 `interface` / `type` — 描述对象"长什么样"
```ts
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];   // ? 表示可缺省
}
```
理解：这不是运行代码，是**给编译器和 IDE 看的说明书**。声明了 `Message` 必须有 `role` 和 `content`。

### 2.2 类型断言 `as`
```ts
const data = (await res.json()) as { choices: [...] };
```
`res.json()` 返回"不知道是什么"的 `unknown` 类型。`as` 是**骗编译器**："相信我，它就是这个形状"。Python 没有，因为 Python 运行时才查。

### 2.3 泛型 `Promise<T>`
```ts
async function chat(): Promise<ChatResponse>
```
`Promise<T>` 意思是"这个函数是异步的，最终会返回一个 `T`"。`await chat()` 拿到的就是 `T`。
类比：Python 里 async 函数天然返回 coroutine，TS 显式写成 `Promise<T>`。

### 2.4 `unknown` vs `any`
- `any`：放开所有类型检查（危险，别用）
- `unknown`：不知道类型，必须 `as` 断言后才能用（安全）

## 3. 本项目核心代码的"逐行翻译"

### agent 循环（src/index.ts 的 agentLoop）
```ts
// TS
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  const { message, usage } = await chat(messages, toolDefs);
  if (!message.tool_calls || message.tool_calls.length === 0) {
    console.log(`pi> ${message.content}`);
    return;
  }
  messages.push(message);
  for (const toolCall of message.tool_calls) {
    const result = await tools[toolCall.function.name].run(args);
    messages.push({ role: "tool", content: result, tool_call_id: toolCall.id });
  }
}
```
```python
# 等价 Python（只改语法，逻辑不变）
for round in range(MAX_TOOL_ROUNDS):
    message, usage = await chat(messages, tool_defs)
    if not message.tool_calls:
        print(f"pi> {message.content}")
        return
    messages.append(message)
    for tool_call in message.tool_calls:
        result = await tools[tool_call.function.name].run(args)
        messages.append({"role": "tool", "content": result, "tool_call_id": tool_call.id})
```

## 4. async/await：什么时候加？（超高频疑问）

### 4.1 核心规则
> **凡是函数里要"等待某件慢的事"（读文件、发网络、等定时器、调另一个 async 函数），这个函数就得加 `async`。纯计算（算数、字符串、数组）不需要。**

### 4.1.1 async vs await 的区别（最易混）
> **`async` 用在"函数定义"上（身份）；`await` 用在"调用"上（动作）。**

| 场景 | 用 async? | 用 await? |
|---|---|---|
| 定义函数 | ✅ 函数名后加 | ❌ |
| 调用 async 函数 | ❌ | ✅ 函数名前加 |
| 调用 readFile/writeFile/fetch | ❌ | ✅ |

```ts
async function run(args) {          // 定义：用 async
  const text = await readFile(path); // 调用：用 await
}
```
> 口诀：**`async` 是身份，`await` 是动作**。函数生下来是不是异步的用 async，用的时候要不要等用 await。

### 4.2 慢操作清单（函数体里出现任何一个就必须 async）
| 慢操作 | Node 写法 | Python 对应 |
|---|---|---|
| 读文件 | `await readFile(...)` | asyncio 读文件 |
| 写文件 | `await writeFile(...)` | asyncio 写文件 |
| 发网络请求 | `await fetch(...)` | `requests` / `aiohttp` |
| 执行命令 | `await execAsync(...)` | `subprocess.run` |
| 等待 | `await new Promise(...)` | `await asyncio.sleep()` |
| 调另一个 async 函数 | `await chat(...)` | `await some_async()` |

### 4.3 关键：async 会"传染"
> **你一旦 `await` 了一个 async 函数，你所在的函数也必须变成 async。这个"传染"一路向上蔓延。**

项目里的传染链（看箭头，async 从最底层慢操作一路传到 main）：
```
main()           是 async —— 因为 await 了 agentLoop()
  └─ agentLoop() 是 async —— 因为 await 了 chat() 和 tool.run()
       └─ chat()     是 async —— 因为 await 了 fetch()（网络）
       └─ tool.run() 是 async —— 因为 await 了 readFile/writeFile/exec
```

### 4.4 反例（不用 async）
```ts
// 纯数组操作，不碰慢东西 → 不用 async
export function getToolDefs(): ToolDef[] {
  return Object.values(tools).map((t) => t.def);
}
// 取参数、转字符串、判断 → 都不用 await
const path = String(args.path ?? "");
if (!path) return "错误：缺少 path 参数";
```

### 4.5 判断口诀
> **函数体里出现 `readFile` / `writeFile` / `fetch` / `exec` / `question` 等词 → 必须 async。只有纯计算 → 不用。**

自测：①`a+b`→不用 ②`await readFile(...)`→要 ③`text.trim().toUpperCase()`→不用 ④`await fetch(...)`→要

## 5. 遇到看不懂的怎么办
1. 在本文件 Ctrl+F 搜关键字
2. 搜不到就问 Claude："这个 TS 语法用 Python 怎么说？"

## 6. M3 工具开发实战笔记（read/write/edit/bash）

### 5.1 文件读写三件套（最常用）
```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const text = await readFile(path, "utf-8");          // 读文件 → 字符串
await writeFile(path, content, "utf-8");             // 写文件 → 覆盖
await mkdir(dirname(path), { recursive: true });     // 建父目录（写多层路径前先调）
```
> `node:fs/promises` = Python 的 `pathlib` / `os`，**全是异步的**，都要 `await`。

### 5.2 字符串查找与切片（edit 工具的核心）
```ts
const first = content.indexOf(oldText);              // 第一次出现的位置，找不到返回 -1
const second = content.indexOf(oldText, first + 1);  // 从 first 往后再找一次 → 判断是否唯一

// 替换：前段 + 新内容 + 后段
const newContent = content.slice(0, first) + newText + content.slice(first + oldText.length);
```
> **`indexOf` 找不到返回 `-1`**（Python 是抛异常）——这就是为什么代码要判断 `if (first === -1)`。

### 5.3 工具开发的三条铁律（pi 的真实做法）
1. **错误要返回给 LLM，不要抛异常**——LLM 看到错误信息才能调整策略（比如 edit 找不到 old_text，LLM 会重新 read 再试）。
2. **edit 的 old_text 必须唯一匹配**——否则拒绝。防止 LLM 想改一处却误改了文件里另一处相同的内容。
3. **说明书（description）写清楚**——LLM 靠它判断"这个任务该用哪个工具"。description 越准，工具被用得越对。

### 5.4 工具的基本结构（每个工具都是这个模板）
```ts
export const def: ToolDef = {   // 1. 说明书：给 LLM 看的
  type: "function",
  function: { name: "xxx", description: "干什么用", parameters: { ... } },
};
export async function run(args: Record<string, unknown>): Promise<string> {  // 2. 实现
  // 取参数 → try/catch 执行 → 返回字符串（成功或错误信息）
}
```

### 5.5 parameters / properties 是什么（JSON Schema）
> **`parameters` = 描述"这个工具要的参数整体长什么样"（顶层）；`properties` = 里面具体有哪些字段。** 两者都是给 LLM 看的"填表说明"，不是代码。
```ts
parameters: {                          // 整张表
  type: "object",                      // 参数是一个对象 {}
  properties: {                        // 表里的栏目
    path:   { type: "string" },        // 栏目1：path 是字符串
    offset: { type: "number" },        // 栏目2：offset 是数字
  },
  required: ["path"],                  // 哪些必填（path 必填，offset 可不填）
}
```
> `required` 里没列的 = 可选（有默认值）。

### 5.6 map 的第二个参数 i（下标）—— 数字哪来的
> **`map((line, i) => ...)` 里的 `i` 是 map 自动给的"当前是第几个元素"（下标 0,1,2…），不用自己声明。** 类似 Python 的 `enumerate`。
```ts
// 目的：给每行加"真实行号"前缀，让 LLM 能准确引用"第 4 行有个 bug"
const numbered = selected.map((line, i) => `${start + i + 1}\t${line}`).join("\n");
```
> `start` = 本次读取的起始下标（0-indexed），`i` = 第几个元素，`+1` 转成 1-indexed 行号。
> 例：offset=3 → start=2，第1个元素 i=0 → 行号 `2+0+1=3`；第2个元素 i=1 → `2+1+1=4`。
> `\t` 是 Tab（显示成多个空格），`3\tline3` 渲染出来就是 `3    line3`。

### 5.6.1 重大误区：`line` 是变量名，不是文本 "line"
> `${line}` 里的 `line` 是**变量**，存的是数组里当前那个元素的**内容**。如果文件每行恰好叫 "line1/line2/line3"，`line` 的值就是 "line3"，输出 `3\tline3`。如果内容是 a/b/c/d/e，`line` 的值是 "c"/"d"，输出 `3\tc`、`4\td`。
> **别把"变量名"和"变量值"混淆**：`line` 是名字，`line` 存的这行内容才是输出的东西。

### 5.6.2 三列对齐表（下标/内容/行号 别混）
```
内容:     a      b      c      d      e
下标:     0      1      2      3      4     ← 数组下标（0-indexed）
行号:     1      2      3      4      5     ← 人的数法（1-indexed）
```
- `lines` = 整个文件数组（["a","b","c","d","e"]）
- `start` = 下标数字（offset-1），不是内容
- `selected` = `lines.slice(start, end)` 截出的内容数组
- 行号 = `start+i+1`，是给人/LLM 看的，不是下标

### 5.6.3 line/i 为什么不用预先定义？（map 自动传参）
> `map((line, i) => ...)` 里 `line` 和 `i` **不需要**你先 `const line = ...`。因为 `map` 会遍历数组，**自动**把每个元素传给 `line`、把下标传给 `i`。
> Python 类比：`for line in lines` / `for i, line in enumerate(lines)` 里的变量都是 for 自动给的。
> 所以：`line` = 当前元素内容（取决于文件内容），`i` = 当前下标。变量存什么看数据，代码不写死。
> **取内容要写 `lines[start]`（下标→内容）；光写 `start` 只是下标数字。**

### 5.6.4 完整理解链（读 read.ts 的 5 步）
1. `lines` = 整个文件切成数组
2. `start` / `end` = 下标数字（offset-1 换算）
3. `lines.slice(start, end)` = 按下标切出内容数组
4. `line` / `i` = map 自动给的（内容 / 下标）
5. 行号 `start+i+1` = 给人看的数字，不是下标

### 5.7 分页读文件：offset/limit 与 1-indexed↔0-indexed
```ts
const start = Math.max(0, offset - 1);        // 人的"第几行"→ 数组下标（offset-1）
const end = Math.min(start + limit, lines.length);  // 防越界（取较小值）
const selected = lines.slice(start, end);     // 切片：含 start 不含 end
```
> - **1-indexed**：人/LLM 从 1 数（第1行）；**0-indexed**：程序下标从 0 数。LLM 说 offset=3，程序用 `3-1=2`。
> - `slice(a,b)` 含 a 不含 b（和 Python `arr[a:b]` 一样）。
> - `Math.max` / `Math.min` 是保护：防止 offset 传负数、end 超出文件长度。

## 7. agent 工作原理（面试必答，务必理解）
### 6.1 工具循环流程（agent 的灵魂）
```
用户输入
  → 发请求给 LLM（附上所有工具的说明书 def）
  → LLM 回复两种情况之一：
      ① 纯文字      → 这就是最终答案，结束
      ② tool_calls  → LLM 说"我要调 X 工具，参数是 Y"
  → agent 执行工具，拿到结果
  → 把结果作为 role:"tool" 的消息回喂给 LLM（必须带 tool_call_id 配对）
  → 回到"发请求"这一步，循环
  → 直到 LLM 给纯文字答案，或超过最大轮数
```
**终止条件**：LLM 不再返回 tool_calls，而是给纯文字。**`tool_call_id` 必须对上**，否则 API 报错。

### 6.2 EOF（End Of File）与管道输入
- **EOF = 输入到尽头**。程序读输入就像从水管接水，EOF = 水管被关死（不会再有水了）。
- 触发时机：按 Ctrl+D / Ctrl+Z，或**管道输入**（`printf 'hi' | npm run dev`）读完了。
- Node 的 readline 遇到 EOF 时，`rl.question()` **不是返回空，而是直接抛异常**。
- 所以代码要 `try { input = await rl.question(...) } catch { break }` 接住，否则崩溃。
- 交互式终端（手动打字）不会 EOF，程序一直等输入。

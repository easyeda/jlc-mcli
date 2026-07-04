# @jlc/mcli 实现设计

## 0. 已确认决策

| #   | 话题                         | 决策                                                                                               |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| D1  | 核心包是否注册示例命令       | 不注册。纯框架，用户项目自己注册。单元测试覆盖所有场景                                             |
| D2  | 搜索评分算法                 | 用 **trigram（n-gram 3）相似度**，按得分降序返回到 limit，阈值 0.15 过滤噪声                       |
| D3  | `--explain` / `mcli.explain` | **砍掉**。help + schema + description 已够，避免重复信息                                           |
| D4  | MCP tool 数量                | **3 个独立 tool**：`search`、`help`（含 schema）、`call`                                           |
| D5  | 包定位                       | 纯库，不自带 CLI binary。只暴露 `runCli(app, argv)` 驱动函数                                       |
| D6  | `startMcp` 是否导出          | **不导出**。`--mcp` 是 `runCli` 内部处理的 flag，`startMcp` 是内部实现细节                         |
| D7  | schema 入参形态              | **直接收 JSON Schema 对象**。校验用 ajv（MCP SDK 的传递依赖）                                      |
| D8  | `--schema` CLI flag          | **砍掉**。MCP 路径通过 `mcli.help` 拿 schema，CLI 不需要单独暴露                                   |
| D9  | `CommandResult.summary`      | **砍掉**。CLI 输出由 `display` 回调完全控制                                                        |
| D10 | CLI 输出机制                 | 命令可选提供 `display(result)` 回调；未提供时 fallback 到 `JSON.stringify(result)`                 |
| D11 | examples.argv                | **砍掉**。由框架从 `path` + `input` 动态反推                                                       |
| D12 | MCP 传输协议                 | **stdio + stateless Streamable HTTP**。不实现 WebSocket（协议未稳定），不引入 MCP session 生命周期 |

---

## 1. 范围

MVP 清单：

1. `createMcli`
2. `group`
3. `command`（含可选 `display` 回调）
4. 顶层子命令解析
5. `--help`
6. `--search`
7. `--json`
8. `--mcp stdio`
9. `--mcp http`（stateless Streamable HTTP）
10. MCP tools: `mcli.search` / `mcli.help` / `mcli.call`
11. JSON Schema 参数定义
12. ajv 校验 + default 填充
13. 错误结构化输出
14. examples 注册时 schema 校验

---

## 2. 最终文件结构

```txt
src/
├── index.ts                  # 公开导出：createMcli, runCli
├── types.ts                  # 共享类型定义
├── core/
│   ├── createMcli.ts         # 工厂：创建 McliApp 实例（含 examples 校验）
│   ├── tree.ts               # CommandTree：节点存储、遍历、查找
│   ├── execute.ts            # 统一执行器：ajv 校验 + default 填充 + handler
│   └── search.ts             # 命令搜索 + trigram 评分
├── cli/
│   ├── runCli.ts             # CLI 驱动函数
│   ├── parseArgv.ts          # splitGlobalFlags + parseInputArgv
│   └── render.ts             # 文本渲染：help / searchResult
└── mcp/
    ├── server.ts             # MCP Server 装配：注册 3 个 tool
    └── streamableHttp.ts     # Stateless Streamable HTTP 传输

tests/  （51 tests / 8 files）
├── core/
│   ├── tree.test.ts          # 4
│   ├── createMcli.test.ts    # 6（含 examples 校验）
│   ├── execute.test.ts       # 5
│   └── search.test.ts        # 5
├── cli/
│   ├── parseArgv.test.ts     # 13
│   ├── render.test.ts        # 4
│   └── runCli.test.ts        # 10（含 display 回调）
└── mcp/
    └── tools.test.ts          # 4
```

构建产物：

```txt
dist/
├── index.js                  # 库入口
└── index.d.ts                # 类型
```

---

## 3. 依赖

| 包                          | 用途                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk` | MCP Server 协议（McpServer / StdioServerTransport / StreamableHTTPServerTransport） |

ajv 是 `@modelcontextprotocol/sdk` 的传递依赖，用于 JSON Schema 校验。

---

## 4. 核心类型

```ts
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: JSONSchema;
  [key: string]: unknown;
}

export interface CommandResult {
  data?: unknown;
  next?: Array<{ path: string; reason: string }>;
}

export interface CommandExample {
  title: string;
  input: Record<string, unknown>;
}

export interface CommandOptions {
  summary: string;
  description?: string;
  input: JSONSchema;
  examples?: CommandExample[];
  related?: string[];
  handler: (
    input: Record<string, unknown>,
    ctx: CommandContext,
  ) => Promise<CommandResult> | CommandResult;
  display?: (result: CommandResult) => void;
}

export interface CommandNode {
  path: string;
  argv: string[];
  name: string;
  summary: string;
  description?: string;
  input?: JSONSchema;
  examples?: CommandExample[];
  related?: string[];
  handler?: CommandOptions["handler"];
  display?: CommandOptions["display"];
  isGroup: boolean;
  children: Map<string, CommandNode>;
}

export interface McliApp {
  readonly name: string;
  readonly version: string;
  readonly summary: string;
  group(path: string, opts: GroupOptions): void;
  command(path: string, opts: CommandOptions): void;
  resolve(argv: string[]): CommandNode | null;
  allCommands(): CommandNode[];
}
```

**关键变化（vs init.md 原始设计）：**

- `CommandResult` 无 `summary`；输出由 `display` 完全控制
- `CommandExample` 无 `argv`，由框架动态生成
- `CommandOptions.display` 为新字段，命令级别可选 CLI 渲染器

---

## 5. 模块实现

### 5.1 `core/tree.ts`

- `insert(path, node)`、`find(argv)`、`traverse(fn)`
- 路径用 `.` 分隔；根为虚拟空节点

### 5.2 `core/createMcli.ts`

- 工厂函数，返回 `McliApp` 实例
- `group()` / `command()` → 委托 tree.insert（store 包括 `display`）
- **注册时校验 examples**：`command()` 入口用 ajv 校验每个 `example.input` 是否符合 `input` schema，失败抛 `Error("Command ... example ... input invalid: ...")`
- `resolve(argv)` / `allCommands()` → 委托 tree

### 5.3 `core/execute.ts`

```ts
execute(node, input, ctx?) → Promise<CommandResult>
```

1. 校验 input schema 存在
2. `fillDefaults`：用 schema.default 补全缺失 optional 字段
3. `ajv.compile` + validate；失败抛 `McliValidationError`
4. 调用 `node.handler(withDefaults, ctx)`

### 5.4 `core/search.ts`

- `search(app, query, limit = 10)` → `SearchMatch[]`
- trigram with padding `  text  `，score = |∩| / |Q|
- 阈值 0.15 噪声过滤
- 遍历所有命令，`text = path + " " + summary + " " + (description ?? "")`
- 按 score 降序截断

### 5.5 `cli/parseArgv.ts`

```ts
splitGlobalFlags(argv) → { global, argv }
parseInputArgv(argv) → Record<string, unknown>
```

Global flags: `--help` / `--search <q>` / `--json` / `--mcp <stdio|http>` + http sub-opts (`--host` / `--port` / `--token` / `--cors`)。

Input parsing：`--no-x`、`--key value`、`--key=value`、`--flag`（自动 true）；值类型自动转型（number / boolean）；key 转 camelCase；positional 跳过。

### 5.6 `cli/render.ts`

- `renderHelp(node)` → 人类可读（分组含 children；命令含 usage/options/examples/related）
- `renderSearchResult(matches)` → 搜索结果文本
- `exampleToArgv(cmdArgv, input)` → 动态生成示例命令行（camelCase → hyphen，boolean 处理 `--flag` / `--no-flag`）

### 5.7 `cli/runCli.ts`

```ts
runCli(app, argv) → Promise<void>
```

执行流程：

```
splitGlobalFlags
  → --mcp            → startMcp（内部）
  → --search         → search + 输出
  → walk deepest node via app.resolve  （unknown path → exit 1）
  → --help           → renderHelp（文本） 或 JSON（含 children + input + isGroup）
  → group node       → renderHelp
  → command node     → parseInputArgv + execute
       ├─ display provided  → display(result)
       ├─ --json            → JSON { ok, path, data, next }
       └─ default           → JSON.stringify(result, null, 2)
```

错误路径：`McliValidationError` / `McliExecutionError` → stderr "Error: ..." 或 JSON `{ ok: false, path, error }`

### 5.8 `mcp/server.ts`

```ts
export async function startMcp(app, opts); // 仅 runCli 内部调用
```

注册 3 个 tool（MCP SDK `McpServer.registerTool`）：

| tool          | inputSchema                         | handler                                                        |
| ------------- | ----------------------------------- | -------------------------------------------------------------- |
| `mcli.search` | `{ query: string, limit?: number }` | `search(app, query, limit)` → `{ matches }`                    |
| `mcli.help`   | `{ path: string }`                  | `app.resolve(path.split("."))` → JSON；命令节点附 `input` 字段 |
| `mcli.call`   | `{ path: string, input?: object }`  | `execute(node, input)` → 成功/失败 JSON                        |

所有 tool handler 返回 `{ content: [{ type: "text", text: JSON.stringify(result) }] }`，错误时 `{ isError: true, ... }`。

`opts.transport === "stdio"` → `server.connect(new StdioServerTransport())`，否则调 `startStreamableHttp(server, opts)`。

### 5.9 `mcp/streamableHttp.ts`

Stateless Streamable HTTP：每个 POST 请求创建新 `StreamableHTTPServerTransport`（`sessionIdGenerator: undefined`），处理完即关闭。

- 仅支持 POST；GET/DELETE 返回 405
- 支持可选 token 校验（`Authorization: Bearer <token>`）
- 支持可选 CORS（preflight + response headers）
- 不引入 session 生命周期

---

## 6. 导出 API

```ts
export { createMcli } from "./core/createMcli";
export { runCli } from "./cli/runCli";
export type { McliApp, CommandNode, CommandResult, CommandContext, JSONSchema } from "./types";
```

---

## 7. 构建配置

单入口。deps.neverBundle 包含 `@modelcontextprotocol/sdk` 及其子路径。

---

## 8. 测试覆盖

**51 tests / 8 files / all passing。**

---

## 9. 后续（未纳入 MVP）

- positional 参数
- `ajv-formats` 格式校验（email / uri 等）
- MCP session 生命周期（stateful Streamable HTTP）
- WebSocket 传输（待协议稳定）
- `display` 回调注册时类型校验

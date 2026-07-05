# MCP 裸实现改造 spec

> 本文件记录 `mcli` 从 `@modelcontextprotocol/sdk` 迁移到裸 JSON-RPC 2.0 + ajv 校验的方案设计。
> **status: 已落地的实现**(截至 2026-07-05)。

---

## 0. 改造目标

| 维              | 改造前                                | 改造后                                                              |
| --------------- | ------------------------------------- | ------------------------------------------------------------------- |
| MCP 协议层      | `@modelcontextprotocol/sdk`(强绑 zod) | 自实现 `McpBareServer` + `StdioTransport` + `HttpTransport`(无 SDK) |
| Schema 入参形态 | zod 实例(`z.object({})` 等)           | 纯 JSON Schema Draft-7 子集                                         |
| Schema 校验器   | zod v3/v4(隐含在 SDK)                 | ajv 严格模式 (`strict:true`) + v7 白名单预检                        |
| package.json    | 依赖 SDK + peer zod/SDK               | 仅 dependencies `ajv`(bundled 进 dist 进 ESM)                       |
| 工具作者自由度  | 必须装 zod 且写 zod 实例              | 任意 JSON Schema(TypeBox/zod/手写 JSON 都行)                        |

---

## 1. 已确认决策表

| #   | 话题                         | 决策                                                                                                                 |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Q1  | `initialize.protocolVersion` | `"2025-06-18"`(MCP 最新稳定版)                                                                                       |
| Q2  | `initialize.capabilities`    | `{ tools: {} }`(最小声明)                                                                                            |
| Q3  | Streamable HTTP GET          | 不支持,任何非 POST 返回 `405 Method Not Allowed`                                                                     |
| Q4  | MCP Session 管理             | 无状态,POST 独立处理                                                                                                 |
| Q5  | Tool 名字前缀                | 可配置 `createMcli({ toolPrefix })`,默认等于 `name`;3 个工具 `{prefix}.help` / `{prefix}.discover` / `{prefix}.call` |
| Q6  | inputSchema 透传             | `command()` 注册时强制 v7 子集,非白名单关键字立即抛错;tools/list 下发时透传原始 JSON Schema                          |
| Q7  | 工具调用失败                 | `{ isError: true, content: [{ type: "text", text }] }` 统一包一层                                                    |
| Q8  | tools/call 返回结构          | 只发 `content`(`text` 字段内 JSON.stringify)                                                                         |
| Q9  | MCP 层实现                   | 纯裸实现(McpServer + transport 均自实现)                                                                             |
| Q10 | zod 在 package.json          | 完全消失(dependencies/peerDependencies/devDependencies 均无 `zod` 字眼)                                              |
| Q11 | mcp 代码位置                 | 旧 `mcp/server.ts` + `mcp/streamableHttp.ts` 全删,新建 `mcp/bare/` + `mcp/index.ts`                                  |
| Q12 | ajv-formats                  | 不加。ajv 开 `strict:true`,未定义关键字(`format` 等)由 ajv 直接抛错,预检同时也提示用户改用 handler 处理              |

---

## 2. 顶层文件结构(改造后)

```txt
src/
├── index.ts                      # 公开导出：createMcli, runCli
├── types.ts                      # 共享类型(McliApp 新增 ___mcli 内部字段)
├── core/                         # 部分改动
│   ├── createMcli.ts             # CreateMcliOptions 新增 toolPrefix;command() 注册新增 v7 预检 + ajv 严格编译
│   ├── tree.ts / execute.ts / search.ts  # 无变化
├── cli/
│   ├── runCli.ts                 # 改动:import 从 `startMcp` 改为 `startBareMcp`
│   ├── parseArgv.ts / render.ts  # 无变化
└── mcp/
    ├── index.ts                  # 公开 startBareMcp 入口
    └── bare/
        ├── json-rpc.ts           # JSON-RPC 2.0 类型 + 方法常量 + 错误码 + makeErrorResponse / makeSuccessResponse 工厂
        ├── constants.ts          # MCP_CAPABILITIES_DEFAULT + MCP_PROTOCOL_VERSION
        ├── types.local.ts        # RegisteredTool / ToolResult / ContentBlock / CompiledToolValidator
        ├── errors.ts             # toolCallErrorToResult / toolCallSuccessToResult / invalidParamsError
        ├── validator.ts          # JsonSchemaToolkit 类(v7 白名单 + ajv 严格编译 + 缓存)
        ├── server.ts             # McpBareServer 类(INIT/LIST/CALL 路由 + 内置 tool 装配)
        └── transport/
            ├── stdio.ts          # StdioTransport(读 stdin 行,写 stdout)
            └── http.ts           # HttpTransport(stateless Streamable HTTP,带 CORS + token 校验)
```

**删除:**

- `src/mcp/server.ts`
- `src/mcp/streamableHttp.ts`

---

## 3. JSON-RPC 基础层

### 3.1 类型(`src/mcp/bare/json-rpc.ts`)

```ts
export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type JSONRPCMessage = JSONRPCRequest | JSONRPCNotification;

export interface JSONRPCSuccessResponse {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JSONRPCErrorResponse {
  jsonrpc: "2.0";
  id: string | number;
  error: JSONRPCError;
}

// 工厂函数
export function makeErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JSONRPCErrorResponse {
  /* ... */
}

export function makeSuccessResponse(id: string | number, result: unknown): JSONRPCSuccessResponse {
  /* ... */
}

// 方法常量
export const METHOD_INITIALIZE = "initialize";
export const METHOD_INITIALIZED = "initialized";
export const METHOD_TOOLS_LIST = "tools/list";
export const METHOD_TOOLS_CALL = "tools/call";

// 错误码
export const JSON_RPC_ERROR_PARSE_ERROR = -32700;
export const JSON_RPC_ERROR_INVALID_REQUEST = -32600;
export const JSON_RPC_ERROR_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_ERROR_INVALID_PARAMS = -32602;
export const JSON_RPC_ERROR_INTERNAL_ERROR = -32603;
export const MCP_ERROR_FUNCTION_NOT_FOUND = -32001;
export const MCP_ERROR_INVALID_INPUT = -32010;
```

### 3.2 常量(`src/mcp/bare/constants.ts`)

```ts
export const MCP_PROTOCOL_VERSION = "2025-06-18" as const;
export const MCP_CAPABILITIES_DEFAULT = { tools: {} };
```

---

## 4. Validators 双阶段校验(Q6 + Q12)

### 4.1 v7 子集白名单

`src/mcp/bare/validator.ts` 第 11-49 行:

```ts
export const JSON_SCHEMA_V7_WHITELIST: ReadonlySet<string> = new Set([
  "type",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "patternProperties",
  "dependencies",
  "propertyNames",
  "items",
  "additionalItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "title",
  "description",
  "default",
  "examples",
  // 内置字段
  "$id",
  "$schema",
  "$ref",
  "$comment",
]);
```

### 4.2 JsonSchemaToolkit 类

```ts
export class JsonSchemaToolkit {
  private ajv: Ajv;
  private cache = new Map<string, CompiledToolValidator>();
  private currentToolName = "(unknown)";

  constructor() {
    this.ajv = new Ajv({ strict: true, allErrors: true });
  }

  /** 阶段 1: 白名单预检(top-down 递归) */
  assertV7Subset(schema: JSONSchema, path = "inputSchema"): void {
    /* ... */
  }

  /** 阶段 2: ajv 严格编译(双重兜底) */
  compile(toolName: string, schema: JSONSchema): CompiledToolValidator {
    const cached = this.cache.get(toolName);
    if (cached) return cached;

    this.currentToolName = toolName;
    this.assertV7Subset(schema); // 先白名单预检

    let validate: Ajv.ValidateFunction;
    try {
      validate = this.ajv.compile(schema); // 再 ajv 编译
    } catch (err: any) {
      throw new Error(`mcli: tool '${toolName}' inputSchema invalid: ${err.message}.`);
    }

    const compiled = { toolName, validate, rawSchema: schema };
    this.cache.set(toolName, compiled);
    return compiled;
  }
}
```

**设计要点:**

- `cache`:同一个 tool 在其生命周期内只 compile 一次
- `strict:true`:ajv 直接拒绝任何未在 JSON Schema 规范里明确定义的关键字(`format` 等),给出明确的"unknown format" 错误信息
- `assertV7Subset` 是**预检**,先给 mcli 层面的友好文案(提示用户该走 handler);ajv 的编译是**二次兜底**(如 schema 本身有 v7 语法错误,如 properties 写错层级)

### 4.3 createMcli.command() 同步校验

`src/core/createMcli.ts` 在 `command()`/`group().command()` 注册时,立即调 `validateInputSchema`:

```ts
function validateInputSchema(input: any, cmdPath: string): void {
  if (!input) return;
  assertV7Subset(input, `command "${cmdPath}".inputSchema`);

  const ajv = new Ajv({ strict: true });
  try {
    ajv.compile(input);
  } catch (err: any) {
    throw new Error(`Command "${cmdPath}" inputSchema invalid: ${err.message}.`);
  }
}
```

**效果:** 用户在写错 schema 的第一时间(`createMcli` 阶段,即打包构建期)就获得准确的拒绝文案,而不是等到运行时才错位。

---

## 5. McpBareServer 类(`src/mcp/bare/server.ts`)

### 5.1 接口

```ts
export interface StartBareMcpOptions {
  transport: "stdio" | "http";
  host?: string;
  port?: number;
  token?: string;
  cors?: string;
  toolPrefix?: string;
}

export class McpBareServer {
  private app: McliApp;
  private tools = new Map<string, RegisteredTool>();
  private validators = new JsonSchemaToolkit();
  private prefix: string;

  constructor(app: McliApp, opts: StartBareMcpOptions) {
    this.app = app;
    this.prefix = opts.toolPrefix ?? app.___mcli?.toolPrefix ?? app.name;
    this.registerBuiltinTools();
  }

  // 公开
  async dispatch(req: JSONRPCRequest): Promise<JSONRPCSuccessResponse | JSONRPCErrorResponse>;

  // 私有路由
  private handleInitialize(req);
  private handleToolsList(req);
  private async handleToolsCall(req);

  // 内置工具装配
  private registerBuiltinTools();
  private internalRegister(name, def);
  private toolName(localName);
}
```

### 5.2 dispatch 路由

```ts
async dispatch(req: JSONRPCRequest): Promise<...> {
  switch (req.method) {
    case METHOD_INITIALIZE: return this.handleInitialize(req);
    case METHOD_TOOLS_LIST: return this.handleToolsList(req);
    case METHOD_TOOLS_CALL: return await this.handleToolsCall(req);
    default:
      return makeErrorResponse(req.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, `Unsupported method: ${req.method}`);
  }
}
```

### 5.3 handleInitialize(Q1 + Q2)

```ts
private handleInitialize(req: JSONRPCRequest): JSONRPCSuccessResponse {
  return makeSuccessResponse(req.id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: MCP_CAPABILITIES_DEFAULT,
    serverInfo: { name: this.app.name, version: this.app.version },
  });
}
```

### 5.4 handleToolsList(Q6 透传 v7 schema)

```ts
private handleToolsList(req: JSONRPCRequest): JSONRPCSuccessResponse {
  const tools = [...this.tools.values()].map(t => ({
    name: t.name, description: t.description, inputSchema: t.inputSchema,
  }));
  return makeSuccessResponse(req.id, { tools });
}
```

### 5.5 handleToolsCall(Q7 + Q8 + Q12)

```ts
private async handleToolsCall(req: JSONRPCRequest): Promise<...> {
  const { name: toolName, arguments: args } = (req.params ?? {}) as any;
  const tool = this.tools.get(toolName);
  if (!tool) return makeErrorResponse(req.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, `Tool not found: ${toolName}`);

  // ajv 校验(严格模式;非 v7 subset 这里已经注册阶段斩了)
  const compiled = this.validators.compile(tool.name, tool.inputSchema);
  const valid = compiled.validate(args ?? {});
  if (!valid) {
    const err = invalidParamsError(tool.name, compiled.validate.errors);
    return makeErrorResponse(req.id, err.code, err.message, err.data);
  }

  try {
    const result = await tool.handler(args ?? {});
    return makeSuccessResponse(req.id, result);
  } catch (err: any) {
    return makeSuccessResponse(req.id, toolCallErrorToResult(err));
  }
}
```

### 5.6 内置工具装配(Q5)

```ts
private registerBuiltinTools(): void {
  this.internalRegister(this.toolName("help"), {
    description: "ALWAYS call this FIRST...",
    inputSchema: { type: "object", properties: { path: { type: "string", description: "..." } } },
    handler: async (args) => { /* 直接拿 this.app 是安全的(箭头函数保 this) */ },
  });

  this.internalRegister(this.toolName("discover"), { /* ... */ });
  this.internalRegister(this.toolName("call"), {
    // mcli.call 的 input 字段用 additionalProperties:true 以透传任意 shape(Q6)
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        input: { type: "object", additionalProperties: true, description: "..." },
      },
      required: ["path"],
    },
    handler: async (args) => { ... },
  });
}
```

**细节:** 内置工具 description/inputSchema 是 mcli 团队自维护,**跳过白名单预检**(内部 register)。`internalRegister` 直接把 `RegisteredTool` 装进 `this.tools` Map,compile 仅作为兜底。

---

## 6. Transports 实现

### 6.1 StdioTransport

`src/mcp/bare/transport/stdio.ts`:

```ts
export class StdioTransport {
  constructor(private server: McpBareServer) {}

  async run(): Promise<void> {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let req: JSONRPCMessage;
      try {
        req = JSON.parse(line);
      } catch {
        /* 错误回写 null id */ continue;
      }
      if (!("id" in req) || (req as any).id === null) continue; // notification
      const resp = await this.server.dispatch(req);
      this.writeJson(resp);
    }
  }

  private writeJson(payload: unknown): void {
    process.stdout.write(JSON.stringify(payload) + "\n");
  }
}
```

**关键行为:**

- 行缓冲:每读一行 JSON-RPC 请求立即 dispatch 并写一行响应
- 解析失败:回写 JSON-RPC -32700 Parse Error(`id:null`)
- JSON-RPC Notification(`id` 缺失或 null):直接丢弃(本版本不实现通知机制)

### 6.2 HttpTransport

`src/mcp/bare/transport/http.ts`:

```ts
export class HttpTransport {
  constructor(
    private server: McpBareServer,
    private opts: StartBareMcpOptions,
  ) {}

  async run(): Promise<void> {
    const port = this.opts.port ?? 3030;
    const host = this.opts.host ?? "127.0.0.1";
    const httpServer = http.createServer(async (req, res) => {
      if (req.method === "OPTIONS") {
        /* CORS preflight */ return;
      }
      if (req.method !== "POST") {
        res.writeHead(405).end("Method Not Allowed");
        return;
      }
      if (this.opts.token) {
        /* Bearer 校验 */
      }
      // 读 body
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        /* 回写 -32700 */ return;
      }
      const resp = await this.server.dispatch(parsed as any);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(resp));
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.on("error", reject);
      httpServer.listen(port, host, () => resolve());
    });
  }
}
```

**关键行为:**

- 任何非 POST(GET/PUT/DELETE)一律 405(Q3)
- Token 缺失或不匹配 401(Unauthorized)
- JSON 解析失败 400 + MCP -32700 错误
- 业务请求 200 + JSON-RPC response(Q8)
- Stateless:每个请求独立处理,不维护 session / 不区分 session ID(Q4)
- CORS:`Access-Control-*` 头通过 `opts.cors` 配置

---

## 7. 公开入口 `mcp/index.ts`

```ts
export async function startBareMcp(app: McliApp, opts: StartBareMcpOptions): Promise<void> {
  const server = new McpBareServer(app, opts);
  if (opts.transport === "stdio") {
    await new StdioTransport(server).run();
  } else {
    await new HttpTransport(server, opts).run();
  }
}
```

**命名约定:** `startBareMcp` 与旧 `startMcp` 同步废弃(`cli/runCli.ts` import 路径改)。

---

## 8. package.json / vite.config.ts 改造

### 8.1 package.json

改造后:

```json
{
  "dependencies": {
    "ajv": "^8.17.1"
  },
  "devDependencies": {
    "@types/node": "^26.1.0",
    "typescript": "^6.0.3",
    "vite-plus": "^0.2.2"
  },
  "peerDependencies": {}
}
```

改造前:

```json
{
  "dependencies": {},
  "devDependencies": {
    "@modelcontextprotocol/sdk": "1.29.0",
    "@types/node": "^26.1.0",
    "typescript": "^6.0.3",
    "vite-plus": "^0.2.2"
  },
  "peerDependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.25.0 || ^4.0.0"
  }
}
```

**差异:**

- `@modelcontextprotocol/sdk` devDep → 删
- `zod` peerDep → 删
- `ajv` 加入 dependencies

### 8.2 vite.config.ts

```diff
- neverBundle: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*", "ws"],
+ neverBundle: [],
```

**注意:** `ws` 是 `@modelcontextprotocol/sdk` 的传输层可选依赖(SDK 用它实现可选的 WebSocket transport);SDK 删了,`ws` 也必须从 neverBundle 移除。

ajv 走 bundle(`vp pack` 会打进 dist/index.js 最终 ESM artifact,无外部依赖)。

---

## 9. 对现有文件的改造汇总

| 文件                        | 改造内容                                                               |
| --------------------------- | ---------------------------------------------------------------------- |
| `src/mcp/server.ts`         | 删除                                                                   |
| `src/mcp/streamableHttp.ts` | 删除                                                                   |
| `src/mcp/index.ts`          | 新建,公开 `startBareMcp`                                               |
| `src/mcp/bare/*`            | 新建(MCP 裸实现 8 文件)                                                |
| `src/cli/runCli.ts`         | `startMcp` → `startBareMcp`                                            |
| `src/core/createMcli.ts`    | opts 加 `toolPrefix` 字段;command()/group().command() 注册时加 v7 预检 |
| `src/types.ts`              | `McliApp` 加 `___mcli: { toolPrefix: string }` 内部字段                |
| `package.json`              | deps 加 `ajv`,删 SDK/zod                                               |
| `vite.config.ts`            | `neverBundle: []`                                                      |
| `README.md`                 | "Peer dependencies" → "Direct dependencies",更新为仅 `ajv`(bundled)    |

---

## 10. 验收清单(全部已实现)

- [x] `startBareMcp(app, { transport: "stdio" })` 通过 stdin/stdout 完成 initialize → tools/list → tools/call 流程
- [x] `startBareMcp(app, { transport: "http" })` 同上的 stateless 调用
- [x] HTTP 405 非 POST(Q3)
- [x] HTTP 401 token 校验
- [x] HTTP 400 JSON parse 失败
- [x] inputSchema 非 v7 subset(command 注册阶段抛错)
- [x] tools/list 透传 v7 子集 schema(Q6)
- [x] tools/call ajv 参数校验失败返回 JSON-RPC -32602(Q12)
- [x] tools/call 业务错返回 `{ isError: true }`(Q7)
- [x] package.json 无 `zod` / `@modelcontextprotocol/sdk`(Q10)
- [x] vite.config.ts `neverBundle: []`
- [x] 现有 51 单元测试全部通过 + 新增 MCP 裸实现测试通过,总计 76 tests 全 pass
- [x] bundle 瘦身:234.45 kB → 27.35 kB(gzip 7.57 kB)
- [x] README 已对齐新方案

---

## 11. 关键错误信息汇总

| 场景                                                    | 错误位置                              | 错误文案                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command 注册时 inputSchema 含 `format`/其他非白名单字段 | `createMcli.ts · assertV7Subset`      | `"mcli: command "<name>".inputSchema contains unsupported keyword '<key>'. mcli accepts only JSON Schema Draft-7 subset. If 'format' is needed, handle it inside your command handler. If you need extended metadata, use CommandOptions-level fields (examples, etc.)."` |
| ajv 编译失败(schema 语法错)                             | `createMcli.ts · validateInputSchema` | `"Command "<name>" inputSchema invalid: <ajv message>."`                                                                                                                                                                                                                  |
| tools/call 工具未找到                                   | `server.ts · handleToolsCall`         | JSON-RPC `-32601 Method Not Found: Tool not found: <name>`                                                                                                                                                                                                                |
| tools/call 参数校验失败                                 | `server.ts · handleToolsCall`         | JSON-RPC `-32602 Invalid params: Invalid arguments for tool '<name>'`, `data.errors` 为 ajv errors 数组                                                                                                                                                                   |
| tools/call handler 业务错(任意 throw)                   | `server.ts · handleToolsCall`         | 返回 `{ result: { isError: true, content: [{ type: "text", text: "...JSON..." }] } }`                                                                                                                                                                                     |
| Stdio 行 JSON parse 失败                                | `stdio.ts`                            | 回写 JSON-RPC `-32700 Parse error`(id:null)                                                                                                                                                                                                                               |
| HTTP 非 POST                                            | `http.ts`                             | HTTP `405 Method Not Allowed`                                                                                                                                                                                                                                             |
| HTTP token 错                                           | `http.ts`                             | HTTP `401 Unauthorized`                                                                                                                                                                                                                                                   |
| HTTP body JSON parse 错                                 | `http.ts`                             | HTTP `400` + JSON-RPC `-32700`                                                                                                                                                                                                                                            |

---

## 12. 留待后续的明确边界(本版本不实现)

- MCP session 机制(`Mcp-Session-Id` 重连/SSE 长连接)
- `resources/list` / `resources/read` / `prompts/list` / `prompts/get` 之外的其他 MCP 工具类型
- 流式传输(WebSocket 等)
- MCP 2025-06-18 引入的有结构返回字段 `structuredContent`
- MCP 服务端通知(`notifications/tools/list_changed` 等);本版本不实现 notification 协议

---

## 文件位置

- 本 spec:`specs/mcp-bare.md`
- 配套 design.md:`specs/design.md`(全文档大 redesign 前的历史设计参考)

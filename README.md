# @jlceda/mcli

> ⚠️ **Preview Release**: This is an early preview version. Expect frequent breaking changes until a stable release is published. APIs, commands, and behaviors may change without prior notice.

A command framework that serves **one command tree** through both **shell** and **MCP** — from a single definition with zero runtime dependencies.

---

## Install

```bash
npm install @jlceda/mcli
```

`@jlceda/mcli` ships with a single direct dependency — `ajv`(validated JSON Schema data) which is bundled into the ESM artifact at build time and requires no additional install from your host project.

---

## Quick Start

```ts
// app.ts
import { createMcli } from "@jlceda/mcli";

export const app = createMcli({
  name: "my-cli",
  version: "1.0.0",
});

const issue = app.group("issue", { summary: "Work with issues" });

issue.command("list", {
  summary: "List issues",
  description: "List issues from a repository.",

  input: {
    type: "object",
    properties: {
      repo: { type: "string", description: "Repository in owner/name format" },
      state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
      limit: { type: "number", description: "Max results", default: 20 },
    },
    required: ["repo"],
  },

  examples: [
    {
      title: "List open issues",
      input: { repo: "acme/app", state: "open" },
    },
  ],

  handler: async (input) => {
    const issues = await fetchIssues(input);
    return {
      data: { issues },
      next: [{ path: "issue.get", reason: "Read issue detail" }],
    };
  },

  display: (result) => {
    const { issues } = result.data as any;
    console.log(`Found ${issues.length} issues`);
    for (const i of issues) {
      console.log(`  #${i.id}  ${i.state.padEnd(6)} ${i.title}`);
    }
  },
});
```

```ts
// bin.ts — your CLI entry
#!/usr/bin/env node
import { app } from "./app";
import { runCli } from "@jlceda/mcli";

await runCli(app, process.argv.slice(2));
```

```bash
# Human-readable (display callback invoked)
node bin.js issue list --repo acme/app
# Found 2 issues
#   1  open   Fix login
#   2  open   Add tests

# JSON (no display callback → fallback to JSON.stringify(result))
node bin.js issue list --repo acme/app --json
# { "ok": true, "path: "issue.list", "data": { "issues": [...] }, "next": [...] }

# MCP stdio
node bin.js --mcp stdio

# MCP stateless Streamable HTTP
node bin.js --mcp http --port 3030
```

---

## How it works

### Progressive command registration

Commands are registered via `group()` binders — **no dot-paths allowed**:

```ts
const issue = app.group("issue", { summary: "Work with issues" });
issue.command("list", {...});   // CLI path: issue list, MCP path: issue.list
issue.command("close", {...});  // CLI path: issue close, MCP path: issue.close

// Nesting works too:
const sub = issue.group("label", { summary: "Label ops" });
sub.command("add", {...});      // CLI path: issue label add, MCP path: issue.label.add
```

`app.command("foo.bar", ...)` throws — you **must** use group binders for nesting.

### The tree is the API

Every command is a node. The path `issue.list` maps to:

| Layer      | Reference                                 |
| ---------- | ----------------------------------------- |
| CLI argv   | `issue list`                              |
| MCP call   | `{ path: "issue.list", input: {...} }`    |
| Shell help | `my-cli issue list --help`                |
| Discovery  | `mcli.discover({ query: "list issues" })` |

### MCP meta-tools (AI agent workflow)

| Order | Tool            | Purpose                                                                 |
| ----- | --------------- | ----------------------------------------------------------------------- |
| 1     | `mcli.help`     | ALWAYS call first. Returns subcommands, schemas, usage examples.        |
| 2     | `mcli.discover` | Find specific commands by keyword after help.                           |
| 3     | `mcli.call`     | Execute a command. Returns real data (search results, page content...). |

Agent workflow:

```
Model: "what can this tool do?"
  → mcli.help()
  → { children: [{ path: "issue.list", summary: "..." }, ...] }

Model: "find issue-related commands"
  → mcli.discover({ query: "issue" })
  → [ { path: "issue.list", summary: "List issues" }, ... ]

Model: "list open issues for acme/app"
  → mcli.call({ path: "issue.list", input: { repo: "acme/app", state: "open" } })
  → { ok: true, data: { issues: [...] }, next: [{ path: "issue.get", reason: "Read detail" }] }
```

The `next` field in results suggests follow-up actions — chain tools naturally.

### CLI output: display callback first

```
command has display? ─── yes → display(result)
      │
      no
      ├─ --json? → { ok, path, data, next }
      └─ default → JSON.stringify(result, null, 2)
```

`display` lets each command control its human-readable shape. The `data` field carries structured output for JSON consumers.

### Transport protocols

| Flag          | Protocol                  | Use case                                      |
| ------------- | ------------------------- | --------------------------------------------- |
| `--mcp stdio` | stdio                     | Local CLI tools, Claude Code, Cursor          |
| `--mcp http`  | stateless Streamable HTTP | Remote services, browser agents, multi-client |

HTTP mode is **stateless** — each request creates a fresh transport, no session lifecycle. Optional `--token` for auth, `--cors` for browser access.

---

## API Reference

### `createMcli(opts)`

```ts
function createMcli(opts: { name: string; version: string; summary?: string }): McliApp;
```

### `app.group(name, opts)`

Returns a `CommandGroup` binder for progressive registration.

```ts
interface CommandGroup {
  command(name: string, opts: CommandOptions): void;
  group(name: string, opts: GroupOptions): CommandGroup;  // nesting
}

const github = app.group("github", {
  summary: "Work with GitHub",
  description: "Longer-form description.",
});

github.command("list", {...});  // path: github.list
const issue = github.group("issue", { summary: "Issues" });
issue.command("list", {...});   // path: github.issue.list
```

**`name`** — simple identifier, no dots allowed. Throws if contains `.`.

**Idempotent** — re-registering updates metadata.

### `app.command(name, opts)`

Top-level command (no nesting). For nested commands, use `app.group().command()`.

```ts
app.command("hello", {
  summary: "Say hello",
  input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  handler: async (input) => ({ data: { message: `Hello ${input.name}` } }),
});
```

**`name`** — simple identifier, no dots allowed. Throws if contains `.`.

```ts
interface CommandOptions {
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
```

**`input`** — JSON Schema. Validation via `ajv`. `default` values are filled before handler runs.

**`examples`** — Each example's `input` is validated against the command's `input` schema at registration time. Invalid examples throw immediately.

**`handler`** receives:

- `input` — validated + default-filled object
- `ctx` — `{ services?: Record<string, unknown> }` (reserved)

**`handler`** returns:

```ts
interface CommandResult {
  data?: unknown; // structured output
  next?: Array<{ path: string; reason: string }>; // Agent hints for follow-up
}
```

**`display`** — optional CLI renderer. Receives the `CommandResult`. Not used in MCP mode.

### `app.resolve(argv)` / `app.allCommands()`

Look up a node (returns `null` if unknown) / list all leaf commands (used by discover).

### `runCli(app, argv)`

CLI driver. Call from your own bin entry:

```ts
await runCli(app, process.argv.slice(2));
```

Handles `--help` / `--search` / `--json` / `--mcp` dispatch, plus direct command invocation.

---

## JSON input shape

Commands declare `input` as JSON Schema. Supported:

| Kind            | Example                                                    |
| --------------- | ---------------------------------------------------------- |
| string          | `{ type: "string", description: "..." }`                   |
| number          | `{ type: "number" }`                                       |
| boolean         | `{ type: "boolean" }`                                      |
| enum            | `{ type: "string", enum: ["open", "closed"] }`             |
| object (nested) | `{ type: "object", properties: { ... }, required: [...] }` |
| optional        | omit from `required`                                       |
| default         | `{ type: "number", default: 20 }`                          |

---

## Error handling

```
# Shell (text)
Error: (root): must have required property 'repo'

# Shell (--json)
{
  "ok": false,
  "path": "issue.list",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "(root): must have required property 'repo'",
    "details": [{ "field": "(root)", "message": "must have required property 'repo'" }]
  }
}

# MCP (mcli.call)
{ "isError": true, "content": [...] }
```

| Error class           | Code                            |
| --------------------- | ------------------------------- |
| `McliValidationError` | input failed JSON Schema        |
| `McliExecutionError`  | handler threw / missing handler |

**Registration-time errors**:

- Dot in command/group name → `"Command(name) must not contain dots. Use app.group() to nest commands."`
- Invalid example input → throws immediately on `command()` call

---

## Direct dependencies

`@jlceda/mcli` ships with a single direct dependency — `ajv` (JSON Schema validator), which is bundled into the ESM artifact (`dist/index.js`) at build time.

Host projects install **nothing extra** beyond `@jlceda/mcli`.

---

## Build / publish

```bash
npm run build    # dist/index.js + dist/index.d.ts
npm test         # vitest, 62 tests
npm pack         # produce tarball
```

Ships only `dist/`. `@jlceda/mcli` → `dist/index.js`.

---

## License

MIT

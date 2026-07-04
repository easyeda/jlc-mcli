# @jlc-eda/mcli

A command framework that serves **one command tree** through both **shell** and **MCP** — from a single definition.

---

## Why

Two common approaches to AI tooling both have serious flaws.

### 1. Load a Skill / plugin, let the model read docs and improvise

```
model sees skill summary
  → model decides whether to load SKILL.md
  → model reads the doc
  → model infers the flow
  → model executes (and maybe fails)
```

Natural-language constraints. Model compliance is non-deterministic. Multi-step tasks drift. Failure recovery lives in prose.

### 2. Expose dozens of flat MCP tools

```
github_issue_list, github_issue_get, github_issue_close,
jira_ticket_search, jira_ticket_get, ...
```

Tool count explodes. Every schema eats context. High mis-call rate.

### @jlc-eda/mcli's answer

> One command tree. Humans use it on the shell. Agents use it through MCP — via **three meta-tools**, not dozens.

```
root
├── github
│   ├── issue → list / get / close
│   └── pr    → list / get / merge
├── jira
│   └── ticket → search / get / transition
└── db
    └── schema → list
```

MCP exposes only `mcli.search` / `mcli.help` / `mcli.call`. Agent discovers paths, reads schemas, invokes — progressive disclosure.

---

## Install

```bash
npm install @jlc-eda/mcli
```

Runtime dependency (add if not present):

```bash
npm install @modelcontextprotocol/sdk
```

---

## Quick Start

```ts
// app.ts
import { createMcli } from "@jlc-eda/mcli";

export const app = createMcli({
  name: "my-cli",
  version: "1.0.0",
});

app.group("issue", { summary: "Work with issues" });

app.command("issue.list", {
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
import { runCli } from "@jlc-eda/mcli";

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
# { "ok": true, "path": "issue.list", "data": { "issues": [...] }, "next": [...] }

# MCP stdio
node bin.js --mcp stdio

# MCP stateless Streamable HTTP
node bin.js --mcp http --port 3030
```

---

## How it works

### The tree is the API

Every command is a node. The dot-path `issue.list` maps to:

| Layer      | Reference                               |
| ---------- | --------------------------------------- |
| CLI argv   | `issue list`                            |
| MCP call   | `{ path: "issue.list", input: {...} }`  |
| Shell help | `my-cli issue list --help`              |
| Discovery  | `mcli.search({ query: "list issues" })` |

### Progressive disclosure

```
Model: "what commands exist?"
  → mcli.search({ query: "github" })
  → [ { path: "github.issue.list", summary: "List issues" }, ... ]

Model: "How do I call it?"
  → mcli.help({ path: "github.issue.list" })
  → {
      path: "github.issue.list",
      summary: "List issues",
      isGroup: false,
      input: { type: "object", properties: {...}, required: ["repo"] },
      children: []
    }

Model: formulate input, then call
  → mcli.call({ path: "github.issue.list", input: { repo: "acme/app" } })
  → { ok: true, path: "...", data: { issues: [...] } }
```

Agent never sees more schema than it needs.

### CLI output: display callback first

```
command has display? ─── yes → display(result)
      │
      no
      ├─ --json? → { ok, path, data, next }
      └─ default → JSON.stringify(result, null, 2)
```

`display` lets each command control its human-readable shape. The `data` field carries structured output for JSON consumers.

### MCP meta-tools

| Tool          | Purpose                                |
| ------------- | -------------------------------------- |
| `mcli.search` | Find commands by free-text query       |
| `mcli.help`   | Get help + input schema for a path     |
| `mcli.call`   | Execute a command with validated input |

Command discovery happens through the tree, not through tool enumeration.

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

### `app.group(path, opts)`

```ts
app.group("github", {
  summary: "Work with GitHub",
  description: "Longer-form description.",
});
```

Idempotent — re-registering updates metadata.

### `app.command(path, opts)`

```ts
app.command("github.issue.list", {
  summary: "List GitHub issues",
  description: "List issues from a repository.",

  input: {
    type: "object",
    properties: {
      repo: { type: "string", description: "owner/name format" },
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

  related: ["github.issue.get", "github.issue.create"],

  handler: async (input, ctx) => {
    const issues = await getIssues(input);
    return {
      data: { issues },
      next: [{ path: "github.issue.get", reason: "Read issue detail" }],
    };
  },

  display: (result) => {
    // Optional. Custom CLI output. Not used in MCP.
    const { issues } = result.data as any;
    for (const i of issues) console.log(`#${i.id} ${i.title}`);
  },
});
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
  next?: Array<{ path: string; reason: string }>; // Agent hints
}
```

**`display`** — optional CLI renderer. Receives the `CommandResult`.

### `app.resolve(argv)` / `app.allCommands()`

Look up a node (returns `null` if unknown) / list all leaf commands (used by search).

### `runCli(app, argv)`

CLI driver. Call from your own bin entry:

```ts
await runCli(app, process.argv.slice(2));
```

Handles `--help` / `--search` / `--json` / `--mcp` dispatch, plus direct command invocation.

---

## JSON input shape

Commands declare `input` as JSON Schema. MVP-supported:

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
  "path": "github.issue.list",
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

---

## Build / publish

```bash
npm run build    # dist/index.js + dist/index.d.ts
npm test         # vitest, 51 tests
npm pack         # produce tarball
```

Ships only `dist/`. `@jlc-eda/mcli` → `dist/index.js`.

---

## License

MIT

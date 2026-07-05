import { describe, it, expect } from "vitest";
import { McpBareServer } from "../../src/mcp/bare/server";
import { createMcli } from "../../src/core/createMcli";

function makeApp() {
  const app = createMcli({
    name: "testapp",
    version: "1.0.0",
    summary: "test",
  });
  app.group("g", { summary: "g" }).command("cmd", {
    summary: "cmd",
    input: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
    handler: async (input) => ({ data: { echo: input.text } }),
  });
  return app;
}

describe("McpBareServer.dispatch", () => {
  it("initialize returns protocol version + capabilities (Q1/Q2)", async () => {
    const app = makeApp();
    const server = new McpBareServer(app, { transport: "stdio" });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });
    expect(resp.id).toBe(1);
    expect(resp.result.protocolVersion).toBe("2025-06-18");
    expect(resp.result.capabilities).toEqual({ tools: {} });
    expect(resp.result.serverInfo.name).toBe("testapp");
    expect(resp.result.serverInfo.version).toBe("1.0.0");
  });

  it("tools/list returns 3 built-in tools with v7 inputSchema (Q6)", async () => {
    const app = makeApp();
    const server = new McpBareServer(app, { transport: "stdio" });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    expect(resp.result.tools.length).toBe(3);
    const names = resp.result.tools.map((t: any) => t.name);
    expect(names).toContain("testapp.help");
    expect(names).toContain("testapp.discover");
    expect(names).toContain("testapp.call");
    // schema 是原始 v7 子集(不含 format 等非白名单字段)
    for (const t of resp.result.tools) {
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("tools/call invalid arguments returns JSON-RPC -32602 error (Q7)", async () => {
    const app = makeApp();
    const server = new McpBareServer(app, { transport: "stdio" });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "testapp.call", arguments: {} }, // missing required 'path'
    });
    expect(resp.error.code).toBe(-32602);
    expect(resp.error.data.toolName).toBe("testapp.call");
  });

  it("tools/call business error returns { isError: true } (Q7)", async () => {
    const app = makeApp();
    const server = new McpBareServer(app, { transport: "stdio" });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "testapp.call", arguments: { path: "no.such.path" } },
    });
    // ok:false 经 handler 包装 → { isError: true }
    expect(resp.result.isError).toBe(true);
    const body = JSON.parse(resp.result.content[0].text);
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("Unknown path");
  });

  it("tools/call success returns content text (Q8)", async () => {
    const app = makeApp();
    const server = new McpBareServer(app, { transport: "stdio" });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "testapp.call", arguments: { path: "g.cmd", input: { text: "hi" } } },
    });
    expect(resp.result.content[0].type).toBe("text");
    const body = JSON.parse(resp.result.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.echo).toBe("hi");
  });

  it("unsupported method returns JSON-RPC -32601", async () => {
    const app = makeApp();
    const server = new McpBareServer(app, { transport: "stdio" });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 6,
      method: "unknown/thing",
    });
    expect(resp.error.code).toBe(-32601);
  });

  it("toolPrefix option overrides default (Q5)", async () => {
    const app = makeApp();
    const server = new McpBareServer(app, { transport: "stdio", toolPrefix: "gh" });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/list",
    });
    const names: string[] = resp.result.tools.map((t: any) => t.name);
    expect(names).toContain("gh.help");
    expect(names).toContain("gh.discover");
    expect(names).toContain("gh.call");
  });
});

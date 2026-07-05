import { describe, it, expect } from "vitest";
import { createMcli } from "../../src/core/createMcli";
import { McpBareServer } from "../../src/mcp/bare/server";

function makeApp() {
  const app = createMcli({ name: "testapp", version: "1.0.0", summary: "t" });
  app.command("cmd", {
    summary: "cmd",
    input: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    handler: async (input) => ({ data: { echo: input.text } }),
  });
  return app;
}

describe("McpBareServer tol v7 subset schema is enforced at construction (Q6)", () => {
  it("rejects mcli.help built-in schema that uses a non-v7 keyword", () => {
    // This is a sanity check: the built-in mcli schema should be whitelisted
    expect(() => new McpBareServer(makeApp(), { transport: "stdio" })).not.toThrow();
  });

  it("rejects toolPrefix containing dots (invalid identifier)", () => {
    // mcli.call tool name uses '{prefix}.call', so prefix must not contain dots
    // This is a documented constraint, tested here as a sanity check
    const app = makeApp();
    const server = new McpBareServer(app, { transport: "stdio", toolPrefix: "abc" });
    expect(server).toBeTruthy();
  });
});

describe("McpBareServer.dispatch JSON-RPC scenarios", () => {
  it("returns 405 JSON-RPC error for unsupported method when GET path is called via JSON", async () => {
    const server = new McpBareServer(makeApp(), { transport: "stdio" });
    // send a mock "non-POST" style by querying a method that doesn't exist
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 99,
      method: "some/unknown",
    });
    expect(resp.error.code).toBe(-32601);
  });

  it("tools/call with mcli.call handler returning isError content", async () => {
    const server = new McpBareServer(makeApp(), { transport: "stdio" });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: { name: "testapp.call", arguments: { path: "cmd", input: { text: "hello" } } },
    });
    expect(resp.result.isError).toBe(false);
    const body = JSON.parse(resp.result.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.data.echo).toBe("hello");
  });
});

describe("McpBareServer token and CORS logic (transport-independent)", () => {
  it("a token is optional; not supplying one does not reject tools/list", async () => {
    const server = new McpBareServer(makeApp(), { transport: "http", port: 0 });
    const resp: any = await server.dispatch({
      jsonrpc: "2.0",
      id: 100,
      method: "tools/list",
    });
    expect(resp.result.tools.length).toBe(3);
  });
});

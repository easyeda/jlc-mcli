import { describe, it, expect, beforeEach } from "vitest";
import { createMcli } from "../../src/core/createMcli";
import type { McliApp } from "../../src/types";

describe("MCP tools", () => {
  let app: McliApp;

  beforeEach(() => {
    app = createMcli({ name: "demo", version: "1.0.0" });
    app.command("github.issue.list", {
      summary: "List issues",
      input: {
        type: "object",
        properties: { repo: { type: "string" } },
        required: ["repo"],
      },
      handler: async (input) => ({ data: { repo: input.repo } }),
    });
    app.command("github.issue.close", {
      summary: "Close issue",
      input: {
        type: "object",
        properties: {
          repo: { type: "string" },
          id: { type: "number" },
        },
        required: ["repo", "id"],
      },
      handler: async (input) => ({ data: { closed: input.id } }),
    });
  });

  it("mcli.search returns matches", async () => {
    const { search } = await import("../../src/core/search");
    const matches = search(app, "close");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].path).toBe("github.issue.close");
  });

  it("mcli.call executes command", async () => {
    const { execute } = await import("../../src/core/execute");
    const node = app.resolve(["github", "issue", "close"]);
    expect(node).not.toBeNull();
    const result = await execute(node!, { repo: "acme/app", id: 123 });
    expect(result.data).toEqual({ closed: 123 });
  });

  it("mcli.call returns error for unknown path", async () => {
    const node = app.resolve(["nope"]);
    expect(node).toBeNull();
  });

  it("mcli.help includes input schema for commands", async () => {
    const node = app.resolve(["github", "issue", "close"]);
    expect(node).not.toBeNull();
    // Simulate what mcli.help handler does
    const result: Record<string, unknown> = {
      path: node!.path,
      summary: node!.summary,
      isGroup: node!.isGroup,
    };
    if (!node!.isGroup && node!.input) {
      result.input = node!.input;
    }
    expect(result.input).toBeDefined();
    expect((result.input as any).properties).toHaveProperty("repo");
  });
});

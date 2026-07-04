import { describe, it, expect } from "vitest";
import { createMcli } from "../../src/core/createMcli";

describe("createMcli", () => {
  it("returns app with metadata", () => {
    const app = createMcli({ name: "demo", version: "1.0.0", summary: "A demo" });
    expect(app.name).toBe("demo");
    expect(app.version).toBe("1.0.0");
    expect(app.summary).toBe("A demo");
  });

  it("registers groups and resolves them", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    app.group("github", { summary: "GitHub ops" });
    const node = app.resolve(["github"]);
    expect(node).not.toBeNull();
    expect(node!.isGroup).toBe(true);
    expect(node!.summary).toBe("GitHub ops");
  });

  it("registers commands and resolves them", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    app.command("hello.world", {
      summary: "Say hello",
      input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      handler: async (input) => ({ data: { message: `Hello ${input.name}` } }),
    });
    const node = app.resolve(["hello", "world"]);
    expect(node).not.toBeNull();
    expect(node!.isGroup).toBe(false);
    expect(node!.summary).toBe("Say hello");
  });

  it("allCommands returns only leaf commands", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    app.command("a.b.c", {
      summary: "cmd1",
      input: { type: "object", properties: {} },
      handler: async () => ({ data: null }),
    });
    app.command("a.b.d", {
      summary: "cmd2",
      input: { type: "object", properties: {} },
      handler: async () => ({ data: null }),
    });
    const cmds = app.allCommands();
    expect(cmds.map((c) => c.path).sort()).toEqual(["a.b.c", "a.b.d"]);
  });

  it("resolve returns null for unknown path", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    expect(app.resolve(["nope"])).toBeNull();
  });

  it("validates examples against input schema", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    expect(() => {
      app.command("bad.example", {
        summary: "Bad",
        input: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
        examples: [{ title: "Missing required", input: {} }],
        handler: async () => ({ data: null }),
      });
    }).toThrow(/example.*invalid/);
  });
});

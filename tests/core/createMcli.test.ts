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

  it("group() returns a binder with command() and group()", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    const github = app.group("github", { summary: "GitHub ops" });

    github.command("hello", {
      summary: "Say hello",
      input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      handler: async (input) => ({ data: { message: `Hello ${input.name}` } }),
    });

    const node = app.resolve(["github", "hello"]);
    expect(node).not.toBeNull();
    expect(node!.isGroup).toBe(false);
    expect(node!.summary).toBe("Say hello");
    expect(node!.path).toBe("github.hello");

    // Nested group via binder
    const issue = github.group("issue", { summary: "Issues" });
    issue.command("list", {
      summary: "List issues",
      input: { type: "object", properties: {} },
      handler: async () => ({ data: null }),
    });
    const list = app.resolve(["github", "issue", "list"]);
    expect(list).not.toBeNull();
    expect(list!.path).toBe("github.issue.list");
  });

  it("registers root-level commands without dots", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    app.command("hello", {
      summary: "Say hello",
      input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      handler: async (input) => ({ data: { message: `Hello ${input.name}` } }),
    });
    const node = app.resolve(["hello"]);
    expect(node).not.toBeNull();
    expect(node!.isGroup).toBe(false);
    expect(node!.summary).toBe("Say hello");
    expect(node!.path).toBe("hello");
  });

  it("rejects dots in top-level command()", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    expect(() => {
      app.command("foo.bar", {
        summary: "bad",
        input: { type: "object", properties: {} },
        handler: async () => ({ data: null }),
      });
    }).toThrow(/must not contain dots/);
  });

  it("rejects dots in group().command()", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    const g = app.group("foo", { summary: "f" });
    expect(() => {
      g.command("bar.baz", {
        summary: "bad",
        input: { type: "object", properties: {} },
        handler: async () => ({ data: null }),
      });
    }).toThrow(/must not contain dots/);
  });

  it("rejects dots in group()", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    expect(() => {
      app.group("foo.bar", { summary: "bad" });
    }).toThrow(/must not contain dots/);
  });

  it("allCommands returns only leaf commands", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    const g = app.group("a", { summary: "A" });
    const g2 = g.group("b", { summary: "B" });
    g2.command("c", {
      summary: "cmd1",
      input: { type: "object", properties: {} },
      handler: async () => ({ data: null }),
    });
    g2.command("d", {
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
      app.command("bad", {
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

  it("validates examples via group binder", () => {
    const app = createMcli({ name: "demo", version: "1.0.0" });
    const g = app.group("gh", { summary: "GH" });
    expect(() => {
      g.command("bad", {
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

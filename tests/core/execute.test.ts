import { describe, it, expect } from "vitest";
import { execute, McliValidationError } from "../../src/core/execute";
import type { CommandNode } from "../../src/types";

function makeCmd(
  schema: any,
  handler: CommandNode["handler"],
  display?: CommandNode["display"],
): CommandNode {
  return {
    path: "test.cmd",
    argv: ["test", "cmd"],
    name: "cmd",
    summary: "A test command",
    input: schema,
    isGroup: false,
    children: new Map(),
    handler,
    display,
  };
}

describe("execute", () => {
  it("validates and executes", async () => {
    const node = makeCmd(
      {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
      async (input) => ({ data: { message: `Hello ${input.name}` } }),
    );
    const result = await execute(node, { name: "world" });
    expect(result.data).toEqual({ message: "Hello world" });
  });

  it("fills defaults", async () => {
    const node = makeCmd(
      {
        type: "object",
        properties: {
          name: { type: "string" },
          loud: { type: "boolean", default: false },
        },
        required: ["name"],
      },
      async (input) => ({ data: input }),
    );
    const result = await execute(node, { name: "x" });
    expect(result.data).toEqual({ name: "x", loud: false });
  });

  it("throws on missing required field", async () => {
    const node = makeCmd(
      {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
      async (input) => ({ data: input }),
    );
    await expect(execute(node, {})).rejects.toThrow(McliValidationError);
    try {
      await execute(node, {});
    } catch (e: any) {
      expect(e.code).toBe("VALIDATION_ERROR");
      expect(e.details.length).toBeGreaterThan(0);
    }
  });

  it("throws on wrong type", async () => {
    const node = makeCmd(
      {
        type: "object",
        properties: { count: { type: "number" } },
        required: ["count"],
      },
      async (input) => ({ data: input }),
    );
    await expect(execute(node, { count: "not-a-number" })).rejects.toThrow(McliValidationError);
  });

  it("throws if no handler", async () => {
    const node: CommandNode = {
      path: "test.cmd",
      argv: ["test", "cmd"],
      name: "cmd",
      summary: "no handler",
      input: { type: "object", properties: {} },
      isGroup: false,
      children: new Map(),
    };
    await expect(execute(node, {})).rejects.toThrow("no handler");
  });
});

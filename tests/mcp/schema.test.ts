import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror the s() helper's Zod schema shapes
const s = (desc: string, jsonType = "string") => {
  if (jsonType === "number") return z.number().describe(desc);
  if (jsonType === "object") return z.object({}).passthrough().describe(desc);
  return z.string().describe(desc);
};

describe("MCP tool input schemas", () => {
  it("string field produces valid JSON schema via zod v4 toJSONSchema", () => {
    const schema = s("A string field");
    const json = schema.toJSONSchema();
    expect(json).toMatchObject({ type: "string", description: "A string field" });
  });

  it("number field produces valid JSON schema via zod v4 toJSONSchema", () => {
    const schema = s("A number field", "number");
    const json = schema.toJSONSchema();
    expect(json).toMatchObject({ type: "number", description: "A number field" });
  });

  it("object field with passthrough preserves unknown keys", () => {
    const schema = s("An object", "object");
    const result = schema.safeParse({ foo: "bar", nested: { x: 1 } });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ foo: "bar", nested: { x: 1 } });
  });

  it("object field strips nothing (passthrough mode)", () => {
    const schema = z.object({}).passthrough();
    const input = { query: "test", scope: "webpage" };
    const result = schema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  it("mcli.call input schema (path + input object) validates", () => {
    const shape = {
      path: s("Command path"),
      input: s("Command input", "object"),
    };
    const schema = z.object(shape);
    const result = schema.safeParse({
      path: "metaso.discover",
      input: { query: "test", scope: "webpage" },
    });
    expect(result.success).toBe(true);
    expect(result.data.input).toEqual({ query: "test", scope: "webpage" });
  });
});

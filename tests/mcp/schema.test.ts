import { describe, it, expect } from "vitest";
import { createMcli } from "../../src/core/createMcli";

describe("createMcli inputSchema v7 subset validation (Q6)", () => {
  it("rejects 'format' keyword at top level", () => {
    expect(() =>
      createMcli({
        name: "test",
        version: "1.0.0",
        summary: "t",
      }).command("cmd", {
        summary: "cmd",
        input: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
          },
        },
        handler: async () => ({}),
      }),
    ).toThrow(/unsupported keyword 'format'/);
  });

  it("rejects 'format' keyword nested in properties", () => {
    expect(() =>
      createMcli({
        name: "test",
        version: "1.0.0",
        summary: "t",
      }).command("cmd", {
        summary: "cmd",
        input: {
          type: "object",
          properties: {
            nested: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
              },
            },
          },
        },
        handler: async () => ({}),
      }),
    ).toThrow(/unsupported keyword 'format'/);
  });

  it("rejects unknown extension keyword 'x-unknown' (not whitelisted)", () => {
    expect(() =>
      createMcli({
        name: "test",
        version: "1.0.0",
        summary: "t",
      }).command("cmd", {
        summary: "cmd",
        input: {
          type: "object",
          properties: {},
          "x-unknown": true,
        } as any,
        handler: async () => ({}),
      }),
    ).toThrow(/unsupported keyword 'x-unknown'/);
  });

  it("allows 'examples' at top-level (whitelisted)", () => {
    expect(() =>
      createMcli({
        name: "test",
        version: "1.0.0",
        summary: "t",
      }).command("cmd", {
        summary: "cmd",
        input: {
          type: "object",
          properties: {},
          examples: [{ a: 1 }],
        },
        handler: async () => ({}),
      }),
    ).not.toThrow();
  });

  it("allows '$schema' at top-level (whitelisted)", () => {
    expect(() =>
      createMcli({
        name: "test",
        version: "1.0.0",
        summary: "t",
      }).command("cmd", {
        summary: "cmd",
        input: {
          type: "object",
          properties: {},
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        handler: async () => ({}),
      }),
    ).not.toThrow();
  });

  it("accepts all v7 standard keywords", () => {
    expect(() =>
      createMcli({
        name: "test",
        version: "1.0.0",
        summary: "t",
      }).command("cmd", {
        summary: "cmd",
        input: {
          type: "object",
          title: "cmd input",
          description: "cmd input desc",
          default: {},
          examples: [{ a: 1 }],
          properties: {
            name: {
              type: "string",
              description: "name",
              default: "untitled",
              minLength: 1,
              maxLength: 100,
              pattern: "^[a-z]+$",
            },
            count: {
              type: "number",
              minimum: 0,
              maximum: 999,
              multipleOf: 1,
            },
            tags: {
              type: "array",
              items: { type: "string" },
              minItems: 0,
              maxItems: 10,
              uniqueItems: true,
            },
            status: {
              type: "string",
              enum: ["on", "off"],
              const: undefined,
            },
          },
          required: ["name"],
          additionalProperties: false,
        },
        handler: async () => ({}),
      }),
    ).not.toThrow();
  });

  it("rejects unknown keyword (e.g. 'patternProperties' is whitelisted, but 'unknownKey' is not)", () => {
    expect(() =>
      createMcli({
        name: "test",
        version: "1.0.0",
        summary: "t",
      }).command("cmd", {
        summary: "cmd",
        input: {
          type: "object",
          properties: {},
          unknownKey: true,
        } as any,
        handler: async () => ({}),
      }),
    ).toThrow(/unsupported keyword 'unknownKey'/);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { createMcli } from "../../src/core/createMcli";
import { search } from "../../src/core/search";
import type { McliApp } from "../../src/types";

describe("search", () => {
  let app: McliApp;

  beforeEach(() => {
    app = createMcli({ name: "demo", version: "1.0.0" });
    app.command("github.issue.list", {
      summary: "List GitHub issues",
      input: { type: "object", properties: {} },
      handler: async () => ({ data: null }),
    });
    app.command("github.issue.close", {
      summary: "Close a GitHub issue",
      input: { type: "object", properties: {} },
      handler: async () => ({ data: null }),
    });
    app.command("jira.ticket.search", {
      summary: "Search Jira tickets",
      input: { type: "object", properties: {} },
      handler: async () => ({ data: null }),
    });
  });

  it("returns matches sorted by score", () => {
    const results = search(app, "github issue");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toMatch(/github\.issue/);
    // scores descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("respects limit", () => {
    const results = search(app, "issue", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns empty for empty query", () => {
    expect(search(app, "")).toEqual([]);
    expect(search(app, "   ")).toEqual([]);
  });

  it("returns empty for no match", () => {
    const results = search(app, "zzzzz_nonexistent");
    expect(results).toEqual([]);
  });

  it("matches on summary text", () => {
    const results = search(app, "close");
    expect(results.some((r) => r.path === "github.issue.close")).toBe(true);
  });
});

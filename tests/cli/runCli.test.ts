import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMcli } from "../../src/core/createMcli";
import { runCli } from "../../src/cli/runCli";
import type { McliApp } from "../../src/types";

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const logs: string[] = [];
  const origLog = console.log;
  const origError = console.error;

  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: any[]) => {
    logs.push("ERR: " + args.map(String).join(" "));
  };

  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origError;
  }

  return logs.join("\n");
}

describe("runCli", () => {
  let app: McliApp;

  beforeEach(() => {
    app = createMcli({ name: "demo", version: "1.0.0" });
    const github = app.group("github", { summary: "GitHub ops" });
    const issue = github.group("issue", { summary: "Issues" });
    issue.command("list", {
      summary: "List issues",
      input: {
        type: "object",
        properties: { repo: { type: "string" } },
        required: ["repo"],
      },
      handler: async (input) => ({ data: { repo: input.repo, issues: [] } }),
    });
    issue.command("close", {
      summary: "Close issue",
      input: {
        type: "object",
        properties: {
          repo: { type: "string" },
          id: { type: "number" },
          dryRun: { type: "boolean", default: false },
        },
        required: ["repo", "id"],
      },
      handler: async (input) => ({
        data: { closed: input.id, dryRun: input.dryRun },
      }),
    });
  });

  it("shows group help when applied to group node", async () => {
    const output = await captureStdout(() => runCli(app, ["github", "--help"]));
    expect(output).toContain("github");
    expect(output).toContain("GitHub ops");
  });

  it("shows some content on bare --help", async () => {
    const output = await captureStdout(() => runCli(app, ["--help"]));
    expect(output.length).toBeGreaterThan(0);
  });

  it("executes a command and JSON output by default", async () => {
    const output = await captureStdout(() =>
      runCli(app, ["github", "issue", "list", "--repo", "acme/app"]),
    );
    const parsed = JSON.parse(output);
    expect(parsed.data).toEqual({ repo: "acme/app", issues: [] });
  });

  it("executes with --json", async () => {
    const output = await captureStdout(() =>
      runCli(app, ["github", "issue", "list", "--repo", "acme/app", "--json"]),
    );
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual({ repo: "acme/app", issues: [] });
  });

  it("shows command help", async () => {
    const output = await captureStdout(() => runCli(app, ["github", "issue", "close", "--help"]));
    expect(output).toContain("--repo");
    expect(output).toContain("--id");
  });

  it("--help --json includes input for command", async () => {
    const output = await captureStdout(() =>
      runCli(app, ["github", "issue", "close", "--help", "--json"]),
    );
    const parsed = JSON.parse(output);
    expect(parsed.input).toBeDefined();
    expect(parsed.input.properties).toHaveProperty("repo");
  });

  it("--help text does not include schema", async () => {
    const output = await captureStdout(() => runCli(app, ["github", "issue", "close", "--help"]));
    expect(output).not.toContain('"type"');
    expect(output).toContain("--repo");
  });

  it("searches commands", async () => {
    const output = await captureStdout(() => runCli(app, ["--search", "close"]));
    expect(output).toContain("github.issue.close");
  });

  it("reports validation error", async () => {
    const output = await captureStdout(() =>
      runCli(app, ["github", "issue", "close", "--repo", "acme/app"]),
    );
    expect(output).toContain("Error");
  });

  it("uses display callback when provided (top-level command)", async () => {
    app.command("hello", {
      summary: "Say hello",
      input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      handler: async (input) => ({ data: { message: `Hello ${input.name}` } }),
      display: (result) => {
        console.log((result.data as any).message);
      },
    });
    const output = await captureStdout(() => runCli(app, ["hello", "--name", "world"]));
    expect(output.trim()).toBe("Hello world");
  });

  it("uses display callback when provided (group binder command)", async () => {
    const g = app.group("util", { summary: "Utilities" });
    g.command("ping", {
      summary: "Ping",
      input: { type: "object", properties: {} },
      handler: async () => ({ data: { pong: true } }),
      display: (result) => {
        console.log("pong=" + (result.data as any).pong);
      },
    });
    const output = await captureStdout(() => runCli(app, ["util", "ping"]));
    expect(output.trim()).toBe("pong=true");
  });
});

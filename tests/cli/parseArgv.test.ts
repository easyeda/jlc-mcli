import { describe, it, expect } from "vitest";
import { splitGlobalFlags, parseInputArgv } from "../../src/cli/parseArgv";

describe("splitGlobalFlags", () => {
  it("extracts --help", () => {
    const { global, argv } = splitGlobalFlags(["--help"]);
    expect(global.help).toBe(true);
    expect(argv).toEqual([]);
  });

  it("extracts --search with value", () => {
    const { global, argv } = splitGlobalFlags(["--search", "close issue"]);
    expect(global.search).toBe("close issue");
    expect(argv).toEqual([]);
  });

  it("extracts --mcp with transport", () => {
    const { global } = splitGlobalFlags(["--mcp", "stdio"]);
    expect(global.mcp).toBe("stdio");
  });

  it("throws on invalid --mcp value", () => {
    expect(() => splitGlobalFlags(["--mcp", "invalid"])).toThrow();
  });

  it("keeps non-global args in rest", () => {
    const { global, argv } = splitGlobalFlags(["github", "issue", "list", "--help"]);
    expect(global.help).toBe(true);
    expect(argv).toEqual(["github", "issue", "list"]);
  });

  it("extracts --port as number", () => {
    const { global } = splitGlobalFlags(["--port", "3030"]);
    expect(global.port).toBe(3030);
  });
});

describe("parseInputArgv", () => {
  it("parses --key value", () => {
    expect(parseInputArgv(["--repo", "acme/app"])).toEqual({ repo: "acme/app" });
  });

  it("parses --key=value", () => {
    expect(parseInputArgv(["--repo=acme/app"])).toEqual({ repo: "acme/app" });
  });

  it("parses --flag as true", () => {
    expect(parseInputArgv(["--dry-run"])).toEqual({ dryRun: true });
  });

  it("parses --no-flag as false", () => {
    expect(parseInputArgv(["--no-dry-run"])).toEqual({ dryRun: false });
  });

  it("coerces numbers", () => {
    expect(parseInputArgv(["--id", "123"])).toEqual({ id: 123 });
    expect(parseInputArgv(["--rate", "3.14"])).toEqual({ rate: 3.14 });
  });

  it("converts hyphenated keys to camelCase", () => {
    expect(parseInputArgv(["--dry-run"])).toEqual({ dryRun: true });
    expect(parseInputArgv(["--repo-name", "x"])).toEqual({ repoName: "x" });
  });

  it("handles mixed options", () => {
    const result = parseInputArgv(["--repo", "acme/app", "--id", "123", "--dry-run"]);
    expect(result).toEqual({ repo: "acme/app", id: 123, dryRun: true });
  });
});

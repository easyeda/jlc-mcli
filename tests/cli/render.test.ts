import { describe, it, expect } from "vitest";
import { renderHelp, renderSearchResult } from "../../src/cli/render";
import type { CommandNode } from "../../src/types";
import type { SearchMatch } from "../../src/core/search";

function makeNode(partial: Partial<CommandNode> & { path: string }): CommandNode {
  const { path, ...rest } = partial;
  const parts = path.split(".");
  return {
    path,
    argv: parts,
    name: parts[parts.length - 1],
    summary: "",
    isGroup: false,
    children: new Map(),
    ...rest,
  };
}

describe("renderHelp", () => {
  it("renders group node with subcommands", () => {
    const node: CommandNode = {
      path: "github",
      argv: ["github"],
      name: "github",
      summary: "Work with GitHub",
      isGroup: true,
      children: new Map([
        ["issue", makeNode({ path: "github.issue", summary: "Issues" })],
        ["pr", makeNode({ path: "github.pr", summary: "Pull requests" })],
      ]),
    };
    const output = renderHelp(node);
    expect(output).toContain("github");
    expect(output).toContain("Work with GitHub");
    expect(output).toContain("issue");
    expect(output).toContain("Issues");
    expect(output).toContain("pr");
  });

  it("renders command with options", () => {
    const node = makeNode({
      path: "github.issue.close",
      summary: "Close issue",
      input: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repo name" },
          id: { type: "number", description: "Issue number" },
          dryRun: { type: "boolean", default: false },
        },
        required: ["repo", "id"],
      },
    });
    const output = renderHelp(node);
    expect(output).toContain("--repo");
    expect(output).toContain("--id");
    expect(output).toContain("--dry-run");
    expect(output).toContain("<string>");
  });
});

describe("renderSearchResult", () => {
  it("renders matches", () => {
    const matches: SearchMatch[] = [
      {
        path: "github.issue.close",
        argv: ["github", "issue", "close"],
        summary: "Close",
        score: 0.8,
      },
    ];
    const output = renderSearchResult(matches);
    expect(output).toContain("github.issue.close");
    expect(output).toContain("Close");
  });

  it("renders no matches", () => {
    expect(renderSearchResult([])).toBe("No matches.");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { CommandTree } from "../../src/core/tree";
import type { CommandNode } from "../../src/types";

function makeCmd(path: string, summary: string): CommandNode {
  return {
    path,
    argv: path.split("."),
    name: path.split(".").pop()!,
    summary,
    isGroup: false,
    children: new Map(),
  };
}

describe("CommandTree", () => {
  let tree: CommandTree;

  beforeEach(() => {
    tree = new CommandTree();
  });

  it("inserts and finds a top-level command", () => {
    tree.insert("hello", makeCmd("hello", "Say hello"));
    const node = tree.find(["hello"]);
    expect(node).not.toBeNull();
    expect(node!.path).toBe("hello");
    expect(node!.summary).toBe("Say hello");
  });

  it("auto-creates intermediate group nodes", () => {
    tree.insert("github.issue.list", makeCmd("github.issue.list", "List issues"));
    const gh = tree.find(["github"]);
    expect(gh).not.toBeNull();
    expect(gh!.isGroup).toBe(true);
    const issue = tree.find(["github", "issue"]);
    expect(issue).not.toBeNull();
    expect(issue!.isGroup).toBe(true);
    const list = tree.find(["github", "issue", "list"]);
    expect(list).not.toBeNull();
    expect(list!.summary).toBe("List issues");
  });

  it("find returns null for unknown path", () => {
    tree.insert("hello", makeCmd("hello", "Say hello"));
    expect(tree.find(["world"])).toBeNull();
    expect(tree.find(["hello", "extra"])).toBeNull();
  });

  it("traverse visits all nodes", () => {
    tree.insert("a.b.c", makeCmd("a.b.c", "cmd1"));
    tree.insert("a.b.d", makeCmd("a.b.d", "cmd2"));
    tree.insert("a.e", makeCmd("a.e", "cmd3"));

    const paths: string[] = [];
    tree.traverse((n) => paths.push(n.path));
    expect(paths.sort()).toEqual(["a", "a.b", "a.b.c", "a.b.d", "a.e"]);
  });
});

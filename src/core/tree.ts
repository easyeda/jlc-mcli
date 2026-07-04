import type { CommandNode } from "../types";

function makeGroup(path: string): CommandNode {
  const parts = path.split(".");
  return {
    path,
    argv: parts,
    name: parts[parts.length - 1],
    summary: "",
    isGroup: true,
    children: new Map(),
  };
}

export class CommandTree {
  private root: CommandNode = {
    path: "",
    argv: [],
    name: "",
    summary: "",
    isGroup: true,
    children: new Map(),
  };

  insert(path: string, node: CommandNode): void {
    const parts = path.split(".");
    let current = this.root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let child = current.children.get(part);
      if (!child) {
        child = makeGroup(parts.slice(0, i + 1).join("."));
        current.children.set(part, child);
      }
      current = child;
    }

    const lastPart = parts[parts.length - 1];
    node.name = lastPart;
    node.argv = parts;
    node.path = path;
    current.children.set(lastPart, node);
  }

  find(argv: string[]): CommandNode | null {
    let current = this.root;
    for (const part of argv) {
      const child = current.children.get(part);
      if (!child) return null;
      current = child;
    }
    return current;
  }

  traverse(fn: (node: CommandNode) => void): void {
    const walk = (node: CommandNode) => {
      fn(node);
      for (const child of node.children.values()) {
        walk(child);
      }
    };
    for (const child of this.root.children.values()) {
      walk(child);
    }
  }
}

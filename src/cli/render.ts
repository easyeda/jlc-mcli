import type { CommandNode } from "../types";
import type { SearchMatch } from "../core/search";

export function renderHelp(node: CommandNode): string {
  const lines: string[] = [];

  lines.push(node.path);
  lines.push("");

  if (node.summary) {
    lines.push(node.summary);
    lines.push("");
  }

  if (node.description) {
    lines.push(node.description);
    lines.push("");
  }

  if (!node.isGroup && node.input?.properties) {
    lines.push("Usage:");
    const props = Object.entries(node.input.properties);
    const req = node.input.required ?? [];
    const usageFlags = props.map(([key, schema]) => {
      const flag = `--${camelToHyphen(key)}`;
      if (req.includes(key)) {
        return `${flag} <${schema.type}>`;
      }
      return `[${flag} <${schema.type}>]`;
    });
    lines.push(`  mcli ${node.argv.join(" ")} ${usageFlags.join(" ")}`);
    lines.push("");
    lines.push("Options:");
    for (const [key, schema] of props) {
      const desc = (schema as any).description ? `  ${(schema as any).description}` : "";
      const def =
        (schema as any).default !== undefined ? ` (default: ${(schema as any).default})` : "";
      lines.push(`  --${camelToHyphen(key)}${desc}${def}`);
    }
    lines.push("");
  }

  if (!node.isGroup && node.examples && node.examples.length > 0) {
    lines.push("Examples:");
    for (const ex of node.examples) {
      lines.push(`  # ${ex.title}`);
      lines.push(`  mcli ${exampleToArgv(node.argv, ex.input)}`);
    }
    lines.push("");
  }

  const childEntries = [...node.children.values()];
  if (childEntries.length > 0) {
    lines.push("Subcommands:");
    for (const child of childEntries) {
      lines.push(`  ${child.name.padEnd(12)} ${child.summary}`);
    }
    lines.push("");
  }

  if (node.related && node.related.length > 0) {
    lines.push("Related:");
    for (const r of node.related) {
      lines.push(`  ${r}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderSearchResult(matches: SearchMatch[]): string {
  if (matches.length === 0) return "No matches.";
  const lines = ["Matches:"];
  for (const m of matches) {
    lines.push(`  ${m.path.padEnd(24)} ${m.summary}`);
  }
  return lines.join("\n");
}

function camelToHyphen(s: string): string {
  return s.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function exampleToArgv(cmdArgv: string[], input: Record<string, unknown>): string {
  const parts = [...cmdArgv];
  for (const [key, value] of Object.entries(input)) {
    const flag = `--${camelToHyphen(key)}`;
    if (typeof value === "boolean") {
      parts.push(value ? flag : `--no-${camelToHyphen(key)}`);
    } else {
      parts.push(flag, String(value));
    }
  }
  return parts.join(" ");
}

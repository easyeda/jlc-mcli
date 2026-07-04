export interface GlobalFlags {
  help: boolean;
  search?: string;
  json: boolean;
  mcp?: "stdio" | "http";
  host?: string;
  port?: number;
  token?: string;
  cors?: string;
}

export interface ParseResult {
  global: GlobalFlags;
  argv: string[];
}

export function splitGlobalFlags(argv: string[]): ParseResult {
  const global: GlobalFlags = { help: false, json: false };
  const rest: string[] = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--help") {
      global.help = true;
      i++;
    } else if (arg === "--json") {
      global.json = true;
      i++;
    } else if (arg === "--mcp") {
      const val = argv[++i];
      if (val === "stdio" || val === "http") {
        global.mcp = val;
      } else {
        throw new Error(`Invalid --mcp value: ${val}`);
      }
      i++;
    } else if (arg === "--search") {
      global.search = argv[++i];
      i++;
    } else if (arg === "--host") {
      global.host = argv[++i];
      i++;
    } else if (arg === "--port") {
      global.port = parseInt(argv[++i], 10);
      i++;
    } else if (arg === "--token") {
      global.token = argv[++i];
      i++;
    } else if (arg === "--cors") {
      global.cors = argv[++i];
      i++;
    } else {
      rest.push(arg);
      i++;
    }
  }

  return { global, argv: rest };
}

function hyphenToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function coerceValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

/**
 * Parse option tokens (those starting with --) into an input object.
 * Stops at the first non-option token (positional).
 */
export function parseInputArgv(argv: string[]): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg.startsWith("--no-")) {
      const key = hyphenToCamel(arg.slice(5));
      input[key] = false;
      i++;
    } else if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      let key: string;
      let value: string;

      if (eqIdx !== -1) {
        key = arg.slice(2, eqIdx);
        value = arg.slice(eqIdx + 1);
        i++;
      } else {
        key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          value = next;
          i += 2;
        } else {
          value = "true";
          i++;
        }
      }

      const camelKey = hyphenToCamel(key);
      input[camelKey] = coerceValue(value);
    } else {
      // positional - skip for MVP
      i++;
    }
  }

  return input;
}

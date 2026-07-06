import type { McliApp } from "../types";
import { execute } from "../core/execute";
import { search } from "../core/search";
import { splitGlobalFlags, parseInputArgv } from "./parseArgv";
import { renderHelp, renderSearchResult } from "./render";
import { startBareMcp } from "../mcp";

export async function runCli(app: McliApp, argv: string[]): Promise<void> {
  const { global, argv: rest } = splitGlobalFlags(argv);

  if (global.mcp) {
    await startBareMcp(app, {
      transport: global.mcp,
      host: global.host,
      port: global.port,
      token: global.token,
      cors: global.cors,
    });
    return;
  }

  if (global.search !== undefined) {
    const matches = search(app, global.search);
    if (global.json) {
      console.log(JSON.stringify({ matches }, null, 2));
    } else {
      console.log(renderSearchResult(matches));
    }
    return;
  }

  // Walk the command tree to find the deepest matching node
  let node = app.resolve([]);
  let lastValid = node;
  let consumed = 0;

  for (let i = 0; i < rest.length; i++) {
    const sub = rest[i];
    if (sub.startsWith("--")) break;
    const next = app.resolve(rest.slice(0, i + 1));
    if (!next) break;
    node = next;
    lastValid = next;
    consumed = i + 1;
  }

  if (!lastValid) {
    console.error(`Unknown command: ${rest.join(" ")}`);
    process.exitCode = 1;
    return;
  }

  if (global.help) {
    if (global.json) {
      const result: Record<string, unknown> = {
        path: lastValid.path,
        argv: lastValid.argv,
        summary: lastValid.summary,
        description: lastValid.description,
        children: [...lastValid.children.values()].map((c) => ({
          path: c.path,
          argv: c.argv,
          summary: c.summary,
        })),
      };
      if (!lastValid.isGroup && lastValid.input) {
        result.inputSchema = lastValid.input;
      }
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderHelp(lastValid));
    }
    return;
  }

  // Execute command
  if (lastValid.isGroup) {
    console.log(renderHelp(lastValid));
    return;
  }

  const input = parseInputArgv(rest.slice(consumed));

  try {
    const result = await execute(lastValid, input);
    if (lastValid.display) {
      lastValid.display(result);
    } else if (global.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            path: lastValid.path,
            data: result.data,
            next: result.next,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err: any) {
    if (global.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            path: lastValid.path,
            error: {
              code: err.code || "ERROR",
              message: err.message,
              details: err.details,
            },
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exitCode = 1;
  }
}

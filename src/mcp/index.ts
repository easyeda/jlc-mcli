import { McpBareServer } from "./bare/server.js";
import type { StartBareMcpOptions } from "./bare/server.js";
import { StdioTransport } from "./bare/transport/stdio.js";
import { HttpTransport } from "./bare/transport/http.js";
import type { McliApp } from "../types.js";

export async function startBareMcp(app: McliApp, opts: StartBareMcpOptions): Promise<void> {
  const server = new McpBareServer(app, opts);
  if (opts.transport === "stdio") {
    await new StdioTransport(server).run();
  } else {
    await new HttpTransport(server, opts).run();
  }
}

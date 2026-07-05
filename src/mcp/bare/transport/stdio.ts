import { createInterface } from "node:readline";
import { McpBareServer } from "../server.js";
import {
  JSONRPCMessage,
  JSONRPCErrorResponse,
  JSON_RPC_ERROR_PARSE_ERROR,
  makeErrorResponse,
} from "../json-rpc.js";

export class StdioTransport {
  constructor(private server: McpBareServer) {}

  async run(): Promise<void> {
    const rl = createInterface({ input: process.stdin });

    for await (const line of rl) {
      if (!line.trim()) continue;

      let req: JSONRPCMessage;
      try {
        req = JSON.parse(line);
      } catch {
        this.writeJson(makeErrorResponse(null, JSON_RPC_ERROR_PARSE_ERROR, "Parse error"));
        continue;
      }

      if (!("id" in req) || (req as any).id === null) {
        continue;
      }

      const resp = await this.server.dispatch(req);
      this.writeJson(resp);
    }
  }

  private writeJson(payload: unknown): void {
    process.stdout.write(JSON.stringify(payload) + "\n");
  }
}

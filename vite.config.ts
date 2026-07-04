import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    platform: "node",
    entry: ["./src/index.ts"],
    format: ["esm"],
    deps: {
      neverBundle: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*", "ws"],
    },
    dts: true,
    clean: true,
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  },
});

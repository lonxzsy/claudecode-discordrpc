import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    reporter: "src/reporter.ts",
    daemon: "src/daemon.ts",
  },
  format: ["cjs"],
  target: "node18",
  clean: true,
  splitting: false,
  sourcemap: true,
});

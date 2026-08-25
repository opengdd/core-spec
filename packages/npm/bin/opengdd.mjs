#!/usr/bin/env node
// opengdd CLI: subcommand router over the conformance validator.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [command, ...rest] = process.argv.slice(2);

if (command === "validate") {
  const validator = join(dirname(fileURLToPath(import.meta.url)), "../lib/validate.mjs");
  const result = spawnSync(process.execPath, [validator, ...rest], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

console.error(command ? `unknown command: ${command}` : "a command is required");
console.error("usage: opengdd validate [--json] <package-dir>");
console.error("       opengdd validate --build <opengdd-build.json> [<spec-dir>]");
process.exit(2);

#!/usr/bin/env node
// opengdd CLI: subcommand router over the conformance validator.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const [command, ...rest] = process.argv.slice(2);

const HELP = [
  "Usage:",
  "  opengdd validate [--json] <package-dir>",
  "  opengdd validate --build [--json] <opengdd-build.json> [<package-dir>]",
  "  opengdd migrate [--dry-run] [--json] <package-dir>",
  "  opengdd migrate --build [--dry-run] [--json] <opengdd-build.json>",
  "  opengdd render-contract-tests <package-dir>",
  "  opengdd --help",
  "  opengdd --version",
  "",
  "Options:",
  "  --json                   Write a JSON report.",
  "  --build                  Validate or migrate a build record; validation may name the package it is checked against.",
  "  --dry-run                Report migration changes without writing them.",
  "  --help                   Print this help text.",
  "  --version                Print the validator and format versions."
].join("\n");

if (command === "--help") {
  process.stdout.write(`${HELP}\n`);
  process.exit(0);
}

if (command === "--version") {
  process.stdout.write("opengdd 0.8.0 (OpenGDD format 0.8)\n");
  process.exit(0);
}

if (command === "validate") {
  const validator = join(dirname(fileURLToPath(import.meta.url)), "../lib/validate.mjs");
  const result = spawnSync(process.execPath, [validator, ...rest], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

if (command === "migrate") {
  const migrator = join(dirname(fileURLToPath(import.meta.url)), "../lib/migrate.mjs");
  const result = spawnSync(process.execPath, [migrator, ...rest], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

if (command === "render-contract-tests") {
  const validator = join(dirname(fileURLToPath(import.meta.url)), "../lib/validate.mjs");
  const result = spawnSync(process.execPath, [validator, "--render-contract-tests", ...rest], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

console.error(command ? `unknown command: ${command}` : "a command is required");
console.error(HELP);
process.exit(2);

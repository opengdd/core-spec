#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { emitContractsBlock, formatReport, validateBuildManifest, validatePackage } from "./validate-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = [
  "node conformance/validate.mjs [--json] <package-dir>",
  "node conformance/validate.mjs --build <opengdd-build.json> [<spec-dir>]",
  "node conformance/validate.mjs --emit-contracts-block <package-dir>"
].join("\n");

export function createNodeHost() {
  return {
    path: {
      resolve: path.resolve,
      relative: path.relative,
      join: path.join,
      dirname: path.dirname,
      basename: path.basename,
      extname: path.extname,
      isAbsolute: path.isAbsolute,
      isAbsoluteWindows: path.win32.isAbsolute,
      sep: path.sep
    },
    exists: fs.existsSync,
    isFile: file => fs.statSync(file).isFile(),
    isDirectory: file => fs.statSync(file).isDirectory(),
    isSymbolicLink: file => fs.lstatSync(file).isSymbolicLink(),
    readLink: fs.readlinkSync,
    readDir: directory => fs.readdirSync(directory, { withFileTypes: true }).map(entry => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory()
    })),
    size: file => fs.statSync(file).size,
    readText: file => fs.readFileSync(file, "utf8"),
    readBytes: file => new Uint8Array(fs.readFileSync(file)),
    sha256: bytes => crypto.createHash("sha256").update(bytes).digest("hex"),
    loadSchema: name => {
      const file = [
        path.resolve(HERE, "..", name),
        path.resolve(HERE, "..", "schema", "core", "v0.6", name)
      ].find(candidate => fs.existsSync(candidate));
      return file ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined;
    }
  };
}

function usage(jsonMode, message) {
  const output = { error: message, usage: USAGE };
  if (jsonMode) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  else {
    if (message) console.error(message);
    console.error(output.usage);
  }
  process.exitCode = 2;
}

function main(args) {
  const jsonMode = args.includes("--json");
  const buildMode = args.includes("--build");
  const emitMode = args.includes("--emit-contracts-block");
  const positional = args.filter(arg => arg !== "--json" && arg !== "--build" && arg !== "--emit-contracts-block");
  const unknownOptions = positional.filter(arg => arg.startsWith("-"));
  // SPEC §10.10: the generated block is machine-written, and this is the
  // machine. It prints the canonical instantiation of a package's contracts —
  // paste it over the block in the build plan and byte equality holds by
  // construction. It writes nothing itself, so a bad regeneration is a diff.
  if (emitMode) {
    if (unknownOptions.length || buildMode || positional.length !== 1) {
      usage(jsonMode, unknownOptions.length ? `unknown option: ${unknownOptions[0]}` : "--emit-contracts-block requires exactly one package directory");
      return;
    }
    const run = emitContractsBlock(createNodeHost(), positional[0]);
    if (run.block === undefined) {
      console.error("the package declares no contract instance that could be instantiated");
      process.exitCode = 1;
      return;
    }
    // The block is a function of the surface, so a package that does not
    // validate can still be instantiated — but its bytes are only as sound as
    // the answers behind them, and that is worth saying out loud.
    if (run.summary.errors) console.error(`note: the package reports ${run.summary.errors} validation error(s); the block below is the instantiation of what it currently declares`);
    process.stdout.write(run.block);
    return;
  }
  if (buildMode) {
    if (unknownOptions.length || positional.length < 1 || positional.length > 2) {
      usage(jsonMode, unknownOptions.length ? `unknown option: ${unknownOptions[0]}` : "--build requires <opengdd-build.json> and an optional <spec-dir>");
      return;
    }
    const run = validateBuildManifest(createNodeHost(), positional[0], positional[1]);
    process.stdout.write(formatReport(run, jsonMode));
    process.exitCode = run.summary.errors ? 1 : 0;
    return;
  }
  if (unknownOptions.length || positional.length !== 1) {
    usage(jsonMode, unknownOptions.length ? `unknown option: ${unknownOptions[0]}` : "exactly one package directory is required");
    return;
  }
  const run = validatePackage(createNodeHost(), positional[0]);
  process.stdout.write(formatReport(run, jsonMode));
  process.exitCode = run.summary.errors ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

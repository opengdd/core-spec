#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { FORMAT_VERSION, VALIDATOR_VERSION, formatReport, renderContractTests, validateBuildManifest, validatePackage } from "./validate-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = [
  "Usage:",
  "  node conformance/validate.mjs [--json] <package-dir>",
  "  node conformance/validate.mjs --build [--json] <opengdd-build.json> [<package-dir>]",
  "  node conformance/validate.mjs --render-contract-tests <package-dir>",
  "  node conformance/validate.mjs --help",
  "  node conformance/validate.mjs --version",
  "",
  "Options:",
  "  --json                   Write a JSON report.",
  "  --build                  Validate a build record; <package-dir> is the package it is checked against.",
  "  --render-contract-tests  Render checked contract tests as Markdown.",
  "  --help                   Print this help text.",
  "  --version                Print the validator and format versions."
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
      const file = path.resolve(HERE, "..", name);
      if (!fs.existsSync(file)) throw new Error(`schema ${name} was not found beside conformance/; the schema checks cannot run`);
      return JSON.parse(fs.readFileSync(file, "utf8"));
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
  const renderMode = args.includes("--render-contract-tests");
  const helpMode = args.includes("--help");
  const versionMode = args.includes("--version");
  if (helpMode || versionMode) {
    if (args.length !== 1) {
      usage(jsonMode, `${helpMode ? "--help" : "--version"} cannot be combined with other arguments`);
      return;
    }
    process.stdout.write(helpMode ? `${USAGE}\n` : `opengdd ${VALIDATOR_VERSION} (OpenGDD format ${FORMAT_VERSION})\n`);
    process.exitCode = 0;
    return;
  }
  const positional = args.filter(arg => arg !== "--json" && arg !== "--build" && arg !== "--render-contract-tests");
  const unknownOptions = positional.filter(arg => arg.startsWith("-"));
  // Render checked contract tests for reading. The list exists only in memory;
  // it is never pasted into or compared with the build plan.
  if (renderMode) {
    if (unknownOptions.length || buildMode || positional.length !== 1) {
      usage(jsonMode, unknownOptions.length ? `unknown option: ${unknownOptions[0]}` : "--render-contract-tests requires exactly one package directory");
      return;
    }
    const run = renderContractTests(createNodeHost(), positional[0]);
    if (run.markdown === undefined) {
      console.error("the package declares no contract adoption");
      process.exitCode = 1;
      return;
    }
    if (run.summary.errors) console.error(`note: the package reports ${run.summary.errors} validation error(s)${run.summary.dependent ? ` (${run.summary.dependent} waiting on designer input)` : ""}; the Markdown below renders what it currently declares`);
    else if (run.markdown === "" && run.contractAdoptions > 0 && run.checkedContractAdoptions === 0) console.error("every adoption is promised; no tests are generated");
    process.stdout.write(run.markdown);
    process.exitCode = run.summary.errors ? 1 : 0;
    return;
  }
  if (buildMode) {
    if (unknownOptions.length || positional.length < 1 || positional.length > 2) {
      usage(jsonMode, unknownOptions.length ? `unknown option: ${unknownOptions[0]}` : "--build requires <opengdd-build.json> and an optional <package-dir>");
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}

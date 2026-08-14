#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { formatReport, validateBuildManifest, validatePackage } from "./validate-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = "node opengdd/conformance/validate.mjs [--json] <package-dir> | --build <opengdd-build.json> [<spec-dir>]";

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
        path.resolve(HERE, "..", "schema", "core", "v0.5", name)
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
  const positional = args.filter(arg => arg !== "--json" && arg !== "--build");
  const unknownOptions = positional.filter(arg => arg.startsWith("-"));
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

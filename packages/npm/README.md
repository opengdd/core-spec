# opengdd

The conformance validator for [OpenGDD](https://opengdd.org), an open
format for game design documents written in prose and structured data.

For CI, pin the validator version:

```
npx opengdd@0.8 validate <dir>
```

Later 0.x releases may change which checks run.

Validates an OpenGDD package directory against the specification's
mechanically testable requirements and reports errors and warnings, each with
the specification section it enforces.
`validate --build <opengdd-build.json> [<package-dir>]` validates a build
record; the optional package directory is the package that build is checked
against.

## CLI results

Exit `0` means no errors, `1` means one or more conformance errors, and
`2` means a CLI usage error. Warnings never fail a run.

`validate --json` writes one JSON object to standard output on passing and
failing validation runs. Its fields are:

- `validator`, the validation kind; `format`, the OpenGDD version checked
  (`"0.8"`); and `validator_version`, the npm package version;
- `package`, or `build` in build-record mode, with `id` and `path`;
- `valid` and `verdict`;
- `summary`, with numeric `errors`, `dependent`, `warnings`, and
  `findings` counts; and
- `findings`, whose entries always have `code`, `severity`,
  `spec_section`, `file`, and `message`. A finding has `line` and
  check-specific `data` when known. An error waiting for required designer
  input also has `dependent: true`.

`valid` is `null` and the verdict is `NOT CHECKED` when a build record
is checked without its package. A missing or unreadable package directory has
`package.id` set to `null`.

## Migration

`opengdd migrate` rewrites a v0.6 or v0.7 package or build record into v0.8:

```
npx opengdd migrate <package-dir> [--dry-run] [--json]
npx opengdd migrate --build <opengdd-build.json> [--dry-run] [--json]
```

`--dry-run` reports changes without writing them. Exit `0` means no
manual items remain, `1` means manual items remain, and `2` means invalid
arguments, unreadable input, or another migration error.

## Using it from a script

The supported library call is `validatePackage(host, dir)`. Use
`createNodeHost()` for a directory on disk:

```js
import { validatePackage } from "opengdd";
import { createNodeHost } from "opengdd/node-host";

const directory = process.argv[2] ?? ".";
const report = validatePackage(createNodeHost(), directory);

for (const finding of report.findings) {
  console.log(finding.severity, finding.code, finding.file, finding.message);
}
```

`formatReport(report, true)` turns that result into the same JSON text as
`validate --json`; pass `false` for the plain-text report.
`renderContractTests(host, dir)` returns the checked contract adoptions'
rendered tests together with their findings and summary. The
`opengdd/file-map-host`, `opengdd/package-syntax`, and `opengdd/migrate`
subpaths are supported for non-filesystem hosts, syntax helpers, and migration
tools. Deep `lib/` paths are not supported and may change without notice.

No dependencies. The specification, schemas, and everything else live
at [opengdd.org](https://opengdd.org).

License: MIT. Specification prose: CC-BY 4.0.

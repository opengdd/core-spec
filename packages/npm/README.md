# opengdd

The conformance validator for [OpenGDD](https://opengdd.org), an open
format for game design documents written in prose and structured data.

It needs Node.js 18 or later.

For CI, pin the validator version:

```
npx opengdd@0.9 validate <dir>
```

Later 0.x releases may change which checks run.

Validates an OpenGDD package directory against the specification's
mechanically testable requirements and reports errors and warnings, each with
the specification section it enforces.
`validate --build <opengdd-build.json> [<package-dir>]` validates a build
record; the optional package directory is the package that build is checked
against.

## CLI results

For package validation, exit `0` means no errors, `1` means one or more
conformance errors, and `2` means a CLI usage error. In build mode, exit
`0` means conforming, `1` means invalid, `2` means a CLI usage error,
and `3` means incomplete, not verified, or not checked. Warnings, hints,
and safety notices never fail a run.

`validate --json` writes one JSON object to standard output on passing and
failing validation runs. Its fields are:

- `validator`, the validation kind; `format`, the OpenGDD version checked
  (`"0.9"`); and `validator_version`, the npm package version;
- `package`, or `build` in build-record mode, with `id` and `path`;
- `valid` and `verdict`, plus the derived `outcome` in build mode;
- `summary`, with numeric `errors`, `dependent`, `warnings`, `hints`,
  `safety`, and `findings` counts;
- `findings`, whose entries always have `code`, `severity`,
  `spec_section`, `file`, and `message`. A finding has `line` and
  check-specific `data` when known. An error waiting for required designer
  input also has `dependent: true`; and
- always-present `hints` and `safety` arrays with the same location and
  message fields. They never contribute to the warning count or verdict.

Use `validate --review <package-dir>` to request optional English-language
hints. The safety scan runs by default. Build mode returns empty hint and
safety arrays.

Without its package, a build record with errors is invalid, and the command
exits `1`. A build record with no errors of its own is not checked:
`valid` is `null`, the verdict is `NOT CHECKED`, and the command exits
`3`. The checks that need the package did not run. The acceptance sum is
checked from the record alone: `passed` plus the number of `not_passed`
entries must equal `total`. A missing or
unreadable package directory has `package.id` set to `null`.

With its package, a build outcome is `conforming` when the package has tests
and all passed, `incomplete` when any test is listed in
`evidence.acceptance.not_passed`, or `not verified` when the package has no
tests. Incomplete and not verified are valid reports, but are not conforming
builds. Build-mode verdicts are `PASS` or `PASS WITH WARNINGS` only for
conforming, otherwise `INCOMPLETE`, `NOT VERIFIED`, `NOT CHECKED`, or
`FAIL`.

Each entry in `not_passed` has a `result` and a `reason`. `failed` means
that the test ran completely and did not pass. `partial` means that the
test could be run only in part. `not-run` means that the test did not run.
The `reason` says why the test did not pass.

## Migration

`opengdd migrate` rewrites a v0.6, v0.7, or v0.8 package or build record into v0.9:

```
npx opengdd migrate <package-dir> [--dry-run] [--json]
npx opengdd migrate --build <opengdd-build.json> [<package-dir>] [--dry-run] [--json]
```

`--dry-run` reports changes without writing them. Exit `0` means no
manual items remain, `1` means manual items remain, and `2` means invalid
arguments, unreadable input, or another migration error.

Supply the source package when migrating a build record. The migrator changes
a v0.8 record to v0.9 only when its recorded address list is unchanged.
Without a source package, or when an address changed, the record stays at v0.8,
the migration leaves a manual item, and the command exits `1`.

The meaning of tag scope changed in v0.9. The v0.8 to v0.9 version step keeps
chapter text unchanged and reports each passage that needs manual review. Quote the lines
that should stay under the tag, or leave them unquoted as Fixed text or text
that applies in every ruleset.
Equal address lists do not prove unchanged chapter meaning. Build-record
migration still requires tag-scope review.

## Using it from a script

The supported library call is `validatePackage(host, dir, { review })`. The
option defaults to false. Use
`createNodeHost()` for a directory on disk:

```js
import { validatePackage } from "opengdd";
import { createNodeHost } from "opengdd/node-host";

const directory = process.argv[2] ?? ".";
const report = validatePackage(createNodeHost(), directory, { review: true });

for (const finding of report.findings) {
  console.log(finding.severity, finding.code, finding.file, finding.message);
}

for (const hint of report.hints) console.log("hint", hint.code, hint.file);
for (const notice of report.safety) console.log("safety", notice.code, notice.file);
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

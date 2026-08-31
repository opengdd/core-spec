# OpenGDD build-certification protocol

Package conformance and build certification are separate protocols. The
package validator establishes that a game specification has a mechanically
valid OpenGDD envelope. Certification evaluates whether one particular build
implements that specification. Between the two sits build-record conformance
(SPEC §2d, §7): the machine-checked validity of `opengdd-build.json` itself
and its consistency with the source package.

This is a public draft protocol. Under SPEC §2d it is experimental in v0.7:
its verdicts are the draft's own, no v0.7 conformance outcome turns on them,
and the specification defines no normative certification verdict. The
protocol does not add requirements to package conformance and does not grant
or imply authorization to use a certification mark. No OpenGDD
certification-mark program operates today.

## Certification gate

A build is eligible for a certification verdict only when all of these are
true:

1. **The package conforms.** Run the version-matched OpenGDD validator, then
   review every applicable package-level prose obligation under SPEC §2d,
   before interpreting build evidence. A clean CLI run establishes the
   implemented machine checks, not the human review.
2. **Every declared acceptance test is reported.** Execute each acceptance-test
   obligation according to its fenced `test` block: the package's own `AT-n`
   tests and the tests rendered from every checked contract pack, named
   `AT <adoption>/<template>` or `AT <adoption>/<template>/<row>` (SPEC
   §§6, 10.5). Rendered tests execute exactly as game-local ones do, after the
   package and pack have passed package validation. The format defines their
   package shape but not their runtime execution semantics (SPEC §§2d, 6), so
   executing them is this protocol's obligation. Use the exact
   runner profile id and version named by `evidence.runner`; the runner may be
   a person, a capable agent, or a versioned harness. Report
   non-acceptance checkpoints separately; do not silently count them as tests
   or hide them when they fail. The [Runner profile](#runner-profile) states
   the execution meanings the format leaves open. For each game-local general
   test, record its id in `evidence.acceptance.sampled` when the runner checked
   a sample rather than the whole scope.
3. **Runtime data matches the resolved snapshot.** Resolve personalization in
   declared order. For every key in `resolved_tuning.values` the audit chooses
   to check, including each fixed contract value at
   `contracts.<adoption>.<value>` (SPEC §10.6), compare the value actually consumed at runtime with the
   corresponding resolved value. Source-file equality alone is insufficient.
   The [Audit profile](#audit-profile) owns this selection and comparison.
4. **`opengdd-build.json` is complete.** The build record identifies the
   format revision, spec and build, designer and builder, personalization
   answers, full resolved tuning snapshot, the `evidence` record's counts,
   result hash, and conditional runner identity. The runner identity resolves
   to the [Runner profile](#runner-profile).
5. **The result hash is reproducible.** The evidence defines exactly which
   payload is hashed and uses the canonical serialization below.
6. **A separate audit supports the verdict.** The builder's own green result
   is evidence, not the final judgment. Apply the [Audit profile](#audit-profile).

## Canonical hash serialization

Certification hashes use this byte representation:

1. Recursively sort every JSON object's keys, comparing keys as sequences of
   UTF-16 code units.
2. Preserve array order exactly; array order is data.
3. Serialize the transformed value as compact JSON with no indentation or
   trailing newline, using minimal string escaping (escape only the
   characters JSON requires: `"`, `\`, and control characters, as short
   escapes where defined and lowercase `\u00XX` otherwise) and rendering
   numbers with the ECMAScript number-to-string algorithm (so `1.0`
   serializes as `1`).
4. Encode those exact characters as UTF-8.
5. Hash the bytes with SHA-256 and record the lowercase hexadecimal digest.

For payloads within JSON's interoperable range this byte representation
matches RFC 8785 (JSON Canonicalization Scheme); implementations may use a
conforming RFC 8785 serializer.

Hash payloads MUST stay within that interoperable range (I-JSON, RFC 7493):
numbers exactly representable as IEEE-754 doubles and strings of well-formed
Unicode with no unpaired surrogates. Outside that range the byte
representation is undefined.

`result_hash` is the SHA-256 digest of the exact bytes of the file named by
the build record's `payload.file`, and those bytes MUST already be in this
canonical representation. A file that parses to the same JSON but different
bytes has no defined digest under this protocol.

The hashed payload must include enough identity to prevent evidence for one
spec or build from being replayed as another. At minimum it identifies the
spec, build, canonical acceptance-test records, and declared checkpoint
records. Any replay, capture, or layout digest separately states what its own
payload `covers`.

## Adopted contract records

A checked adoption is pinned in the build record by the verification pack's
content hash. `evidence.contracts` carries one closed entry per checked
adoption and no promised adoption:

```json
{
  "adoption": "stamina",
  "pack": "sha256:<64 lowercase hex>"
}
```

`pack` is the SHA-256 of the exact bytes of
`contracts/<contract>-<version>.pack.json`. The
source-backed record check requires the adoption ids and hashes to equal the
source package exactly (SPEC §§7, 10.5). The pack is immutable under that hash,
so this record says which rendered tests the reported acceptance count used.

The audit separately records the identity it actually judged for every
adoption, promised or checked:

```json
{
  "adoption": "stamina",
  "contract": "ranged-value",
  "version": 1,
  "origin": "https://opengdd.org/contracts/ranged-value-1",
  "definition_digest": "<64 lowercase hex>"
}
```

`definition_digest` uses the **audit identity serialization**: omit `answers`,
`values`, `rows`, and `verification`; keep `_`-prefixed annotations; serialize
the remaining object with two-space indentation and authored member order; use
LF endings and no trailing newline; encode as UTF-8; and record the lowercase
hexadecimal SHA-256. The validator's **definition-comparison form** is
different: it strips annotations and emits the top-level definition fields in
SPEC §10.2 order before comparing adoptions, while preserving member order
inside them. The audit keeps annotations because they are part of what the
auditor actually judged. The audit serialization exposes a fork without
making an online catalogue lookup a package check (SPEC §10.9).

Both digests are claims. The source-backed record validator checks the pack
hash; the auditor recomputes the definition digest under audit question 5.

## Runner profile

This profile is experimental; nothing in the package validator reads it. A
runtime result names the runner profile through the non-empty `id` and
`version` strings in `evidence.runner`. The runner's published description
must give those exact strings and state the execution meanings below.

For a general test, the description states how the runner samples or walks the
declared `scope`. When `seeds` is present, it states that method and its sample
count for each seed. The package owns `scope`, `holds`, and `seeds`; a runner
never narrows them.

When the runner samples a game-local general test, the build record names it
in `evidence.acceptance.sampled`. The runner may report that the checked cases
met the claim, including a measure bounded by the test's `holds` sentence. It
MUST NOT report that a sample established absence, a minimum, or a universal.
When the whole declared scope was walked, the result may establish those
claims.

The description also states the replay schedule and action vocabulary it
accepts, and how it takes observations for `target` and `tolerance`. Those
meanings belong to that named runner and do not become format vocabulary.

## Audit profile

This profile is experimental; nothing in the package validator reads it. In its
own record, the audit records the id of the capture recipe it used under
`capture_profile`; `capture_profile` is not a field in `opengdd-build.json`.
The one existing recipe id is `web-1`:

- advance gameplay on a synthetic 60 Hz clock;
- sample full-viewport frames at 12 fps; and
- record the input hash, duration, rates and counts, determinism checks, and
  artifact paths in the capture manifest.

The builder may attach any further evidence the audit asks for. The format
does not name that evidence or give it a fixed shape.

The audit chooses and records its scope over `resolved_tuning.values`, then
compares those values with what the build consumes. For judged direction it
reviews pillars, mood, anti-references, and what must stay under the package's
`viewing` conditions, blind to the builder's identity; uses qualified judges
where a borrow reaches a real place, people, culture, or living tradition;
and records per-claim observations. Its result reports adherence and coverage
as two separate axes.

## Separate audit

An auditor works from the published package, build, and evidence. The audit
should answer these questions:

1. **Do the tests test the right thing?** Re-run the suite, reproduce counts
   and hashes, and sample high-risk tests against both their `test`
   blocks and Fixed prose.
2. **Does tuning flow by reference?** Trace representative certified values
   from the resolved snapshot to runtime consumption and look for re-hardcoded
   literals.
3. **Are Fixed rules faithfully implemented?** Inspect representative rules,
   including ordering, precedence, exceptions, lifecycle, and observable
   outcomes. Passing weak tests does not close a stronger obligation.
4. **Are determinism and hash claims real?** Re-derive declared random vectors
   where applicable, reproduce hashes, and confirm Delegated generation has
   not become an undeclared cross-build identity promise.
5. **Is the build record internally consistent?** Compare identity, answers,
   resolved values, attribution, totals, and digests with the source package
   and a fresh run.
6. **Are ambiguities disclosed honestly?** Distinguish a genuine document gap
   from permissible builder choice, an advisory finding, or implementation
   error.
7. **What falls outside the sampled tests?** Record weak diagnostics,
   tautological checkpoints, unsupported assertions, and overclaimed report
   language.
8. **Are opaque replay claims grounded?** The whole `replay` object is
   runner-defined. Confirm that every runner-interpreted replay-input path
   stays inside the package, that structured replay content is declared
   through SPEC §1b, and that every expected `target` is grounded in input the
   runner actually supplies. The runner profile names the schedule and action
   vocabulary it accepts; that vocabulary is not yet standardized.
9. **Is the result attributable?** Re-run with the exact `evidence.runner`
   id and version.

## Verdict and evidence

The audit ends with a reasoned `certify`, `certify-with-notes`, or
`do-not-certify` verdict. A failed acceptance test, certified runtime mismatch,
a Fixed-statement deviation established by the audit, evidence narrower than
its claimed scope, incomplete required build record, or unreproducible result
hash blocks certification. Other release gates may still block distribution, but their
status must not be folded into the acceptance-test result.

Certification evidence belongs to the build: validator output, test records,
hash payload definition, `opengdd-build.json`, the separate audit, and any
ambiguity reports. It must not be rewritten as a claim that every future build
of the same specification is certified.

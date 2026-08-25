# OpenGDD build-certification protocol

Package conformance and build certification are separate protocols. The
package validator establishes that a game specification has a mechanically
valid OpenGDD envelope. Certification evaluates whether one particular build
implements that specification. Between the two sits build-record conformance
(SPEC §2d, §7): the machine-checked validity of `opengdd-build.json` itself
and its consistency with the source package.

This is a public draft protocol. Under SPEC §2d it is experimental in v0.6:
its verdicts are the draft's own, no v0.6 conformance outcome turns on them,
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
   tests, and the generated tests an adopted contract contributes, named
   `AT <instance>/<template>` or `AT <instance>/<template>/<row>` (SPEC
   §10.10). Generated tests execute exactly as game-local ones do, and only
   after package validation — block equality included — has passed. The core
   defines the block grammar but not its runtime execution semantics (SPEC
   §§2d, 6), so executing it is this protocol's obligation. Use the exact
   runner profile id and version named by `evidence.runner`; the runner may be
   a person, a capable agent, or a versioned harness. Report
   non-acceptance checkpoints separately; do not silently count them as tests
   or hide them when they fail.
3. **Runtime data matches the resolved snapshot.** Resolve personalization in
   declared order. For every `meta.<key>.must_match: true` entry in `tunables` or
   `constants`, and every contract knob a surface pins the same way (SPEC
   §10.6), compare the value actually consumed at runtime with the
   corresponding resolved value. Source-file equality alone is insufficient.
4. **`opengdd-build.json` is complete.** The build record identifies the
   format revision, spec and build, designer and builder, personalization
   answers, full resolved tuning snapshot, the `evidence` record's counts,
   result hash, conditional runner identity, and one observation context for
   every measured direction constraint.
5. **The result hash is reproducible.** The evidence defines exactly which
   payload is hashed and uses the canonical serialization below.
6. **A separate audit supports the verdict.** The builder's own green result
   is evidence, not the final judgment.

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

A build of a package that adopts contracts (SPEC §10) pins which cores it was
tested against. The certification record carries one entry per contract
instance:

```json
{
  "instance": "stamina",
  "id": "ranged-value",
  "version": 1,
  "origin": { "author": "…" },
  "digest": "<64 lowercase hex>"
}
```

`instance` is the instance id. `id` and `version` name the core, and `origin`
repeats the core's own `origin` object, absent where the core declares none.
`digest` is the SHA-256 of the UTF-8 bytes of that instance's vendored `core`
object serialized in SPEC §10.10's canonical form — two-space indentation,
authored field order, `_`-prefixed annotations included, LF line
endings — recorded as lowercase hexadecimal.

That is a deliberate departure from the canonical hash serialization above,
and the only one this protocol defines: a core's digest covers the bytes a
package actually carries and a reader actually diffs, not a re-sorted compact
form. Every field is covered, so editing `origin` or an annotation moves the
digest, which is the point — two unrelated cores may both call themselves
`health-1` (SPEC §10.3), and a certificate has to say which one it covers.

The digest is the builder's claim. Recomputing it is the auditor's work, under
audit question 5 below; no package-conformance or record-conformance check
reproduces it (SPEC §2d).

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
8. **Are opaque replay claims grounded?** Confirm that every runner-interpreted
   replay-input path stays inside the package, that structured replay content
   is declared through SPEC §1b, and that every expected `target` is grounded
   in an input or schedule the runner actually supplies. These are audit
   obligations because SPEC §6 leaves replay entries other than its §4b clock
   fields runner-defined.
9. **Is the result attributable?** Re-run with the exact `evidence.runner`
   id and version. For every `evidence.direction_observations` entry, confirm
   that its context describes what the run actually observed and that the
   observation covers the cited claim's full declared scope.

Judged direction claims (SPEC §9.10) are outside this draft's audit scope:
their panel protocol is not yet integrated, `direction_result.judged.status`
stays `"pending"`, and no verdict below asserts whole-direction adherence.

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

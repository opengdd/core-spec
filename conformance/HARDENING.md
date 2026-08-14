# OpenGDD spec-hardening protocol

This public draft sits above
[CERTIFICATION.md](CERTIFICATION.md): certification evaluates one build;
hardening evaluates a specification through multiple independently produced,
certified builds.

## What hardening claims

A hardened specification has evidence that its published text and data—not
shared private context—are sufficient to produce faithful implementations.
At least two builders start from the same specification package, produce
separately certified builds, and agree on the document's resolved numeric
surfaces.

Hardening is evidence about the document. It is not a promise that every
future build will be correct, visually identical, or certified.

## Independence requirements

1. **Clean-room input.** Each builder receives only the specification package
   and the public OpenGDD format documents. It does not receive another
   build's source, tests, notes, or ambiguity reports before its own verdict.
2. **Independent implementations.** The builds must not share implementation
   work or hidden design context.
3. **Separate audit.** A builder does not issue the final certification
   verdict on its own build.
4. **Independent re-verification.** Reported test runs, hashes, and checkpoint
   counts are reproduced rather than accepted as assertions.
5. **Varied review surface.** Across rounds, audits examine engine fidelity,
   test-oracle strength, serialization and hash discipline, and presentation
   so that repeated verdicts do not come from repeating one narrow check.

## The audit loop

Each build goes through the certification protocol:

1. An auditor derives obligations from the specification and its fenced
   `verification` descriptors, then re-runs the relevant evidence.
2. The verdict is `certify`, `certify-with-notes`, or `do-not-certify`.
   A negative verdict is a normal result that identifies work still needed.
3. The builder remediates findings. A later round checks both those changes
   and a fresh part of the build.
4. Accepted notes remain explicit; they are not erased by a green test count.

## Cross-build agreement

After the builds are individually certified, compare the full resolved tuning
snapshot—`tunables` and Fixed `constants`—using the canonical serialization in
[CERTIFICATION.md](CERTIFICATION.md). Values that the specification fixes must
agree exactly. A divergence is evidence of ambiguity and routes back to the
designer; it is not resolved by choosing a preferred implementation.

Aesthetic and presentational surfaces are excluded from byte-exact agreement
unless the specification explicitly pins them through a certifiable
mechanism. OpenGDD transmits creative direction while allowing faithful
implementations to interpret that direction differently.

## Ambiguity reports

Any failed checkpoint, audit finding, or cross-build divergence that traces to
the specification becomes an ambiguity report. The report identifies the
affected text or data, the incompatible interpretations, the observable
consequence, and the smallest clarification that would close the gap.

If the ambiguity belongs to one game, it routes to that game's designer. If
it exposes a reusable format gap, it becomes input to a later OpenGDD revision.

## Reporting status

A public hardening claim should name the specification version, the qualifying
builds, their certification evidence, the comparison surface, and any accepted
notes. If organizational or implementation independence is limited, disclose
that limitation alongside the claim rather than hiding it in private records.

# How OpenGDD is developed

OpenGDD is developed by testing the format against real design problems, not
by treating elegant prose as proof. This document describes the public method
behind the working draft.

## The core stance

Three principles guide the work:

- **Evidence over assertion.** A format rule should have a mechanical check,
  a worked example, or documented counterevidence. A claim supported only by
  prose remains provisional.
- **Creative authority stays explicit.** OpenGDD separates what a designer
  fixes from what a builder may interpret. Improving machine validation must
  not quietly transfer creative control away from the designer.
- **Creation and evaluation are separate roles.** Builders, auditors, and
  reviewers should not rely on one another's hidden context. Important claims
  are rechecked from the published package and evidence.

## The development loop

### 1. Express varied designs

Candidate revisions are exercised against games with different structures:
turn-based and real-time rules, authored and generated content, quantitative
systems, narrative systems, physical simulation, and hybrids. Friction is
recorded as a format problem only when it belongs in a shared standard rather
than in one game's local design.

### 2. Test the boundaries

Known games and deliberate outliers are used as counterexamples. Predictions
are written before evaluation so that a surprising result becomes evidence
instead of being explained away afterward. Genuine boundaries are published
in [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md).

### 3. Build from the package

A design document is useful only if a builder can act on it without the
designer silently filling gaps. Clean-room implementations expose missing
ordering, authority, data, and verification details. Those ambiguities route
back into the document or, when general enough, into the format.

### 4. Validate and audit

The validator checks the package's machine-readable contract. Build
certification is a separate review of one implementation and its evidence;
the public draft protocol is in
[conformance/CERTIFICATION.md](conformance/CERTIFICATION.md). Repeated,
independent implementations can then test whether a document is sufficiently
precise without demanding identical creative presentation; see
[conformance/HARDENING.md](conformance/HARDENING.md).

### 5. Revise without hiding the breakage

Format changes ship with versioned schemas and migration notes. A candidate
construct remains deferred when the evidence is too narrow, and an observed
failure remains a limitation until a revision actually closes it.

## What the evidence can and cannot show

Passing validation proves structural conformance, not that a game is good or
that a build is faithful. Passing certification supports a claim about a
specific build, not every future implementation. Agreement between multiple
builds strengthens confidence in a design document, but it does not turn
aesthetic interpretation into a byte-for-byte requirement.

OpenGDD therefore keeps three questions separate:

1. Is the package structurally valid?
2. Does this build satisfy the package's fixed obligations?
3. Does the format carry this kind of design clearly across independent
   implementations?

The first is primarily mechanical. The second combines evidence and audit.
The third is an ongoing research question answered through examples,
counterexamples, and revision history.

## Lifecycle and versioning

Game specifications can move from draft to proven and hardened through build
evidence. Format revisions use their own version numbers and must not be
confused with a game's version or status. OpenGDD remains a 0.x working draft;
1.0 will represent a defined compatibility promise rather than a calendar
milestone.

The public outputs of this loop are the specification, schemas, validator,
examples, changelog, protocols, and known limitations. Together they make the
current claims inspectable without presenting private working notes as part of
the standard.

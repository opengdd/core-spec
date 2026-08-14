# OpenGDD v0.5 — known limitations

OpenGDD v0.5 is a working draft. This document distinguishes deliberate scope
choices from areas that the format can describe in prose but cannot yet
standardize or verify portably.

Here, **expressible** means that an OpenGDD package can describe the design. It
does not mean every independent tool can discover, interpret, or certify that
description in the same way. The normative source remains [SPEC.md](SPEC.md).

## Deliberately outside the v0.x core

OpenGDD v0.x does not standardize:

- multiplayer sessions, networking, delivery, or private-view security;
- 3D target families;
- binary asset-production pipelines;
- localization structure;
- monetization design beyond the attribution and revenue-split fields already
  defined by the format;
- a registry API; or
- deployment targets beyond the initial 2D web family.

These exclusions are boundaries of the current standard, not claims that such
games cannot be designed or built. A package may describe relevant intent in
prose, but it cannot claim portable OpenGDD certification for behavior the
format does not define.

Human testimony, belief, deception, taste, and trust are also not machine
certification targets. A package can certify observable facts that support a
player experience, but should not replace a qualitative claim with an invented
authoritative flag.

## Areas that remain partial

### Multiplayer authority and hidden information

Many game rules can be expressed as deterministic state transitions, but v0.x
has no shared contract for session membership, network authority, state
delivery, reconciliation, or protection against leaking private views. These
facilities require a future profile.

### Host-platform integration

Authentic interaction with a player's filesystem, save bytes, achievements,
recordings, or other host facilities is not standardized for the v0.x web
target. Simulated versions inside a game's fiction remain ordinary game state.

### General puzzle and solver interfaces

OpenGDD can carry fixtures, finite domains, replays, and exhaustive-search
evidence. It does not yet define one universal layout representation or solver
predicate vocabulary for every puzzle family. A local solver can support a
package, but independent tools need the local contract and cannot infer a
portable one from v0.5 alone.

### Open-ended rule mutation

Finite, author-declared rules can be activated, replaced, or derived through
Fixed prose, declared state, and tests. Runtime creation of vocabulary or
behavior outside an author-declared finite set has not been standardized or
certified.

### Epistemic and narrative-quality claims

Reachability, causal history, symbolic uniqueness, and other observable
witnesses can be tested. Claims such as “the player understands the mystery”
or “the simulation produces a good story” are not state predicates. Packages
should certify the underlying causal and observable facts while leaving the
human interpretation honestly qualitative.

### Emergent simulation below an observable envelope

Macroscopic outcomes can be specified without fixing an implementation's
simulation grain. Below a declared feature width—or between declared
observation times—visible outcomes may depend on cell size, neighborhood,
update order, or another architectural choice. Pinning every such outcome
would turn implementation architecture into Fixed design.

The material-simulation envelope in v0.5 therefore certifies only its declared
interaction tables, measures, feature width, and observation schedule. It does
not certify individual grains, every intermediate state, or universal
emergence.

### Personalized art direction

The v0.5 direction block does not define how player-selected presentation,
such as a custom palette, composes with palette-role semantics. Exact visual
surfaces have certification paths only when the format provides an explicit
evidence carrier; prose direction alone is interpretive.

### Material feel and motion

Text and reference imagery can communicate decomposable features such as
shape, palette, stitches, edge treatments, and shadows. Continuous material
qualities—fiber, translucency, sheen, traveling glisten, drip, ooze, and
deformation—remain harder to transmit consistently. v0.5 provides a narrow
motion vocabulary and judged evidence path; it does not claim a general
material-rendering solution.

## Authoring lessons

These limitations do not excuse contradictions or incomplete evidence inside
a package. Four practices reduce avoidable ambiguity:

1. **Specify outcomes, not architecture.** Require the observable result and
   its evidence. Leave source layout, renderer structure, and equivalent
   implementation techniques to the builder unless they are themselves part
   of the design.
2. **Give every fixture an input and a target.** A useful fixture identifies
   its setup, action or schedule, expected observations, tolerances, and
   diagnostics.
3. **Do not create a second authority channel.** Local fields must not silently
   redefine Fixed, Delegated, or Personalization authority.
4. **Do not restate tuning values in normative prose.** Prose should bind to
   symbolic keys and formulas. Literal examples should be non-normative or
   generated from the authoritative data.

Schema validity is only the first gate. Publication still requires semantic
review, reachable test setups, reference closure, successful fixture replay,
and honest disclosure of claims the available evidence cannot support.

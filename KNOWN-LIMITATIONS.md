# OpenGDD v0.7 — known limitations


This document describes the OpenGDD v0.7 working draft. An honest format
states what it cannot yet do. "Expressible" never means "uniformly
machine-discoverable or portably machine-verifiable," and this page keeps
those ideas apart. Certification is experimental in v0.7: nothing below
grants or withholds a certification outcome.

## Deliberately out of scope

The current OpenGDD core does not define:

- multiplayer session, delivery, networking, or private-view behavior;
- rendered-capture checks for 3D renderers — a `web-3d` package validates,
  but no 3D capture profile defines how to sample rendered output;
- binary asset pipelines;
- audio direction — the transmission experiment has not run, so this version
  makes no audio-direction claims;
- localization structure;
- monetization design beyond the optional commerce split, including IAP
  design;
- a registry API; or
- target families beyond web delivery (`web-2d` and `web-3d`).

`platform` names the delivery target and the state space the designer is
responsible for, not the rendering technique. A planar game is `web-2d` even
when a builder draws it with a perspective 3D renderer; `web-3d` is for game
state that itself needs three dimensions. The renderer is the builder's fact
and belongs in the build record.

Authentic host-filesystem, save-byte, achievement, and recording integration
is also not standardized for the current web targets. Simulated versions inside
the game's fiction remain ordinary game state.

## In-scope boundaries that remain open

These are not claims that a game is unbuildable. They are places where a
package still needs game-specific prose or tests that independent tools cannot
infer from OpenGDD alone.

### Multiplayer authority and hidden information

Many rules express as deterministic state transitions, but the current core has no shared
model for session membership, network authority, delivery, reconciliation, or
private-view non-leakage. Those facilities need a future profile.

### Authored-puzzle solver interfaces

The working draft defines the `parallel-string-layers-1` grid layout and can
carry finite domains, replays, and general tests. It does not define
a shared solver adapter or predicate vocabulary. Until one exists, the
package defines its own command alphabet and predicates.

### Open-ended rule mutation

Finite, author-declared rules can be activated or replaced through Fixed
prose, declared ruleset state, and tests. Runtime creation of vocabulary or
behavior outside an author-declared finite set is not standardized.

### What a player knows or feels

Claims about knowledge, perception, belief, discovery, taste, or narrative
quality are not state predicates. A package can test operational facts such
as reachability, causal history, elimination necessity, or batch-validation
behavior. It cannot turn those facts into proof of a player's interpretation.

### Simulation below an observable envelope

Macroscopic outcomes can be specified without fixing implementation grain.
Below a declared feature width, or between declared observation times, visible
outcomes may depend on cell size, neighborhood, update order, or another
architectural choice. OpenGDD can state a bounded observable requirement and
the test that checks it, but v0.7 defines no general material-simulation
profile and does not standardize every grain or intermediate state.

### Personalized presentation

The direction file does not define how player-selected presentation, such as
a player's own colour choices, composes with the package's palette and colour
promises. Exact visual properties have an audit path only where a test and
machine-checkable evidence expose the result; prose direction remains
interpretive.

### Material feel and motion

Text, named palettes, and annotated reference imagery can communicate
decomposable features such as shape, stitches, edge treatments, and shadows.
Continuous qualities such as fiber, translucency, sheen, glisten, drip, ooze,
and deformation remain harder to transmit consistently. The direction format
has claims, annotated references, colour and timing promises, and an
experimental judged-evidence shape, but no general material-rendering
solution.

## Authoring lessons the format cannot absorb

OpenGDD cannot compensate for a package that leaves its own rules
contradictory or its evidence incomplete:

1. **Specify outcomes, not architecture.** Require the observable result and
   its evidence. Leave renderer structure and equivalent implementation
   techniques to the builder unless they are themselves part of the design.
2. **Give every test an input and a target.** A useful test identifies its
   setup, action or schedule, expected observations, tolerances, and
   diagnostics.
3. **Do not create a second authority channel.** Local fields must not silently
   redefine Fixed, Delegated, or Personalization authority.
4. **Do not restate tuning values in normative prose.** Prose binds to symbolic
   keys and formulas; literal examples are non-normative or generated from
   authoritative data.

Schema validity is only the first gate. Publication still requires semantic
review, reachable test setups, reference closure, successful replay, and
honest disclosure of claims the available evidence cannot support.

## Art direction

Art direction is optional in the v0.7 working draft. When it is used, one
`direction.json` file at the package root carries palettes, pillars, mood,
anti-references, `must_keep` requirements, measured `colors`, `contrast`, and
`timing` promises, and the package's `viewing` conditions. Colour promises use
CIEDE2000 distance, contrast promises use the
WCAG 2.1 contrast ratio, and timing promises cite a value in `tuning.json`.
Those metrics are fixed by the format rather than chosen per entry. Every
`colors`, `contrast`, and `timing` entry must be covered by at least one
acceptance test through its `direction_claims` field.

Palette and shape language transmit more exactly than continuous material
feel. Not every exact visual surface has a machine-checkable evidence path;
an exact texture with no applicable test, for example, remains a prose
requirement whose truth package validation cannot decide.

## Audio

Audio direction remains draft material in v0.7. It can be described in prose,
but this version makes no audio-direction claims and defines no audio judgment
protocol.

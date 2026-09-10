# OpenGDD

OpenGDD is an open format for game design documents. Designers write the game
in prose. Structured data supports validation, and authority levels state who
decides.

Version 0.8 is a working draft. A builder may be a person, a studio, an AI
agent, or a combination; the designer may also be the builder.

- [Read the specification](SPEC.md)
- [Start with the guide](https://opengdd.org/get-started/)
- [Look up one mechanism at a time in the handbook](https://opengdd.org/handbook/)
- [Browse the contracts catalogue](https://opengdd.org/contracts/)
- [Write a package in the browser](https://opengdd.org/authoring-tool/)
- [Schemas, the validator and how the format evolves](https://opengdd.org/about/)
- [Discuss proposals and questions](https://github.com/opengdd/core-spec/discussions)

## Repository contents

- `SPEC.md`, `CHANGELOG.md` and `CHANGELOG-TECHNICAL.md` define the current
  core draft and record its changes.
- `schema/core/v0.8/` contains the versioned JSON Schemas; earlier versions
  stay at their permanent paths.
- `conformance/` contains the validator and conformance documentation.
  `node conformance/validate.mjs <package-dir>` checks a package from source;
  `npx opengdd validate <package-dir>` runs the same validator from npm.
- `packages/npm/` is the source of the `opengdd` npm package.
- `authoring/` is the source of the authoring tool: the component, the
  workbench shell and the panels, with `PANELS.md` for panel authors.
- `docs/` is the published site, opengdd.org. Released specification text
  stays at `docs/spec/v<N>/`.
- `examples/` holds the tic-tac-toe example package and its guide.

Starphase Lab stewards the specification, the validator and the site.
`CONTRIBUTING.md` says how proposals are made and decided;
`CODE_OF_CONDUCT.md` governs participation.

## Licensing

Specification text and documentation are licensed under CC BY 4.0. Schemas,
the validator and the authoring tool source are licensed under MIT.
© 2026 Starphase Lab.

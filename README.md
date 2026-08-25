# OpenGDD

OpenGDD is an open format for game design documents. Designers write the game
in prose. Structured data supports validation, and authority levels state who
decides.

Version 0.6 is a working draft. A builder may be a person, a studio, an AI
agent, or a combination; the designer may also be the builder.

- [Read the specification](SPEC.md)
- [Start with the guide](https://opengdd.org/get-started/)
- [Look up one mechanism at a time in the handbook](https://opengdd.org/handbook/)
- [Write a package in the browser](https://opengdd.org/authoring-tool/)
- [Explore the standard and schemas](https://opengdd.org/standard/)
- [Discuss proposals and questions](https://github.com/opengdd/core-spec/discussions)

## Repository contents

- `SPEC.md` and `CHANGELOG.md` define the current core draft.
- `schema/core/v0.6/` contains the versioned JSON Schemas; earlier versions
  stay at their permanent paths.
- `conformance/` contains the validator and conformance documentation.
  `node conformance/validate.mjs <package-dir>` checks a package from source;
  `npx opengdd validate <package-dir>` runs the same validator from npm.
- `packages/npm/` is the source of the `opengdd` npm package.
- `examples/tic-tac-toe/` is the complete teaching example used by the guide.
- `docs/` is the generated source for [opengdd.org](https://opengdd.org/).

Starphase Lab stewards the specification, conformance suite, and site.

## Licensing

Specification prose and documentation are licensed under CC BY 4.0. Schemas
and validator code are licensed under MIT.

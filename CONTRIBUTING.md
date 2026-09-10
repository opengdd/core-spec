# Contributing to OpenGDD

The steward decides what enters the specification. Proposals and questions go
through [GitHub Discussions](https://github.com/opengdd/core-spec/discussions).
Accepted changes appear in the [changelog](https://opengdd.org/spec/changelog/)
with the version they land in.

Start a proposal with a real design problem and a small example that other
people can examine or reproduce. Explain how the current format handles the
problem and what the proposed change would improve. Report security issues
privately to [security@opengdd.org](mailto:security@opengdd.org).

## Check a package

The validator in this repository needs only Node.js:

```text
node conformance/validate.mjs <package-dir>
npx opengdd validate <package-dir>
```

Before a release, the steward runs further checks in a private repository: a
guard on the smallest complete package, a comparison of the validator across
its hosts, and the authoring tool's browser checks. Those checks and the
research behind the format are not in this repository. A proposal does not
need them; the validator above is enough.

## The authoring tool

The [authoring tool](https://opengdd.org/authoring-tool/) is the part of
OpenGDD most people touch first, and it is still young. Reports of anything
broken or confusing are welcome; the tool's "Report a problem" link opens a
Discussion with the tool version filled in. Pull requests against
`authoring/` are welcome too. The steward runs the tool's browser checks
before merging, so a pull request only needs to describe what it changes and
why.

## Licence for contributions

By submitting specification text, documentation, examples, schemas, or code,
you agree that the contribution may be published under the same licence that
covers that part of the project: CC-BY 4.0 for specification text and
documentation, and MIT for schemas and code.

Participation in OpenGDD spaces is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).

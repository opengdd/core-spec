# opengdd

The conformance validator for [OpenGDD](https://opengdd.org), an open
format for game design documents written in prose and structured data.

```
npx opengdd validate .
```

Validates an OpenGDD package directory against the specification's
mechanically testable requirements and reports errors and warnings,
each with the specification section it enforces. Exit code 0 means no
errors; warnings never fail a run. `--json` emits the report as one
JSON object. `validate --build <opengdd-build.json> [<spec-dir>]`
validates a build manifest instead.

No dependencies. The specification, schemas, and everything else live
at [opengdd.org](https://opengdd.org).

License: MIT. Specification prose: CC-BY 4.0.

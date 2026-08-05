---
"@memberjunction/codegen-lib": patch
---

refactor(codegen): extract `filterOutExternalSchemaEntities` so the external-schema rule has one home.

`runCodeGen.runFileGenerationPhase` built `localNonCoreEntities` inline from
`getExternalEntitySchemas()`. That filter is the only thing stopping a host from emitting duplicate
entity subclasses and duplicate GraphQL ObjectTypes for an installed Open App's schema — and
duplicate ObjectTypes make graphql-js reject the unified schema at boot, so the API crash-loops.

Being inline, it could only be regression-tested by reimplementing it in the test, which pins a copy
that drifts rather than the production rule. It now lives in `Config/config.ts` as an exported
function that `runCodeGen` calls and tests exercise directly. Behavior is unchanged; the null case
(a plain-string `entityPackageName`) still returns the input untouched.

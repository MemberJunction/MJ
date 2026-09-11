---
'@memberjunction/integration-test-suite': patch
'@memberjunction/testing-integration': patch
---

Stop `rigs/lib/harness.ts` forwarding two symbols the framework package does not export.

The shim re-exported `createRunQueryFixtures` and `teardownRunQueryFixtures` from
`@memberjunction/testing-integration`. They are defined in `@memberjunction/integration-test-suite`
(`src/checks/runquery-cache.checks.ts`) — the framework package ships content-free by design — so
the module threw `SyntaxError: The requested module '@memberjunction/testing-integration' does not
provide an export named 'createRunQueryFixtures'` at load, taking down every rig that imports the
shim before a single assertion ran. That is the nightly `Cross-server invalidation rig` failure,
plus five hand-run `ps-live-*` rigs.

Nothing consumed either symbol through the shim, and forwarding them contradicted the file's own
stated rule ("Every symbol forwarded here is DEFINED in `@memberjunction/testing-integration`"), so
they are removed rather than re-pointed. All 23 remaining forwarded symbols resolve against the
package's 90 exports.

Also removes the dangling comment in `testing-integration/src/index.ts` that still described the
removed re-exports — that sentence is why a consumer went on importing a symbol that had moved.

---
"@memberjunction/cli": patch
---

Fix TS4111 in the Open App client manifest so MJExplorer can build when Open Apps are present

`mj codegen manifest --open-app-client-bootstrap` emitted its `globalThis` anchor using dot
access on a property that comes from an index signature (`globalThis` is cast to
`Record<string, unknown>`). Consumers compile that generated file under their own tsconfig, and
MJExplorer sets `noPropertyAccessFromIndexSignature: true` — so the generated manifest failed to
type-check and the Explorer build exited 1 having emitted zero JS. `ng serve` printed
"Watch mode enabled" after the error and then served nothing, which made it easy to misread as a
working dev server.

The anchor now uses bracket access. Runtime behavior is unchanged — JavaScript draws no
distinction between dot- and bracket-written properties — and bracket access is valid under every
strictness configuration, so no consumer is made worse.

This affected any installation with at least one Open App in `dynamicPackages.client`, whether
installed via `mj app install` or dev-linked. MJ core has none, which is why its CI never
generated the line and never type-checked it.

The regression escaped because the generator's test asserted the emitted *string* — it passed
precisely because the text matched, while that text did not compile in the consumer. The test
now type-checks the generated output under `noPropertyAccessFromIndexSignature` instead, so a
type error in generated code fails here rather than in a downstream build.

---
"@memberjunction/server": patch
---

Allowlist two legitimate global-provider references that were tripping the MultiProviderCompliance guard and holding `next` red. Comment-only change (no runtime or type impact): `context.ts`'s read-only-provider bootstrap pool-share (a verbatim twin of the already-blessed line at 746) and the `lists-tests.ts` integration-test harness now carry the documented `// global-provider-ok: <reason>` inline marker instead of being refactored — both are genuine single-provider/bootstrap uses, not per-provider request paths.

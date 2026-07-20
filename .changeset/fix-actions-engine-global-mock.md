---
"@memberjunction/actions": patch
"@memberjunction/ai-vector-sync": patch
---

Fix the broken unit tests on `next` caused by `vi.mock('@memberjunction/global')` factories that don't expose `RequiresSubclass`. The module graphs under test now declare `@RequiresSubclass()`, so a mock omitting it throws `No "RequiresSubclass" export is defined on the mock` at module init.

This covers the **complete** set of currently-failing suites (verified by a full `turbo run test` — exactly these two packages fail on this gap): `@memberjunction/actions` (`ActionEngine` / `EntityActionEngine` tests) and `@memberjunction/ai-vector-sync` (`entityDocumentConfig` test). Added the missing no-op decorator to each. Test-only change.

Note: ~200 other test files also mock `@memberjunction/global` without listing `RequiresSubclass`, but they pass today — their module-under-test never imports a `@RequiresSubclass()`-decorated class (or they spread the real module). Those are latent, not failing, and are intentionally left untouched to keep this fix reviewable; a shared-mock refactor to kill the latent class is a separate cleanup.

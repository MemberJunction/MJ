---
"@memberjunction/actions": patch
---

Fix a broken unit test on `next`: the `vi.mock('@memberjunction/global')` factories in the ActionEngine / EntityActionEngine tests didn't expose `RequiresSubclass`, so the ActionEngine module graph (which now declares `@RequiresSubclass()`) threw `No "RequiresSubclass" export is defined on the mock` at module init, failing `@memberjunction/actions#test`. Added the missing no-op decorator to both mock factories. Test-only change.

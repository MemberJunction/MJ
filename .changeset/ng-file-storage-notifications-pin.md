---
"@memberjunction/ng-file-storage": patch
---

Correct the `@memberjunction/ng-notifications` pin from `5.51.0` to `6.0.0`.

The workspace package is at `6.0.0`, so a `5.51.0` spec does not match the local sibling and npm
resolves the **published** 5.51.0 from the registry instead of linking it. The pin dates from a
pre-6.0 branch state that was carried forward during the UI-layering sweep.

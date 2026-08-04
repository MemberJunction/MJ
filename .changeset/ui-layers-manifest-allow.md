---
'@memberjunction/standards': patch
'@memberjunction/ng-file-storage': patch
---

Fix two `ui-layers` failures that made the `adopted standards` gate and `@memberjunction/global#test` red on `next`.

The `widgets` layer forbids the zero-argument `new Metadata()`, and the checker holds that rule as a regex literal in its own source. `MultiProviderCompliance` scans the repo for the same construct and matched the literal, so the checker failed the standard it defines. The line now carries a `global-provider-ok` marker naming it as a pattern definition rather than a call site.

`ui-layers` bans a forbidden dependency in two places — the import in source, and the entry in `package.json` — but only the source half could be suppressed, because `mj-ui-layers-allow` is a comment and JSON has no comments. `ng-file-storage` had allow-marked its `BaseResourceComponent` import as debt tracked in MJ#3404, yet the manifest half kept failing with no way to express the same exception. `checkPackage` now honors an `mjUILayerAllowedDeps` array in the manifest, and `ng-file-storage` declares the one dependency its allow-marked import requires. The exception is scoped to that dependency; every other forbidden dep in the package still fails.

No change to what either layer forbids.

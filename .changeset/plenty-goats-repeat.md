---
"@memberjunction/cli": patch
---

Fix Open App client packages being tree-shaken out of production MJExplorer builds. `mj codegen manifest --open-app-client-bootstrap` emitted bare side-effect imports (`import '<pkg>';`), which bundlers legally drop when the imported package declares `"sideEffects": false` — the default for any Angular library built with ng-packagr. The package's module-scope `@RegisterClass(...)` calls then never ran, so its resource/view components were silently absent from the build with no error. The block now emits referenced namespace imports collected into an exported `OPEN_APP_CLIENT_MODULES` array, anchored by a `globalThis` assignment so the reference survives dead-code elimination regardless of how the host app consumes the manifest. Disabled entries, idempotency, and stale-block replacement are unchanged.

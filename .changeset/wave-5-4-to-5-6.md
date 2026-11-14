---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/integration-test-suite": patch
---

Waves 5.4, 5.5, and 5.6 performance & bundle-splitting improvements:
- **Wave 5.4**: Lazy `EntityInfo.Fields` / `EntityFieldInfo` instantiation on first field access, native structured-clone IndexedDB metadata caching in `ProviderBase` / `BrowserIndexedDBStorageProvider`, and `IT128 PB20` hydration benchmarks.
- **Wave 5.5**: Added `@memberjunction/ng-bootstrap/types` secondary entry point to decouple `ng-explorer-app` from eager dashboard registrations, switched `MarkdownArtifactViewerComponent` to `ChangeDetectionStrategy.OnPush`, and extended `check-browser-manifest-leakage.mjs` with bundle-splitting regression guards.
- **Wave 5.6**: Added `@memberjunction/ng-auth-services/preload` lightweight entry point for `MJExplorer/src/main.ts` and decoupled `@memberjunction/core-entities/schemas` Zod schemas from entity classes (with CodeGen support).

---
"@memberjunction/global": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/core-entities": patch
"@memberjunction/integration-engine-base": patch
"@memberjunction/api-keys-base": patch
---

Wave 4.2b: True lazy modules, deferred browser engines, and ClassFactory minification safety.

- `@memberjunction/global`: Add minification-safe class name stamping via `MJ_CLASS_NAME_SYMBOL`, `StampClassName`, and `RegisterClassEx({ className, baseClassName })`, and add `IsBrowser()` to detect browser vs. non-browser runtimes. Ensure reflection and ClassFactory lookup methods use `GetClassName` with own-property symbol and string checks rather than mangled `.name` properties.
- `@memberjunction/ng-explorer-core`: Sever static import of `FileStorageModule` from `ExplorerCoreModule` imports array so it loads lazily on demand via dynamic import configuration.
- `@memberjunction/ai-engine-base`, `@memberjunction/core-entities`, `@memberjunction/integration-engine-base`, `@memberjunction/api-keys-base`: Defer non-shell browser startup for `AIEngineBase`, `QueryEngine`, `IntegrationEngineBase`, `SearchEngineBase`, `APIKeysEngineBase`, and `EncryptionEngineBase` via `@RegisterForStartup({ deferred: IsBrowser() })`.

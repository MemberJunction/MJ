# @memberjunction/auth-providers

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0

## 5.42.0

### Minor Changes

- 9b9b484: Field active-status enforcement relocation, plus the "Meet" app rename, quieter operational logging, and a telemetry suppression refinement.

  **Field active-status enforcement (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**
  - Deprecated-field warnings and disabled-field exceptions are now enforced at the field-access boundary genuine code flows through — `BaseEntity.Get()`, `Set()`, and `SetMany()` (what the generated strongly-typed accessors call) — instead of on the low-level `EntityField.Value` accessor. This flips a leaky blocklist (assert on every `.Value` touch, then suppress at each internal call site) into a precise allowlist, and fixes false deprecation warnings emitted on every load/save of a record that merely _contains_ a deprecated column (e.g. `"MJ: AI Agent Runs".AgentState`) even when no code uses it.
  - New memoized `EntityInfo.HasInactiveFields` fast-path gate: entities whose fields are all `Active` (the vast majority) pay only a single cached boolean check in the hot read/write paths.
  - `EntityField.ActiveStatusAssertions` is retained as a `@deprecated` no-op for backward compatibility; the six now-redundant internal suppression toggles were removed. Warning caller strings are now accurate (`BaseEntity.Get`/`Set`) instead of the misleading `"EntityField.Value setter"`.

  **Telemetry (`@memberjunction/core`)**
  - Suppress "load this into a dedicated engine cache" telemetry suggestions for entities that have explicitly opted out of caching (`EntityInfo.AllowCaching = false`), reusing the existing flag as the single source of truth.

  **Quieter operational logging (`@memberjunction/scheduling-engine`, `@memberjunction/ai-agents`, `@memberjunction/server`, `@memberjunction/server-bootstrap`, `@memberjunction/server-bootstrap-lite`)**
  - Scheduled-job no-op runs (e.g. the Agent Memory Manager finding no new activity) now collapse to the engine's `Starting`/`Completed` heartbeat; the per-agent and memory-manager internal traces are verbose-only.
  - Cleaner server startup logging: transient boot spinner, true total timing, less redundant output, and the `CustomColumnPromoter` registration log demoted to verbose-only.

  **"Meet" app + local LiveKit dev (`@memberjunction/ng-explorer-core`, `@memberjunction/livekit-room-server`, `@memberjunction/auth-providers`, `@memberjunction/server`)**
  - Renamed the Realtime app to "Meet", with the Live Room now defaulting to the Realtime co-agent instead of starting with no agent, plus a local LiveKit dev server and supporting docs.

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Minor Changes

- 43e6c0f: MJ-issued magic-link sessions for external, app-scoped users: passwordless, single-use (or multi-use) invite links that sign external users into MJExplorer confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth-provider path), so there's no external IdP dependency or per-user IdP cost. Invite scope (app, role, expiry, max uses) is configured per link, with support for per-invite app/role, resource-scoped RLS sharing, and anonymous sessions — a shared Anonymous principal whose scope rides per-session JWT claims rather than DB roles, so concurrent anonymous visitors can't accrete privileges.

  Also includes two framework changes made along the way:
  - **RunView server-cache RLS fix:** the cache fingerprint now incorporates the per-user Row-Level-Security where-clause, so an RLS-scoped read can no longer be served an unscoped cached result. No-op for users without an RLS filter (byte-identical fingerprint), so normal caching is untouched.
  - **BaseEngine degrades gracefully under restricted roles:** a config load that fails because the current user lacks Read permission is now treated as a permanent condition — the property loads empty and the engine is marked loaded — instead of looping on "not marking as loaded", which previously hung the MJExplorer shell for least-privilege users (e.g. magic-link guests). Only genuinely transient failures (network, server restart) keep retrying.

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/global@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/global@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/core@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/global@5.16.0

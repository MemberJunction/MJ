---
'@memberjunction/global': patch
'@memberjunction/core': patch
'@memberjunction/core-entities': patch
---

Explicit ClassFactory resolution failure + permission provider fault isolation (B34/B35)

`ClassFactory.CreateInstance` has never returned `null` for an unregistered key — it falls back to
instantiating the anchor base class — so every call site written as `if (instance) { use } else { error }`
had a dead failure branch and silently installed a hollow base-class object.

- **`@memberjunction/global`**: adds `TryCreateInstance` / `TryCreateInstanceAsync`, which return an
  explicit `ClassResolutionResult<T>` (`Resolved` / `Instance` / `Reason`). Bases that cannot function
  standalone opt in with `static readonly RequiresSubclass = true`: on a fallback they now throw from
  `CreateInstance` and return `{Resolved: false, Instance: null}` from `TryCreateInstance`. Bases without
  the marker keep the historical base-class fallback (e.g. `BaseEntity`) and emit a structured, once-per-key
  warning listing the registered keys for that base plus the call-site stack. `CreateInstance`,
  `CreateInstanceAsync`, and the `Try*` variants all route through one shared resolution path.
- **`@memberjunction/core`**: `PermissionProviderBase` declares `RequiresSubclass = true` — every member is
  abstract, so a base instance is a method-less stub.
- **`@memberjunction/core-entities`**: `PermissionEngine.instantiateProviders` uses `TryCreateInstance`, so
  an unresolvable `ProviderClassName` is now genuinely skipped instead of installing a stub as a live
  provider. The `GetAllUserPermissions` / `GetPermissionsGrantedByUser` / `GetPermissionsSharedWithUser`
  fan-outs defer each provider call into a promise body so a SYNCHRONOUS throw (a missing method) is
  isolated by `Promise.allSettled` instead of rejecting the entire aggregate for every user.

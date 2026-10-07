---
"@memberjunction/global": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-entity-permissions": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-flow-editor": patch
---

`@memberjunction/global` gains set-based UUID helpers, so matching one list against another no longer means a nested `UUIDsEqual` scan (#4719).

- **Collections:** `UUIDSet` and `UUIDMap` normalize on every insert and lookup, so upper-case and lower-case IDs match without anyone having to remember `NormalizeUUID` on both sides.
- **Helpers:** `FilterByUUIDs`, `ExcludeByUUIDs`, `CountByUUID` and `IndexByUUID` cover keeping matches, dropping matches, counting per ID and looking up by ID in one linear pass. Each takes an optional ID selector.
- **Faster `UUIDsEqual`:** it now compares without allocating. It produces exactly the old result, falling back to the old path for non-ASCII input.
- **New guard:** the UUID compliance scan fails on new nested `UUIDsEqual` scans. The check is AST-based, and a per-file baseline records the sites that predate it.
- **Adopted:** the sites fixed in #4716 now use the helpers.
- **Guide:** `guides/UUID_COMPARISON_GUIDE.md` Patterns 5 and 8 are rewritten around the new API.

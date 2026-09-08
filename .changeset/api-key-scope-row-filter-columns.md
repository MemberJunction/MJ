---
"@memberjunction/api-keys-base": minor
"@memberjunction/api-keys": minor
---

Add `RowFilterID` to `APIKeyScope` and `APIApplicationScope` — the schema for API-key-scoped row filters. Both columns are nullable FKs to the existing `RowLevelSecurityFilter` catalog used by role-based RLS; `NULL` is the current behavior, so this release is purely additive. The FK makes a filter undeletable while a live key references it, so a key cannot be silently un-filtered by deleting its filter record.

Enforcement is not in this release — it lands with the implementation described in `plans/api-key-row-filters.md` (key filters evaluated outside the role-RLS exemption, AND-composed with role RLS and the application ceiling, `full_access` + row filter rejected as an invalid configuration, and RLS-bypassing read scopes denied to filtered keys).

---
'@memberjunction/integration-engine-base': patch
'@memberjunction/integration-engine': patch
---

Index integration-object fields, and memoise the per-record field view.

`GetIntegrationObjectFields(objectID)` was `this._integrationObjectFields.filter(f => UUIDsEqual(f.IntegrationObjectID, objectID))` — a full scan of every `IntegrationObjectField` in the process, on a path that runs **per record**: a connector's `RawToExternalRecord`/`TransformRecord` resolves an object's fields for every record it transforms. On a catalog of 364 objects, that scan plus the generated `IntegrationObjectID` getter it invokes per element measured **~46% of process CPU** in a live profile.

It is now backed by a lazily-built `objectID → fields` index, keyed on the **identity** of `_integrationObjectFields`. The engine replaces that array wholesale on load/refresh (and `SeedForTesting` replaces it directly), so a new array is a new index automatically — there is no invalidation hook to forget. Keys are normalised the same way `UUIDsEqual` compares, so SQL Server's uppercase and PostgreSQL's lowercase land on the same bucket, and the `objectID == null` case keeps the original both-null-matches semantics via the unindexed path rather than inventing a magic key. Callers still receive a fresh array per call, so sorting or splicing the result behaves exactly as before.

Also adds `RefreshCatalog()`, which re-reads **only** the `IntegrationObject`/`IntegrationObjectField` datasets straight from the database. `RefreshItem` will not do: it reloads through the local dataset cache, which is the very thing that goes stale when the catalog is edited by direct SQL, a sproc-based sync push, or another process — `BaseEngine`'s auto-refresh only observes in-process `BaseEntity` saves. Replacing the arrays is also what invalidates the memoised views, since both the field index and the connectors' `GetCachedFields` memo key on array identity.

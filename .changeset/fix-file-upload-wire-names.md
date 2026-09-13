---
'@memberjunction/ng-file-storage': patch
---

Stop requesting GraphQL wire aliases as entity field names in the file-upload path.

The upload requested `_mj__CreatedAt` / `_mj__UpdatedAt`. GraphQL reserves the `__`
prefix, so MJ exposes its `__mj_*` columns under a `_mj__*` alias — but that alias is
the **wire** name, not an entity field name. The response goes straight to
`LoadFromData()`, where `SetMany` rejects the unknown keys. Nothing consumed the
timestamps anyway, so they are simply no longer requested.

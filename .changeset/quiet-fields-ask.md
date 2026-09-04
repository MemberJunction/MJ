---
"@memberjunction/core": patch
---

Add `BaseEntity.FieldIsDirty(name, ...more)` — boolean form of `GetFieldByName(name)?.Dirty === true`, with extra names OR'd — so call sites do not repeat the optional-chain.

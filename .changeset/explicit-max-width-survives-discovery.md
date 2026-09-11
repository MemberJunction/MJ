---
'@memberjunction/integration-engine': patch
'@memberjunction/integration-schema-builder': patch
---

An explicit MAX width (`-1`) survives discovery instead of being silently narrowed.

`-1` is the unbounded convention both dialects already speak — `sqlServerDialect` renders `len === -1` as `NVARCHAR(MAX)` and `postgresqlDialect` as `TEXT`. So it is the WIDEST width available, but two places ranked it as the narrowest:

- `decideLengthOverlay` compared numerically, so `decideLengthOverlay(-1, 4000)` returned `4000` — any sampled width beat MAX. An operator who widened a column to unbounded because real values exceed every bounded width had it narrowed again on the next discovery.
- `TypeMapper` routed `-1` through the `string` modality, where `resolveStringType`'s `maxLength > 0` test is false and the fallback is `NVARCHAR(255)` — the narrowest possible column for a field explicitly asked to be the widest.

The consequence is worse than truncation: records too long for the re-narrowed column are **skipped whole**, so the data simply stops arriving with no error on the row.

`decideLengthOverlay` now treats `-1` as the widest on both sides — a persisted MAX is never narrowed, and a source that reports unbounded upgrades a finite persisted width, consistent with the existing grow-only rule. `TypeMapper` resolves an unbounded width through the `text` modality, which each dialect already maps to its own unbounded type. A primary key is clamped to the dialect's key ceiling instead, since MAX is not indexable — a special case rather than a comparison, because `Math.min` would return `-1` here.

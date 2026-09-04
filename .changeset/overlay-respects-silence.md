---
"@memberjunction/integration-engine": patch
---

Type and nullability overlays now respect a silent source, like every other attribute already does.

The per-attribute rule in this file is that discovered metadata wins where the source states
something and the declaration fills the silence. Descriptions, booleans and lengths all follow it.
`Type` and `AllowsNull` did not:

- `MapSourceType` answers every input, including `''` and `undefined`, because its fallback has to
  produce something for a genuinely unknown column. The caller used that answer either way, so a
  describe with no type opinion rewrote a curated `datetimeoffset` or `bit` to `nvarchar` — and a
  declared `nvarchar(MAX)` to a bounded `nvarchar`, which drops records at sync time.
- `AllowsNull ?? !IsRequired` computed `true` when the source stated neither, because `!undefined` is
  `true` — so a describe with no opinion silently turned a declared NOT NULL column optional.

Types are hard constraints backed by real DDL, so a wrong one is a migration rather than a cosmetic
drift. `decideTypeOverlay` and `decideNullabilityOverlay` now make both decisions explicitly, in the
same shape as `decideBooleanOverlay`. A source that states something still wins; `IsRequired` still
derives nullability, since that is a statement made indirectly; and a field with no declaration still
takes the mapped value, fallback included, because there is nothing curated to protect.

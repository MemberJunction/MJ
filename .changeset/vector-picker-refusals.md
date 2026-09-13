---
"@memberjunction/ng-dashboards": patch
---

Knowledge Hub Vectors tab: the field picker refuses to embed sensitive columns, and four save-path corrections.

**Sensitive-field refusal.** Vectorizing a column copies its values into a vector index, where they live outside the entity permissions that guard them and are retrievable by similarity search rather than by an authorized query, and are not fully reversible once written. The field suggestions come from a language model, which has no notion of which columns are sensitive. Two layers: the field list handed to the prompt is filtered, and the saved template is re-checked because it stays hand-editable after the model returns. The refusal names the offending fields and runs before anything is written.

**The use case now decides the document type.** The dialog offers duplicate detection, search and classification, but the save path hardcoded the `Record Duplicate` type — so choosing "search" silently wrote a duplicate-detection document. Since vector pools are typed (`Provider.SearchEntity` reads `Search`-typed documents), that document was also invisible to the feature that wanted it. The type is now resolved from the selection; when the wanted type is absent the refusal names it and lists the types that do exist, rather than substituting one.

`classification` resolves to a `Classification` type that MJ does not currently seed, so that use case now fails with a message naming the missing type instead of quietly producing the wrong one.

**Interpolated fields are bounded.** The model's field list arrived with no cap and no filter. An over-long list is truncated with the count shown, and a template interpolating more than 24 distinct fields is refused before any write. The bound comes from the suggestion prompt's own contract — 1-4 natural language sentences — and sits three times clear of the richest example the prompt demonstrates.

**A retry no longer duplicates metadata.** Template, Template Content and Entity Document were all created unconditionally, and only the last is protected by a unique index — so a second attempt with the same name failed at the final step after re-writing the first two, leaving a pair of orphans per retry. All three are now found-or-created. An existing Entity Document is adopted only when this dialog created it; a name collision with a document authored elsewhere is refused rather than overwritten.

**The entity picker no longer offers MemberJunction's own internals.** It listed every entity in metadata, so the ~378 `__mj` framework entities were offered as vectorization targets alongside the user's business tables. They are now excluded, following the existing `FRONTEND_BLOCKED_SCHEMAS` precedent.

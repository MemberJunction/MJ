---
"@memberjunction/core": minor
---

De-duplicate the IdentityClaim `EntityRelationship` rows that `V202609091200__v6.1.x__IdentityClaim_Metadata_Tail.sql` can insert twice on a developer database.

That migration guards its four inserts on primary key. The ids it checks are the ones its authoring CodeGen run generated — but the premise of the gap it fixes is that these rows already exist on every developer database under *locally generated* ids. There the guard finds nothing, does not fire, and inserts a second row. No unique constraint covers the natural key, so the duplicate is silent; its visible effect is a doubled related-entity tab on the four affected forms.

Forward-only cleanup keyed on `(EntityID, RelatedEntityID, RelatedEntityJoinField)`, keeping the earliest row. A fresh database has nothing to remove, so it is a no-op there.

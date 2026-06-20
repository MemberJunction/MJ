---
'@memberjunction/core': patch
---

Shape the external-schema introspection contract to include relationships (foreign keys).

`ExternalSchemaObject` gains an optional, additive `relationships?: ExternalSchemaRelationship[]` — referencing-side foreign-key descriptors with composite-key support via `ExternalSchemaRelationshipColumn` (column → referencedColumn pairings, plus `referencedObject` / `referencedSchema` / optional constraint `name`). This establishes the architecture-correct seam now; drivers populate it incrementally as per-provider relationship introspection lands (relational sources expose FK metadata via `INFORMATION_SCHEMA`), and DBAutoDoc may further enrich it. An absent or empty array means "relationships not yet discovered", NOT "this object has no relationships" — so no existing driver or consumer changes and nothing breaks.

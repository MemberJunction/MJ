---
"@memberjunction/integration-engine": patch
---

Column deactivation now requires a source that DECLARED its field list complete.

A source describes its objects in one of three shapes, and only it knows which: it names no columns
at all, it returns only the account's CUSTOM columns, or it returns the full mapping. Only the third
can prove a column is gone.

That distinction was inferred from "the discovered field list came back non-empty", which cannot
tell the second shape from the third. A source returning only custom columns therefore looked
complete, and every standard column it did not restate became a deactivation candidate on a
comprehensive refresh.

`SourceObjectInfo` gains `FieldsAreAuthoritative`, and `decideAbsentDeactivations` deactivates
columns only for objects that declared it `true`. An object that declares nothing is left alone —
absence of evidence is not evidence of absence, the same rule the primary-key search already
follows. Object-level deactivation is unchanged.

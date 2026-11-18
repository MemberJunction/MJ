---
"@memberjunction/content-autotagging": minor
"@memberjunction/core-entities": minor
---

Content vector metadata: a field can be written under its own key, and added to the curated default. `VectorMetadata.Fields[<field>].MetadataKey` writes the field under another metadata key (for example `Date` as `ContentDate`, with `StoreAs: 'epochSeconds'`); the keys that identify a vector's record (`Entity`, `RecordID`, `ContentItemID`, `Sequence`) are refused, logged, and the field left out. Under the curated default (no `FieldStrategy`), fields marked `Included: true` are now added to the curated set, so a source can keep it and add a field without listing every other one; a curated default with no field marked `Included` is unchanged.

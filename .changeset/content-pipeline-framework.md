---
"@memberjunction/content-pipeline-base": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/core-entities": minor
---

Add the content pipeline framework: a generic processor that runs registered stages over Content
Sources, Items and Chunks through Record Set Processing's new `Pipeline Stage` work type.

One `WorkingRecord` passes from stage to stage, carrying each well-known field with a confidence
score and the stage that set it, so two stages that know nothing about each other resolve a shared
field on merit rather than by running order. Only hydrate and commit touch the database, which is
what makes a test run the same code with commits withheld.

Ships Discover, Extract, Tag, Segment, Embed and Delete, plus registered driver contracts for
readers, Discover drivers, classifiers, vector writers and durable-copy stores — all resolved by
name through the class factory, so adding one never means editing a list.

Schema (all additive, on `__mj`): `FieldConfidence` on Content Source / Item / Chunk;
`ExtractionStatus`, `SegmentationStatus`, `DeleteStatus`, `ExtractorKey`, `ExtractorKeyOverride`,
`Modality`, `Date`, `Decorator` and `FileID` on Content Item; `Decorator` on Content Item Chunk;
`DiscoveryStatus`, `LastDiscoveredAt`, `ExtractorKey` and `MultiModalEnabled` on Content Source;
`ExtractorKey` on Content Type; `SupportsMultiModal` on Content Source Type; `'Pipeline Stage'` on
the Record Process `WorkType` CHECK constraint; and `'MetadataOnly'` on the Content Item
`EmbeddingStatus` CHECK constraint.

---
"@memberjunction/content-pipeline-base": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/document-parsing": minor
"@memberjunction/record-set-processor-base": minor
"@memberjunction/record-set-processor": minor
"@memberjunction/content-autotagging": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/ng-core-entity-forms": minor
---

Add the content pipeline framework: a generic processor that runs registered stages over Content
Sources, Items and Chunks through Record Set Processing's new `Pipeline Stage` work type.

One `WorkingRecord` passes from stage to stage, carrying each well-known field with a confidence
score and the stage that set it, so two stages that know nothing about each other resolve a shared
field on merit rather than by running order. Only hydrate and commit touch the database, which is
what makes a test run the same code with commits withheld. Re-discovery turns on the item's
checksum: an unchanged walk is a genuine no-op, and a changed one clears the field confidence so
every later stage reconsiders the record from scratch.

Stages orchestrate MemberJunction's existing machinery rather than paralleling it. Embed resolves
its vector index, database, embedding model and dimensions from `MJ: Vector Indexes` and the
Content Source's own cascade, then drives the registered `VectorDBBase` provider directly — so
every provider MJ ships is usable, namespace routing comes from the provider, and the vector id it
writes back is what later makes the vector deletable. Durable copies go to MJ Files against a
configured File Storage Account; bytes never land in this database. Segmenting goes through
`ai-segmentation` and reads the `SegmenterKey` cascade. Tagging runs MJ's managed Content
Autotagging prompt and persists through the governed taxonomy into `MJ: Content Item Tags`.

Where MJ has no existing registry, a driver contract remains: Access (opening a session against a
source, with credentials from `MJ: Credentials` and sessions cached per source and role), Discover
(walking a source) and content Extractors. The walks for the five shipped Content Source Types are
lifted out of the autotagger so there is one implementation with two consumers, registered under
the `DriverClass` each type already names.

`@memberjunction/document-parsing` is new: one implementation of PDF, Word and spreadsheet parsing,
shared by the Core Actions that expose file content and by the pipeline's extractors.

Record Set Processing gains a way for a work type to pair a tracker with its processor, so a run
records the same thing whether it was triggered on demand, on change or by the scheduler.

Schema (all additive, on `__mj`): `FieldConfidence` on Content Source / Item / Chunk;
`ExtractionStatus`, `SegmentationStatus`, `DeleteStatus`, `ExtractorKey`, `ExtractorKeyOverride`,
`Modality`, `Date`, `Decorator` and `FileID` on Content Item; `Decorator` on Content Item Chunk;
`ForceDiscovery` and `LastDiscoveredAt` on Content Source; `ExtractorKey` and
`StructuralSignature` on Content Type; `ByteSignature`, `IsText` and `ExtractorKey` on Content File
Type; a unique index on (ContentSourceID, URL); `'Pipeline Stage'` on the Record Process `WorkType`
CHECK constraint; and `'MetadataOnly'` on both `EmbeddingStatus` CHECK constraints.

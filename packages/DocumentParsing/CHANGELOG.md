# @memberjunction/document-parsing

## 6.2.0-edge.6

### Minor Changes

- 1090caa: Add the content pipeline framework: Discover, Extract, Tag, Segment, Embed and Delete stages that run over
  Content Sources, Items and Chunks through Record Set Processing's new `Pipeline Stage` work type. One
  working record passes between stages, each well-known field carrying a confidence score so stages resolve
  a shared field on merit. Only the hydrator and committer touch the database, so a test run is the same
  code with commits withheld.

  The stages reuse what MJ already has. Discover and Extract call the Content Source Type's existing driver
  (new optional `Discover` and `Fetch` on `AutotagBase`); file-type detection reads `MJ: Content File Types`
  (new `ByteSignature`, `IsText`, `ExtractorKey` columns, seeded in metadata); durable copies go through
  `FileStorageEngine.UploadFile`; Tag, Embed and Delete share the autotagger's prompt helpers and its new
  `ContentVectorInfrastructure`, which also routes a source or content type that names only a `VectorIndexID`
  (with no `EmbeddingModelID`) to that index using the index's own `EmbeddingModelID`. Document parsing moves
  into `@memberjunction/document-parsing`, used by Get File Content (which now trims extracted PDF and Word
  text) and the pipeline. Record Set Processing gains a per-work-type tracker pairing, so scheduled and
  on-change runs record the same detail rows as manual ones. Additionally, `AutotagLocalFileSystem` skips
  symbolic links and recurses into subfolders during tagging; `AutotagCloudStorage` normalizes extensions
  written with or without a leading dot and prefers the provider's first configured `MJ: File Storage Accounts`
  row over environment variables; `NormalizeAutotagKeywords` in `@memberjunction/content-autotagging` drops blank
  tag names; and `ContentItemTagBridge` in `@memberjunction/tag-engine` delegates `MJ: Tagged Items` creation to
  `TagEngine.CreateTaggedItem` (updating the stored weight on re-tagging).

---
"@memberjunction/content-pipeline": minor
---

Content pipeline: a changed decorator re-segments the item. Segment copies an item's `Decorator` onto every chunk and Embed embeds it in front of the chunk's text, but the committer treated a new decorator like any other metadata and only promoted the item to `MetadataOnly`, which refreshes vector metadata and leaves the old decorator in every chunk and vector. A commit that changes an item's `Decorator` (Extract, or Discover finding an existing item again) now sets `SegmentationStatus` and `EmbeddingStatus` back to `Pending`: Segment cuts new chunks that carry the new decorator, the old ones are retired for the Delete stage, and Embed embeds the new ones. Extraction, tagging and the content `Checksum` are untouched, and other metadata changes still refresh only the vector metadata. A chunk whose own decorator changes is embedded again in full.

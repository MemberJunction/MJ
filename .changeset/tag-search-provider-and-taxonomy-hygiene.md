---
"@memberjunction/search-engine": minor
---

Introduce `TagSearchProvider` and exclude administrative taxonomy entities from user search.

- Excludes administrative taxonomy entities (`MJ: Tags`, `MJ: Tagged Items`, `MJ: Tag Synonyms`, `MJ: Tag Scopes`, `MJ: Tag Co-Occurrences`) from direct user search by setting `AllowUserSearchAPI = 0` and `AutoUpdateAllowUserSearchAPI = 0`.
- Adds `TagSearchProvider` registered under driver class `TagSearchProvider` (SourceType: `tag`, Priority: 3), which matches queries against the taxonomy graph (tags and synonyms) using `TagEngineBase` and retrieves the associated records from `MJ: Tagged Items` and `MJ: Content Item Tags`.
- Weights retrieved records by multiplying the tag match confidence (0.0 to 1.0) by the tagged item's continuous relevance weight (`TaggedItem.Weight`), surfacing records tagged with a query concept even when the query term does not appear literally in the entity record's text fields.
- Deduplicates multi-tag matches on the same record (highest score wins) and blends tag candidates with other search sources (vector, full-text, entity LIKE) via Reciprocal Rank Fusion (RRF).

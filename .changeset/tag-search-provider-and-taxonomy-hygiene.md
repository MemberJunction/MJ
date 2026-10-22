---
"@memberjunction/search-engine": minor
"@memberjunction/generic-database-provider": patch
---

Introduce `TagSearchProvider`, fix search engine zombie leaks, exclude administrative entities from user search, and promote entity-sourced content items.

- **Tag Search Provider**:
  - Adds `TagSearchProvider` registered under driver class `TagSearchProvider` (SourceType: `tag`, Priority: 3), which matches queries against the taxonomy graph (tags and synonyms) using `TagEngineBase` and retrieves the associated records from `MJ: Tagged Items` and `MJ: Content Item Tags`.
  - Weights retrieved records by multiplying the tag match confidence (0.0 to 1.0) by the tagged item's continuous relevance weight (`TaggedItem.Weight`), surfacing records tagged with a query concept even when the query term does not appear literally in the entity record's text fields.
  - Deduplicates multi-tag matches on the same record (highest score wins) and blends tag candidates with other search sources (vector, full-text, entity LIKE) via Reciprocal Rank Fusion (RRF).

- **Search Engine Safeguards & 15% Zombie Leak Fix**:
  - In `GenericDatabaseProvider.createViewUserSearchSQL`, returns `'(1=0)'` when a search string is provided but no searchable fields exist (or all are non-text/restricted), preventing unconstrained `SELECT TOP N` queries with no `WHERE` clause.
  - In `EntitySearchProvider.convertResults`, drops records where `matchedFields === 0`, eliminating the 15% base floor score leak on non-matching rows.
  - In `metadata/entities/.entity-search-exclusions.json`, sets `AllowUserSearchAPI = 0` and `AutoUpdateAllowUserSearchAPI = 0` for taxonomy entities (`MJ: Tags`, `MJ: Tagged Items`, `MJ: Tag Synonyms`, `MJ: Tag Scopes`, `MJ: Tag Co Occurrences`), `MJ: Content Items`, and 13 internal/zombie entities (`MJ: Magic Link Invites`, `MJ: Magic Link Invite Allowed Domains`, `MJ: Magic Link Invite Allowed Paths`, `MJ: Magic Link Invite Applications`, `MJ: Magic Link Invite Roles`, `MJ: Magic Link Redemptions`, `MJ: Materialized Results`, `MJ: Materialized Result Queries`, `MJ: RSU Pending Works`, `MJ: AI Skill Search Scopes`, `MJ: Cluster Analysis Clusters`, `MJ: Employees`).

- **Option B Entity-Sourced Content Item Promotion**:
  - In `SearchEnricher.ExcludeEntitySourcedContentItems`, when vector search surfaces a content item originating from an entity record (via `EntityRecordDocumentID` or `RawMetadata`), promotes the item to the underlying entity (`EntityName`, `RecordID`), preserving score, snippet, and icon while resolving entity record names.
  - Preserves genuine external unstructured content items (PDFs, URLs, markdown documents) as `MJ: Content Items`.
  - In `SearchEngine`, deduplicates results after content promotion so promoted entity records merge cleanly with direct entity matches.

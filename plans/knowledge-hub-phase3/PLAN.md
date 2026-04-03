# Knowledge Hub Phase 3 — Plan

## What Was Completed in Phase 2

### Vector Search
- Knowledge search dashboard with Pinecone integration
- Search results with entity icons and metadata

### Duplicate Detection
- Kanban board with rich cards (entity icon, record name, match summaries from vector metadata)
- Comparison slide-in panel with CSS Grid field diff, merge field selection, surviving record picker
- Merge confirmation slide-in with dependency transfer summary
- Record dependencies with expandable lazy-loaded drilldown + navigation
- Inverse match deduplication (_seenPairs)
- RecordMetadata stored on detail/match records from vector DB
- Drag-and-drop between kanban columns
- Filters (entity, score, date) with data-range defaults
- Threshold overrides on DuplicateDetectionOptions

### Clustering
- Scatter plot with UMAP + K-Means/DBSCAN via FetchEntityVectors resolver
- Rich tooltips, detail panel slide-in, cluster member list
- LLM-generated cluster labels, save/restore with viewport, entity doc selector

### Content Autotagging
- Complete dashboard rewrite: 5-tab left nav, full CRUD, tree-dropdown for models
- AIPromptRunner refactor, batch processing, parallel tag+vectorize
- Per-type/source embedding model + vector index cascade
- Tag weights (0.0-1.0), pipeline progress updates

### Infrastructure
- KnowledgeHubMetadataEngine, FetchEntityVectors resolver, 400 unit tests

---

## Phase 3 Tasks

### 1. Entity Source Type for Autotagging [HIGH]
Point autotagger at MJ entity records:
- "Entity Records" content source type
- Content Source form: EntityID + EntityDocumentID fields
- Engine: sync entity records -> ContentItems with rendered template text
- Tag propagation back to source entity (EntityID + RecordID on ContentItem or new EntityRecordTag entity)
- Migration for new fields + seed data

### 2. Entity Record Autotagging Bridge [HIGH]
Tags flow back to source entity records:
- Design linking strategy (ContentItem fields vs separate entity)
- Integration with MJ Tags system
- UI: show tags in entity forms and Knowledge Hub

### 3. Replace Custom Azure Blob with MJ Storage [MEDIUM]
CloudStorage provider uses custom Azure Blob — replace with @memberjunction/storage:
- Support any MJ Storage provider (Azure Blob, S3, local)
- Maintain autotag pipeline

### 4. Rich Tag Cloud Visualization [MEDIUM]
Per-source and per-item interactive tag clouds:
- D3.js or SVG word cloud sized by count x weight
- Clickable tags filter items
- Gorgeous drill-down visualization

### 5. Fix RSS Reader Text Capture [MEDIUM]
RSS saves JSON metadata, not full article text:
- Follow link URL to fetch full page content via Cheerio
- Store full extracted text for better LLM tag quality

### 6. RSS Item Name Bug [LOW]
Items named after source, not content:
- Update ContentItem.Name with LLM-extracted title after processing
- Update ContentItem.Description similarly

### 7. Dupe Merge End-to-End Testing [MEDIUM]
ExecuteMerge exists but untested end-to-end:
- Test dependency transfer, field overrides, record deletion
- Error handling for merge failures

### 8. Clustering: LLM Label Editing [LOW]
Inline rename of cluster labels (data structure exists, UI not built)

### 9. Clustering: Reconnect In-Progress Runs [LOW]
Restore state when navigating away and back during clustering

### 10. Autotagging: Pipeline Stages Animation [LOW]
Re-enable pipeline visualization with animated stage transitions

### 11. Dupe Detection: Reconnect In-Progress Runs [LOW]
Track and reconnect to active detection runs on nav back

### 12. pgvector + Qdrant Providers [LOW]
Register in workspace, npm install, add to manifests, test

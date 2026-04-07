# Knowledge Hub Phase 4 — Bug Fix Plan

Every bug from `Bugs.md` tracked here. Each item marked with status as work progresses.

---

## Classify / Content Pipeline (4 bugs)

- [ ] **CP-1**: Add Content Source — hide Content Type and File Type when source type is Entity. Show entity document picker only if selected entity has > 1 entity doc
- [ ] **CP-2**: Content Source form — show source-type-specific fields dynamically (Cloud Storage → MJ Storage provider + base path, Local FS → file path, Website/RSS → URL, Entity → entity + doc picker). Design IContentSourceTypeConfiguration interface that describes required fields per source type. Study existing Configuration columns and propose architecture before coding.
- [ ] **CP-3**: Content Source Configuration — define IContentSourceConfiguration interface with SourceSpecificConfiguration as `Record<string, unknown>` sub-property. Create strongly-typed sub-interfaces per source type. Use JSONType metadata for CodeGen.
- [ ] **CP-4**: Content Source save failure — check `.Save()` result and `LatestResult.CompleteMessage`. Log to console AND show detailed error in toast notification. Fix missing required fields for Entity source type.

## Duplicate Detection (2 bugs)

- [ ] **DD-1**: Merge fails with "AllowRecordMerge" error — check `EntityInfo.AllowRecordMerge` BEFORE running dupe detection. Show friendly message if disabled, explain how to enable. Still allow detection run but warn user they can't merge.
- [ ] **DD-2**: Confirm merge uses MJ built-in `Metadata.Provider.MergeRecords()` — verify the existing merge flow goes through the Provider architecture, not custom SQL.

## Analytics (3 bugs)

- [ ] **AN-1**: Drill-down tables — add "Open Record" link/button on rows that represent entity records. Use `NavigationService.OpenEntityRecord()`. Skip for non-entity rows (quality scores, etc.)
- [ ] **AN-2**: Drill-downs only work on Overview tab — implement drill-down on Tags, Sources, Pipeline, and Quality tabs
- [ ] **AN-3**: Export options — add PDF, image (screen capture), and Excel/CSV export. Reuse MJ's existing data export infrastructure from entity-viewer package. Add export button to each analytics section.

## Search (6 bugs)

- [ ] **SR-1**: Score discrepancy — expanded card shows raw "Vector: 25%" while header shows normalized "92%". When only vector search is used, the expanded detail should show the normalized score, not the raw cosine similarity.
- [ ] **SR-2**: DB Search not running — enable `IncludeInUserSearchAPI` for Members, Products, Vendors in demo DB. Search should use UserSearchString (LIKE fallback) even without full-text indexing. Flip the bit via sqlcmd.
- [ ] **SR-3**: Filter options disappear when checking/unchecking — filter options should be stable (based on server search results), not rebuilt from the currently-filtered client-side result set. Only refresh filter options when a new server query is executed.
- [ ] **SR-4**: Redundant result grouping — remove "vector (50)" sub-header grouping. Show results as a flat blended list. Remove source-type grouping entirely.
- [ ] **SR-5**: Paging — add Google-style page navigation at bottom. Configurable results per page. Page numbers, prev/next buttons.
- [ ] **SR-6**: User preferences via UserInfoEngine — create KH app root settings key. Persist filter panel show/hide, threshold, and other preferences across sessions. Apply same pattern to all KH dashboards (clustering config expanded state, active saved cluster, etc.)

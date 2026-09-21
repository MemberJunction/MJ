---
'@memberjunction/ai-vector-sync': patch
'@memberjunction/ng-dashboards': patch
---

fix(vectors): live UI update on vector sync completion and loud failure reporting on embedding errors

- **Vector Management Dashboard**:
  - In `VectorManagementResourceComponent`, `RunView` for `MJ: Entity Record Documents` now sets `BypassCache: true` during row refresh to avoid returning stale zero-vector counts from `QueryCache`.
  - Added `buildSidebarData()` call in the sync completion flow so Vector DB Health, status reason, and vector coverage percentage update in real-time.
  - Replaced strict equality (`===`) checks on `EntityDocumentID` with case-insensitive `UUIDsEqual()` across row finding and status/progress updating methods.
  - Canonicalized entity document IDs to `doc.ID` and updated `SyncingIds` tracking with case-insensitive `IsSyncing()` checks.
  - Added `forceRefresh?: boolean` parameter to `LoadData()` and `fetchAllData()` to bypass cache on manual refreshes and entity document creation/updates.

- **AI Vector Sync Engine**:
  - In `EntityVectorSyncer`, caught and recorded embedding generation errors (`_embedErrors`) when calling `EmbedTexts()`.
  - Fails loudly when embedding models throw or return 0 vectors for valid records (e.g., due to missing API keys like `AI_VENDOR_API_KEY__<DRIVER>` or model unavailability).
  - Emits `Stage: 'error'` with an explicit error message naming the driver and expected environment variable, ensuring failures are not masked as silent completions with 0 vectors.

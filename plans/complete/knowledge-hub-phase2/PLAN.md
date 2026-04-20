# Knowledge Hub Phase 2 — Autotagging & Duplicate Detection End-to-End

## Branch: `claude/knowledge-hub-phase2`

## Goal
Make the autotagging pipeline and duplicate detection dashboards fully functional end-to-end.
Both systems have solid backend engines but the dashboards need wiring to actually trigger,
monitor, and display results. This must be demo-ready.

## Architecture Context

### What Already Works (from Phase 1)
- Vector sync pipeline with fire-and-forget + progress subscription
- Knowledge Hub search with RRF fusion, score threshold, entity enrichment
- Configuration dashboard with vector index CRUD, FTS management
- PascalCase naming on all VectorDBBase/PineconeDatabase methods
- EntityDocumentConfiguration types for pipeline tuning

### Autotagging System (Current State)
- **Engine**: Fully implemented (`AutotagBaseEngine`, 4 source types: LocalFS, RSS, Website, AzureBlob)
- **Action**: `AutotagAndVectorizeContentAction` orchestrates autotag + vectorize
- **Dashboard**: Read-only monitoring (KPIs, pipeline stages, recent items, sources panel)
- **Missing**: No way to trigger a run from UI, no real-time progress during run, no source CRUD

### Duplicate Detection System (Current State)
- **Engine**: Fully implemented (`DuplicateRecordDetector`, 750 lines, 11-step pipeline)
- **Dashboard**: Kanban board with Pending/Approved/Rejected columns, filtering
- **GraphQL**: `GetRecordDuplicates` query + `MergeRecords` mutation
- **Server Hook**: `MJDuplicateRunEntityServer` auto-triggers detection on save
- **Missing**: No way to initiate detection from dashboard, no entity document picker,
  no progress during detection, threshold settings not wired to entity documents

---

## Tasks

### TASK 1: Autotagging Dashboard — Trigger & Progress
**Files**: `packages/Angular/Explorer/dashboards/src/AI/components/autotagging/`

1.1. Add "Run Pipeline" button to the autotagging dashboard header
1.2. When clicked, call a new GraphQL mutation `RunAutotagPipeline` (fire-and-forget)
1.3. Subscribe to `PipelineProgress` for real-time updates during the run
1.4. Show progress bar/percentage in the dashboard while running
1.5. On completion, refresh the KPI cards and recent items feed
1.6. Add content source list with status indicators (Active/Inactive/Error)

### TASK 2: Autotagging — Server-Side Pipeline Mutation
**Files**: `packages/MJServer/src/resolvers/`

2.1. Create `AutotagPipelineResolver` with `RunAutotagPipeline` mutation
2.2. Fire-and-forget: return `PipelineRunID` immediately
2.3. Run `AutotagAndVectorizeContentAction` in background
2.4. Publish progress via `PubSubManager` → `PIPELINE_PROGRESS` topic
2.5. Handle errors gracefully (publish error stage)

### TASK 3: Duplicate Detection Dashboard — Initiate Detection
**Files**: `packages/Angular/Explorer/dashboards/src/AI/components/duplicates/`

3.1. Add "Run Detection" button/section to the duplicate dashboard
3.2. Add entity document picker (dropdown of active entity documents with dupe thresholds)
3.3. When clicked, create a `DuplicateRun` entity via GraphQL
     (the server hook auto-triggers detection)
3.4. Subscribe to `PipelineProgress` for detection progress
3.5. Show progress during detection (embedding → querying → matching phases)
3.6. On completion, refresh the Kanban board with new results
3.7. Wire threshold display from entity document's PotentialMatchThreshold/AbsoluteMatchThreshold

### TASK 4: Duplicate Detection — Progress Publishing
**Files**: `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts`

4.1. The detector already has `OnProgress` callback — verify it works
4.2. Wire progress callback through `MJDuplicateRunEntityServer` → PubSub
4.3. Ensure phases map to stages: Vectorizing → Embedding → Querying → Matching → Complete

### TASK 5: Configuration Dashboard — Entity Document Management
**Files**: `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/config/`

5.1. Verify the entity document CRUD (create/edit/delete) works end-to-end
5.2. Ensure threshold settings (PotentialMatchThreshold, AbsoluteMatchThreshold) save correctly
5.3. Wire the "Autotag on Ingest" and "Vectorize on Ingest" toggles to actual configuration
5.4. Test that creating a new entity document + syncing actually produces vectors in Pinecone

### TASK 6: End-to-End Integration Testing
**Test with Playwright headless browser**

6.1. Navigate to Knowledge Hub app
6.2. Verify all 4 tabs load (Search, Vectors, Autotagging, Duplicates, Config)
6.3. Search tab: execute a search, verify results appear with scores
6.4. Vectors tab: verify entity documents listed, sync button works
6.5. Autotagging tab: verify KPIs display, pipeline stages render
6.6. Duplicates tab: verify Kanban board renders (even if empty)
6.7. Config tab: verify vector indexes listed, FTS entities shown
6.8. Test triggering autotag pipeline if content sources exist
6.9. Test triggering duplicate detection if entity documents with thresholds exist

### TASK 7: Fix Any Build/Compilation Issues
7.1. Ensure all modified packages compile cleanly
7.2. Run vitest for all packages with tests
7.3. Fix any TypeScript errors introduced

---

## Regression Test Checklist

### Search
- [ ] Search returns results with scores
- [ ] Min relevance slider filters results
- [ ] Entity/source type filters work
- [ ] Open Record navigates correctly
- [ ] Empty state shows "Ask Agent" CTA

### Vector Management
- [ ] Entity documents listed in sync table
- [ ] Sync button starts vectorization
- [ ] Progress % updates during sync
- [ ] Status changes to "Synced" on completion
- [ ] Suggest Document generates AI template
- [ ] Edit panel opens and saves changes

### Autotagging
- [ ] Dashboard loads with KPI cards
- [ ] Pipeline stages visualization renders
- [ ] Content sources panel shows configured sources
- [ ] Recent processing feed shows items (if data exists)
- [ ] Run Pipeline button triggers processing (if configured)

### Duplicate Detection
- [ ] Kanban board renders with 3 columns
- [ ] Cards show entity, record ID, match score
- [ ] Approve/Reject buttons work
- [ ] Filtering by entity/score/date works
- [ ] KPI counts update after approval actions

### Configuration
- [ ] Vector indexes listed
- [ ] Create/delete index works
- [ ] FTS entities shown from metadata
- [ ] Threshold settings display and save

---

## Notes for Docker Worker

- Branch: `claude/knowledge-hub-phase2` (already pushed to remote)
- Start MJAPI on port 4000, MJExplorer on port 4200
- Use `playwright-cli` for headless browser testing
- Authenticate via Auth0 test credentials in .env
- Test against the SQL Server in the Docker workbench
- Commit at milestones — supervisor will pull to local and push to remote
- Do NOT modify database schema — only code changes
- All new code must follow MJ naming conventions (PascalCase public, camelCase private)
- Use design tokens for all CSS colors
- Use `@if`/`@for` template syntax (not *ngIf/*ngFor)

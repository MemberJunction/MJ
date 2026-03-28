# Vector/Dupe Detection — Docker Workbench Testing Session Plan

## Session Rules

### Roles
- **Supervisor (this Claude session)**: Directs work, reviews results, makes decisions. Does NOT write code or edit files locally.
- **Worker (CC in Docker container)**: Does all implementation, testing, debugging, iteration. Works on the branch inside the container.

### Git Workflow
- Docker container works on branch: `claude/modernize-vector-dupe-detection-clAbF`
- All commits and pushes happen FROM Docker's filesystem TO remote
- NEVER push from or to the local filesystem (user is doing other work locally)
- Local repo has been switched back to `an-dev-16` — do not touch it

### Supervisor Discipline
- Do not drift into doing implementation work in local filesystem
- Direct CC in Docker via exec commands and review its output
- Keep notes on progress, blockers, and decisions here or in session context
- Report progress to user at natural milestones

---

## Objective

Validate the full vector duplicate detection pipeline end-to-end using the AssociationDB demo data. The PR (#2212) rewrote the system clean-slate — we need to confirm it actually works with real data, not just unit tests.

## Testing Plan

### Phase 1: Environment Setup
- [ ] Start Docker workbench (SQL Server + claude-dev container)
- [ ] Inside container: checkout branch `claude/modernize-vector-dupe-detection-clAbF`
- [ ] Run `npm install` and build all packages
- [ ] Bootstrap AssociationDB (run migrations, seed data)

### Phase 2: Entity Document Configuration
- [ ] Identify good candidate entities in AssociationDB for dupe detection (Contacts, Organizations, etc.)
- [ ] Create Entity Documents with appropriate field mappings
- [ ] Configure a vector database provider (Pinecone or other available)
- [ ] Set up AI model/embeddings provider

### Phase 3: Vectorization Pipeline
- [ ] Run vectorization for configured Entity Documents
- [ ] Verify vectors are stored correctly in the vector DB
- [ ] Test TextChunker and TextExtractor with real entity data
- [ ] Validate vector counts match expected record counts

### Phase 4: Duplicate Detection
- [ ] Run `GetDuplicateRecords` on vectorized entities
- [ ] Verify DuplicateRun records are created with correct status lifecycle (Pending -> In Progress -> Complete/Failed)
- [ ] Check PotentialDuplicateResult output for reasonable matches
- [ ] Test `CheckSingleRecord` for real-time single-record dupe checking
- [ ] Validate the non-blocking server hook fires correctly on DuplicateRun save

### Phase 5: Advanced Features
- [ ] Test configurable TopK (verify different K values produce different result sets)
- [ ] Test self-match exclusion (records should not match themselves)
- [ ] Test batched DB saves (verify all results persist, not just first batch)
- [ ] Test concurrent vector queries (verify parallelism works)
- [ ] Test RRF scoring if hybrid search is available
- [ ] Test progress callbacks (DuplicateDetectionProgress)

### Phase 6: Edge Cases & Error Handling
- [ ] Empty entity (no records) — should complete gracefully
- [ ] Entity with 1 record — no duplicates possible
- [ ] Very long text fields — TextChunker handles correctly
- [ ] HTML content — TextExtractor strips properly
- [ ] Invalid/missing vector DB config — proper error, status set to 'Failed'

## Success Criteria
- Full vectorization + duplicate detection cycle completes without errors
- Duplicate matches are reasonable (not random noise)
- All status transitions work correctly
- Error paths set 'Failed' status appropriately
- No `any` types, no `.Get()`/`.Set()` usage in the codebase

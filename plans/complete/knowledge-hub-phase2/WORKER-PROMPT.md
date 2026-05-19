# Worker Instructions for Knowledge Hub Phase 2

You are working on branch `claude/knowledge-hub-phase2` in the MemberJunction repository.

## Your Mission
Make the autotagging pipeline and duplicate detection dashboards fully functional end-to-end.
This must be demo-ready by morning. Read the full plan at `plans/knowledge-hub-phase2/PLAN.md`.

## Key Rules
1. Follow ALL rules in `CLAUDE.md` — especially PascalCase for public members, no `any` types, design tokens for CSS
2. Build each package after modifying it: `cd packages/PackageName && npm run build`
3. Run tests after modifying packages that have tests: `npm run test`
4. Use `@if`/`@for` template syntax, never `*ngIf`/`*ngFor`
5. No hardcoded hex colors — use `--mj-*` design tokens
6. Do NOT modify database schema (no migrations) — only code changes
7. Do NOT commit — the supervisor handles that from the host machine
8. After each major task, start MJAPI + MJExplorer and test with Playwright headless

## Environment Setup
- DB: `sql-claude` on port 1433 (SA password: `Claude2Sql99`, DB: `MJWorkbench`)
- Start MJAPI: `cd packages/MJAPI && npm run start` (port 4000)
- Start MJExplorer: `cd packages/MJExplorer && npm run start` (port 4200)
- Playwright: `npx playwright-cli open http://localhost:4200` for headless testing
- Authenticate with test credentials from `.env`

## What Already Works (Don't Break These)
- Vector sync with fire-and-forget + PipelineProgress subscription
- Knowledge Hub search with RRF fusion and score threshold
- Configuration dashboard with vector index CRUD
- All VectorDBBase methods use PascalCase (ListIndexes, QueryIndex, CreateRecords, etc.)

## Task Priority Order
1. **Autotagging Dashboard** — Add "Run Pipeline" button + wire to server mutation + progress
2. **Autotag Server Mutation** — Create `RunAutotagPipeline` resolver (fire-and-forget)
3. **Duplicate Detection Dashboard** — Add "Run Detection" + entity doc picker + progress
4. **Duplicate Detection Progress** — Wire `OnProgress` through server hook → PubSub
5. **Config Dashboard Wiring** — Ensure thresholds save to entity documents
6. **Playwright Testing** — End-to-end regression on all Knowledge Hub tabs
7. **Fix any build/test failures**

## Testing Protocol
After completing each task group:
1. Build all modified packages
2. Run unit tests for modified packages
3. Start MJAPI + MJExplorer
4. Use Playwright to navigate to the Knowledge Hub
5. Take screenshots of each dashboard tab
6. Verify buttons/controls are functional
7. Report status to supervisor

## Architecture Notes

### Autotagging
- Engine: `packages/ContentAutotagging/` — `AutotagBaseEngine` with 4 source implementations
- Action: `packages/Actions/ContentAutotag/` — `AutotagAndVectorizeContentAction`
- Dashboard: `packages/Angular/Explorer/dashboards/src/AI/components/autotagging/`
- The action runs sequentially: LocalFS → RSS → Website autotaggers, then optionally vectorizes
- Use `PubSubManager.Instance.Publish('PIPELINE_PROGRESS', payload)` for progress

### Duplicate Detection
- Engine: `packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts` — 750 lines, 11-step pipeline
- Server Hook: `packages/MJCoreEntitiesServer/src/custom/MJDuplicateRunEntityServer.server.ts`
- Dashboard: `packages/Angular/Explorer/dashboards/src/AI/components/duplicates/`
- Detection triggers when a `DuplicateRun` entity is saved (server hook runs async)
- The detector already has `OnProgress` callback — wire it through the server hook to PubSub

### GraphQL Subscriptions
- Use existing `PipelineProgressResolver` and `PipelineProgressNotification` type
- Topic: `PIPELINE_PROGRESS`
- Filter by `pipelineRunID`
- Client subscribes via `GraphQLDataProvider.subscribe(query, variables)`

### Angular Components
- Use `inject()` for DI, not constructor injection
- Use `ChangeDetectorRef.detectChanges()` after async state changes
- For `ExpressionChangedAfterItHasBeenCheckedError`, use `Promise.resolve().then()`
- `BaseResourceComponent` is the base class for dashboard tab components
- Register with `@RegisterClass(BaseResourceComponent, 'ClassName')`

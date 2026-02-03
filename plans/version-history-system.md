# MemberJunction: System-Wide Version History & Label Management

> **Status**: Implemented (Phase 1)
> **Last Updated**: January 30, 2026
> **Branch**: `claude/versioning-history-system-BMByP`
> **Target Release**: MemberJunction 3.5.x

## Overview

This document describes the design and implementation of a system-wide versioning capability for MemberJunction. The system introduces **version labels** (analogous to git tags) that bookmark points in time across the existing `RecordChange` history, enabling efficient lookups, diffing, and restoration of record state across entities and their dependency graphs.

## Design Philosophy

MemberJunction already tracks all entity record changes via the `RecordChange` table (with `FullRecordJSON` snapshots and `ChangesJSON` diffs). Rather than duplicating this data, the version history system adds a **lightweight indexing layer** on top:

1. **Labels are pointers, not copies** - A label indexes into existing `RecordChange` entries, avoiding data duplication
2. **Dependency-aware** - Labels capture not just a single record but its entire dependency graph (parent + children + grandchildren) via the `DependencyGraphWalker`
3. **Record-scope first** - The primary use case is labeling individual records with their dependency graphs (e.g., "Agent v2.0"). Broader scopes (Entity, System) exist but Record scope is the default and most common operation
4. **Parent grouping for multi-record labels** - When labeling multiple records (e.g., 3 agents for a release), a parent label acts as a container with child labels per record. Infrastructure stays simple (each child is Record-scope), UI orchestrates the grouping
5. **Non-destructive** - Restore operations automatically create pre-restore safety labels as an undo mechanism
6. **Leverage existing infrastructure** - Built on top of `RecordChange`, `EntityInfo`, and `EntityRelationshipInfo`

## Problem Statement

While `RecordChange` tracks every mutation, there is no way to:

1. **Bookmark a known-good state** - Mark a point in time as "Release 2.4" or "Pre-migration baseline"
2. **Compare states** - See what changed between two known-good states
3. **Restore holistically** - Roll back a record and all its dependents to a consistent state
4. **Traverse dependencies** - Understand which child/grandchild records are affected by a change

### Use Cases

| Scenario | Current State | With Version History |
|----------|--------------|---------------------|
| Version an AI Agent | No versioning | Label the agent record → captures agent + prompts, actions, sub-agents, config |
| Release multiple agents | Manual tracking | Select agents in UI → parent label groups individual agent labels |
| Compare agent versions | Manual SQL queries | `DiffLabels(labelA, labelB)` with grouped field-level results |
| Rollback bad agent change | Restore from backup | `RestoreToLabel(labelId)` with dependency ordering |
| Audit entity changes | Browse RecordChange rows | Labels + diff viewer with field-level changes |
| Template version control | Custom versioning code | Labels scoped to individual template records |
| Pre-deployment snapshot | Manual DB backups | System-scope label captures all entities (future enhancement) |

---

## Data Model

### Entity Relationship Diagram

```
┌──────────────────────────────┐
│         VersionLabel         │
├──────────────────────────────┤
│ ID (PK, UNIQUEIDENTIFIER)   │
│ Name (NVARCHAR 200)         │
│ Description (NVARCHAR MAX)  │
│ Scope (System|Entity|Record) │
│ EntityID (FK → Entity, NULL) │
│ RecordID (NVARCHAR 750,NULL) │
│ ParentID (FK → self, NULL)   │◄─┐
│ Status (Active|Archived|     │  │ self-ref
│         Restored)            │──┘
│ CreatedByUserID (FK → User)  │
│ ExternalSystemID (NVARCHAR   │
│   200, NULL)                 │
│ ItemCount (INT)              │
│ CreationDurationMS (INT)     │
└──────────┬───────────────────┘
           │ 1:N
           │
┌──────────▼───────────────────┐        ┌──────────────────────────────┐
│      VersionLabelItem        │        │      RecordChange (existing) │
├──────────────────────────────┤        ├──────────────────────────────┤
│ ID (PK, UNIQUEIDENTIFIER)   │   N:1  │ ID (PK)                     │
│ VersionLabelID (FK)         ├───────►│ EntityID                    │
│ RecordChangeID (FK)         │        │ RecordID                    │
│ EntityID (UNIQUEIDENTIFIER,  │
│   FK → Entity, denorm)      │        │ Type (Create|Update|Delete| │
│ RecordID (NVARCHAR 750,denorm)│       │       Snapshot)             │
│ UNIQUE(LabelID+EntityID+     │        │ FullRecordJSON              │
│        RecordID)             │        │ ChangesJSON                 │
└──────────────────────────────┘        │ Source (Internal|External)  │
                                        └──────────────────────────────┘
┌──────────────────────────────┐
│    VersionLabelRestore       │
├──────────────────────────────┤
│ ID (PK, UNIQUEIDENTIFIER)   │
│ VersionLabelID (FK)         │
│ UserID (FK → User)           │
│ Status (Pending|In Progress| │
│         Complete|Error|      │
│         Partial)             │
│ StartedAt (DATETIMEOFFSET)   │
│ EndedAt (DATETIMEOFFSET)     │
│ TotalItems (INT)             │
│ CompletedItems (INT)         │
│ FailedItems (INT)            │
│ ErrorLog (NVARCHAR MAX, NULL)│
│ PreRestoreLabelID (FK, NULL) │
└──────────────────────────────┘
```

### Key Design Decisions

1. **Record-scope-first approach**: The primary use case is labeling a single record and its dependency graph (e.g., "AI Agent v2.0" captures the agent + its prompts, actions, sub-agents, etc.). Entity and System scopes exist for broader use cases but Record scope is the default.

2. **Parent grouping via self-referencing ParentID**: When a user wants to label multiple records of the same entity (e.g., 3 agents as "Release 3.1"), the system creates a parent label as a container (no EntityID/RecordID, just organizational) and child labels that each snapshot one record's dependency graph. This keeps the infrastructure simple — every label with actual data is Record-scope — while the parent provides logical grouping.

3. **Denormalized EntityID/RecordID on VersionLabelItem**: Enables fast queries for "all items in this label for entity X" without joining through RecordChange. The unique constraint prevents duplicate entries.

4. **RecordChange.Type extended with 'Snapshot'**: When a record exists but has no RecordChange entry (predates change tracking), the system creates a synthetic `Type='Snapshot'` entry capturing its current state. This fills gaps in the history.

5. **VersionLabelRestore as audit log**: Every restore operation is fully audited with progress tracking, pre-restore label references, and error logs.

6. **Creation metrics (ItemCount, CreationDurationMS)**: Tracked on each label to enable estimation of future label creation operations. Before committing a label, the UI can query existing labels with similar scope to estimate row count and duration.

---

## Architecture

### Package Structure

```
packages/VersionHistory/
├── package.json              # @memberjunction/version-history
├── tsconfig.json
└── src/
    ├── index.ts              # Barrel exports
    ├── types.ts              # All shared types and interfaces
    ├── constants.ts          # Entity names, SQL safety utils, shared helpers
    ├── LabelManager.ts       # CRUD operations for labels
    ├── SnapshotBuilder.ts    # Captures record state into labels
    ├── DependencyGraphWalker.ts  # Traverses entity relationships
    ├── DiffEngine.ts         # Compares label states
    ├── RestoreEngine.ts      # Restores records to labeled state
    └── VersionHistoryEngine.ts   # Main facade class
```

### Dependency Graph

```
@memberjunction/version-history
├── @memberjunction/core      (Metadata, RunView, BaseEntity, CompositeKey)
└── @memberjunction/global    (ClassFactory, RegisterClass)
```

No dependency on `@memberjunction/core-entities` — the package uses `BaseEntity` with `.Get()`/`.Set()` generically since CodeGen-generated typed subclasses don't exist yet for the new tables.

### Engine Classes

#### VersionHistoryEngine (Facade)
The main entry point that composes the specialized engines:

```typescript
const engine = new VersionHistoryEngine();

// Create a Record-scope label (primary use case)
// Captures the agent record + all dependents (prompts, actions, sub-agents, etc.)
const label = await engine.CreateLabel({
    Name: 'Customer Support Agent v2.0',
    Description: 'Stable release with new escalation logic',
    Scope: 'Record',
    EntityID: agentEntityId,
    RecordID: agentRecordId,
    UserID: currentUser.ID
}, contextUser);
// label.ItemCount = 47, label.CreationDurationMS = 1200

// Create grouped labels for multiple records (UI orchestrates this)
const parentLabel = await engine.CreateLabel({
    Name: 'Release 3.1',
    Description: 'Q1 agent release',
    Scope: 'Record',    // Parent is organizational, no EntityID/RecordID
    UserID: currentUser.ID
}, contextUser);

for (const agentId of selectedAgentIds) {
    await engine.CreateLabel({
        Name: `Release 3.1 — ${agentName}`,
        Scope: 'Record',
        EntityID: agentEntityId,
        RecordID: agentId,
        ParentID: parentLabel.ID,
        UserID: currentUser.ID
    }, contextUser);
}

// Compare two labels
const diff = await engine.DiffLabels(labelA.ID, labelB.ID, contextUser);

// Restore to a label
const result = await engine.RestoreToLabel(labelId, {
    UserID: currentUser.ID,
    DryRun: false
}, contextUser);
```

#### LabelManager
- `CreateLabel()` — Validates params before persistence, creates the label entity
- `GetLabel()` / `GetLabels()` — Lookup with safe SQL filtering
- `ArchiveLabel()` / `MarkLabelRestored()` — Status lifecycle management

#### SnapshotBuilder
- `CaptureRecord()` — Captures one record + optional dependency graph
- `CaptureEntity()` — Captures all records of an entity type
- `CaptureSystem()` — Captures all tracked entities
- Creates synthetic `Type='Snapshot'` RecordChange entries when needed

#### DependencyGraphWalker
- `WalkDependents()` — BFS traversal of One-To-Many relationships from a root record
- `FlattenTopological()` — Returns parent-before-child ordering
- Configurable: MaxDepth, EntityFilter, ExcludeEntities
- Cycle detection via visited set

#### DiffEngine
- `DiffLabels()` — Compares two labels field-by-field
- `DiffLabelToCurrentState()` — Compares label to live database
- `GetRecordSnapshotAtLabel()` — Point-in-time record state lookup
- Groups results by entity with per-record field-level changes

#### RestoreEngine
- `RestoreToLabel()` — Full restore with progress tracking
- Topological ordering: parents restored before children (FK safety)
- Pre-restore safety label: auto-created as undo mechanism
- Batch progress updates (every 10 items)
- Dry-run mode for previewing changes

### SQL Safety

All SQL string interpolation uses shared utilities from `constants.ts`:

```typescript
// Prevents SQL injection
escapeSqlString(value: string): string

// Safe WHERE clause builders
sqlEquals(column: string, value: string): string
sqlContains(column: string, value: string): string
sqlIn(column: string, values: string[]): string
sqlNotIn(column: string, values: string[]): string
```

### Composite Key Support

The system does not hardcode `'ID'` as the primary key. All entity operations use:

```typescript
buildPrimaryKeyForLoad(entityInfo: EntityInfo, value: string): CompositeKey
buildCompositeKeyFromRecord(entityInfo: EntityInfo, record: Record<string, unknown>): string
```

These derive the actual primary key field(s) from entity metadata.

---

## Angular Dashboard

### Application Metadata

The dashboard is registered as a MemberJunction application via `metadata/applications/.version-history-application.json` with four nav tabs.

### Resource Components

All components follow the `@RegisterClass(BaseResourceComponent, 'DriverClass')` pattern with `ChangeDetectionStrategy.OnPush`.

| Tab | Component | DriverClass | Description |
|-----|-----------|-------------|-------------|
| Labels | `VersionHistoryLabelsResourceComponent` | `VersionHistoryLabelsResource` | KPI cards (total/active/archived/restored), scope & status filter chips, search, label cards with metadata |
| Diff Viewer | `VersionHistoryDiffResourceComponent` | `VersionHistoryDiffResource` | Mode selector (label-to-label vs label-to-current), label dropdowns, summary stats, collapsible entity groups with per-record field diffs |
| Restore History | `VersionHistoryRestoreResourceComponent` | `VersionHistoryRestoreResource` | KPI cards, status/dry-run filters, expandable restore cards with progress bars and error logs |
| Dependency Graph | `VersionHistoryGraphResourceComponent` | `VersionHistoryGraphResource` | Entity browser with search, dependent/parent counts, detail panel with relationship edges and clickable navigation |

### Registration

- **module.ts**: All 4 components in `declarations` and `exports`
- **public-api.ts**: Exports + tree-shaking prevention via `LoadVersionHistory*Resource()` calls
- **No standalone components**: All components are part of the `DashboardsModule` NgModule

---

## Database Migration

**File**: `migrations/v3/V202601301952__v3.5.x__Version_Label_System.sql`

### Tables Created

1. **`__mj.VersionLabel`** — Label metadata with scope, status, optional entity/record binding
2. **`__mj.VersionLabelItem`** — Links labels to RecordChange entries with denormalized EntityID/RecordID
3. **`__mj.VersionLabelRestore`** — Audit log for restore operations with progress tracking

### Schema Changes

- Extends `RecordChange.Type` CHECK constraint to include `'Snapshot'`
- All tables use `NEWSEQUENTIALID()` for clustered PK performance
- Extended properties added for CodeGen metadata generation
- Foreign key indexes are NOT included (CodeGen creates them automatically)
- Timestamp columns (`__mj_CreatedAt`, `__mj_UpdatedAt`) are NOT included (CodeGen adds them)

---

## Future Enhancements (Phase 2+)

### Server-Side
- **Scheduled snapshots** — Cron-based automatic system labels (e.g., nightly baselines)
- **Label comparison reports** — Export diff results as PDF/Excel
- **Selective restore** — Restore specific entities or records within a label, not all-or-nothing
- **Label merge** — Combine items from multiple labels into a new composite label
- **Retention policies** — Auto-archive or delete labels older than N days
- **Webhook/event integration** — Emit events on label creation, restore completion
- **Performance indexes** — Additional indexes on VersionLabelItem for large-scale queries

### Dashboard
- **Real-time progress** — WebSocket/SignalR updates during restore operations
- **Inline field diff viewer** — Side-by-side JSON diff with syntax highlighting
- **Label timeline** — Visual timeline showing labels on a date axis
- **Dependency graph visualization** — D3.js or similar interactive graph rendering
- **Bulk operations** — Select multiple labels for comparison or archival
- **Export/import labels** — Serialize labels to JSON for cross-environment use
- **Search within diffs** — Filter diff results by field name or value

### Integration
- **CI/CD hooks** — Auto-create labels on deployment events
- **MCP tool exposure** — Expose version history operations as MCP tools for AI agents
- **Action integration** — Register label/diff/restore as MJ Actions for workflow use

---

## File Inventory

### New Files
| File | Purpose |
|------|---------|
| `migrations/v3/V202601301952__v3.5.x__Version_Label_System.sql` | Database migration (3 tables + CHECK constraint) |
| `packages/VersionHistory/package.json` | Package manifest |
| `packages/VersionHistory/tsconfig.json` | TypeScript configuration |
| `packages/VersionHistory/src/index.ts` | Barrel exports |
| `packages/VersionHistory/src/types.ts` | Shared types and interfaces |
| `packages/VersionHistory/src/constants.ts` | Entity names, SQL safety, shared helpers |
| `packages/VersionHistory/src/LabelManager.ts` | Label CRUD operations |
| `packages/VersionHistory/src/SnapshotBuilder.ts` | Record state capture |
| `packages/VersionHistory/src/DependencyGraphWalker.ts` | Entity relationship traversal |
| `packages/VersionHistory/src/DiffEngine.ts` | Label comparison |
| `packages/VersionHistory/src/RestoreEngine.ts` | State restoration |
| `packages/VersionHistory/src/VersionHistoryEngine.ts` | Main facade |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/index.ts` | Angular barrel exports |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/index.ts` | Component barrel exports |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/labels-resource.component.ts` | Labels tab |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/labels-resource.component.html` | Labels template |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/labels-resource.component.css` | Labels styles |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/diff-resource.component.ts` | Diff tab |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/diff-resource.component.html` | Diff template |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/diff-resource.component.css` | Diff styles |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/restore-resource.component.ts` | Restore tab |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/restore-resource.component.html` | Restore template |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/restore-resource.component.css` | Restore styles |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/graph-resource.component.ts` | Graph tab |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/graph-resource.component.html` | Graph template |
| `packages/Angular/Explorer/dashboards/src/VersionHistory/components/graph-resource.component.css` | Graph styles |
| `metadata/applications/.version-history-application.json` | Application metadata |

### Modified Files
| File | Change |
|------|--------|
| `packages/Angular/Explorer/dashboards/src/module.ts` | Added 4 component imports, declarations, exports |
| `packages/Angular/Explorer/dashboards/src/public-api.ts` | Added exports and tree-shaking prevention calls |
| `package.json` (root) | Added workspace entry for `packages/VersionHistory` |
| `package-lock.json` | Updated for new workspace package |

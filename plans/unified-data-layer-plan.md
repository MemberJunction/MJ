# Unified Data Layer, Component Events & Agent Integration

> **Status**: PLANNING
> **Created**: 2026-03-27
> **Builds on**: `plans/visualization-layer-design.md` (PR #2215)
> **Related**: `plans/file-artifact-io-plan.md` (file-based artifact I/O)
> **Scope**: `@memberjunction/core`, `@memberjunction/interactive-component-types`, `@memberjunction/ng-artifacts`, `@memberjunction/ng-react`, agent integration, future visualization foundation

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State & Gaps](#2-current-state--gaps)
3. [Architecture Overview](#3-architecture-overview)
4. [Core Type System & Utilities](#4-core-type-system--utilities)
5. [Component Event System](#5-component-event-system)
6. [Artifact-Level State Snapshots](#6-artifact-level-state-snapshots)
7. [Multi-Table Viewer UX](#7-multi-table-viewer-ux)
8. [Artifact Tools: Agent Artifact Access](#8-artifact-tools-agent-artifact-access)
9. [Interactive Component Data Contract](#9-interactive-component-data-contract)
10. [Relationship to File Artifact I/O](#10-relationship-to-file-artifact-io)
11. [Cross-Cutting Concerns](#11-cross-cutting-concerns)
12. [File Inventory](#12-file-inventory)
13. [Implementation Order & Dependencies](#13-implementation-order--dependencies)
14. [Open Items & Future Considerations](#14-open-items--future-considerations)

---

## 1. Executive Summary

MemberJunction's interactive component system and artifact viewer system both produce and display rich data, but they lack three critical capabilities:

| Capability | Gap Today | Solution |
|---|---|---|
| **Structured component output** | `ComponentObject.getCurrentDataState()` returns `any`. Each React component returns whatever it wants. No consumer can reliably interpret the data. | Define a layered type system — `ColumnDescriptor` → `DataTable` → `DataSnapshot` — that gives every component a shared vocabulary for describing its data. |
| **Multi-table data** | `DataArtifactSpec` supports one table (one `rows[]`, one `columns[]`). Dashboards and multi-query results can't be represented as a single artifact. | Expand to a `tables[]` array of named datasets, with per-table metadata, while keeping full backward compatibility with the single-table format. |
| **Agent visibility into live components** | Agents cannot see what a user is looking at. If a user is viewing a filtered, sorted, paged grid — the agent has no access to that state. | Add `GetCurrentStateSnapshot()` to every artifact viewer plugin, returning a structured `DataSnapshot` that captures the live data, visual state, computations, and interpretation. |

Two additional capabilities complete the picture:

| Capability | Gap Today | Solution |
|---|---|---|
| **Component event notification** | Interactive components have declarative event metadata but no runtime notification mechanism. Containers can't react to or cancel component actions. | Add `NotifyEvent` to the existing `ComponentCallbacks` interface, with base interfaces for cancelable and after-event args. Components call `callbacks.NotifyEvent()` — containers handle routing. |
| **Agent artifact access** | Agents have no way to explore artifact content. Dumping large artifacts into prompt context doesn't scale. | Add **Artifact Tools** as a 5th agent primitive (alongside actions, subagents, scratchpad, client tools). Agents see an artifact manifest and use type-specific tools to sip content on demand. |

### Design Philosophy

This plan unifies two prior design efforts:

- **PR #2215 (Visualization Layer)** established the principle that MJ needs a clean, generic, potentially external-facing data interchange format — one that could work outside MJ via MCP or be consumed by non-MJ agents. That thinking shaped the layered column hierarchy (`ColumnDescriptor` as the generic base, `MJColumnDescriptor` adding entity lineage) and the separation between data description and rendering.

- **PR #2237 (Data Snapshots)** identified the concrete problems and designed practical solutions: multi-table expansion, snapshot capture methods, the component event system, and the agent bridge. The vast majority of the implementation design comes from this plan.

This plan is the union — concrete solutions built on a type system that's generic enough to be useful beyond MJ's immediate boundaries.

### Key Design Decisions

**One unified type hierarchy.** Rather than separate types for "component data," "artifact data," "agent data," and "export data," there is ONE layered type system. A query builder produces a `DataSnapshot`. A dashboard component produces a `DataSnapshot`. A chart produces a `DataSnapshot`. An agent can reason over any of them because they share the same shape.

**Generic at the base, MJ-native where it matters.** `ColumnDescriptor` is deliberately generic — no MJ-specific fields. This is the layer that could be exposed via MCP or consumed by external agents. `MJColumnDescriptor` adds entity lineage for the rich MJ experience. Both levels exist because both use cases are real.

**Artifact types own their snapshot shape.** Each artifact type knows what "current data state" means for its content. A data artifact ejects its grid data. An interactive component proxies through to the running React component. A PDF viewer returns text and metadata. The base class provides a default; subclasses override with type-specific logic.

**The component contract includes both get AND set.** `getCurrentDataState()` captures the current state. `setDataState()` enables rehydrating a component with historical data — loading a prior snapshot back into a live component. The get side is the immediate implementation; the set side is scaffolded in the contract for near-term follow-up.

### Implementation Structure

This is one body of work, not a multi-month phased rollout. The sections below are ordered by dependency (what must exist before the next piece can be built), not by timeline:

```
Core Type System & Utilities (foundation)
    ├──▶ Component Event System (NotifyEvent on ComponentCallbacks)
    ├──▶ Artifact-Level State Snapshots (abstract method on viewers)
    ├──▶ Multi-Table Viewer UX (Angular)
    ├──▶ Interactive Component Data Contract (get/setDataState on React runtime)
    └──▶ Artifact Tools (5th agent primitive — artifact manifest + exploration tools)
              │
              └──▶ depends on: Scratchpad pattern, input artifact infrastructure (shared w/ file I/O)
```

All sections after the core types can proceed in parallel. Artifact Tools depends on the shared input artifact infrastructure being co-built with the file I/O team.

---

## 2. Current State & Gaps

### 2.1 The Column Problem: Three Overlapping Types

MJ already has three different types describing "what is this column of data?":

**`DataArtifactColumn`** — local to `data-artifact-viewer.component.ts`, not exported:
```typescript
interface DataArtifactColumn {
    field: string;            // "Revenue"
    headerName?: string;      // "Total Revenue"
    width?: number;           // 150
    sourceEntity?: string;    // "Invoices"  (MJ entity lineage)
    sourceFieldName?: string; // "Amount"    (field in that entity)
    isComputed?: boolean;     // CASE/ROUND/CONCAT expressions
    isSummary?: boolean;      // SUM/AVG/COUNT aggregates
    sqlBaseType?: string;     // "money"
}
```

**`QueryGridColumnConfig`** — in `@memberjunction/ng-query-viewer`, used by the data grid:
```typescript
interface QueryGridColumnConfig {
    field: string;
    title: string;
    sqlBaseType: string;
    sqlFullType: string;        // "decimal(18,2)"
    sourceEntityName?: string;
    sourceFieldName?: string;
    isEntityLink: boolean;      // clickable → navigates to record
    targetEntityName?: string;
    visible: boolean;
    sortable: boolean;
    resizable: boolean;
    reorderable: boolean;
    order: number;
    align?: 'left' | 'center' | 'right';
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
    // ... more display/interaction flags
}
```

**`SimpleQueryFieldInfo`** — in `@memberjunction/interactive-component-types`:
```typescript
class SimpleQueryFieldInfo extends SimpleEntityFieldInfo {
    sourceEntity?: string;
    sourceFieldName?: string;
    isSummary?: boolean;
    summaryDescription?: string;
    // inherited: name, type, sequence, allowsNull, isPrimaryKey, ...
}
```

These three types describe the **same underlying concept** at different levels of detail. There is no shared base, no conversion between them, and no single canonical representation.

### 2.2 The DataArtifactSpec: Single-Table and Local

The current `DataArtifactSpec` is defined locally inside `data-artifact-viewer.component.ts` (lines 14–57). It:
- Supports only one table (one `rows[]`, one `columns[]`)
- Is not exported or shared — no other package can import it
- Has minimal metadata (`sql`, `rowCount`, `executionTimeMs`)
- Has no concept of visual state, computations, or interpretation

### 2.3 The ComponentObject Contract: Untyped

> **Note:** `ComponentObject` itself is **fully implemented and actively used**. The React compiler builds `ComponentObject` instances with method registries, the Angular bridge (`MJReactComponent`) exposes typed proxy methods, and containers can call `getCurrentDataState()`, `validate()`, `isDirty()`, `invokeMethod()`, etc. The gap is specifically the **return type** of `getCurrentDataState()` — it's `any`, not a structured contract.

`ComponentObject.getCurrentDataState` in `runtime-types.ts`:
```typescript
getCurrentDataState?: () => any;
```

Returns `any`. Each React component returns whatever it wants. The Angular bridge passes it through unchanged. Nothing downstream can safely consume the result because there is no contract for the return value.

### 2.4 No Snapshot Mechanism

`BaseArtifactViewerPluginComponent` has no method to capture current state. If a parent wants to know what an artifact viewer is showing, it has no standard way to ask.

### 2.5 No Runtime Event System

`ComponentEvent` in `component-props-events.ts` is purely declarative metadata:
```typescript
interface ComponentEvent {
    name: string;
    description: string;
    parameters?: ComponentEventParameter[];
}
```

It describes what events a component CAN emit, but there is no runtime subscription mechanism. No `on()`. No `off()`. No `emit()`. No cancellation. The containing Angular component cannot subscribe to or intercept events from a running React component.

### 2.6 Row Shape: Consistent

This is the one area that is consistent. Everywhere in MJ, rows are `Record<string, unknown>[]`:
- RunView returns them
- RunQuery returns them
- Data artifact viewer expects them
- React components receive them

No wrappers, no special row objects — just plain key-value objects. The new type system preserves this.

---

## 3. Architecture Overview

### 3.1 The Type Hierarchy

Three levels of data description, each adding context:

```
Level 1: Column Descriptors (what is one column?)
──────────────────────────────────────────────────
ColumnDescriptor              field + SQL type + display name
      ↓ extends
MJColumnDescriptor            + entity lineage (sourceEntity, sourceFieldName)
      ↓ extends               + computed/summary flags
GridColumnDescriptor          + display flags (visible, sortable, resizable, entity link)


Level 2: DataTable (what is one dataset?)
──────────────────────────────────────────
DataTable = {
    name, description, source,
    columns: MJColumnDescriptor[],
    rows: Record<string, unknown>[],
    metadata: DataTableMetadata
}


Level 3: DataSnapshot (what is the full picture?)
──────────────────────────────────────────────────
DataSnapshot = {
    tables: DataTable[],
    title, plan, interpretation,
    drillPath, activeTab, searchText, custom
}

DataTable (per-table state) = {
    name, columns, rows, metadata,
    computations, sorting, activeFilters, selectedRows, pageNumber
}
```

Different consumers use different levels:

| Consumer | What It Needs |
|---|---|
| CSV exporter | `DataTable` — rows and columns |
| Grid renderer | `GridColumnDescriptor` — all display flags |
| Agent analysis | `DataSnapshot` — full picture with context |
| Component spec | `MJColumnDescriptor` — field metadata with lineage |
| Snapshot comparison | Two `DataSnapshot` objects — diff tables and computations |

### 3.2 Data Flow: Component → Snapshot → Consumer

```
┌──────────────────────────────┐
│  Any Artifact Viewer Plugin  │
│  (Data, Component, JSON,     │
│   Code, Markdown, etc.)      │
│                              │
│  GetCurrentStateSnapshot()   │──────────────┐
└──────────────────────────────┘              │
                                              ▼
                                   ┌─────────────────────┐
                                   │   DataSnapshot       │
                                   │   (immutable data)   │
                                   │                     │
                                   │   tables[]          │
                                   │   computations[]    │
                                   │   interpretation    │
                                   └────────┬────────────┘
                                            │
                              ┌─────────────┼─────────────┐
                              │             │             │
                         Transform     Transform     Transform
                         pipeline      pipeline      pipeline
                              │             │             │
                              ▼             ▼             ▼
                         Agent         Persistent     Export
                         context       artifact       (CSV,
                         (ephemeral)   version        flat data)
```

The boundary: **stateful capture** (left side — reading live component state) produces an immutable `DataSnapshot`. **Composable transforms** (right side — data-in, data-out functions) process it for different consumers.

### 3.3 Event Flow: Component → Consumer (with Cancellation)

```
┌─────────────────────────┐
│  Interactive Component  │
│  (React)                │
│                         │    emit('beforeFilterChange', args)
│  Internal event occurs  │──────────────────────────────────────┐
│                         │                                      │
└─────────────────────────┘                                      ▼
                                                    ┌────────────────────────┐
                                                    │  Consumer/Container    │
                                                    │                        │
                                                    │  args.cancel = true?   │
                                                    │  args.modifiedValue?   │
                                                    └────────────┬───────────┘
                                                                 │
                                              ┌──────────────────┼──────────────┐
                                              │ cancel=false     │ cancel=true  │
                                              ▼                  ▼              │
                                   Component proceeds    Component skips       │
                                   with default (or      default behavior      │
                                   modified) behavior                          │
                                              │                                │
                                              ▼                                │
                                   emit('afterFilterChange', result)           │
                                              │                                │
                                              ▼                                │
                                   Consumer receives                           │
                                   success/metrics                             │
```

---

## 4. Core Type System & Utilities

### 4.1 Column Descriptors

#### 4.1.1 SQLBaseType Union Type

Define the universe of recognized SQL base types in MJCore. This provides compile-time validation — typos like `'integr'` are caught by TypeScript. The SQLDialect package handles platform-specific mapping (e.g., `'uniqueidentifier'` → `'uuid'` for PostgreSQL).

```typescript
/**
 * The canonical set of SQL base types MJ recognizes.
 * Used for column typing, formatting decisions, and alignment.
 * Platform-specific mappings live in the SQLDialect package.
 */
export type SQLBaseType =
    | 'int' | 'bigint' | 'smallint' | 'tinyint'
    | 'decimal' | 'numeric' | 'float' | 'real' | 'money' | 'smallmoney'
    | 'nvarchar' | 'varchar' | 'char' | 'nchar' | 'text' | 'ntext'
    | 'bit'
    | 'uniqueidentifier'
    | 'datetime' | 'datetime2' | 'datetimeoffset' | 'date' | 'time' | 'smalldatetime'
    | 'varbinary' | 'binary' | 'image'
    | 'xml' | 'json'
    | 'geography' | 'geometry'
    | 'sql_variant';
```

> **Note:** `EntityFieldInfo.Type` remains `string` for now to avoid downstream breakage. New code uses `SQLBaseType`; eventual migration of `EntityFieldInfo` is tracked separately.

#### 4.1.2 New File: `packages/MJCore/src/generic/column-descriptors.ts`

Types are **classes** with **static factory methods** for construction/conversion (per MJ convention — grouped, discoverable via IntelliSense).

```typescript
// ─── LEVEL 1: UNIVERSAL COLUMN ───

/**
 * Base column descriptor. The minimum information needed to describe
 * a column of data: what it's called, what type it is, how to display it.
 */
export class ColumnDescriptor {
    /** Field name in the row data — the key used to access the value: row[field] */
    field: string;

    /** Human-readable display name for headers, labels, and tooltips */
    displayName?: string;

    /** SQL base type — source of truth for formatting in MJ */
    sqlBaseType?: SQLBaseType;

    /** Full SQL type with precision/scale: 'decimal(18,2)', 'nvarchar(255)' */
    sqlFullType?: string;

    /** Column width in pixels (hint for renderers) */
    width?: number;

    /** Human-readable description of what this column represents */
    description?: string;

    constructor(field: string) {
        this.field = field;
    }
}

// ─── LEVEL 2: MJ COLUMN WITH ENTITY LINEAGE ───

/**
 * Column descriptor with MemberJunction entity lineage.
 * Enables entity linking, schema-aware formatting, and agent understanding
 * of where data originates.
 */
export class MJColumnDescriptor extends ColumnDescriptor {
    /** MJ entity name this column originates from (e.g., "Customers") */
    sourceEntity?: string;

    /** Field name in that entity (e.g., "ID", "FirstName") */
    sourceFieldName?: string;

    /** True for calculated expressions: CASE, ROUND, CONCAT, etc. */
    isComputed?: boolean;

    /** True for aggregate functions: SUM, COUNT, AVG, etc. */
    isSummary?: boolean;

    /** Create from a base ColumnDescriptor + entity lineage */
    static FromColumnDescriptor(
        col: ColumnDescriptor,
        entityName: string,
        sourceFieldName?: string
    ): MJColumnDescriptor {
        const result = new MJColumnDescriptor(col.field);
        Object.assign(result, col);
        result.sourceEntity = entityName;
        result.sourceFieldName = sourceFieldName ?? col.field;
        return result;
    }

    /** Create from a SimpleQueryFieldInfo (bridges legacy component data requirements) */
    static FromSimpleQueryField(field: {
        name: string;
        type?: string;
        sourceEntity?: string;
        sourceFieldName?: string;
        isSummary?: boolean;
        description?: string;
    }): MJColumnDescriptor {
        const result = new MJColumnDescriptor(field.name);
        result.sqlBaseType = field.type as SQLBaseType;
        result.sourceEntity = field.sourceEntity;
        result.sourceFieldName = field.sourceFieldName;
        result.isSummary = field.isSummary;
        result.description = field.description;
        return result;
    }
}

// ─── LEVEL 3: GRID COLUMN WITH DISPLAY FLAGS ───

/**
 * Column descriptor with full display configuration for grid/table rendering.
 * Most consumers don't need this — it's specific to the grid renderer.
 */
export class GridColumnDescriptor extends MJColumnDescriptor {
    visible: boolean = true;
    sortable: boolean = true;
    resizable: boolean = true;
    reorderable: boolean = true;
    order: number = 0;
    align?: 'left' | 'center' | 'right';
    pinned?: 'left' | 'right' | null;
    minWidth?: number;
    maxWidth?: number;
    flex?: number;

    /** Create from an MJColumnDescriptor with sensible display defaults */
    static FromMJColumn(col: MJColumnDescriptor, order: number): GridColumnDescriptor {
        const result = new GridColumnDescriptor(col.field);
        Object.assign(result, col);
        result.order = order;
        return result;
    }

    /** Strip grid flags, returning just the data-level column info */
    ToMJColumn(): MJColumnDescriptor {
        const result = new MJColumnDescriptor(this.field);
        result.displayName = this.displayName;
        result.sqlBaseType = this.sqlBaseType;
        result.sqlFullType = this.sqlFullType;
        result.width = this.width;
        result.description = this.description;
        result.sourceEntity = this.sourceEntity;
        result.sourceFieldName = this.sourceFieldName;
        result.isComputed = this.isComputed;
        result.isSummary = this.isSummary;
        return result;
    }
}
```

### 4.2 DataTable

#### 4.2.1 New File: `packages/MJCore/src/generic/data-table.ts`

```typescript
import { MJColumnDescriptor } from './column-descriptors';

/**
 * A single named dataset: columns + rows + provenance + per-table state.
 *
 * This is the standard unit of tabular data in MemberJunction.
 * Self-describing: given just this object, a consumer knows what the
 * data is, where it came from, and how to interpret each column.
 *
 * Per-table state (sorting, filters, computations, paging, selection)
 * lives here — not on DataSnapshot — because each table in a multi-table
 * snapshot has its own independent state.
 *
 * Rows are flat `Record<string, unknown>[]` — same shape as RunView/RunQuery.
 */
export class DataTable {
    /**
     * Unique name for this table within a collection.
     * Used as tab labels, reference keys for computations,
     * and identifiers in agent context.
     *
     * Examples: "customers", "monthly_revenue", "top_products"
     */
    name: string;

    /**
     * Human-readable description of what this table contains.
     * Useful for agent interpretation and UI tooltips.
     *
     * Example: "Revenue aggregated by month for the West region"
     */
    description?: string;

    /**
     * How this table's data was produced:
     * - 'query': From a stored or ad-hoc SQL query
     * - 'view': From a MJ entity view (RunView)
     * - 'computed': Derived client-side (aggregation, pivot, transform)
     * - 'static': Inline data with no live source (e.g., manual input)
     * - 'other': Source doesn't fit the above categories
     */
    source?: 'query' | 'view' | 'computed' | 'static' | 'other';

    /**
     * Column definitions with type information and entity lineage.
     */
    columns: MJColumnDescriptor[];

    /**
     * The actual row data.
     * Flat key-value objects — matches the shape produced by
     * RunView, RunQuery, and all MJ data paths.
     */
    rows: Record<string, unknown>[];

    /**
     * How the data was produced, how much there is, how long it took.
     */
    metadata?: DataTableMetadata;

    // ─── PER-TABLE STATE (each table has its own) ───

    /** Pre-computed aggregations for this table's data */
    computations?: DataComputation[];

    /** Current sort state applied to this table */
    sorting?: Array<{ field: string; direction: 'asc' | 'desc' }>;

    /** Active filters on this table (uses existing filter types from ng-filter-builder, extracted to core) */
    activeFilters?: CompositeFilterDescriptor;

    /** Currently selected rows in this table */
    selectedRows?: Array<{ rowIndex: number; rowKey?: string; rowData?: Record<string, unknown> }>;

    /** Current page number (1-based) */
    pageNumber?: number;

    /** Create from a single-table DataSnapshot (legacy format) */
    static FromLegacySpec(spec: {
        source?: string; columns?: MJColumnDescriptor[]; rows?: Record<string, unknown>[];
        metadata?: DataTableMetadata; entityName?: string; extraFilter?: string;
        queryName?: string; queryCategoryPath?: string; parameters?: Record<string, string | number | boolean>;
    }, defaultName: string = 'results'): DataTable {
        const table = new DataTable();
        table.name = defaultName;
        table.source = spec.source as DataTable['source'];
        table.columns = spec.columns ?? [];
        table.rows = spec.rows ?? [];
        table.metadata = spec.metadata ? {
            ...spec.metadata,
            entityName: spec.entityName,
            extraFilter: spec.extraFilter,
            queryName: spec.queryName,
            queryCategoryPath: spec.queryCategoryPath,
            parameters: spec.parameters
        } : undefined;
        return table;
    }
}

/**
 * Metadata about how a DataTable's data was produced.
 * Every field is optional — populate what's available.
 */
export interface DataTableMetadata {
    /** SQL that produced this data (if source is 'query') */
    sql?: string;
    /** MJ entity name (if source is 'view') */
    entityName?: string;
    /** Extra WHERE filter applied (if source is 'view') */
    extraFilter?: string;
    /** Query name in MJ (if from a stored query) */
    queryName?: string;
    /** Query category path in MJ (if from a stored query) */
    queryCategoryPath?: string;
    /** Query parameters used */
    parameters?: Record<string, string | number | boolean>;
    /** Number of rows in the `rows[]` array (this page of results) */
    rowCount?: number;
    /** Starting row index in the full result set (0-based) */
    startRowIndex?: number;
    /** Page size used for this result set */
    pageSize?: number;
    /** Total rows available from the query/view (not the entire table) */
    totalAvailableRows?: number;
    /** Time to execute the query/view in milliseconds */
    executionTimeMs?: number;
    /** When this data was fetched (UTC) */
    fetchedAt?: Date;
    /** For computed tables: how the data was derived */
    computationDescription?: string;
}
```

> **Filter types:** `CompositeFilterDescriptor` and `FilterDescriptor` are extracted from `@memberjunction/ng-filter-builder` into `@memberjunction/core` so they're available to both the UI filter builder and the data layer. These support recursive AND/OR grouping — not flat filter lists. See the existing `FilterDescriptor`, `CompositeFilterDescriptor`, `FilterOperator` types in `packages/Angular/Generic/filter-builder/src/lib/types/`.

### 4.3 DataSnapshot

#### 4.3.1 New File: `packages/MJCore/src/generic/data-snapshot.ts`

```typescript
import { MJColumnDescriptor } from './column-descriptors';
import { DataTable, DataTableMetadata } from './data-table';

/**
 * A named, pre-computed aggregation or metric.
 */
export interface DataComputation {
    /** Display name: "Total Revenue", "Average Order Value" */
    name: string;
    /** Type of aggregation */
    type: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'distinct_count' | 'custom';
    /** Source field this computation operates on */
    field?: string;
    /** Which table this computation belongs to (for cross-table snapshots) */
    table?: string;
    /** The computed value */
    value: number | string | boolean;
    /** Human-formatted display value: "$1,234,567.89" */
    formattedValue?: string;
    /** Explanation of what this computation represents */
    description?: string;
}

/**
 * A point-in-time snapshot of one or more datasets with context.
 *
 * This is the **universal data exchange format** between components,
 * artifact viewers, agents, and persistence.
 *
 * Per-table state (sorting, filters, computations, paging, selection)
 * lives on each DataTable — not here. DataSnapshot holds only
 * component-level state that spans all tables.
 *
 * **Consumers should always call `NormalizeToTables()` to get a normalized
 * DataTable array** — this handles both multi-table and legacy
 * single-table formats.
 */
export class DataSnapshot {
    // ─── TABLES ───

    /** Named datasets — the core payload */
    tables?: DataTable[];

    // NOTE: Legacy single-table fields (source, queryName, columns, rows, etc.)
    // are NOT on this class. They exist only in persisted artifact JSON from
    // Query Builder. The viewer detects absence of `tables` and auto-converts
    // via DataTable.FromLegacySpec(). See NormalizeToTables() below.

    // ─── SHARED CONTEXT ───

    /** Display title */
    title?: string;

    /** How the data was obtained (markdown, may include Mermaid diagrams) */
    plan?: string;

    /**
     * What the data MEANS — patterns, insights, key takeaways.
     * Generated by agents when creating artifacts. Displayed as a
     * "Summary" or "Interpretation" section in the artifact viewer.
     *
     * Example: "Q4 West region revenue totals $4.5M (+12.3% YoY).
     * Top customer Acme Corp represents 15% of total revenue.
     * Growth is concentrated in the SaaS product line (+28%)
     * while hardware declined (-3%)."
     */
    interpretation?: string;

    /** Cross-table computations (rare — most computations live on individual DataTables) */
    computations?: DataComputation[];

    // ─── COMPONENT-LEVEL STATE (spans all tables) ───

    /** Drill-down breadcrumb path: ["All Regions", "West", "California"] */
    drillPath?: string[];

    /** Which tab/view/section is currently active */
    activeTab?: string;

    /** Search/filter text entered by user (component-wide) */
    searchText?: string;

    /** Component-specific state not covered above */
    custom?: Record<string, unknown>;

    // ─── QUERY SAVE TRACKING ───

    savedQueryId?: string;
    savedQueryName?: string;
    savedAtVersionNumber?: number;

    // ─── FACTORY METHODS ───

    /** Check whether this snapshot has multiple tables */
    get IsMultiTable(): boolean {
        return !!(this.tables && this.tables.length > 1);
    }

    /** Create from a single DataTable */
    static FromTable(table: DataTable, title?: string): DataSnapshot {
        const snap = new DataSnapshot();
        snap.tables = [table];
        snap.title = title;
        return snap;
    }

    /** Create from multiple DataTables */
    static FromTables(tables: DataTable[], title?: string): DataSnapshot {
        const snap = new DataSnapshot();
        snap.tables = tables;
        snap.title = title;
        return snap;
    }
}

/**
 * Backward compatibility alias.
 * Existing code that references DataArtifactSpec continues to work.
 */
export type DataArtifactSpec = DataSnapshot;
```

### 4.4 Normalization Helpers

In the same file (`data-snapshot.ts`):

```typescript
/**
 * Normalize any DataSnapshot (or legacy artifact JSON) to always use the `tables[]` array format.
 *
 * - Multi-table snapshots: returns the tables array as-is
 * - Legacy single-table JSON (from Query Builder): wraps root-level fields into a single DataTable
 * - Empty snapshots: returns []
 *
 * The `Record<string, unknown>` input type handles legacy artifact JSON that was persisted
 * before the `tables[]` format existed. These have root-level `source`, `columns`, `rows`,
 * `metadata` etc. that are not on the DataSnapshot class but exist in stored JSON.
 *
 * After calling this, consumers never need to check root-level fields.
 * This is the standard entry point for all snapshot processing.
 *
 * @param snap - The snapshot (or deserialized legacy JSON) to normalize
 * @param defaultTableName - Name for the implicit table when converting from single-table
 * @returns Array of DataTable objects
 */
export function NormalizeToTables(
    snap: DataSnapshot | Record<string, unknown>,
    defaultTableName: string = 'results'
): DataTable[] {
    const s = snap as Record<string, unknown>;

    // Multi-table: tables array is authoritative
    if (Array.isArray(s.tables) && s.tables.length > 0) {
        return s.tables as DataTable[];
    }

    // Legacy single-table: wrap root-level fields via factory method
    if (s.rows || s.columns || (s.metadata as Record<string, unknown>)?.sql) {
        return [DataTable.FromLegacySpec(s as Parameters<typeof DataTable.FromLegacySpec>[0], defaultTableName)];
    }

    // Empty (context-only snapshot)
    return [];
}

/**
 * Get the total row count across all tables in a snapshot.
 */
export function TotalRowCount(snap: DataSnapshot | Record<string, unknown>): number {
    return NormalizeToTables(snap).reduce(
        (sum, table) => sum + (table.metadata?.rowCount ?? table.rows.length),
        0
    );
}

/**
 * Get the total available row count across all tables
 * (the full dataset size, not just the current page).
 */
export function TotalAvailableRowCount(snap: DataSnapshot | Record<string, unknown>): number {
    return NormalizeToTables(snap).reduce(
        (sum, table) => sum + (
            table.metadata?.totalAvailableRows ??
            table.metadata?.rowCount ??
            table.rows.length
        ),
        0
    );
}
```

### 4.5 Package Location & Exports

The foundational data types go in `@memberjunction/core` (`packages/MJCore/`). These are framework-level constructs used by server-side code, agents, export utilities, and any package that deals with tabular data — not just interactive components.

The component-specific types (event system, `ComponentObject` updates) stay in `@memberjunction/interactive-component-types` (`packages/InteractiveComponents/`), which imports from `@memberjunction/core`.

Add to `packages/MJCore/src/index.ts`:
```typescript
export * from './generic/column-descriptors';
export * from './generic/data-table';
export * from './generic/data-snapshot';
```

### 4.6 Backward Compatibility

**DataArtifactSpec alias:** The `DataArtifactSpec` type alias ensures existing code that references the old name continues to compile.

**Legacy single-table JSON:** Existing artifact JSON from Query Builder has root-level `source`, `columns`, `rows`, `metadata` fields. These fields are NOT on the `DataSnapshot` class — the class only has `tables[]`. Instead, `NormalizeToTables()` accepts `Record<string, unknown>` and detects the legacy shape, converting it via `DataTable.FromLegacySpec()`. The artifact viewer calls `NormalizeToTables()` on the deserialized JSON, so legacy artifacts render without migration.

**DataArtifactColumn:** The existing `DataArtifactColumn` fields (`field`, `headerName`, `width`, `sourceEntity`, `sourceFieldName`, `isComputed`, `isSummary`, `sqlBaseType`) are a subset of `MJColumnDescriptor`. The rename from `headerName` to `displayName` is the only naming change — the data artifact viewer migration (Phase 5) handles this.

### 4.7 Unit Tests

Add `packages/MJCore/src/__tests__/core-types.test.ts`:

- `NormalizeToTables()` with single-table spec returns one table
- `NormalizeToTables()` with multi-table spec returns tables array unchanged
- `NormalizeToTables()` with empty spec returns empty array
- `NormalizeToTables()` preserves metadata fields during single→multi conversion
- `IsMultiTable()` returns correct boolean for various inputs
- `TotalRowCount()` sums across multiple tables
- `TotalAvailableRowCount()` uses totalAvailableRows when present
- `MJColumnDescriptor.FromColumnDescriptor()` correctly populates sourceEntity/sourceFieldName
- `GridColumnDescriptor.FromMJColumn()` sets sensible defaults for all grid flags
- `GridColumnDescriptor.ToMJColumn()` strips grid-only properties
- `MJColumnDescriptor.FromSimpleQueryField()` correctly converts from legacy type
- Backward compatibility: existing single-table DataArtifactSpec shape is valid DataSnapshot
- Type compatibility: MJColumnDescriptor is assignable to ColumnDescriptor

---

## 5. Component Event System

### 5.1 Overview

Add runtime event notification to interactive components by extending the existing `ComponentCallbacks` interface with a `NotifyEvent` method. Components call `callbacks.NotifyEvent()` to notify their container of events. Containers handle routing — no separate event bus class needed.

The existing `ComponentEvent` metadata in `ComponentSpec` already declares what events a component CAN emit. This section adds the runtime mechanism.

### 5.2 Design Principles

1. **Use existing plumbing**: `ComponentCallbacks` is already passed to every React component. Add `NotifyEvent` there — don't create a parallel system.
2. **Before/After pattern**: Before events carry a `cancel` flag; setting `true` prevents default behavior. After events report success/error/metrics.
3. **Component doesn't care who listens**: Component always calls `callbacks.NotifyEvent()`. If the container doesn't care, it simply doesn't handle it.
4. **Sync cancellation via mutation**: Container sets `args.cancel = true` synchronously. Component checks after `await` resolves.
5. **Per-component event shapes**: Each component defines its own event properties. Only base interfaces (`BaseEventArgs`, `CancelableEventArgs`, `AfterEventArgs`) are shared types.

### 5.3 Base Event Interfaces

Only three shared interfaces in `packages/InteractiveComponents/src/component-events.ts`. Each component defines its own event properties on top of these — no shared per-event-type interfaces.

```typescript
/** Base for all component event arguments */
export interface BaseEventArgs {
    timestamp: Date;
    sourceComponentName?: string;
}

/** Base for Before events that support cancellation */
export interface CancelableEventArgs extends BaseEventArgs {
    cancel: boolean;
    cancelReason?: string;
}

/** Base for After events that report on completed operations */
export interface AfterEventArgs extends BaseEventArgs {
    success: boolean;
    errorMessage?: string;
    durationMs?: number;
}
```

### 5.4 NotifyEvent on ComponentCallbacks

Add to the existing `ComponentCallbacks` interface in `runtime-types.ts`:

```typescript
interface ComponentCallbacks {
    OpenEntityRecord: (entityName: string, key: CompositeKey) => void;
    CreateSimpleNotification: (message: string, style: string, hideAfter?: number) => void;
    RegisterMethod: (methodName: string, handler: Function) => void;

    /**
     * Notify the container of a component event.
     * For cancelable events, the container can set args.cancel = true
     * before the await resolves.
     */
    NotifyEvent: (eventName: string, args: BaseEventArgs) => Promise<void>;
}
```

**How it works:**

React component emits an event:
```typescript
const args = { timestamp: new Date(), cancel: false, filter: newFilter };
await callbacks.NotifyEvent('beforeFilterChange', args);
if (args.cancel) return; // container blocked this
// proceed with filter change
```

Angular bridge (`MJReactComponent`) wires `NotifyEvent` to emit on the existing `componentEvent` EventEmitter:
```typescript
NotifyEvent: async (eventName: string, args: BaseEventArgs) => {
    this.componentEvent.emit({ type: eventName, payload: args });
}
```

Parent Angular component subscribes via the existing template binding:
```html
<mj-react-component (componentEvent)="OnComponentEvent()">
```

### 5.5 Update ComponentSpec Events Metadata

In `component-props-events.ts`, enhance `ComponentEvent`:

```typescript
export interface ComponentEvent {
    name: string;
    description: string;
    parameters?: ComponentEventParameter[];
    /** Whether this is a cancelable "before" event */
    cancelable?: boolean;
    /** The paired "after" event name (if this is a "before" event) */
    pairedEvent?: string;
}
```

### 5.6 Unit Tests

- `NotifyEvent` callback fires when component calls it
- Cancelable events: setting `cancel = true` prevents component default behavior
- After events: `success` and `durationMs` are populated
- Container ignoring events (no handler) doesn't break the component

---

## 6. Artifact-Level State Snapshots

### 6.1 Overview

Add `GetCurrentStateSnapshot()` to `BaseArtifactViewerPluginComponent` so that ALL artifact viewer plugins inherit a standard mechanism for exposing their current state. Each plugin type overrides this to return type-appropriate structured data.

### 6.2 Changes to BaseArtifactViewerPluginComponent

In `packages/Angular/Generic/artifacts/src/lib/components/base-artifact-viewer.component.ts`:

```typescript
import { DataSnapshot } from '@memberjunction/core';

export abstract class BaseArtifactViewerPluginComponent implements IArtifactViewerComponent {
    // ... existing code ...

    /**
     * Returns a point-in-time snapshot of this artifact's current state.
     *
     * Abstract — every viewer plugin MUST implement this with a semantically
     * appropriate result for its content type. No lazy default implementation.
     *
     * Always returns DataSnapshot (not Record<string, unknown>) — we defined
     * a standard type, use it. Non-tabular viewers return DataSnapshot with
     * empty tables[] and context in interpretation/custom fields.
     *
     * @returns Structured snapshot, or null if unavailable
     */
    public abstract GetCurrentStateSnapshot(): DataSnapshot | null;

    // Future: SetDataState(snapshot: DataSnapshot) will allow rehydrating
    // a viewer with a previously captured snapshot — enabling "show this
    // artifact as of Tuesday" by loading a prior artifact version's snapshot
    // into a live viewer. The get side (above) ships now; the set side is
    // scaffolded in ComponentObject (Section 9) for near-term follow-up.

    /**
     * Get the raw string content of this artifact.
     * Subclasses may override for custom content extraction.
     */
    protected getRawContent(): string | null {
        return this.artifactVersion?.Content ?? null;
    }

    /**
     * Get the title for this artifact, or null if unavailable.
     */
    protected getDisplayTitle(): string | null {
        return this.artifactVersion?.ArtifactName ?? null;
    }
}
```

### 6.3 Data Artifact Viewer Override

In `data-artifact-viewer.component.ts`:

```typescript
/**
 * Returns a DataSnapshot with live grid data, current page state,
 * and query sync state.
 */
public override GetCurrentStateSnapshot(): DataSnapshot | null {
    if (!this.spec) return null;

    // Normalize to tables (handles both legacy single-table and multi-table)
    const tables = NormalizeToTables(this.spec, this.spec.title || 'Results');
    const activeTable = tables[this.ActiveTableIndex];

    if (activeTable) {
        // Override with live data for the active table
        if (this.IsLive) activeTable.rows = this.GridData;
        activeTable.pageNumber = this.PagerPageNumber;
        activeTable.metadata = {
            ...activeTable.metadata,
            ...(this.liveRowCount != null ? { rowCount: this.liveRowCount } : {}),
            ...(this.liveExecutionTime != null
                ? { executionTimeMs: this.liveExecutionTime } : {}),
            ...(this.PagerTotalRowCount > 0
                ? { totalAvailableRows: this.PagerTotalRowCount } : {}),
            pageSize: this.PagerPageSize
        };
    }

    return DataSnapshot.FromTables(tables, this.spec.title);
}
```

### 6.4 Component Artifact Viewer Override

In `component-artifact-viewer.component.ts`:

```typescript
/**
 * Returns a DataSnapshot from the running React component's
 * getCurrentDataState(). Returns null if the component
 * doesn't implement it.
 */
public override GetCurrentStateSnapshot(): DataSnapshot | null {
    // Get structured data from the running React component
    const reactState = this.reactComponent?.componentObject?.getCurrentDataState?.();
    if (reactState) {
        return reactState as DataSnapshot;
    }

    return null;
}
```

### 6.5 JSON Artifact Viewer Override

```typescript
public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const parsed = this.parseJsonContent<Record<string, unknown>>();
    if (!parsed) return null;

    const snap = new DataSnapshot();
    snap.title = this.getDisplayTitle() ?? undefined;
    snap.interpretation = `JSON artifact with ${Object.keys(parsed).length} top-level keys.`;
    snap.custom = parsed;
    return snap;
}
```

### 6.6 Code Artifact Viewer Override

```typescript
public override GetCurrentStateSnapshot(): DataSnapshot | null {
    const content = this.getRawContent();
    if (!content) return null;

    const snap = new DataSnapshot();
    snap.title = this.getDisplayTitle() ?? undefined;
    snap.interpretation = `${this.detectedLanguage || 'Unknown language'} code, ${content.split('\n').length} lines.`;
    snap.custom = {
        language: this.detectedLanguage || 'unknown',
        content: content,
        lineCount: content.split('\n').length
    };
    return snap;
}
```

### 6.7 Panel Passthrough

In `artifact-viewer-panel.component.ts`:

```typescript
/**
 * Get a snapshot of the currently displayed artifact's state.
 * Delegates to the active plugin's GetCurrentStateSnapshot().
 *
 * @returns Snapshot, or null if no plugin is active
 */
public GetCurrentStateSnapshot(): DataSnapshot | null {
    return this.activePlugin?.GetCurrentStateSnapshot() ?? null;
}
```

---

## 7. Multi-Table Viewer UX

### 7.1 Overview

Update `DataArtifactViewerComponent` to render multi-table snapshots with a tabbed interface. Single-table snapshots display identically to today — no tabs, just the grid. Multi-table snapshots show a tab strip between the toolbar and grid.

### 7.2 UX Design

#### Single Table (No Change)

```
┌─────────────────────────────────────────────────────┐
│ 📊 Data Results        Live  1,247 rows  145ms      │
│                                          [Refresh]  │
├─────────────────────────────────────────────────────┤
│  ┌──────┬──────────────┬──────────┬───────────────┐ │
│  │ ID   │ Customer     │ Revenue  │ Region        │ │
│  ├──────┼──────────────┼──────────┼───────────────┤ │
│  │ 001  │ Acme Corp    │ $45,000  │ West          │ │
│  │ 002  │ Globex Inc   │ $38,000  │ East          │ │
│  └──────┴──────────────┴──────────┴───────────────┘ │
│  Page 1 of 13  [< 1 2 3 ... 13 >]                  │
└─────────────────────────────────────────────────────┘
```

#### Multiple Tables

```
┌─────────────────────────────────────────────────────┐
│ 📊 Sales Dashboard Q4   Live                        │
│                                          [Refresh]  │
├─────────────────────────────────────────────────────┤
│  ┌──────────────┬─────────────────┬────────────────┐│
│  │▸ Customers   │  Revenue by Mo  │  Top Products  ││
│  │  (847 rows)  │  (12 rows)      │  (25 rows)     ││
│  └──────────────┴─────────────────┴────────────────┘│
├─────────────────────────────────────────────────────┤
│  ┌──────┬──────────────┬──────────┬───────────────┐ │
│  │ ID   │ Customer     │ Revenue  │ Region        │ │
│  ├──────┼──────────────┼──────────┼───────────────┤ │
│  │ 001  │ Acme Corp    │ $45,000  │ West          │ │
│  └──────┴──────────────┴──────────┴───────────────┘ │
│  Page 1 of 9  [< 1 2 3 ... 9 >]                    │
└─────────────────────────────────────────────────────┘
```

### 7.3 Component Changes

#### New Properties

```typescript
/** All resolved tables (from multi-table or wrapped single-table) */
public ResolvedTables: DataTable[] = [];

/** Index of the currently active table tab */
public ActiveTableIndex = 0;

/** Per-table paging state */
private tablePageState: Map<number, {
    pageNumber: number;
    pageSize: number;
    totalRowCount: number;
}> = new Map();

/** Per-table live data cache (loaded lazily on tab switch) */
private tableDataCache: Map<number, Record<string, unknown>[]> = new Map();

/** Per-table column configs cache */
private tableColumnConfigsCache: Map<number, GridColumnDescriptor[]> = new Map();

/** Whether we're in multi-table mode */
public get IsMultiTable(): boolean {
    return this.ResolvedTables.length > 1;
}

/** The currently active table */
public get ActiveTable(): DataTable | null {
    return this.ResolvedTables[this.ActiveTableIndex] ?? null;
}
```

#### Initialization Changes

In `ngOnInit()`, use `NormalizeToTables()` to resolve all tables:

```typescript
import { NormalizeToTables } from '@memberjunction/core';

async ngOnInit(): Promise<void> {
    this.spec = this.parseJsonContent<DataSnapshot>();
    if (!this.spec) { /* error handling */ return; }

    // Resolve to tables array (handles both single and multi-table)
    this.ResolvedTables = NormalizeToTables(this.spec, this.spec.title || 'Results');

    if (this.ResolvedTables.length === 0) {
        // Plan-only or empty — existing behavior
        return;
    }

    // Build column configs for the first (or only) table
    this.GridColumnConfigs = this.BuildColumnConfigsForTable(this.ResolvedTables[0]);

    // Initialize paging state for all tables
    for (let i = 0; i < this.ResolvedTables.length; i++) {
        this.tablePageState.set(i, { pageNumber: 1, pageSize: 100, totalRowCount: 0 });
    }

    // Load data for the active table
    this.IsLoading = true;
    await this.LoadTableData(0);
}
```

#### Tab Switching

```typescript
/**
 * Switch to a different table tab.
 * Loads data lazily if not already cached.
 */
public async OnTableTabClick(index: number): Promise<void> {
    if (index === this.ActiveTableIndex) return;
    this.ActiveTableIndex = index;

    const table = this.ResolvedTables[index];
    if (!table) return;

    // Use cached column configs or build new
    if (!this.tableColumnConfigsCache.has(index)) {
        this.tableColumnConfigsCache.set(index, this.BuildColumnConfigsForTable(table));
    }
    this.GridColumnConfigs = this.tableColumnConfigsCache.get(index)!;

    // Use cached data or load fresh
    if (this.tableDataCache.has(index)) {
        this.GridData = this.tableDataCache.get(index)!;
        const pageState = this.tablePageState.get(index)!;
        this.PagerPageNumber = pageState.pageNumber;
        this.PagerPageSize = pageState.pageSize;
        this.PagerTotalRowCount = pageState.totalRowCount;
    } else {
        await this.LoadTableData(index);
    }

    this.cdr.detectChanges();
}
```

#### Per-Table Data Loading

```typescript
/**
 * Load data for a specific table.
 * Handles live SQL execution, inline rows, and caching.
 */
private async LoadTableData(tableIndex: number): Promise<void> {
    const table = this.ResolvedTables[tableIndex];
    if (!table) return;

    this.IsLoading = true;
    this.HasError = false;
    this.cdr.detectChanges();

    try {
        if (table.metadata?.sql) {
            // Live SQL execution
            const pageState = this.tablePageState.get(tableIndex)!;
            const rq = new RunQuery();
            const result = await rq.RunQuery({
                SQL: table.metadata.sql,
                StartRow: (pageState.pageNumber - 1) * pageState.pageSize,
                MaxRows: pageState.pageSize
            });

            if (result.Success) {
                this.tableDataCache.set(tableIndex, result.Results);
                this.GridData = result.Results;
                this.IsLive = true;

                pageState.totalRowCount =
                    result.TotalRowCount ?? result.RowCount ?? 0;
                this.PagerTotalRowCount = pageState.totalRowCount;
                this.PagerPageNumber = pageState.pageNumber;
                this.PagerPageSize = pageState.pageSize;

                this.liveRowCount = result.RowCount;
                this.liveExecutionTime = result.ExecutionTime;
            } else {
                this.HandleTableError(
                    tableIndex,
                    result.ErrorMessage || 'Query failed'
                );
            }
        } else if (table.rows && table.rows.length > 0) {
            // Inline data — also the path used for rehydrating from a
            // previously saved snapshot (future: setDataState loads a
            // prior DataSnapshot and the viewer renders its inline rows)
            this.tableDataCache.set(tableIndex, table.rows);
            this.GridData = table.rows;
            this.liveRowCount = table.rows.length;
        } else {
            this.GridData = [];
        }
    } catch (error) {
        this.HandleTableError(
            tableIndex,
            error instanceof Error ? error.message : 'Load failed'
        );
    } finally {
        this.IsLoading = false;
        this.cdr.detectChanges();
    }
}
```

#### Per-Table Page Change

```typescript
public async OnPageChange(event: PageChangeEvent): Promise<void> {
    const pageState = this.tablePageState.get(this.ActiveTableIndex);
    if (!pageState) return;

    pageState.pageNumber = event.PageNumber;
    pageState.pageSize = event.PageSize;

    // Clear cache for this table so it reloads
    this.tableDataCache.delete(this.ActiveTableIndex);

    await this.LoadTableData(this.ActiveTableIndex);
}
```

### 7.4 Template Changes

In `data-artifact-viewer.component.html`, add between toolbar and grid:

```html
<!-- Multi-table tab strip -->
@if (IsMultiTable) {
  <div class="table-tabs">
    @for (table of ResolvedTables; track table.name; let i = $index) {
      <button
        class="table-tab"
        [class.active]="i === ActiveTableIndex"
        [title]="table.description || table.name"
        (click)="OnTableTabClick(i)">
        <span class="table-tab-name">{{ table.name }}</span>
        @if (table.metadata?.rowCount != null || table.rows?.length) {
          <span class="table-tab-count">
            ({{ table.metadata?.rowCount ?? table.rows?.length }} rows)
          </span>
        }
      </button>
    }
  </div>
}

<!-- Computations summary bar -->
@if (spec?.computations?.length) {
  <div class="computations-bar">
    @for (comp of spec.computations; track comp.name) {
      @if (!IsMultiTable || !comp.table || comp.table === ActiveTable?.name) {
        <div class="computation-chip" [title]="comp.description || comp.name">
          <span class="computation-label">{{ comp.name }}</span>
          <span class="computation-value">
            {{ comp.formattedValue || comp.value }}
          </span>
        </div>
      }
    }
  </div>
}
```

### 7.5 Styles

In `data-artifact-viewer.component.css`:

```css
/* ─── Table Tab Strip ─── */

.table-tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--mj-border-default);
    padding: 0 var(--mj-spacing-md, 16px);
    background: var(--mj-bg-surface);
    overflow-x: auto;
}

.table-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--mj-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: color 150ms ease, border-color 150ms ease;
    white-space: nowrap;
}

.table-tab:hover {
    color: var(--mj-text-primary);
    background: var(--mj-bg-surface-hover);
}

.table-tab.active {
    color: var(--mj-brand-primary);
    border-bottom-color: var(--mj-brand-primary);
}

.table-tab-name {
    text-transform: capitalize;
}

.table-tab-count {
    color: var(--mj-text-muted);
    font-weight: 400;
    font-size: 12px;
}

.table-tab.active .table-tab-count {
    color: var(--mj-brand-primary);
    opacity: 0.7;
}

/* ─── Computations Summary Bar ─── */

.computations-bar {
    display: flex;
    gap: 12px;
    padding: 8px 16px;
    background: var(--mj-bg-surface-card);
    border-bottom: 1px solid var(--mj-border-subtle);
    overflow-x: auto;
    flex-wrap: wrap;
}

.computation-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: var(--mj-bg-surface);
    border: 1px solid var(--mj-border-default);
    border-radius: 16px;
    font-size: 13px;
    white-space: nowrap;
}

.computation-label {
    color: var(--mj-text-secondary);
    font-weight: 400;
}

.computation-value {
    color: var(--mj-text-primary);
    font-weight: 600;
}
```

### 7.6 Additional Tabs

Update `GetAdditionalTabs()` for multi-table SQL and interpretation:

```typescript
public override GetAdditionalTabs(): ArtifactViewerTab[] {
    const tabs: ArtifactViewerTab[] = [];

    // Plan tab
    if (this.spec?.plan) {
        tabs.push({
            label: 'Plan',
            icon: 'fa-diagram-project',
            contentType: 'markdown',
            content: () => this.spec!.plan!
        });
    }

    // SQL tab — multi-table shows all queries with headers
    if (this.IsMultiTable) {
        const sqlTables = this.ResolvedTables.filter(t => t.metadata?.sql);
        if (sqlTables.length > 0) {
            tabs.push({
                label: 'SQL',
                icon: 'fa-code',
                contentType: 'code',
                content: () => sqlTables.map(t =>
                    `-- ═══ ${t.name} ═══\n${t.metadata!.sql!}`
                ).join('\n\n'),
                language: 'sql'
            });
        }
    } else if (this.spec?.metadata?.sql) {
        tabs.push({
            label: 'SQL',
            icon: 'fa-code',
            contentType: 'code',
            content: () => this.spec!.metadata!.sql!,
            language: 'sql'
        });
    }

    // Interpretation tab
    if (this.spec?.interpretation) {
        tabs.push({
            label: 'Interpretation',
            icon: 'fa-lightbulb',
            contentType: 'markdown',
            content: () => this.spec!.interpretation!
        });
    }

    return tabs;
}
```

### 7.7 Migration: Remove Local Interfaces

Remove the local `DataArtifactSpec` and `DataArtifactColumn` interfaces from `data-artifact-viewer.component.ts`. Import from `@memberjunction/core` instead:

```typescript
import {
    DataSnapshot, DataArtifactSpec, DataTable, MJColumnDescriptor,
    NormalizeToTables
} from '@memberjunction/core';
```

---

## 8. Artifact Tools: Agent Artifact Access

### 8.1 Overview

Add **Artifact Tools** as a 5th agent primitive in the MJ agent architecture, alongside actions, subagents, scratchpad, and client tools. Artifact Tools give agents the ability to explore input artifacts on demand rather than having full artifact content dumped into context.

This is modeled after the Scratchpad pattern (`packages/AI/Agents/src/ScratchpadManager.ts`): the agent sees a manifest of available artifacts injected into its prompt each turn, then uses type-specific tools to request the specific content it needs.

### 8.2 Current Agent Primitives

| Primitive | Purpose | How It Works |
|---|---|---|
| **Actions** | Execute business logic (web search, DB query, etc.) | Agent calls tool → execution → result as message → next LLM turn |
| **Subagents** | Delegate to specialized agents | Agent spawns child run → result returned |
| **Scratchpad** | Private working memory (notes + task list) | First-class response field, processed inline, zero turn cost |
| **Client Tools** | Interactive UI control (open dialog, switch view) | Agent sends command → UI executes → may pause for user input |
| **Artifact Tools** | Explore input artifacts | **NEW** — Agent sees manifest → calls type-specific tools → sips content |

### 8.3 How Artifact Tools Work

**Step 1 — Artifact Manifest Injection:**

When an agent run starts with input artifacts, the system injects a manifest into the system prompt (same pattern as Scratchpad):

```
You have the following input artifacts available:

[artifact-1] Data Snapshot: "Sales Dashboard Q4" (3 tables)
  - monthly_revenue: 12 rows, 5 columns (Month, Revenue, Growth, Region, Category)
  - top_customers: 847 rows, 8 columns (Name, Revenue, Region, ...)
  - product_mix: 25 rows, 4 columns (Product, Units, Revenue, Margin)

[artifact-2] PDF: "Q4 Board Report" (47 pages, 2.3 MB)

[artifact-3] Excel: "Budget Forecast.xlsx" (3 sheets: Summary, Detail, Assumptions)

Use the artifact tools below to explore artifact content as needed.
Do not request entire large artifacts — request specific slices.
For small artifacts (< 50 rows or < 2 pages), you may request the full content.
```

**Step 2 — Agent Calls Artifact Tools:**

The agent decides what it needs and calls tools:

```json
{ "name": "artifact_get_rows", "input": { "artifactId": "artifact-1", "table": "top_customers", "start": 0, "count": 10 } }
```

**Step 3 — Tool Handler Executes Locally:**

The tool handler runs on the server against the in-memory artifact content. Only the requested slice is returned as a tool result to the LLM. The full artifact data never leaves the server unless the agent specifically requests it.

**Step 4 — Agent Iterates:**

The agent can make multiple tool calls across turns to explore the artifact, just like it calls actions. It builds understanding incrementally.

### 8.4 Plugin-Based Tool Architecture

Artifact tools are **extensible via a plugin system** tied to `MJ: Artifact Types`. Each artifact type (or sub-type) can register a tool library class that provides type-specific tools.

> **Key finding:** `MJ: Artifact Types` already has a `ParentID` field (added in migration `V202510081612`). This means artifact type hierarchies already exist — "Data Snapshot" can be a sub-type of "JSON", and "PDF"/"Word"/"Excel" can be sub-types of a "Document" parent. Tool libraries registered on a parent type are inherited by child types, with child types able to override or extend.

**New metadata on `MJ: Artifact Types`:**
- `ToolLibraryClass: nvarchar(100) NULL` — class name for the tool library (e.g., `DataSnapshotToolLibrary`, `JSONToolLibrary`, `PDFToolLibrary`)

**Base class:**
```typescript
// packages/AI/Agents/src/artifact-tools/BaseArtifactToolLibrary.ts

/**
 * Base class for artifact type-specific tool libraries.
 * Each artifact type can register a subclass that provides
 * tools for agents to explore artifacts of that type.
 *
 * Tool libraries are instantiated by the ArtifactToolManager when
 * an agent run includes input artifacts of the corresponding type.
 * Tools from parent artifact types are inherited — child types
 * can override or add additional tools.
 */
export abstract class BaseArtifactToolLibrary {
    /** Return the list of tools this library provides */
    abstract GetToolList(): ArtifactToolDefinition[];

    /** Invoke a tool by name with the given input */
    abstract InvokeTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult>;
}

export interface ArtifactToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface ArtifactToolResult {
    success: boolean;
    data: unknown;
    errorMessage?: string;
}
```

### 8.4.1 Type-Specific Tool Libraries

Each artifact type provides its own set of tools via a registered `BaseArtifactToolLibrary` subclass. The system auto-injects the appropriate tools based on the input artifact types. Tools from parent types are inherited (e.g., all JSON sub-types get JSON path tools).

**Data Snapshot tools** (`DataSnapshotToolLibrary`):

| Tool | Input | Returns |
|---|---|---|
| `artifact_get_tables` | `artifactId` | Table names, row counts, column schemas |
| `artifact_get_schema` | `artifactId, table` | Column names, types, descriptions |
| `artifact_get_rows` | `artifactId, table, start, count` | Rows as JSON array |
| `artifact_search_rows` | `artifactId, table, field, operator, value` | Matching rows |
| `artifact_aggregate` | `artifactId, table, field, operation` | Computed value (sum, avg, count, etc.) |
| `artifact_get_full` | `artifactId` | Full artifact content (for small artifacts only) |

**JSON tools** (`JSONToolLibrary` — inherited by Data Snapshot and all JSON sub-types):

| Tool | Input | Returns |
|---|---|---|
| `artifact_json_path` | `artifactId, path` | Value at JSON path (e.g., `$.tables[0].rows`) |
| `artifact_json_keys` | `artifactId, path?` | Keys at the given path (or root) |
| `artifact_json_search` | `artifactId, key, pattern` | Matching values with paths (regex on sub-keys) |
| `artifact_json_iterate` | `artifactId, arrayPath, start, count` | Slice of an array at the given path |

**PDF tools** (`PDFToolLibrary`):

| Tool | Input | Returns |
|---|---|---|
| `artifact_get_page_count` | `artifactId` | Number of pages |
| `artifact_get_text` | `artifactId, startPage, endPage` | Extracted text for page range |
| `artifact_search_text` | `artifactId, query` | Matching text passages with page numbers |
| `artifact_get_tables` | `artifactId, page?` | Extracted tables as structured data (rows/columns) |
| `artifact_get_images` | `artifactId, page?` | Image metadata (dimensions, alt text, page location) |
| `artifact_get_metadata` | `artifactId` | Document metadata (title, author, creation date, etc.) |
| `artifact_get_toc` | `artifactId` | Table of contents / outline structure |

> PDF image/table reasoning requires good extraction libraries (e.g., `pdf-parse`, `tabula-js` for tables, image extraction via `pdf-lib`). These tools return structured data the LLM can reason over.

**Excel tools** (`ExcelToolLibrary`):

| Tool | Input | Returns |
|---|---|---|
| `artifact_get_sheets` | `artifactId` | Sheet names, dimensions, visibility |
| `artifact_get_sheet_data` | `artifactId, sheet, range?` | Cell data (optional A1-notation range) |
| `artifact_get_cell` | `artifactId, sheet, cell` | Single cell value, formula, and format |
| `artifact_get_formulas` | `artifactId, sheet, range?` | Formulas in the range (not computed values) |
| `artifact_get_named_ranges` | `artifactId` | Named ranges and their definitions |
| `artifact_search_cells` | `artifactId, query` | Matching cells with sheet/cell references |
| `artifact_get_charts` | `artifactId, sheet?` | Chart metadata (type, data ranges, titles) |
| `artifact_get_pivot_tables` | `artifactId, sheet?` | Pivot table structure and source ranges |
| `artifact_aggregate_column` | `artifactId, sheet, column, operation` | Computed aggregate over a column |

**Text tools** (`TextToolLibrary` — inherited by all text-based artifact types):

| Tool | Input | Returns |
|---|---|---|
| `artifact_grep` | `artifactId, pattern, flags?` | Matching lines with line numbers (regex) |
| `artifact_get_lines` | `artifactId, start, count` | Lines from the content |
| `artifact_search_replace` | `artifactId, search, replace` | Preview of replacements (for mutable artifacts) |

> **Note on mutability:** Whether an artifact is writable by an agent is a design question deferred to v2. For now, all artifact tools are **read-only**. Mutation tools (like `search_replace`) would preview changes but not apply them.

**CSV/YAML tools** (future — similar structured-text libraries for CSV, YAML, and other formats):

| Tool | Input | Returns |
|---|---|---|
| `artifact_csv_get_headers` | `artifactId` | Column headers |
| `artifact_csv_get_rows` | `artifactId, start, count` | Rows as arrays |
| `artifact_yaml_path` | `artifactId, path` | Value at YAML path |

**Generic tools** (all types — provided by `BaseArtifactToolLibrary`):

| Tool | Input | Returns |
|---|---|---|
| `artifact_get_size` | `artifactId` | Size in bytes/rows/pages (type-dependent) |
| `artifact_get_content` | `artifactId` | Full content (for small artifacts) |

### 8.5 Implementation: ArtifactToolManager

Following the `ScratchpadManager` pattern, create an `ArtifactToolManager` that:

1. Is instantiated once per agent run
2. Holds references to all input artifacts for that run
3. Generates the manifest string for prompt injection
4. Provides methods that tool handlers call to access artifact content
5. Tracks which artifacts/slices were accessed (for audit/training data)

See Section 8.6.4 for the full `ArtifactToolManager` API. The individual tool handler methods (GetRows, SearchRows, Aggregate, etc.) are delegated to the type-specific `BaseArtifactToolLibrary` instances — the manager itself doesn't hard-code any artifact-type-specific logic.

### 8.6 Integration Into Agent Execution Loop

Artifact tools follow the **Scratchpad pattern** exactly — a first-class response field in `LoopAgentResponse`, processed inline with zero extra LLM calls, state carrying forward across turns. This is **NOT** an action, NOT an LLM SDK tool definition — it's a parallel pathway alongside `scratchpad`, `payloadChangeRequest`, `actions`, etc.

> **Key insight from studying the code:** The MJ agent system does NOT use LLM SDK tool registration. Actions are documented in the prompt as markdown text. The LLM outputs structured JSON with action names. The agent validates and executes them. Scratchpad works the same way — documented in prompt, LLM outputs changes as a response field, agent processes inline. Artifact tools must follow this same pattern.

#### 8.6.1 New Response Field on LoopAgentResponse

In `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts`, add a new field parallel to `scratchpad`:

```typescript
export interface LoopAgentResponse<P = any> {
    taskComplete?: boolean;
    message?: string;
    responseForm?: AgentResponseForm;
    actionableCommands?: ActionableCommand[];
    automaticCommands?: AutomaticCommand[];
    payloadChangeRequest?: AgentPayloadChangeRequest<P>;
    scratchpad?: AgentScratchpad;

    /**
     * Artifact tool invocations — explore input artifacts without
     * dumping full content into context. Processed inline on the same
     * turn as other response fields (zero turn cost). Results are
     * injected into the next turn's prompt via _ARTIFACT_TOOL_RESULTS.
     *
     * The LLM sees the artifact manifest and tool documentation in the
     * prompt, then requests specific slices here. The agent executes
     * each tool call against the in-memory artifact content and stores
     * results for the next iteration.
     * @since TBD
     */
    artifactToolCalls?: ArtifactToolCall[];

    reasoning?: string;
    confidence?: number;
    nextStep?: { ... };
}

/**
 * A single artifact tool invocation requested by the LLM.
 */
export interface ArtifactToolCall {
    /** Tool name from the documented tool list (e.g., "artifact_get_rows") */
    tool: string;
    /** Tool-specific input parameters */
    input: Record<string, unknown>;
}
```

#### 8.6.2 Lifecycle (Mirrors ScratchpadManager Exactly)

**Phase 1 — Initialization** (top of `Execute()`, parallel to `_scratchpadManager.Clear()`):
```typescript
// base-agent.ts, Execute() method
this._scratchpadManager.Clear();
this._artifactToolManager.Clear();
this._artifactToolManager.Initialize(inputArtifacts);
```

**Phase 2 — Prompt Injection** (in `preparePromptParams()`, parallel to scratchpad injection):
```typescript
// base-agent.ts, preparePromptParams() method
// After scratchpad injection (lines 1853-1862)...

const artifactToolsEnabled = agentTypePromptParams?.includeArtifactToolsDocs !== false;
if (artifactToolsEnabled && this._artifactToolManager.HasArtifacts()) {
    // Manifest: artifact names, types, sizes, table schemas
    promptParams.data['_ARTIFACT_MANIFEST'] = this._artifactToolManager.ToManifestString();

    // Tool documentation: available tools based on input artifact types
    // (walks ParentID chain to inherit parent type tools)
    promptParams.data['_ARTIFACT_TOOLS'] = this._artifactToolManager.GetToolDocumentation();

    // Previous tool results (from prior turns in this run)
    promptParams.data['_ARTIFACT_TOOL_RESULTS'] = this._artifactToolManager.GetPendingResults();

    // Summary for compact prompt contexts
    promptParams.data['_ARTIFACT_TOOL_SUMMARY'] = this._artifactToolManager.GetSummary();
}
```

**Phase 3 — Input Data Capture** (before LLM call, in `executePromptStep()`):
```typescript
// Capture artifact state before LLM response (parallel to scratchpad snapshot)
const artifactSnapshotBeforeStep = this._artifactToolManager.HasArtifacts()
    ? this._artifactToolManager.ToJSON()
    : undefined;
const inputData = {
    promptId, promptName, isRetry, retryContext,
    conversationMessages: params.conversationMessages,
    ...(scratchpadSnapshotBeforeStep && { scratchpad: scratchpadSnapshotBeforeStep }),
    ...(artifactSnapshotBeforeStep && { artifactTools: artifactSnapshotBeforeStep }),
};
```

**Phase 4 — Response Processing** (after LLM response, parallel to scratchpad):
```typescript
// base-agent.ts, executePromptStep() method
// After scratchpad processing (lines 5474-5485)...

if (initialNextStep.artifactToolCalls?.length) {
    // Execute each tool call against in-memory artifact content
    // Results are stored and injected into next turn's prompt
    await this._artifactToolManager.ExecuteToolCalls(initialNextStep.artifactToolCalls);
}
```

**Phase 5 — Output Data Persistence** (after response processing):
```typescript
// Include artifact tool state after changes for audit/training
...(this._artifactToolManager.HasArtifacts() && {
    artifactTools: this._artifactToolManager.ToJSON()
}),
```

#### 8.6.3 State Carry-Forward Across Turns

Like scratchpad, artifact tool state is **ephemeral per run** but **persistent across turns within a run**:

```
Turn 1:
  Prompt includes: _ARTIFACT_MANIFEST (artifact list + schemas)
                   _ARTIFACT_TOOLS (available tool documentation)
                   _ARTIFACT_TOOL_RESULTS (empty — first turn)
  LLM responds:    artifactToolCalls: [{ tool: "artifact_get_rows", input: { artifactId: "a1", table: "customers", start: 0, count: 10 } }]
  Agent executes:  ArtifactToolManager.ExecuteToolCalls() → stores results

Turn 2:
  Prompt includes: _ARTIFACT_MANIFEST (unchanged)
                   _ARTIFACT_TOOLS (unchanged)
                   _ARTIFACT_TOOL_RESULTS (contains rows 0-10 from turn 1)
  LLM responds:    artifactToolCalls: [{ tool: "artifact_aggregate", input: { artifactId: "a1", table: "customers", field: "Revenue", operation: "sum" } }]
                   message: "Looking at the top customers, total revenue is..."
  Agent executes:  More tool calls → stores results

Turn 3:
  Prompt includes: _ARTIFACT_TOOL_RESULTS (contains all prior results)
  LLM responds:    message: "Based on my analysis, the top 10 customers represent 45% of revenue..."
                   taskComplete: true
```

#### 8.6.4 ArtifactToolManager Core API

```typescript
// packages/AI/Agents/src/ArtifactToolManager.ts

export class ArtifactToolManager {
    private artifacts: Map<string, ArtifactEntry>;
    private toolLibraries: Map<string, BaseArtifactToolLibrary>;
    private toolResults: ArtifactToolResult[];
    private accessLog: ArtifactAccessLogEntry[];

    // ─── LIFECYCLE (mirrors ScratchpadManager) ───

    /** Called at agent run start with all input artifacts */
    Initialize(inputArtifacts: InputArtifact[]): void;
    /** Reset state between runs */
    Clear(): void;
    /** Whether any artifacts are available */
    HasArtifacts(): boolean;

    // ─── PROMPT INJECTION (mirrors ScratchpadManager) ───

    /** Compact manifest for prompt: artifact names, types, schemas, sizes */
    ToManifestString(): string;
    /** Documentation of available tools based on artifact types */
    GetToolDocumentation(): string;
    /** Results from previous turns, formatted for prompt injection */
    GetPendingResults(): string;
    /** One-line summary for compact contexts */
    GetSummary(): string;

    // ─── TOOL EXECUTION (new — scratchpad doesn't have this) ───

    /** Execute tool calls from LLM response, store results */
    ExecuteToolCalls(calls: ArtifactToolCall[]): Promise<void>;

    // ─── SERIALIZATION (mirrors ScratchpadManager) ───

    /** Snapshot for step InputData/OutputData persistence */
    ToJSON(): ArtifactToolSnapshot;

    // ─── AUDIT ───

    /** Access log for training data / debugging */
    GetAccessLog(): ArtifactAccessLogEntry[];
}
```

#### 8.6.5 Tool Library Resolution

When `Initialize()` is called, the manager:
1. Groups input artifacts by artifact type
2. For each type, looks up `ToolLibraryClass` on `MJ: Artifact Types`
3. Walks the `ParentID` chain to collect inherited tool libraries
4. Instantiates each library via `ClassFactory` (same pattern as other MJ plugins)
5. Merges tool lists (child overrides parent for same-named tools)
6. Generates the `_ARTIFACT_TOOLS` documentation from the merged tool list

### 8.7 AI Model Metadata for File Support

Some LLM providers natively accept files (Claude reads PDFs, Gemini accepts multiple file types). When available, native file support may be preferable to the tool-based approach for small files. New metadata tracks this:

**AI Model level:**
- `SupportsFileInput: boolean` — does this model accept file content blocks?
- `HasFileAPI: boolean` — does the inference provider have a separate file upload API? If true, files can be uploaded separately from the request. If false, files must be base64-encoded into conversation message parts.
- `SupportedFileTypes: string` — comma-separated MIME types (e.g., `application/pdf,image/*`)
- `MaxFileSize: number` — maximum file size in bytes per individual file
- `MaxTotalFileSize: number` — maximum total size across all files in a single request (some providers cap total payload separately from per-file limits)
- `MaxFilesPerRequest: number` — maximum number of files per request

**AI Model Vendor level** (same model, different provider may differ):
- Override fields for `SupportsFileInput`, `HasFileAPI`, `SupportedFileTypes`, `MaxFileSize`, `MaxTotalFileSize`, `MaxFilesPerRequest`

**AI Prompt Model level:**
- `UseFileAPI: boolean` — override to force or prevent use of the file upload API for this specific prompt/model combination. When true, files are uploaded via the provider's file API rather than base64-encoded inline.
- `UseNativeFileInput: boolean` — override to force or prevent native file upload for this specific prompt/model combination

**Runtime override via ExecuteAgentParams:**
- File management behavior overridable per agent run (highest priority), including `UseFileAPI`

**BaseLLM additions:**
- Abstract method `UploadFile(data: Buffer, mimeType: string, fileName: string): Promise<string>` — returns provider file ID
- Abstract method `SupportsNativeFileInput(): boolean`

**Decision logic:** If the model supports native file input for this file type AND the file is under the size limit, use native upload. Otherwise, fall back to artifact tools for exploration.

### 8.8 The "Analyze" Flow (Revised)

With artifact tools and the input artifact system, the analyze flow works differently depending on context:

**In-conversation context** (artifact was just created by an agent):
The user simply types their next message in the same conversation. The existing agent (e.g., Skip) continues the conversation with the artifact already available. An "intent checker" before the main agent could detect "discuss/analyze" intent and route to a simpler analysis agent that gets the full spec + data snapshot for focused discussion.

**Standalone context** (artifact viewed outside a conversation — in a collection, dashboard, or saved artifact browser):
1. User clicks "Discuss" / "AI Analysis" on an artifact viewer
2. UI calls `GetCurrentStateSnapshot()` → gets `DataSnapshot`
3. UI creates a new artifact version containing the snapshot JSON
4. Artifact appears as an **attachment** on the user's draft message (shared input artifact UI — co-built with file I/O team)
5. User types their question and sends
6. AgentRunner starts the run, passes input artifacts to `ArtifactToolManager`
7. Agent sees the manifest in its prompt, uses artifact tools to explore the data
8. Agent responds with insights

In both cases, the snapshot is a first-class artifact. The agent explores it via tools, not by reading a giant JSON blob in context. The UX for the button/trigger depends on the containing surface — this is a UX design decision that will be finalized when we see it live.

### 8.9 Data Snapshot Artifact Type

Create `metadata/artifact-types/.data-snapshot-artifact-type.json`:
```json
{
    "fields": {
        "Name": "Data Snapshot",
        "Description": "Point-in-time snapshot of a component or artifact's data state. Contains structured multi-table data with optional computations and interpretation.",
        "ContentType": "application/vnd.mj.data-snapshot",
        "DriverClass": "DataArtifactViewerPlugin",
        "Icon": "fa-solid fa-camera"
    }
}
```

### 8.10 MJStorage Backing for Large Snapshots

For small data snapshots (a few hundred rows), storing JSON inline in the `Content` column of `ArtifactVersion` is fine. For large snapshots (thousands of rows, multiple large tables), the row data can be backed by MJStorage:

- **Metadata stays inline** — title, table names, column schemas, computations, interpretation. This is lightweight and needed for the manifest without a storage hop.
- **Row data goes to MJStorage** — the actual `rows[]` arrays are stored as JSON files in MJStorage (S3, Azure Blob, etc.)
- **First N rows stay inline** — keep the first ~30 rows per table inline for immediate rendering without a storage round-trip.
- **`ArtifactVersion.FileID`** — references the MJStorage file containing the full row data. This uses the same `FileID` / `ContentMode` infrastructure the file I/O team is building.

The `ArtifactToolManager` handles transparently loading row data from either inline content or MJStorage when artifact tools request it.

---

## 9. Interactive Component Data Contract

### 9.1 Overview

Update the `ComponentObject` interface so that `getCurrentDataState()` returns a `DataSnapshot` instead of `any`, and add `setDataState()` for rehydrating components with historical data. This makes interactive components first-class participants in the snapshot ecosystem — agents can read component state, and the system can restore prior state from persisted snapshots.

### 9.2 Changes to ComponentObject

In `packages/InteractiveComponents/src/runtime-types.ts`:

```typescript
import { DataSnapshot } from '@memberjunction/core';
import { BaseEventArgs } from './component-events';

export interface ComponentObject {
    component: Function;
    print?: ComponentPrintFunction;
    refresh?: ComponentRefreshFunction;

    /**
     * Gets the current data state of the component as a structured DataSnapshot.
     *
     * Components should return a snapshot that includes:
     * - `tables[]`: Named datasets the component is displaying
     * - `computations[]`: Aggregations or KPIs the component has calculated
     * - Per-table state: sorting, activeFilters, selectedRows, pageNumber (on each DataTable)
     * - `interpretation`: Optional narrative of what the data shows
     * - `title`: Display name of the component/view
     *
     * For non-tabular components (diagrams, settings panels), return a
     * DataSnapshot with empty `tables[]` and populate `interpretation`
     * with a textual description of the component's state.
     *
     * @returns Structured data snapshot, or undefined if not supported
     */
    getCurrentDataState?: () => DataSnapshot | undefined;

    /**
     * Sets the component's data state from a previously captured snapshot.
     *
     * This enables rehydrating a component with historical data — loading
     * a prior snapshot back into a live component so the user can see
     * "what this dashboard looked like last Tuesday."
     *
     * The component is responsible for interpreting the snapshot and
     * updating its internal state accordingly. Not all components will
     * support this — it's optional.
     *
     * @param snapshot - A previously captured DataSnapshot to restore
     * @returns true if the state was successfully applied
     */
    setDataState?: (snapshot: DataSnapshot) => boolean;

    // Note: Data state history is tracked via artifact versions, not
    // a method on ComponentObject. The artifact versioning system already
    // provides point-in-time snapshots with timestamps.

    // Note: Component events use the existing ComponentCallbacks.NotifyEvent()
    // pattern rather than a separate event bus. See Section 5.

    // ... existing methods unchanged ...
    validate?: () => boolean | { valid: boolean; errors?: string[] };
    isDirty?: () => boolean;
    reset?: () => void;
    scrollTo?: (target: string | HTMLElement | { top?: number; left?: number }) => void;
    focus?: (target?: string | HTMLElement) => void;
    invokeMethod?: (methodName: string, ...args: unknown[]) => unknown;
    hasMethod?: (methodName: string) => boolean;
}
```

### 9.3 React Component Guide: Implementing getCurrentDataState()

Update `packages/React/mj-component-spec-guide.md` with guidance for component authors:

**For tabular/dashboard components:**
```javascript
getCurrentDataState: () => ({
    title: "Sales Dashboard Q4 2025",
    tables: [
        {
            name: "monthly_revenue",
            description: "Revenue aggregated by month",
            source: "query",
            columns: [
                { field: "Month", displayName: "Month", sqlBaseType: "nvarchar" },
                { field: "Revenue", displayName: "Revenue", sqlBaseType: "money",
                  isSummary: true }
            ],
            rows: monthlyData,
            metadata: { rowCount: monthlyData.length, queryName: "Revenue by Month", queryCategoryPath: "Sales/Reports" }
        },
        {
            name: "top_customers",
            description: "Top 10 customers by revenue",
            source: "view",
            columns: [
                { field: "Name", sourceEntity: "Customers", sourceFieldName: "Name",
                  sqlBaseType: "nvarchar" },
                { field: "TotalRevenue", sqlBaseType: "money",
                  isSummary: true, isComputed: true }
            ],
            rows: topCustomers,
            sorting: [{ field: "Revenue", direction: "desc" }],
            metadata: { rowCount: 10, entityName: "Customers" }
        }
    ],
    // Cross-table computations (per-table ones go on the DataTable)
    computations: [
        { name: "Total Revenue", type: "sum", field: "Revenue",
          table: "monthly_revenue", value: 4500000, formattedValue: "$4.5M" },
        { name: "YoY Growth", type: "custom", value: 12.3,
          formattedValue: "+12.3%",
          description: "Year-over-year revenue growth rate" }
    ],
    // Component-level state (spans all tables)
    drillPath: ["All Regions", "West"],
    activeTab: "monthly_revenue",
    interpretation: "Q4 West region revenue totals $4.5M (+12.3% YoY). " +
        "Top customer Acme Corp represents 15% of total."
})
```

**For non-tabular components:**
```javascript
getCurrentDataState: () => ({
    title: "Network Topology Viewer",
    tables: [],
    interpretation: "Displaying 47 nodes across 3 clusters. " +
        "Cluster A (production) has 22 nodes with 2 showing warning status.",
    custom: {
        zoomLevel: 0.85,
        selectedCluster: "production",
        nodeCount: 47,
        clusterCount: 3,
        warningNodes: 2
    }
})
```

### 9.4 Angular Bridge Update

In `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`:

```typescript
import { DataSnapshot } from '@memberjunction/core';

/**
 * Get the current data state from the running React component.
 * Returns a DataSnapshot if the component implements getCurrentDataState().
 */
public GetCurrentDataState(): DataSnapshot | undefined {
    return this.componentObject?.getCurrentDataState?.();
}

/**
 * Set the data state on the running React component from a previously
 * captured snapshot. Used for rehydrating with historical data.
 * Returns true if the component accepted the state.
 */
public SetDataState(snapshot: DataSnapshot): boolean {
    return this.componentObject?.setDataState?.(snapshot) ?? false;
}
```

---

## 10. Relationship to File Artifact I/O

A parallel effort (branch `file-artifact-io-plan`) is building file-based artifact I/O — PDF generation/extraction, Excel read/write, Word document generation. While the feature sets are different (files vs data snapshots), **the infrastructure for input artifacts is shared and must be co-built**.

### 10.1 Shared Infrastructure (Must Co-Build)

Both this plan and the file I/O plan need the same input artifact plumbing. Neither can ship the full user-facing experience without it:

| Shared Piece | What It Is | Needed By |
|---|---|---|
| `ConversationDetailArtifact` `Direction='Input'` | DB linkage: artifact attached as input to a message | Both — files and snapshots attach the same way |
| Message attachment UI | Show/manage attachments on draft and sent messages | Both — users need to see what's attached |
| AgentRunner input artifact processing | At run start, gather input artifacts from the message | Both — agents receive inputs regardless of type |
| Agent input type metadata | Declarative: "this agent accepts PDF, Excel, Data Snapshot" | Both — agents declare what they consume |

### 10.2 What Doesn't Overlap

| Area | File I/O (theirs) | Data Layer (ours) |
|---|---|---|
| Storage model | `ContentMode='File'`, `FileID` referencing MJStorage | `ContentMode='Text'`, JSON in `Content` column |
| DB migration | Adds `FileID`, `MimeType`, `ContentMode` to ArtifactVersion | No DB changes needed |
| Actions | PDF Generator, Excel Writer, Word Generator, PDF Extractor | No new actions |
| Viewer plugins | New: PDF, Excel, Word viewers | Modified: data viewer (multi-table), component viewer (snapshot) |
| Content extraction | `FileContentExtractor` (PDF→text, Excel→text for agent context) | Not needed — DataSnapshot is already structured JSON |

### 10.3 Complementary Integration Points

**File viewers inherit snapshot capability.** New PDF/Excel/Word viewer plugins inherit `GetCurrentStateSnapshot()` from the base class. An Excel viewer could return a `DataSnapshot` with each sheet as a `DataTable`.

**Excel writer can consume DataSnapshot.** "Export this dashboard to Excel" → capture snapshot → pass each `DataTable` to Excel writer → each table becomes a sheet.

### 10.4 Recommended Coordination

The shared infrastructure (Section 10.1) should be designed and built jointly. Specific coordination points:

- **MJStorage backing** (Section 8.10): The large snapshot storage pattern uses the same `FileID` / `ContentMode` infrastructure the file I/O team is building. Coordinate with @bc-izygmunt who is deeper into MJStorage. Test using the demo box account.
- **Input artifact plumbing** (Section 10.1): `ConversationDetailArtifact Direction='Input'`, message attachment UI, and AgentRunner processing must be co-designed.
- **Artifact type hierarchy**: Both teams need the `ParentID` chain on `MJ: Artifact Types` — verify the file I/O team's artifact types fit the hierarchy.

---

## 11. Cross-Cutting Concerns

### 11.1 Package Dependencies

| Package | New Dependencies | Why |
|---|---|---|
| `@memberjunction/core` | None (new types + functions only) | Column descriptors, DataTable, DataSnapshot, transforms |
| `@memberjunction/interactive-component-types` | Already depends on `@memberjunction/core` | Base event interfaces, NotifyEvent on ComponentCallbacks, ComponentObject updates |
| `@memberjunction/ng-artifacts` | Already depends on `core` | Needs new type imports for snapshots |
| `@memberjunction/ng-react` | Already depends on `core` and `interactive-component-types` | No new dependency needed |
| `@memberjunction/ng-query-viewer` | None | Uses `QueryGridColumnConfig` which maps to `GridColumnDescriptor` |

### 11.2 Versioning

All changes are additive except one intentional breaking change:
- `DataSnapshot` has `DataArtifactSpec` as a type alias for backward compatibility
- `ComponentObject.getCurrentDataState()` changes from `() => any` to `() => DataSnapshot | undefined` — compatible because `any` accepts any return type
- `BaseArtifactViewerPluginComponent` gains a new **abstract** method `GetCurrentStateSnapshot()` — all viewer plugins MUST implement it. This is a breaking change but intentional: every viewer should provide a semantically appropriate result for its content type.
- New fields on `DataSnapshot` (tables, computations, interpretation) are all optional

### 11.3 Migration Path

See Section 4.6 for backward compatibility details. Summary: all changes are additive. Existing data artifacts, interactive components, and agents require zero migration. The `headerName` → `displayName` rename in the data viewer is the only internal change.

### 11.4 Security Considerations

- **Snapshot content**: Snapshots inherit the permission model of their source artifact. A user who can view the artifact can capture its snapshot.
- **Agent context**: When snapshots are passed to agents, the agent runs under the user's permission context (`contextUser`). The agent cannot access data the user cannot see.
- **Artifact persistence**: When snapshots are saved as artifact versions, they inherit the parent artifact's permissions.

### 11.5 Testing Strategy

| Phase | Test Type | What to Test |
|---|---|---|
| 1 | Unit | Type compatibility, normalization, column conversions, factory methods |
| 2 | Unit | NotifyEvent callback firing, cancellation, after-event args |
| 3 | Unit | `GetCurrentStateSnapshot()` for each viewer plugin type |
| 4 | Component | Multi-table tab rendering, tab switching, per-table paging |
| 5 | Integration | Snapshot → artifact creation, ArtifactToolManager lifecycle |
| 6 | Unit | `getCurrentDataState()` return type, backward compatibility |

---

## 12. File Inventory

### New Files

| File | Section | Purpose |
|---|---|---|
| `packages/MJCore/src/generic/column-descriptors.ts` | 4 | Column descriptor classes with static factory methods |
| `packages/MJCore/src/generic/data-table.ts` | 4 | `DataTable` class |
| `packages/MJCore/src/generic/data-snapshot.ts` | 4 | `DataSnapshot` class with normalization, `DataComputation` |
| `packages/InteractiveComponents/src/component-events.ts` | 5 | Base event interfaces (`BaseEventArgs`, `CancelableEventArgs`, `AfterEventArgs`) |
| `packages/AI/Agents/src/ArtifactToolManager.ts` | 8 | Artifact tools manager (Scratchpad pattern) |
| `packages/AI/Agents/src/artifact-tools/BaseArtifactToolLibrary.ts` | 8 | Base class for type-specific artifact tool libraries |
| `packages/MJCore/src/__tests__/core-types.test.ts` | 4 | Unit tests for types and normalization |
| `metadata/artifact-types/.data-snapshot-artifact-type.json` | 8 | Data Snapshot artifact type metadata |

### Modified Files

| File | Section | Changes |
|---|---|---|
| `packages/MJCore/src/index.ts` | 4 | Add exports for data types |
| `packages/InteractiveComponents/src/runtime-types.ts` | 5, 9 | Add `NotifyEvent` to `ComponentCallbacks`, update `ComponentObject` with `get/setDataState` |
| `packages/InteractiveComponents/src/component-props-events.ts` | 5 | Add `cancelable` and `pairedEvent` to `ComponentEvent` |
| `packages/Angular/Generic/artifacts/.../base-artifact-viewer.component.ts` | 6 | Add abstract `GetCurrentStateSnapshot()` |
| `packages/Angular/Generic/artifacts/.../data-artifact-viewer.component.ts` | 6, 7 | Import from core, add multi-table UX, add snapshot override |
| `packages/Angular/Generic/artifacts/.../component-artifact-viewer.component.ts` | 6 | Add snapshot override delegating to React component |
| `packages/Angular/Generic/artifacts/.../artifact-viewer-panel.component.ts` | 6, 8 | Add `GetCurrentStateSnapshot()` passthrough, add "Analyze" action |
| `packages/Angular/Generic/react/.../mj-react-component.component.ts` | 9 | Add `GetCurrentDataState()` and `SetDataState()` |
| `packages/AI/Agents/src/agent-types/loop-agent-response-type.ts` | 8 | Add `artifactToolCalls` field and `ArtifactToolCall` interface |
| `packages/AI/Agents/src/base-agent.ts` | 8 | Integrate ArtifactToolManager (init, prompt injection, response processing, persistence) |

---

## 13. Implementation Order & Dependencies

```
1. Core Type System (classes in MJCore)     ← FOUNDATION (do first)
   │  column-descriptors.ts
   │  data-table.ts
   │  data-snapshot.ts
   │  index.ts exports
   │  unit tests
   │
   ├──▶ Component Event System                    (parallel)
   │         Base event interfaces (BaseEventArgs, CancelableEventArgs, AfterEventArgs)
   │         NotifyEvent on ComponentCallbacks
   │         cancelable/pairedEvent on ComponentEvent metadata
   │
   ├──▶ Artifact-Level State Snapshots            (parallel)
   │         Abstract GetCurrentStateSnapshot() on base viewer
   │         Per-viewer overrides (data, component, JSON, code)
   │
   ├──▶ Multi-Table Viewer UX                     (parallel)
   │         data-artifact-viewer multi-table support
   │         Migration: remove local interfaces, import from core
   │
   ├──▶ Interactive Component Data Contract       (parallel)
   │         get/setDataState on ComponentObject
   │         GetCurrentDataState/SetDataState on MJReactComponent bridge
   │
   └──▶ Artifact Tools (5th agent primitive)      (parallel, co-build w/ file I/O)
              ArtifactToolManager (Scratchpad pattern)
              BaseArtifactToolLibrary plugin system
              ToolLibraryClass on MJ: Artifact Types entity
              Artifact manifest prompt injection
              Type-specific tool libraries (Data Snapshot, JSON, PDF, Excel, Text)
              AI Model metadata for file support (HasFileAPI, MaxTotalFileSize)
              "Analyze" flow (in-chat + standalone contexts)
              Data Snapshot artifact type metadata
```

---

## 14. Open Items & Future Considerations

### 14.1 Open Design Questions

1. **Snapshot size limits.** When a component has 100K rows, should `getCurrentDataState()` return all of them? Recommendation: return the full dataset in the snapshot, but provide schema + sample rows + exploration tools to agents rather than dumping all rows into conversation context. The snapshot itself is the source of truth; how it's consumed is consumer-specific.

2. **Artifact tools vs native file upload.** When a model natively supports file input (Claude reads PDFs, Gemini accepts multiple types), when do we use native upload vs artifact tools? Recommendation: native upload for small files where the model supports the type, artifact tools for large files or unsupported types. Decision logic in Section 8.7. New `HasFileAPI` / `UseFileAPI` metadata controls whether files are uploaded via provider API or base64'd inline.

3. **Column naming:** `displayName` is the canonical field name. `DataArtifactColumn.headerName` is replaced outright — no transition period. The only current consumer is Query Builder, so verify that old saved queries with `headerName` in their artifact JSON still render correctly (handle in the viewer's deserialization).

4. **QueryGridColumnConfig migration.** Should `QueryGridColumnConfig` eventually extend `GridColumnDescriptor`, or should conversion functions bridge the two? Recommendation: conversion functions first (non-breaking), with eventual migration to extend when the query viewer is next refactored.

5. **Computed table formalization.** When `source` is `'computed'`, the component built the data client-side. Should we formalize computation descriptions more (e.g., a mini-DSL)? Recommendation: start with the free-text `computationDescription` and evolve based on real usage patterns.

6. **Snapshot diff.** Should the system support comparing two snapshots? Useful for "what changed since I last looked?" scenarios. Could be a utility function operating on two `DataSnapshot` objects. Recommendation: design when the first concrete use case emerges.

7. **AI-generated component compliance.** When this architecture is in place, AI code-generation agents that produce interactive components need to be updated so their generated components support `getCurrentDataState()` (and eventually `setDataState()`). The contract is defined here; updating the generation agents is a separate workstream.

### 14.2 Future Capabilities (Not In Scope)

| Capability | Description | Prerequisites |
|---|---|---|
| **Component State Rehydration** | `setDataState()` implementation — load historical snapshots back into live components, browse artifact versions | Component contract (Section 9), artifact versioning |
| **Live Agent Dialog** | Agent subscribes to component events in real-time, can invoke methods | Event system (Section 5), WebSocket infrastructure |
| **Snapshot Comparison** | Diff two snapshots to highlight changes | Core types (Section 4) |
| **Agent-Initiated Filtering** | Agent applies filters to running components via actions | Event system, component contract, new MJ Actions |
| **Cross-Component Snapshots** | Capture state of multiple components simultaneously | Artifact snapshots (Section 6), dashboard infrastructure |
| **Snapshot Scheduling** | Automatically capture snapshots at intervals for trend analysis | Agent bridge (Section 8), scheduling infrastructure |
| **Agent-Initiated Component Creation** | Agent produces a new DataSnapshot as a suggested "next view" that can be rendered directly | Core types, multi-table viewer |

### 14.3 Relationship to Existing Plans

- **Query Builder Agent Plan** (`plans/complete/query-builder-agent-plan.md`): This plan extends the Data artifact type created there. The multi-table expansion and snapshot system are additive.
- **Component Artifact Viewer Improvements** (`plans/complete/3-component-artifact-viewer-improvements.md`): The snapshot system adds a new capability without modifying the existing rendering pipeline.
- **Composable Queries Plan** (`plans/nested-queries-paging-caching-plan.md`): Multi-table `DataSnapshot` could represent composed query results where each sub-query becomes a named table.
- **File Artifact I/O Plan** (`plans/file-artifact-io-plan.md`): Complementary work on file-based artifacts (PDF, Excel, Word). See Section 10 for coordination points.

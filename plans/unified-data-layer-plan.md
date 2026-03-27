# Unified Data Layer, Component Events & Agent Integration

> **Status**: PLANNING
> **Created**: 2026-03-27
> **Supersedes**: `plans/unified-data-snapshots-component-events-plan.md`, `plans/visualization-layer-design.md`
> **Scope**: `@memberjunction/interactive-component-types`, `@memberjunction/ng-artifacts`, `@memberjunction/ng-react`, agent integration, future visualization foundation

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State & Gaps](#2-current-state--gaps)
3. [Architecture Overview](#3-architecture-overview)
4. [Phase 1: Core Type System](#4-phase-1-core-type-system)
5. [Phase 2: Composable Data Transform Toolkit](#5-phase-2-composable-data-transform-toolkit)
6. [Phase 3: Component Event System](#6-phase-3-component-event-system)
7. [Phase 4: Artifact-Level State Snapshots](#7-phase-4-artifact-level-state-snapshots)
8. [Phase 5: Multi-Table Viewer UX](#8-phase-5-multi-table-viewer-ux)
9. [Phase 6: Agent-Component Dialog Bridge](#9-phase-6-agent-component-dialog-bridge)
10. [Phase 7: Interactive Component Data Contract](#10-phase-7-interactive-component-data-contract)
11. [Future: Visualization Foundation Layer](#11-future-visualization-foundation-layer)
12. [Cross-Cutting Concerns](#12-cross-cutting-concerns)
13. [File Inventory](#13-file-inventory)
14. [Implementation Order & Dependencies](#14-implementation-order--dependencies)
15. [Open Items & Future Considerations](#15-open-items--future-considerations)

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
| **Component event subscription** | Interactive components have declarative event metadata but no runtime subscription mechanism. Containers can't react to or cancel component actions. | Add a `ComponentEventBus` with `on`/`off`/`emit`, Before/After event pairs, and cancellation support. |
| **Composable data processing** | No standard way to transform, filter, truncate, or format data snapshots for different consumers (agents, export, comparison). Each consumer writes bespoke logic. | Provide a toolkit of small, composable transform functions that operate on `DataSnapshot` and `DataTable`. Pipeline them together for any use case. |

### Key Design Decisions

**One unified type hierarchy.** Rather than separate types for "component data," "artifact data," "agent data," and "export data," there is ONE layered type system. A query builder produces a `DataSnapshot`. A dashboard component produces a `DataSnapshot`. A chart produces a `DataSnapshot`. An agent can reason over any of them because they share the same shape.

**Composable transforms over class hierarchies.** Data processing (truncation, column selection, formatting for agents, export to flat formats) is implemented as small, independent, data-in/data-out functions that compose into pipelines. This keeps each transform testable, reusable, and combinable in any order — without building a monolithic processor class.

**Stateful capture, pure processing.** Capturing a snapshot from a live component is inherently stateful (it reads current grid state, filters, selections). Everything after capture — transforms, formatting, delivery — operates on immutable data. This boundary is explicit in the architecture.

### Dependencies Between Phases

```
Phase 1: Core Type System (types)
    ├──▶ Phase 2: Composable Transform Toolkit (functions over types)
    ├──▶ Phase 3: Component Event System (types + runtime)
    ├──▶ Phase 4: Artifact-Level State Snapshots (base class method)
    ├──▶ Phase 5: Multi-Table Viewer UX (Angular)
    └──▶ Phase 7: Interactive Component Data Contract (React runtime)
              │
              ▼
         Phase 6: Agent-Component Dialog Bridge (integration, depends on 4 + 7)
```

Phases 2–5 and 7 can proceed in parallel after Phase 1 is complete. Phase 6 depends on Phases 4 and 7.

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

`ComponentObject.getCurrentDataState` in `runtime-types.ts`:
```typescript
getCurrentDataState?: () => any;
```

Returns `any`. Each React component returns whatever it wants. The Angular bridge passes it through unchanged. Nothing downstream can safely consume the result because there is no contract.

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
    computations: DataComputation[],
    visualState: DataVisualState
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
                                   │   visualState       │
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

## 4. Phase 1: Core Type System

### 4.1 Column Descriptors

#### 4.1.1 New File: `packages/InteractiveComponents/src/column-descriptors.ts`

```typescript
// ─── LEVEL 1: UNIVERSAL COLUMN ───

/**
 * Base column descriptor. The minimum information needed to describe
 * a column of data: what it's called, what type it is, how to display it.
 *
 * This is the atom of the type system. Every higher-level type composes these.
 */
export interface ColumnDescriptor {
    /**
     * Field name in the row data.
     * This is the key used to access the value: row[field].
     * Examples: "Revenue", "CustomerName", "ID"
     */
    field: string;

    /**
     * Human-readable display name for headers, labels, and tooltips.
     * Defaults to `field` if not specified.
     */
    displayName?: string;

    /**
     * SQL base type — the source of truth for formatting in MJ.
     *
     * MJ is SQL-first: grid formatting, alignment, entity linking,
     * and value display all switch on SQL types. Using SQL types
     * (not JS types) preserves the distinction between money formatting,
     * integer formatting, date formatting, etc.
     *
     * Examples: 'int', 'bigint', 'nvarchar', 'varchar', 'money',
     * 'decimal', 'float', 'bit', 'uniqueidentifier', 'datetime',
     * 'datetimeoffset', 'date', 'time', 'varbinary'
     */
    sqlBaseType?: string;

    /**
     * Full SQL type with precision/scale.
     * Examples: 'decimal(18,2)', 'nvarchar(255)', 'varchar(max)'
     */
    sqlFullType?: string;

    /** Column width in pixels (hint for renderers) */
    width?: number;

    /** Human-readable description of what this column represents */
    description?: string;
}

// ─── LEVEL 2: MJ COLUMN WITH ENTITY LINEAGE ───

/**
 * Column descriptor with MemberJunction entity lineage.
 *
 * Entity lineage is a core MJ capability: when a column called "CustomerID"
 * appears in query results, MJ knows it came from the Customers.ID field.
 * This enables:
 * - Entity linking in grids (click an ID → navigate to that record)
 * - Schema-aware formatting (using entity field metadata)
 * - Agent understanding ("this Revenue column comes from Invoices.Amount")
 * - Data lineage tracing through joins and computed expressions
 */
export interface MJColumnDescriptor extends ColumnDescriptor {
    /**
     * MJ entity name this column originates from.
     * Examples: "Customers", "Invoices", "AI Models"
     */
    sourceEntity?: string;

    /**
     * Field name in that entity.
     * Examples: "ID", "FirstName", "Amount"
     */
    sourceFieldName?: string;

    /**
     * True for calculated expressions: CASE, ROUND, CONCAT, COALESCE, etc.
     * These columns don't map directly to a single entity field.
     */
    isComputed?: boolean;

    /**
     * True for aggregate functions: SUM, COUNT, AVG, MIN, MAX, etc.
     * These columns summarize multiple rows into one value.
     */
    isSummary?: boolean;
}

// ─── LEVEL 3: GRID COLUMN WITH DISPLAY FLAGS ───

/**
 * Column descriptor with full display configuration for grid/table rendering.
 *
 * Most consumers don't need this level of detail — it's specific to
 * the interactive grid renderer. Agents, exporters, and component specs
 * use ColumnDescriptor or MJColumnDescriptor instead.
 */
export interface GridColumnDescriptor extends MJColumnDescriptor {
    /** Whether the column is visible in the grid */
    visible: boolean;

    /** Whether the user can sort by this column */
    sortable: boolean;

    /** Whether the user can drag-resize this column */
    resizable: boolean;

    /** Whether the user can drag-reorder this column */
    reorderable: boolean;

    /** Display order (0-based) */
    order: number;

    /** Text alignment */
    align?: 'left' | 'center' | 'right';

    /**
     * Whether this column contains a clickable entity link.
     * When true, clicking a value navigates to the entity record
     * identified by targetEntityName and the cell value.
     */
    isEntityLink: boolean;

    /** Entity to navigate to when the link is clicked */
    targetEntityName?: string;

    /** Entity ID for the target entity (for icon lookup, etc.) */
    targetEntityId?: string;

    /** Icon class for the target entity */
    targetEntityIcon?: string;

    /** Whether this field is part of the primary key */
    isPrimaryKey?: boolean;

    /** Whether this field is a foreign key */
    isForeignKey?: boolean;

    /** Pin column to left or right side of the grid */
    pinned?: 'left' | 'right' | null;

    /** Minimum width for resizing */
    minWidth?: number;

    /** Maximum width for resizing */
    maxWidth?: number;

    /** Flex grow factor for auto-sizing */
    flex?: number;
}
```

#### 4.1.2 Column Conversion Functions

```typescript
// ─── CONVERSION FUNCTIONS ───

/**
 * Add MJ entity lineage to a base column descriptor.
 *
 * @param col - Base column
 * @param entityName - MJ entity name (e.g., "Customers")
 * @param sourceFieldName - Field name in that entity (defaults to col.field)
 * @returns MJColumnDescriptor with lineage populated
 */
export function withEntityLineage(
    col: ColumnDescriptor,
    entityName: string,
    sourceFieldName?: string
): MJColumnDescriptor {
    return {
        ...col,
        sourceEntity: entityName,
        sourceFieldName: sourceFieldName ?? col.field
    };
}

/**
 * Promote an MJColumnDescriptor to a GridColumnDescriptor with sensible defaults.
 *
 * @param col - Column with entity lineage
 * @param order - Display order index
 * @returns GridColumnDescriptor with default display flags
 */
export function withGridDefaults(
    col: MJColumnDescriptor,
    order: number
): GridColumnDescriptor {
    return {
        ...col,
        visible: true,
        sortable: true,
        resizable: true,
        reorderable: true,
        order,
        isEntityLink: !!col.sourceEntity &&
            (col.field.endsWith('ID') || col.field === 'ID'),
        targetEntityName: col.sourceEntity ?? undefined,
        isPrimaryKey: col.field === 'ID',
        isForeignKey: !!col.sourceEntity && col.field.endsWith('ID') && col.field !== 'ID'
    };
}

/**
 * Strip grid-specific display flags, returning just the data-level column info.
 * Useful when preparing data for agents or export — they don't need display flags.
 *
 * @param col - Full grid column
 * @returns MJColumnDescriptor with only data-level fields
 */
export function stripGridFlags(col: GridColumnDescriptor): MJColumnDescriptor {
    return {
        field: col.field,
        displayName: col.displayName,
        sqlBaseType: col.sqlBaseType,
        sqlFullType: col.sqlFullType,
        width: col.width,
        description: col.description,
        sourceEntity: col.sourceEntity,
        sourceFieldName: col.sourceFieldName,
        isComputed: col.isComputed,
        isSummary: col.isSummary
    };
}

/**
 * Build an MJColumnDescriptor from a SimpleQueryFieldInfo.
 * Bridges the existing component data requirements system to the new type system.
 */
export function fromSimpleQueryField(field: {
    name: string;
    type?: string;
    sourceEntity?: string;
    sourceFieldName?: string;
    isSummary?: boolean;
    description?: string;
}): MJColumnDescriptor {
    return {
        field: field.name,
        sqlBaseType: field.type,
        sourceEntity: field.sourceEntity,
        sourceFieldName: field.sourceFieldName,
        isSummary: field.isSummary,
        description: field.description
    };
}
```

### 4.2 DataTable

#### 4.2.1 New File: `packages/InteractiveComponents/src/data-table.ts`

```typescript
import { MJColumnDescriptor } from './column-descriptors';

/**
 * A single named dataset: columns + rows + provenance.
 *
 * This is the standard unit of tabular data in MemberJunction.
 * It is self-describing: given just this object, a consumer knows
 * what the data is, where it came from, and how to interpret each column.
 *
 * Usage contexts:
 * - A query result: one table with SQL metadata
 * - A panel in a dashboard: one table with its dataset
 * - An entity view: one table with entity metadata
 * - A computed aggregation: one table with computation description
 *
 * Rows are flat `Record<string, unknown>[]` — the same shape that
 * RunView, RunQuery, and every MJ data path produces.
 */
export interface DataTable {
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
     */
    source?: 'query' | 'view' | 'computed' | 'static';

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

    /** Query ID in MJ (if from a stored query) */
    queryId?: string;

    /** Query parameters used */
    parameters?: Record<string, string | number | boolean>;

    /**
     * Number of rows in THIS result page.
     * When the data is paged, this is the page size (e.g., 100).
     */
    rowCount?: number;

    /**
     * Total rows available in the source (the full dataset size).
     * When paged, this is the count before paging (e.g., 50,000).
     * Tells consumers: "there are 50,000 rows but you're seeing 100."
     */
    totalAvailableRows?: number;

    /** Time to execute the query/view in milliseconds */
    executionTimeMs?: number;

    /** When this data was fetched — ISO 8601 string for JSON serialization */
    fetchedAt?: string;

    /** For computed tables: how the data was derived */
    computationDescription?: string;
}
```

### 4.3 DataSnapshot

#### 4.3.1 New File: `packages/InteractiveComponents/src/data-snapshot.ts`

```typescript
import { MJColumnDescriptor } from './column-descriptors';
import { DataTable, DataTableMetadata } from './data-table';

/**
 * A named, pre-computed aggregation or metric.
 *
 * Components that perform calculations (sums, averages, counts, custom KPIs)
 * expose them here so agents don't need to recalculate from raw rows.
 * Formatted values give agents and UIs a ready-to-display string.
 */
export interface DataComputation {
    /** Display name: "Total Revenue", "Average Order Value", "Customer Count" */
    name: string;

    /** Type of aggregation performed */
    type: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'distinct_count' | 'custom';

    /** Source field name this computation operates on (if applicable) */
    field?: string;

    /** Which table this computation references (if multi-table) */
    table?: string;

    /** The computed value */
    value: number | string | boolean;

    /** Human-formatted display value: "$1,234,567.89", "+12.3%", "1,247 customers" */
    formattedValue?: string;

    /** Human/AI-readable explanation of what this computation represents */
    description?: string;
}

/**
 * A single active filter applied to the data.
 */
export interface DataFilter {
    /** Field being filtered */
    field: string;

    /** Which table (if multi-table) */
    table?: string;

    /** Filter operator */
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
        | 'contains' | 'startsWith' | 'endsWith'
        | 'in' | 'notIn' | 'isNull' | 'isNotNull'
        | 'between' | 'custom';

    /** Filter value(s) */
    value: string | number | boolean | Array<string | number>;

    /** Human-readable description: "Region = West", "Revenue > $10,000" */
    displayText?: string;
}

/**
 * Captures the current visual/interaction state of the component.
 *
 * This tells an agent not just WHAT data exists, but what the user
 * is LOOKING AT right now: what's filtered, what's sorted, what's
 * selected, how far they've drilled down, what page they're on.
 */
export interface DataVisualState {
    /** Currently active filters applied by the user */
    activeFilters?: DataFilter[];

    /** Current sort state */
    sorting?: Array<{
        field: string;
        table?: string;
        direction: 'asc' | 'desc';
    }>;

    /** Currently selected rows */
    selectedRows?: Array<{
        table?: string;
        rowIndex: number;
        rowKey?: string;
        rowData?: Record<string, unknown>;
    }>;

    /** Drill-down breadcrumb path: ["All Regions", "West", "California"] */
    drillPath?: string[];

    /** Which tab/view/section is currently active */
    activeTab?: string;

    /** Current page number (1-based) */
    pageNumber?: number;

    /** Current page size */
    pageSize?: number;

    /** Search/filter text entered by user */
    searchText?: string;

    /** Component-specific visual state not covered above */
    custom?: Record<string, unknown>;
}

/**
 * A point-in-time snapshot of one or more datasets with full context.
 *
 * This is the **universal data exchange format** between components,
 * artifact viewers, agents, and persistence. It captures not just
 * what data exists, but what it means and what the user is doing with it.
 *
 * **Three modes of use:**
 *
 * 1. **Single-table (backward compatible):** Root-level `source`, `columns`,
 *    `rows`, and `metadata` fields describe one table. `tables` is absent.
 *    This matches the original DataArtifactSpec format.
 *
 * 2. **Multi-table:** `tables[]` contains named datasets. Root-level
 *    data fields are ignored. Computations and visual state may reference
 *    specific tables by name.
 *
 * 3. **Context-only:** `tables` is empty or absent, but `interpretation`,
 *    `computations`, or `visualState` carry useful information (e.g., for
 *    non-tabular components like diagrams or settings panels).
 *
 * **Consumers should always normalize to tables first** using
 * `normalizeToTables()`. After normalization, the root-level fields
 * can be ignored — all data is in the tables array.
 */
export interface DataSnapshot {
    // ─── MULTI-TABLE FIELDS ───

    /**
     * Named datasets. When present, root-level `source`/`columns`/`rows`/
     * `metadata` are ignored. Single-table snapshots may omit this and
     * use root-level fields instead.
     */
    tables?: DataTable[];

    // ─── BACKWARD-COMPATIBLE SINGLE-TABLE FIELDS ───
    // Used when `tables` is not present (original single-table format).
    // Ignored when `tables` IS present.

    /** Data source type (single-table mode only) */
    source?: 'query' | 'view';

    /** Query ID (single-table mode only) */
    queryId?: string;

    /** Query parameters (single-table mode only) */
    parameters?: Record<string, string | number | boolean>;

    /** Entity name for view source (single-table mode only) */
    entityName?: string;

    /** Extra WHERE filter for view source (single-table mode only) */
    extraFilter?: string;

    /** Column definitions (single-table mode only) */
    columns?: MJColumnDescriptor[];

    /** Row data (single-table mode only) */
    rows?: Record<string, unknown>[];

    /** Query metadata (single-table mode only) */
    metadata?: DataTableMetadata;

    // ─── SHARED CONTEXT (applies in both modes) ───

    /** Display title for the snapshot */
    title?: string;

    /**
     * How the data was obtained — markdown, may include Mermaid diagrams.
     * Describes the approach/methodology. Shown in a "Plan" tab in the viewer.
     */
    plan?: string;

    /**
     * What the data MEANS — patterns, insights, key takeaways.
     *
     * Unlike `plan` (which describes how data was obtained), `interpretation`
     * describes what the data shows. When an interactive component populates
     * this, it provides the component's own analysis. An agent can use it
     * as a starting point for deeper investigation.
     *
     * Example: "Q4 West region revenue totals $4.5M (+12.3% YoY).
     * Top customer Acme Corp represents 15% of total. November showed
     * a spike driven by enterprise renewals."
     */
    interpretation?: string;

    /**
     * Pre-computed aggregations and KPIs.
     * Components that perform calculations expose them here so agents
     * don't need to recalculate from raw rows.
     */
    computations?: DataComputation[];

    /**
     * Current visual/interaction state — what the user is looking at.
     * Includes filters, sort, selections, drill path, paging, search.
     */
    visualState?: DataVisualState;

    // ─── QUERY SAVE TRACKING (viewer-specific, preserved for compatibility) ───

    /** ID of saved query (set after user saves from artifact) */
    savedQueryId?: string;

    /** Name of saved query (for display) */
    savedQueryName?: string;

    /** Version number this query was saved/updated from */
    savedAtVersionNumber?: number;
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
 * Normalize any DataSnapshot to always use the `tables[]` array format.
 *
 * - Multi-table snapshots: returns the tables array as-is
 * - Single-table snapshots: wraps root-level fields into a single DataTable
 * - Empty snapshots: returns []
 *
 * After calling this, consumers never need to check root-level fields.
 * This is the standard entry point for all snapshot processing.
 *
 * @param snap - The snapshot to normalize
 * @param defaultTableName - Name for the implicit table when converting from single-table
 * @returns Array of DataTable objects
 */
export function normalizeToTables(
    snap: DataSnapshot,
    defaultTableName: string = 'results'
): DataTable[] {
    // Multi-table: tables array is authoritative
    if (snap.tables && snap.tables.length > 0) {
        return snap.tables;
    }

    // Single-table: wrap root-level fields
    if (snap.rows || snap.columns || snap.metadata?.sql) {
        return [{
            name: defaultTableName,
            source: snap.source,
            columns: snap.columns ?? [],
            rows: snap.rows ?? [],
            metadata: snap.metadata ? {
                sql: snap.metadata.sql,
                entityName: snap.entityName,
                extraFilter: snap.extraFilter,
                queryId: snap.queryId,
                parameters: snap.parameters,
                rowCount: snap.metadata.rowCount,
                totalAvailableRows: snap.metadata.totalAvailableRows,
                executionTimeMs: snap.metadata.executionTimeMs
            } : undefined
        }];
    }

    // Empty (context-only snapshot)
    return [];
}

/**
 * Check whether a DataSnapshot has multiple tables.
 */
export function isMultiTable(snap: DataSnapshot): boolean {
    return !!(snap.tables && snap.tables.length > 1);
}

/**
 * Get the total row count across all tables in a snapshot.
 */
export function totalRowCount(snap: DataSnapshot): number {
    return normalizeToTables(snap).reduce(
        (sum, table) => sum + (table.metadata?.rowCount ?? table.rows.length),
        0
    );
}

/**
 * Get the total available row count across all tables
 * (the full dataset size, not just the current page).
 */
export function totalAvailableRowCount(snap: DataSnapshot): number {
    return normalizeToTables(snap).reduce(
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

All new types go in the existing `@memberjunction/interactive-component-types` package (`packages/InteractiveComponents/`). This package already contains `ComponentObject`, `ComponentSpec`, `ComponentEvent`, data requirements, and runtime types — it's the natural home for shared data contracts.

Add to `packages/InteractiveComponents/src/index.ts`:
```typescript
export * from './column-descriptors';
export * from './data-table';
export * from './data-snapshot';
```

### 4.6 Backward Compatibility

**DataArtifactSpec alias:** The `DataArtifactSpec` type alias ensures existing code that references the old name continues to compile.

**Single-table format:** All root-level single-table fields are preserved. Existing artifact JSON with `source`, `columns`, `rows`, `metadata` at the root level is a valid `DataSnapshot`. No migration needed.

**DataArtifactColumn:** The existing `DataArtifactColumn` fields (`field`, `headerName`, `width`, `sourceEntity`, `sourceFieldName`, `isComputed`, `isSummary`, `sqlBaseType`) are a subset of `MJColumnDescriptor`. The rename from `headerName` to `displayName` is the only naming change — the data artifact viewer migration (Phase 5) handles this.

### 4.7 Unit Tests

Add `packages/InteractiveComponents/src/__tests__/core-types.test.ts`:

- `normalizeToTables()` with single-table spec returns one table
- `normalizeToTables()` with multi-table spec returns tables array unchanged
- `normalizeToTables()` with empty spec returns empty array
- `normalizeToTables()` preserves metadata fields during single→multi conversion
- `isMultiTable()` returns correct boolean for various inputs
- `totalRowCount()` sums across multiple tables
- `totalAvailableRowCount()` uses totalAvailableRows when present
- `withEntityLineage()` correctly populates sourceEntity/sourceFieldName
- `withGridDefaults()` sets sensible defaults for all grid flags
- `stripGridFlags()` removes grid-only properties
- `fromSimpleQueryField()` correctly converts from legacy type
- Backward compatibility: existing single-table DataArtifactSpec shape is valid DataSnapshot
- Type compatibility: MJColumnDescriptor is assignable to ColumnDescriptor

---

## 5. Phase 2: Composable Data Transform Toolkit

### 5.1 Overview

Provide a set of small, independent, data-in/data-out functions for processing `DataSnapshot` and `DataTable` objects. Each function does one thing. They compose into pipelines for specific use cases (agent context, export, comparison, persistence).

### 5.2 New File: `packages/InteractiveComponents/src/data-transforms.ts`

#### 5.2.1 Pipeline Utility

```typescript
/**
 * Compose multiple transforms into a single function.
 * Each transform takes a DataSnapshot and returns a DataSnapshot.
 * They execute left-to-right (first function runs first).
 *
 * @example
 * const prepareForAgent = pipe(
 *     truncateRows(1000),
 *     stripVisualState,
 *     withInterpretation('West region revenue analysis')
 * );
 * const agentSnapshot = prepareForAgent(rawSnapshot);
 */
export function pipe(
    ...transforms: Array<(snap: DataSnapshot) => DataSnapshot>
): (snap: DataSnapshot) => DataSnapshot {
    return (snap: DataSnapshot) =>
        transforms.reduce((acc, fn) => fn(acc), snap);
}
```

#### 5.2.2 The `mapTables` Transform

This is the core building block. It applies a function to every table in a snapshot while preserving the snapshot's context (title, computations, visual state, interpretation).

```typescript
/**
 * Apply a transform to every table in a snapshot.
 *
 * Normalizes to tables[] first (handling single-table snapshots),
 * applies the function to each table, and returns a new snapshot
 * with the transformed tables. All non-table context is preserved.
 *
 * This is the standard way to write table-level transforms:
 * define a function that transforms one DataTable, then lift it
 * to operate on a whole snapshot via mapTables.
 *
 * @param fn - Transform function applied to each table
 * @returns A function that transforms a DataSnapshot
 *
 * @example
 * // Truncate every table to 100 rows
 * const capped = mapTables((table) => ({
 *     ...table,
 *     rows: table.rows.slice(0, 100)
 * }))(snapshot);
 */
export function mapTables(
    fn: (table: DataTable, index: number) => DataTable
): (snap: DataSnapshot) => DataSnapshot {
    return (snap: DataSnapshot): DataSnapshot => ({
        ...snap,
        tables: normalizeToTables(snap).map(fn),
        // Clear root-level single-table fields since we've normalized
        source: undefined,
        columns: undefined,
        rows: undefined,
        metadata: undefined,
        entityName: undefined,
        extraFilter: undefined,
        queryId: undefined,
        parameters: undefined
    });
}
```

#### 5.2.3 Row Operations

```typescript
/**
 * Truncate each table's rows to a maximum count.
 * Updates rowCount and totalAvailableRows in metadata accordingly.
 *
 * Use this when preparing snapshots for agent consumption —
 * LLMs don't need (and can't process) 50,000 rows.
 *
 * @param maxRows - Maximum rows to keep per table
 *
 * @example
 * const agentReady = truncateRows(1000)(snapshot);
 */
export function truncateRows(
    maxRows: number
): (snap: DataSnapshot) => DataSnapshot {
    return mapTables((table) => {
        if (table.rows.length <= maxRows) return table;
        return {
            ...table,
            rows: table.rows.slice(0, maxRows),
            metadata: {
                ...table.metadata,
                rowCount: maxRows,
                totalAvailableRows:
                    table.metadata?.totalAvailableRows ??
                    table.metadata?.rowCount ??
                    table.rows.length
            }
        };
    });
}

/**
 * Sort rows within each table by a field.
 *
 * @param field - Field name to sort by
 * @param direction - 'asc' or 'desc'
 */
export function sortTableRows(
    field: string,
    direction: 'asc' | 'desc' = 'asc'
): (snap: DataSnapshot) => DataSnapshot {
    return mapTables((table) => ({
        ...table,
        rows: [...table.rows].sort((a, b) => {
            const va = a[field];
            const vb = b[field];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            const cmp = va < vb ? -1 : va > vb ? 1 : 0;
            return direction === 'asc' ? cmp : -cmp;
        })
    }));
}
```

#### 5.2.4 Column Operations

```typescript
/**
 * Keep only specific columns in each table.
 * Removes columns from both column definitions and row data.
 *
 * @param fields - Field names to keep
 */
export function selectColumns(
    fields: string[]
): (snap: DataSnapshot) => DataSnapshot {
    const fieldSet = new Set(fields);
    return mapTables((table) => ({
        ...table,
        columns: table.columns.filter(c => fieldSet.has(c.field)),
        rows: table.rows.map(row =>
            Object.fromEntries(
                Object.entries(row).filter(([key]) => fieldSet.has(key))
            )
        )
    }));
}

/**
 * Remove specific columns from each table.
 *
 * @param fields - Field names to remove
 */
export function excludeColumns(
    fields: string[]
): (snap: DataSnapshot) => DataSnapshot {
    const fieldSet = new Set(fields);
    return mapTables((table) => ({
        ...table,
        columns: table.columns.filter(c => !fieldSet.has(c.field)),
        rows: table.rows.map(row =>
            Object.fromEntries(
                Object.entries(row).filter(([key]) => !fieldSet.has(key))
            )
        )
    }));
}

/**
 * Strip MJ entity lineage from columns, leaving only base column info.
 * Useful when exporting data outside of MJ context.
 */
export function stripEntityLineage(
    snap: DataSnapshot
): DataSnapshot {
    return mapTables((table) => ({
        ...table,
        columns: table.columns.map(col => ({
            field: col.field,
            displayName: col.displayName,
            sqlBaseType: col.sqlBaseType,
            sqlFullType: col.sqlFullType,
            width: col.width,
            description: col.description
        }))
    }))(snap);
}
```

#### 5.2.5 Table-Level Operations

```typescript
/**
 * Keep only tables that match a predicate.
 *
 * @param predicate - Function that returns true for tables to keep
 *
 * @example
 * // Keep only tables with data
 * const nonEmpty = filterTables(t => t.rows.length > 0)(snapshot);
 *
 * // Keep only a specific table
 * const revenue = filterTables(t => t.name === 'monthly_revenue')(snapshot);
 */
export function filterTables(
    predicate: (table: DataTable) => boolean
): (snap: DataSnapshot) => DataSnapshot {
    return (snap: DataSnapshot): DataSnapshot => ({
        ...snap,
        tables: normalizeToTables(snap).filter(predicate),
        source: undefined,
        columns: undefined,
        rows: undefined,
        metadata: undefined
    });
}

/**
 * Get a single table from a snapshot by name.
 * Returns the table or undefined if not found.
 */
export function getTable(
    snap: DataSnapshot,
    tableName: string
): DataTable | undefined {
    return normalizeToTables(snap).find(t => t.name === tableName);
}
```

#### 5.2.6 Context Operations

```typescript
/**
 * Add or replace the interpretation text on a snapshot.
 *
 * @param text - Markdown interpretation of what the data shows
 */
export function withInterpretation(
    text: string
): (snap: DataSnapshot) => DataSnapshot {
    return (snap) => ({ ...snap, interpretation: text });
}

/**
 * Add a computation to a snapshot.
 *
 * @param comp - The computation to add
 */
export function addComputation(
    comp: DataComputation
): (snap: DataSnapshot) => DataSnapshot {
    return (snap) => ({
        ...snap,
        computations: [...(snap.computations ?? []), comp]
    });
}

/**
 * Replace all computations on a snapshot.
 */
export function withComputations(
    comps: DataComputation[]
): (snap: DataSnapshot) => DataSnapshot {
    return (snap) => ({ ...snap, computations: comps });
}

/**
 * Remove visual state from a snapshot.
 * Useful when persisting snapshots where visual state isn't relevant
 * (e.g., saving for comparison rather than for restoring UI state).
 */
export function stripVisualState(
    snap: DataSnapshot
): DataSnapshot {
    const { visualState, ...rest } = snap;
    return rest;
}

/**
 * Add or replace visual state on a snapshot.
 */
export function withVisualState(
    state: DataVisualState
): (snap: DataSnapshot) => DataSnapshot {
    return (snap) => ({ ...snap, visualState: state });
}

/**
 * Add or replace the title on a snapshot.
 */
export function withTitle(
    title: string
): (snap: DataSnapshot) => DataSnapshot {
    return (snap) => ({ ...snap, title });
}

/**
 * Add a timestamp to the snapshot metadata.
 * Stamps each table's fetchedAt field with the current ISO timestamp.
 */
export function withTimestamp(
    snap: DataSnapshot
): DataSnapshot {
    const now = new Date().toISOString();
    return mapTables((table) => ({
        ...table,
        metadata: { ...table.metadata, fetchedAt: now }
    }))(snap);
}
```

#### 5.2.7 Output Formatters

```typescript
/**
 * Format a DataSnapshot as a markdown + JSON string for agent consumption.
 *
 * Produces a concise summary (table counts, key metrics, active filters)
 * followed by the full JSON payload. This gives the LLM both a quick
 * overview and the raw data to analyze.
 */
export function formatSnapshotForAgent(snap: DataSnapshot): string {
    const tables = normalizeToTables(snap);
    const parts: string[] = [];

    // Header
    parts.push(`## Data Snapshot: ${snap.title ?? 'Untitled'}`);
    parts.push('');

    // Table summary
    if (tables.length > 0) {
        parts.push(`**Tables:** ${tables.length}`);
        for (const table of tables) {
            const rowCount = table.metadata?.rowCount ?? table.rows.length;
            const colCount = table.columns.length;
            parts.push(`- **${table.name}**: ${rowCount} rows, ${colCount} columns`);
            if (table.description) {
                parts.push(`  ${table.description}`);
            }
        }
        parts.push('');
    }

    // Computations summary
    if (snap.computations && snap.computations.length > 0) {
        parts.push('**Key Metrics:**');
        for (const comp of snap.computations) {
            parts.push(`- ${comp.name}: ${comp.formattedValue ?? comp.value}`);
        }
        parts.push('');
    }

    // Visual state summary
    if (snap.visualState) {
        const vs = snap.visualState;
        if (vs.activeFilters && vs.activeFilters.length > 0) {
            parts.push(`**Active Filters:** ${vs.activeFilters.map(f =>
                f.displayText ?? `${f.field} ${f.operator} ${f.value}`
            ).join(', ')}`);
        }
        if (vs.drillPath && vs.drillPath.length > 0) {
            parts.push(`**Drill Path:** ${vs.drillPath.join(' → ')}`);
        }
        if (vs.searchText) {
            parts.push(`**Search:** "${vs.searchText}"`);
        }
        if (vs.sorting && vs.sorting.length > 0) {
            parts.push(`**Sort:** ${vs.sorting.map(s =>
                `${s.field} ${s.direction}`
            ).join(', ')}`);
        }
        parts.push('');
    }

    // Interpretation
    if (snap.interpretation) {
        parts.push('**Component Analysis:**');
        parts.push(snap.interpretation);
        parts.push('');
    }

    // Full JSON
    parts.push('**Full Data (JSON):**');
    parts.push('```json');
    parts.push(JSON.stringify(snap, null, 2));
    parts.push('```');

    return parts.join('\n');
}

/**
 * Extract flat dataset objects from a snapshot.
 * Strips all MJ-specific context, returning just name/columns/rows/count.
 * Useful for export, external system integration, or generic data consumers.
 */
export function toFlatDataSets(snap: DataSnapshot): Array<{
    name: string;
    columns: ColumnDescriptor[];
    rows: Record<string, unknown>[];
    totalRowCount: number;
}> {
    return normalizeToTables(snap).map(table => ({
        name: table.name,
        columns: table.columns.map(c => ({
            field: c.field,
            displayName: c.displayName,
            sqlBaseType: c.sqlBaseType,
            sqlFullType: c.sqlFullType,
            width: c.width,
            description: c.description
        })),
        rows: table.rows,
        totalRowCount: table.metadata?.totalAvailableRows ?? table.rows.length
    }));
}
```

### 5.3 Pipeline Examples

These illustrate how the transforms compose for real use cases:

```typescript
import { pipe, truncateRows, stripVisualState, withInterpretation,
         filterTables, selectColumns, formatSnapshotForAgent,
         toFlatDataSets, withTimestamp } from '@memberjunction/interactive-component-types';

// ── Use case: Agent analysis (John asks "what patterns do you see?") ──
const prepareForAgent = pipe(
    truncateRows(1000),
    withTimestamp,
    withInterpretation('Data snapshot from active view. Analyze for patterns and insights.')
);
// Usage:
// const snapshot = viewer.GetCurrentStateSnapshot();
// const context = formatSnapshotForAgent(prepareForAgent(snapshot));
// → inject context into agent conversation


// ── Use case: Export dashboard to flat data ──
const prepareForExport = pipe(
    filterTables(t => t.rows.length > 0),
    stripVisualState
);
// Usage:
// const flatSets = toFlatDataSets(prepareForExport(snapshot));
// → convert each flatSet to CSV


// ── Use case: Save snapshot for later comparison ──
const prepareForPersistence = pipe(
    truncateRows(5000),
    stripVisualState,
    withTimestamp
);
// Usage:
// const json = JSON.stringify(prepareForPersistence(snapshot));
// → save as artifact version


// ── Use case: Focused analysis on one table ──
const focusOnRevenue = pipe(
    filterTables(t => t.name === 'monthly_revenue'),
    selectColumns(['Month', 'Revenue', 'Growth']),
    truncateRows(500)
);
```

### 5.4 Export from Package

Add to `packages/InteractiveComponents/src/index.ts`:
```typescript
export * from './data-transforms';
```

### 5.5 Unit Tests

Add `packages/InteractiveComponents/src/__tests__/data-transforms.test.ts`:

- `pipe()` composes transforms left-to-right
- `pipe()` with zero transforms returns input unchanged
- `mapTables()` applies function to each table
- `mapTables()` normalizes single-table snapshot to tables[]
- `mapTables()` preserves non-table context (title, computations, etc.)
- `truncateRows()` caps rows at limit
- `truncateRows()` preserves totalAvailableRows
- `truncateRows()` is no-op when rows are under limit
- `sortTableRows()` sorts ascending and descending
- `sortTableRows()` handles null values
- `selectColumns()` keeps only specified columns in both definitions and row data
- `excludeColumns()` removes specified columns
- `filterTables()` keeps matching tables
- `getTable()` finds table by name
- `withInterpretation()` adds/replaces interpretation
- `addComputation()` appends computation
- `stripVisualState()` removes visual state
- `withTimestamp()` stamps each table's fetchedAt
- `formatSnapshotForAgent()` produces expected markdown structure
- `formatSnapshotForAgent()` handles empty snapshots
- `toFlatDataSets()` strips MJ-specific context
- All transforms are non-destructive (don't mutate input)

---

## 6. Phase 3: Component Event System

### 6.1 Overview

Add a runtime event subscription system to `ComponentObject` in `@memberjunction/interactive-component-types`. This enables consumers (Angular containers, agents, dashboards) to subscribe to component events and optionally cancel or modify default behavior.

The existing `ComponentEvent` metadata in `ComponentSpec` already declares what events a component CAN emit. This phase adds the **runtime layer** that makes those declarations actionable.

### 6.2 Design Principles

1. **Before/After pattern**: Mirrors the proven pattern from MJ's Angular generic components (grids, trees, timelines)
2. **Cancelable before events**: Before events carry a `cancel` flag; setting it to `true` prevents the default behavior
3. **Modifiable before events**: Before events can carry `modifiedValue` fields so consumers can intercept AND alter behavior without canceling
4. **Informational after events**: After events carry success/error/metrics — they cannot be canceled
5. **Framework-agnostic**: Types work in React, Angular, or vanilla JS
6. **Typed event args**: Each standard event has a strongly-typed args interface, but the bus is generic to support custom events

### 6.3 New File: `packages/InteractiveComponents/src/component-events.ts`

```typescript
// ─── BASE EVENT ARGS ───

/**
 * Base interface for all component event arguments.
 */
export interface BaseEventArgs {
    /** When the event occurred */
    timestamp: Date;

    /** Optional reference to the component that raised the event */
    sourceComponentName?: string;
}

/**
 * Base interface for Before events that support cancellation.
 */
export interface CancelableEventArgs extends BaseEventArgs {
    /**
     * Set to true to prevent the component from executing its default behavior.
     * Only meaningful for "before" events.
     */
    cancel: boolean;

    /** Optional reason for cancellation (for debugging/logging) */
    cancelReason?: string;
}

/**
 * Base interface for After events that report on completed operations.
 * Informational only — cannot be canceled.
 */
export interface AfterEventArgs extends BaseEventArgs {
    /** Whether the operation succeeded */
    success: boolean;

    /** Error message if the operation failed */
    errorMessage?: string;

    /** Duration of the operation in milliseconds */
    durationMs?: number;
}

// ─── STANDARD BEFORE EVENT ARGS ───

/** Before a data load/refresh operation */
export interface BeforeDataLoadEventArgs extends CancelableEventArgs {
    /** Parameters that will be used for loading */
    loadParams: Record<string, unknown>;

    /** Set this to override the load parameters */
    modifiedLoadParams?: Record<string, unknown>;
}

/** Before a filter is applied */
export interface BeforeFilterChangeEventArgs extends CancelableEventArgs {
    /** The filter being applied */
    filter: { field: string; operator: string; value: unknown };

    /** Previous filter state */
    previousFilters: Array<{ field: string; operator: string; value: unknown }>;

    /** Set this to apply a different filter instead */
    modifiedFilter?: { field: string; operator: string; value: unknown };
}

/** Before a row/item selection change */
export interface BeforeSelectionChangeEventArgs extends CancelableEventArgs {
    /** Items being selected */
    selectedItems: Array<{
        rowIndex: number;
        rowKey?: string;
        rowData?: Record<string, unknown>;
    }>;

    /** Whether this is additive (Ctrl+click) or replacing */
    isAdditive: boolean;

    /** Current selection before this change */
    currentSelection: Array<{ rowIndex: number; rowKey?: string }>;
}

/** Before a row/item click is processed */
export interface BeforeItemClickEventArgs extends CancelableEventArgs {
    /** The clicked item's data */
    item: Record<string, unknown>;

    /** Row/item index */
    itemIndex: number;

    /** Which column was clicked (if applicable) */
    column?: string;
}

/** Before a drill-down navigation */
export interface BeforeDrillDownEventArgs extends CancelableEventArgs {
    /** Current drill path before this navigation */
    currentPath: string[];

    /** The segment being drilled into */
    target: string;

    /** The full new path that would result */
    newPath: string[];
}

// ─── STANDARD AFTER EVENT ARGS ───

/** After data finishes loading */
export interface AfterDataLoadEventArgs extends AfterEventArgs {
    /** Number of rows/records loaded */
    recordCount: number;

    /** Total available records (if paged) */
    totalAvailableRecords?: number;

    /** Which table(s) were loaded */
    tableNames?: string[];
}

/** After a filter is applied */
export interface AfterFilterChangeEventArgs extends AfterEventArgs {
    /** The filter that was applied */
    filter: { field: string; operator: string; value: unknown };

    /** Resulting record count after filtering */
    resultingRecordCount: number;
}

/** After selection changes */
export interface AfterSelectionChangeEventArgs extends AfterEventArgs {
    /** New selection state */
    newSelection: Array<{
        rowIndex: number;
        rowKey?: string;
        rowData?: Record<string, unknown>;
    }>;

    /** Previous selection state */
    previousSelection: Array<{ rowIndex: number; rowKey?: string }>;
}

/** After a row/item click */
export interface AfterItemClickEventArgs extends AfterEventArgs {
    /** The clicked item's data */
    item: Record<string, unknown>;

    /** Row/item index */
    itemIndex: number;

    /** Which column was clicked */
    column?: string;
}

/** After a drill-down navigation */
export interface AfterDrillDownEventArgs extends AfterEventArgs {
    /** New drill path */
    newPath: string[];

    /** Previous path */
    previousPath: string[];

    /** Number of records in the drilled-down view */
    resultingRecordCount?: number;
}

/**
 * Emitted when the component's data state changes significantly.
 * Not cancelable — notification that the snapshot has changed.
 */
export interface DataStateChangedEventArgs extends BaseEventArgs {
    /** What triggered the change */
    reason: 'dataLoad' | 'filter' | 'sort' | 'selection'
        | 'drillDown' | 'refresh' | 'userAction' | 'external';

    /** Brief description of what changed */
    changeDescription?: string;

    /** Whether a new snapshot should be captured */
    snapshotRecommended: boolean;
}

// ─── EVENT BUS TYPES ───

/** Function signature for event handlers */
export type EventHandler<T extends BaseEventArgs = BaseEventArgs> = (args: T) => void;

/** Function to unsubscribe from an event */
export type Unsubscribe = () => void;

/** Well-known event names that components can emit */
export type StandardEventName =
    | 'beforeDataLoad' | 'afterDataLoad'
    | 'beforeFilterChange' | 'afterFilterChange'
    | 'beforeSelectionChange' | 'afterSelectionChange'
    | 'beforeItemClick' | 'afterItemClick'
    | 'beforeDrillDown' | 'afterDrillDown'
    | 'dataStateChanged';

/** Maps standard event names to their argument types */
export interface StandardEventMap {
    beforeDataLoad: BeforeDataLoadEventArgs;
    afterDataLoad: AfterDataLoadEventArgs;
    beforeFilterChange: BeforeFilterChangeEventArgs;
    afterFilterChange: AfterFilterChangeEventArgs;
    beforeSelectionChange: BeforeSelectionChangeEventArgs;
    afterSelectionChange: AfterSelectionChangeEventArgs;
    beforeItemClick: BeforeItemClickEventArgs;
    afterItemClick: AfterItemClickEventArgs;
    beforeDrillDown: BeforeDrillDownEventArgs;
    afterDrillDown: AfterDrillDownEventArgs;
    dataStateChanged: DataStateChangedEventArgs;
}

/**
 * Event bus interface for component event subscription.
 */
export interface ComponentEventBus {
    /**
     * Subscribe to a named event. Returns an unsubscribe function.
     *
     * @example
     * const unsub = events.on('beforeFilterChange', (args) => {
     *     if (args.filter.field === 'status') {
     *         args.cancel = true;
     *     }
     * });
     * // Later: unsub();
     */
    on<K extends keyof StandardEventMap>(
        event: K,
        handler: EventHandler<StandardEventMap[K]>
    ): Unsubscribe;
    on(event: string, handler: EventHandler): Unsubscribe;

    /** Unsubscribe a specific handler from an event */
    off(event: string, handler: EventHandler): void;

    /**
     * Emit an event. Returns the args after all handlers have processed.
     * For cancelable events, check args.cancel after calling emit.
     */
    emit<K extends keyof StandardEventMap>(
        event: K,
        args: StandardEventMap[K]
    ): StandardEventMap[K];
    emit(event: string, args: BaseEventArgs): BaseEventArgs;
}
```

### 6.4 New File: `packages/InteractiveComponents/src/component-event-bus.ts`

```typescript
import {
    BaseEventArgs, CancelableEventArgs,
    EventHandler, Unsubscribe, ComponentEventBus
} from './component-events';

/**
 * Default implementation of ComponentEventBus.
 *
 * Handlers fire in registration order. For cancelable events,
 * if a handler sets `cancel = true`, remaining handlers are skipped.
 */
export class DefaultComponentEventBus implements ComponentEventBus {
    private handlers: Map<string, Set<EventHandler>> = new Map();

    on(event: string, handler: EventHandler): Unsubscribe {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);

        return () => this.off(event, handler);
    }

    off(event: string, handler: EventHandler): void {
        this.handlers.get(event)?.delete(handler);
    }

    emit(event: string, args: BaseEventArgs): BaseEventArgs {
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            for (const handler of eventHandlers) {
                handler(args);
                // If a cancelable event was canceled, stop processing
                if ('cancel' in args && (args as CancelableEventArgs).cancel) {
                    break;
                }
            }
        }
        return args;
    }

    /**
     * Remove all handlers for all events.
     * Call this when the component is being destroyed.
     */
    clear(): void {
        this.handlers.clear();
    }

    /**
     * Check whether any handlers are registered for an event.
     */
    hasHandlers(event: string): boolean {
        const handlers = this.handlers.get(event);
        return !!handlers && handlers.size > 0;
    }
}
```

### 6.5 Update ComponentSpec Events Metadata

In `packages/InteractiveComponents/src/component-props-events.ts`, enhance `ComponentEvent`:

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

### 6.6 Export from Package

Add to `packages/InteractiveComponents/src/index.ts`:
```typescript
export * from './component-events';
export * from './component-event-bus';
```

### 6.7 Unit Tests

Add `packages/InteractiveComponents/src/__tests__/component-events.test.ts`:

- `on()` registers handler that fires on `emit()`
- `off()` removes handler so it no longer fires
- Unsubscribe function from `on()` removes the handler
- Multiple handlers on same event fire in registration order
- Cancelable events: setting `cancel = true` stops remaining handlers
- Non-cancelable events (no `cancel` property): all handlers fire regardless
- Emitting event with no registered handlers returns args unchanged
- `clear()` removes all handlers for all events
- `hasHandlers()` returns correct boolean
- Custom (non-standard) event names work with string signatures

---

## 7. Phase 4: Artifact-Level State Snapshots

### 7.1 Overview

Add `GetCurrentStateSnapshot()` to `BaseArtifactViewerPluginComponent` so that ALL artifact viewer plugins inherit a standard mechanism for exposing their current state. Each plugin type overrides this to return type-appropriate structured data.

### 7.2 Changes to BaseArtifactViewerPluginComponent

In `packages/Angular/Generic/artifacts/src/lib/components/base-artifact-viewer.component.ts`:

```typescript
import { DataSnapshot } from '@memberjunction/interactive-component-types';

export abstract class BaseArtifactViewerPluginComponent implements IArtifactViewerComponent {
    // ... existing code ...

    /**
     * Returns a point-in-time snapshot of this artifact's current state.
     *
     * Override in subclasses to provide richer, type-specific snapshots.
     * The snapshot can be:
     * - Passed to an agent as conversation context (ephemeral)
     * - Saved as an artifact version for persistence
     * - Used for comparison or audit purposes
     *
     * @returns JSON-serializable snapshot, or null if unavailable
     */
    public GetCurrentStateSnapshot(): DataSnapshot | Record<string, unknown> | null {
        // Default: try to parse content as JSON
        const content = this.parseJsonContent();
        if (content) {
            return content as Record<string, unknown>;
        }
        // For non-JSON content, return a text wrapper
        const rawContent = this.getRawContent();
        if (rawContent) {
            return {
                title: this.getDisplayTitle(),
                interpretation: `Raw content (${rawContent.length} characters)`,
                tables: []
            };
        }
        return null;
    }

    /**
     * Get the raw string content of this artifact.
     * Subclasses may override for custom content extraction.
     */
    protected getRawContent(): string | null {
        return this.artifactVersion?.Content ?? null;
    }

    /**
     * Get a display-friendly title for this artifact.
     */
    protected getDisplayTitle(): string {
        return this.artifactVersion?.ArtifactName ?? 'Untitled';
    }
}
```

### 7.3 Data Artifact Viewer Override

In `data-artifact-viewer.component.ts`:

```typescript
/**
 * Returns a DataSnapshot with live grid data, current page state,
 * and query sync state.
 */
public override GetCurrentStateSnapshot(): DataSnapshot | null {
    if (!this.spec) return null;

    return {
        ...this.spec,
        // Override rows with current live data if available
        ...(this.IsLive ? { rows: this.GridData } : {}),
        // Add visual state
        visualState: {
            pageNumber: this.PagerPageNumber,
            pageSize: this.PagerPageSize,
            // Future: extract sort/filter state from grid component
        },
        // Update metadata with live execution info
        metadata: {
            ...this.spec.metadata,
            ...(this.liveRowCount != null ? { rowCount: this.liveRowCount } : {}),
            ...(this.liveExecutionTime != null
                ? { executionTimeMs: this.liveExecutionTime } : {}),
            ...(this.PagerTotalRowCount > 0
                ? { totalAvailableRows: this.PagerTotalRowCount } : {})
        }
    };
}
```

### 7.4 Component Artifact Viewer Override

In `component-artifact-viewer.component.ts`:

```typescript
/**
 * Returns a DataSnapshot from the running React component's
 * getCurrentDataState(), or falls back to component spec metadata.
 */
public override GetCurrentStateSnapshot(): DataSnapshot | Record<string, unknown> | null {
    // Try structured data from the running React component
    const reactState = this.reactComponent?.componentObject?.getCurrentDataState?.();
    if (reactState) {
        return reactState as DataSnapshot;
    }

    // Fall back to component spec metadata
    const spec = this.resolvedComponentSpec;
    if (spec) {
        return {
            title: spec.title || spec.name,
            interpretation: spec.description,
            tables: [],
            computations: [],
            visualState: undefined
        };
    }

    return null;
}
```

### 7.5 JSON Artifact Viewer Override

```typescript
public override GetCurrentStateSnapshot(): Record<string, unknown> | null {
    return this.parseJsonContent<Record<string, unknown>>();
}
```

### 7.6 Code Artifact Viewer Override

```typescript
public override GetCurrentStateSnapshot(): Record<string, unknown> | null {
    const content = this.getRawContent();
    if (!content) return null;
    return {
        language: this.detectedLanguage || 'unknown',
        content: content,
        lineCount: content.split('\n').length,
        title: this.getDisplayTitle(),
        snapshotTimestamp: new Date().toISOString()
    };
}
```

### 7.7 Panel Passthrough

In `artifact-viewer-panel.component.ts`:

```typescript
/**
 * Get a snapshot of the currently displayed artifact's state.
 * Delegates to the active plugin's GetCurrentStateSnapshot().
 *
 * @returns Snapshot, or null if no plugin is active
 */
public GetCurrentStateSnapshot(): DataSnapshot | Record<string, unknown> | null {
    return this.activePlugin?.GetCurrentStateSnapshot() ?? null;
}
```

---

## 8. Phase 5: Multi-Table Viewer UX

### 8.1 Overview

Update `DataArtifactViewerComponent` to render multi-table snapshots with a tabbed interface. Single-table snapshots display identically to today — no tabs, just the grid. Multi-table snapshots show a tab strip between the toolbar and grid.

### 8.2 UX Design

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

### 8.3 Component Changes

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

In `ngOnInit()`, use `normalizeToTables()` to resolve all tables:

```typescript
import { normalizeToTables } from '@memberjunction/interactive-component-types';

async ngOnInit(): Promise<void> {
    this.spec = this.parseJsonContent<DataSnapshot>();
    if (!this.spec) { /* error handling */ return; }

    // Resolve to tables array (handles both single and multi-table)
    this.ResolvedTables = normalizeToTables(this.spec, this.spec.title || 'Results');

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
            // Inline data
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

### 8.4 Template Changes

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

### 8.5 Styles

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

### 8.6 Additional Tabs

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

### 8.7 Migration: Remove Local Interfaces

Remove the local `DataArtifactSpec` and `DataArtifactColumn` interfaces from `data-artifact-viewer.component.ts`. Import from `@memberjunction/interactive-component-types` instead:

```typescript
import {
    DataSnapshot, DataArtifactSpec, DataTable, MJColumnDescriptor,
    normalizeToTables, isMultiTable
} from '@memberjunction/interactive-component-types';
```

---

## 9. Phase 6: Agent-Component Dialog Bridge

### 9.1 Overview

Enable agents to consume component data snapshots. Connects the snapshot mechanism (Phase 4) to the agent conversation system. Two modes now, one future.

### 9.2 Mode A: Ephemeral Snapshot Handoff

The simplest mode — UI captures a snapshot and injects it into the agent conversation as structured context. No new infrastructure beyond Phases 1 and 4.

**Flow:**
1. User clicks "Analyze" while viewing an artifact (or asks agent a question about the data)
2. UI calls `viewerPanel.GetCurrentStateSnapshot()` → gets `DataSnapshot`
3. UI uses the composable transforms to prepare the snapshot:
   ```typescript
   const prepared = pipe(
       truncateRows(1000),
       withTimestamp
   )(snapshot);
   const context = formatSnapshotForAgent(prepared);
   ```
4. UI injects the formatted context into the agent conversation
5. Agent processes the structured data and responds with insights
6. No persistent record — snapshot lives only in the conversation turn

**Implementation:**

In `ArtifactViewerPanelComponent`:

```typescript
@Output() AnalyzeRequested = new EventEmitter<{
    snapshot: DataSnapshot | Record<string, unknown>;
    contextMessage: string;
    artifactId?: string;
    artifactVersionId?: string;
}>();

public OnAnalyzeWithAgent(): void {
    const snapshot = this.GetCurrentStateSnapshot();
    if (!snapshot) return;

    // Use composable transforms to prepare for agent
    const prepared = 'tables' in snapshot || 'rows' in snapshot
        ? pipe(truncateRows(1000), withTimestamp)(snapshot as DataSnapshot)
        : snapshot;

    const contextMessage = 'tables' in prepared || 'rows' in prepared
        ? formatSnapshotForAgent(prepared as DataSnapshot)
        : JSON.stringify(prepared, null, 2);

    this.AnalyzeRequested.emit({
        snapshot: prepared,
        contextMessage,
        artifactId: this.artifactVersion?.ArtifactID,
        artifactVersionId: this.artifactVersion?.ID
    });
}
```

In `artifact-viewer-panel.component.html`:

```html
<button class="btn-icon"
    title="Analyze with AI agent"
    (click)="OnAnalyzeWithAgent()"
    [disabled]="!HasActivePlugin">
    <i class="fas fa-brain"></i> Analyze
</button>
```

### 9.3 Mode B: Persistent Artifact

The snapshot is saved as an artifact version, linked to the conversation, and passed to the agent as a formal artifact input.

**Flow:**
1. User triggers "Save Snapshot" or "Analyze (persistent)"
2. UI calls `GetCurrentStateSnapshot()` → gets `DataSnapshot`
3. UI prepares and saves via composable transforms
4. UI creates a new `MJ: Artifact Version` with the snapshot JSON
5. UI creates `MJ: Conversation Detail Artifact` linking the version to the conversation
6. Agent receives the artifact as part of conversation context

**New Artifact Type Metadata:**

Create `metadata/artifact-types/.data-snapshot-artifact-type.json`:
```json
{
    "fields": {
        "Name": "Data Snapshot",
        "Description": "Point-in-time snapshot of a component or artifact's data state. Contains structured multi-table data with computations, visual state, and optional interpretation.",
        "ContentType": "application/vnd.mj.data-snapshot",
        "DriverClass": "DataArtifactViewerPlugin",
        "Icon": "fa-solid fa-camera"
    }
}
```

This reuses the `DataArtifactViewerPlugin` driver class since the content format is `DataSnapshot` — the same viewer handles both data artifacts and snapshots.

### 9.4 Mode C: Live Dialog (Future, Not In Scope)

Agent subscribes to component events and invokes methods in real-time. Requires the event system from Phase 3 plus a WebSocket/streaming channel between agent and component. Documented here as the natural next step — prerequisites:
- Phase 3 (event system) must be complete
- Agent framework must support long-running subscriptions
- WebSocket channel between agent and UI must exist

---

## 10. Phase 7: Interactive Component Data Contract

### 10.1 Overview

Update the `ComponentObject` interface so that `getCurrentDataState()` returns a `DataSnapshot` instead of `any`. This makes interactive components first-class participants in the snapshot ecosystem. An agent can call through to a React dashboard component and get back structured multi-table data with computations and visual state.

### 10.2 Changes to ComponentObject

In `packages/InteractiveComponents/src/runtime-types.ts`:

```typescript
import { DataSnapshot } from './data-snapshot';
import { ComponentEventBus } from './component-events';

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
     * - `visualState`: Current filters, sorting, selections, drill path
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
     * Gets the history of data state changes in the component.
     * Returns an array of timestamped snapshots.
     *
     * Useful for understanding how the user interacted with the component
     * over time (what they filtered, drilled into, selected).
     */
    getDataStateHistory?: () => Array<{ timestamp: Date; state: DataSnapshot }>;

    /**
     * Event bus for subscribing to component events.
     * Consumers can listen for before/after events, cancel default behavior,
     * and receive notifications of state changes.
     *
     * Undefined if the component does not support events.
     */
    events?: ComponentEventBus;

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

### 10.3 React Component Guide: Implementing getCurrentDataState()

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
            metadata: { rowCount: monthlyData.length, queryId: "revenue-query" }
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
            metadata: { rowCount: 10, entityName: "Customers" }
        }
    ],
    computations: [
        { name: "Total Revenue", type: "sum", field: "Revenue",
          table: "monthly_revenue", value: 4500000, formattedValue: "$4.5M" },
        { name: "YoY Growth", type: "custom", value: 12.3,
          formattedValue: "+12.3%",
          description: "Year-over-year revenue growth rate" }
    ],
    visualState: {
        activeFilters: [
            { field: "Region", operator: "eq", value: "West",
              displayText: "Region = West" }
        ],
        drillPath: ["All Regions", "West"],
        sorting: [{ field: "Revenue", direction: "desc" }],
        activeTab: "monthly_revenue"
    },
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
    visualState: {
        activeFilters: [
            { field: "status", operator: "neq", value: "offline",
              displayText: "Status is not Offline" }
        ],
        custom: { zoomLevel: 0.85, selectedCluster: "production" }
    }
})
```

### 10.4 Angular Bridge Update

In `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`:

```typescript
import { DataSnapshot } from '@memberjunction/interactive-component-types';

/**
 * Get the current data state from the running React component.
 * Returns a DataSnapshot if the component implements getCurrentDataState().
 */
public GetCurrentDataState(): DataSnapshot | undefined {
    return this.componentObject?.getCurrentDataState?.();
}
```

### 10.5 Backward Compatibility

Components that currently return arbitrary objects from `getCurrentDataState()` will continue to work at the JavaScript level — TypeScript allows returning a more specific type where `any` was expected. The consuming infrastructure (snapshot methods, agent bridge) now has a structured contract to rely on, with the `Record<string, unknown>` fallback in `GetCurrentStateSnapshot()` handling non-conforming components gracefully.

---

## 11. Future: Visualization Foundation Layer

This section documents the longer-term architectural direction for MJ's artifact and visualization system. These capabilities build on the data layer defined above but are not part of the immediate implementation phases.

### 11.1 Artifact Type Formalization

MJ already has artifact type metadata in the database and a plugin-based viewer system. The next step is formalizing this with in-code interfaces:

```typescript
/**
 * Core artifact descriptor — a platform-agnostic blueprint
 * for a visualization or structured output.
 */
interface IArtifact {
    ID: string;
    ArtifactType: string;
    Title: string;
    Description?: string;
    Config: Record<string, unknown>;
    Data?: IArtifactData;

    /** Whether this artifact's data can be extracted as tabular DataTables */
    get SupportsDataTable(): boolean;

    /** Extract the artifact's data as DataTable(s) */
    ToDataTables(): DataTable[];
}
```

Note: `ToDataTables()` returns `DataTable[]` (this plan's type), not a separate `IDataSet`. The `DataTable` IS the standard tabular interchange format.

### 11.2 Renderer Registry

Formalize the existing plugin matching system with explicit priority:

```typescript
interface IArtifactRenderer {
    SupportedTypes: string[];
    Priority: number;
    CanRender(artifact: IArtifact): boolean;
    Render(artifact: IArtifact, container: unknown, options?: IRenderOptions): void;
}

class ArtifactRendererRegistry {
    /** Higher priority renderers are preferred */
    static Register(renderer: IArtifactRenderer): void;

    /** Returns highest-priority renderer that can handle the artifact */
    static GetRenderer(artifact: IArtifact): IArtifactRenderer | undefined;
}
```

This enables commercial products (like Skip) to register enhanced renderers at higher priority that automatically win over base MJ renderers — without modifying any MJ code.

### 11.3 Package Structure (Future)

| Package | Contents |
|---|---|
| `@memberjunction/artifacts-core` | `IArtifact`, `IArtifactData`, `BaseArtifact`, registries |
| `@memberjunction/artifacts-types` | Built-in types: `ChartArtifact`, `TableArtifact`, `KPIArtifact`, `DashboardArtifact` |
| `@memberjunction/artifacts-renderers-angular` | Base Angular renderers for each type |

These packages import `DataTable` and `DataSnapshot` from `@memberjunction/interactive-component-types` — they don't redefine tabular data types.

### 11.4 Relationship to Existing Artifact System

The existing artifact system (database metadata + viewer plugins) continues to work unchanged. The registries formalize the matching logic that currently lives in database lookups and `canHandle()` methods. Migration is incremental — existing plugins can be wrapped to implement `IArtifactRenderer` without changing their internal logic.

---

## 12. Cross-Cutting Concerns

### 12.1 Package Dependencies

| Package | New Dependencies | Why |
|---|---|---|
| `@memberjunction/interactive-component-types` | None (new types + functions only) | All new types, transforms, and event system |
| `@memberjunction/ng-artifacts` | Already depends on `interactive-component-types` | Needs new type imports for snapshots |
| `@memberjunction/ng-react` | Already depends on `interactive-component-types` | No new dependency needed |
| `@memberjunction/ng-query-viewer` | None | Uses `QueryGridColumnConfig` which maps to `GridColumnDescriptor` |

### 12.2 Versioning

All changes are additive. No breaking changes to existing interfaces:
- `DataSnapshot` has `DataArtifactSpec` as a type alias for backward compatibility
- `ComponentObject.getCurrentDataState()` changes from `() => any` to `() => DataSnapshot | undefined` — compatible because `any` accepts any return type
- `BaseArtifactViewerPluginComponent` gains a new virtual method with a default implementation
- New fields on `DataSnapshot` (tables, computations, visualState, interpretation) are all optional

### 12.3 Build Order

1. `@memberjunction/interactive-component-types` (types, transforms, event bus)
2. `@memberjunction/ng-artifacts` (viewer changes, snapshot method)
3. `@memberjunction/ng-react` (bridge update)
4. Consumer code (conversation panel, agent integration)

### 12.4 Migration Path

**Existing data artifacts:** Zero migration. Single-table specs with root-level fields continue to work. The viewer detects whether `tables[]` is present and falls back to root-level fields.

**Existing interactive components:** Zero migration. Components that don't implement `getCurrentDataState()` continue to work. The snapshot system returns `null` gracefully.

**Existing agents:** Zero migration. Agents that don't consume snapshots are unaffected.

**Existing `DataArtifactColumn` references:** The local interface is removed from the viewer component and replaced with `MJColumnDescriptor` from the shared package. The fields are the same except `headerName` → `displayName`. Internal search-and-replace within the data viewer.

### 12.5 Performance Considerations

- **Snapshot serialization**: `JSON.stringify()` on large datasets could be slow. Use `truncateRows()` from the transform toolkit before serializing for agent consumption. Default recommendation: 1,000 rows for LLM context.
- **Multi-table lazy loading**: Only load data for the active table tab. Other tabs load on first click (already designed this way in Phase 5).
- **Event bus**: `DefaultComponentEventBus` uses `Map<string, Set<Function>>`. For high-frequency events, components can implement a custom bus with debouncing.
- **Transform immutability**: All transforms create new objects (spread operator). For very large datasets, consider a mutable fast-path transform that operates in-place, clearly documented as such.

### 12.6 Security Considerations

- **Snapshot content**: Snapshots inherit the permission model of their source artifact. A user who can view the artifact can capture its snapshot.
- **Agent context**: When snapshots are passed to agents, the agent runs under the user's permission context (`contextUser`). The agent cannot access data the user cannot see.
- **Artifact persistence**: When snapshots are saved as artifact versions, they inherit the parent artifact's permissions.

### 12.7 Testing Strategy

| Phase | Test Type | What to Test |
|---|---|---|
| 1 | Unit | Type compatibility, normalization, column conversions |
| 2 | Unit | Every transform function, pipeline composition, formatters |
| 3 | Unit | Event bus subscribe/unsubscribe, cancellation, handler ordering |
| 4 | Unit | Default snapshot for each viewer plugin type |
| 5 | Component | Multi-table tab rendering, tab switching, per-table paging |
| 6 | Integration | Snapshot → agent context formatting, artifact creation |
| 7 | Unit | `getCurrentDataState()` return type, backward compatibility |

---

## 13. File Inventory

### New Files

| File | Phase | Purpose |
|---|---|---|
| `packages/InteractiveComponents/src/column-descriptors.ts` | 1 | Three-level column type hierarchy + conversion functions |
| `packages/InteractiveComponents/src/data-table.ts` | 1 | `DataTable` and `DataTableMetadata` interfaces |
| `packages/InteractiveComponents/src/data-snapshot.ts` | 1 | `DataSnapshot`, `DataComputation`, `DataVisualState`, `DataFilter`, normalization helpers |
| `packages/InteractiveComponents/src/data-transforms.ts` | 2 | Composable transform functions, pipeline utility, output formatters |
| `packages/InteractiveComponents/src/component-events.ts` | 3 | Event arg interfaces, `ComponentEventBus` interface, standard event map |
| `packages/InteractiveComponents/src/component-event-bus.ts` | 3 | `DefaultComponentEventBus` implementation |
| `packages/InteractiveComponents/src/__tests__/core-types.test.ts` | 1 | Unit tests for types and normalization |
| `packages/InteractiveComponents/src/__tests__/data-transforms.test.ts` | 2 | Unit tests for all transform functions |
| `packages/InteractiveComponents/src/__tests__/component-events.test.ts` | 3 | Unit tests for event bus |
| `metadata/artifact-types/.data-snapshot-artifact-type.json` | 6 | Data Snapshot artifact type metadata |

### Modified Files

| File | Phase | Changes |
|---|---|---|
| `packages/InteractiveComponents/src/index.ts` | 1, 2, 3 | Add exports for new modules |
| `packages/InteractiveComponents/src/runtime-types.ts` | 3, 7 | Update `ComponentObject` with typed `getCurrentDataState()`, add `events` |
| `packages/InteractiveComponents/src/component-props-events.ts` | 3 | Add `cancelable` and `pairedEvent` to `ComponentEvent` |
| `packages/Angular/Generic/artifacts/.../base-artifact-viewer.component.ts` | 4 | Add `GetCurrentStateSnapshot()` base method |
| `packages/Angular/Generic/artifacts/.../data-artifact-viewer.component.ts` | 1, 4, 5 | Remove local interfaces, import shared types, add multi-table UX, add snapshot override |
| `packages/Angular/Generic/artifacts/.../data-artifact-viewer.component.html` | 5 | Add table tab strip, computations bar |
| `packages/Angular/Generic/artifacts/.../data-artifact-viewer.component.css` | 5 | Add table tab and computation styles |
| `packages/Angular/Generic/artifacts/.../component-artifact-viewer.component.ts` | 4 | Add snapshot override delegating to React component |
| `packages/Angular/Generic/artifacts/.../artifact-viewer-panel.component.ts` | 4, 6 | Add `GetCurrentStateSnapshot()` passthrough, add "Analyze" action |
| `packages/Angular/Generic/artifacts/.../artifact-viewer-panel.component.html` | 6 | Add "Analyze" button to toolbar |
| `packages/Angular/Generic/react/.../mj-react-component.component.ts` | 7 | Add `GetCurrentDataState()` public method |

---

## 14. Implementation Order & Dependencies

```
1. Phase 1: Core Type System               ← DO FIRST (foundation for everything)
   │  column-descriptors.ts
   │  data-table.ts
   │  data-snapshot.ts
   │  index.ts exports
   │  core-types.test.ts
   │
   ├──▶ 2a. Phase 2: Transform Toolkit            (parallel after Phase 1)
   │         data-transforms.ts
   │         data-transforms.test.ts
   │
   ├──▶ 2b. Phase 3: Event System                 (parallel after Phase 1)
   │         component-events.ts
   │         component-event-bus.ts
   │         component-events.test.ts
   │         runtime-types.ts update (events)
   │
   ├──▶ 2c. Phase 4: Artifact Snapshots            (parallel after Phase 1)
   │         base-artifact-viewer update
   │         per-viewer overrides
   │         artifact-viewer-panel update
   │
   ├──▶ 2d. Phase 5: Multi-Table Viewer UX         (parallel after Phase 1)
   │         data-artifact-viewer (ts/html/css)
   │         migration: remove local interfaces
   │
   └──▶ 2e. Phase 7: Component Data Contract       (parallel after Phase 1)
              runtime-types.ts update (getCurrentDataState)
              mj-react-component update
              │
              ▼
         3. Phase 6: Agent Bridge                   (after Phases 4 + 7)
              artifact-viewer-panel analyze action
              formatSnapshotForAgent integration
              data-snapshot artifact type metadata
```

**Estimated scope:**
- ~600 lines: Core types (Phase 1)
- ~400 lines: Transform toolkit (Phase 2)
- ~350 lines: Event system (Phase 3)
- ~200 lines: Snapshot methods (Phase 4)
- ~300 lines: Multi-table viewer UX (Phase 5)
- ~150 lines: Agent bridge (Phase 6)
- ~100 lines: Component contract (Phase 7)
- ~500 lines: Unit tests (across all phases)
- **Total: ~2,600 lines of new/modified code**

---

## 15. Open Items & Future Considerations

### 15.1 Open Design Questions

1. **Snapshot size limits.** When a component has 100K rows, should `getCurrentDataState()` return all of them? Recommendation: truncate to configurable limit (default 1,000 rows) with `metadata.totalAvailableRows` indicating the full count. The agent can request more via a follow-up action if needed.

2. **Column naming: `displayName` vs `headerName`.** The new type uses `displayName` (more general). The existing `DataArtifactColumn` uses `headerName` (grid-specific). The migration is a simple rename in the data viewer, but component specs and agent output may reference either. Recommendation: support both during a transition period via a normalization function.

3. **QueryGridColumnConfig migration.** Should `QueryGridColumnConfig` eventually extend `GridColumnDescriptor`, or should conversion functions bridge the two? Recommendation: conversion functions first (non-breaking), with eventual migration to extend when the query viewer is next refactored.

4. **Computed table formalization.** When `source` is `'computed'`, the component built the data client-side. Should we formalize computation descriptions more (e.g., a mini-DSL)? Recommendation: start with the free-text `computationDescription` and evolve based on real usage patterns.

5. **Snapshot diff.** Should the system support comparing two snapshots? Useful for "what changed since I last looked?" scenarios. Could be a transform function operating on two `DataSnapshot` objects. Recommendation: future phase, design when the first concrete use case emerges.

### 15.2 Future Capabilities (Not In Scope)

| Capability | Description | Prerequisites |
|---|---|---|
| **Live Agent Dialog** | Agent subscribes to component events in real-time, can invoke methods | Phases 3, 6, WebSocket infrastructure |
| **Snapshot Comparison** | Diff two snapshots to highlight changes | Phase 1, transform toolkit |
| **Agent-Initiated Filtering** | Agent applies filters to running components via actions | Phases 3, 7, new MJ Actions |
| **Cross-Component Snapshots** | Capture state of multiple components simultaneously | Phase 4, dashboard infrastructure |
| **Snapshot Scheduling** | Automatically capture snapshots at intervals for trend analysis | Phase 6, scheduling infrastructure |
| **Agent-Initiated Component Creation** | Agent produces a new DataSnapshot as a suggested "next view" that can be rendered directly | Phases 1, 5 |

### 15.3 Relationship to Existing Plans

- **Query Builder Agent Plan** (`plans/complete/query-builder-agent-plan.md`): This plan extends the Data artifact type created there. The multi-table expansion and snapshot system are additive.
- **Component Artifact Viewer Improvements** (`plans/complete/3-component-artifact-viewer-improvements.md`): The snapshot system adds a new capability without modifying the existing rendering pipeline.
- **Composable Queries Plan** (`plans/nested-queries-paging-caching-plan.md`): Multi-table `DataSnapshot` could represent composed query results where each sub-query becomes a named table.

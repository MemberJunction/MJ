/**
 * @module interfaces
 * @description Shared type contracts and utility functions for the Database Designer Agent system.
 *
 * These interfaces define the payload that flows between all sub-agents
 * (Requirements Analyst → Schema Designer → Schema Validator → Schema Builder)
 * as well as the standalone action API surface.
 *
 * Utility functions in this module are co-located here because they are tightly
 * coupled to RunView filter construction used throughout the database designer
 * pipeline, and this module is already the universal import for all entity
 * designer code (agents, executor, and actions).
 */

import type { TableDefinition } from '@memberjunction/schema-engine';

// ─── Payload ────────────────────────────────────────────────────────────────

/**
 * Root payload passed through the entire Database Designer agent chain.
 *
 * ### Standalone mode (default)
 * The user converses directly with Database Designer. The Requirements Analyst
 * and Schema Designer sub-agents populate the first two sections sequentially
 * before the code-based Validator and Builder take over.
 *
 * ### Subagent mode (`mode === 'subagent'`)
 * Invoked by another agent (e.g. Planning Designer) that has already determined
 * what entity is needed.  The caller provides `callerContext.tableSpec` and the
 * orchestrator skips Requirements Analyst, routing directly to Schema Designer.
 */
export interface DatabaseDesignerPayload {
    /**
     * Operating mode set by whoever initiates the agent run.
     * - `'standalone'`: full conversational flow (default when omitted)
     * - `'subagent'`: fast path — caller provides `callerContext.tableSpec`,
     *   Requirements Analyst is skipped
     */
    mode?: 'standalone' | 'subagent';

    /**
     * Populated by the calling agent in subagent mode.
     * Contains the pre-researched entity spec and invocation metadata.
     * Ignored when `mode !== 'subagent'`.
     */
    callerContext?: DatabaseDesignerCallerContext;

    /**
     * Natural-language requirements document produced by the Requirements
     * Analyst sub-agent (standalone mode only).  Markdown format.
     */
    FunctionalRequirements?: string;

    /**
     * Existing entity research written by the Schema Designer after it
     * queries the Database Research Agent in Step 1.
     * Used to surface potential duplicates or FK targets to the user.
     * Key matches SubAgentOutputMapping in .database-designer.json.
     */
    entityResearch?: ExistingEntityResearch;

    /** Schema design artefacts produced by the Schema Designer sub-agent. */
    SchemaDesign?: SchemaDesignSection;

    /** Validation outcome written by the Schema Validator sub-agent. */
    ValidationResult?: EntityValidationResult;

    /** Final outcome written by the Schema Builder sub-agent. */
    DatabaseDesignerResult?: DatabaseDesignerResult;

    /**
     * Number of times the orchestrator has dispatched Database Schema Builder.
     * Incremented by the deterministic intercept in DatabaseDesignerAgent each time
     * Intercept 3 fires. Prevents infinite retry when the builder fails — the
     * framework discards a failed sub-agent's newPayload, so DatabaseDesignerResult
     * never propagates back; without this counter the intercept would re-fire
     * every turn until the agent run is killed.
     *
     * Reset to 0 when Intercept 2 fires (user re-approves, triggering fresh validation).
     */
    BuildAttemptCount?: number;
}

/**
 * Context provided by the calling agent when Database Designer runs in subagent
 * mode (`payload.mode === 'subagent'`).
 */
export interface DatabaseDesignerCallerContext {
    /** Display name of the calling agent — used in user-facing confirmation messages. */
    agentName: string;

    /** The entity specification the calling agent wants created or modified. */
    tableSpec: SubagentTableSpec;

    /**
     * When true, the calling agent has already obtained explicit user approval
     * (e.g. Agent Manager showed a design review step).  Database Designer will
     * skip its own confirmation prompt and proceed directly to validation.
     * Defaults to false when omitted — Database Designer asks the user to confirm.
     */
    subagentConfirmedByParent?: boolean;
}

/**
 * Minimum entity specification passed by a calling agent in subagent mode.
 * Schema Designer uses this as the starting point when `FunctionalRequirements`
 * is not available.
 */
export interface SubagentTableSpec {
    /** Proposed entity display name — human-readable, title-cased with spaces (e.g. "Customer Orders"). */
    name: string;

    /** One-paragraph description of what each row represents (create) or what changes are being made (alter). */
    description: string;

    /**
     * Target SQL schema.  Defaults to the UDT sandbox schema when omitted.
     * Will be validated by the Schema Validator — blocked schemas are rejected.
     */
    schemaName?: string;

    /**
     * Operation type.  Defaults to `'create'` when omitted.
     * - `'create'`: design and create a brand-new entity
     * - `'alter'`: add columns to an existing entity (requires `existingEntityId`)
     */
    modificationType?: 'create' | 'alter';

    /**
     * UUID of the entity to modify.  Required when `modificationType === 'alter'`.
     * Must be obtained from Database Research Agent before invoking Database Designer.
     */
    existingEntityId?: string;

    /**
     * Column hints from the calling agent.
     * - For `'create'`: the full proposed column list (Schema Designer refines these).
     * - For `'alter'`: ONLY the new columns to add — do not include existing columns.
     * Omit entirely to let Schema Designer infer columns from name + description.
     */
    columns?: Array<{
        name: string;
        type: string;
        description?: string;
        required?: boolean;
        /** e.g. "__mj.User.ID" — Schema Designer resolves to a proper FK definition. */
        foreignKeyTarget?: string;
    }>;
}

/**
 * Research findings written by Schema Designer after it queries the Database
 * Research Agent for existing entities that might match the user's intent.
 */
export interface ExistingEntityResearch {
    /** Whether the research found any potentially matching entities. */
    found: boolean;

    /** Up to 5 closest matches returned by the Database Research Agent. */
    matchingEntities: Array<{
        entityName: string;
        schemaName: string;
        tableName: string;
        description: string;
    }>;
}

/**
 * Schema design artefacts.  The `TableDefinition` is the single source of
 * truth consumed by downstream code-based agents.
 */
export interface SchemaDesignSection {
    /**
     * One-paragraph human-readable description of what this table stores and
     * what each row represents.  Written by the Schema Designer LLM; shown to
     * the user above the prototype column table in both the chat approval
     * message and the Angular wizard review step.
     *
     * Required when `ModificationType === 'create'`.  Optional for `'alter'`
     * where the entity already has a description.
     */
    Description?: string;

    /**
     * Human-readable markdown table shown to the user for approval.
     * Example:
     * | Column | Type | Nullable | Description |
     * |--------|------|----------|-------------|
     * | Name   | string | No   | Full name   |
     */
    Prototype?: string;

    /**
     * Mermaid `erDiagram` block visualising the table's FK relationships.
     * Injected server-side by `DatabaseDesignerAgent` after Schema Designer
     * returns — NOT written by the LLM (eliminates mermaid syntax errors).
     *
     * Shown to the user in both the chat approval message (appended after the
     * prototype table) and the Angular wizard review step via `MarkdownComponent`.
     * Omitted when the table has no FK relationships.
     */
    ERDMermaid?: string;

    /** Fully typed input to SchemaEngine.GenerateMigration(). */
    TableDefinition?: TableDefinition;

    /** Whether this is a new table or an ALTER to an existing one. */
    ModificationType?: 'create' | 'alter';

    /**
     * Entity ID of the entity being modified.
     * Required when `ModificationType === 'alter'`.
     */
    ExistingEntityID?: string;
}

/** Validation summary written by `DatabaseDesignerSchemaValidator`. */
export interface EntityValidationResult {
    Valid: boolean;
    /** Human-readable error descriptions (empty when Valid === true). */
    Errors: string[];
    /** Non-blocking advisories. */
    Warnings: string[];
}

/** Final pipeline outcome written by `DatabaseDesignerSchemaBuilder`. */
export interface DatabaseDesignerResult {
    Success: boolean;
    /** Populated on success — the MJ entity name (e.g. "Meetup Attendees"). */
    EntityName?: string;
    /** Populated on success — the new entity's ID in MJ: Entities. */
    EntityID?: string;
    /** SQL schema name (e.g. "__mj_UDT"). */
    SchemaName?: string;
    /** Physical table name (e.g. "MeetupAttendees"). */
    TableName?: string;
    /** Step-by-step pipeline trace from RuntimeSchemaManager. */
    PipelineSteps?: PipelineStepSummary[];
    /** Populated on failure. */
    ErrorMessage?: string;
}

/** Lightweight snapshot of a single RSU pipeline stage. */
export interface PipelineStepSummary {
    Name: string;
    Status: 'success' | 'failed' | 'skipped';
    DurationMs: number;
    /**
     * Human-readable message from RuntimeSchemaManager — critical context on
     * failure (e.g. "Migration file not found", "SQL Server error: ...").
     * Maps directly to RSUPipelineStep.Message.
     */
    Message?: string;
}

// ─── Pipeline execution ──────────────────────────────────────────────────────

/** Result returned by `DatabaseDesignerPipelineExecutor`. */
export interface PipelineExecutionResult {
    Success: boolean;
    EntityID?: string;
    EntityName?: string;
    SchemaName?: string;
    TableName?: string;
    PipelineSteps?: PipelineStepSummary[];
    ErrorMessage?: string;
    /** Non-fatal advisories — e.g. metadata refresh failure after a successful pipeline run. */
    Warnings?: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Column names reserved by MemberJunction's CodeGen system.  The agent must
 * not allow users to define columns with these names since CodeGen injects
 * them automatically.
 */
export const CODEGEN_RESERVED_COLUMNS: ReadonlySet<string> = new Set([
    'id',
    '__mj_createdat',
    '__mj_updatedat',
]);

/**
 * Authorization names used by the Database Designer security layer.
 * These map 1-to-1 to the records in `metadata/authorizations/.schema-management.json`.
 */
export const AUTHORIZATIONS = {
    CREATE_IN_UDT_SCHEMA: 'Create in UDT Schema',
    CREATE_IN_CUSTOM_SCHEMA: 'Create in Custom Schema',
    MODIFY_OWN_ENTITIES: 'Modify Own Entities',
    MODIFY_ANY_UDT_ENTITIES: 'Modify Any UDT Entities',
} as const;

/** The schema Database Designer encourages for user-created tables. */
export const UDT_SCHEMA_NAME = '__mj_UDT';

/** EntitySettings key constants for UDT provenance tracking. */
export const UDT_SETTINGS = {
    OWNER_KEY: 'MJ:UDT:Owner',
    SOURCE_KEY: 'MJ:UDT:Source',
    SOURCE_ENTITY_DESIGNER: 'DatabaseDesigner',
    SOURCE_AGENT_MANAGER: 'AgentManager',
} as const;

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Escape a string value for safe embedding in a SQL single-quoted literal
 * (used in RunView `ExtraFilter` strings).
 *
 * Replaces every single-quote with two single-quotes, which is the ANSI SQL
 * standard escaping mechanism supported by both SQL Server and PostgreSQL.
 *
 * **Do not use for identifier names** (table/column names) — those require
 * bracket or double-quote quoting and are handled by SchemaEngine's
 * `ValidateIdentifier()`.
 *
 * @example
 * // User-supplied name embedded in a RunView filter
 * const filter = `Name = '${escapeSqlLiteral(entityName)}'`;
 */
export function escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

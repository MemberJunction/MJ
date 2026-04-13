/**
 * @module interfaces
 * @description Shared type contracts and utility functions for the Entity Designer Agent system.
 *
 * These interfaces define the payload that flows between all sub-agents
 * (Requirements Analyst → Schema Designer → Schema Validator → Schema Builder)
 * as well as the standalone action API surface.
 *
 * Utility functions in this module are co-located here because they are tightly
 * coupled to RunView filter construction used throughout the entity designer
 * pipeline, and this module is already the universal import for all entity
 * designer code (agents, executor, and actions).
 */

import type { TableDefinition } from '@memberjunction/schema-engine';

// ─── Payload ────────────────────────────────────────────────────────────────

/**
 * Root payload passed through the entire Entity Designer agent chain.
 *
 * In standalone mode the Requirements Analyst and Schema Designer populate the
 * first two sections before the code-based agents take over.
 *
 * In sub-agent mode (invoked by Agent Manager) the caller pre-populates
 * `SchemaDesign.TableDefinition` so the orchestrator skips straight to
 * Schema Validator.
 */
export interface EntityDesignerPayload {
    /**
     * Natural-language requirements document produced by the Requirements
     * Analyst sub-agent (standalone mode only).  Markdown format.
     */
    FunctionalRequirements?: string;

    /** Schema design artefacts produced by the Schema Designer sub-agent. */
    SchemaDesign?: SchemaDesignSection;

    /** Validation outcome written by the Schema Validator sub-agent. */
    ValidationResult?: EntityValidationResult;

    /** Final outcome written by the Schema Builder sub-agent. */
    EntityDesignerResult?: EntityDesignerResult;
}

/**
 * Schema design artefacts.  The `TableDefinition` is the single source of
 * truth consumed by downstream code-based agents.
 */
export interface SchemaDesignSection {
    /**
     * Human-readable markdown table shown to the user for approval.
     * Example:
     * | Column | Type | Nullable | Description |
     * |--------|------|----------|-------------|
     * | Name   | string | No   | Full name   |
     */
    Prototype?: string;

    /** Fully typed input to SchemaEngine.GenerateMigration(). */
    TableDefinition?: TableDefinition;

    /** Whether this is a new table or an ALTER to an existing one. */
    ModificationType?: 'create' | 'alter';

    /**
     * Entity ID of the entity being modified.
     * Required when `ModificationType === 'alter'`.
     *
     * TODO(Phase3): Ownership check in Schema Validator will read this to
     * compare against the MJ:UDT:Owner EntitySettings record and determine
     * whether to require MODIFY_OWN_ENTITIES vs MODIFY_ANY_UDT_ENTITIES.
     */
    ExistingEntityID?: string;
}

/** Validation summary written by `EntityDesignerSchemaValidator`. */
export interface EntityValidationResult {
    Valid: boolean;
    /** Human-readable error descriptions (empty when Valid === true). */
    Errors: string[];
    /** Non-blocking advisories. */
    Warnings: string[];
}

/** Final pipeline outcome written by `EntityDesignerSchemaBuilder`. */
export interface EntityDesignerResult {
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

/** Result returned by `EntityDesignerPipelineExecutor`. */
export interface PipelineExecutionResult {
    Success: boolean;
    EntityID?: string;
    EntityName?: string;
    SchemaName?: string;
    TableName?: string;
    PipelineSteps?: PipelineStepSummary[];
    ErrorMessage?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Schemas that the Entity Designer blocks, regardless of the user's
 * authorizations.  Note: `__mj` is already blocked by RuntimeSchemaManager
 * at the DDL level; we block it here too for early-exit UX.
 *
 * These are intentionally NOT added to SchemaEngine's global blocklist because
 * other subsystems (e.g. integration adapters) legitimately write to `dbo`.
 */
export const ENTITY_DESIGNER_BLOCKED_SCHEMAS: ReadonlySet<string> = new Set([
    '__mj',
    'dbo',
    'sys',
    'information_schema',
]);

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
 * Authorization names used by the Entity Designer security layer.
 * These map 1-to-1 to the records in `metadata/authorizations/.schema-management.json`.
 */
export const AUTHORIZATIONS = {
    CREATE_IN_UDT_SCHEMA: 'Create in UDT Schema',
    CREATE_IN_CUSTOM_SCHEMA: 'Create in Custom Schema',
    MODIFY_OWN_ENTITIES: 'Modify Own Entities',
    MODIFY_ANY_UDT_ENTITIES: 'Modify Any UDT Entities',
} as const;

/** The schema Entity Designer encourages for user-created tables. */
export const UDT_SCHEMA_NAME = '__mj_UDT';

/** EntitySettings key constants for UDT provenance tracking. */
export const UDT_SETTINGS = {
    OWNER_KEY: 'MJ:UDT:Owner',
    SOURCE_KEY: 'MJ:UDT:Source',
    SOURCE_ENTITY_DESIGNER: 'EntityDesigner',
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

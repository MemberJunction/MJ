/**
 * Strategy interfaces for data transformation during integration sync.
 * Transform rules are organized by connector and target database platform,
 * mirroring the DDLGenerator's sqlserver/postgresql separation pattern.
 */

/** Database platform type — mirrors schema-builder's DatabasePlatform */
export type TargetDatabasePlatform = 'sqlserver' | 'postgresql';

/** A single, composable data transformation rule */
export interface TransformRule {
    /** Human-readable name for logging and debugging */
    Name: string;
    /** Description of what this rule does */
    Description: string;
    /** Which connector this rule belongs to, or '*' for shared/universal rules */
    ConnectorName: string;
    /** Which database platform this rule applies to, or '*' for both */
    TargetPlatform: TargetDatabasePlatform | '*';
    /**
     * Apply the transformation to a single field value.
     * @param fieldName - the name of the field being transformed
     * @param value - the current value
     * @param fieldType - the target SQL type (e.g., 'NVARCHAR', 'DATETIMEOFFSET', 'BOOLEAN')
     * @returns the transformed value
     */
    Apply(fieldName: string, value: unknown, fieldType: string): unknown;
}

/** A pipeline of transform rules executed in sequence on a record */
export interface TransformPipeline {
    /** Ordered list of rules to apply */
    Rules: TransformRule[];
    /**
     * Execute all applicable rules on a record, filtering by target platform.
     * Rules where TargetPlatform matches the given platform or is '*' are applied.
     * @param record - field name → value map
     * @param fieldTypes - field name → SQL type map (for type-aware transforms)
     * @param targetPlatform - the database platform being written to
     * @returns transformed record
     */
    Execute(
        record: Record<string, unknown>,
        fieldTypes: Map<string, string>,
        targetPlatform: TargetDatabasePlatform
    ): Record<string, unknown>;
}

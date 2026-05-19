/**
 * SchemaValidator — validates TableDefinition inputs before DDL generation.
 * Static utility class: no instance state required.
 */
import { ValidateIdentifier } from './DDLGenerator.js';
import type { TableDefinition, ValidationResult } from './interfaces.js';

/**
 * Validates a TableDefinition and returns errors/warnings.
 */
export class SchemaValidator {
    /**
     * Validate a TableDefinition.
     *
     * Rules:
     * - SchemaName and TableName must be valid SQL identifiers.
     * - SchemaName must not be "__mj" (protected MJ internal schema).
     * - At least one column must be defined.
     * - All column names must be valid SQL identifiers.
     * - SoftPrimaryKey column names must reference columns in the definition.
     */
    static Validate(table: TableDefinition): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        errors.push(...SchemaValidator.validateSchemaName(table.SchemaName));
        errors.push(...SchemaValidator.validateTableName(table.TableName));
        errors.push(...SchemaValidator.validateColumns(table));
        errors.push(...SchemaValidator.validateSoftPrimaryKeys(table));

        return { Valid: errors.length === 0, Errors: errors, Warnings: warnings };
    }

    // ─── Private helpers ────────────────────────────────────────────

    private static validateSchemaName(schemaName: string): string[] {
        const errors: string[] = [];
        if (!schemaName) {
            errors.push('SchemaName is required');
            return errors;
        }
        if (schemaName.toLowerCase() === '__mj') {
            errors.push('Cannot create or modify tables in the __mj schema');
        }
        try { ValidateIdentifier(schemaName, 'schema'); }
        catch (e: unknown) { errors.push((e as Error).message); }
        return errors;
    }

    private static validateTableName(tableName: string): string[] {
        const errors: string[] = [];
        if (!tableName) {
            errors.push('TableName is required');
            return errors;
        }
        try { ValidateIdentifier(tableName, 'table'); }
        catch (e: unknown) { errors.push((e as Error).message); }
        return errors;
    }

    private static validateColumns(table: TableDefinition): string[] {
        const errors: string[] = [];
        const allColumns = [...(table.Columns ?? []), ...(table.AdditionalColumns ?? [])];

        if (!table.Columns || table.Columns.length === 0) {
            errors.push('Table must have at least one column');
        }

        for (const col of allColumns) {
            if (!col.Name) {
                errors.push('Column name is required');
                continue;
            }
            try { ValidateIdentifier(col.Name, 'column'); }
            catch (e: unknown) { errors.push((e as Error).message); }
        }

        return errors;
    }

    private static validateSoftPrimaryKeys(table: TableDefinition): string[] {
        if (!table.SoftPrimaryKeys || table.SoftPrimaryKeys.length === 0) return [];

        const allColumnNames = new Set([
            ...(table.Columns ?? []).map(c => c.Name.toLowerCase()),
            ...(table.AdditionalColumns ?? []).map(c => c.Name.toLowerCase()),
        ]);

        return table.SoftPrimaryKeys
            .filter(pk => !allColumnNames.has(pk.toLowerCase()))
            .map(pk => `SoftPrimaryKey column "${pk}" not found in column definitions`);
    }
}

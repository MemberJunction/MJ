/**
 * SchemaEngine — main orchestrator for generic, platform-aware DDL generation.
 * Composes DDLGenerator, MigrationFileWriter, SchemaEvolution, and SchemaValidator.
 * Any MJ consumer (integrations, UDTs, AI agents, developers) uses this class.
 */
import type {
    DatabasePlatform,
    MigrationOutput,
    SchemaEvolutionInput,
    TableDefinition,
} from './interfaces.js';
import { DDLGenerator } from './DDLGenerator.js';
import { MigrationFileWriter } from './MigrationFileWriter.js';
import { SchemaEvolution } from './SchemaEvolution.js';
import { SchemaValidator } from './SchemaValidator.js';

/**
 * Platform-aware DDL orchestrator. Pure function: input → SQL + file metadata.
 * Never touches the database — all execution is handled by the caller.
 */
export class SchemaEngine {
    private readonly ddl = new DDLGenerator();
    private readonly writer = new MigrationFileWriter();
    private readonly evolution = new SchemaEvolution();

    /**
     * Generate a CREATE TABLE migration from a generic TableDefinition.
     *
     * Includes CREATE SCHEMA IF NOT EXISTS guard, followed by CREATE TABLE.
     * Returns migration SQL + Flyway-compatible file name.
     *
     * @param table      - Platform-agnostic table definition.
     * @param platform   - Target database platform.
     * @param mjVersion  - MJ version string (e.g. "5.10") embedded in file name.
     * @param migrationsDir - Directory prefix for the migration file name.
     * @param consumer   - Identifies the calling subsystem (e.g. "Integration", "UDT").
     * @throws Error if the table definition is invalid.
     */
    GenerateMigration(
        table: TableDefinition,
        platform: DatabasePlatform,
        mjVersion: string,
        migrationsDir = 'migrations/v2',
        consumer = 'Schema'
    ): MigrationOutput {
        this.validateOrThrow(table);

        const schemaSQL = this.ddl.GenerateCreateSchema(table.SchemaName, platform);
        const tableSQL = this.ddl.GenerateCreateTable(table, platform);
        const sql = schemaSQL + '\n\n' + tableSQL;

        const timestamp = new Date();
        const fileName = this.writer.GenerateMigrationFileName(
            table.TableName, 'CreateTable', mjVersion, migrationsDir, timestamp, consumer
        );
        const emitted = this.writer.WrapInMigrationFile(sql, {
            SourceType: consumer,
            ObjectName: table.TableName,
            Action: 'CreateTable',
            GeneratedBy: '@memberjunction/schema-engine',
            Timestamp: timestamp.toISOString(),
        }, fileName);

        return {
            SQL: emitted.Content,
            FileName: fileName,
            AffectedTables: [`${table.SchemaName}.${table.TableName}`],
            Summary: `Create table ${table.SchemaName}.${table.TableName} (${table.Columns.length} columns)`,
        };
    }

    /**
     * Generate an ALTER TABLE migration for schema evolution.
     * Diffs desired state vs existing state and produces incremental DDL.
     *
     * @param input      - Desired table definition + current DB state.
     * @param platform   - Target database platform.
     * @param mjVersion  - MJ version string.
     * @param migrationsDir - Directory prefix for the migration file name.
     * @param consumer   - Identifies the calling subsystem.
     * @throws Error if the table definition is invalid.
     */
    GenerateEvolutionMigration(
        input: SchemaEvolutionInput,
        platform: DatabasePlatform,
        mjVersion: string,
        migrationsDir = 'migrations/v2',
        consumer = 'Schema'
    ): MigrationOutput {
        this.validateOrThrow(input.Desired);

        const diff = this.evolution.DiffSchema(input.Desired, input.ExistingTable);
        const sql = this.evolution.GenerateEvolutionMigration(
            diff, input.Desired.SchemaName, input.Desired.TableName, platform
        );

        const timestamp = new Date();
        const fileName = this.writer.GenerateMigrationFileName(
            input.Desired.TableName, 'AlterTable', mjVersion, migrationsDir, timestamp, consumer
        );
        const emitted = this.writer.WrapInMigrationFile(sql, {
            SourceType: consumer,
            ObjectName: input.Desired.TableName,
            Action: 'AlterTable',
            GeneratedBy: '@memberjunction/schema-engine',
            Timestamp: timestamp.toISOString(),
        }, fileName);

        return {
            SQL: emitted.Content,
            FileName: fileName,
            AffectedTables: [`${input.Desired.SchemaName}.${input.Desired.TableName}`],
            Summary: `Alter table: +${diff.AddedColumns.length} columns, ~${diff.ModifiedColumns.length} modified`,
        };
    }

    /**
     * Generate CREATE SCHEMA IF NOT EXISTS SQL for the given schema name.
     */
    GenerateCreateSchema(schemaName: string, platform: DatabasePlatform): string {
        return this.ddl.GenerateCreateSchema(schemaName, platform);
    }

    /**
     * Validate a TableDefinition and return the result without throwing.
     */
    Validate(table: TableDefinition) {
        return SchemaValidator.Validate(table);
    }

    // ─── Private helpers ───────────────────────────────────────────────

    private validateOrThrow(table: TableDefinition): void {
        const result = SchemaValidator.Validate(table);
        if (!result.Valid) {
            throw new Error(`Invalid table definition: ${result.Errors.join('; ')}`);
        }
    }
}

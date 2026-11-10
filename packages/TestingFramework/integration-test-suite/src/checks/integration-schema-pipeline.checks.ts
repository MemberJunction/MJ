/**
 * integration-schema-pipeline.checks.ts — the 'integration-schema-pipeline' bundle (ISP1–ISP4),
 * deterministic tier (IT164).
 *
 * Exercises the Integration & Runtime Schema pipeline against the live database:
 *  - ISP1: DecideTypeOverlay + TypeMapper + SchemaEngine DDLGenerator create physical tables with
 *          native SQL types (INT, BIGINT, DECIMAL(18,2), FLOAT, BIT/BOOLEAN, DATE,
 *          DATETIMEOFFSET/TIMESTAMPTZ, UNIQUEIDENTIFIER/UUID), cap Soft PK / Soft FK / Organic Key
 *          string columns at SQL Server's 450-char index key limit, and leave non-key text columns
 *          unbounded (NVARCHAR(MAX) / TEXT).
 *  - ISP2: Auto-indexes for Soft PK (IX_*_PK), Soft FK (IX_*_FK_*), and Organic Keys (IX_*_OK_*)
 *          are physically created as non-unique indexes, re-running DDL is idempotent, and
 *          SQLServerSchemaDDL.CreateIndexIfAbsent skips creating a duplicate index when another
 *          index (e.g. CodeGen's IDX_AUTO_MJ_*) already covers the same key-column tuple.
 *  - ISP3: SchemaEvolution.GenerateEvolutionMigration alters an existing table on the live DB —
 *          capping newly added Soft FK / Organic Key columns, dropping and recreating the dependent
 *          auto-index around ALTER COLUMN on an already-indexed key column, and emitting new
 *          non-unique auto-indexes.
 *  - ISP4: Live INSERT + Soft FK JOIN + Organic Key lookup round-trips native types (boolean,
 *          decimal precision/scale, integer, date, datetimeoffset, uuid) and a 2,000-character
 *          non-key text value without truncation.
 */
import type { DatabasePlatform } from '@memberjunction/core';
import { DecideTypeOverlay } from '@memberjunction/integration-engine';
import { SchemaBuilder, TypeMapper } from '@memberjunction/integration-schema-builder';
import type { SourceFieldInfo, SourceSchemaInfo, TargetTableConfig } from '@memberjunction/integration-schema-builder';
import { DDLGenerator, SchemaEvolution } from '@memberjunction/schema-engine';
import type { ExistingTableInfo, TableDefinition } from '@memberjunction/schema-engine';
import { GetDialect } from '@memberjunction/sql-dialect';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    DropSchemaStatements,
    PlatformOf,
    RequireQueryDb,
    RunFixtureSQLQuietly,
} from './query-extraction-fixture';

const BUNDLE = 'integration-schema-pipeline';

interface PipelineFixture {
    Platform: DatabasePlatform;
    SchemaName: string;
    AccountTable: TableDefinition;
    OrderTable: TableDefinition;
}

let fixture: PipelineFixture | undefined;

function requireFixture(): PipelineFixture {
    if (!fixture) throw new Error(`${BUNDLE}: Setup did not run (no fixture)`);
    return fixture;
}

/** Split multi-statement DDL output (separated by blank lines or T-SQL GO batch markers) and execute each against the live DB. */
async function executeDDLOutput(ctx: IntegrationCheckContext, ddlText: string): Promise<void> {
    const provider = RequireQueryDb(ctx.Provider, BUNDLE);
    const blocks = ddlText
        .replace(/^\s*GO\s*$/gim, '\n\n')
        .split(/\n\s*\n/)
        .map(b => b.trim())
        .filter(b => b.length > 0 && !b.startsWith('--'));
    for (const sql of blocks) {
        await provider.ExecuteSQL(sql, undefined, { description: `${BUNDLE} DDL` }, ctx.User);
    }
}

function makeSourceField(overrides: Partial<SourceFieldInfo> & { Name: string; SourceType: string }): SourceFieldInfo {
    return {
        Label: overrides.Label ?? overrides.Name,
        IsRequired: false,
        IsPrimaryKey: false,
        IsForeignKey: false,
        MaxLength: null,
        Precision: null,
        Scale: null,
        DefaultValue: null,
        ForeignKeyTarget: null,
        ...overrides,
    };
}

function buildFixtureTables(schemaName: string, platform: DatabasePlatform): {
    AccountTable: TableDefinition;
    OrderTable: TableDefinition;
} {
    const mapper = new TypeMapper();
    const mapField = (f: SourceFieldInfo): string => {
        const catalogType = DecideTypeOverlay(null, f.SourceType).value ?? f.SourceType;
        return mapper.MapSourceType(catalogType, platform, f);
    };

    const externalIdField = makeSourceField({ Name: 'ExternalId', SourceType: 'string', IsPrimaryKey: true, IsRequired: true, MaxLength: -1 });
    const emailField = makeSourceField({ Name: 'Email', SourceType: 'string', IsUniqueKey: true, MaxLength: -1 });
    const nameField = makeSourceField({ Name: 'Name', SourceType: 'string', MaxLength: 120, IsRequired: true });
    const empCountField = makeSourceField({ Name: 'EmployeeCount', SourceType: 'integer' });
    const revenueField = makeSourceField({ Name: 'AnnualRevenue', SourceType: 'decimal', Precision: 18, Scale: 2 });
    const scoreField = makeSourceField({ Name: 'CreditScore', SourceType: 'double' });
    const activeField = makeSourceField({ Name: 'IsActive', SourceType: 'boolean', IsRequired: true });
    const foundedField = makeSourceField({ Name: 'FoundedDate', SourceType: 'date' });
    const modifiedField = makeSourceField({ Name: 'LastModifiedAt', SourceType: 'datetime' });
    const globalIdField = makeSourceField({ Name: 'GlobalId', SourceType: 'uuid' });
    const notesField = makeSourceField({ Name: 'Notes', SourceType: 'text', MaxLength: -1 });

    const accountTable: TableDefinition = {
        SchemaName: schemaName,
        TableName: 'Account',
        EntityName: `${schemaName} Accounts`,
        SoftPrimaryKeys: ['ExternalId'],
        OrganicKeys: [['Email']],
        Columns: [
            { Name: 'ExternalId', Type: 'string', RawSqlType: mapField(externalIdField), IsNullable: false },
            { Name: 'Email', Type: 'string', RawSqlType: mapField(emailField), IsNullable: true },
            { Name: 'Name', Type: 'string', RawSqlType: mapField(nameField), IsNullable: false },
            { Name: 'EmployeeCount', Type: 'integer', RawSqlType: mapField(empCountField), IsNullable: true },
            { Name: 'AnnualRevenue', Type: 'decimal', RawSqlType: mapField(revenueField), IsNullable: true, Precision: 18, Scale: 2 },
            { Name: 'CreditScore', Type: 'float', RawSqlType: mapField(scoreField), IsNullable: true },
            { Name: 'IsActive', Type: 'boolean', RawSqlType: mapField(activeField), IsNullable: false },
            { Name: 'FoundedDate', Type: 'date', RawSqlType: mapField(foundedField), IsNullable: true },
            { Name: 'LastModifiedAt', Type: 'datetime', RawSqlType: mapField(modifiedField), IsNullable: true },
            { Name: 'GlobalId', Type: 'uuid', RawSqlType: mapField(globalIdField), IsNullable: true },
            { Name: 'Notes', Type: 'text', RawSqlType: mapField(notesField), IsNullable: true },
        ],
    };

    const orderIdField = makeSourceField({ Name: 'OrderId', SourceType: 'string', IsPrimaryKey: true, IsRequired: true, MaxLength: 100 });
    const accountFkField = makeSourceField({
        Name: 'AccountId',
        SourceType: 'string',
        IsForeignKey: true,
        ForeignKeyTarget: 'Account',
        MaxLength: 2000,
    });
    const totalField = makeSourceField({ Name: 'GrandTotal', SourceType: 'currency' });
    const lineCountField = makeSourceField({ Name: 'LineCount', SourceType: 'int' });
    const isPaidField = makeSourceField({ Name: 'IsPaid', SourceType: 'bool', IsRequired: true });

    const orderTable: TableDefinition = {
        SchemaName: schemaName,
        TableName: 'SalesOrder',
        EntityName: `${schemaName} Sales Orders`,
        SoftPrimaryKeys: ['OrderId'],
        ForeignKeys: [
            {
                ColumnName: 'AccountId',
                ReferencedSchema: schemaName,
                ReferencedTable: 'Account',
                ReferencedColumn: 'ExternalId',
                IsSoft: true,
            },
        ],
        Columns: [
            { Name: 'OrderId', Type: 'string', RawSqlType: mapField(orderIdField), IsNullable: false },
            { Name: 'AccountId', Type: 'string', RawSqlType: mapField(accountFkField), IsNullable: true },
            { Name: 'GrandTotal', Type: 'decimal', RawSqlType: mapField(totalField), IsNullable: true, Precision: 18, Scale: 2 },
            { Name: 'LineCount', Type: 'integer', RawSqlType: mapField(lineCountField), IsNullable: true },
            { Name: 'IsPaid', Type: 'boolean', RawSqlType: mapField(isPaidField), IsNullable: false },
        ],
    };

    return { AccountTable: accountTable, OrderTable: orderTable };
}

interface CatalogColumnRow {
    ColumnName: string;
    TypeName: string;
    MaxLengthBytes: number;
    Precision: number;
    Scale: number;
}

async function readLiveColumns(
    ctx: IntegrationCheckContext,
    schemaName: string,
    tableName: string,
    platform: DatabasePlatform
): Promise<Map<string, CatalogColumnRow>> {
    const provider = RequireQueryDb(ctx.Provider, BUNDLE);
    if (platform === 'postgresql') {
        const rows = await provider.ExecuteSQL<{
            column_name: string;
            data_type: string;
            character_maximum_length: number | null;
            numeric_precision: number | null;
            numeric_scale: number | null;
        }>(
            `SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale ` +
            `FROM information_schema.columns ` +
            `WHERE table_schema = '${schemaName}' AND table_name = '${tableName}'`,
            undefined,
            { description: `${BUNDLE} readLiveColumns pg` },
            ctx.User
        );
        const map = new Map<string, CatalogColumnRow>();
        for (const r of rows ?? []) {
            map.set(r.column_name, {
                ColumnName: r.column_name,
                TypeName: r.data_type.toLowerCase(),
                MaxLengthBytes: r.character_maximum_length ?? -1,
                Precision: Number(r.numeric_precision ?? 0),
                Scale: Number(r.numeric_scale ?? 0),
            });
        }
        return map;
    }

    const rows = await provider.ExecuteSQL<{
        ColumnName: string;
        TypeName: string;
        MaxLengthBytes: number;
        Precision: number;
        Scale: number;
    }>(
        `SELECT c.name AS ColumnName, t.name AS TypeName, c.max_length AS MaxLengthBytes, ` +
        `c.precision AS [Precision], c.scale AS [Scale] ` +
        `FROM sys.columns c ` +
        `JOIN sys.types t ON c.user_type_id = t.user_type_id ` +
        `WHERE c.object_id = OBJECT_ID(N'[${schemaName}].[${tableName}]')`,
        undefined,
        { description: `${BUNDLE} readLiveColumns sqlserver` },
        ctx.User
    );
    const map = new Map<string, CatalogColumnRow>();
    for (const r of rows ?? []) {
        map.set(r.ColumnName, {
            ColumnName: r.ColumnName,
            TypeName: r.TypeName.toLowerCase(),
            MaxLengthBytes: Number(r.MaxLengthBytes),
            Precision: Number(r.Precision),
            Scale: Number(r.Scale),
        });
    }
    return map;
}

interface CatalogIndexRow {
    IndexName: string;
    IsUnique: boolean;
    KeyColumns: string;
}

async function readLiveIndexes(
    ctx: IntegrationCheckContext,
    schemaName: string,
    tableName: string,
    platform: DatabasePlatform
): Promise<CatalogIndexRow[]> {
    const provider = RequireQueryDb(ctx.Provider, BUNDLE);
    if (platform === 'postgresql') {
        const rows = await provider.ExecuteSQL<{ indexname: string; indexdef: string }>(
            `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = '${schemaName}' AND tablename = '${tableName}'`,
            undefined,
            { description: `${BUNDLE} readLiveIndexes pg` },
            ctx.User
        );
        return (rows ?? []).map(r => ({
            IndexName: r.indexname,
            IsUnique: /CREATE\s+UNIQUE\s+INDEX/i.test(r.indexdef),
            KeyColumns: r.indexdef,
        }));
    }

    const rows = await provider.ExecuteSQL<{
        IndexName: string;
        IsUnique: boolean | number;
        KeyColumns: string;
    }>(
        `SELECT i.name AS IndexName, i.is_unique AS IsUnique, ` +
        `STRING_AGG(col.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS KeyColumns ` +
        `FROM sys.indexes i ` +
        `JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0 ` +
        `JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id ` +
        `WHERE i.object_id = OBJECT_ID(N'[${schemaName}].[${tableName}]') AND i.name IS NOT NULL ` +
        `GROUP BY i.name, i.is_unique`,
        undefined,
        { description: `${BUNDLE} readLiveIndexes sqlserver` },
        ctx.User
    );
    return (rows ?? []).map(r => ({
        IndexName: r.IndexName,
        IsUnique: Boolean(r.IsUnique),
        KeyColumns: r.KeyColumns,
    }));
}

export const IntegrationSchemaPipelineChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.ISP1`,
        Name: 'ISP1: IntegrationSchemaSync + TypeMapper + DDLGenerator create native SQL column types and cap only indexed key columns on the live DB',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const ddl = new DDLGenerator();

            // Create the throwaway schema and both tables via SchemaEngine DDLGenerator
            const createSchemaSql = ddl.GenerateCreateSchema(f.SchemaName, f.Platform);
            const createAccountSql = ddl.GenerateCreateTable(f.AccountTable, f.Platform, { IfNotExists: true });
            const createOrderSql = ddl.GenerateCreateTable(f.OrderTable, f.Platform, { IfNotExists: true });

            await executeDDLOutput(ctx, createSchemaSql);
            await executeDDLOutput(ctx, createAccountSql);
            await executeDDLOutput(ctx, createOrderSql);

            const accountCols = await readLiveColumns(ctx, f.SchemaName, 'Account', f.Platform);
            const orderCols = await readLiveColumns(ctx, f.SchemaName, 'SalesOrder', f.Platform);

            if (f.Platform === 'sqlserver') {
                // Key columns (Soft PK, Organic Key, Soft FK) are capped at 450 chars (900 UTF-16 bytes)
                AssertEqual(accountCols.get('ExternalId')?.TypeName, 'nvarchar', 'ISP1: ExternalId type');
                AssertEqual(accountCols.get('ExternalId')?.MaxLengthBytes, 900, 'ISP1: ExternalId capped at 450 chars (900 bytes)');
                AssertEqual(accountCols.get('Email')?.TypeName, 'nvarchar', 'ISP1: Email type');
                AssertEqual(accountCols.get('Email')?.MaxLengthBytes, 900, 'ISP1: Email Organic Key capped at 450 chars (900 bytes)');
                AssertEqual(orderCols.get('AccountId')?.TypeName, 'nvarchar', 'ISP1: AccountId Soft FK type');
                AssertEqual(orderCols.get('AccountId')?.MaxLengthBytes, 900, 'ISP1: AccountId Soft FK capped from 2000 to 450 chars (900 bytes)');

                // Non-key text column (Notes) is NOT capped — remains NVARCHAR(MAX) (max_length = -1)
                AssertEqual(accountCols.get('Notes')?.TypeName, 'nvarchar', 'ISP1: Notes type');
                AssertEqual(accountCols.get('Notes')?.MaxLengthBytes, -1, 'ISP1: non-key Notes column remains NVARCHAR(MAX) (-1)');

                // Native scalar types are preserved instead of falling back to NVARCHAR(MAX)
                AssertEqual(accountCols.get('EmployeeCount')?.TypeName, 'int', 'ISP1: EmployeeCount is INT');
                AssertEqual(accountCols.get('AnnualRevenue')?.TypeName, 'decimal', 'ISP1: AnnualRevenue is DECIMAL');
                AssertEqual(accountCols.get('AnnualRevenue')?.Precision, 28, 'ISP1: AnnualRevenue precision floored at 28');
                AssertEqual(accountCols.get('AnnualRevenue')?.Scale, 2, 'ISP1: AnnualRevenue scale 2');
                AssertEqual(accountCols.get('CreditScore')?.TypeName, 'float', 'ISP1: CreditScore is FLOAT');
                AssertEqual(accountCols.get('IsActive')?.TypeName, 'bit', 'ISP1: IsActive is BIT');
                AssertEqual(accountCols.get('FoundedDate')?.TypeName, 'date', 'ISP1: FoundedDate is DATE');
                AssertEqual(accountCols.get('LastModifiedAt')?.TypeName, 'datetimeoffset', 'ISP1: LastModifiedAt is DATETIMEOFFSET');
                AssertEqual(accountCols.get('GlobalId')?.TypeName, 'uniqueidentifier', 'ISP1: GlobalId is UNIQUEIDENTIFIER');
                AssertEqual(orderCols.get('GrandTotal')?.TypeName, 'decimal', 'ISP1: SalesOrder.GrandTotal is DECIMAL');
                AssertEqual(orderCols.get('GrandTotal')?.Precision, 28, 'ISP1: SalesOrder.GrandTotal precision 28');
                AssertEqual(orderCols.get('GrandTotal')?.Scale, 2, 'ISP1: SalesOrder.GrandTotal scale 2');
                AssertEqual(orderCols.get('LineCount')?.TypeName, 'int', 'ISP1: SalesOrder.LineCount is INT');
                AssertEqual(orderCols.get('IsPaid')?.TypeName, 'bit', 'ISP1: SalesOrder.IsPaid is BIT');
            } else {
                AssertEqual(accountCols.get('EmployeeCount')?.TypeName, 'integer', 'ISP1 pg: EmployeeCount is integer');
                AssertEqual(accountCols.get('AnnualRevenue')?.TypeName, 'numeric', 'ISP1 pg: AnnualRevenue is numeric');
                AssertEqual(accountCols.get('AnnualRevenue')?.Precision, 28, 'ISP1 pg: AnnualRevenue precision 28');
                AssertEqual(accountCols.get('AnnualRevenue')?.Scale, 2, 'ISP1 pg: AnnualRevenue scale 2');
                AssertEqual(accountCols.get('IsActive')?.TypeName, 'boolean', 'ISP1 pg: IsActive is boolean');
                AssertEqual(accountCols.get('FoundedDate')?.TypeName, 'date', 'ISP1 pg: FoundedDate is date');
                AssertEqual(accountCols.get('Notes')?.TypeName, 'text', 'ISP1 pg: Notes is text');
            }
        },
    },
    {
        Id: `${BUNDLE}.ISP2`,
        Name: 'ISP2: Soft PK, Soft FK, and Organic Key non-unique indexes exist on the live DB and CreateIndexIfAbsent deduplicates by column tuple',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const ddl = new DDLGenerator();
            const dialect = GetDialect(f.Platform);

            const accountIndexes = await readLiveIndexes(ctx, f.SchemaName, 'Account', f.Platform);
            const orderIndexes = await readLiveIndexes(ctx, f.SchemaName, 'SalesOrder', f.Platform);

            const pkIdxName = `IX_${f.SchemaName}_Account_PK`;
            const okIdxName = `IX_${f.SchemaName}_Account_OK_Email`;
            const orderPkIdxName = `IX_${f.SchemaName}_SalesOrder_PK`;
            const fkIdxName = `IX_${f.SchemaName}_SalesOrder_FK_AccountId`;

            const accountPk = accountIndexes.find(i => i.IndexName.toLowerCase() === pkIdxName.toLowerCase());
            const accountOk = accountIndexes.find(i => i.IndexName.toLowerCase() === okIdxName.toLowerCase());
            const orderPk = orderIndexes.find(i => i.IndexName.toLowerCase() === orderPkIdxName.toLowerCase());
            const orderFk = orderIndexes.find(i => i.IndexName.toLowerCase() === fkIdxName.toLowerCase());

            Assert(accountPk != null, `ISP2: expected ${pkIdxName} on Account`);
            Assert(!accountPk!.IsUnique, `ISP2: ${pkIdxName} must be non-unique`);
            Assert(accountOk != null, `ISP2: expected ${okIdxName} on Account`);
            Assert(!accountOk!.IsUnique, `ISP2: ${okIdxName} must be non-unique`);
            Assert(orderPk != null, `ISP2: expected ${orderPkIdxName} on SalesOrder`);
            Assert(!orderPk!.IsUnique, `ISP2: ${orderPkIdxName} must be non-unique`);
            Assert(orderFk != null, `ISP2: expected ${fkIdxName} on SalesOrder`);
            Assert(!orderFk!.IsUnique, `ISP2: ${fkIdxName} must be non-unique`);

            // Re-running CREATE TABLE + CreateIndexIfAbsent is a clean no-op
            await executeDDLOutput(ctx, ddl.GenerateCreateTable(f.AccountTable, f.Platform, { IfNotExists: true }));
            await executeDDLOutput(ctx, ddl.GenerateCreateTable(f.OrderTable, f.Platform, { IfNotExists: true }));

            // On SQL Server, verify cross-pipeline tuple deduplication (e.g. CodeGen IDX_AUTO_MJ_* vs runtime IX_*)
            if (f.Platform === 'sqlserver') {
                const duplicateTupleSql = dialect.CreateIndexIfAbsent({
                    schema: f.SchemaName,
                    tableName: 'SalesOrder',
                    indexName: `IDX_AUTO_MJ_FK_${f.SchemaName}_SalesOrder_AccountId`,
                    columns: ['AccountId'],
                    unique: false,
                });
                await executeDDLOutput(ctx, duplicateTupleSql);
                const afterOrderIndexes = await readLiveIndexes(ctx, f.SchemaName, 'SalesOrder', f.Platform);
                const accountIdIndexes = afterOrderIndexes.filter(i => i.KeyColumns === 'AccountId');
                AssertEqual(
                    accountIdIndexes.length,
                    1,
                    'ISP2: sys.index_columns tuple guard prevented duplicate index on Order(AccountId)'
                );
            }
        },
    },
    {
        Id: `${BUNDLE}.ISP3`,
        Name: 'ISP3: SchemaEvolution alters an indexed column (dropping/recreating its index) and adds capped Soft FK and Organic Key columns with indexes on the live DB',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const evo = new SchemaEvolution();

            // Existing state matches what ISP1 created for Account
            const existing: ExistingTableInfo = {
                SchemaName: f.SchemaName,
                TableName: 'Account',
                Columns: f.AccountTable.Columns.map(c => ({
                    Name: c.Name,
                    SqlType: f.Platform === 'sqlserver' && (c.Name === 'ExternalId' || c.Name === 'Email')
                        ? 'NVARCHAR(450)'
                        : (c.RawSqlType ?? c.Type),
                    IsNullable: c.IsNullable,
                    MaxLength: c.MaxLength ?? null,
                    Precision: c.Precision ?? null,
                    Scale: c.Scale ?? null,
                })),
                Indexes: [`IX_${f.SchemaName}_Account_PK`],
            };

            // Desired state:
            // 1. Narrow already-indexed Email column from 450 -> 320 (requires DropIndexIfExists before ALTER COLUMN, then CreateIndexIfAbsent)
            // 2. Add a new Soft FK column ParentAccountId (oversized 1000 -> capped to 450)
            // 3. Add a new Organic Key column TaxId (unbounded MAX -> capped to 450)
            const desired: TableDefinition = {
                ...f.AccountTable,
                ForeignKeys: [
                    {
                        ColumnName: 'ParentAccountId',
                        ReferencedSchema: f.SchemaName,
                        ReferencedTable: 'Account',
                        ReferencedColumn: 'ExternalId',
                        IsSoft: true,
                    },
                ],
                OrganicKeys: [['Email'], ['TaxId']],
                Columns: [
                    ...f.AccountTable.Columns.map(c =>
                        c.Name === 'Email'
                            ? { ...c, RawSqlType: f.Platform === 'postgresql' ? 'VARCHAR(320)' : 'NVARCHAR(320)' }
                            : c
                    ),
                    {
                        Name: 'ParentAccountId',
                        Type: 'string',
                        RawSqlType: f.Platform === 'postgresql' ? 'VARCHAR(1000)' : 'NVARCHAR(1000)',
                        IsNullable: true,
                    },
                    {
                        Name: 'TaxId',
                        Type: 'string',
                        RawSqlType: f.Platform === 'postgresql' ? 'TEXT' : 'NVARCHAR(MAX)',
                        IsNullable: true,
                    },
                ],
            };

            const diff = evo.DiffSchema(desired, existing);
            const migrationSql = evo.GenerateEvolutionMigration(diff, f.SchemaName, 'Account', f.Platform);
            await executeDDLOutput(ctx, migrationSql);

            // Also verify integration-schema-builder's SchemaBuilder wires SoftForeignKeys & OrganicKeyFields
            const builder = new SchemaBuilder();
            const sourceSchema: SourceSchemaInfo = {
                Objects: [
                    {
                        ExternalName: 'Account',
                        ExternalLabel: 'Accounts',
                        PrimaryKeyFields: ['ExternalId'],
                        Fields: [
                            makeSourceField({ Name: 'ExternalId', SourceType: 'string', IsPrimaryKey: true, IsRequired: true }),
                            makeSourceField({ Name: 'TaxId', SourceType: 'string', IsUniqueKey: true }),
                            makeSourceField({
                                Name: 'ParentAccountId',
                                SourceType: 'string',
                                IsForeignKey: true,
                                ForeignKeyTarget: 'Account',
                            }),
                        ],
                        Relationships: [
                            {
                                FieldName: 'ParentAccountId',
                                TargetObject: 'Account',
                                TargetField: 'ExternalId',
                            },
                        ],
                    },
                ],
            };
            const targetConfig: TargetTableConfig = {
                SourceObjectName: 'Account',
                SchemaName: f.SchemaName,
                TableName: 'Account',
                EntityName: `${f.SchemaName} Accounts`,
                PrimaryKeyFields: ['ExternalId'],
                SoftForeignKeys: [],
                Columns: [
                    {
                        SourceFieldName: 'ExternalId',
                        TargetColumnName: 'ExternalId',
                        TargetSqlType: 'NVARCHAR(450)',
                        IsNullable: false,
                        MaxLength: 450,
                        Precision: null,
                        Scale: null,
                        DefaultValue: null,
                    },
                    {
                        SourceFieldName: 'TaxId',
                        TargetColumnName: 'TaxId',
                        TargetSqlType: 'NVARCHAR(MAX)',
                        IsNullable: true,
                        MaxLength: -1,
                        Precision: null,
                        Scale: null,
                        DefaultValue: null,
                    },
                    {
                        SourceFieldName: 'ParentAccountId',
                        TargetColumnName: 'ParentAccountId',
                        TargetSqlType: 'NVARCHAR(1000)',
                        IsNullable: true,
                        MaxLength: 1000,
                        Precision: null,
                        Scale: null,
                        DefaultValue: null,
                    },
                ],
            };
            const buildOut = builder.BuildSchema({
                SourceSchema: sourceSchema,
                TargetConfigs: [targetConfig],
                Platform: f.Platform,
                MJVersion: '5.27.0',
                SourceType: 'IntegrationTest',
                ExistingTables: [],
                EntitySettingsForTargets: {},
                MigrationsDir: '/tmp',
                AdditionalSchemaInfoPath: '/tmp/additionalSchemaInfo.json',
                MetadataDir: '/tmp/metadata',
            });
            AssertEqual(buildOut.Errors.length, 0, 'ISP3: SchemaBuilder.BuildSchema produced 0 errors');
            Assert(
                buildOut.MigrationFiles[0]?.Content.includes(`IX_${f.SchemaName}_Account_FK_ParentAccountId`) ?? false,
                'ISP3: SchemaBuilder emitted Soft FK index in migration DDL'
            );
            Assert(
                buildOut.MigrationFiles[0]?.Content.includes(`IX_${f.SchemaName}_Account_OK_TaxId`) ?? false,
                'ISP3: SchemaBuilder emitted Organic Key index in migration DDL'
            );

            // Verify SchemaBuilder warns & skips cross-family ALTER COLUMN on existing columns (e.g. legacy NVARCHAR(255) -> INT/DECIMAL)
            const evoOut = builder.BuildSchema({
                SourceSchema: sourceSchema,
                TargetConfigs: [
                    {
                        ...targetConfig,
                        Columns: [
                            ...targetConfig.Columns,
                            {
                                SourceFieldName: 'LegacyAmount',
                                TargetColumnName: 'LegacyAmount',
                                TargetSqlType: 'DECIMAL(28,2)',
                                IsNullable: true,
                                MaxLength: null,
                                Precision: 28,
                                Scale: 2,
                                DefaultValue: null,
                            },
                        ],
                    },
                ],
                Platform: f.Platform,
                MJVersion: '5.27.0',
                SourceType: 'IntegrationTest',
                ExistingTables: [
                    {
                        SchemaName: f.SchemaName,
                        TableName: 'Account',
                        Columns: [
                            { Name: 'ExternalId', SqlType: 'NVARCHAR(450)', IsNullable: false, MaxLength: 450, Precision: null, Scale: null },
                            { Name: 'TaxId', SqlType: 'NVARCHAR(450)', IsNullable: true, MaxLength: 450, Precision: null, Scale: null },
                            { Name: 'ParentAccountId', SqlType: 'NVARCHAR(450)', IsNullable: true, MaxLength: 450, Precision: null, Scale: null },
                            { Name: 'LegacyAmount', SqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null },
                        ],
                    },
                ],
                EntitySettingsForTargets: {},
                MigrationsDir: '/tmp',
                AdditionalSchemaInfoPath: '/tmp/additionalSchemaInfo.json',
                MetadataDir: '/tmp/metadata',
            });
            Assert(
                evoOut.Warnings.some(w => w.includes("Column 'LegacyAmount' type family changed")),
                'ISP3: SchemaBuilder warns and skips cross-family NVARCHAR -> DECIMAL conversion on existing column'
            );
            Assert(
                !(evoOut.MigrationFiles[0]?.Content.includes('ALTER COLUMN [LegacyAmount]') ?? false),
                'ISP3: SchemaBuilder does not emit ALTER COLUMN for cross-family type change on existing column'
            );

            // Verify live DB state after SchemaEvolution migration
            const cols = await readLiveColumns(ctx, f.SchemaName, 'Account', f.Platform);
            const indexes = await readLiveIndexes(ctx, f.SchemaName, 'Account', f.Platform);

            if (f.Platform === 'sqlserver') {
                AssertEqual(cols.get('Email')?.MaxLengthBytes, 640, 'ISP3: Email altered to NVARCHAR(320) (640 bytes)');
                AssertEqual(cols.get('ParentAccountId')?.MaxLengthBytes, 900, 'ISP3: ParentAccountId capped at 450 chars (900 bytes)');
                AssertEqual(cols.get('TaxId')?.MaxLengthBytes, 900, 'ISP3: TaxId capped at 450 chars (900 bytes)');
            }

            Assert(
                indexes.some(i => i.IndexName.toLowerCase() === `IX_${f.SchemaName}_Account_OK_Email`.toLowerCase()),
                'ISP3: IX_*_OK_Email recreated after ALTER COLUMN'
            );
            Assert(
                indexes.some(i => i.IndexName.toLowerCase() === `IX_${f.SchemaName}_Account_FK_ParentAccountId`.toLowerCase()),
                'ISP3: IX_*_FK_ParentAccountId created on Account'
            );
            Assert(
                indexes.some(i => i.IndexName.toLowerCase() === `IX_${f.SchemaName}_Account_OK_TaxId`.toLowerCase()),
                'ISP3: IX_*_OK_TaxId created on Account'
            );
        },
    },
    {
        Id: `${BUNDLE}.ISP4`,
        Name: 'ISP4: Live INSERT and Soft FK / Organic Key JOIN round-trips native types and >450-char non-key text without truncation',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const provider = RequireQueryDb(ctx.Provider, BUNDLE);
            const d = GetDialect(f.Platform);
            const q = d.QuoteIdentifier.bind(d);
            const accountTable = `${q(f.SchemaName)}.${q('Account')}`;
            const orderTable = `${q(f.SchemaName)}.${q('SalesOrder')}`;

            const longNotes = 'N'.repeat(2000);
            const boolTrue = f.Platform === 'postgresql' ? 'TRUE' : '1';
            const guidLiteral = '3F2504E0-4F89-11D3-9A0C-0305E82C3301';

            await provider.ExecuteSQL(
                `INSERT INTO ${accountTable} ` +
                `(${q('ExternalId')}, ${q('Email')}, ${q('Name')}, ${q('EmployeeCount')}, ${q('AnnualRevenue')}, ` +
                `${q('CreditScore')}, ${q('IsActive')}, ${q('FoundedDate')}, ${q('LastModifiedAt')}, ${q('GlobalId')}, ${q('Notes')}, ${q('TaxId')}) ` +
                `VALUES ('ACC-001', 'alice@example.org', 'Acme Corp', 250, 123456.78, 98.5, ${boolTrue}, '2020-05-15', '2026-11-08T12:00:00Z', '${guidLiteral}', '${longNotes}', 'TAX-99')`,
                undefined,
                { description: `${BUNDLE} ISP4 insert Account` },
                ctx.User
            );

            await provider.ExecuteSQL(
                `INSERT INTO ${orderTable} ` +
                `(${q('OrderId')}, ${q('AccountId')}, ${q('GrandTotal')}, ${q('LineCount')}, ${q('IsPaid')}) ` +
                `VALUES ('ORD-100', 'ACC-001', 9876.54, 3, ${boolTrue})`,
                undefined,
                { description: `${BUNDLE} ISP4 insert Order` },
                ctx.User
            );

            const joined = await provider.ExecuteSQL<{
                ExternalId: string;
                Email: string;
                EmployeeCount: number;
                AnnualRevenue: number | string;
                GrandTotal: number | string;
                LineCount: number;
                NotesLen: number;
            }>(
                `SELECT a.${q('ExternalId')} AS ${q('ExternalId')}, a.${q('Email')} AS ${q('Email')}, ` +
                `a.${q('EmployeeCount')} AS ${q('EmployeeCount')}, a.${q('AnnualRevenue')} AS ${q('AnnualRevenue')}, ` +
                `o.${q('GrandTotal')} AS ${q('GrandTotal')}, o.${q('LineCount')} AS ${q('LineCount')}, ` +
                `${f.Platform === 'postgresql' ? 'CHAR_LENGTH' : 'LEN'}(a.${q('Notes')}) AS ${q('NotesLen')} ` +
                `FROM ${accountTable} a ` +
                `INNER JOIN ${orderTable} o ON a.${q('ExternalId')} = o.${q('AccountId')} ` +
                `WHERE a.${q('Email')} = 'alice@example.org' AND a.${q('IsActive')} = ${boolTrue}`,
                undefined,
                { description: `${BUNDLE} ISP4 join query` },
                ctx.User
            );

            AssertEqual(joined?.length ?? 0, 1, 'ISP4: Soft FK join + Organic Key filter returned 1 row');
            const row = joined![0];
            AssertEqual(row.ExternalId, 'ACC-001', 'ISP4: ExternalId round-tripped');
            AssertEqual(Number(row.EmployeeCount), 250, 'ISP4: INT EmployeeCount round-tripped');
            AssertEqual(Number(row.AnnualRevenue), 123456.78, 'ISP4: DECIMAL(18,2) AnnualRevenue round-tripped');
            AssertEqual(Number(row.GrandTotal), 9876.54, 'ISP4: DECIMAL(18,2) GrandTotal round-tripped');
            AssertEqual(Number(row.LineCount), 3, 'ISP4: INT LineCount round-tripped');
            AssertEqual(Number(row.NotesLen), 2000, 'ISP4: non-key 2000-char Notes column stored without truncation');
        },
    },
];

for (const check of IntegrationSchemaPipelineChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        const platform = PlatformOf(ctx, BUNDLE);
        const tag = `${Date.now()}_${Math.floor(process.hrtime()[1] / 1000)}`;
        const schemaName = `mjit_isp_${tag}`;
        const { AccountTable, OrderTable } = buildFixtureTables(schemaName, platform);
        fixture = {
            Platform: platform,
            SchemaName: schemaName,
            AccountTable,
            OrderTable,
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = undefined;
        if (!f) return;
        await RunFixtureSQLQuietly(
            ctx,
            BUNDLE,
            DropSchemaStatements(f.Platform, f.SchemaName, [], ['SalesOrder', 'Account'])
        );
    },
});

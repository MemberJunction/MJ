import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EntityInfo } from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';
import { SQLCodeGenBase } from '../../../sql_codegen';
import { ManageMetadataBase } from '../../../manage-metadata';
import { configInfo, ForceRegenerationConfig } from '../../../../Config/config';
import { SQLLogging } from '../../../../Misc/sql_logging';
import { TempBatchFile } from '../../../../Misc/temp_batch_file';
import type {
    BaseViewGenerationContext,
    CodeGenConnection,
    CodeGenQueryResult,
    CodeGenTransaction,
} from '../../../codeGenDatabaseProvider';

/**
 * Golden-master suite for the base-view REGENERATION DECISION in SQLCodeGenBase
 * (sql_codegen.ts ~929-1198): the machinery that decides, per entity, whether the
 * base view in the database has drifted from what CodeGen would emit today, and —
 * when it has — force-logs the view plus every routine that compiles it in into the
 * migration log. A wrong "unchanged" silently ships schema drift to every target
 * environment; a wrong "changed" spams a migration file on every CodeGen run.
 *
 * Three layers are pinned, bottom-up:
 *   1. extractViewSelectBody — the normalization contract the comparison rests on
 *   2. checkBaseViewChangedInDB — the drift decision itself (SQL Server text path
 *      + platform routing to the PG column-set path)
 *   3. logSQLForNewOrModifiedEntity + generateSingleEntitySQLToSeparateFiles — the
 *      force-log gate and its end-to-end wiring (view → permissions → all SPs)
 *
 * Style follows SQLServerCodeGenProvider.test.ts: named golden shapes, explicit
 * inline expected strings, real production code under test (no snapshots).
 */

// ─── Probe: expose the protected decision internals ──────────────────────────

class DecisionProbe extends SQLCodeGenBase {
    public Check(pool: CodeGenConnection, entity: EntityInfo, generatedViewSQL: string): Promise<boolean> {
        return this.checkBaseViewChangedInDB(pool, entity, generatedViewSQL);
    }
    public Extract(viewSQL: string): string {
        return this.extractViewSelectBody(viewSQL);
    }
    public Log(entity: EntityInfo, sql: string, description: string, logSql: boolean, forceLog: boolean): void {
        this.logSQLForNewOrModifiedEntity(entity, sql, description, logSql, forceLog);
    }
    public MarkCascadeDeleteRegen(entityID: string): void {
        this.entitiesNeedingDeleteSPRegeneration.add(entityID);
    }
    public RestrictForcedRegenerationTo(entityNames: string[]): void {
        this.filterEntitiesQualifiedForRegeneration = true;
        this.entitiesQualifiedForForcedRegeneration = entityNames;
    }
}

// ─── Mock connection ─────────────────────────────────────────────────────────

/**
 * Records every query. Answers the SQL Server OBJECT_DEFINITION lookup with the
 * configured stored view definition (null = view missing), and the PG
 * information_schema.columns lookup with the configured column list.
 */
class MockConnection implements CodeGenConnection {
    public readonly Queries: string[] = [];
    private storedViewDefinition: string | null;
    private pgColumns: string[] = [];
    private throwOnQuery = false;

    public constructor(storedViewDefinition: string | null = null) {
        this.storedViewDefinition = storedViewDefinition;
    }

    public get Dialect(): SQLDialect {
        return new SQLServerDialect();
    }

    public WithPGColumns(columns: string[]): this {
        this.pgColumns = columns;
        return this;
    }

    public ThrowOnQuery(): this {
        this.throwOnQuery = true;
        return this;
    }

    public async query(sql: string): Promise<CodeGenQueryResult> {
        this.Queries.push(sql);
        if (this.throwOnQuery) {
            throw new Error('simulated database failure');
        }
        if (sql.includes('information_schema.columns')) {
            return { recordset: this.pgColumns.map((c) => ({ column_name: c })) };
        }
        if (this.storedViewDefinition === null) {
            return { recordset: [] };
        }
        return { recordset: [{ ViewDefinition: this.storedViewDefinition }] };
    }

    public async queryWithParams(): Promise<CodeGenQueryResult> {
        throw new Error('MockConnection: queryWithParams() must not be called by the decision path');
    }
    public async executeStoredProcedure(): Promise<CodeGenQueryResult> {
        throw new Error('MockConnection: executeStoredProcedure() must not be called by the decision path');
    }
    public async beginTransaction(): Promise<CodeGenTransaction> {
        throw new Error('MockConnection: beginTransaction() must not be called by the decision path');
    }
}

// ─── Entity fixtures ─────────────────────────────────────────────────────────

function makeEntity(overrides: Record<string, unknown> = {}, fieldOverrides?: Record<string, unknown>[]): EntityInfo {
    const defaultFields = fieldOverrides || [
        {
            ID: 'pk-1',
            Name: 'ID',
            Type: 'uniqueidentifier',
            Length: 16,
            IsPrimaryKey: true,
            AllowsNull: false,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            DefaultValue: 'newsequentialid()',
        },
        {
            ID: 'f-2',
            Name: 'Name',
            Type: 'nvarchar',
            Length: 510,
            IsPrimaryKey: false,
            AllowsNull: false,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            DefaultValue: '',
        },
    ];
    return new EntityInfo({
        ID: 'REGEN-ENTITY-1',
        Name: 'Regen Target',
        SchemaName: '__mj',
        BaseTable: 'RegenTarget',
        BaseTableCodeName: 'RegenTarget',
        BaseView: 'vwRegenTargets',
        BaseViewGenerated: true,
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        spCreateGenerated: true,
        spUpdateGenerated: true,
        spDeleteGenerated: true,
        CascadeDeletes: false,
        DeleteType: 'Hard',
        spCreate: '',
        spUpdate: '',
        spDelete: '',
        EntityFields: defaultFields,
        EntityPermissions: [{ RoleSQLName: 'cdp_UI' }],
        ...overrides,
    });
}

/**
 * Exactly what SQL Server's OBJECT_DEFINITION() returns for the view the emission
 * pipeline creates for the fixture above: the CREATE VIEW batch text — no comment
 * header, no DROP guard, no GO, no GRANTs (those live in other batches).
 */
const STORED_DEFINITION_IN_SYNC = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*
FROM
    [__mj].[RegenTarget] AS r
`;

/** The normalized SELECT body both sides of an in-sync comparison reduce to. */
const NORMALIZED_BODY = 'SELECT r.* FROM [__mj].[RegenTarget] AS r';

// ─── Shared state hygiene ────────────────────────────────────────────────────

let savedNewEntities: string[];
let savedModifiedEntities: string[];
let probe: DecisionProbe;

/** Real generated emission for the fixture: file header + view DDL + GRANTs — the exact string production hands to checkBaseViewChangedInDB. */
async function generatedEmission(entity: EntityInfo): Promise<string> {
    const pool = new MockConnection();
    return (
        probe.generateSingleEntitySQLFileHeader(entity, entity.GeneratedViewName) +
        (await probe.generateBaseView(pool, entity))
    );
}

beforeEach(() => {
    savedNewEntities = [...ManageMetadataBase.newEntityList];
    savedModifiedEntities = [...ManageMetadataBase.modifiedEntityList];
    ManageMetadataBase.newEntityList.length = 0;
    ManageMetadataBase.modifiedEntityList.length = 0;
    probe = new DecisionProbe();
    probe.DBProvider = new SQLServerCodeGenProvider();
});

afterEach(() => {
    ManageMetadataBase.newEntityList.length = 0;
    ManageMetadataBase.newEntityList.push(...savedNewEntities);
    ManageMetadataBase.modifiedEntityList.length = 0;
    ManageMetadataBase.modifiedEntityList.push(...savedModifiedEntities);
    vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. extractViewSelectBody — the normalization contract
// ─────────────────────────────────────────────────────────────────────────────

describe('extractViewSelectBody — the normalization contract the drift decision rests on', () => {
    it('GM-EXTRACT-01: strips the file header, comment banner, DROP guard, GO, and GRANTs from a full generated emission', async () => {
        const generated = await generatedEmission(makeEntity());
        // Sanity: the raw emission really contains all the layers being stripped
        expect(generated).toContain('-- SQL Code Generation');
        expect(generated).toContain('DROP VIEW [__mj].[vwRegenTargets];');
        expect(generated).toContain('GRANT SELECT ON [__mj].[vwRegenTargets] TO [cdp_UI]');

        expect(probe.Extract(generated)).toBe(NORMALIZED_BODY);
    });

    it('GM-EXTRACT-02: reduces the DB-stored definition to the identical normalized body', async () => {
        const dbBody = probe.Extract(STORED_DEFINITION_IN_SYNC);
        expect(dbBody).toBe(NORMALIZED_BODY);
        expect(dbBody).toBe(probe.Extract(await generatedEmission(makeEntity())));
    });

    it('GM-EXTRACT-03: a definition with AS and SELECT on the SAME line falls back to whole-text, with NO whitespace normalization', () => {
        // The body-locator regex requires a newline between AS and SELECT. SQL Server
        // stores view text verbatim, so a view originally created as
        // `CREATE VIEW x AS SELECT ...` never matches and the method returns the whole
        // trimmed string — including the CREATE VIEW prefix, and WITHOUT collapsing
        // whitespace (the fallback path skips the normalization step entirely).
        const singleLine = 'CREATE VIEW [__mj].[vwRegenTargets] AS SELECT r.*   FROM [__mj].[RegenTarget] AS r';
        expect(probe.Extract(singleLine)).toBe(singleLine);
    });

    it('GM-EXTRACT-04: the GO batch separator is only honored at line start — an indented GO leaks the grants into the body', () => {
        const emission = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*
FROM
    [__mj].[RegenTarget] AS r
  GO
GRANT SELECT ON [__mj].[vwRegenTargets] TO [cdp_UI]`;
        expect(probe.Extract(emission)).toBe(
            'SELECT r.* FROM [__mj].[RegenTarget] AS r GO GRANT SELECT ON [__mj].[vwRegenTargets] TO [cdp_UI]',
        );
    });

    it('GM-EXTRACT-05: a lowercase `go` separator is honored (case-insensitive match)', () => {
        const emission = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*
FROM
    [__mj].[RegenTarget] AS r
go
GRANT SELECT ON [__mj].[vwRegenTargets] TO [cdp_UI]`;
        expect(probe.Extract(emission)).toBe(NORMALIZED_BODY);
    });

    it('GM-EXTRACT-06: comments INSIDE the SELECT body are NOT stripped — only whitespace is normalized', () => {
        // Cousin of the "comment-aware ORDER BY stripping" bug class: this code's
        // normalization is whitespace-only. Comment text is compared verbatim.
        const emission = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT -- audit hack, do not regenerate
    r.*
FROM
    [__mj].[RegenTarget] AS r
`;
        expect(probe.Extract(emission)).toBe(
            'SELECT -- audit hack, do not regenerate r.* FROM [__mj].[RegenTarget] AS r',
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. checkBaseViewChangedInDB — the drift decision
// ─────────────────────────────────────────────────────────────────────────────

describe('checkBaseViewChangedInDB — SELECT-body drift decision (SQL Server text path)', () => {
    it('GM-DECIDE-01: identical view → NO regeneration', async () => {
        const pool = new MockConnection(STORED_DEFINITION_IN_SYNC);
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(false);
    });

    it('GM-DECIDE-02: whitespace-only differences (indentation, CRLF, collapsed lines) → NO regeneration', async () => {
        const reformatted = 'CREATE VIEW [__mj].[vwRegenTargets]\r\nAS\r\nSELECT  r.*   FROM\r\n\t\t[__mj].[RegenTarget]    AS r\r\n';
        const pool = new MockConnection(reformatted);
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(false);
    });

    it('GM-DECIDE-03: GRANT/permission changes never trigger view regeneration (grants are cut at the GO separator)', async () => {
        // Same stored view, but the entity now grants to a different role set. The
        // generated emission's GRANT text changed — yet the comparison stops at GO,
        // so permission churn cannot force-log the view.
        const entityWithMoreRoles = makeEntity({
            EntityPermissions: [{ RoleSQLName: 'cdp_UI' }, { RoleSQLName: 'cdp_Developer' }, { RoleSQLName: 'cdp_Integration' }],
        });
        const pool = new MockConnection(STORED_DEFINITION_IN_SYNC);
        expect(await probe.Check(pool, entityWithMoreRoles, await generatedEmission(entityWithMoreRoles))).toBe(false);
    });

    it('GM-DECIDE-04: hand-added column in the DB view (SELECT-body drift) → regenerate + force-log', async () => {
        const handEdited = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*,
    r.[Name] AS [LegacyName]
FROM
    [__mj].[RegenTarget] AS r
`;
        const pool = new MockConnection(handEdited);
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(true);
    });

    it('GM-DECIDE-05: FK display join added in metadata while the DB still has the old plain view → regenerate', async () => {
        // The c31d487cb bug-class cousin for GENERATED views: a foreign key gained a
        // display field, so today's emission carries a JOIN + alias the DB view lacks.
        const provider = new SQLServerCodeGenProvider();
        const context: BaseViewGenerationContext = {
            entity: makeEntity(),
            relatedFieldsSelect: '\n    Customer_CustomerID.[Name] AS [Customer]',
            relatedFieldsJoins:
                'INNER JOIN\n    [__mj].[Customer] AS Customer_CustomerID\n  ON\n    [r].[CustomerID] = Customer_CustomerID.[ID]',
            parentFieldsSelect: '',
            parentJoins: '',
            rootFieldsSelect: '',
            rootJoins: '',
        };
        const generatedWithJoin = provider.generateBaseView(context);
        const pool = new MockConnection(STORED_DEFINITION_IN_SYNC);
        expect(await probe.Check(pool, makeEntity(), generatedWithJoin)).toBe(true);
    });

    it('GM-DECIDE-06: display column REMOVED from metadata while the DB view still carries it → regenerate', async () => {
        const dbStillHasJoin = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*,
    Customer_CustomerID.[Name] AS [Customer]
FROM
    [__mj].[RegenTarget] AS r
INNER JOIN
    [__mj].[Customer] AS Customer_CustomerID
  ON
    [r].[CustomerID] = Customer_CustomerID.[ID]
`;
        const pool = new MockConnection(dbStillHasJoin);
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(true);
    });

    it('GM-DECIDE-07: display column RENAMED in the DB view → regenerate', async () => {
        const provider = new SQLServerCodeGenProvider();
        const context: BaseViewGenerationContext = {
            entity: makeEntity(),
            relatedFieldsSelect: '\n    Customer_CustomerID.[Name] AS [Customer]',
            relatedFieldsJoins:
                'INNER JOIN\n    [__mj].[Customer] AS Customer_CustomerID\n  ON\n    [r].[CustomerID] = Customer_CustomerID.[ID]',
            parentFieldsSelect: '',
            parentJoins: '',
            rootFieldsSelect: '',
            rootJoins: '',
        };
        const generated = provider.generateBaseView(context);
        const dbRenamedAlias = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*,
    Customer_CustomerID.[Name] AS [CustomerName]
FROM
    [__mj].[RegenTarget] AS r
INNER JOIN
    [__mj].[Customer] AS Customer_CustomerID
  ON
    [r].[CustomerID] = Customer_CustomerID.[ID]
`;
        const pool = new MockConnection(dbRenamedAlias);
        expect(await probe.Check(pool, makeEntity(), generated)).toBe(true);
    });

    it('GM-DECIDE-08: soft-delete WHERE clause added to the emission (DeleteType flipped to Soft) → regenerate', async () => {
        const softDeleteEntity = makeEntity({ DeleteType: 'Soft' });
        const pool = new MockConnection(STORED_DEFINITION_IN_SYNC);
        expect(await probe.Check(pool, softDeleteEntity, await generatedEmission(softDeleteEntity))).toBe(true);
    });

    it('GM-DECIDE-09: a COMMENT-only hand edit inside the DB view body → regenerate (comments are compared verbatim)', async () => {
        // Documents current behavior: normalization is whitespace-only, so a DBA
        // leaving `-- reviewed` inside the SELECT forces a regeneration + migration
        // log entry even though the SQL is semantically identical.
        const commented = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT -- reviewed 2026-01-15
    r.*
FROM
    [__mj].[RegenTarget] AS r
`;
        const pool = new MockConnection(commented);
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(true);
    });

    it('GM-DECIDE-10: ⚠️ CURRENT BEHAVIOR — drift INSIDE a string literal that differs only by whitespace is silently MISSED', async () => {
        // ⚠️ The whitespace collapse runs over the entire body, string literals
        // included. `N'A B'` and `N'A   B'` normalize to the same text, so a hand
        // edit that changes only spacing inside a literal is real semantic drift the
        // decision reports as "unchanged". Pinned as documentation, not endorsement.
        const generatedWithLiteral = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*,
    CASE WHEN r.[Name] = N'A B' THEN 1 ELSE 0 END AS [Flag]
FROM
    [__mj].[RegenTarget] AS r
GO
`;
        const dbLiteralDrifted = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*,
    CASE WHEN r.[Name] = N'A   B' THEN 1 ELSE 0 END AS [Flag]
FROM
    [__mj].[RegenTarget] AS r
`;
        const pool = new MockConnection(dbLiteralDrifted);
        expect(await probe.Check(pool, makeEntity(), generatedWithLiteral)).toBe(false);
    });

    it('GM-DECIDE-11: ⚠️ CURRENT BEHAVIOR — a DB view stored with single-line `AS SELECT` is flagged changed on EVERY run', async () => {
        // ⚠️ SQL Server stores view text verbatim. A pre-existing view created as
        // `CREATE VIEW x AS SELECT ...` (AS and SELECT on one line) never matches the
        // body-locator regex, so its "body" is the whole definition including the
        // CREATE VIEW prefix — which can never equal the generated SELECT body. Such
        // a view is force-logged into the migration on every single CodeGen run until
        // CodeGen itself rewrites it in the multi-line form. Perpetual-regeneration
        // hazard, pinned as documentation.
        const singleLineStored = 'CREATE VIEW [__mj].[vwRegenTargets] AS SELECT r.* FROM [__mj].[RegenTarget] AS r';
        const pool = new MockConnection(singleLineStored);
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(true);
    });

    it('GM-DECIDE-12: view missing from the database → regenerate (self-heal for a failed prior CREATE)', async () => {
        const pool = new MockConnection(null);
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(true);
        expect(pool.Queries.length).toBe(1);
        expect(pool.Queries[0]).toContain("OBJECT_DEFINITION(OBJECT_ID('[__mj].[vwRegenTargets]'))");
    });

    it('GM-DECIDE-13: entity in newEntityList → NO force-log and the DB is never queried (new-entity logic owns it)', async () => {
        ManageMetadataBase.newEntityList.push('Regen Target');
        const pool = new MockConnection(null); // would return "missing" → true if consulted
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(false);
        expect(pool.Queries.length).toBe(0);
    });

    it('GM-DECIDE-14: entity in modifiedEntityList → NO force-log and the DB is never queried (modified-entity logic owns it)', async () => {
        ManageMetadataBase.modifiedEntityList.push('Regen Target');
        const pool = new MockConnection(null);
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(false);
        expect(pool.Queries.length).toBe(0);
    });

    it('GM-DECIDE-15: ⚠️ CURRENT BEHAVIOR — a query failure is swallowed and reported as "unchanged"', async () => {
        // ⚠️ The catch block treats any comparison failure as non-fatal and returns
        // false, so a transient connectivity error masks real drift for that run.
        // Deliberate (the modified-entity machinery still runs), pinned here so a
        // future refactor makes this trade-off consciously.
        const pool = new MockConnection(STORED_DEFINITION_IN_SYNC).ThrowOnQuery();
        expect(await probe.Check(pool, makeEntity(), await generatedEmission(makeEntity()))).toBe(false);
    });

    it('GM-DECIDE-16: on PostgreSQL the decision routes to the column-set comparison, never the text diff', async () => {
        const originalPlatform = configInfo.dbPlatform;
        try {
            configInfo.dbPlatform = 'postgresql';
            // Column set matches the entity fields (ID, Name) → unchanged
            const inSync = new MockConnection(null).WithPGColumns(['id', 'name']);
            expect(await probe.Check(inSync, makeEntity(), 'irrelevant — PG path ignores the generated text')).toBe(false);
            expect(inSync.Queries.length).toBe(1);
            expect(inSync.Queries[0]).toContain('information_schema.columns');
            expect(inSync.Queries[0]).not.toContain('OBJECT_DEFINITION');

            // Column drifted (missing Name) → changed
            const drifted = new MockConnection(null).WithPGColumns(['id']);
            expect(await probe.Check(drifted, makeEntity(), 'irrelevant')).toBe(true);
        } finally {
            configInfo.dbPlatform = originalPlatform;
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. logSQLForNewOrModifiedEntity — the migration-log gate
// ─────────────────────────────────────────────────────────────────────────────

describe('logSQLForNewOrModifiedEntity — the migration-log (force-log) gate', () => {
    let appendSpy: MockInstance<typeof SQLLogging.appendToSQLLogFile>;
    let tempBatchSpy: MockInstance<typeof TempBatchFile.appendToTempBatchFile>;

    /** Descriptions of everything the gate decided to log. */
    function loggedDescriptions(): (string | undefined)[] {
        return appendSpy.mock.calls.map((call) => call[1] as string | undefined);
    }

    const savedForceRegen: ForceRegenerationConfig | undefined = configInfo.forceRegeneration;

    beforeEach(() => {
        appendSpy = vi.spyOn(SQLLogging, 'appendToSQLLogFile').mockResolvedValue(undefined);
        tempBatchSpy = vi.spyOn(TempBatchFile, 'appendToTempBatchFile').mockReturnValue(undefined);
    });

    afterEach(() => {
        configInfo.forceRegeneration = savedForceRegen;
    });

    function forceRegen(overrides: Partial<ForceRegenerationConfig>): ForceRegenerationConfig {
        return {
            enabled: true,
            baseViews: false,
            spCreate: false,
            spUpdate: false,
            spDelete: false,
            allStoredProcedures: false,
            indexes: false,
            fullTextSearch: false,
            ...overrides,
        };
    }

    it('GM-GATE-01: forceLog=true logs even when the batch logging switch (logSql) is OFF — drift always reaches the migration', () => {
        probe.Log(makeEntity(), 'SQL', 'Base View SQL for Regen Target', false, true);
        expect(loggedDescriptions()).toEqual(['Base View SQL for Regen Target']);
    });

    it('GM-GATE-02: an untracked, unchanged entity logs nothing', () => {
        probe.Log(makeEntity(), 'SQL', 'Base View SQL for Regen Target', true, false);
        expect(appendSpy).not.toHaveBeenCalled();
    });

    it('GM-GATE-03: a NEW entity logs when logSql is on', () => {
        ManageMetadataBase.newEntityList.push('Regen Target');
        probe.Log(makeEntity(), 'SQL', 'spCreate SQL for Regen Target', true, false);
        expect(loggedDescriptions()).toEqual(['spCreate SQL for Regen Target']);
    });

    it('GM-GATE-04: a MODIFIED entity logs when logSql is on', () => {
        ManageMetadataBase.modifiedEntityList.push('Regen Target');
        probe.Log(makeEntity(), 'SQL', 'spUpdate SQL for Regen Target', true, false);
        expect(loggedDescriptions()).toEqual(['spUpdate SQL for Regen Target']);
    });

    it('GM-GATE-05: logSql=false suppresses even NEW-entity logging (the metadata-driven branches sit behind the switch)', () => {
        ManageMetadataBase.newEntityList.push('Regen Target');
        probe.Log(makeEntity(), 'SQL', 'spCreate SQL for Regen Target', false, false);
        expect(appendSpy).not.toHaveBeenCalled();
    });

    it('GM-GATE-06: ⚠️ CURRENT BEHAVIOR — an entity with RelatedEntityJoinFieldsConfig logs its base view on EVERY run, changed or not', () => {
        // ⚠️ The gate keys off the mere PRESENCE of a join-fields config, not off any
        // drift check — so such an entity re-enters the migration log on every
        // CodeGen run with logging enabled. Applies to base-view descriptions only.
        const entity = makeEntity({}, [
            {
                ID: 'pk-1', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true,
                AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '',
            },
            {
                ID: 'f-2', Name: 'AccountID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: false,
                AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, AutoIncrement: false, DefaultValue: '',
                RelatedEntityID: 'ACCOUNT-ENTITY-1',
                RelatedEntityJoinFields: '{"mode":"extend"}',
            },
        ]);
        probe.Log(entity, 'SQL', 'Base View SQL for Regen Target', true, false);
        probe.Log(entity, 'SQL', 'Base View Permissions SQL for Regen Target', true, false);
        probe.Log(entity, 'SQL', 'spCreate SQL for Regen Target', true, false);
        expect(loggedDescriptions()).toEqual([
            'Base View SQL for Regen Target',
            'Base View Permissions SQL for Regen Target',
            // spCreate did NOT log — the branch is scoped to 'base view' descriptions
        ]);
    });

    it('GM-GATE-07: cascade-delete dependency regeneration logs spDelete — and ONLY spDelete', () => {
        probe.MarkCascadeDeleteRegen('REGEN-ENTITY-1');
        probe.Log(makeEntity(), 'SQL', 'spDelete SQL for Regen Target', true, false);
        probe.Log(makeEntity(), 'SQL', 'spCreate SQL for Regen Target', true, false);
        expect(loggedDescriptions()).toEqual(['spDelete SQL for Regen Target']);
    });

    it('GM-GATE-08: forceRegeneration.baseViews covers base views AND their root-ID TVFs, not the SPs', () => {
        configInfo.forceRegeneration = forceRegen({ baseViews: true });
        probe.Log(makeEntity(), 'SQL', 'Base View SQL for Regen Target', true, false);
        probe.Log(makeEntity(), 'SQL', 'Root ID Function SQL for Regen Target.ParentID', true, false);
        probe.Log(makeEntity(), 'SQL', 'spCreate SQL for Regen Target', true, false);
        expect(loggedDescriptions()).toEqual([
            'Base View SQL for Regen Target',
            'Root ID Function SQL for Regen Target.ParentID',
        ]);
    });

    it('GM-GATE-09: forceRegeneration.spCreate targets only spCreate', () => {
        configInfo.forceRegeneration = forceRegen({ spCreate: true });
        probe.Log(makeEntity(), 'SQL', 'spCreate SQL for Regen Target', true, false);
        probe.Log(makeEntity(), 'SQL', 'spUpdate SQL for Regen Target', true, false);
        expect(loggedDescriptions()).toEqual(['spCreate SQL for Regen Target']);
    });

    it('GM-GATE-10: forceRegeneration.allStoredProcedures covers all three CRUD SPs but not the base view', () => {
        configInfo.forceRegeneration = forceRegen({ allStoredProcedures: true });
        probe.Log(makeEntity(), 'SQL', 'spCreate SQL for Regen Target', true, false);
        probe.Log(makeEntity(), 'SQL', 'spUpdate SQL for Regen Target', true, false);
        probe.Log(makeEntity(), 'SQL', 'spDelete SQL for Regen Target', true, false);
        probe.Log(makeEntity(), 'SQL', 'Base View SQL for Regen Target', true, false);
        expect(loggedDescriptions()).toEqual([
            'spCreate SQL for Regen Target',
            'spUpdate SQL for Regen Target',
            'spDelete SQL for Regen Target',
        ]);
    });

    it('GM-GATE-11: the entityWhereClause filter restricts forced regeneration to qualified entities', () => {
        configInfo.forceRegeneration = forceRegen({ baseViews: true });
        probe.RestrictForcedRegenerationTo(['Some Other Entity']);
        probe.Log(makeEntity(), 'SQL', 'Base View SQL for Regen Target', true, false);
        expect(appendSpy).not.toHaveBeenCalled();

        probe.RestrictForcedRegenerationTo(['Regen Target']);
        probe.Log(makeEntity(), 'SQL', 'Base View SQL for Regen Target', true, false);
        expect(loggedDescriptions()).toEqual(['Base View SQL for Regen Target']);
    });

    it('GM-GATE-12: a logged statement goes to BOTH the migration log and the schema temp batch file', () => {
        probe.Log(makeEntity(), 'THE SQL', 'Base View SQL for Regen Target', false, true);
        expect(appendSpy).toHaveBeenCalledWith('THE SQL', 'Base View SQL for Regen Target');
        expect(tempBatchSpy).toHaveBeenCalledWith('THE SQL', '__mj');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. generateSingleEntitySQLToSeparateFiles — decision wiring, end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe('generateSingleEntitySQLToSeparateFiles — decision wiring end-to-end', () => {
    let appendSpy: MockInstance<typeof SQLLogging.appendToSQLLogFile>;
    let tempDir: string;

    beforeEach(() => {
        appendSpy = vi.spyOn(SQLLogging, 'appendToSQLLogFile').mockResolvedValue(undefined);
        vi.spyOn(TempBatchFile, 'appendToTempBatchFile').mockReturnValue(undefined);
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-regen-decision-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function loggedDescriptions(): (string | undefined)[] {
        return appendSpy.mock.calls.map((call) => call[1] as string | undefined);
    }

    function fileNames(files: string[]): string[] {
        return files.map((f) => path.relative(tempDir, f)).sort();
    }

    it('GM-E2E-01: SELECT-body drift force-logs the view, its permissions, and ALL CRUD SPs — but NOT the FK index', async () => {
        const drifted = `CREATE VIEW [__mj].[vwRegenTargets]
AS
SELECT
    r.*,
    r.[Name] AS [LegacyName]
FROM
    [__mj].[RegenTarget] AS r
`;
        const pool = new MockConnection(drifted);
        const result = await probe.generateSingleEntitySQLToSeparateFiles({
            pool,
            entity: makeEntity(),
            directory: tempDir,
            onlyPermissions: false,
            writeFiles: true,
            skipExecution: true,
            enableSQLLoggingForNewOrModifiedEntities: true,
        });

        expect(result).not.toBeNull();
        // The force-log package, in emission order. The FK-index statement is
        // deliberately absent: it is emitted BEFORE the drift decision is computed,
        // so index SQL never rides along with a view force-log.
        expect(loggedDescriptions()).toEqual([
            'Base View SQL for Regen Target',
            'Base View Permissions SQL for Regen Target',
            'spCreate SQL for Regen Target',
            'spCreate Permissions for Regen Target',
            'spUpdate SQL for Regen Target',
            'spUpdate Permissions for Regen Target',
            'spDelete SQL for Regen Target',
            'spDelete Permissions for Regen Target',
        ]);
        // Only the drift-decision query hit the database
        expect(pool.Queries.length).toBe(1);
        expect(pool.Queries[0]).toContain('OBJECT_DEFINITION');
        // All nine artifacts written
        expect(fileNames(result.files)).toEqual(
            [
                path.join('__mj', 'RegenTarget.index.generated.sql'),
                path.join('__mj', 'spCreateRegenTarget.sp.generated.sql'),
                path.join('__mj', 'spCreateRegenTarget.sp.permissions.generated.sql'),
                path.join('__mj', 'spDeleteRegenTarget.sp.generated.sql'),
                path.join('__mj', 'spDeleteRegenTarget.sp.permissions.generated.sql'),
                path.join('__mj', 'spUpdateRegenTarget.sp.generated.sql'),
                path.join('__mj', 'spUpdateRegenTarget.sp.permissions.generated.sql'),
                path.join('__mj', 'vwRegenTargets.view.generated.sql'),
                path.join('__mj', 'vwRegenTargets.view.permissions.generated.sql'),
            ].sort(),
        );
    });

    it('GM-E2E-02: an in-sync view logs NOTHING — files are still (re)written, the migration stays clean', async () => {
        const pool = new MockConnection(STORED_DEFINITION_IN_SYNC);
        const result = await probe.generateSingleEntitySQLToSeparateFiles({
            pool,
            entity: makeEntity(),
            directory: tempDir,
            onlyPermissions: false,
            writeFiles: true,
            skipExecution: true,
            enableSQLLoggingForNewOrModifiedEntities: true,
        });

        expect(result).not.toBeNull();
        expect(appendSpy).not.toHaveBeenCalled();
        expect(result.files.length).toBe(9);
        expect(pool.Queries.length).toBe(1); // only the drift-decision query
    });

    it('GM-E2E-03: custom base view (BaseViewGenerated=false) — CodeGen never emits, compares, or clobbers the view', async () => {
        const customViewEntity = makeEntity({
            Name: 'Widgets',
            SchemaName: 'custom',
            BaseTable: 'Widget',
            BaseTableCodeName: 'Widget',
            BaseView: 'vwWidgets',
            BaseViewGenerated: false,
        });
        const pool = new MockConnection(STORED_DEFINITION_IN_SYNC);
        const result = await probe.generateSingleEntitySQLToSeparateFiles({
            pool,
            entity: customViewEntity,
            directory: tempDir,
            onlyPermissions: false,
            writeFiles: true,
            skipExecution: true,
            enableSQLLoggingForNewOrModifiedEntities: true,
        });

        expect(result).not.toBeNull();
        // The application's view is protected: no CREATE VIEW, no DROP VIEW, and the
        // drift comparison never even queries the database for it.
        expect(result.sql).not.toContain('CREATE VIEW');
        expect(result.sql).not.toContain('DROP VIEW');
        expect(pool.Queries.length).toBe(0);
        // Instead CodeGen refreshes the custom view (so schema changes surface) and
        // re-applies the grants against it.
        expect(result.sql).toContain("EXEC sp_refreshview 'custom.vwWidgets';");
        expect(result.sql).toContain('GRANT SELECT ON [custom].[vwWidgets] TO [cdp_UI]');
        // No view DDL file — but the view permissions file IS written.
        const names = fileNames(result.files);
        expect(names).not.toContain(path.join('custom', 'vwWidgets.view.generated.sql'));
        expect(names).toContain(path.join('custom', 'vwWidgets.view.permissions.generated.sql'));
    });

    it('GM-E2E-04: virtual entity — only view permissions are emitted (no view DDL, no SPs, no index, no refresh)', async () => {
        const virtualEntity = makeEntity({
            Name: 'Virtual Things',
            SchemaName: 'custom',
            BaseTable: 'VirtualThing',
            BaseTableCodeName: 'VirtualThing',
            BaseView: 'vwVirtualThings',
            BaseViewGenerated: false,
            VirtualEntity: true,
        });
        const pool = new MockConnection(null);
        const result = await probe.generateSingleEntitySQLToSeparateFiles({
            pool,
            entity: virtualEntity,
            directory: tempDir,
            onlyPermissions: false,
            writeFiles: true,
            skipExecution: true,
            enableSQLLoggingForNewOrModifiedEntities: true,
        });

        expect(result).not.toBeNull();
        expect(pool.Queries.length).toBe(0);
        expect(result.sql).not.toContain('CREATE VIEW');
        expect(result.sql).not.toContain('sp_refreshview'); // views over virtual entities aren't refreshed
        expect(result.sql).toContain('GRANT SELECT ON [custom].[vwVirtualThings] TO [cdp_UI]');
        expect(fileNames(result.files)).toEqual([path.join('custom', 'vwVirtualThings.view.permissions.generated.sql')]);
    });
});

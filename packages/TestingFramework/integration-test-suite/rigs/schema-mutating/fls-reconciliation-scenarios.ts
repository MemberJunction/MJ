/**
 * fls-reconciliation-scenarios.ts — field-level security reconciliation under real schema changes.
 *
 * Each scenario changes the schema of a private fixture schema, runs CodeGen, and checks that the
 * `EntityFieldPermission` rows follow: a new column gets one row per role that can read the
 * entity, a column that leaves the base view takes its rows with it, and a run with no schema
 * change writes nothing. These are test-plan scenarios 2.7a–2.7d, 2.8c and 2.10, which until
 * now were verified by hand only.
 *
 * The scenarios share one fixture and run in order: 2.8c narrows the custom view 2.7c widened.
 * 2.8c is also the regression check for the `ON DELETE CASCADE` on
 * `FK_EntityFieldPermission_EntityField`: retiring a field that has permission rows fails without
 * it, and CodeGen's metadata phase fails with it.
 *
 * Not here yet: 2.8a and 2.8b (dropping a column, or a foreign key, under a generated base view).
 * CodeGen's first run after such a drop still compiles the CRUD procedures (and, for a foreign
 * key, the view) against the dropped column and exits non-zero; the next run repairs it. Until that
 * is fixed in CodeGen those scenarios would fail every night for a reason that is not field
 * security.
 *
 * Every CodeGen run must exit 0. CodeGen exits non-zero when any step fails, so a run that
 * finishes with the wrong state and a run that errors are both caught.
 */
import { Assert, AssertEqual, TestRunner } from '@memberjunction/testing-integration';
import { ThrowawayDatabase } from './throwaway-database';

/** The fixture schema. Everything the scenarios change lives here. */
export const FIXTURE_SCHEMA = 'mjrig_fls';

/** One entity field with the number of permission rows attached to it. */
export interface FieldPermissionCount {
    FieldID: string;
    Name: string;
    IsVirtual: boolean;
    Restrictable: boolean;
    Rows: number;
}

/** The parts of an `Entity` row the scenarios read. */
interface EntityRow {
    ID: string;
    Name: string;
    BaseTable: string;
    BaseView: string;
    spCreate: string | null;
    spUpdate: string | null;
    spDelete: string | null;
}

/**
 * Restrictable fields whose row count is not one per read role, and unrestrictable fields
 * (primary keys, soft keys, `__mj_` columns) that have rows at all. Empty when the entity is
 * fully reconciled.
 */
export function FindPermissionGaps(fields: FieldPermissionCount[], readRoleCount: number): string[] {
    const gaps: string[] = [];
    for (const field of fields) {
        if (field.Restrictable && field.Rows !== readRoleCount) {
            gaps.push(`${field.Name}: ${field.Rows} row(s), expected ${readRoleCount}`);
        }
        if (!field.Restrictable && field.Rows > 0) {
            gaps.push(`${field.Name}: ${field.Rows} row(s) on an unrestrictable field, expected 0`);
        }
    }
    return gaps;
}

/** Field names in `after` that are not in `before`. */
export function AddedFieldNames(before: FieldPermissionCount[], after: FieldPermissionCount[]): string[] {
    const known = new Set(before.map(f => f.Name));
    return after.filter(f => !known.has(f.Name)).map(f => f.Name);
}

const FIXTURE_DDL = `
CREATE SCHEMA ${FIXTURE_SCHEMA};
`;

const FIXTURE_TABLES = `
CREATE TABLE ${FIXTURE_SCHEMA}.GadgetType (
    ID   UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RigGadgetType_ID DEFAULT NEWSEQUENTIALID() CONSTRAINT PK_RigGadgetType PRIMARY KEY,
    Name NVARCHAR(100)    NOT NULL
);
CREATE TABLE ${FIXTURE_SCHEMA}.Gadget (
    ID         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RigGadget_ID DEFAULT NEWSEQUENTIALID() CONSTRAINT PK_RigGadget PRIMARY KEY,
    Name       NVARCHAR(100)    NOT NULL,
    Cost       DECIMAL(18, 2)   NULL
);
CREATE TABLE ${FIXTURE_SCHEMA}.Sprocket (
    ID     UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RigSprocket_ID DEFAULT NEWSEQUENTIALID() CONSTRAINT PK_RigSprocket PRIMARY KEY,
    Name   NVARCHAR(100)    NOT NULL,
    Margin DECIMAL(18, 2)   NULL,
    Price  DECIMAL(18, 2)   NULL
);
CREATE TABLE ${FIXTURE_SCHEMA}.Widget (
    ID     UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_RigWidget_ID DEFAULT NEWSEQUENTIALID() CONSTRAINT PK_RigWidget PRIMARY KEY,
    Name   NVARCHAR(100)    NOT NULL,
    Weight DECIMAL(18, 2)   NULL
);
`;

/** Sprocket's custom base view. `extraColumns` widens it (2.7c); `includeMargin` narrows it (2.8c). */
function sprocketViewSql(view: string, includeMargin: boolean, extraColumns: string[]): string {
    const columns = ['s.ID', 's.Name', ...(includeMargin ? ['s.Margin'] : []), 's.Price', ...extraColumns, 's.__mj_CreatedAt', 's.__mj_UpdatedAt'];
    return `CREATE OR ALTER VIEW ${FIXTURE_SCHEMA}.${view} AS SELECT ${columns.join(', ')} FROM ${FIXTURE_SCHEMA}.Sprocket s`;
}

const WIDGET_INNER_VIEW = 'vwWidgetsGenerated';
const DOUBLE_PRICE = 'CAST(s.Price * 2 AS DECIMAL(19, 2)) AS DoublePrice';

/** Reads and changes the fixture; holds the per-run state the ordered scenarios share. */
class FixtureState {
    private readRoleCounts = new Map<string, number>();

    constructor(private readonly db: ThrowawayDatabase) {}

    public async Entity(table: string): Promise<EntityRow> {
        const rows = await this.db.Query<EntityRow>(
            `SELECT ID, Name, BaseTable, BaseView, spCreate, spUpdate, spDelete
             FROM __mj.Entity WHERE SchemaName = @schema AND BaseTable = @table`,
            { schema: FIXTURE_SCHEMA, table }
        );
        Assert(rows.length === 1, `expected one entity for ${FIXTURE_SCHEMA}.${table}, found ${rows.length}`);
        return rows[0];
    }

    public async Fields(table: string): Promise<FieldPermissionCount[]> {
        const entity = await this.Entity(table);
        const rows = await this.db.Query<{ FieldID: string; Name: string; IsVirtual: boolean; Restrictable: number; Rows: number }>(
            `SELECT ef.ID AS FieldID, ef.Name, ef.IsVirtual,
                    CASE WHEN ef.IsPrimaryKey = 1 OR ef.IsSoftPrimaryKey = 1 OR ef.Name LIKE '\\_\\_mj\\_%' ESCAPE '\\' THEN 0 ELSE 1 END AS Restrictable,
                    (SELECT COUNT(*) FROM __mj.EntityFieldPermission p WHERE p.EntityFieldID = ef.ID) AS Rows
             FROM __mj.EntityField ef
             WHERE ef.EntityID = @entityID
             ORDER BY ef.Sequence`,
            { entityID: entity.ID }
        );
        return rows.map(r => ({ FieldID: r.FieldID, Name: r.Name, IsVirtual: r.IsVirtual, Restrictable: r.Restrictable === 1, Rows: r.Rows }));
    }

    public async Field(table: string, name: string): Promise<FieldPermissionCount | undefined> {
        return (await this.Fields(table)).find(f => f.Name === name);
    }

    /**
     * Roles whose entity-level permissions resolve to read (an Allow row with read, and no Deny
     * row with read) — the roles reconciliation gives snapshot rows to. Captured once per entity
     * after the fixture is enabled; nothing in these scenarios changes entity permissions.
     */
    public async ReadRoleCount(table: string): Promise<number> {
        const cached = this.readRoleCounts.get(table);
        if (cached !== undefined) {
            return cached;
        }
        const entity = await this.Entity(table);
        const rows = await this.db.Query<{ n: number }>(
            `SELECT COUNT(DISTINCT p.RoleID) AS n
             FROM __mj.EntityPermission p
             WHERE p.EntityID = @entityID AND p.CanRead = 1 AND ISNULL(p.Type, 'Allow') = 'Allow'
               AND NOT EXISTS (SELECT 1 FROM __mj.EntityPermission d
                               WHERE d.EntityID = p.EntityID AND d.RoleID = p.RoleID AND d.CanRead = 1 AND d.Type = 'Deny')`,
            { entityID: entity.ID }
        );
        const count = rows[0].n;
        Assert(count > 0, `${table} has no role with entity read; the fixture cannot show reconciliation`);
        this.readRoleCounts.set(table, count);
        return count;
    }

    public async AssertReconciled(table: string): Promise<void> {
        const gaps = FindPermissionGaps(await this.Fields(table), await this.ReadRoleCount(table));
        Assert(gaps.length === 0, `${table} is not reconciled: ${gaps.join('; ')}`);
    }

    public async AssertFieldCovered(table: string, name: string): Promise<void> {
        const field = await this.Field(table, name);
        Assert(field !== undefined, `${table}.${name} has no EntityField row`);
        AssertEqual(field?.Rows, await this.ReadRoleCount(table), `${table}.${name} permission rows`);
    }

    /** The field is gone from metadata and no permission row points at a field of that name. */
    public async AssertFieldRetired(table: string, name: string): Promise<void> {
        const field = await this.Field(table, name);
        Assert(field === undefined, `${table}.${name} still has an EntityField row (with ${field?.Rows} permission row(s))`);
    }

    /** The base view answers a query and the three CRUD procedures exist (a failed regeneration leaves them dropped). */
    public async AssertEntityUsable(table: string): Promise<void> {
        const entity = await this.Entity(table);
        await this.db.Exec(`SELECT TOP 0 * FROM ${FIXTURE_SCHEMA}.[${entity.BaseView}]`);
        // A NULL name means CodeGen's default, sp<Verb><BaseTable> — exact for the fixture's plain table names.
        const procs = [entity.spCreate ?? `spCreate${entity.BaseTable}`, entity.spUpdate ?? `spUpdate${entity.BaseTable}`, entity.spDelete ?? `spDelete${entity.BaseTable}`];
        for (const proc of procs) {
            const found = await this.db.Query<{ id: number | null }>(`SELECT OBJECT_ID(@name, 'P') AS id`, { name: `${FIXTURE_SCHEMA}.${proc}` });
            Assert(found[0].id !== null, `${FIXTURE_SCHEMA}.${proc} does not exist`);
        }
    }

    /** Every permission row, for the no-change comparison in 2.10. */
    public async PermissionSnapshot(): Promise<string> {
        const rows = await this.db.Query<Record<string, string>>(
            `SELECT CONVERT(NVARCHAR(36), ID) AS ID, CONVERT(NVARCHAR(36), EntityFieldID) AS EntityFieldID, CONVERT(NVARCHAR(36), RoleID) AS RoleID,
                    ReadAccess, UpdateAccess, CreateAccess,
                    CONVERT(NVARCHAR(40), __mj_CreatedAt, 127) AS CreatedAt, CONVERT(NVARCHAR(40), __mj_UpdatedAt, 127) AS UpdatedAt
             FROM __mj.EntityFieldPermission ORDER BY ID`
        );
        return JSON.stringify(rows);
    }

    /** One CodeGen run that must succeed. */
    public RunCodeGen(label: string): void {
        const result = this.db.RunCodeGen(label);
        Assert(result.ExitCode === 0, `CodeGen (${label}) exited ${result.ExitCode}. Log tail:\n${this.db.LogTail(result)}`);
    }
}

/**
 * Creates the fixture schema, lets CodeGen discover it, turns field security on for its entities
 * and runs CodeGen again so reconciliation writes the snapshot rows from empty.
 *
 * - Gadget: a generated base view (`SELECT s.*` plus joins). 2.7a/2.7b add to it.
 * - Sprocket: a custom base view with an explicit column list. 2.7c widens it, 2.8c narrows it.
 * - Widget: a layered base view — CodeGen owns the inner view, the fixture owns the outer one. 2.7d.
 */
async function createFixture(db: ThrowawayDatabase, state: FixtureState): Promise<void> {
    await db.Exec(FIXTURE_DDL);
    await db.Exec(FIXTURE_TABLES);
    state.RunCodeGen('fixture-discover');

    const sprocket = await state.Entity('Sprocket');
    const widget = await state.Entity('Widget');
    await db.Exec(`UPDATE __mj.Entity SET BaseViewGenerated = 0 WHERE ID = '${sprocket.ID}'`);
    await db.Exec(sprocketViewSql(sprocket.BaseView, true, []));

    await db.Exec(`CREATE OR ALTER VIEW ${FIXTURE_SCHEMA}.${WIDGET_INNER_VIEW} AS SELECT w.* FROM ${FIXTURE_SCHEMA}.Widget w`);
    await db.Exec(`CREATE OR ALTER VIEW ${FIXTURE_SCHEMA}.[${widget.BaseView}] AS SELECT g.* FROM ${FIXTURE_SCHEMA}.${WIDGET_INNER_VIEW} g`);
    await db.Exec(`UPDATE __mj.Entity SET BaseViewGenerated = 0, GeneratedBaseViewName = '${WIDGET_INNER_VIEW}' WHERE ID = '${widget.ID}'`);

    await db.Exec(`UPDATE __mj.Entity SET EnableFieldLevelSecurity = 1 WHERE SchemaName = '${FIXTURE_SCHEMA}'`);
    state.RunCodeGen('fixture-enable');
}

/** Registers the fixture and every scenario, in order, on `runner`. */
export function RegisterFlsReconciliationScenarios(runner: TestRunner, db: ThrowawayDatabase): void {
    const state = new FixtureState(db);

    runner.Test('fixture: field security enabled, reconciliation from empty writes one row per (field, read role)', async () => {
        await createFixture(db, state);
        for (const table of ['GadgetType', 'Gadget', 'Sprocket', 'Widget']) {
            await state.AssertReconciled(table);
        }
    });

    runner.Test('2.10 a run with no schema change leaves every permission row untouched', async () => {
        const permissionsBefore = await state.PermissionSnapshot();
        Assert(permissionsBefore !== '[]', 'precondition: the fixture has permission rows to compare');
        state.RunCodeGen('2.10-no-change');
        AssertEqual(await state.PermissionSnapshot(), permissionsBefore, 'EntityFieldPermission rows (IDs, verbs, timestamps)');
    });

    runner.Test('2.7a a column added under a generated base view is covered in one run', async () => {
        await db.Exec(`ALTER TABLE ${FIXTURE_SCHEMA}.Gadget ADD SerialNumber NVARCHAR(50) NULL`);
        state.RunCodeGen('2.7a-add-column');
        await state.AssertFieldCovered('Gadget', 'SerialNumber');
        await state.AssertReconciled('Gadget');
    });

    runner.Test('2.7b a foreign key column is covered in one run and its joined display column within two', async () => {
        const before = await state.Fields('Gadget');
        await db.Exec(
            `ALTER TABLE ${FIXTURE_SCHEMA}.Gadget ADD GadgetTypeID UNIQUEIDENTIFIER NULL
                 CONSTRAINT FK_RigGadget_GadgetType FOREIGN KEY REFERENCES ${FIXTURE_SCHEMA}.GadgetType(ID)`
        );
        state.RunCodeGen('2.7b-add-fk');
        await state.AssertFieldCovered('Gadget', 'GadgetTypeID');

        const readRoles = await state.ReadRoleCount('Gadget');
        const displayAfterOne = (await state.Fields('Gadget')).find(f => f.IsVirtual && AddedFieldNames(before, [f]).length > 0);
        // A display field present but only partly covered is never acceptable. Present with no rows is
        // fail-closed (no rows denies) and is closed by the second run below.
        Assert(
            displayAfterOne === undefined || displayAfterOne.Rows === 0 || displayAfterOne.Rows === readRoles,
            `display field ${displayAfterOne?.Name} has ${displayAfterOne?.Rows} of ${readRoles} rows after one run`
        );
        let runs = 1;
        if (displayAfterOne === undefined || displayAfterOne.Rows === 0) {
            state.RunCodeGen('2.7b-second-run');
            runs = 2;
        }
        const display = (await state.Fields('Gadget')).find(f => f.IsVirtual && AddedFieldNames(before, [f]).length > 0);
        Assert(display !== undefined, 'no joined display field was added for GadgetTypeID');
        AssertEqual(display?.Rows, readRoles, `display field ${display?.Name} permission rows after ${runs} run(s)`);
        console.log(`    [rig] 2.7b display field '${display?.Name}' covered after ${runs} CodeGen run(s)`);
        await state.AssertReconciled('Gadget');
    });

    runner.Test('2.7c a computed column added to a custom base view is covered in one run', async () => {
        const sprocket = await state.Entity('Sprocket');
        await db.Exec(sprocketViewSql(sprocket.BaseView, true, [DOUBLE_PRICE]));
        state.RunCodeGen('2.7c-computed-column');
        await state.AssertFieldCovered('Sprocket', 'DoublePrice');
        await state.AssertReconciled('Sprocket');
    });

    runner.Test('2.7d a column added under a layered base view reaches the outer view and is covered in one run', async () => {
        await db.Exec(`ALTER TABLE ${FIXTURE_SCHEMA}.Widget ADD Color NVARCHAR(30) NULL`);
        state.RunCodeGen('2.7d-layered-column');
        await state.AssertFieldCovered('Widget', 'Color');
        await state.AssertReconciled('Widget');
    });

    runner.Test('2.8c narrowing a custom base view retires the field while the table column stays', async () => {
        const sprocket = await state.Entity('Sprocket');
        const margin = await state.Field('Sprocket', 'Margin');
        Assert(margin !== undefined && margin.Rows > 0, 'precondition: Margin has permission rows to retire');
        await db.Exec(sprocketViewSql(sprocket.BaseView, false, [DOUBLE_PRICE]));
        state.RunCodeGen('2.8c-narrow-view');
        await state.AssertFieldRetired('Sprocket', 'Margin');
        const column = await db.Query<{ n: number }>(`SELECT COUNT(*) AS n FROM sys.columns WHERE object_id = OBJECT_ID(@table) AND name = 'Margin'`, {
            table: `${FIXTURE_SCHEMA}.Sprocket`,
        });
        AssertEqual(column[0].n, 1, 'Margin is still a column on the table');
        await state.AssertEntityUsable('Sprocket');
        await state.AssertReconciled('Sprocket');
    });
}

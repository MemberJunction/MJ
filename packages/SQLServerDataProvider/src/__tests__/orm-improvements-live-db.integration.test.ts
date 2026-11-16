/**
 * Live SQL Server integration tests for PR #6474 ORM layer improvements:
 *   - Phase 1: Server-side field-level concurrency check (UPDLOCK, ROWLOCK) and delta-only spUpdate execution
 *   - Phase 2: Structured CompositeFilter in RunViewParams.Filter & FilterOf<T>() typed builder
 *   - Phase 3: CodeGen-emitted TypedQuery wrappers (Queries.MJ.Demos.*) with signature drift verification
 *
 * Env-gated: skipped during ordinary hermetic `pnpm test` runs unless `MJ_ORM_INTEGRATION_DB` is set
 * (e.g. `MJ_ORM_INTEGRATION_DB=MJ_orm_6474`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mssql from 'mssql';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseEntity,
    CompositeFilter,
    CompositeKey,
    EntityInfo,
    EntitySaveOptions,
    FilterOf,
    Metadata,
    RunView,
    SetProvider,
    SetTypedQueryDriftMode,
    SetTypedQueryRowValidation,
    UserInfo,
} from '@memberjunction/core';
import { MJEntityEntity, MJTagEntity, Queries, QueryEngine } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { SQLServerProviderConfigData } from '../types';

const INTEGRATION_DB =
    process.env.MJ_ORM_INTEGRATION_DB ||
    (process.env.MJ_LIVE_DB_TEST === '1' ? process.env.DB_DATABASE ?? 'MJ_orm_6474' : undefined);
const describeIfLiveDB = describe.skipIf(!INTEGRATION_DB);

class LiveIntegrationSQLProvider extends SQLServerDataProvider {
    private readonly _extraEntities = new Map<string, EntityInfo>();

    public RegisterTestEntity(info: EntityInfo): void {
        this._extraEntities.set(info.ID.toLowerCase(), info);
    }

    public override get Entities(): EntityInfo[] {
        return [...super.Entities, ...this._extraEntities.values()];
    }

    public override EntityByName(entityName: string): EntityInfo | undefined {
        const key = entityName?.trim().toLowerCase();
        for (const info of this._extraEntities.values()) {
            if (info.Name.trim().toLowerCase() === key) {
                return info;
            }
        }
        return super.EntityByName(entityName);
    }

    public override EntityByID(entityID: string): EntityInfo | undefined {
        const found = this._extraEntities.get(entityID?.trim().toLowerCase());
        return found ?? super.EntityByID(entityID);
    }

    protected override async HandleEntityActions(): Promise<never[]> {
        return [];
    }

    protected override async HandleEntityAIActions(): Promise<void> {
        // AI action engine is not under test in the ORM integration suite
    }
}

const ISA_PARENT_ENTITY_ID = '99999999-6474-4000-8000-000000000001';
const ISA_CHILD_ENTITY_ID = '99999999-6474-4000-8000-000000000002';
const ISA_PARENT_ENTITY_NAME = '__ORM6474_ISAParents';
const ISA_CHILD_ENTITY_NAME = '__ORM6474_ISAChildren';

interface ISAParentConfigPayload {
    Version: number;
    Flags: string[];
}

@RegisterClass(BaseEntity, ISA_PARENT_ENTITY_NAME)
class LiveISAParentEntity extends BaseEntity {
    public ConfigSetterCalls = 0;

    public override CheckPermissions(): boolean {
        return true;
    }

    public async Load(ID: string): Promise<boolean> {
        const pk = new CompositeKey([{ FieldName: 'ID', Value: ID }]);
        return super.InnerLoad(pk);
    }

    public get ID(): string {
        return this.Get('ID');
    }
    public set ID(value: string) {
        this.Set('ID', value);
    }

    public get Title(): string {
        return this.Get('Title');
    }
    public set Title(value: string) {
        this.Set('Title', value);
    }

    public get ParentNotes(): string | null {
        return this.Get('ParentNotes');
    }
    public set ParentNotes(value: string | null) {
        this.Set('ParentNotes', value);
    }

    public get ConfigJSON(): string | null {
        return this.Get('ConfigJSON');
    }
    public set ConfigJSON(value: string | null) {
        this.ConfigSetterCalls++;
        this.Set('ConfigJSON', value);
    }

    public get ConfigJSONObject(): ISAParentConfigPayload | null {
        return this.GetJSONFieldObject<ISAParentConfigPayload>('ConfigJSON');
    }
    public set ConfigJSONObject(value: ISAParentConfigPayload | null) {
        this.SetJSONFieldObject<ISAParentConfigPayload>('ConfigJSON', value);
    }
}

@RegisterClass(BaseEntity, ISA_CHILD_ENTITY_NAME)
class LiveISAChildEntity extends LiveISAParentEntity {
    public get ChildNote(): string | null {
        return this.Get('ChildNote');
    }
    public set ChildNote(value: string | null) {
        this.Set('ChildNote', value);
    }

    public get DurationMinutes(): number | null {
        return this.Get('DurationMinutes');
    }
    public set DurationMinutes(value: number | null) {
        this.Set('DurationMinutes', value);
    }
}

async function dropLiveISAFixture(pool: mssql.ConnectionPool): Promise<void> {
    await pool.request().batch(`
        DROP PROCEDURE IF EXISTS [__mj].[spUpdate__ORM6474_ISAChild];
        DROP PROCEDURE IF EXISTS [__mj].[spCreate__ORM6474_ISAChild];
        DROP PROCEDURE IF EXISTS [__mj].[spUpdate__ORM6474_ISAParent];
        DROP PROCEDURE IF EXISTS [__mj].[spCreate__ORM6474_ISAParent];
        DROP VIEW IF EXISTS [__mj].[vw__ORM6474_ISAChildren];
        DROP VIEW IF EXISTS [__mj].[vw__ORM6474_ISAParents];
        DROP TABLE IF EXISTS [__mj].[__ORM6474_ISAChild];
        DROP TABLE IF EXISTS [__mj].[__ORM6474_ISAParent];
    `);
}

async function createLiveISAFixture(pool: mssql.ConnectionPool): Promise<void> {
    await dropLiveISAFixture(pool);
    await pool.request().query(`
        CREATE TABLE [__mj].[__ORM6474_ISAParent] (
            [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
            [Title] NVARCHAR(200) NOT NULL,
            [ParentNotes] NVARCHAR(MAX) NULL,
            [ConfigJSON] NVARCHAR(MAX) NULL
        );
        CREATE TABLE [__mj].[__ORM6474_ISAChild] (
            [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES [__mj].[__ORM6474_ISAParent]([ID]) ON DELETE CASCADE,
            [ChildNote] NVARCHAR(500) NULL,
            [DurationMinutes] INT NULL
        );
    `);
    await pool.request().query(`
        CREATE VIEW [__mj].[vw__ORM6474_ISAParents] AS
        SELECT p.[ID], p.[Title], p.[ParentNotes], p.[ConfigJSON]
        FROM [__mj].[__ORM6474_ISAParent] p;
    `);
    await pool.request().query(`
        CREATE VIEW [__mj].[vw__ORM6474_ISAChildren] AS
        SELECT c.[ID], p.[Title], p.[ParentNotes], p.[ConfigJSON], c.[ChildNote], c.[DurationMinutes]
        FROM [__mj].[__ORM6474_ISAChild] c
        INNER JOIN [__mj].[__ORM6474_ISAParent] p ON c.[ID] = p.[ID];
    `);
    await pool.request().query(`
        CREATE PROCEDURE [__mj].[spCreate__ORM6474_ISAParent]
            @ID UNIQUEIDENTIFIER = NULL,
            @Title NVARCHAR(200),
            @ParentNotes NVARCHAR(MAX) = NULL,
            @ParentNotes_Clear BIT = 0,
            @ConfigJSON NVARCHAR(MAX) = NULL,
            @ConfigJSON_Clear BIT = 0
        AS
        BEGIN
            SET NOCOUNT ON;
            DECLARE @Inserted TABLE ([ID] UNIQUEIDENTIFIER);
            IF @ID IS NOT NULL
                INSERT INTO [__mj].[__ORM6474_ISAParent] ([ID], [Title], [ParentNotes], [ConfigJSON])
                OUTPUT INSERTED.[ID] INTO @Inserted
                VALUES (@ID, @Title, @ParentNotes, @ConfigJSON);
            ELSE
                INSERT INTO [__mj].[__ORM6474_ISAParent] ([Title], [ParentNotes], [ConfigJSON])
                OUTPUT INSERTED.[ID] INTO @Inserted
                VALUES (@Title, @ParentNotes, @ConfigJSON);
            SELECT * FROM [__mj].[vw__ORM6474_ISAParents] WHERE [ID] = (SELECT TOP 1 [ID] FROM @Inserted);
        END
    `);
    await pool.request().query(`
        CREATE PROCEDURE [__mj].[spUpdate__ORM6474_ISAParent]
            @ID UNIQUEIDENTIFIER,
            @Title NVARCHAR(200) = NULL,
            @ParentNotes NVARCHAR(MAX) = NULL,
            @ParentNotes_Clear BIT = 0,
            @ConfigJSON NVARCHAR(MAX) = NULL,
            @ConfigJSON_Clear BIT = 0
        AS
        BEGIN
            SET NOCOUNT ON;
            UPDATE [__mj].[__ORM6474_ISAParent]
            SET
                [Title] = ISNULL(@Title, [Title]),
                [ParentNotes] = CASE WHEN @ParentNotes_Clear = 1 THEN NULL ELSE ISNULL(@ParentNotes, [ParentNotes]) END,
                [ConfigJSON] = CASE WHEN @ConfigJSON_Clear = 1 THEN NULL ELSE ISNULL(@ConfigJSON, [ConfigJSON]) END
            WHERE [ID] = @ID;
            SELECT * FROM [__mj].[vw__ORM6474_ISAParents] WHERE [ID] = @ID;
        END
    `);
    await pool.request().query(`
        CREATE PROCEDURE [__mj].[spCreate__ORM6474_ISAChild]
            @ID UNIQUEIDENTIFIER,
            @ChildNote NVARCHAR(500) = NULL,
            @ChildNote_Clear BIT = 0,
            @DurationMinutes INT = NULL,
            @DurationMinutes_Clear BIT = 0
        AS
        BEGIN
            SET NOCOUNT ON;
            INSERT INTO [__mj].[__ORM6474_ISAChild] ([ID], [ChildNote], [DurationMinutes])
            VALUES (@ID, @ChildNote, @DurationMinutes);
            SELECT * FROM [__mj].[vw__ORM6474_ISAChildren] WHERE [ID] = @ID;
        END
    `);
    await pool.request().query(`
        CREATE PROCEDURE [__mj].[spUpdate__ORM6474_ISAChild]
            @ID UNIQUEIDENTIFIER,
            @ChildNote NVARCHAR(500) = NULL,
            @ChildNote_Clear BIT = 0,
            @DurationMinutes INT = NULL,
            @DurationMinutes_Clear BIT = 0
        AS
        BEGIN
            SET NOCOUNT ON;
            UPDATE [__mj].[__ORM6474_ISAChild]
            SET
                [ChildNote] = CASE WHEN @ChildNote_Clear = 1 THEN NULL ELSE ISNULL(@ChildNote, [ChildNote]) END,
                [DurationMinutes] = CASE WHEN @DurationMinutes_Clear = 1 THEN NULL ELSE ISNULL(@DurationMinutes, [DurationMinutes]) END
            WHERE [ID] = @ID;
            SELECT * FROM [__mj].[vw__ORM6474_ISAChildren] WHERE [ID] = @ID;
        END
    `);
}

function registerLiveISAEntityMetadata(targetProvider: LiveIntegrationSQLProvider, roleId: string): void {
    const parentInfo = new EntityInfo({
        ID: ISA_PARENT_ENTITY_ID,
        Name: ISA_PARENT_ENTITY_NAME,
        BaseTable: '__ORM6474_ISAParent',
        BaseView: 'vw__ORM6474_ISAParents',
        SchemaName: '__mj',
        spCreate: 'spCreate__ORM6474_ISAParent',
        spUpdate: 'spUpdate__ORM6474_ISAParent',
        spCreateGenerated: true,
        spUpdateGenerated: true,
        TrackRecordChanges: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        IncludeInAPI: true,
        VirtualEntity: false,
        ParentID: null,
        Status: 'Active',
        EntityFields: [
            {
                ID: '99999999-6474-4000-8001-000000000001',
                EntityID: ISA_PARENT_ENTITY_ID,
                Name: 'ID',
                Type: 'uniqueidentifier',
                Length: 16,
                IsPrimaryKey: true,
                AllowsNull: false,
                AutoIncrement: false,
                IsVirtual: false,
                AllowUpdateAPI: false,
                Sequence: 1,
                Status: 'Active',
                Entity: ISA_PARENT_ENTITY_NAME,
                EntityFieldValues: [],
            },
            {
                ID: '99999999-6474-4000-8001-000000000002',
                EntityID: ISA_PARENT_ENTITY_ID,
                Name: 'Title',
                Type: 'nvarchar',
                Length: 400,
                IsPrimaryKey: false,
                AllowsNull: false,
                AutoIncrement: false,
                IsVirtual: false,
                IsNameField: true,
                AllowUpdateAPI: true,
                Sequence: 2,
                Status: 'Active',
                Entity: ISA_PARENT_ENTITY_NAME,
                EntityFieldValues: [],
            },
            {
                ID: '99999999-6474-4000-8001-000000000003',
                EntityID: ISA_PARENT_ENTITY_ID,
                Name: 'ParentNotes',
                Type: 'nvarchar',
                Length: -1,
                IsPrimaryKey: false,
                AllowsNull: true,
                AutoIncrement: false,
                IsVirtual: false,
                AllowUpdateAPI: true,
                Sequence: 3,
                Status: 'Active',
                Entity: ISA_PARENT_ENTITY_NAME,
                EntityFieldValues: [],
            },
            {
                ID: '99999999-6474-4000-8001-000000000004',
                EntityID: ISA_PARENT_ENTITY_ID,
                Name: 'ConfigJSON',
                Type: 'nvarchar',
                Length: -1,
                IsPrimaryKey: false,
                AllowsNull: true,
                AutoIncrement: false,
                IsVirtual: false,
                AllowUpdateAPI: true,
                JSONType: 'ISAParentConfigPayload',
                Sequence: 4,
                Status: 'Active',
                Entity: ISA_PARENT_ENTITY_NAME,
                EntityFieldValues: [],
            },
        ],
        EntityPermissions: [
            {
                ID: '99999999-6474-4000-8002-000000000001',
                EntityID: ISA_PARENT_ENTITY_ID,
                RoleID: roleId,
                CanCreate: true,
                CanRead: true,
                CanUpdate: true,
                CanDelete: true,
            },
        ],
        EntityRelationships: [],
        EntitySettings: [],
    });

    const childInfo = new EntityInfo({
        ID: ISA_CHILD_ENTITY_ID,
        Name: ISA_CHILD_ENTITY_NAME,
        BaseTable: '__ORM6474_ISAChild',
        BaseView: 'vw__ORM6474_ISAChildren',
        SchemaName: '__mj',
        spCreate: 'spCreate__ORM6474_ISAChild',
        spUpdate: 'spUpdate__ORM6474_ISAChild',
        spCreateGenerated: true,
        spUpdateGenerated: true,
        TrackRecordChanges: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        IncludeInAPI: true,
        VirtualEntity: false,
        ParentID: ISA_PARENT_ENTITY_ID,
        Status: 'Active',
        EntityFields: [
            {
                ID: '99999999-6474-4000-8003-000000000001',
                EntityID: ISA_CHILD_ENTITY_ID,
                Name: 'ID',
                Type: 'uniqueidentifier',
                Length: 16,
                IsPrimaryKey: true,
                AllowsNull: false,
                AutoIncrement: false,
                IsVirtual: false,
                AllowUpdateAPI: false,
                Sequence: 1,
                Status: 'Active',
                Entity: ISA_CHILD_ENTITY_NAME,
                EntityFieldValues: [],
            },
            {
                ID: '99999999-6474-4000-8003-000000000002',
                EntityID: ISA_CHILD_ENTITY_ID,
                Name: 'Title',
                Type: 'nvarchar',
                Length: 400,
                IsPrimaryKey: false,
                AllowsNull: false,
                AutoIncrement: false,
                IsVirtual: true,
                AllowUpdateAPI: false,
                Sequence: 2,
                Status: 'Active',
                Entity: ISA_CHILD_ENTITY_NAME,
                EntityFieldValues: [],
            },
            {
                ID: '99999999-6474-4000-8003-000000000003',
                EntityID: ISA_CHILD_ENTITY_ID,
                Name: 'ParentNotes',
                Type: 'nvarchar',
                Length: -1,
                IsPrimaryKey: false,
                AllowsNull: true,
                AutoIncrement: false,
                IsVirtual: true,
                AllowUpdateAPI: false,
                Sequence: 3,
                Status: 'Active',
                Entity: ISA_CHILD_ENTITY_NAME,
                EntityFieldValues: [],
            },
            {
                ID: '99999999-6474-4000-8003-000000000004',
                EntityID: ISA_CHILD_ENTITY_ID,
                Name: 'ConfigJSON',
                Type: 'nvarchar',
                Length: -1,
                IsPrimaryKey: false,
                AllowsNull: true,
                AutoIncrement: false,
                IsVirtual: true,
                AllowUpdateAPI: false,
                JSONType: 'ISAParentConfigPayload',
                Sequence: 4,
                Status: 'Active',
                Entity: ISA_CHILD_ENTITY_NAME,
                EntityFieldValues: [],
            },
            {
                ID: '99999999-6474-4000-8003-000000000005',
                EntityID: ISA_CHILD_ENTITY_ID,
                Name: 'ChildNote',
                Type: 'nvarchar',
                Length: 1000,
                IsPrimaryKey: false,
                AllowsNull: true,
                AutoIncrement: false,
                IsVirtual: false,
                AllowUpdateAPI: true,
                Sequence: 5,
                Status: 'Active',
                Entity: ISA_CHILD_ENTITY_NAME,
                EntityFieldValues: [],
            },
            {
                ID: '99999999-6474-4000-8003-000000000006',
                EntityID: ISA_CHILD_ENTITY_ID,
                Name: 'DurationMinutes',
                Type: 'int',
                IsPrimaryKey: false,
                AllowsNull: true,
                AutoIncrement: false,
                IsVirtual: false,
                AllowUpdateAPI: true,
                Sequence: 6,
                Status: 'Active',
                Entity: ISA_CHILD_ENTITY_NAME,
                EntityFieldValues: [],
            },
        ],
        EntityPermissions: [
            {
                ID: '99999999-6474-4000-8004-000000000001',
                EntityID: ISA_CHILD_ENTITY_ID,
                RoleID: roleId,
                CanCreate: true,
                CanRead: true,
                CanUpdate: true,
                CanDelete: true,
            },
        ],
        EntityRelationships: [],
        EntitySettings: [],
    });

    targetProvider.RegisterTestEntity(parentInfo);
    targetProvider.RegisterTestEntity(childInfo);
}

describeIfLiveDB('ORM Layer Improvements — Live SQL Server Integration (MJ_orm_6474)', () => {
    let pool: mssql.ConnectionPool;
    let secondPool: mssql.ConnectionPool;
    let provider: LiveIntegrationSQLProvider;
    let secondProvider: LiveIntegrationSQLProvider;
    let sysUser: UserInfo;
    const createdTagIds: string[] = [];

    beforeAll(async () => {
        const poolCfg: mssql.config = {
            server: process.env.DB_HOST ?? 'localhost',
            port: Number(process.env.DB_PORT ?? 1433),
            database: INTEGRATION_DB,
            user: process.env.DB_USERNAME ?? 'sa',
            password: process.env.DB_PASSWORD ?? '',
            options: {
                encrypt: false,
                trustServerCertificate: true,
            },
            connectionTimeout: 30000,
            requestTimeout: 30000,
        };
        pool = new mssql.ConnectionPool(poolCfg);
        secondPool = new mssql.ConnectionPool(poolCfg);
        await pool.connect();
        await secondPool.connect();

        await createLiveISAFixture(pool);

        const config = new SQLServerProviderConfigData(pool, '__mj', 0);
        provider = new LiveIntegrationSQLProvider();
        await provider.Config(config);
        SetProvider(provider);

        const secondConfig = new SQLServerProviderConfigData(secondPool, '__mj', 0, undefined, undefined, false);
        secondProvider = new LiveIntegrationSQLProvider();
        await secondProvider.Config(secondConfig, provider);

        await UserCache.Instance.Refresh(provider);

        const foundUser =
            UserCache.Instance.GetSystemUser() ??
            UserCache.Users.find((u) => u.IsActive) ??
            UserCache.Users[0];
        if (!foundUser) {
            throw new Error('No active user found in UserCache for live integration test.');
        }
        // Ensure the test user has all roles so queries with role-specific QueryPermissions can execute
        const allRoles = provider.Roles.map((r) => ({ UserID: foundUser.ID, RoleID: r.ID, Role: r.Name }));
        sysUser = new UserInfo(provider, {
            ...foundUser,
            UserRoles: allRoles,
        });
        registerLiveISAEntityMetadata(provider, provider.Roles[0].ID);
        registerLiveISAEntityMetadata(secondProvider, provider.Roles[0].ID);
        await QueryEngine.Instance.Config(false, sysUser);
    }, 60000);

    afterAll(async () => {
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(null);
        if (secondPool?.connected) {
            await secondPool.close();
        }
        if (pool?.connected) {
            for (const id of createdTagIds) {
                try {
                    const req = new mssql.Request(pool);
                    req.input('id', mssql.UniqueIdentifier, id);
                    await req.query(`
                        DELETE FROM [__mj].[RecordChange] WHERE [EntityID] = (SELECT [ID] FROM [__mj].[Entity] WHERE [Name] = 'MJ: Tags') AND [RecordID] LIKE CONCAT('%', CAST(@id AS NVARCHAR(50)), '%');
                        DELETE FROM [__mj].[Tag] WHERE [ID] = @id;
                    `);
                } catch {
                    // ignore cleanup errors
                }
            }
            try {
                await dropLiveISAFixture(pool);
            } catch {
                // ignore cleanup errors
            }
            await pool.close();
        }
    }, 30000);

    it('Phase 1: disjoint-column concurrent server saves both succeed and preserve both changes via delta-only spUpdate', async () => {
        provider.ConcurrencyCheck = 'enforce';
        const md = new Metadata();

        // Create a fresh Tag record
        const seed = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        seed.NewRecord();
        seed.Name = `ORM-6474-Disjoint-${Date.now()}`;
        seed.DisplayName = 'Initial Display';
        seed.Description = 'Initial Description';
        expect(await seed.Save()).toBe(true);
        createdTagIds.push(seed.ID);

        // Two server processes load the same record at t0
        const writerA = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        const writerB = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        expect(await writerA.Load(seed.ID)).toBe(true);
        expect(await writerB.Load(seed.ID)).toBe(true);

        // Writer A updates DisplayName and saves at t1
        writerA.DisplayName = 'Updated Display By A';
        expect(await writerA.Save()).toBe(true);

        // Writer B (still holding stale DisplayName='Initial Display' in memory) updates Description and saves at t2
        writerB.Description = 'Updated Description By B';
        expect(await writerB.Save()).toBe(true);

        // Because spUpdate only sent Description (delta-only) and returned the full view row,
        // writerB now sees Writer A's DisplayName AND its own Description!
        expect(writerB.DisplayName).toBe('Updated Display By A');
        expect(writerB.Description).toBe('Updated Description By B');

        // Verify by loading a fresh instance from SQL Server
        const verifier = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        expect(await verifier.Load(seed.ID)).toBe(true);
        expect(verifier.DisplayName).toBe('Updated Display By A');
        expect(verifier.Description).toBe('Updated Description By B');
    });

    it('Phase 1: overlapping conflicting server saves fail in enforce mode and populate LatestResult.ConcurrencyConflict', async () => {
        provider.ConcurrencyCheck = 'enforce';
        const md = new Metadata();

        const seed = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        seed.NewRecord();
        seed.Name = `ORM-6474-Conflict-${Date.now()}`;
        seed.DisplayName = 'Baseline Display';
        seed.Description = 'Baseline Description';
        expect(await seed.Save()).toBe(true);
        createdTagIds.push(seed.ID);

        // Both writers load at t0
        const writerA = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        const writerB = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        expect(await writerA.Load(seed.ID)).toBe(true);
        expect(await writerB.Load(seed.ID)).toBe(true);

        // Writer A updates DisplayName and succeeds
        writerA.DisplayName = 'Writer A Winner';
        expect(await writerA.Save()).toBe(true);

        // Writer B updates the SAME DisplayName field to a different value -> refused!
        writerB.DisplayName = 'Writer B Conflicting Edit';
        const bSaved = await writerB.Save();
        expect(bSaved).toBe(false);
        expect(writerB.LatestResult?.Success).toBe(false);
        expect(writerB.LatestResult?.ConcurrencyConflict).toEqual({
            ConflictingFields: ['DisplayName'],
        });

        // Database still holds Writer A's value
        const verifier = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        expect(await verifier.Load(seed.ID)).toBe(true);
        expect(verifier.DisplayName).toBe('Writer A Winner');

        // Idempotent convergence: if a third writer loaded at t0 writes the SAME value as Writer A, it succeeds
        const writerC = await md.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        expect(await writerC.Load(seed.ID)).toBe(true);
        // Simulate baseline 'Baseline Display' via ConcurrencyBaseline override while setting 'Writer A Winner'
        writerC.DisplayName = 'Temporary';
        writerC.DisplayName = 'Writer A Winner';
        const saveOpts = new EntitySaveOptions();
        saveOpts.ConcurrencyBaseline = { DisplayName: 'Baseline Display' };
        expect(await writerC.Save(saveOpts)).toBe(true);
    });

    it('Phase 2: RunView executes structured FilterOf<T>() with parameterized SQL and combines with ExtraFilter', async () => {
        const rv = new RunView();

        const entityFilter = FilterOf<MJEntityEntity>().And((f) => [
            f.In('Name', ['MJ: Users', 'MJ: Entities', 'MJ: Tags']),
            f.Eq('IncludeInAPI', true),
            f.IsNotEmpty('BaseView'),
        ]);

        const res = await rv.RunView<MJEntityEntity>(
            {
                EntityName: 'MJ: Entities',
                Filter: entityFilter,
                OrderBy: 'Name ASC',
                ResultType: 'simple',
            },
            sysUser,
        );

        expect(res.Success).toBe(true);
        expect(res.Results.map((r) => r.Name)).toEqual(['MJ: Entities', 'MJ: Tags', 'MJ: Users']);

        // Verify exact row-ID set parity between live SQL Server compilation and in-memory CompositeFilter.Evaluate()
        const allEntitiesRes = await rv.RunView<MJEntityEntity>(
            {
                EntityName: 'MJ: Entities',
                OrderBy: 'Name ASC',
                ResultType: 'simple',
            },
            sysUser,
        );
        expect(allEntitiesRes.Success).toBe(true);
        const cf = CompositeFilter.FromDescriptor(entityFilter);
        const inMemoryMatchingIds = allEntitiesRes.Results.filter((row) =>
            cf.Evaluate({ '': row as unknown as Record<string, unknown> }),
        ).map((r) => r.ID);
        expect(res.Results.map((r) => r.ID)).toEqual(inMemoryMatchingIds);

        // Combine structured Filter with ExtraFilter
        const combinedRes = await rv.RunView<MJEntityEntity>(
            {
                EntityName: 'MJ: Entities',
                Filter: entityFilter,
                ExtraFilter: "BaseTable = 'Tag'",
                ResultType: 'simple',
            },
            sysUser,
        );
        expect(combinedRes.Success).toBe(true);
        expect(combinedRes.Results).toHaveLength(1);
        expect(combinedRes.Results[0].Name).toBe('MJ: Tags');
    });

    it('Phase 3: generated TypedQuery wrappers (Queries.MJ.Demos.*) execute with zero signature drift in throw mode', async () => {
        SetTypedQueryDriftMode('throw');
        SetTypedQueryRowValidation(true);

        const activeUsersResult = await Queries.MJ.Demos.ActiveUsers.Run(undefined, {
            contextUser: sysUser,
        });
        expect(activeUsersResult.Success).toBe(true);
        expect(Array.isArray(activeUsersResult.Results)).toBe(true);
        expect(activeUsersResult.Results.length).toBeGreaterThan(0);
        expect(typeof activeUsersResult.Results[0].ID).toBe('string');
        expect(typeof activeUsersResult.Results[0].Name).toBe('string');

        const recentChangesResult = await Queries.MJ.Demos.RecentEntityChanges.Run(
            { lookbackDays: 30 },
            { contextUser: sysUser },
        );
        expect(recentChangesResult.Success).toBe(true);
        expect(Array.isArray(recentChangesResult.Results)).toBe(true);
    });

    it('Phase 1 (Multi-Pool & Kill-Switch): two independent ConnectionPools with default ConcurrencyCheck="off" preserve concurrent disjoint updates, while DeltaUpdates=false restores legacy full-row writes', async () => {
        provider.ConcurrencyCheck = 'off';
        provider.DeltaUpdates = true;
        secondProvider.ConcurrencyCheck = 'off';
        secondProvider.DeltaUpdates = true;

        const seed = await provider.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        seed.NewRecord();
        seed.Name = `ORM-6474-TwoPool-${Date.now()}`;
        seed.DisplayName = 'Initial Pool Display';
        seed.Description = 'Initial Pool Description';
        expect(await seed.Save()).toBe(true);
        createdTagIds.push(seed.ID);

        // Both server pools load the same Tag record at t0
        const pool1Entity = await provider.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        const pool2Entity = await secondProvider.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        expect(await pool1Entity.Load(seed.ID)).toBe(true);
        expect(await pool2Entity.Load(seed.ID)).toBe(true);

        // Pool 1 and Pool 2 concurrently update disjoint columns with ConcurrencyCheck = 'off'
        pool1Entity.DisplayName = 'Pool 1RotatedDisplay';
        pool2Entity.Description = 'Pool 2HeartbeatDescription';
        const [saved1, saved2] = await Promise.all([pool1Entity.Save(), pool2Entity.Save()]);
        expect(saved1).toBe(true);
        expect(saved2).toBe(true);

        // Fresh load proves neither pool overwrote the other's column
        const verifier = await provider.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        expect(await verifier.Load(seed.ID)).toBe(true);
        expect(verifier.DisplayName).toBe('Pool 1RotatedDisplay');
        expect(verifier.Description).toBe('Pool 2HeartbeatDescription');

        // Verify DeltaUpdates = false escape hatch restores full-row spUpdate behavior
        const staleWriter = await secondProvider.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
        expect(await staleWriter.Load(seed.ID)).toBe(true);
        verifier.DisplayName = 'Updated Before Legacy Full Write';
        expect(await verifier.Save()).toBe(true);

        try {
            secondProvider.DeltaUpdates = false;
            staleWriter.Description = 'Legacy Full Write Description';
            expect(await staleWriter.Save()).toBe(true);

            const afterKillSwitch = await provider.GetEntityObject<MJTagEntity>('MJ: Tags', sysUser);
            expect(await afterKillSwitch.Load(seed.ID)).toBe(true);
            // With DeltaUpdates=false, staleWriter sent its full in-memory row including stale DisplayName
            expect(afterKillSwitch.DisplayName).toBe('Pool 1RotatedDisplay');
            expect(afterKillSwitch.Description).toBe('Legacy Full Write Description');
        } finally {
            secondProvider.DeltaUpdates = true;
        }
    });

    it('Phase 1 (@JSONType + Subclass Setter + Delta Update): FlushJSONFieldObjects routes un-proxied edits through subclass setters and persists alongside concurrent disjoint writes', async () => {
        provider.ConcurrencyCheck = 'off';
        provider.DeltaUpdates = true;
        secondProvider.ConcurrencyCheck = 'off';
        secondProvider.DeltaUpdates = true;

        const seed = await provider.GetEntityObject<LiveISAParentEntity>(ISA_PARENT_ENTITY_NAME, sysUser);
        seed.NewRecord();
        seed.Title = 'Initial JSON Parent';
        seed.ParentNotes = 'Initial Notes';
        seed.ConfigJSONObject = { Version: 1, Flags: ['seed'] };
        expect(await seed.Save()).toBe(true);

        const writerA = await provider.GetEntityObject<LiveISAParentEntity>(ISA_PARENT_ENTITY_NAME, sysUser);
        const writerB = await secondProvider.GetEntityObject<LiveISAParentEntity>(ISA_PARENT_ENTITY_NAME, sysUser);
        expect(await writerA.Load(seed.ID)).toBe(true);
        expect(await writerB.Load(seed.ID)).toBe(true);

        // Writer A updates ParentNotes first
        writerA.ParentNotes = 'Concurrent Notes From Writer A';
        expect(await writerA.Save()).toBe(true);

        // Writer B (still holding stale ParentNotes in memory) adopts a plain object into ConfigJSONObject
        // and mutates it in-place behind the proxy, plus updates Title
        const adopted: ISAParentConfigPayload = { Version: 1, Flags: ['seed'] };
        writerB.ConfigJSONObject = adopted;
        writerB.ConfigSetterCalls = 0;
        adopted.Version = 2;
        adopted.Flags.push('flushed-via-setter');
        expect(writerB.ConfigSetterCalls).toBe(0); // un-proxied mutation has not hit setter yet
        writerB.Title = 'Updated Title From Writer B';

        expect(await writerB.Save()).toBe(true);
        // Subclass `set ConfigJSON` was invoked by FlushJSONFieldObjects before delta SQL binding!
        expect(writerB.ConfigSetterCalls).toBe(1);

        // Fresh load proves ConfigJSON + Title from Writer B AND ParentNotes from Writer A all survived!
        const verifier = await provider.GetEntityObject<LiveISAParentEntity>(ISA_PARENT_ENTITY_NAME, sysUser);
        expect(await verifier.Load(seed.ID)).toBe(true);
        expect(verifier.Title).toBe('Updated Title From Writer B');
        expect(verifier.ParentNotes).toBe('Concurrent Notes From Writer A');
        expect(verifier.ConfigJSONObject).toEqual({ Version: 2, Flags: ['seed', 'flushed-via-setter'] });
    });

    it('Phase 1 (IS-A Chain Concurrency Rollback): parent conflict aborts before child, and child conflict physically rolls back already-executed parent spUpdate in SQL Server', async () => {
        provider.ConcurrencyCheck = 'enforce';
        secondProvider.ConcurrencyCheck = 'off';

        const seed = await provider.GetEntityObject<LiveISAChildEntity>(ISA_CHILD_ENTITY_NAME, sysUser);
        seed.NewRecord();
        seed.Title = 'Baseline ISA Title';
        seed.ParentNotes = 'Baseline Parent Notes';
        seed.ChildNote = 'Baseline Child Note';
        seed.DurationMinutes = 45;
        expect(await seed.Save()).toBe(true);

        // --- Case A: Parent-level conflict aborts before child runs ---
        const childStaleParent = await provider.GetEntityObject<LiveISAChildEntity>(ISA_CHILD_ENTITY_NAME, sysUser);
        const concurrentParentWriter = await secondProvider.GetEntityObject<LiveISAChildEntity>(ISA_CHILD_ENTITY_NAME, sysUser);
        expect(await childStaleParent.Load(seed.ID)).toBe(true);
        expect(await concurrentParentWriter.Load(seed.ID)).toBe(true);

        concurrentParentWriter.Title = 'Winner Parent Title';
        expect(await concurrentParentWriter.Save()).toBe(true);

        childStaleParent.Title = 'Conflicting Parent Title';
        childStaleParent.ChildNote = 'Should Never Reach Child Table';
        expect(await childStaleParent.Save()).toBe(false);
        expect(childStaleParent.LatestResult?.ConcurrencyConflict).toEqual({
            ConflictingFields: ['Title'],
        });

        const checkAfterCaseA = await secondProvider.GetEntityObject<LiveISAChildEntity>(ISA_CHILD_ENTITY_NAME, sysUser);
        expect(await checkAfterCaseA.Load(seed.ID)).toBe(true);
        expect(checkAfterCaseA.Title).toBe('Winner Parent Title');
        expect(checkAfterCaseA.ChildNote).toBe('Baseline Child Note');

        // --- Case B: Child-level conflict physically rolls back already-executed parent spUpdate ---
        const childStaleLeaf = await provider.GetEntityObject<LiveISAChildEntity>(ISA_CHILD_ENTITY_NAME, sysUser);
        const concurrentLeafWriter = await secondProvider.GetEntityObject<LiveISAChildEntity>(ISA_CHILD_ENTITY_NAME, sysUser);
        expect(await childStaleLeaf.Load(seed.ID)).toBe(true);
        expect(await concurrentLeafWriter.Load(seed.ID)).toBe(true);

        concurrentLeafWriter.ChildNote = 'Winner Child Note';
        expect(await concurrentLeafWriter.Save()).toBe(true);

        // Caller modifies BOTH parent Title (no conflict!) AND child ChildNote (conflicts with 'Winner Child Note'!)
        childStaleLeaf.Title = 'Parent Edit That Must Roll Back';
        childStaleLeaf.ChildNote = 'Conflicting Child Note';
        expect(await childStaleLeaf.Save()).toBe(false);
        expect(childStaleLeaf.LatestResult?.ConcurrencyConflict).toEqual({
            ConflictingFields: ['ChildNote'],
        });

        // Verify directly in SQL Server via secondPool that parent Title was rolled back to 'Winner Parent Title'!
        const checkAfterCaseB = await secondProvider.GetEntityObject<LiveISAChildEntity>(ISA_CHILD_ENTITY_NAME, sysUser);
        expect(await checkAfterCaseB.Load(seed.ID)).toBe(true);
        expect(checkAfterCaseB.Title).toBe('Winner Parent Title');
        expect(checkAfterCaseB.ChildNote).toBe('Winner Child Note');

        // Verify in-memory UnitOfWork rollback left parent Dirty=true so resolving the child conflict and retrying persists BOTH!
        expect(childStaleLeaf.ISAParent?.Dirty).toBe(true);
        // Converge ChildNote with stored 'Winner Child Note' (or pass SkipOldValuesCheck) and retry
        expect(await childStaleLeaf.Save({ SkipOldValuesCheck: true })).toBe(true);

        const checkAfterRetry = await secondProvider.GetEntityObject<LiveISAChildEntity>(ISA_CHILD_ENTITY_NAME, sysUser);
        expect(await checkAfterRetry.Load(seed.ID)).toBe(true);
        expect(checkAfterRetry.Title).toBe('Parent Edit That Must Roll Back');
        expect(checkAfterRetry.ChildNote).toBe('Conflicting Child Note');
    });
});

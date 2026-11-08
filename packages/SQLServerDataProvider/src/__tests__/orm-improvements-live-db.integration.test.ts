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
import {
    EntityDeleteOptions,
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

const INTEGRATION_DB = process.env.MJ_ORM_INTEGRATION_DB;
const describeIfLiveDB = describe.skipIf(!INTEGRATION_DB);

class LiveIntegrationSQLProvider extends SQLServerDataProvider {
    protected override async HandleEntityActions(): Promise<never[]> {
        return [];
    }

    protected override async HandleEntityAIActions(): Promise<void> {
        // AI action engine is not under test in the ORM integration suite
    }
}

describeIfLiveDB('ORM Layer Improvements — Live SQL Server Integration (MJ_orm_6474)', () => {
    let pool: mssql.ConnectionPool;
    let provider: LiveIntegrationSQLProvider;
    let sysUser: UserInfo;
    const createdTagIds: string[] = [];

    beforeAll(async () => {
        pool = new mssql.ConnectionPool({
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
        });
        await pool.connect();

        const config = new SQLServerProviderConfigData(pool, '__mj', 0);
        provider = new LiveIntegrationSQLProvider();
        await provider.Config(config);
        SetProvider(provider);
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
        await QueryEngine.Instance.Config(false, sysUser);
    }, 60000);

    afterAll(async () => {
        SetTypedQueryDriftMode('warn');
        SetTypedQueryRowValidation(null);
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
});

/**
 * Live SQL Server checks for field-level concurrency checking inside a TransactionGroup, and for the
 * Record Change snapshots a group's saves write.
 *
 * Two providers on separate connection pools stand in for two servers sharing one database: the
 * second commits a change while the first holds a stale copy of the same row in a group.
 *
 * Env-gated: skipped in ordinary hermetic `pnpm test` runs unless `MJ_TG_CONCURRENCY_LIVE_DB` names
 * a migrated MJ database (connection settings from DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mssql from 'mssql';
import { EntitySaveOptions, SetProvider, TransactionVariable, UserInfo } from '@memberjunction/core';
import type { MJTagEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { SQLServerProviderConfigData } from '../types';

const LIVE_DB = process.env.MJ_TG_CONCURRENCY_LIVE_DB;
const describeIfLiveDB = describe.skipIf(!LIVE_DB);

class LiveGroupProvider extends SQLServerDataProvider {
    protected override async HandleEntityActions(): Promise<never[]> {
        return [];
    }

    protected override async HandleEntityAIActions(): Promise<void> {
        // AI actions are not under test here
    }
}

interface RecordChangeRow {
    Type: string;
    ChangesJSON: string;
    FullRecordJSON: string;
}

function poolConfig(): mssql.config {
    return {
        server: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 1433),
        database: LIVE_DB,
        user: process.env.DB_USERNAME ?? 'sa',
        password: process.env.DB_PASSWORD ?? '',
        options: { encrypt: false, trustServerCertificate: true },
        connectionTimeout: 30000,
        requestTimeout: 30000,
    };
}

function enforce(): EntitySaveOptions {
    const options = new EntitySaveOptions();
    options.ConcurrencyCheck = 'enforce';
    return options;
}

function parseObject(json: string): Record<string, unknown> {
    return JSON.parse(json) as Record<string, unknown>;
}

describeIfLiveDB('TransactionGroup concurrency checking — live SQL Server', () => {
    let pool: mssql.ConnectionPool;
    let secondPool: mssql.ConnectionPool;
    let provider: LiveGroupProvider;
    let secondProvider: LiveGroupProvider;
    let user: UserInfo;
    const createdTagIDs: string[] = [];

    beforeAll(async () => {
        pool = new mssql.ConnectionPool(poolConfig());
        secondPool = new mssql.ConnectionPool(poolConfig());
        await pool.connect();
        await secondPool.connect();
        provider = new LiveGroupProvider();
        await provider.Config(new SQLServerProviderConfigData(pool, '__mj', 0));
        SetProvider(provider);
        secondProvider = new LiveGroupProvider();
        await secondProvider.Config(new SQLServerProviderConfigData(secondPool, '__mj', 0, undefined, undefined, false), provider);
        await UserCache.Instance.Refresh(provider);
        const found = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive);
        if (!found) {
            throw new Error('No active user in UserCache for the live TransactionGroup test.');
        }
        user = found;
    }, 120000);

    afterAll(async () => {
        if (pool?.connected) {
            // Children first: a tag created through a variable points at its parent.
            for (const id of [...createdTagIDs].reverse()) {
                await pool.request().input('id', id).query(`UPDATE __mj.Tag SET ParentID = NULL WHERE ParentID = @id`);
            }
            for (const id of createdTagIDs) {
                await pool.request().input('id', id).query(`DELETE FROM __mj.Tag WHERE ID = @id`);
                await pool
                    .request()
                    .input('recordID', `ID|${id}`)
                    .query(`DELETE rc FROM __mj.RecordChange rc JOIN __mj.Entity e ON e.ID = rc.EntityID WHERE e.Name = 'MJ: Tags' AND rc.RecordID = @recordID`);
            }
            await pool.close();
        }
        if (secondPool?.connected) {
            await secondPool.close();
        }
    });

    async function newTag(name: string): Promise<MJTagEntity> {
        const tag = await provider.GetEntityObject<MJTagEntity>('MJ: Tags', user);
        tag.NewRecord();
        tag.Name = name;
        tag.DisplayName = name;
        tag.Description = 'initial';
        expect(await tag.Save(), tag.LatestResult?.CompleteMessage).toBe(true);
        createdTagIDs.push(tag.ID);
        return tag;
    }

    /** A new tag queued into `group` but not yet saved. */
    async function queuedNewTag(name: string, group: Awaited<ReturnType<LiveGroupProvider['CreateTransactionGroup']>>): Promise<MJTagEntity> {
        const tag = await provider.GetEntityObject<MJTagEntity>('MJ: Tags', user);
        tag.NewRecord();
        tag.Name = name;
        tag.DisplayName = name;
        tag.TransactionGroup = group;
        expect(await tag.Save()).toBe(true);
        return tag;
    }

    async function loadTag(on: LiveGroupProvider, id: string): Promise<MJTagEntity> {
        const tag = await on.GetEntityObject<MJTagEntity>('MJ: Tags', user);
        expect(await tag.Load(id)).toBe(true);
        return tag;
    }

    async function storedTag(id: string): Promise<{ Description: string | null; DisplayName: string | null } | undefined> {
        const result = await pool.request().input('id', id).query<{ Description: string | null; DisplayName: string | null }>(
            `SELECT Description, DisplayName FROM __mj.Tag WHERE ID = @id`,
        );
        return result.recordset[0];
    }

    async function tagNamed(name: string): Promise<number> {
        const result = await pool.request().input('name', name).query<{ n: number }>(`SELECT COUNT(*) AS n FROM __mj.Tag WHERE Name = @name`);
        return result.recordset[0].n;
    }

    async function latestRecordChange(id: string): Promise<RecordChangeRow> {
        const result = await pool
            .request()
            .input('recordID', `ID|${id}`)
            .query<RecordChangeRow>(
                `SELECT TOP 1 rc.Type, rc.ChangesJSON, rc.FullRecordJSON FROM __mj.RecordChange rc
                 JOIN __mj.Entity e ON e.ID = rc.EntityID
                 WHERE e.Name = 'MJ: Tags' AND rc.RecordID = @recordID ORDER BY rc.ChangedAt DESC`,
            );
        return result.recordset[0];
    }

    it("enforce: a stale update of a field another server changed rejects the whole group and writes nothing", async () => {
        const created = await newTag(`tg-live-conflict-${Date.now()}`);
        const onA = await loadTag(provider, created.ID);
        const onB = await loadTag(secondProvider, created.ID);
        onB.Description = 'from B';
        expect(await onB.Save()).toBe(true);

        const group = await provider.CreateTransactionGroup();
        const siblingName = `tg-live-conflict-sibling-${Date.now()}`;
        const sibling = await queuedNewTag(siblingName, group);
        onA.Description = 'from A';
        onA.TransactionGroup = group;
        expect(await onA.Save(enforce())).toBe(true);

        expect(await group.Submit()).toBe(false);

        expect(onA.LatestResult?.ConcurrencyConflict).toEqual({ ConflictingFields: ['Description'] });
        expect(sibling.LatestResult?.Success).toBe(false);
        expect((await storedTag(created.ID))?.Description).toBe('from B');
        expect(await tagNamed(siblingName)).toBe(0);
    });

    it('enforce: a change by another server to a different field does not conflict, and both survive a batched group', async () => {
        const created = await newTag(`tg-live-disjoint-${Date.now()}`);
        const onA = await loadTag(provider, created.ID);
        const onB = await loadTag(secondProvider, created.ID);
        onB.DisplayName = 'from B';
        expect(await onB.Save()).toBe(true);

        const group = await provider.CreateTransactionGroup();
        group.BatchedSubmit = true;
        const sibling = await queuedNewTag(`tg-live-disjoint-sibling-${Date.now()}`, group);
        onA.Description = 'from A';
        onA.TransactionGroup = group;
        expect(await onA.Save(enforce())).toBe(true);

        expect(await group.Submit(), onA.LatestResult?.CompleteMessage).toBe(true);
        createdTagIDs.push(sibling.ID);

        expect(await storedTag(created.ID)).toEqual({ Description: 'from A', DisplayName: 'from B' });
        const change = await latestRecordChange(created.ID);
        expect(Object.keys(parseObject(change.ChangesJSON))).toEqual(['Description']);
        expect(parseObject(change.FullRecordJSON)).toMatchObject({ Description: 'from A', DisplayName: 'from B' });
    });

    it('a provider-wide enforce setting applies to queued updates without per-save options', async () => {
        const created = await newTag(`tg-live-provider-wide-${Date.now()}`);
        const onA = await loadTag(provider, created.ID);
        const onB = await loadTag(secondProvider, created.ID);
        onB.Description = 'from B';
        expect(await onB.Save()).toBe(true);

        provider.ConcurrencyCheck = 'enforce';
        try {
            const group = await provider.CreateTransactionGroup();
            onA.Description = 'from A';
            onA.TransactionGroup = group;
            expect(await onA.Save()).toBe(true);
            expect(await group.Submit()).toBe(false);
        } finally {
            provider.ConcurrencyCheck = 'off';
        }

        expect(onA.LatestResult?.ConcurrencyConflict).toEqual({ ConflictingFields: ['Description'] });
        expect((await storedTag(created.ID))?.Description).toBe('from B');
    });

    it("with checking off, a group still writes only the changed columns, so another server's change survives", async () => {
        const created = await newTag(`tg-live-off-${Date.now()}`);
        const onA = await loadTag(provider, created.ID);
        const onB = await loadTag(secondProvider, created.ID);
        onB.DisplayName = 'from B';
        expect(await onB.Save()).toBe(true);

        const group = await provider.CreateTransactionGroup();
        onA.Description = 'from A';
        onA.TransactionGroup = group;
        expect(await onA.Save()).toBe(true);
        expect(await group.Submit()).toBe(true);

        expect(await storedTag(created.ID)).toEqual({ Description: 'from A', DisplayName: 'from B' });
    });

    it("a group with variables records Record Change snapshots from the stored rows, including the variable's value", async () => {
        const stale = await newTag(`tg-live-vars-stale-${Date.now()}`);
        const onA = await loadTag(provider, stale.ID);
        const onB = await loadTag(secondProvider, stale.ID);
        onB.DisplayName = 'from B';
        expect(await onB.Save()).toBe(true);

        const group = await provider.CreateTransactionGroup();
        const parent = await queuedNewTag(`tg-live-vars-parent-${Date.now()}`, group);
        const child = await provider.GetEntityObject<MJTagEntity>('MJ: Tags', user);
        child.NewRecord();
        child.Name = `tg-live-vars-child-${Date.now()}`;
        child.DisplayName = child.Name;
        child.TransactionGroup = group;
        group.AddVariable(new TransactionVariable('parentID', parent, 'ID', 'Define'));
        group.AddVariable(new TransactionVariable('parentID', child, 'ParentID', 'Use'));
        expect(await child.Save()).toBe(true);
        onA.Description = 'from A';
        onA.TransactionGroup = group;
        expect(await onA.Save(enforce())).toBe(true);

        expect(await group.Submit(), onA.LatestResult?.CompleteMessage).toBe(true);
        createdTagIDs.push(parent.ID, child.ID);

        const staleChange = parseObject((await latestRecordChange(stale.ID)).FullRecordJSON);
        expect(staleChange).toMatchObject({ Description: 'from A', DisplayName: 'from B' });
        const childCreate = await latestRecordChange(child.ID);
        expect(childCreate.Type).toBe('Create');
        expect(String(parseObject(childCreate.FullRecordJSON).ParentID).toUpperCase()).toBe(parent.ID.toUpperCase());
    });
});

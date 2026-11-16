/**
 * Live PostgreSQL checks for field-level concurrency checking inside a TransactionGroup, and for the
 * Record Change snapshots a group's saves write.
 *
 * Two providers with separate connection pools stand in for two servers sharing one database: the
 * second commits a change while the first holds a stale copy of the same row in a group.
 *
 * Env-gated: skipped in ordinary hermetic `pnpm test` runs unless `MJ_TG_CONCURRENCY_LIVE_PG` names
 * a migrated MJ database (connection settings from DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitySaveOptions, SetProvider, TransactionVariable, UserInfo } from '@memberjunction/core';
import type { MJTagEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import { PostgreSQLProviderConfigData } from '../types.js';

const LIVE_DB = process.env.MJ_TG_CONCURRENCY_LIVE_PG;
const describeIfLiveDB = describe.skipIf(!LIVE_DB);

interface RecordChangeRow {
    Type: string;
    ChangesJSON: string;
    FullRecordJSON: string;
}

function configData(): PostgreSQLProviderConfigData {
    return new PostgreSQLProviderConfigData(
        {
            Host: process.env.DB_HOST ?? 'localhost',
            Port: Number(process.env.DB_PORT ?? 5432),
            Database: LIVE_DB ?? '',
            User: process.env.DB_USERNAME ?? 'postgres',
            Password: process.env.DB_PASSWORD ?? '',
        },
        '__mj',
        1,
    );
}

function enforce(): EntitySaveOptions {
    const options = new EntitySaveOptions();
    options.ConcurrencyCheck = 'enforce';
    return options;
}

function parseObject(json: string): Record<string, unknown> {
    return JSON.parse(json) as Record<string, unknown>;
}

describeIfLiveDB('TransactionGroup concurrency checking — live PostgreSQL', () => {
    let provider: PostgreSQLDataProvider;
    let secondProvider: PostgreSQLDataProvider;
    let user: UserInfo;
    const createdTagIDs: string[] = [];

    beforeAll(async () => {
        provider = new PostgreSQLDataProvider();
        await provider.Config(configData());
        SetProvider(provider);
        secondProvider = new PostgreSQLDataProvider();
        await secondProvider.Config(configData());
        await UserCache.Instance.Refresh(provider);
        const found = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive);
        if (!found) {
            throw new Error('No active user in UserCache for the live TransactionGroup test.');
        }
        user = found;
    }, 120000);

    afterAll(async () => {
        if (provider) {
            for (const id of createdTagIDs) {
                await provider.DatabaseConnection.query(`UPDATE __mj."Tag" SET "ParentID" = NULL WHERE "ParentID" = $1`, [id]);
            }
            for (const id of createdTagIDs) {
                await provider.DatabaseConnection.query(`DELETE FROM __mj."Tag" WHERE "ID" = $1`, [id]);
                await provider.DatabaseConnection.query(
                    `DELETE FROM __mj."RecordChange" rc USING __mj."Entity" e WHERE e."ID" = rc."EntityID" AND e."Name" = 'MJ: Tags' AND lower(rc."RecordID") = lower($1)`,
                    [`ID|${id}`],
                );
            }
            await provider.DatabaseConnection.end();
        }
        await secondProvider?.DatabaseConnection.end();
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
    async function queuedNewTag(name: string, group: Awaited<ReturnType<PostgreSQLDataProvider['CreateTransactionGroup']>>): Promise<MJTagEntity> {
        const tag = await provider.GetEntityObject<MJTagEntity>('MJ: Tags', user);
        tag.NewRecord();
        tag.Name = name;
        tag.DisplayName = name;
        tag.TransactionGroup = group;
        expect(await tag.Save()).toBe(true);
        return tag;
    }

    async function loadTag(on: PostgreSQLDataProvider, id: string): Promise<MJTagEntity> {
        const tag = await on.GetEntityObject<MJTagEntity>('MJ: Tags', user);
        expect(await tag.Load(id)).toBe(true);
        return tag;
    }

    async function storedTag(id: string): Promise<{ Description: string | null; DisplayName: string | null } | undefined> {
        const result = await provider.DatabaseConnection.query<{ Description: string | null; DisplayName: string | null }>(
            `SELECT "Description", "DisplayName" FROM __mj."Tag" WHERE "ID" = $1`,
            [id],
        );
        return result.rows[0];
    }

    async function tagNamed(name: string): Promise<number> {
        const result = await provider.DatabaseConnection.query<{ n: string }>(`SELECT COUNT(*) AS n FROM __mj."Tag" WHERE "Name" = $1`, [name]);
        return Number(result.rows[0].n);
    }

    async function latestRecordChange(id: string): Promise<RecordChangeRow> {
        const result = await provider.DatabaseConnection.query<RecordChangeRow>(
            `SELECT rc."Type", rc."ChangesJSON", rc."FullRecordJSON" FROM __mj."RecordChange" rc
             JOIN __mj."Entity" e ON e."ID" = rc."EntityID"
             WHERE e."Name" = 'MJ: Tags' AND lower(rc."RecordID") = lower($1) ORDER BY rc."ChangedAt" DESC LIMIT 1`,
            [`ID|${id}`],
        );
        return result.rows[0];
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
        expect(String(parseObject(childCreate.FullRecordJSON).ParentID).toLowerCase()).toBe(parent.ID.toLowerCase());
    });
});

/**
 * Live SQL Server checks for Record Change snapshots built from the row a save returned.
 *
 * A tracked save's `FullRecordJSON` is rendered in the save's own batch from `@ResultTable`, so it
 * records what the database stored: another writer's committed change to a column this save did not
 * touch, the server-set `__mj_UpdatedAt`, and encrypted columns as ciphertext.
 *
 * Env-gated: skipped in ordinary hermetic `pnpm test` runs unless `MJ_RC_SNAPSHOT_LIVE_DB` names a
 * migrated MJ database (connection settings from DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mssql from 'mssql';
import { EntityInfo, RunView, SetProvider, UserInfo } from '@memberjunction/core';
import type { MJCredentialEntity, MJCredentialTypeEntity, MJTagEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { SQLServerProviderConfigData } from '../types';

const LIVE_DB = process.env.MJ_RC_SNAPSHOT_LIVE_DB;
const describeIfLiveDB = describe.skipIf(!LIVE_DB);

/** What a loaded entity's date serializes to: UTC, milliseconds, `Z`. */
const ISO_MILLIS_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

class LiveSnapshotProvider extends SQLServerDataProvider {
    protected override async HandleEntityActions(): Promise<never[]> {
        return [];
    }

    protected override async HandleEntityAIActions(): Promise<void> {
        // AI actions are not under test here
    }
}

interface RecordChangeRow {
    ID: string;
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

/** Record Changes for one record, newest first. */
async function recordChanges(pool: mssql.ConnectionPool, entityName: string, id: string): Promise<RecordChangeRow[]> {
    const result = await pool
        .request()
        .input('entityName', entityName)
        .input('recordID', `ID|${id}`)
        .query<RecordChangeRow>(
            `SELECT rc.ID, rc.Type, rc.ChangesJSON, rc.FullRecordJSON FROM __mj.RecordChange rc
             JOIN __mj.Entity e ON e.ID = rc.EntityID
             WHERE e.Name = @entityName AND rc.RecordID = @recordID ORDER BY rc.ChangedAt DESC`,
        );
    return result.recordset;
}

function parseObject(json: string): Record<string, unknown> {
    return JSON.parse(json) as Record<string, unknown>;
}

function uuidOf(value: unknown): string {
    return String(value).toUpperCase();
}

describeIfLiveDB('Record Change snapshot built from the returned row — live SQL Server', () => {
    let pool: mssql.ConnectionPool;
    let secondPool: mssql.ConnectionPool;
    let provider: LiveSnapshotProvider;
    let secondProvider: LiveSnapshotProvider;
    let user: UserInfo;
    const createdTagIDs: string[] = [];
    const createdCredentialIDs: string[] = [];

    beforeAll(async () => {
        pool = new mssql.ConnectionPool(poolConfig());
        secondPool = new mssql.ConnectionPool(poolConfig());
        await pool.connect();
        await secondPool.connect();
        provider = new LiveSnapshotProvider();
        await provider.Config(new SQLServerProviderConfigData(pool, '__mj', 0));
        SetProvider(provider);
        secondProvider = new LiveSnapshotProvider();
        await secondProvider.Config(new SQLServerProviderConfigData(secondPool, '__mj', 0, undefined, undefined, false), provider);
        await UserCache.Instance.Refresh(provider);
        const found = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive);
        if (!found) {
            throw new Error('No active user in UserCache for the live Record Change test.');
        }
        user = found;
    }, 120000);

    afterAll(async () => {
        if (pool?.connected) {
            for (const [entityName, ids, table] of [
                ['MJ: Tags', createdTagIDs, '__mj.Tag'],
                ['MJ: Credentials', createdCredentialIDs, '__mj.Credential'],
            ] as const) {
                for (const id of ids) {
                    await pool.request().input('id', id).query(`DELETE FROM ${table} WHERE ID = @id`);
                    await pool
                        .request()
                        .input('recordID', `ID|${id}`)
                        .input('entityName', entityName)
                        .query(`DELETE rc FROM __mj.RecordChange rc JOIN __mj.Entity e ON e.ID = rc.EntityID WHERE e.Name = @entityName AND rc.RecordID = @recordID`);
                }
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

    async function loadTag(on: LiveSnapshotProvider, id: string): Promise<MJTagEntity> {
        const tag = await on.GetEntityObject<MJTagEntity>('MJ: Tags', user);
        expect(await tag.Load(id)).toBe(true);
        return tag;
    }

    it("a create's snapshot holds the server-set values: the stored ID, timestamps and column defaults", async () => {
        const tag = await newTag(`rc-live-create-${Date.now()}`);

        const [create] = await recordChanges(pool, 'MJ: Tags', tag.ID);
        expect(create.Type).toBe('Create');
        const full = parseObject(create.FullRecordJSON);
        expect(uuidOf(full.ID)).toBe(uuidOf(tag.ID));
        expect(full.__mj_CreatedAt).toMatch(ISO_MILLIS_Z);
        expect(full.__mj_CreatedAt).toBe(tag.__mj_CreatedAt.toISOString());
        expect(full.__mj_UpdatedAt).toBe(tag.__mj_UpdatedAt.toISOString());
        // Defaults the INSERT never named are recorded as the database applied them.
        expect(full.Status).toBe(tag.Status);
        expect(full.IsFrozen).toBe(tag.IsFrozen);
    });

    it("a stale writer's snapshot carries another server's committed change and the stored __mj_UpdatedAt", async () => {
        const created = await newTag(`rc-live-stale-${Date.now()}`);
        const onA = await loadTag(provider, created.ID);
        const onB = await loadTag(secondProvider, created.ID); // B loads before A saves

        onA.Description = 'from A';
        expect(await onA.Save(), onA.LatestResult?.CompleteMessage).toBe(true);
        onB.DisplayName = 'from B';
        expect(await onB.Save(), onB.LatestResult?.CompleteMessage).toBe(true);

        const [bUpdate] = await recordChanges(pool, 'MJ: Tags', created.ID);
        expect(bUpdate.Type).toBe('Update');
        expect(Object.keys(parseObject(bUpdate.ChangesJSON))).toEqual(['DisplayName']);
        const full = parseObject(bUpdate.FullRecordJSON);
        expect(full.Description).toBe('from A');
        expect(full.DisplayName).toBe('from B');
        expect(full.__mj_UpdatedAt).toBe(onB.__mj_UpdatedAt.toISOString());
    });

    it("restoring the stale writer's version keeps the other server's change instead of reverting it", async () => {
        const created = await newTag(`rc-live-restore-${Date.now()}`);
        const onA = await loadTag(provider, created.ID);
        const onB = await loadTag(secondProvider, created.ID);
        onA.Description = 'from A';
        expect(await onA.Save()).toBe(true);
        onB.DisplayName = 'from B';
        expect(await onB.Save()).toBe(true);
        const [bUpdate] = await recordChanges(pool, 'MJ: Tags', created.ID);

        const later = await loadTag(provider, created.ID);
        later.Description = 'later';
        later.DisplayName = 'later';
        expect(await later.Save()).toBe(true);

        // Apply the snapshot the way VersionHistory's RestoreEngine does: each writable, non-key,
        // non-timestamp field whose value differs.
        const snapshot = parseObject(bUpdate.FullRecordJSON);
        const target = await loadTag(provider, created.ID);
        for (const field of target.EntityInfo.Fields) {
            if (field.ReadOnly || field.IsPrimaryKey || field.Name.startsWith('__mj_') || !(field.Name in snapshot)) continue;
            const value = snapshot[field.Name];
            if (String(target.Get(field.Name)) !== String(value)) {
                target.Set(field.Name, value);
            }
        }
        target.SetRestoreContext(bUpdate.ID, 'live test restore');
        expect(await target.Save(), target.LatestResult?.CompleteMessage).toBe(true);
        target.ClearRestoreContext();

        const restored = await loadTag(provider, created.ID);
        expect(restored.Description).toBe('from A');
        expect(restored.DisplayName).toBe('from B');
    });

    it('an encrypted column is recorded as its stored ciphertext, never the plaintext the object holds', async () => {
        const rv = new RunView(provider);
        const types = await rv.RunView<MJCredentialTypeEntity>({ EntityName: 'MJ: Credential Types', ExtraFilter: `Name='API Key'`, ResultType: 'entity_object' }, user);
        expect(types.Success && types.Results.length, types.ErrorMessage).toBeTruthy();
        const secret = `rc-live-secret-${Date.now()}`;
        const credential = await provider.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
        credential.NewRecord();
        credential.Name = `rc-live-credential-${Date.now()}`;
        credential.CredentialTypeID = types.Results[0].ID;
        credential.Values = JSON.stringify({ apiKey: secret });
        expect(await credential.Save(), credential.LatestResult?.CompleteMessage).toBe(true);
        createdCredentialIDs.push(credential.ID);
        credential.Description = 'touched';
        expect(await credential.Save(), credential.LatestResult?.CompleteMessage).toBe(true);

        const changes = await recordChanges(pool, 'MJ: Credentials', credential.ID);
        expect(changes.map((c) => c.Type)).toEqual(['Update', 'Create']);
        for (const change of changes) {
            expect(change.FullRecordJSON).not.toContain(secret);
            expect(String(parseObject(change.FullRecordJSON).Values)).toMatch(/^\$ENC\$/);
        }
    });

    it('renders every column kind as a loaded entity serializes it', async () => {
        const fieldRows: Array<[string, string, number, number, number]> = [
            ['ID', 'uniqueidentifier', 16, 0, 0],
            ['RunAt', 'datetime2', 8, 27, 7],
            ['LegacyAt', 'datetime', 8, 23, 3],
            ['RoundedAt', 'smalldatetime', 4, 16, 0],
            ['OffsetAt', 'datetimeoffset', 10, 34, 7],
            ['DueDate', 'date', 3, 10, 0],
            ['StartsAt', 'time', 5, 16, 7],
            ['Big', 'bigint', 8, 19, 0],
            ['Place', 'geography', -1, 0, 0],
            ['Node', 'hierarchyid', 892, 0, 0],
            ['Doc', 'xml', -1, 0, 0],
            ['Blob', 'varbinary', -1, 0, 0],
            ['Flag', 'bit', 1, 1, 0],
            ['Amount', 'decimal', 9, 18, 4],
            ['Label', 'nvarchar', 200, 0, 0],
        ];
        const entityInfo = new EntityInfo({
            ID: '99999999-6489-4000-8000-000000000001', Name: '__RC_SnapshotKinds', SchemaName: 'dbo', BaseTable: 'X', BaseView: 'vwX',
            EntityFields: fieldRows.map(([name, type, length, precision, scale], i) => ({
                ID: `99999999-6489-4000-8000-0000000001${String(i).padStart(2, '0')}`, EntityID: '99999999-6489-4000-8000-000000000001',
                Sequence: i + 1, Name: name, Type: type, Length: length, Precision: precision, Scale: scale, AllowsNull: name !== 'ID',
                IsPrimaryKey: name === 'ID', IsVirtual: false, Status: 'Active',
            })),
        });
        const declare = entityInfo.Fields.map((f) => `[${f.Name}] ${f.SQLFullType} NULL`).join(', ');
        const select = provider['renderResultRowSnapshotSelect'](entityInfo);
        const batch = `
            DECLARE @ResultTable TABLE (${declare});
            INSERT @ResultTable VALUES ('6F9619FF-8B86-D011-B42D-00C04FC964FF', '2026-02-10T16:33:08.9979999', '2026-02-10T16:33:08.997',
                '2026-02-10T16:33:00', '2026-02-10T16:33:08.1200000-05:00', '2026-02-10', '12:34:56.1234567', 9007199254740993,
                geography::Point(47.6, -122.3, 4326), hierarchyid::Parse('/1/2/'), '<a>1</a>', 0x0102, 1, 12.3400, N'O''Brien → ünïcode');
            SELECT (${select}) AS Snapshot;`;
        const result = await pool.request().batch<{ Snapshot: string }>(batch);
        const snapshot = parseObject(result.recordset[0].Snapshot);

        expect(snapshot).toEqual({
            ID: '6F9619FF-8B86-D011-B42D-00C04FC964FF',
            RunAt: '2026-02-10T16:33:08.997Z',
            LegacyAt: '2026-02-10T16:33:08.997Z',
            RoundedAt: '2026-02-10T16:33:00.000Z',
            OffsetAt: '2026-02-10T21:33:08.120Z',
            DueDate: '2026-02-10T00:00:00.000Z',
            StartsAt: '1970-01-01T12:34:56.123Z',
            Big: '9007199254740993',
            Place: 'POINT (-122.3 47.6)',
            Node: '/1/2/',
            Doc: '<a>1</a>',
            Blob: 'AQI=',
            Flag: true,
            Amount: 12.34,
            Label: "O'Brien → ünïcode",
        });
        // The same instants a loaded entity would hold.
        expect(new Date(String(snapshot.OffsetAt)).getTime()).toBe(new Date('2026-02-10T16:33:08.120-05:00').getTime());
    });
});

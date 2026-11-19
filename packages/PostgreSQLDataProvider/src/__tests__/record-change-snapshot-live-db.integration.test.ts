/**
 * Live PostgreSQL checks for Record Change snapshots built from the row a save returned.
 *
 * A tracked save's `FullRecordJSON` is rendered in the save's own statement from `save_result`, so
 * it records what the database stored: another writer's committed change to a column this save did
 * not touch, the server-set `__mj_UpdatedAt`, apostrophes as written (not doubled), and encrypted
 * columns as ciphertext.
 *
 * Env-gated: skipped in ordinary hermetic `pnpm test` runs unless `MJ_RC_SNAPSHOT_LIVE_PG` names a
 * migrated MJ PostgreSQL database (connection settings from DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityInfo, RunView, SetProvider, UserInfo } from '@memberjunction/core';
import type { MJCredentialEntity, MJCredentialTypeEntity, MJTagEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import { PostgreSQLProviderConfigData } from '../types.js';

const LIVE_DB = process.env.MJ_RC_SNAPSHOT_LIVE_PG;
const describeIfLiveDB = describe.skipIf(!LIVE_DB);

/** What a loaded entity's date serializes to: UTC, milliseconds, `Z`. */
const ISO_MILLIS_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface RecordChangeRow {
    ID: string;
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

function parseObject(json: string): Record<string, unknown> {
    return JSON.parse(json) as Record<string, unknown>;
}

describeIfLiveDB('Record Change snapshot built from the returned row — live PostgreSQL', () => {
    let provider: PostgreSQLDataProvider;
    let secondProvider: PostgreSQLDataProvider;
    let user: UserInfo;
    const created: Array<{ entityName: string; table: string; id: string }> = [];

    /** Record Changes for one record, newest first. */
    async function recordChanges(entityName: string, id: string): Promise<RecordChangeRow[]> {
        const result = await provider.DatabaseConnection.query<RecordChangeRow>(
            `SELECT rc."ID", rc."Type", rc."ChangesJSON", rc."FullRecordJSON" FROM __mj."RecordChange" rc
             JOIN __mj."Entity" e ON e."ID" = rc."EntityID"
             WHERE e."Name" = $1 AND lower(rc."RecordID") = lower($2) ORDER BY rc."ChangedAt" DESC`,
            [entityName, `ID|${id}`],
        );
        return result.rows;
    }

    beforeAll(async () => {
        provider = new PostgreSQLDataProvider();
        await provider.Config(configData());
        SetProvider(provider);
        secondProvider = new PostgreSQLDataProvider();
        await secondProvider.Config(configData());
        await UserCache.Instance.Refresh(provider);
        const found = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive);
        if (!found) {
            throw new Error('No active user in UserCache for the live Record Change test.');
        }
        user = found;
    }, 120000);

    afterAll(async () => {
        if (provider) {
            for (const { entityName, table, id } of created) {
                await provider.DatabaseConnection.query(`DELETE FROM ${table} WHERE "ID" = $1`, [id]);
                await provider.DatabaseConnection.query(
                    `DELETE FROM __mj."RecordChange" rc USING __mj."Entity" e WHERE e."ID" = rc."EntityID" AND e."Name" = $1 AND lower(rc."RecordID") = lower($2)`,
                    [entityName, `ID|${id}`],
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
        tag.Description = "it's initial";
        expect(await tag.Save(), tag.LatestResult?.CompleteMessage).toBe(true);
        created.push({ entityName: 'MJ: Tags', table: '__mj."Tag"', id: tag.ID });
        return tag;
    }

    async function loadTag(on: PostgreSQLDataProvider, id: string): Promise<MJTagEntity> {
        const tag = await on.GetEntityObject<MJTagEntity>('MJ: Tags', user);
        expect(await tag.Load(id)).toBe(true);
        return tag;
    }

    it("a create's snapshot holds the server-set values, with apostrophes stored as written", async () => {
        const tag = await newTag(`rc-live-create-${Date.now()}`);

        const [create] = await recordChanges('MJ: Tags', tag.ID);
        expect(create.Type).toBe('Create');
        const full = parseObject(create.FullRecordJSON);
        expect(String(full.ID).toLowerCase()).toBe(tag.ID.toLowerCase());
        expect(full.Description).toBe("it's initial");
        expect(full.__mj_CreatedAt).toMatch(ISO_MILLIS_Z);
        expect(full.__mj_CreatedAt).toBe(tag.__mj_CreatedAt.toISOString());
        expect(full.__mj_UpdatedAt).toBe(tag.__mj_UpdatedAt.toISOString());
        expect(full.Status).toBe(tag.Status);
    });

    it("a stale writer's snapshot carries another server's committed change and the stored __mj_UpdatedAt", async () => {
        const createdTag = await newTag(`rc-live-stale-${Date.now()}`);
        const onA = await loadTag(provider, createdTag.ID);
        const onB = await loadTag(secondProvider, createdTag.ID); // B loads before A saves

        onA.Description = 'from A';
        expect(await onA.Save(), onA.LatestResult?.CompleteMessage).toBe(true);
        onB.DisplayName = "B's name";
        expect(await onB.Save(), onB.LatestResult?.CompleteMessage).toBe(true);

        const [bUpdate] = await recordChanges('MJ: Tags', createdTag.ID);
        expect(bUpdate.Type).toBe('Update');
        expect(Object.keys(parseObject(bUpdate.ChangesJSON))).toEqual(['DisplayName']);
        const full = parseObject(bUpdate.FullRecordJSON);
        expect(full.Description).toBe('from A');
        expect(full.DisplayName).toBe("B's name");
        expect(full.__mj_UpdatedAt).toBe(onB.__mj_UpdatedAt.toISOString());
    });

    it('an encrypted column is recorded as its stored ciphertext, never the plaintext the object holds', async () => {
        const rv = new RunView(provider);
        const types = await rv.RunView<MJCredentialTypeEntity>({ EntityName: 'MJ: Credential Types', ExtraFilter: `"Name"='API Key'`, ResultType: 'entity_object' }, user);
        expect(types.Success && types.Results.length, types.ErrorMessage).toBeTruthy();
        const secret = `rc-live-secret-${Date.now()}`;
        const credential = await provider.GetEntityObject<MJCredentialEntity>('MJ: Credentials', user);
        credential.NewRecord();
        credential.Name = `rc-live-credential-${Date.now()}`;
        credential.CredentialTypeID = types.Results[0].ID;
        credential.Values = JSON.stringify({ apiKey: secret });
        expect(await credential.Save(), credential.LatestResult?.CompleteMessage).toBe(true);
        created.push({ entityName: 'MJ: Credentials', table: '__mj."Credential"', id: credential.ID });
        credential.Description = 'touched';
        expect(await credential.Save(), credential.LatestResult?.CompleteMessage).toBe(true);

        const changes = await recordChanges('MJ: Credentials', credential.ID);
        expect(changes.map((c) => c.Type)).toEqual(['Update', 'Create']);
        for (const change of changes) {
            expect(change.FullRecordJSON).not.toContain(secret);
            expect(String(parseObject(change.FullRecordJSON).Values)).toMatch(/^\$ENC\$/);
        }
    });

    it('renders every column kind as a loaded entity serializes it', async () => {
        const fieldRows: Array<[string, string, string]> = [
            ['ID', 'uniqueidentifier', `'6f9619ff-8b86-d011-b42d-00c04fc964ff'::uuid`],
            ['OffsetAt', 'datetimeoffset', `'2026-02-10 16:33:08.120-05'::timestamptz`],
            ['RunAt', 'datetime2', `'2026-02-10 16:33:08.9979+00'::timestamptz`],
            ['DueDate', 'date', `'2026-02-10'::date`],
            ['StartsAt', 'time', `'12:34:56.1234'::time`],
            ['Big', 'bigint', `9007199254740993::bigint`],
            ['Blob', 'varbinary', `decode('0102', 'hex')`],
            ['Settings', 'jsonb', `'{"a": 1}'::jsonb`],
            ['Flag', 'bit', `true`],
            ['Amount', 'decimal', `12.3400::numeric(18,4)`],
            ['Label', 'nvarchar', `'O''Brien → ünïcode'`],
        ];
        const entityInfo = new EntityInfo({
            ID: '99999999-6489-4000-8000-000000000002', Name: '__RC_SnapshotKinds', SchemaName: 'public', BaseTable: 'x', BaseView: 'vwx',
            EntityFields: fieldRows.map(([name, type], i) => ({
                ID: `99999999-6489-4000-8000-0000000002${String(i).padStart(2, '0')}`, EntityID: '99999999-6489-4000-8000-000000000002',
                Sequence: i + 1, Name: name, Type: type, AllowsNull: name !== 'ID', IsPrimaryKey: name === 'ID', IsVirtual: false, Status: 'Active',
            })),
        });
        const columns = fieldRows.map(([name, , value]) => `${value} AS "${name}"`).join(', ');
        const snapshotSQL = provider['renderResultRowSnapshotSQL'](entityInfo, 'save_result');
        // A non-UTC session must not shift the rendered instants. One client runs both statements,
        // and the zone is reset before it returns to the pool.
        const client = await provider.DatabaseConnection.connect();
        let rows: Array<{ snapshot: string }>;
        try {
            await client.query(`SET TIME ZONE 'America/Chicago'`);
            rows = (await client.query<{ snapshot: string }>(`WITH save_result AS (SELECT ${columns}) SELECT ${snapshotSQL} AS snapshot FROM save_result`)).rows;
        } finally {
            await client.query('RESET TIME ZONE');
            client.release();
        }

        expect(parseObject(rows[0].snapshot)).toEqual({
            ID: '6f9619ff-8b86-d011-b42d-00c04fc964ff',
            OffsetAt: '2026-02-10T21:33:08.120Z',
            RunAt: '2026-02-10T16:33:08.997Z',
            DueDate: '2026-02-10T00:00:00.000Z',
            StartsAt: '1970-01-01T12:34:56.123Z',
            Big: '9007199254740993',
            Blob: 'AQI=',
            Settings: '{"a": 1}',
            Flag: true,
            Amount: 12.34,
            Label: "O'Brien → ünïcode",
        });
    });
});

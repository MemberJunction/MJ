import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { RECORD_ARTIFACT_WORLD, countSeededWorldRecords } from '../world/record-artifact-world.mjs';
import { EntityUserPermissionInfo, RunView, UserInfo } from '../../MJCore/dist/index.js';
import {
    ARTIFACT_PERMISSION_IN_CLAUSE_CHUNK_SIZE,
    ArtifactPermissionEngine,
} from '../../MJCoreEntities/dist/index.js';
import {
    BridgeDocLinksToCitationsAndArtifactUses,
    ConversationUtility,
    FormatMessageCitationAsDocLink,
    RecordCitedArtifactUse,
} from '../../AI/CorePlus/dist/index.js';

const require = createRequire(import.meta.url);

function escapeSql(val) {
    return String(val).replace(/'/g, "''");
}

function sqlLit(val) {
    if (val === null || val === undefined) return 'NULL';
    return `'${escapeSql(val)}'`;
}

function createDbClient() {
    const platform = (process.env.DB_PLATFORM ?? 'sqlserver').trim().toLowerCase();
    const host = process.env.DB_HOST ?? 'localhost';
    const port = Number(process.env.DB_PORT ?? (platform === 'postgresql' ? 5432 : 1433));
    const database = process.env.DB_DATABASE ?? process.env.PG_DATABASE ?? '';
    const user = process.env.DB_USERNAME ?? process.env.PG_USERNAME ?? (platform === 'postgresql' ? 'mj_admin' : 'sa');
    const password = process.env.DB_PASSWORD ?? process.env.PG_PASSWORD ?? '';

    if (platform === 'postgresql') {
        const pg = require('../../PostgreSQLDataProvider/node_modules/pg');
        const pool = new pg.Pool({ host, port, database, user, password });
        return {
            platform: 'postgresql',
            async query(sqlText) {
                const res = await pool.query(sqlText);
                return res.rows ?? [];
            },
            async close() {
                await pool.end();
            },
        };
    }

    const mssql = require('../../SQLServerDataProvider/node_modules/mssql');
    let poolPromise = null;
    const getPool = async () => {
        if (!poolPromise) {
            poolPromise = new mssql.ConnectionPool({
                server: host,
                port,
                database,
                user,
                password,
                options: {
                    encrypt: false,
                    trustServerCertificate: true,
                },
            }).connect();
        }
        return poolPromise;
    };
    return {
        platform: 'sqlserver',
        async query(sqlText) {
            const pool = await getPool();
            const res = await pool.request().query(sqlText);
            return res.recordset ?? [];
        },
        async close() {
            if (poolPromise) {
                const pool = await poolPromise;
                await pool.close();
            }
        },
    };
}

function tbl(platform, name) {
    return platform === 'postgresql' ? `__mj."${name}"` : `[__mj].[${name}]`;
}

function col(platform, name) {
    return platform === 'postgresql' ? `"${name}"` : `[${name}]`;
}

function boolLit(platform, val) {
    if (platform === 'postgresql') return val ? 'TRUE' : 'FALSE';
    return val ? '1' : '0';
}

function quoteFilterCols(platform, filter) {
    if (!filter) return '1=1';
    return filter.replace(
        /(?:\[|"|\b)(ID|Name|EntityID|RecordID|ArtifactID|Role|UserID|DelegateEntityID|DelegateRecordID|ArtifactVersionID)(?:\]|"|\b)(?=\s*(=|IN\b))/g,
        (_match, name) => col(platform, name)
    );
}

export async function runDelegatedSearchAndCitationsCheck(dbOverride = null) {
    const db = dbOverride ?? createDbClient();
    const p = db.platform;
    const assertions = [];
    const createdArtifactUseIds = [];
    const customDelegatedArtifactId = '44000001-7001-4001-8001-000000000099';
    const recordAssertion = (name) => assertions.push(name);

    const cleanup = async () => {
        const raIds = RECORD_ARTIFACT_WORLD.recordArtifacts.map((r) => sqlLit(r.ID)).join(',');
        const verIds = RECORD_ARTIFACT_WORLD.artifactVersions.map((v) => sqlLit(v.ID)).join(',');
        const artIds = [...RECORD_ARTIFACT_WORLD.artifacts.map((a) => a.ID), customDelegatedArtifactId]
            .map((id) => sqlLit(id))
            .join(',');
        const userIds = RECORD_ARTIFACT_WORLD.users.map((u) => sqlLit(u.ID)).join(',');
        const roleIds = RECORD_ARTIFACT_WORLD.roles.map((r) => sqlLit(r.ID)).join(',');
        const compIds = RECORD_ARTIFACT_WORLD.companies.map((c) => sqlLit(c.ID)).join(',');

        const stmts = [
            ...(createdArtifactUseIds.length > 0
                ? [`DELETE FROM ${tbl(p, 'ArtifactUse')} WHERE ${col(p, 'ID')} IN (${createdArtifactUseIds.map((id) => sqlLit(id)).join(',')})`]
                : []),
            `DELETE FROM ${tbl(p, 'ArtifactUse')} WHERE ${col(p, 'ArtifactVersionID')} IN (${verIds})`,
            `DELETE FROM ${tbl(p, 'RecordArtifact')} WHERE ${col(p, 'ID')} IN (${raIds}) OR ${col(p, 'ArtifactID')} IN (${artIds})`,
            `DELETE FROM ${tbl(p, 'ArtifactVersion')} WHERE ${col(p, 'ID')} IN (${verIds})`,
            `DELETE FROM ${tbl(p, 'Artifact')} WHERE ${col(p, 'ID')} IN (${artIds})`,
            `DELETE FROM ${tbl(p, 'EntityPermission')} WHERE ${col(p, 'RoleID')} IN (${roleIds})`,
            `DELETE FROM ${tbl(p, 'UserRole')} WHERE ${col(p, 'UserID')} IN (${userIds})`,
            `DELETE FROM ${tbl(p, 'User')} WHERE ${col(p, 'ID')} IN (${userIds})`,
            `DELETE FROM ${tbl(p, 'Role')} WHERE ${col(p, 'ID')} IN (${roleIds})`,
            `DELETE FROM ${tbl(p, 'Company')} WHERE ${col(p, 'ID')} IN (${compIds})`,
        ];
        for (const s of stmts) {
            try {
                await db.query(s);
            } catch {
                // ignore best-effort cleanup errors
            }
        }
    };

    try {
        await cleanup();

        // 1. Seed full 34-record realistic domain world + 1 custom-delegated artifact
        const entityRows = await db.query(
            `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'Name')} AS "Name" ` +
                `FROM ${tbl(p, 'Entity')} WHERE ${col(p, 'Name')} IN ('MJ: Companies', 'MJ: Users', 'MJ: Artifacts', 'MJ: Artifact Uses')`
        );
        const entityByName = new Map(entityRows.map((r) => [r.Name, r]));
        const companiesEntityId = entityByName.get('MJ: Companies').ID;
        const usersEntityId = entityByName.get('MJ: Users').ID;

        const artTypeRows = await db.query(
            `SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'ArtifactType')} WHERE ${col(p, 'Name')} = 'Markdown Document'`
        );
        const fallbackTypeRows =
            artTypeRows.length > 0
                ? artTypeRows
                : await db.query(
                      p === 'postgresql'
                          ? `SELECT "ID" FROM __mj."ArtifactType" LIMIT 1`
                          : `SELECT TOP 1 [ID] FROM [__mj].[ArtifactType]`
                  );
        assert.ok(fallbackTypeRows.length > 0, 'At least one ArtifactType must exist');
        const artifactTypeId = fallbackTypeRows[0].ID;

        for (const c of RECORD_ARTIFACT_WORLD.companies) {
            await db.query(
                `INSERT INTO ${tbl(p, 'Company')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}, ${col(p, 'Website')}) ` +
                    `VALUES (${sqlLit(c.ID)}, ${sqlLit(c.Name)}, ${sqlLit(c.Description)}, ${sqlLit(c.Website)})`
            );
        }
        for (const r of RECORD_ARTIFACT_WORLD.roles) {
            await db.query(
                `INSERT INTO ${tbl(p, 'Role')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}) ` +
                    `VALUES (${sqlLit(r.ID)}, ${sqlLit(r.Name)}, ${sqlLit(r.Description)})`
            );
            await db.query(
                `INSERT INTO ${tbl(p, 'EntityPermission')} (${col(p, 'EntityID')}, ${col(p, 'RoleID')}, ${col(p, 'CanRead')}, ${col(p, 'CanCreate')}, ${col(p, 'CanUpdate')}, ${col(p, 'CanDelete')}) ` +
                    `VALUES (${sqlLit(companiesEntityId)}, ${sqlLit(r.ID)}, ${boolLit(p, r.CanRead)}, ${boolLit(p, r.CanCreate)}, ${boolLit(p, r.CanUpdate)}, ${boolLit(p, r.CanDelete)})`
            );
        }
        for (const u of RECORD_ARTIFACT_WORLD.users) {
            await db.query(
                `INSERT INTO ${tbl(p, 'User')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'FirstName')}, ${col(p, 'LastName')}, ${col(p, 'Email')}, ${col(p, 'Type')}, ${col(p, 'IsActive')}) ` +
                    `VALUES (${sqlLit(u.ID)}, ${sqlLit(u.Name)}, ${sqlLit(u.FirstName)}, ${sqlLit(u.LastName)}, ${sqlLit(u.Email)}, 'User', ${boolLit(p, true)})`
            );
            if (u.RoleID) {
                await db.query(
                    `INSERT INTO ${tbl(p, 'UserRole')} (${col(p, 'UserID')}, ${col(p, 'RoleID')}) ` +
                        `VALUES (${sqlLit(u.ID)}, ${sqlLit(u.RoleID)})`
                );
            }
        }
        for (const a of RECORD_ARTIFACT_WORLD.artifacts) {
            const delegateEntId = a.DelegateEntityName ? entityByName.get(a.DelegateEntityName).ID : null;
            await db.query(
                `INSERT INTO ${tbl(p, 'Artifact')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}, ${col(p, 'TypeID')}, ${col(p, 'UserID')}, ${col(p, 'DelegateEntityID')}, ${col(p, 'DelegateRecordID')}) ` +
                    `VALUES (${sqlLit(a.ID)}, ${sqlLit(a.Name)}, ${sqlLit(a.Description)}, ${sqlLit(artifactTypeId)}, ${sqlLit(a.OwnerUserID)}, ${sqlLit(delegateEntId)}, ${sqlLit(a.DelegateRecordID)})`
            );
        }
        // Extra artifact delegated to MJ: Users to exercise custom delegate alongside default fallback + standalone in one batch
        await db.query(
            `INSERT INTO ${tbl(p, 'Artifact')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}, ${col(p, 'TypeID')}, ${col(p, 'UserID')}, ${col(p, 'DelegateEntityID')}, ${col(p, 'DelegateRecordID')}) ` +
                `VALUES (${sqlLit(customDelegatedArtifactId)}, 'Elena Coaching Plan (Custom Delegate)', 'Custom delegate test artifact', ${sqlLit(artifactTypeId)}, ${sqlLit(RECORD_ARTIFACT_WORLD.users[0].ID)}, ${sqlLit(usersEntityId)}, ${sqlLit(RECORD_ARTIFACT_WORLD.users[1].ID)})`
        );
        for (const v of RECORD_ARTIFACT_WORLD.artifactVersions) {
            await db.query(
                `INSERT INTO ${tbl(p, 'ArtifactVersion')} (${col(p, 'ID')}, ${col(p, 'ArtifactID')}, ${col(p, 'VersionNumber')}, ${col(p, 'Content')}, ${col(p, 'UserID')}) ` +
                    `VALUES (${sqlLit(v.ID)}, ${sqlLit(v.ArtifactID)}, ${v.VersionNumber}, ${sqlLit(v.Content)}, ${sqlLit(v.UserID)})`
            );
        }
        for (const link of RECORD_ARTIFACT_WORLD.recordArtifacts) {
            const targetEntId = link.EntityName === 'MJ: Companies' ? companiesEntityId : usersEntityId;
            if (link.Role === null) {
                await db.query(
                    `INSERT INTO ${tbl(p, 'RecordArtifact')} (${col(p, 'ID')}, ${col(p, 'EntityID')}, ${col(p, 'RecordID')}, ${col(p, 'ArtifactID')}, ${col(p, 'PinnedArtifactVersionID')}, ${col(p, 'Sequence')}, ${col(p, 'ContextDescription')}, ${col(p, 'LinkedByUserID')}) ` +
                        `VALUES (${sqlLit(link.ID)}, ${sqlLit(targetEntId)}, ${sqlLit(link.RecordID)}, ${sqlLit(link.ArtifactID)}, ${sqlLit(link.PinnedArtifactVersionID)}, ${link.Sequence}, ${sqlLit(link.ContextDescription)}, ${sqlLit(link.LinkedByUserID)})`
                );
            } else {
                await db.query(
                    `INSERT INTO ${tbl(p, 'RecordArtifact')} (${col(p, 'ID')}, ${col(p, 'EntityID')}, ${col(p, 'RecordID')}, ${col(p, 'ArtifactID')}, ${col(p, 'PinnedArtifactVersionID')}, ${col(p, 'Role')}, ${col(p, 'Sequence')}, ${col(p, 'ContextDescription')}, ${col(p, 'LinkedByUserID')}) ` +
                        `VALUES (${sqlLit(link.ID)}, ${sqlLit(targetEntId)}, ${sqlLit(link.RecordID)}, ${sqlLit(link.ArtifactID)}, ${sqlLit(link.PinnedArtifactVersionID)}, ${sqlLit(link.Role)}, ${link.Sequence}, ${sqlLit(link.ContextDescription)}, ${sqlLit(link.LinkedByUserID)})`
                );
            }
        }
        recordAssertion(`world-seeded-${countSeededWorldRecords()}-records`);

        // 2. Build DB-backed provider shim (matching live entity permissions & SQL queries)
        const permRows = await db.query(
            `SELECT ${col(p, 'RoleID')} AS "RoleID", ${col(p, 'CanRead')} AS "CanRead", ${col(p, 'CanUpdate')} AS "CanUpdate", ${col(p, 'CanDelete')} AS "CanDelete" ` +
                `FROM ${tbl(p, 'EntityPermission')} WHERE ${col(p, 'EntityID')} = ${sqlLit(companiesEntityId)}`
        );
        const permByRoleId = new Map(permRows.map((r) => [String(r.RoleID).toLowerCase(), r]));

        const companiesEntityInfo = {
            ID: companiesEntityId,
            Name: 'MJ: Companies',
            PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true }],
            FirstPrimaryKey: { Name: 'ID', IsPrimaryKey: true },
            GetUserPermisions(user) {
                const info = new EntityUserPermissionInfo();
                for (const ur of user?.UserRoles ?? []) {
                    const pr = permByRoleId.get(String(ur.RoleID).toLowerCase());
                    if (pr) {
                        info.CanRead = info.CanRead || Boolean(pr.CanRead);
                        info.CanUpdate = info.CanUpdate || Boolean(pr.CanUpdate);
                        info.CanDelete = info.CanDelete || Boolean(pr.CanDelete);
                    }
                }
                return info;
            },
        };
        const usersEntityInfo = {
            ID: usersEntityId,
            Name: 'MJ: Users',
            PrimaryKeys: [{ Name: 'ID', IsPrimaryKey: true }],
            FirstPrimaryKey: { Name: 'ID', IsPrimaryKey: true },
            GetUserPermisions() {
                const info = new EntityUserPermissionInfo();
                info.CanRead = true;
                return info;
            },
        };

        const entities = [companiesEntityInfo, usersEntityInfo];
        let observedArtifactChunks = 0;

        const liveProvider = {
            ProviderType: 'Network',
            Entities: entities,
            EntityByID: (id) => entities.find((e) => e.ID.toLowerCase() === String(id).toLowerCase()),
            EntityByName: (name) => entities.find((e) => e.Name.toLowerCase() === String(name).toLowerCase()),
            async GetEntityObject(entityName) {
                assert.equal(entityName, 'MJ: Artifact Uses', 'Only MJ: Artifact Uses should use GetEntityObject in this check');
                const state = { ID: '' };
                return {
                    get ID() { return state.ID; },
                    set ID(v) { state.ID = v; },
                    ArtifactVersionID: '',
                    UserID: '',
                    UsageType: 'Viewed',
                    UsageContext: null,
                    LatestResult: { CompleteMessage: '' },
                    NewRecord() {
                        state.ID = crypto.randomUUID();
                    },
                    async Save() {
                        createdArtifactUseIds.push(state.ID);
                        await db.query(
                            `INSERT INTO ${tbl(p, 'ArtifactUse')} (${col(p, 'ID')}, ${col(p, 'ArtifactVersionID')}, ${col(p, 'UserID')}, ${col(p, 'UsageType')}, ${col(p, 'UsageContext')}) ` +
                                `VALUES (${sqlLit(state.ID)}, ${sqlLit(this.ArtifactVersionID)}, ${sqlLit(this.UserID)}, ${sqlLit(this.UsageType)}, ${sqlLit(this.UsageContext)})`
                        );
                        return true;
                    },
                };
            },
            async RunView(params) {
                const where = quoteFilterCols(p, params.ExtraFilter);
                if (params.EntityName === 'MJ: Artifacts') {
                    observedArtifactChunks++;
                    const rows = await db.query(
                        `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'UserID')} AS "UserID", ${col(p, 'DelegateEntityID')} AS "DelegateEntityID", ${col(p, 'DelegateRecordID')} AS "DelegateRecordID" FROM ${tbl(p, 'Artifact')} WHERE ${where}`
                    );
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Companies') {
                    const rows = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'Company')} WHERE ${where}`);
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            },
        };

        const origFromProvider = RunView.FromMetadataProvider;
        RunView.FromMetadataProvider = () => ({
            RunView: (params, ctxUser) => liveProvider.RunView(params, ctxUser),
        });

        // Register a custom delegate on MJ: Users granting access only to the matching user record
        ArtifactPermissionEngine.Instance.RegisterDelegate('MJ: Users', {
            async CanRead(ctx, user) {
                return ctx.DelegateRecordID.toLowerCase() === user.ID.toLowerCase() ? 'Allow' : 'Deny';
            },
            async CanEdit(ctx, user) {
                return ctx.DelegateRecordID.toLowerCase() === user.ID.toLowerCase() ? 'Allow' : 'Deny';
            },
        });

        try {
            const makeUser = (u) =>
                new UserInfo(null, {
                    ID: u.ID,
                    Name: u.Name,
                    Email: u.Email,
                    IsActive: true,
                    Type: 'User',
                    UserRoles: u.RoleID ? [{ RoleID: u.RoleID, Role: '' }] : [],
                });

            const owner = makeUser(RECORD_ARTIFACT_WORLD.users[0]);
            const editor = makeUser(RECORD_ARTIFACT_WORLD.users[1]);
            const reader = makeUser(RECORD_ARTIFACT_WORLD.users[2]);
            const restricted = makeUser(RECORD_ARTIFACT_WORLD.users[3]);

            const [acmeBrief, acmeProposal, northstarSpec, meridianSla, missingHostDoc, standalonePrivate] =
                RECORD_ARTIFACT_WORLD.artifacts;

            const searchHits = [
                { ArtifactID: acmeBrief.ID, Score: 0.98, Label: 'acme-brief' },
                { ArtifactID: customDelegatedArtifactId, Score: 0.96, Label: 'custom-delegate-elena' },
                { ArtifactID: northstarSpec.ID, Score: 0.94, Label: 'northstar-spec' },
                { ArtifactID: missingHostDoc.ID, Score: 0.92, Label: 'missing-host' },
                { ArtifactID: standalonePrivate.ID, Score: 0.90, Label: 'standalone-private' },
                { ArtifactID: acmeProposal.ID, Score: 0.88, Label: 'acme-proposal' },
                { ArtifactID: meridianSla.ID, Score: 0.86, Label: 'meridian-sla' },
            ];

            // 3. Editor (Read+Update on Companies + matches custom delegate on MJ: Users; NOT owner of standalone private)
            const editorRead = await ArtifactPermissionEngine.Instance.FilterArtifactsByPermissionBatch(
                liveProvider,
                searchHits,
                (h) => h.ArtifactID,
                editor
            );
            assert.deepEqual(
                editorRead.Allowed.map((h) => h.Label),
                ['acme-brief', 'custom-delegate-elena', 'northstar-spec', 'acme-proposal', 'meridian-sla']
            );
            assert.deepEqual(
                editorRead.Denied.map((h) => h.Label),
                ['missing-host', 'standalone-private']
            );
            recordAssertion('batch-filter-mixed-custom-fallback-standalone-editor');

            // 4. Reader (Read-only on Companies; denied custom delegate + standalone + missing host; zero Edit allowed)
            const readerRead = await ArtifactPermissionEngine.Instance.FilterArtifactsByPermissionBatch(
                liveProvider,
                searchHits,
                (h) => h.ArtifactID,
                reader
            );
            assert.deepEqual(
                readerRead.Allowed.map((h) => h.Label),
                ['acme-brief', 'northstar-spec', 'acme-proposal', 'meridian-sla']
            );
            const readerEdit = await ArtifactPermissionEngine.Instance.FilterArtifactsByPermissionBatch(
                liveProvider,
                searchHits,
                (h) => h.ArtifactID,
                reader,
                { RequiredAction: 'Edit' }
            );
            assert.equal(readerEdit.AllowedCount, 0, 'Read-only role must have 0 editable artifacts');
            recordAssertion('batch-filter-reader-readonly-and-edit-enforced');

            // 5. Restricted (No-Access role) & Owner (sees standalone private, denied Companies because no role)
            const restrictedRead = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
                liveProvider,
                searchHits.map((h) => h.ArtifactID),
                restricted
            );
            assert.deepEqual(restrictedRead.AllowedIDs, []);

            const ownerRead = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
                liveProvider,
                [standalonePrivate.ID, acmeBrief.ID],
                owner
            );
            assert.deepEqual(ownerRead.AllowedIDs, [standalonePrivate.ID]);
            assert.deepEqual(ownerRead.DeniedIDs, [acmeBrief.ID]);
            recordAssertion('batch-filter-restricted-and-owner-boundaries-verified');

            // 6. Fail closed on null contextUser
            const nullUserRes = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
                liveProvider,
                [acmeBrief.ID, standalonePrivate.ID],
                null
            );
            assert.deepEqual(nullUserRes.AllowedIDs, []);
            assert.equal(nullUserRes.DeniedIDs.length, 2);
            recordAssertion('batch-filter-null-context-user-fails-closed');

            // 7. Chunking verification (> 200 IDs -> 2 bounded chunks on live DB)
            assert.equal(ARTIFACT_PERMISSION_IN_CLAUSE_CHUNK_SIZE, 200);
            const bulkIds = [acmeBrief.ID];
            for (let i = 1; i <= 205; i++) {
                bulkIds.push(`44000099-7001-4001-8001-${String(i).padStart(12, '0')}`);
            }
            observedArtifactChunks = 0;
            const bulkRes = await ArtifactPermissionEngine.Instance.FilterReadableArtifactIDsBatch(
                liveProvider,
                bulkIds,
                editor
            );
            assert.equal(observedArtifactChunks, 2, '206 candidate IDs must split into exactly 2 SQL IN-clause chunks <= 200');
            assert.deepEqual(bulkRes.AllowedIDs, [acmeBrief.ID]);
            recordAssertion('batch-filter-chunks-206-ids-into-2-bounded-queries');

            // 8. Citation unification bridge (DocRecordLink <-> MessageCitation <-> ArtifactUse persisted in DB)
            const acmeCompany = RECORD_ARTIFACT_WORLD.companies[0];
            const acmeBriefV2 = RECORD_ARTIFACT_WORLD.artifactVersions[1];
            const acmeProposalV1 = RECORD_ARTIFACT_WORLD.artifactVersions[2];
            const mentionCompany = ConversationUtility.CreateRecordLink('MJ: Companies', acmeCompany.Name, {
                ID: acmeCompany.ID,
            });
            const conversationMessage = [
                `Reviewed account ${mentionCompany} and [[MJ: Companies|${acmeCompany.ID.toUpperCase()}|${acmeCompany.Name}]].`,
                `Key docs: [[MJ: Artifacts|${acmeBrief.ID}@${acmeBriefV2.ID}|${acmeBrief.Name}]] and [[MJ: Artifacts|${acmeProposal.ID}|${acmeProposal.Name}]].`,
                'Code sample ignored: `[[MJ: Artifacts|44000001-7001-4001-8001-000000000006|Private]]`.',
            ].join(' ');

            const bridged = BridgeDocLinksToCitationsAndArtifactUses(conversationMessage, {
                UserID: editor.ID,
                UsageType: 'Viewed',
                ConversationID: '77000001-7001-4001-8001-000000000001',
                ResolveArtifactVersionID: (link) =>
                    link.ArtifactID?.toLowerCase() === acmeProposal.ID.toLowerCase() ? acmeProposalV1.ID : undefined,
            });

            assert.equal(bridged.Links.length, 3, 'Should deduplicate repeated company link and ignore code span');
            assert.equal(bridged.Citations.length, 3);
            assert.equal(bridged.Citations[0].Kind, 'record');
            assert.equal(bridged.Citations[1].Kind, 'artifact');
            assert.equal(bridged.Citations[2].Kind, 'artifact');
            assert.equal(bridged.ArtifactUses.length, 2);

            // Round-trip format stability check
            const formattedBack = FormatMessageCitationAsDocLink(bridged.Citations[1]);
            assert.equal(
                formattedBack,
                `[[MJ: Artifacts|${acmeBrief.ID}@${acmeBriefV2.ID}|${acmeBrief.Name}]]`
            );
            recordAssertion('citation-bridge-dedup-and-roundtrip-verified');

            // Persist bridged ArtifactUse rows into live [__mj].[ArtifactUse] table and verify read-back
            for (const usePayload of bridged.ArtifactUses) {
                const persisted = await RecordCitedArtifactUse(usePayload, editor, liveProvider);
                assert.equal(persisted.Success, true, `Expected ArtifactUse save to succeed: ${persisted.ErrorMessage}`);
                assert.ok(persisted.ArtifactUseID);
            }
            const persistedRows = await db.query(
                `SELECT ${col(p, 'ArtifactVersionID')} AS "ArtifactVersionID", ${col(p, 'UserID')} AS "UserID", ${col(p, 'UsageType')} AS "UsageType", ${col(p, 'UsageContext')} AS "UsageContext" ` +
                    `FROM ${tbl(p, 'ArtifactUse')} WHERE ${col(p, 'ID')} IN (${createdArtifactUseIds.map((id) => sqlLit(id)).join(',')})`
            );
            assert.equal(persistedRows.length, 2, 'Both cited artifact uses must persist in MJ: Artifact Uses');
            for (const row of persistedRows) {
                assert.equal(row.UsageType, 'Viewed');
                const parsedCtx = JSON.parse(row.UsageContext);
                assert.equal(parsedCtx.Source, 'doc-citation-bridge');
                assert.equal(parsedCtx.ConversationID, '77000001-7001-4001-8001-000000000001');
            }
            recordAssertion('citation-bridge-persisted-and-verified-artifact-uses-in-db');
        } finally {
            ArtifactPermissionEngine.Instance.UnregisterDelegate('MJ: Users');
            RunView.FromMetadataProvider = origFromProvider;
        }

        return {
            check: 'delegated-search-and-citations',
            platform: p,
            passed: true,
            seedRecordCount: countSeededWorldRecords(),
            assertionsPassed: assertions.length,
            assertions,
        };
    } finally {
        await cleanup();
        await db.close();
    }
}

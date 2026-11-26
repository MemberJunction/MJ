import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { RECORD_ARTIFACT_WORLD, countSeededWorldRecords } from '../world/record-artifact-world.mjs';
import { EntityUserPermissionInfo, RunView, UserInfo } from '../../MJCore/dist/index.js';
import { ArtifactPermissionEngine } from '../../MJCoreEntities/dist/index.js';

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

export async function runRecordArtifactPermissionsCheck() {
    const db = createDbClient();
    const p = db.platform;
    const assertions = [];
    const recordAssertion = (name) => assertions.push(name);

    const cleanup = async () => {
        const raIds = RECORD_ARTIFACT_WORLD.recordArtifacts.map((r) => sqlLit(r.ID)).join(',');
        const verIds = RECORD_ARTIFACT_WORLD.artifactVersions.map((v) => sqlLit(v.ID)).join(',');
        const artIds = RECORD_ARTIFACT_WORLD.artifacts.map((a) => sqlLit(a.ID)).join(',');
        const userIds = RECORD_ARTIFACT_WORLD.users.map((u) => sqlLit(u.ID)).join(',');
        const roleIds = RECORD_ARTIFACT_WORLD.roles.map((r) => sqlLit(r.ID)).join(',');
        const compIds = RECORD_ARTIFACT_WORLD.companies.map((c) => sqlLit(c.ID)).join(',');

        const stmts = [
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

        // 1. Verify Entity & Polymorphic FK Metadata (EntityIDFieldName = 'EntityID')
        const entityRows = await db.query(
            `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'Name')} AS "Name", ${col(p, 'BaseTable')} AS "BaseTable", ${col(p, 'BaseView')} AS "BaseView" ` +
                `FROM ${tbl(p, 'Entity')} WHERE ${col(p, 'Name')} IN ('MJ: Record Artifacts', 'MJ: Companies', 'MJ: Users', 'MJ: Artifacts')`
        );
        const entityByName = new Map(entityRows.map((r) => [r.Name, r]));
        assert.ok(entityByName.has('MJ: Record Artifacts'), 'MJ: Record Artifacts entity must exist in metadata');
        assert.equal(entityByName.get('MJ: Record Artifacts').BaseTable, 'RecordArtifact');
        assert.equal(entityByName.get('MJ: Record Artifacts').BaseView, 'vwRecordArtifacts');
        recordAssertion('entity-metadata-registered');

        const recordArtifactEntityId = entityByName.get('MJ: Record Artifacts').ID;
        const companiesEntityId = entityByName.get('MJ: Companies').ID;
        const usersEntityId = entityByName.get('MJ: Users').ID;

        const polyFieldRows = await db.query(
            `SELECT ${col(p, 'Name')} AS "Name", ${col(p, 'EntityIDFieldName')} AS "EntityIDFieldName" ` +
                `FROM ${tbl(p, 'EntityField')} WHERE ${col(p, 'EntityID')} = ${sqlLit(recordArtifactEntityId)} AND ${col(p, 'Name')} = 'RecordID'`
        );
        assert.equal(polyFieldRows.length, 1, 'RecordArtifact.RecordID EntityField must exist');
        assert.equal(
            polyFieldRows[0].EntityIDFieldName,
            'EntityID',
            'RecordArtifact.RecordID must declare EntityIDFieldName = EntityID'
        );
        recordAssertion('polymorphic-fk-entity-id-field-name-verified');

        // Look up an existing ArtifactTypeID to attach seeded Artifacts to
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
        assert.ok(fallbackTypeRows.length > 0, 'At least one ArtifactType must exist in DB');
        const artifactTypeId = fallbackTypeRows[0].ID;

        // 2. Seed real-world multi-entity domain world (34 records)
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

        for (const v of RECORD_ARTIFACT_WORLD.artifactVersions) {
            await db.query(
                `INSERT INTO ${tbl(p, 'ArtifactVersion')} (${col(p, 'ID')}, ${col(p, 'ArtifactID')}, ${col(p, 'VersionNumber')}, ${col(p, 'Content')}, ${col(p, 'UserID')}) ` +
                    `VALUES (${sqlLit(v.ID)}, ${sqlLit(v.ArtifactID)}, ${v.VersionNumber}, ${sqlLit(v.Content)}, ${sqlLit(v.UserID)})`
            );
        }

        for (const link of RECORD_ARTIFACT_WORLD.recordArtifacts) {
            const targetEntId = link.EntityName === 'MJ: Companies' ? companiesEntityId : usersEntityId;
            if (link.Role === null) {
                // Omit Role column to test DB DEFAULT 'General'
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

        // 3. Verify Role defaulted to 'General' and vwRecordArtifacts returns ordered links
        const acmeLinks = await db.query(
            `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'Role')} AS "Role", ${col(p, 'Sequence')} AS "Sequence" ` +
                `FROM ${tbl(p, 'vwRecordArtifacts')} ` +
                `WHERE ${col(p, 'EntityID')} = ${sqlLit(companiesEntityId)} AND ${col(p, 'RecordID')} = ${sqlLit(RECORD_ARTIFACT_WORLD.companies[0].ID)} ` +
                `ORDER BY ${col(p, 'Sequence')} ASC`
        );
        assert.equal(acmeLinks.length, 3, 'Acme Global Ventures must have 3 linked artifacts');
        assert.equal(acmeLinks[0].Role, 'General', 'Omitted Role must default to General');
        assert.equal(acmeLinks[1].Role, 'BoardSnapshot');
        assert.equal(acmeLinks[2].Role, 'Proposal');
        recordAssertion('default-role-general-and-view-ordering');

        // 4. Adversarial uniqueness check: duplicate (EntityID, RecordID, ArtifactID, 'General') MUST fail identically on SS & PG
        let dupFailed = false;
        try {
            await db.query(
                `INSERT INTO ${tbl(p, 'RecordArtifact')} (${col(p, 'EntityID')}, ${col(p, 'RecordID')}, ${col(p, 'ArtifactID')}) ` +
                    `VALUES (${sqlLit(companiesEntityId)}, ${sqlLit(RECORD_ARTIFACT_WORLD.companies[0].ID)}, ${sqlLit(RECORD_ARTIFACT_WORLD.artifacts[0].ID)})`
            );
        } catch {
            dupFailed = true;
        }
        assert.equal(dupFailed, true, 'UQ_RecordArtifact_Record_Artifact_Role must reject duplicate (EntityID, RecordID, ArtifactID, General)');
        recordAssertion('unique-constraint-rejects-duplicate-default-role');

        // 5. Verify live ArtifactPermissionEngine default entity-level fallback backed by real DB queries
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
                const roles = user?.UserRoles ?? [];
                for (const ur of roles) {
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

        const entities = [companiesEntityInfo];
        const liveProvider = {
            ProviderType: 'Network',
            Entities: entities,
            EntityByID: (id) => entities.find((e) => e.ID.toLowerCase() === String(id).toLowerCase()),
            EntityByName: (name) => entities.find((e) => e.Name.toLowerCase() === String(name).toLowerCase()),
            async RunView(params) {
                if (params.EntityName === 'MJ: Artifacts') {
                    const sql = `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'UserID')} AS "UserID", ${col(p, 'DelegateEntityID')} AS "DelegateEntityID", ${col(p, 'DelegateRecordID')} AS "DelegateRecordID" FROM ${tbl(p, 'Artifact')} WHERE ${params.ExtraFilter.replace(/\b(ID|UserID|DelegateEntityID|DelegateRecordID)\b/g, (m) => col(p, m))}`;
                    const rows = await db.query(sql);
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Companies') {
                    const sql = `SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'Company')} WHERE ${params.ExtraFilter.replace(/\bID\b/g, col(p, 'ID'))}`;
                    const rows = await db.query(sql);
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            },
        };
        const origFromProvider = RunView.FromMetadataProvider;
        RunView.FromMetadataProvider = () => ({
            RunView: (params, ctxUser) => liveProvider.RunView(params, ctxUser),
        });

        try {
            const makeUserInfo = (seedUser) =>
                new UserInfo(null, {
                    ID: seedUser.ID,
                    Name: seedUser.Name,
                    Email: seedUser.Email,
                    IsActive: true,
                    Type: 'User',
                    UserRoles: seedUser.RoleID ? [{ RoleID: seedUser.RoleID, Role: '' }] : [],
                });

            const editor = makeUserInfo(RECORD_ARTIFACT_WORLD.users[1]);
            const reader = makeUserInfo(RECORD_ARTIFACT_WORLD.users[2]);
            const restricted = makeUserInfo(RECORD_ARTIFACT_WORLD.users[3]);
            const acmeBriefId = RECORD_ARTIFACT_WORLD.artifacts[0].ID;
            const missingHostArtId = RECORD_ARTIFACT_WORLD.artifacts[4].ID;

            const editorPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(liveProvider, acmeBriefId, editor);
            assert.equal(editorPerms.CanRead, true);
            assert.equal(editorPerms.CanEdit, true);
            assert.equal(editorPerms.CanShare, true);
            assert.equal(editorPerms.Source, 'Delegate');
            recordAssertion('live-fallback-editor-read-update-granted');

            const readerPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(liveProvider, acmeBriefId, reader);
            assert.equal(readerPerms.CanRead, true);
            assert.equal(readerPerms.CanEdit, false);
            assert.equal(readerPerms.CanShare, false);
            assert.equal(readerPerms.Source, 'Delegate');
            recordAssertion('live-fallback-reader-readonly-enforced');

            const restrictedPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(liveProvider, acmeBriefId, restricted);
            assert.equal(restrictedPerms.CanRead, false);
            assert.equal(restrictedPerms.CanEdit, false);
            assert.equal(restrictedPerms.Source, 'Denied');
            recordAssertion('live-fallback-no-permission-denied');

            const missingHostPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(liveProvider, missingHostArtId, editor);
            assert.equal(missingHostPerms.CanRead, false);
            assert.equal(missingHostPerms.Source, 'Denied');
            recordAssertion('live-fallback-missing-host-record-fail-closed');
        } finally {
            RunView.FromMetadataProvider = origFromProvider;
        }

        return {
            check: 'record-artifact-permissions',
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

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { RECORD_ARTIFACT_WORLD, countSeededWorldRecords } from '../world/record-artifact-world.mjs';
import { EntityUserPermissionInfo, RunView, UserInfo } from '../../MJCore/dist/index.js';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    LinkArtifactToRecord,
    PromoteNoteToArtifact,
} from '../../MJCoreEntities/dist/index.js';

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
        /(?:\[|"|\b)(ID|Name|EntityID|RecordID|ArtifactID|Role|UserID|DelegateEntityID|DelegateRecordID)(?:\]|"|\b)(?=\s*(=|IN\b))/g,
        (_match, name) => col(platform, name)
    );
}

export async function runPromoteAndRecordDocsCheck(dbOverride = null) {
    const db = dbOverride ?? createDbClient();
    const p = db.platform;
    const assertions = [];
    const createdArtifactIds = [];
    const recordAssertion = (name) => assertions.push(name);

    const cleanup = async () => {
        const allArtIds = [
            ...RECORD_ARTIFACT_WORLD.artifacts.map((a) => a.ID),
            ...createdArtifactIds,
        ];
        const artIdsSql = allArtIds.map((id) => sqlLit(id)).join(',');
        const raIds = RECORD_ARTIFACT_WORLD.recordArtifacts.map((r) => sqlLit(r.ID)).join(',');
        const verIds = RECORD_ARTIFACT_WORLD.artifactVersions.map((v) => sqlLit(v.ID)).join(',');
        const userIds = RECORD_ARTIFACT_WORLD.users.map((u) => sqlLit(u.ID)).join(',');
        const roleIds = RECORD_ARTIFACT_WORLD.roles.map((r) => sqlLit(r.ID)).join(',');
        const compIds = RECORD_ARTIFACT_WORLD.companies.map((c) => sqlLit(c.ID)).join(',');

        const stmts = [
            `DELETE FROM ${tbl(p, 'RecordArtifact')} WHERE ${col(p, 'ID')} IN (${raIds}) OR ${col(p, 'ArtifactID')} IN (${artIdsSql})`,
            `DELETE FROM ${tbl(p, 'ArtifactVersion')} WHERE ${col(p, 'ID')} IN (${verIds}) OR ${col(p, 'ArtifactID')} IN (${artIdsSql})`,
            `DELETE FROM ${tbl(p, 'Artifact')} WHERE ${col(p, 'ID')} IN (${artIdsSql})`,
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
                // best-effort cleanup
            }
        }
    };

    try {
        await cleanup();

        const entityRows = await db.query(
            `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'Name')} AS "Name" ` +
                `FROM ${tbl(p, 'Entity')} WHERE ${col(p, 'Name')} IN ('MJ: Record Artifacts', 'MJ: Companies', 'MJ: Artifacts')`
        );
        const entityByName = new Map(entityRows.map((r) => [r.Name, r]));
        const companiesEntityId = entityByName.get('MJ: Companies').ID;

        // Seed companies, roles, entity permissions, and users from the shared world
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

        let forceFailNextLinkSave = false;

        const createEntityShim = (entityName) => {
            const state = { ID: '' };
            return {
                get ID() { return state.ID; },
                set ID(v) { state.ID = v; },
                Name: '',
                Description: null,
                TypeID: '',
                UserID: '',
                DelegateEntityID: null,
                DelegateRecordID: null,
                Visibility: 'Always',
                EnvironmentID: null,
                ArtifactID: '',
                VersionNumber: 1,
                Content: '',
                ContentMode: 'Text',
                Comments: null,
                EntityID: '',
                RecordID: '',
                Role: 'General',
                Sequence: 0,
                ContextDescription: null,
                LinkedByUserID: null,
                PinnedArtifactVersionID: null,
                LatestResult: { CompleteMessage: '' },
                NewRecord() {
                    state.ID = crypto.randomUUID();
                },
                async Save() {
                    try {
                        if (entityName === 'MJ: Artifacts') {
                            createdArtifactIds.push(state.ID);
                            await db.query(
                                `INSERT INTO ${tbl(p, 'Artifact')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}, ${col(p, 'TypeID')}, ${col(p, 'UserID')}, ${col(p, 'DelegateEntityID')}, ${col(p, 'DelegateRecordID')}, ${col(p, 'Visibility')}) ` +
                                    `VALUES (${sqlLit(state.ID)}, ${sqlLit(this.Name)}, ${sqlLit(this.Description)}, ${sqlLit(this.TypeID)}, ${sqlLit(this.UserID)}, ${sqlLit(this.DelegateEntityID)}, ${sqlLit(this.DelegateRecordID)}, ${sqlLit(this.Visibility)})`
                            );
                            return true;
                        }
                        if (entityName === 'MJ: Artifact Versions') {
                            await db.query(
                                `INSERT INTO ${tbl(p, 'ArtifactVersion')} (${col(p, 'ID')}, ${col(p, 'ArtifactID')}, ${col(p, 'VersionNumber')}, ${col(p, 'Name')}, ${col(p, 'Content')}, ${col(p, 'ContentMode')}, ${col(p, 'UserID')}) ` +
                                    `VALUES (${sqlLit(state.ID)}, ${sqlLit(this.ArtifactID)}, ${this.VersionNumber}, ${sqlLit(this.Name)}, ${sqlLit(this.Content)}, ${sqlLit(this.ContentMode)}, ${sqlLit(this.UserID)})`
                            );
                            return true;
                        }
                        if (entityName === 'MJ: Record Artifacts') {
                            if (forceFailNextLinkSave) {
                                this.LatestResult = { CompleteMessage: 'Simulated non-collision link failure' };
                                return false;
                            }
                            await db.query(
                                `INSERT INTO ${tbl(p, 'RecordArtifact')} (${col(p, 'ID')}, ${col(p, 'EntityID')}, ${col(p, 'RecordID')}, ${col(p, 'ArtifactID')}, ${col(p, 'PinnedArtifactVersionID')}, ${col(p, 'Role')}, ${col(p, 'Sequence')}, ${col(p, 'ContextDescription')}, ${col(p, 'LinkedByUserID')}) ` +
                                    `VALUES (${sqlLit(state.ID)}, ${sqlLit(this.EntityID)}, ${sqlLit(this.RecordID)}, ${sqlLit(this.ArtifactID)}, ${sqlLit(this.PinnedArtifactVersionID)}, ${sqlLit(this.Role)}, ${this.Sequence}, ${sqlLit(this.ContextDescription)}, ${sqlLit(this.LinkedByUserID)})`
                            );
                            return true;
                        }
                        return false;
                    } catch (err) {
                        this.LatestResult = { CompleteMessage: err instanceof Error ? err.message : String(err) };
                        return false;
                    }
                },
                async Delete() {
                    if (entityName === 'MJ: Artifact Versions') {
                        await db.query(`DELETE FROM ${tbl(p, 'ArtifactVersion')} WHERE ${col(p, 'ID')} = ${sqlLit(state.ID)}`);
                        return true;
                    }
                    if (entityName === 'MJ: Artifacts') {
                        await db.query(`DELETE FROM ${tbl(p, 'Artifact')} WHERE ${col(p, 'ID')} = ${sqlLit(state.ID)}`);
                        return true;
                    }
                    return true;
                },
            };
        };

        const entities = [companiesEntityInfo];
        const liveProvider = {
            ProviderType: 'Network',
            Entities: entities,
            EntityByID: (id) => entities.find((e) => e.ID.toLowerCase() === String(id).toLowerCase()),
            EntityByName: (name) => entities.find((e) => e.Name.toLowerCase() === String(name).toLowerCase()),
            async GetEntityObject(entityName) {
                return createEntityShim(entityName);
            },
            async RunView(params) {
                const where = quoteFilterCols(p, params.ExtraFilter);
                if (params.EntityName === 'MJ: Artifact Types') {
                    const rows = await db.query(
                        `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'Name')} AS "Name" FROM ${tbl(p, 'ArtifactType')} WHERE ${where}`
                    );
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Record Artifacts') {
                    const rows = await db.query(
                        `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'EntityID')} AS "EntityID", ${col(p, 'RecordID')} AS "RecordID", ${col(p, 'ArtifactID')} AS "ArtifactID", ${col(p, 'Role')} AS "Role", ${col(p, 'Sequence')} AS "Sequence" FROM ${tbl(p, 'RecordArtifact')} WHERE ${where}`
                    );
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Artifacts') {
                    const rows = await db.query(
                        `SELECT ${col(p, 'ID')} AS "ID", ${col(p, 'UserID')} AS "UserID", ${col(p, 'DelegateEntityID')} AS "DelegateEntityID", ${col(p, 'DelegateRecordID')} AS "DelegateRecordID" FROM ${tbl(p, 'Artifact')} WHERE ${where}`
                    );
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                if (params.EntityName === 'MJ: Companies') {
                    const rows = await db.query(
                        `SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'Company')} WHERE ${where}`
                    );
                    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '' };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            },
        };

        const origFromProvider = RunView.FromMetadataProvider;
        const origFindType = ArtifactMetadataEngine.Instance.FindArtifactType.bind(ArtifactMetadataEngine.Instance);
        RunView.FromMetadataProvider = () => ({
            RunView: (params, ctxUser) => liveProvider.RunView(params, ctxUser),
        });
        ArtifactMetadataEngine.Instance.FindArtifactType = () => undefined;

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

            const editor = makeUser(RECORD_ARTIFACT_WORLD.users[1]);
            const reader = makeUser(RECORD_ARTIFACT_WORLD.users[2]);
            const restricted = makeUser(RECORD_ARTIFACT_WORLD.users[3]);
            const acmeId = RECORD_ARTIFACT_WORLD.companies[0].ID;

            // 1. Editor promotes a quick note -> creates Artifact + v1 ArtifactVersion + RecordArtifact link
            const promoted = await PromoteNoteToArtifact(
                {
                    Title: 'Acme Live Promoted Note',
                    MarkdownContent: '# Call Recap\n\nPromoted from quick note on live dual-DBMS test.',
                    HostEntityName: 'MJ: Companies',
                    HostRecordID: acmeId,
                    ContextDescription: 'Promoted in integration suite',
                },
                editor,
                liveProvider
            );
            assert.equal(promoted.Success, true, `Expected promotion success, got: ${promoted.ErrorMessage}`);
            assert.ok(promoted.ArtifactID);
            assert.ok(promoted.ArtifactVersionID);
            assert.ok(promoted.RecordArtifactID);
            assert.equal(promoted.VersionNumber, 1);
            assert.equal(promoted.LinkReusedExisting, false);
            recordAssertion('promote-note-persists-artifact-v1-and-record-link');

            // 2. Verify live delegated permission resolution on the newly promoted artifact
            const readerPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                liveProvider,
                promoted.ArtifactID,
                reader
            );
            assert.equal(readerPerms.CanRead, true);
            assert.equal(readerPerms.CanEdit, false);
            assert.equal(readerPerms.Source, 'Delegate');

            const restrictedPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                liveProvider,
                promoted.ArtifactID,
                restricted
            );
            assert.equal(restrictedPerms.CanRead, false);
            assert.equal(restrictedPerms.Source, 'Denied');
            recordAssertion('promoted-artifact-inherits-host-record-delegated-permissions');

            // 3. Read-only user cannot promote a note
            const deniedPromote = await PromoteNoteToArtifact(
                {
                    Title: 'Unauthorized Reader Promotion',
                    MarkdownContent: 'Should be rejected',
                    HostEntityName: 'MJ: Companies',
                    HostRecordID: acmeId,
                },
                reader,
                liveProvider
            );
            assert.equal(deniedPromote.Success, false);
            assert.equal(deniedPromote.ErrorCode, 'PERMISSION_DENIED');
            recordAssertion('readonly-user-blocked-from-promoting-note');

            // 4. Live UQ_RecordArtifact_Record_Artifact_Role idempotent collision handling
            const dupLink = await LinkArtifactToRecord(
                {
                    HostEntityID: companiesEntityId,
                    HostRecordID: acmeId,
                    ArtifactID: promoted.ArtifactID,
                    Role: 'General',
                },
                editor,
                liveProvider
            );
            assert.equal(dupLink.Success, true, `Expected idempotent link reuse, got: ${dupLink.ErrorMessage}`);
            assert.equal(dupLink.ReusedExisting, true);
            assert.equal(String(dupLink.RecordArtifactID).toLowerCase(), String(promoted.RecordArtifactID).toLowerCase());
            recordAssertion('unique-constraint-collision-handled-idempotently');

            // 5. Compensating rollback removes Artifact + v1 Version when RecordArtifact link fails
            forceFailNextLinkSave = true;
            const beforeCountRows = await db.query(
                `SELECT COUNT(*) AS "Cnt" FROM ${tbl(p, 'Artifact')} WHERE ${col(p, 'Name')} = 'Rollback Verification Note'`
            );
            assert.equal(Number(beforeCountRows[0].Cnt), 0);

            const rolledBack = await PromoteNoteToArtifact(
                {
                    Title: 'Rollback Verification Note',
                    MarkdownContent: 'Must roll back cleanly',
                    HostEntityName: 'MJ: Companies',
                    HostRecordID: acmeId,
                },
                editor,
                liveProvider
            );
            forceFailNextLinkSave = false;
            assert.equal(rolledBack.Success, false);
            assert.equal(rolledBack.ErrorCode, 'LINK_SAVE_FAILED');

            const afterCountRows = await db.query(
                `SELECT COUNT(*) AS "Cnt" FROM ${tbl(p, 'Artifact')} WHERE ${col(p, 'Name')} = 'Rollback Verification Note'`
            );
            assert.equal(Number(afterCountRows[0].Cnt), 0, 'Compensating rollback must leave zero orphaned Artifact rows');
            recordAssertion('compensating-rollback-leaves-zero-orphans');
        } finally {
            RunView.FromMetadataProvider = origFromProvider;
            ArtifactMetadataEngine.Instance.FindArtifactType = origFindType;
        }

        return {
            check: 'promote-and-record-docs',
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

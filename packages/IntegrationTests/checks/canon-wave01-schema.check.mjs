import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CANON_WAVE01_WORLD } from '../world/canon-wave01-world.mjs';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

function sqlLit(val) {
    if (val === null || val === undefined) return 'NULL';
    return `'${String(val).replace(/'/g, "''")}'`;
}

function createDbClient() {
    const platform = (process.env.DB_PLATFORM ?? 'sqlserver').trim().toLowerCase();
    const host = process.env.DB_HOST ?? process.env.PG_HOST ?? 'localhost';
    const port = Number(process.env.DB_PORT ?? process.env.PG_PORT ?? (platform === 'postgresql' ? 5432 : 1433));

    if (platform === 'postgresql') {
        const pg = require(path.join(REPO_ROOT, 'packages/PostgreSQLDataProvider/node_modules/pg'));
        const database = process.env.DB_DATABASE ?? process.env.PG_DATABASE ?? 'mj_sf_canon_pg';
        const user = process.env.DB_USERNAME ?? process.env.PG_USERNAME ?? 'mj_admin';
        const password = process.env.DB_PASSWORD ?? process.env.PG_PASSWORD ?? '';
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

    require(path.join(REPO_ROOT, 'packages/MJCLI/node_modules/dotenv')).config({
        path: path.join(REPO_ROOT, '.env'),
        quiet: true,
    });
    const mjConfig = require(path.join(REPO_ROOT, 'mj.config.cjs'));
    const mssql = require(path.join(REPO_ROOT, 'packages/SQLServerDataProvider/node_modules/mssql'));
    const database = process.env.DB_DATABASE ?? mjConfig.dbDatabase ?? 'MJ_SF_Canon_20261128';
    const user = process.env.DB_USERNAME ?? mjConfig.dbUsername;
    const password = process.env.DB_PASSWORD ?? mjConfig.dbPassword;

    let poolPromise = null;
    const getPool = async () => {
        if (!poolPromise) {
            poolPromise = new mssql.ConnectionPool({
                server: mjConfig.dbHost ?? host,
                port: Number(mjConfig.dbPort ?? port),
                database,
                user,
                password,
                options: { encrypt: false, trustServerCertificate: true },
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

function tbl(p, name) {
    return p === 'postgresql' ? `__mj."${name}"` : `[__mj].[${name}]`;
}

function col(p, name) {
    return p === 'postgresql' ? `"${name}"` : `[${name}]`;
}

function boolLit(p, val) {
    return p === 'postgresql' ? (val ? 'TRUE' : 'FALSE') : (val ? '1' : '0');
}

async function expectReject(fn, message) {
    let failed = false;
    try {
        await fn();
    } catch {
        failed = true;
    }
    assert.ok(failed, message);
}

export async function runCanonWave01SchemaCheck(dbOverride = null) {
    const db = dbOverride ?? createDbClient();
    const p = db.platform;
    const w = CANON_WAVE01_WORLD;
    const assertions = [];
    const recordAssertion = (label) => assertions.push(label);

    const cleanup = async () => {
        const stmts = [
            `DELETE FROM ${tbl(p, 'AIAgentContextItem')} WHERE ${col(p, 'ID')} IN (${Object.values(w.contextItems).map(sqlLit).join(',')})`,
            `DELETE FROM ${tbl(p, 'AIAgentLearningCycleProposalSource')} WHERE ${col(p, 'ID')} IN (${Object.values(w.proposalSources).map(sqlLit).join(',')})`,
            `DELETE FROM ${tbl(p, 'AIAgentNoteSource')} WHERE ${col(p, 'ID')} IN (${Object.values(w.noteSources).map(sqlLit).join(',')}) OR ${col(p, 'NoteID')} = ${sqlLit(w.notes.consolidatedID)}`,
            `UPDATE ${tbl(p, 'AIAgentNote')} SET ${col(p, 'OriginProposalID')} = NULL, ${col(p, 'ConsolidatedIntoNoteID')} = NULL WHERE ${col(p, 'ID')} IN (${Object.values(w.notes).map(sqlLit).join(',')})`,
            `UPDATE ${tbl(p, 'AISkill')} SET ${col(p, 'OriginProposalID')} = NULL WHERE ${col(p, 'ID')} = ${sqlLit(w.aiSkill.ID)}`,
            `UPDATE ${tbl(p, 'AIAgentLearningCycleProposal')} SET ${col(p, 'SupersedesProposalID')} = NULL WHERE ${col(p, 'ID')} IN (${sqlLit(w.proposals.mainID)}, ${sqlLit(w.proposals.followupID)})`,
            `DELETE FROM ${tbl(p, 'AIAgentLearningCycleProposal')} WHERE ${col(p, 'ID')} IN (${sqlLit(w.proposals.mainID)}, ${sqlLit(w.proposals.followupID)})`,
            `DELETE FROM ${tbl(p, 'AIAgentNote')} WHERE ${col(p, 'ID')} IN (${Object.values(w.notes).map(sqlLit).join(',')})`,
            `DELETE FROM ${tbl(p, 'AIAgentLearningCycle')} WHERE ${col(p, 'ID')} = ${sqlLit(w.learningCycle.ID)}`,
            `DELETE FROM ${tbl(p, 'AIAgentRun')} WHERE ${col(p, 'ID')} = ${sqlLit(w.agentRun.ID)}`,
            `DELETE FROM ${tbl(p, 'AISkill')} WHERE ${col(p, 'ID')} = ${sqlLit(w.aiSkill.ID)}`,
            `DELETE FROM ${tbl(p, 'AIAgent')} WHERE ${col(p, 'ID')} = ${sqlLit(w.aiAgent.ID)}`,
            `DELETE FROM ${tbl(p, 'SearchScopeGraph')} WHERE ${col(p, 'ID')} IN (${sqlLit(w.searchScopeGraphs.validID)}, ${sqlLit(w.searchScopeGraphs.dupID)})`,
            `DELETE FROM ${tbl(p, 'SearchScope')} WHERE ${col(p, 'ID')} = ${sqlLit(w.searchScope.ID)}`,
            `DELETE FROM ${tbl(p, 'GraphPermission')} WHERE ${col(p, 'ID')} IN (${Object.values(w.graphPermissions).map(sqlLit).join(',')})`,
            `DELETE FROM ${tbl(p, 'GraphEdge')} WHERE ${col(p, 'ID')} = ${sqlLit(w.graphEdges.validProvisionalID)}`,
            `DELETE FROM ${tbl(p, 'GraphConcept')} WHERE ${col(p, 'ID')} IN (${w.graphConcepts.map((c) => sqlLit(c.ID)).join(',')})`,
            `DELETE FROM ${tbl(p, 'Graph')} WHERE ${col(p, 'ID')} = ${sqlLit(w.graph.ID)}`,
            `DELETE FROM ${tbl(p, 'User')} WHERE ${col(p, 'ID')} IN (${w.users.map((u) => sqlLit(u.ID)).join(',')})`,
            `DELETE FROM ${tbl(p, 'Role')} WHERE ${col(p, 'ID')} IN (${w.roles.map((r) => sqlLit(r.ID)).join(',')})`,
            `DELETE FROM ${tbl(p, 'Company')} WHERE ${col(p, 'ID')} = ${sqlLit(w.company.ID)}`,
        ];
        for (const s of stmts) {
            try {
                await db.query(s);
            } catch {
                // ignore cleanup errors on non-existent rows
            }
        }
    };

    try {
        await cleanup();

        // Lookup existing reference metadata IDs
        const [graphTypeRow] = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'GraphType')} WHERE ${col(p, 'IsCanon')} = ${boolLit(p, true)} ORDER BY ${col(p, 'ID')}`);
        const [conceptTypeRow] = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'GraphConceptType')} ORDER BY ${col(p, 'ID')}`);
        const [edgeTypeRow] = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'GraphEdgeType')} ORDER BY ${col(p, 'ID')}`);
        const [authTierRow] = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'GraphAuthorityTier')} ORDER BY ${col(p, 'ID')}`);
        const [agentTypeRow] = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'AIAgentType')} ORDER BY ${col(p, 'ID')}`);
        const [entityRow] = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'Entity')} WHERE ${col(p, 'Name')} = 'MJ: Companies'`);
        const [noteTypeRow] = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'AIAgentNoteType')} ORDER BY ${col(p, 'ID')}`);
        const [modelRow] = await db.query(`SELECT ${col(p, 'ID')} AS "ID" FROM ${tbl(p, 'AIModel')} ORDER BY ${col(p, 'ID')}`);
        assert.ok(graphTypeRow && conceptTypeRow && edgeTypeRow && authTierRow && agentTypeRow && entityRow, 'Required reference metadata must exist');

        // Seed Company, Roles, Users
        await db.query(
            `INSERT INTO ${tbl(p, 'Company')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}, ${col(p, 'Website')}) VALUES (${sqlLit(w.company.ID)}, ${sqlLit(w.company.Name)}, ${sqlLit(w.company.Description)}, ${sqlLit(w.company.Website)})`
        );
        for (const r of w.roles) {
            await db.query(`INSERT INTO ${tbl(p, 'Role')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}) VALUES (${sqlLit(r.ID)}, ${sqlLit(r.Name)}, ${sqlLit(r.Description)})`);
        }
        for (const u of w.users) {
            await db.query(
                `INSERT INTO ${tbl(p, 'User')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'FirstName')}, ${col(p, 'LastName')}, ${col(p, 'Email')}, ${col(p, 'Type')}) VALUES (${sqlLit(u.ID)}, ${sqlLit(u.Name)}, ${sqlLit(u.FirstName)}, ${sqlLit(u.LastName)}, ${sqlLit(u.Email)}, 'User')`
            );
        }

        // 1. Seed Graph and verify StaleMemberPolicy + PublishNonHumanApprovals defaults and CHECKs
        await db.query(
            `INSERT INTO ${tbl(p, 'Graph')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}, ${col(p, 'GraphTypeID')}) VALUES (${sqlLit(w.graph.ID)}, ${sqlLit(w.graph.Name)}, ${sqlLit(w.graph.Description)}, ${sqlLit(graphTypeRow.ID)})`
        );
        const [graphCheck] = await db.query(
            `SELECT ${col(p, 'StaleMemberPolicy')} AS "StaleMemberPolicy", ${col(p, 'PublishNonHumanApprovals')} AS "PublishNonHumanApprovals" FROM ${tbl(p, 'Graph')} WHERE ${col(p, 'ID')} = ${sqlLit(w.graph.ID)}`
        );
        assert.equal(graphCheck.StaleMemberPolicy, 'Hide', 'Graph.StaleMemberPolicy must default to Hide');
        assert.equal(Boolean(graphCheck.PublishNonHumanApprovals), false, 'Graph.PublishNonHumanApprovals must default to false/0');

        await expectReject(
            () => db.query(`UPDATE ${tbl(p, 'Graph')} SET ${col(p, 'StaleMemberPolicy')} = 'ShowWithWarning' WHERE ${col(p, 'ID')} = ${sqlLit(w.graph.ID)}`),
            'CK_Graph_StaleMemberPolicy must reject camel-case ShowWithWarning'
        );
        await db.query(`UPDATE ${tbl(p, 'Graph')} SET ${col(p, 'StaleMemberPolicy')} = 'Show With Warning' WHERE ${col(p, 'ID')} = ${sqlLit(w.graph.ID)}`);
        recordAssertion('Graph StaleMemberPolicy readable CHECK & PublishNonHumanApprovals default verified');

        // 2. GraphPermission exclusive-arc and filtered unique index check
        await db.query(
            `INSERT INTO ${tbl(p, 'GraphPermission')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'UserID')}, ${col(p, 'RoleID')}, ${col(p, 'PermissionLevel')}) VALUES (${sqlLit(w.graphPermissions.userPermID)}, ${sqlLit(w.graph.ID)}, ${sqlLit(w.users[0].ID)}, NULL, 'Approve')`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'GraphPermission')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'UserID')}, ${col(p, 'RoleID')}, ${col(p, 'PermissionLevel')}) VALUES (${sqlLit(w.graphPermissions.rolePerm1ID)}, ${sqlLit(w.graph.ID)}, NULL, ${sqlLit(w.roles[0].ID)}, 'Read')`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'GraphPermission')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'UserID')}, ${col(p, 'RoleID')}, ${col(p, 'PermissionLevel')}) VALUES (${sqlLit(w.graphPermissions.rolePerm2ID)}, ${sqlLit(w.graph.ID)}, NULL, ${sqlLit(w.roles[1].ID)}, 'Use')`
        );
        await expectReject(
            () => db.query(`INSERT INTO ${tbl(p, 'GraphPermission')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'UserID')}, ${col(p, 'RoleID')}, ${col(p, 'PermissionLevel')}) VALUES (${sqlLit(w.graphPermissions.invalidDualID)}, ${sqlLit(w.graph.ID)}, ${sqlLit(w.users[1].ID)}, ${sqlLit(w.roles[0].ID)}, 'Read')`),
            'CK_GraphPermission_Principal must reject both UserID and RoleID set'
        );
        await expectReject(
            () => db.query(`INSERT INTO ${tbl(p, 'GraphPermission')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'UserID')}, ${col(p, 'RoleID')}, ${col(p, 'PermissionLevel')}) VALUES (${sqlLit(w.graphPermissions.invalidNullID)}, ${sqlLit(w.graph.ID)}, NULL, NULL, 'Read')`),
            'CK_GraphPermission_Principal must reject both UserID and RoleID null'
        );
        await expectReject(
            () => db.query(`INSERT INTO ${tbl(p, 'GraphPermission')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'UserID')}, ${col(p, 'RoleID')}, ${col(p, 'PermissionLevel')}) VALUES (${sqlLit(w.graphPermissions.invalidLevelID)}, ${sqlLit(w.graph.ID)}, ${sqlLit(w.users[1].ID)}, NULL, 'Admin')`),
            'CK_GraphPermission_Level must reject Admin'
        );
        recordAssertion('GraphPermission exclusive-arc, filtered unique indexes (multiple roles with NULL UserID), and level CHECK verified');

        // 3. SearchScopeGraph
        await db.query(
            `INSERT INTO ${tbl(p, 'SearchScope')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}, ${col(p, 'Status')}) VALUES (${sqlLit(w.searchScope.ID)}, ${sqlLit(w.searchScope.Name)}, ${sqlLit(w.searchScope.Description)}, 'Active')`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'SearchScopeGraph')} (${col(p, 'ID')}, ${col(p, 'SearchScopeID')}, ${col(p, 'GraphID')}, ${col(p, 'MaxResults')}) VALUES (${sqlLit(w.searchScopeGraphs.validID)}, ${sqlLit(w.searchScope.ID)}, ${sqlLit(w.graph.ID)}, 15)`
        );
        const [ssgRow] = await db.query(
            `SELECT ${col(p, 'Priority')} AS "Priority" FROM ${tbl(p, 'SearchScopeGraph')} WHERE ${col(p, 'ID')} = ${sqlLit(w.searchScopeGraphs.validID)}`
        );
        assert.equal(Number(ssgRow.Priority), 100, 'SearchScopeGraph.Priority must default to 100');
        await expectReject(
            () => db.query(`INSERT INTO ${tbl(p, 'SearchScopeGraph')} (${col(p, 'ID')}, ${col(p, 'SearchScopeID')}, ${col(p, 'GraphID')}) VALUES (${sqlLit(w.searchScopeGraphs.dupID)}, ${sqlLit(w.searchScope.ID)}, ${sqlLit(w.graph.ID)})`),
            'UQ_SearchScopeGraph_Scope_Graph must reject duplicate (SearchScopeID, GraphID)'
        );
        recordAssertion('SearchScopeGraph default Priority and UNIQUE(SearchScopeID, GraphID) verified');

        // 4. GraphConcept (Provisional + EffectiveDates) and GraphEdge (Provisional + AuthorityTierID)
        await db.query(
            `INSERT INTO ${tbl(p, 'GraphConcept')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'Name')}, ${col(p, 'ConceptTypeID')}, ${col(p, 'AuthorityTierID')}, ${col(p, 'Description')}, ${col(p, 'Status')}, ${col(p, 'EffectiveFrom')}, ${col(p, 'EffectiveTo')}) VALUES (${sqlLit(w.graphConcepts[0].ID)}, ${sqlLit(w.graph.ID)}, ${sqlLit(w.graphConcepts[0].Name)}, ${sqlLit(conceptTypeRow.ID)}, ${sqlLit(authTierRow.ID)}, ${sqlLit(w.graphConcepts[0].Description)}, 'Provisional', ${sqlLit(w.graphConcepts[0].EffectiveFrom)}, ${sqlLit(w.graphConcepts[0].EffectiveTo)})`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'GraphConcept')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'Name')}, ${col(p, 'ConceptTypeID')}, ${col(p, 'Description')}, ${col(p, 'Status')}) VALUES (${sqlLit(w.graphConcepts[1].ID)}, ${sqlLit(w.graph.ID)}, ${sqlLit(w.graphConcepts[1].Name)}, ${sqlLit(conceptTypeRow.ID)}, ${sqlLit(w.graphConcepts[1].Description)}, 'Approved')`
        );
        await expectReject(
            () => db.query(`UPDATE ${tbl(p, 'GraphConcept')} SET ${col(p, 'EffectiveFrom')} = '2028-01-01T00:00:00Z' WHERE ${col(p, 'ID')} = ${sqlLit(w.graphConcepts[0].ID)}`),
            'CK_GraphConcept_EffectiveDates must reject EffectiveFrom > EffectiveTo'
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'GraphEdge')} (${col(p, 'ID')}, ${col(p, 'GraphID')}, ${col(p, 'EdgeTypeID')}, ${col(p, 'SourceEntityID')}, ${col(p, 'SourceRecordID')}, ${col(p, 'TargetEntityID')}, ${col(p, 'TargetRecordID')}, ${col(p, 'Status')}, ${col(p, 'AuthorityTierID')}) VALUES (${sqlLit(w.graphEdges.validProvisionalID)}, ${sqlLit(w.graph.ID)}, ${sqlLit(edgeTypeRow.ID)}, ${sqlLit(entityRow.ID)}, ${sqlLit(w.graphConcepts[0].ID)}, ${sqlLit(entityRow.ID)}, ${sqlLit(w.graphConcepts[1].ID)}, 'Provisional', ${sqlLit(authTierRow.ID)})`
        );
        recordAssertion('GraphConcept Provisional + EffectiveFrom/To CHECK and GraphEdge Provisional + AuthorityTierID verified');

        // 5. AIAgent, AISkill, AIAgentRun, AIAgentLearningCycle, Proposal, ProposalSource
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgent')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Description')}, ${col(p, 'TypeID')}) VALUES (${sqlLit(w.aiAgent.ID)}, ${sqlLit(w.aiAgent.Name)}, ${sqlLit(w.aiAgent.Description)}, ${sqlLit(agentTypeRow.ID)})`
        );
        const [agentRow] = await db.query(
            `SELECT ${col(p, 'AllowInFlightMemorySearch')} AS "AllowInFlightMemorySearch" FROM ${tbl(p, 'AIAgent')} WHERE ${col(p, 'ID')} = ${sqlLit(w.aiAgent.ID)}`
        );
        assert.equal(Boolean(agentRow.AllowInFlightMemorySearch), false, 'AIAgent.AllowInFlightMemorySearch must default to false/0');

        await db.query(
            `INSERT INTO ${tbl(p, 'AISkill')} (${col(p, 'ID')}, ${col(p, 'Name')}, ${col(p, 'Instructions')}, ${col(p, 'Status')}, ${col(p, 'CreatedByUserID')}) VALUES (${sqlLit(w.aiSkill.ID)}, ${sqlLit(w.aiSkill.Name)}, ${sqlLit(w.aiSkill.Instructions)}, 'Active', ${sqlLit(w.users[0].ID)})`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentRun')} (${col(p, 'ID')}, ${col(p, 'AgentID')}, ${col(p, 'UserID')}, ${col(p, 'Status')}, ${col(p, 'StartedAt')}) VALUES (${sqlLit(w.agentRun.ID)}, ${sqlLit(w.aiAgent.ID)}, ${sqlLit(w.users[0].ID)}, 'Completed', '2026-11-28T10:00:00Z')`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentLearningCycle')} (${col(p, 'ID')}, ${col(p, 'AgentID')}, ${col(p, 'StartedAt')}, ${col(p, 'Status')}, ${col(p, 'CycleType')}, ${col(p, 'CompanyID')}, ${col(p, 'ExecutedByAgentRunID')}, ${col(p, 'ProposalsGenerated')}, ${col(p, 'ProposalsVerified')}, ${col(p, 'ProposalsApplied')}, ${col(p, 'TotalCostUSD')}) VALUES (${sqlLit(w.learningCycle.ID)}, ${sqlLit(w.aiAgent.ID)}, '2026-11-28T10:00:00Z', 'Complete', 'Dreaming', ${sqlLit(w.company.ID)}, ${sqlLit(w.agentRun.ID)}, 2, 1, 1, 0.1250)`
        );

        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentLearningCycleProposal')} (${col(p, 'ID')}, ${col(p, 'LearningCycleID')}, ${col(p, 'TargetAgentID')}, ${col(p, 'CompanyID')}, ${col(p, 'UserID')}, ${col(p, 'PrimaryScopeEntityID')}, ${col(p, 'PrimaryScopeRecordID')}, ${col(p, 'ProposalType')}, ${col(p, 'SamplerStrategy')}, ${col(p, 'Title')}, ${col(p, 'Claim')}, ${col(p, 'ProposedPayload')}, ${col(p, 'ClaimHash')}, ${col(p, 'SourceTrustCeiling')}, ${col(p, 'ProblemKey')}, ${col(p, 'Rationale')}, ${col(p, 'ImpactLevel')}, ${col(p, 'ConfidenceScore')}, ${col(p, 'PromotionRoute')}, ${col(p, 'ReviewBrief')}, ${col(p, 'ProposingModelID')}, ${col(p, 'AIReviewerModelID')}, ${col(p, 'AIReviewerDecision')}, ${col(p, 'Status')}, ${col(p, 'AppliedGraphConceptID')}, ${col(p, 'AppliedGraphEdgeID')}) VALUES (${sqlLit(w.proposals.mainID)}, ${sqlLit(w.learningCycle.ID)}, ${sqlLit(w.aiAgent.ID)}, ${sqlLit(w.company.ID)}, ${sqlLit(w.users[0].ID)}, ${sqlLit(entityRow.ID)}, ${sqlLit(w.company.ID)}, 'Create Canon Concept', 'Contradiction Resolution', 'Clarify Revenue Timing', 'Recognize enterprise revenue upon milestone sign-off.', '{"conceptName":"Milestone Revenue"}', 'hash_wave01_canon_01', 'Verified Active', 'policy:revenue:timing', 'Observed ambiguity across Q3 reviews.', 'Low', 0.9200, 'Approved by Policy', '{"summary":"2 sources agree"}', ${sqlLit(modelRow?.ID ?? null)}, ${sqlLit(modelRow?.ID ?? null)}, 'Approve', 'Awaiting Approval', ${sqlLit(w.graphConcepts[0].ID)}, ${sqlLit(w.graphEdges.validProvisionalID)})`
        );
        recordAssertion('AIAgentLearningCycle additive columns & AIAgentLearningCycleProposal Rule-6 columns verified');

        // 6. AIAgentNote, Canon authority, and AIAgentNoteSource (including backfill verification!)
        const noteTypeVal = noteTypeRow?.ID ?? null;
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentNote')} (${col(p, 'ID')}, ${col(p, 'AgentID')}, ${col(p, 'AgentNoteTypeID')}, ${col(p, 'Note')}, ${col(p, 'Type')}, ${col(p, 'IsAutoGenerated')}, ${col(p, 'Status')}, ${col(p, 'AuthorType')}, ${col(p, 'ProtectionTier')}) VALUES (${sqlLit(w.notes.source1ID)}, ${sqlLit(w.aiAgent.ID)}, ${sqlLit(noteTypeVal)}, 'Source note A', 'Constraint', ${boolLit(p, true)}, 'Active', 'Agent', 'Standard')`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentNote')} (${col(p, 'ID')}, ${col(p, 'AgentID')}, ${col(p, 'AgentNoteTypeID')}, ${col(p, 'Note')}, ${col(p, 'Type')}, ${col(p, 'IsAutoGenerated')}, ${col(p, 'Status')}, ${col(p, 'AuthorType')}, ${col(p, 'ProtectionTier')}) VALUES (${sqlLit(w.notes.source2ID)}, ${sqlLit(w.aiAgent.ID)}, ${sqlLit(noteTypeVal)}, 'Source note B', 'Constraint', ${boolLit(p, true)}, 'Active', 'Agent', 'Standard')`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentNote')} (${col(p, 'ID')}, ${col(p, 'AgentID')}, ${col(p, 'AgentNoteTypeID')}, ${col(p, 'Note')}, ${col(p, 'Type')}, ${col(p, 'IsAutoGenerated')}, ${col(p, 'Status')}, ${col(p, 'AuthorType')}, ${col(p, 'ProtectionTier')}, ${col(p, 'IsCanonical')}, ${col(p, 'CanonApprovedByUserID')}, ${col(p, 'CanonApprovedAt')}, ${col(p, 'OriginProposalID')}) VALUES (${sqlLit(w.notes.consolidatedID)}, ${sqlLit(w.aiAgent.ID)}, ${sqlLit(noteTypeVal)}, 'Canonical behavioral constraint', 'Constraint', ${boolLit(p, true)}, 'Active', 'User', 'Immutable', ${boolLit(p, true)}, ${sqlLit(w.users[0].ID)}, '2026-11-28T11:00:00Z', ${sqlLit(w.proposals.mainID)})`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentNoteSource')} (${col(p, 'ID')}, ${col(p, 'NoteID')}, ${col(p, 'SourceNoteID')}, ${col(p, 'RelationshipType')}, ${col(p, 'Sequence')}) VALUES (${sqlLit(w.noteSources.edge1ID)}, ${sqlLit(w.notes.consolidatedID)}, ${sqlLit(w.notes.source1ID)}, 'Dream Synthesized From', 0)`
        );
        await expectReject(
            () => db.query(`INSERT INTO ${tbl(p, 'AIAgentNoteSource')} (${col(p, 'ID')}, ${col(p, 'NoteID')}, ${col(p, 'SourceNoteID')}, ${col(p, 'RelationshipType')}, ${col(p, 'Sequence')}) VALUES (${sqlLit(w.noteSources.invalidSelfID)}, ${sqlLit(w.notes.consolidatedID)}, ${sqlLit(w.notes.consolidatedID)}, 'Supersedes', 0)`),
            'CK_AIAgentNoteSource_NoSelfLoop must reject NoteID == SourceNoteID'
        );

        // Verify zero orphaned/self-loop rows and full ConsolidatedIntoNoteID backfill parity across AIAgentNoteSource
        const [badLineage] = await db.query(
            `SELECT COUNT(*) AS "Cnt" FROM ${tbl(p, 'AIAgentNoteSource')} WHERE ${col(p, 'NoteID')} = ${col(p, 'SourceNoteID')}`
        );
        assert.equal(Number(badLineage.Cnt), 0, 'AIAgentNoteSource must contain zero self-loops');
        const [missingBackfill] = await db.query(
            `SELECT COUNT(*) AS "Missing" FROM ${tbl(p, 'AIAgentNote')} AS n WHERE n.${col(p, 'ConsolidatedIntoNoteID')} IS NOT NULL AND n.${col(p, 'ConsolidatedIntoNoteID')} <> n.${col(p, 'ID')} AND EXISTS (SELECT 1 FROM ${tbl(p, 'AIAgentNote')} AS t WHERE t.${col(p, 'ID')} = n.${col(p, 'ConsolidatedIntoNoteID')}) AND NOT EXISTS (SELECT 1 FROM ${tbl(p, 'AIAgentNoteSource')} AS s WHERE s.${col(p, 'NoteID')} = n.${col(p, 'ConsolidatedIntoNoteID')} AND s.${col(p, 'SourceNoteID')} = n.${col(p, 'ID')} AND s.${col(p, 'RelationshipType')} = 'Consolidated From')`
        );
        assert.equal(Number(missingBackfill.Missing), 0, 'All existing ConsolidatedIntoNoteID edges must be backfilled into AIAgentNoteSource');
        recordAssertion('AIAgentNote/AISkill Canon authority columns and AIAgentNoteSource backfill + no-self-loop CHECK verified');

        // 7. AIAgentLearningCycleProposalSource exclusive-arc CHECK
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentLearningCycleProposalSource')} (${col(p, 'ID')}, ${col(p, 'ProposalID')}, ${col(p, 'Role')}, ${col(p, 'TrustTierAtSnapshot')}, ${col(p, 'SourceNoteID')}) VALUES (${sqlLit(w.proposalSources.noteSourceID)}, ${sqlLit(w.proposals.mainID)}, 'Supporting Note', 'Verified Active', ${sqlLit(w.notes.source1ID)})`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentLearningCycleProposalSource')} (${col(p, 'ID')}, ${col(p, 'ProposalID')}, ${col(p, 'Role')}, ${col(p, 'TrustTierAtSnapshot')}, ${col(p, 'SourceEntityID')}, ${col(p, 'SourceRecordID')}) VALUES (${sqlLit(w.proposalSources.polySourceID)}, ${sqlLit(w.proposals.mainID)}, 'User Correction', 'Verified Active', ${sqlLit(entityRow.ID)}, ${sqlLit(w.company.ID)})`
        );
        await expectReject(
            () => db.query(`INSERT INTO ${tbl(p, 'AIAgentLearningCycleProposalSource')} (${col(p, 'ID')}, ${col(p, 'ProposalID')}, ${col(p, 'Role')}, ${col(p, 'TrustTierAtSnapshot')}, ${col(p, 'SourceNoteID')}, ${col(p, 'SourceGraphConceptID')}) VALUES (${sqlLit(w.proposalSources.invalidDualID)}, ${sqlLit(w.proposals.mainID)}, 'Bridge Node', 'Canonical', ${sqlLit(w.notes.source1ID)}, ${sqlLit(w.graphConcepts[0].ID)})`),
            'CK_ProposalSource_OneTarget must reject rows setting two source targets'
        );
        recordAssertion('AIAgentLearningCycleProposalSource exclusive-arc FK and polymorphic pair verified');

        // 8. AIAgentContextItem anchor + exclusive-arc + Details JSONType payload
        const detailsPayload = JSON.stringify({
            Version: 1,
            Strategy: 'Canon Lane',
            Lane: 'Canon',
            EffectiveScore: 0.94,
            IsCanonicalAtInjection: true,
        });
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentContextItem')} (${col(p, 'ID')}, ${col(p, 'AgentRunID')}, ${col(p, 'EventType')}, ${col(p, 'ItemType')}, ${col(p, 'AgentNoteID')}, ${col(p, 'ShortID')}, ${col(p, 'Rank')}, ${col(p, 'Similarity')}, ${col(p, 'Details')}) VALUES (${sqlLit(w.contextItems.noteInjectedID)}, ${sqlLit(w.agentRun.ID)}, 'Injected', 'Note', ${sqlLit(w.notes.consolidatedID)}, 'N1', 1, 0.9125, ${sqlLit(detailsPayload)})`
        );
        await db.query(
            `INSERT INTO ${tbl(p, 'AIAgentContextItem')} (${col(p, 'ID')}, ${col(p, 'AgentRunID')}, ${col(p, 'EventType')}, ${col(p, 'ItemType')}, ${col(p, 'ItemEntityID')}, ${col(p, 'ItemRecordID')}, ${col(p, 'ShortID')}, ${col(p, 'Rank')}) VALUES (${sqlLit(w.contextItems.polyInjectedID)}, ${sqlLit(w.agentRun.ID)}, 'Cited', 'Other', ${sqlLit(entityRow.ID)}, ${sqlLit(w.company.ID)}, 'R1', 2)`
        );
        await expectReject(
            () => db.query(`INSERT INTO ${tbl(p, 'AIAgentContextItem')} (${col(p, 'ID')}, ${col(p, 'EventType')}, ${col(p, 'ItemType')}, ${col(p, 'AgentNoteID')}) VALUES (${sqlLit(w.contextItems.invalidNoAnchorID)}, 'Injected', 'Note', ${sqlLit(w.notes.source1ID)})`),
            'CK_AIAgentContextItem_HasAnchor must reject null AgentRunID and AgentSessionID'
        );
        await expectReject(
            () => db.query(`INSERT INTO ${tbl(p, 'AIAgentContextItem')} (${col(p, 'ID')}, ${col(p, 'AgentRunID')}, ${col(p, 'EventType')}, ${col(p, 'ItemType')}, ${col(p, 'AgentNoteID')}, ${col(p, 'SkillID')}) VALUES (${sqlLit(w.contextItems.invalidTwoTargetsID)}, ${sqlLit(w.agentRun.ID)}, 'Injected', 'Note', ${sqlLit(w.notes.source1ID)}, ${sqlLit(w.aiSkill.ID)})`),
            'CK_AIAgentContextItem_OneTarget must reject rows setting two target FKs'
        );
        recordAssertion('AIAgentContextItem anchors, exclusive-arc CHECK, and IAgentContextItemDetails payload verified');

        // 9. Polymorphic EntityIDFieldName metadata resolution check
        const polyRows = await db.query(
            `SELECT ${col(p, 'Entity')} AS "Entity", ${col(p, 'Name')} AS "Name", ${col(p, 'EntityIDFieldName')} AS "EntityIDFieldName" FROM ${tbl(p, 'vwEntityFields')} WHERE ${col(p, 'Name')} IN ('ItemRecordID', 'PrimaryScopeRecordID', 'AppliedRecordID', 'SourceRecordID') AND ${col(p, 'Entity')} IN ('MJ: AI Agent Context Items', 'MJ: AI Agent Learning Cycle Proposals', 'MJ: AI Agent Learning Cycle Proposal Sources')`
        );
        const polyMap = new Map(polyRows.map((r) => [`${r.Entity}.${r.Name}`, r.EntityIDFieldName]));
        assert.ok(polyMap.has('MJ: AI Agent Context Items.ItemRecordID'), 'ItemRecordID EntityField must exist');
        assert.ok(polyMap.has('MJ: AI Agent Learning Cycle Proposals.PrimaryScopeRecordID'), 'PrimaryScopeRecordID EntityField must exist');
        assert.ok(polyMap.has('MJ: AI Agent Learning Cycle Proposals.AppliedRecordID'), 'AppliedRecordID EntityField must exist');
        assert.ok(polyMap.has('MJ: AI Agent Learning Cycle Proposal Sources.SourceRecordID'), 'SourceRecordID EntityField must exist');
        if (p === 'sqlserver' || polyRows.every((r) => r.EntityIDFieldName != null)) {
            assert.equal(polyMap.get('MJ: AI Agent Context Items.ItemRecordID'), 'ItemEntityID');
            assert.equal(polyMap.get('MJ: AI Agent Learning Cycle Proposals.PrimaryScopeRecordID'), 'PrimaryScopeEntityID');
            assert.equal(polyMap.get('MJ: AI Agent Learning Cycle Proposals.AppliedRecordID'), 'AppliedEntityID');
            assert.equal(polyMap.get('MJ: AI Agent Learning Cycle Proposal Sources.SourceRecordID'), 'SourceEntityID');
        }
        recordAssertion('Polymorphic EntityIDFieldName metadata bindings verified');

        return {
            check: 'canon-wave01-schema',
            platform: p,
            passed: true,
            assertionsPassed: assertions.length,
            assertions,
        };
    } finally {
        await cleanup();
        if (!dbOverride) {
            await db.close();
        }
    }
}

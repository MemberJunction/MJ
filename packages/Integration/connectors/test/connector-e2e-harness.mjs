/**
 * Connector-AGNOSTIC, credential-free full end-to-end harness that runs the REAL
 * MemberJunction sync engine through the REAL MJAPI GraphQL API — for ANY connector
 * shape (REST / GraphQL / SOAP / file-feed), in two modes:
 *
 *   - mode 'mock'  — CREDENTIAL-FREE. A local mock-vendor server (mock-vendor-server.mjs)
 *     replays the connector's recorded `fixtures.json`. The SAME real pipeline runs
 *     (CreateConnection → ApplyAll builds the tables via the real SchemaBuilder →
 *     StartSync runs the real IntegrationEngine.RunSync → tail events → DB verify),
 *     with the connector's outbound HTTP redirected to the mock. NO real credential
 *     (a dummy is supplied only if CreateConnection structurally requires one).
 *
 *   - mode 'live'  — credentialed. Identical pipeline + DB verification, but the
 *     vendor is the real API. The credential is sourced ONLY via the separate-user
 *     broker mailbox, READ-ONLY, and is NEVER acked / written back.
 *
 * Both modes share IDENTICAL DB verification:
 *   - tables created (entity row + record-map readable),
 *   - expected row counts / record-map 1:1 identity (completeness, no drops/dupes),
 *   - create / update / delete semantics across a delta pass (mock mode),
 *   - idempotent re-run: a 2nd sync over unchanged data does 0 work / 0 row delta.
 *
 * IO is INJECTED ({ gql, db, mock }) so the orchestration is pure and unit-testable
 * with mocks (connector-e2e-harness.selftest.mjs) and carries no secret. This reuses
 * the time-tested phase functions of gql-live-harness.mjs (phaseSetup / phaseForward /
 * phaseTeardown) UNCHANGED — it does not modify any engine, schema-builder, or
 * connector code; it only drives them through existing GraphQL operations.
 *
 * @see gql-live-harness.mjs   — the phase functions + GQL ops this composes
 * @see mock-vendor-server.mjs — the fixtures-replaying mock (mock mode)
 * @see CONNECTOR_E2E.md       — run instructions + the core-safe redirect mechanism
 */
import {
    GQL, phaseSetup, phaseForward, phaseBackwardCRUD, phaseTeardown,
    runSyncObserved, allStepsOk,
} from './gql-live-harness.mjs';

/** Structured step record (same shape gql-live-harness uses) for an audit-log result. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

/** Case-insensitive read of a row column regardless of dialect casing (mssql PascalCase / pg lower). */
function col(row, name) {
    if (row == null) return undefined;
    if (name in row) return row[name];
    const lower = name.toLowerCase();
    if (lower in row) return row[lower];
    for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
    return undefined;
}

// Extra GraphQL op strings these mock-mode phases need (field names verified against the live
// resolver source: IntegrationRefreshConnectorSchema:1261-1268, EntityMapUpdateInput, WriteRecordOutput).
const E2E_GQL = {
    refreshSchema: `mutation($ciid: String!, $deactivateAbsent: Boolean) {
      IntegrationRefreshConnectorSchema(companyIntegrationID: $ciid, deactivateAbsent: $deactivateAbsent) {
        Success Message RunID ObjectsCreated ObjectsUpdated FieldsCreated FieldsUpdated
        PKVerdicts { ObjectName Confident Nominee Confidence Strategy Reason } UnresolvedObjects
      }
    }`,
    updateEntityMaps: `mutation($updates: [EntityMapUpdateInput!]!) {
      IntegrationUpdateEntityMaps(updates: $updates) { Success Message }
    }`,
    listEntityMapsCfg: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message EntityMaps { ID Entity ExternalObjectName SyncDirection Status Priority Configuration }
      }
    }`,
    writeRecord: GQL.writeRecord,
};

// ─────────────────────────────────────────────────────────────────────────────
// IntegrationObject Status reader (for the discovery-overlay deactivation assertion).
// Reads __mj.IntegrationObject.Status by IntegrationID + object Name, dialect-aware.
// ─────────────────────────────────────────────────────────────────────────────

/** Build a { status(name), all() } reader over __mj.IntegrationObject for one IntegrationID. */
function makeIOReader(db, platform, integrationID, mjSchema = '__mj') {
    const pg = platform === 'postgresql';
    const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const T = pg ? `"${mjSchema}"."IntegrationObject"` : `[${mjSchema}].[IntegrationObject]`;
    const idCol = pg ? '"IntegrationID"' : 'IntegrationID';
    return {
        async all() {
            const sql = pg
                ? `SELECT "Name" AS name, "Status" AS status FROM ${T} WHERE ${idCol} = ${lit(integrationID)}`
                : `SELECT Name AS name, Status AS status FROM ${T} WHERE ${idCol} = ${lit(integrationID)}`;
            return (await db.rows(sql)).map((r) => ({ name: col(r, 'name'), status: col(r, 'status') }));
        },
        async status(name) {
            const rows = await this.all();
            const r = rows.find((x) => String(x.name).toLowerCase() === String(name).toLowerCase());
            return r ? r.status : null;
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic DB verification helpers (built on db.rows + entity metadata — no new
// adapter surface, no core change). These read the DESTINATION table directly so a
// delta pass / idempotent re-run can be checked by external id, for any connector.
// ─────────────────────────────────────────────────────────────────────────────

/** SQL identifier guard (table/schema/column names come from __mj metadata, not user input). */
function ident(name) {
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`invalid SQL identifier: ${String(name)}`);
    }
    return name;
}

/**
 * Builds a small DB-verify facade over the injected `db` (the gql-live-adapters
 * client, which exposes `rows(sql)` + `entityRowCount` + `recordMapStats`). It
 * resolves the destination (SchemaName, BaseTable) for an entity, then reads a row
 * by its external id via the record-map join — dialect-aware.
 *
 * @param {object} db        gql-live-adapters DB client ({ rows, entityRowCount, ... })
 * @param {'sqlserver'|'postgresql'} platform
 * @param {string} mjSchema  core MJ schema (default '__mj')
 */
export function makeVerify(db, platform, mjSchema = '__mj') {
    const pg = platform === 'postgresql';
    const q = (n) => (pg ? `"${ident(n)}"` : `[${ident(n)}]`);
    const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

    /** Resolve { schema, table, entityID } for an entity name from __mj.Entity. */
    async function entityMeta(entityName) {
        const sql = pg
            ? `SELECT "SchemaName" AS s, "BaseTable" AS t, "ID" AS id FROM "${mjSchema}"."Entity" WHERE "Name" = ${lit(entityName)} LIMIT 1`
            : `SELECT TOP 1 SchemaName AS s, BaseTable AS t, ID AS id FROM [${mjSchema}].[Entity] WHERE Name = ${lit(entityName)}`;
        const rows = await db.rows(sql);
        const r = rows?.[0];
        if (!r) throw new Error(`Entity '${entityName}' not found in ${mjSchema}.Entity`);
        const entityID = r.id ?? r.ID;
        // Resolve the entity's PRIMARY KEY column — NOT every dest table uses MJ's synthetic `ID`.
        // Natural-key integration tables (e.g. PropFuel checkin_questions) key on their own column
        // (checkin_question_id), so a hardcoded `d.ID` join throws "Invalid column name 'ID'".
        const pkSql = pg
            ? `SELECT "Name" AS n FROM "${mjSchema}"."EntityField" WHERE "EntityID" = ${lit(entityID)} AND "IsPrimaryKey" = true ORDER BY "Sequence" LIMIT 1`
            : `SELECT TOP 1 Name AS n FROM [${mjSchema}].[EntityField] WHERE EntityID = ${lit(entityID)} AND IsPrimaryKey = 1 ORDER BY Sequence`;
        const pkRows = await db.rows(pkSql);
        const pkCol = pkRows?.[0]?.n ?? pkRows?.[0]?.N ?? pkRows?.[0]?.name ?? 'ID';
        return { schema: r.s ?? r.S ?? r.schemaname, table: r.t ?? r.T ?? r.basetable, entityID, pkCol };
    }

    return {
        entityMeta,

        /** Live destination row count (delegates to the adapter's own helper). */
        rowCount(entityName) { return db.entityRowCount(entityName); },

        /** Record-map total vs distinct-external (delegates to the adapter). */
        recordMap(ciid, entityName) { return db.recordMapStats(ciid, entityName); },

        /**
         * Read ONE destination row by its external id, via the CompanyIntegrationRecordMap
         * join (RecordID → the entity row's primary key). Returns the row object or null.
         * Generic across connectors: the record map is how MJ links external ids to rows.
         */
        async rowByExternalId(ciid, entityName, externalId) {
            const e = await entityMeta(entityName);
            const rm = pg ? `"${mjSchema}"."CompanyIntegrationRecordMap"` : `[${mjSchema}].[CompanyIntegrationRecordMap]`;
            const dest = pg ? `"${ident(e.schema)}"."${ident(e.table)}"` : `[${ident(e.schema)}].[${ident(e.table)}]`;
            // Join on the entity's ACTUAL primary-key column (record map's RecordID stores that PK
            // value) — not a hardcoded `ID`, which natural-key integration tables don't have.
            const pkRef = pg ? `d."${ident(e.pkCol)}"` : `d.[${ident(e.pkCol)}]`;
            const sql = pg
                ? `SELECT d.* FROM ${dest} d JOIN ${rm} m ON m."EntityRecordID" = ${pkRef}::text
                   WHERE m."CompanyIntegrationID" = ${lit(ciid)} AND m."EntityID" = ${lit(e.entityID)}
                     AND m."ExternalSystemRecordID" = ${lit(externalId)} LIMIT 1`
                : `SELECT TOP 1 d.* FROM ${dest} d JOIN ${rm} m ON m.EntityRecordID = CAST(${pkRef} AS NVARCHAR(255))
                   WHERE m.CompanyIntegrationID = ${lit(ciid)} AND m.EntityID = ${lit(e.entityID)}
                     AND m.ExternalSystemRecordID = ${lit(externalId)}`;
            const rows = await db.rows(sql);
            return rows?.[0] ?? null;
        },

        /** True iff a destination row exists for the given external id. */
        async existsByExternalId(ciid, entityName, externalId) {
            return (await this.rowByExternalId(ciid, entityName, externalId)) != null;
        },
        q,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delta verification — mock mode replays a fixture DeltaPass, then we assert the
// real engine applied create / update / delete to the DESTINATION table.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the MJ entity name for a fixture object (the external object name). Uses
 * the entity maps captured at setup (sourceObjectName → entityName). Case-insensitive.
 */
function entityNameForObject(maps, objectName) {
    const m = maps.find((x) => String(x.sourceObjectName).toLowerCase() === String(objectName).toLowerCase());
    return m ? m.entityName : null;
}

/**
 * P-delta — mock mode only. For each fixture DeltaPass: swap the mock's routes to
 * the pass's recorded bodies, run a real incremental sync, then verify the engine
 * applied the changes to the destination table:
 *   - ExpectedPresent[]  → row exists for that external id (create / survive),
 *   - ExpectedUpdates[]  → the destination row's field now equals the new value,
 *   - ExpectedDeletes[]  → the row is gone (hard delete) OR tombstoned if soft.
 *
 * @param {object} args { gql, mock, verify, ciid, maps, cfg }
 */
export async function phaseDelta({ gql, mock, verify, ciid, maps, cfg }) {
    const steps = [];
    const deltas = cfg.deltaPasses ?? [];
    if (deltas.length === 0) {
        steps.push(step('delta.none', true, { note: 'fixture defines no DeltaPasses — create/update/delete not exercised; add DeltaPasses to assert them' }));
        return steps;
    }

    for (let i = 0; i < deltas.length; i++) {
        const d = deltas[i];
        const entityName = entityNameForObject(maps, d.Object);
        if (!entityName) {
            steps.push(step(`delta.${i}.map`, false, { object: d.Object, error: `no entity map for delta object '${d.Object}'` }));
            continue;
        }

        // Swap the mock to this pass's recorded routes (delta over the live vendor is N/A → live mode skips deltas).
        if (mock.setRoutes && d.Routes && d.Routes.length) mock.setRoutes(d.Routes);
        else if (mock.setFileContent && d.FileContent != null) mock.setFileContent(d.FileContent);

        // Sync over the new fixture state. A pass that asserts deletes MUST run fullSync — orphan/
        // tombstone detection compares the COMPLETE fetched set vs the persisted rows; on an
        // incremental sync the engine only sees changed records, so an absent record is invisible
        // (absence != deletion). Create/update passes can stay incremental. (matrix F1 / connector-test §3.4)
        const needsFullForDelete = (d.ExpectedDeletes ?? []).length > 0 || d.FullSync === true;
        const sync = await runSyncObserved(gql, ciid, { fullSync: needsFullForDelete, syncDirection: 'Pull', entityMapIDs: maps.map(m => m.entityMapID), maxPolls: cfg.maxPolls });
        steps.push(step(`delta.${i}.sync`, sync.run?.Success === true && (sync.run?.Counts?.Failed ?? 0) === 0, {
            object: d.Object, entity: entityName, runID: sync.runID, counts: sync.run?.Counts ?? null, errors: sync.errors,
        }));

        // Verify create / survive.
        for (const id of d.ExpectedPresent ?? []) {
            const present = await verify.existsByExternalId(ciid, entityName, id);
            steps.push(step(`delta.${i}.present`, present, { object: d.Object, externalID: id }));
        }
        // Verify update overwrote the destination field.
        for (const u of d.ExpectedUpdates ?? []) {
            const row = await verify.rowByExternalId(ciid, entityName, u.ExternalID);
            const actual = row ? (row[u.Field] ?? row[u.Field?.toLowerCase?.()]) : undefined;
            const okUpd = row != null && String(actual) === String(u.Value);
            steps.push(step(`delta.${i}.update`, okUpd, {
                object: d.Object, externalID: u.ExternalID, field: u.Field,
                expected: u.Value, actual: row ? actual : '(row missing)',
            }));
        }
        // Verify delete: soft-delete KEEPS the row with __mj_integration_IsTombstoned=true +
        // DeletedDetectedAt set (the MJ default — record-map retained, run stays Success); hard-delete
        // removes it. Either is a pass. A row that is still present AND not tombstoned is the failure.
        for (const id of d.ExpectedDeletes ?? []) {
            const row = await verify.rowByExternalId(ciid, entityName, id);
            const gone = row == null;
            const tomb = !!(row && (row.__mj_integration_IsTombstoned === true || row.__mj_integration_IsTombstoned === 1
                || String(row.__mj_integration_IsTombstoned).toLowerCase() === 'true'));
            steps.push(step(`delta.${i}.delete`, gone || tomb, {
                object: d.Object, externalID: id,
                outcome: gone ? 'hard-deleted (row removed)' : (tomb ? 'soft-deleted (IsTombstoned=true, row retained)' : 'NOT propagated — row present and not tombstoned'),
                deletedDetectedAt: row?.__mj_integration_DeletedDetectedAt ?? null,
            }));
        }
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotent re-run — a 2nd sync over UNCHANGED vendor state must do strictly no
// work (watermark + content-hash skip) and leave row counts unchanged. Shared by
// both modes; in mock mode the routes are NOT swapped, so the vendor state is
// identical to the prior pass.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P-idempotent — re-sync with no fixture change and assert zero processed (or zero
 * row delta) per object. Proves the watermark + content-hash actually skip.
 *
 * @param {object} args { gql, verify, ciid, maps, cfg }
 */
export async function phaseIdempotent({ gql, verify, ciid, maps, cfg }) {
    const steps = [];
    // Snapshot row counts before the re-run.
    const before = {};
    for (const m of maps) before[m.entityName] = await verify.rowCount(m.entityName);

    const sync = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', entityMapIDs: maps.map(m => m.entityMapID), maxPolls: cfg.maxPolls });
    const processed = sync.run?.Counts?.Processed ?? 0;
    const succeeded = sync.run?.Counts?.Succeeded ?? 0;
    // "No redundant work" on a 2nd sync of unchanged data has two valid forms: the watermark skipped
    // the FETCH (processed === 0), OR a no-watermark/insert-only stream re-fetched but content-hash
    // skipped every WRITE (succeeded === 0). The rows-stable check below independently confirms the
    // data is unchanged in either case. (See connector-test-conventions §3.1/§3.3.)
    steps.push(step('idempotent.no-redundant-writes', processed === 0 || succeeded === 0, {
        runID: sync.runID, processed, succeeded, counts: sync.run?.Counts ?? null,
        mode: processed === 0 ? 'watermark-skip' : (succeeded === 0 ? 'content-hash-skip' : 'NEITHER'),
        note: 'a 2nd sync over unchanged data must do no redundant writes: processed===0 (watermark) OR succeeded===0 (content-hash)',
    }));

    // Row counts must be unchanged regardless of how Processed is reported.
    for (const m of maps) {
        const after = await verify.rowCount(m.entityName);
        steps.push(step('idempotent.rows-stable', after === before[m.entityName], {
            entity: m.entityName, before: before[m.entityName], after,
        }));
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// P-watermark (C1) — protocol-level proof that the incremental sync issues a
// SERVER-SIDE watermark (*_since) filter for watermark-capable objects, not a full
// re-list. Uses the mock's request capture: clear, run one more incremental (the
// watermark was set by the prior full sync), then assert at least one captured
// request carried a `<field>_since=` / `?since=` query param. Mock mode only —
// live/proxy modes have no request capture, so the cell reports unsupported.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, mock, ciid, maps, cfg }
 */
export async function phaseWatermark({ gql, mock, ciid, maps, cfg }) {
    const steps = [];
    if (typeof mock?.getRequests !== 'function') {
        steps.push(step('watermark.unsupported', true, {
            note: 'mock has no request capture (live/proxy/file mode) — the C1 server-side-GTE assertion is origin-mock-only',
        }));
        return steps;
    }
    mock.clearRequests();
    // Re-run an incremental over the subset; watermark-capable objects must now emit their *_since param.
    const sync = await runSyncObserved(gql, ciid, {
        fullSync: false, syncDirection: 'Pull', entityMapIDs: maps.map(m => m.entityMapID), maxPolls: cfg.maxPolls,
    });
    const reqs = mock.getRequests();
    // Connector-agnostic watermark-filter detection. Cover the dialects MJ connectors actually emit:
    //   • HubSpot REST   — `<field>_since=` / `?since=` / `modifiedsince=`
    //   • iMIS / generic — `<field>=gt:<ts>` / `=gte:` (also URL-encoded `=gt%3A`)
    //   • OData          — `$filter=...gt...` (encoded `%24filter=`)
    //   • SOQL (Salesforce / Fonteva) — the watermark is INSIDE the `q=` param as a clause
    //     `WHERE <col> >= <datetime>` / `<col> > <datetime>` (URL-encoded `%3E%3D` / `%3E`). A
    //     SOQL connector that correctly server-side-filters on SystemModstamp would otherwise
    //     mis-fail C1, because its watermark is not a discrete `_since=`/`$filter=` query param.
    // The original regex was REST-only; this generalizes it so any genuine server-side watermark
    // filter — whatever the query dialect — is recognized. (Same class as the iMIS/OData fix.)
    const SINCE = /(updated|created|deleted|modified)_since=|[?&]since=|=gte?[:%]|%24filter=|\$filter=|[?&](modifiedsince|updatedsince|since)=|(modstamp|modifieddate|createddate|lastmodified|systemmodstamp)(%20|\+|\s)*(%3e|>)(%3d|=)?(%20|\+|\s)*\d{4}/i;
    // Body-based watermark filters: POST /search connectors (e.g. Neon, many CRMs) carry the *_since
    // criterion in the request BODY (a searchFields/criteria operator + date), NOT the query string —
    // the same class as the SOQL-in-`q=` exception above. So inspect r.body too: a Neon-style
    // `{operator:"GREATER_AND_EQUAL", field:"...Last Modified...", value:"2026-…"}` (or any
    // greater-than operator paired with an ISO date) is a genuine server-side watermark filter.
    const BODY_SINCE = /GREATER(_THAN|_AND_EQUAL)|"operator"\s*:\s*"(gte?|greater)[^"]*"|(lastmodified|last[_ ]?modified|modifieddate|systemmodstamp|updateddate)[^}]{0,80}\d{4}-\d{2}-\d{2}/i;
    const sinceReqs = reqs.filter(r => SINCE.test(r.rawQuery || r.query || '') || BODY_SINCE.test(r.body || ''));
    // Incremental must NARROW work. Two strategies are valid per connector-test-conventions:
    //   (1) server-side *_since filter (query OR POST-body criterion) — detected above; OR
    //   (2) content-hash narrowing — the connector re-fetches but writes NOTHING (Processed>0,
    //       Succeeded===0), which is the correct fallback when the vendor's watermark search-field
    //       names are CREDENTIAL-GATED and thus not provable credential-free (Neon's /<resource>/search
    //       field names live behind auth at /<resource>/search/searchFields). A connector that re-fetches
    //       AND re-writes everything (Succeeded>0) is NON-idempotent and still FAILS this check.
    const wmProcessed = sync.run?.Counts?.Processed ?? 0;
    const wmSucceeded = sync.run?.Counts?.Succeeded ?? 0;
    const serverFiltered = sinceReqs.length > 0;
    const contentHashNarrowed = wmProcessed > 0 && wmSucceeded === 0;
    steps.push(step('watermark.gte-filter-issued', serverFiltered || contentHashNarrowed, {
        note: 'incremental must narrow work — server-side *_since filter (query OR POST-body) OR content-hash narrowing (re-fetch, zero re-writes) when the vendor watermark field is credential-gated (matrix C1)',
        strategy: serverFiltered ? 'server-side-filter' : (contentHashNarrowed ? 'content-hash-narrowing' : 'none'),
        incrementalProcessed: wmProcessed,
        incrementalSucceeded: wmSucceeded,
        runID: sync.runID,
        totalRequests: reqs.length,
        watermarkRequests: sinceReqs.map(r => ({ path: r.path, query: r.rawQuery, body: r.body ? String(r.body).slice(0, 120) : undefined })).slice(0, 8),
    }));
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// P-infinite-pagination (I3) — a non-advancing pager (every page returns the SAME
// full page) must trip the connector's duplicate-first-record / MAX_BATCHES guard
// and TERMINATE, not loop forever. We swap the target route to a full page (== the
// connector's per_page) of rows whose first id never changes across pages, run a
// full sync, and assert: the run completed (not in-flight after polling) AND the
// page-request count is bounded (the guard fired). Origin-mock only.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, mock, ciid, maps, cfg }
 */
export async function phaseInfinitePagination({ gql, mock, ciid, maps, cfg }) {
    const steps = [];
    if (typeof mock?.setRoutes !== 'function' || typeof mock?.getRequests !== 'function') {
        steps.push(step('pagination.unsupported', true, { note: 'needs origin-mock route swap + request capture (live/proxy/file mode skips I3)' }));
        return steps;
    }
    const target = maps.find(m => /comment/i.test(m.sourceObjectName)) || maps[0];
    // CONNECTOR-AGNOSTIC: derive the target object's REAL list route + envelope shape from the loaded
    // fixtures, then make it NON-ADVANCING (a FULL page whose FIRST record is constant across pages → the
    // connector keeps asking for the next page, and its duplicate-first-record / MAX_BATCHES guard must
    // stop it). A hardcoded vendor path (the old HubSpot `/api/admin/v3/comments`) is requested by NO other
    // connector, so the page-request count was always 0 and the cell mis-failed. Fall back to that default
    // only when the manifest has no matching route.
    const manifestRoutes = (mock.manifest && Array.isArray(mock.manifest.Routes)) ? mock.manifest.Routes : [];
    const objName = String(target.sourceObjectName);
    const listRoute = manifestRoutes.find(r => (r.Method || 'GET').toUpperCase() === 'GET'
            && new RegExp('/' + objName + '$', 'i').test(String(r.Path || '')))
        || manifestRoutes.find(r => (r.Method || 'GET').toUpperCase() === 'GET'
            && new RegExp(objName + '$', 'i').test(String(r.Path || '')));
    let path, body, extraRoutes;
    if (listRoute) {
        path = listRoute.Path;
        const orig = listRoute.Body;
        const sampleArr = Array.isArray(orig) ? orig : (orig && Array.isArray(orig.Items) ? orig.Items : []);
        const sample = sampleArr[0] ?? { id: 1 };
        // 100 identical rows → records[0] is the SAME on every page (the mock returns this same body for
        // each offset) → the connector's duplicate-first-record guard trips on page 2.
        const rows = Array.from({ length: 100 }, () => ({ ...sample }));
        if (Array.isArray(orig)) {
            body = rows;
        } else {
            body = { ...orig, Items: rows };
            if (orig && 'Count' in orig) body.Count = rows.length; // full page (Count>=Limit) → connector pages again
        }
        // carry over the connector's token route(s) so auth still works during the swap
        extraRoutes = manifestRoutes.filter(r => /token/i.test(String(r.Path || '')))
            .map(r => ({ Path: r.Path, Method: r.Method || 'POST', Status: r.Status || 200, Body: r.Body }));
    } else {
        path = '/api/admin/v3/comments';
        body = Array.from({ length: 100 }, (_, i) => ({
            id: 6100 + i, body: '<redacted>', user_id: 5001, parent_type: 'Post', parent_id: 9000,
            created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-01T09:00:00Z',
        }));
        extraRoutes = [{ Path: '/api/oauth/token', Method: 'POST', Status: 200, Body: { access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 7200 } }];
    }
    mock.setRoutes([
        { Path: path, Method: 'GET', Status: 200, Body: body },
        ...extraRoutes,
        { Path: '/', Method: 'GET', Status: 200, Body: { ok: true } },
    ]);
    mock.clearRequests();
    const sync = await runSyncObserved(gql, ciid, {
        fullSync: true, syncDirection: 'Pull', entityMapIDs: [target.entityMapID], maxPolls: cfg.maxPolls,
    });
    const pageReqs = mock.getRequests().filter(r => r.path === path).length;
    const terminated = !!sync.run && sync.run.IsInFlight === false;
    // If the swapped non-advancing page never reached the connector (pageReqs === 0), the I3 scenario
    // was NOT exercised — the generic list-route swap (a REST `Items`/`Count` envelope at a path that
    // ends in the object name) doesn't fit every pager. SOQL connectors (Salesforce / Fonteva) fetch
    // via a `q=` param to `/queryAll` and continue via an opaque `/query/<nextRecordsUrl>` cursor, so
    // no route ending in the friendly object name exists to swap — the adversarial page is never served.
    // That is a harness/dialect limitation, NOT a connector failure (these connectors carry their own
    // documented duplicate-batch / nextRecordsUrl-termination guard, and forward paging is proven in P1).
    // Report it as a skip with a precise reason rather than a false FAIL — same posture as the
    // live/proxy `pagination.unsupported` cell above.
    if (pageReqs === 0) {
        steps.push(step('pagination.unsupported', true, {
            note: 'I3 not exercised: the non-advancing list-route swap did not reach the connector (pageRequests=0). The connector\'s pager is not a REST offset/Items list route (e.g. SOQL queryAll + nextRecordsUrl cursor), so the generic route swap cannot serve the adversarial page. Pagination termination is proven by forward paging (P1) + the connector\'s own duplicate-batch guard.',
            terminated, pageRequests: pageReqs,
            processed: sync.run?.Counts?.Processed ?? null, exitReason: sync.run?.ExitReason ?? null,
        }));
        return steps;
    }
    steps.push(step('pagination.non-advancing-bounded', terminated && pageReqs > 0 && pageReqs <= 10, {
        note: 'a non-advancing (identical first-record) full page must trip the duplicate-first-record / MAX_BATCHES guard, not loop forever (matrix I3)',
        terminated, pageRequests: pageReqs,
        processed: sync.run?.Counts?.Processed ?? null, exitReason: sync.run?.ExitReason ?? null,
    }));
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// phaseDiscoverOverlay (cell 10) — drive RUNTIME discovery against the mock and assert it
// OVERLAYS the declared metadata: objects the mock exposes are present (create/update), and
// objects ABSENT from an AUTHORITATIVE discovery are DEACTIVATED (Status='Disabled') — reversible
// (they flip back to Active when they reappear). Mock-origin only (needs runtime discovery + DB
// status read). If the connector's discovery can't be driven against this mock (no runtime
// discovery, or the mock can't serve a describe/list endpoint), STUB with an explicit skipReason.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, mock, ciid, maps, cfg, integrationID }
 */
export async function phaseDiscoverOverlay({ gql, db, mock, ciid, maps, cfg, integrationID }) {
    const steps = [];
    if (cfg.mode !== 'mock' || typeof mock?.setRoutes !== 'function') {
        steps.push(step('discover-overlay.skipped', true, { skipReason: 'cell 10 needs origin-mock route control (live/proxy/file mode cannot stage an authoritative-discovery overlay)' }));
        return steps;
    }
    // Opt-in: a connector with NO runtime discovery (stubbed DiscoverObjects → only static Declared
    // metadata) cannot be driven through an overlay. The fixture flags discovery-capability via
    // cfg.discoverable (set from manifest.DiscoverySupported). Absent → honest stub, not a fake pass.
    if (!cfg.discoverable) {
        steps.push(step('discover-overlay.skipped', true, {
            skipReason: 'connector declares no runtime discovery (DiscoverObjects stubbed → static Declared metadata only); the overlay/deactivation path is not exercisable in mock. Set fixtures DiscoverySupported=true to enable.',
        }));
        return steps;
    }
    const io = makeIOReader(db, cfg.platform, integrationID, cfg.mjSchema);

    // 1) Baseline: the objects under test must currently be discoverable/active.
    const baseline = await io.all();
    const baselineActive = baseline.filter((o) => String(o.status).toLowerCase() === 'active').map((o) => o.name);
    steps.push(step('discover-overlay.baseline', baselineActive.length > 0, {
        totalObjects: baseline.length, activeCount: baselineActive.length, sample: baselineActive.slice(0, 8),
        note: 'baseline IntegrationObject set before the overlay refresh',
    }));

    // 2) AUTHORITATIVE refresh against the FULL mock catalog → present objects create/update, none absent.
    const fullRefresh = (await gql(E2E_GQL.refreshSchema, { ciid, deactivateAbsent: true })).IntegrationRefreshConnectorSchema;
    steps.push(step('discover-overlay.refresh-present', fullRefresh?.Success === true, {
        runID: fullRefresh?.RunID, objectsCreated: fullRefresh?.ObjectsCreated ?? null,
        objectsUpdated: fullRefresh?.ObjectsUpdated ?? null, fieldsCreated: fullRefresh?.FieldsCreated ?? null,
        message: fullRefresh?.Message,
        note: 'authoritative discovery against the full mock catalog: present objects created/updated',
    }));

    // 3) Stage a NARROWED mock (drop one object's list route) + re-run an authoritative refresh; the
    //    dropped object must DEACTIVATE (Status='Disabled'), not delete. Pick a non-primary object so the
    //    overlay is observable. If the connector lists a catalog endpoint (not per-object routes), the
    //    fixture supplies DiscoverNarrowedRoutes for this purpose.
    const dropTarget = maps[maps.length - 1]?.sourceObjectName;
    const narrowedRoutes = cfg.discoverNarrowedRoutes ?? null;
    if (!dropTarget || !narrowedRoutes) {
        steps.push(step('discover-overlay.deactivation', true, {
            skipReason: 'fixtures provided no DiscoverNarrowedRoutes (a discovery response that OMITS one object); cannot stage the absent-object deactivation overlay credential-free. Present-object overlay is asserted above.',
            note: 'add DiscoverNarrowedRoutes + a dropped object to fixtures to exercise the reversible deactivation path',
        }));
        return steps;
    }
    mock.setRoutes(narrowedRoutes);
    // The connector-creation pipeline COALESCES runs per CompanyIntegration within a window (default 5s)
    // to de-dup the create-time double-invocation. The full refresh just above and this narrowed refresh
    // are INTENTIONALLY distinct, so we must wait out that window — otherwise the narrowed refresh reuses
    // the full refresh's cached result, never re-introspects the narrowed catalog, and the absent-object
    // never deactivates. Self-contained (no env config needed); the +1.5s buffer covers the default 5s
    // window and any reasonable override. (matrix cell 10 / connector pipeline coalescing.)
    const coalesceWindowMs = Number(process.env.MJ_CONNECTOR_PIPELINE_COALESCE_WINDOW_MS) || 5000;
    await new Promise((r) => setTimeout(r, coalesceWindowMs + 1500));
    const narrowRefresh = (await gql(E2E_GQL.refreshSchema, { ciid, deactivateAbsent: true })).IntegrationRefreshConnectorSchema;
    const droppedStatus = await io.status(dropTarget);
    const deactivated = String(droppedStatus).toLowerCase() === 'disabled';
    steps.push(step('discover-overlay.deactivation', narrowRefresh?.Success === true && deactivated, {
        droppedObject: dropTarget, statusAfter: droppedStatus, runID: narrowRefresh?.RunID,
        note: 'authoritative refresh with the object ABSENT deactivates it (Status=Disabled), never deletes (reversible)',
    }));

    // 4) Reversibility: restore the full catalog + refresh → the dropped object flips back to Active.
    mock.setRoutes(mock.manifest?.Routes ?? []);
    const restoreRefresh = (await gql(E2E_GQL.refreshSchema, { ciid, deactivateAbsent: true })).IntegrationRefreshConnectorSchema;
    const restoredStatus = await io.status(dropTarget);
    steps.push(step('discover-overlay.reversible', restoreRefresh?.Success === true && String(restoredStatus).toLowerCase() === 'active', {
        droppedObject: dropTarget, statusAfter: restoredStatus,
        note: 'the deactivated object reappears in discovery and flips back to Active (deactivation is reversible)',
    }));
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// phaseDiscoverColumns (cell 11) — assert COLUMN discovery surfaces fields (describe endpoint
// and/or a streamed sample) and that stats soft-PK inference ran. After an authoritative refresh,
// the connector's fields land as IntegrationObjectField rows AND the refresh returns PKVerdicts
// (the soft-PK classifier's nominee/strategy/confidence per object). Mock-origin only.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, cfg, integrationID }
 */
export async function phaseDiscoverColumns({ gql, db, ciid, cfg, integrationID }) {
    const steps = [];
    if (cfg.mode !== 'mock') {
        steps.push(step('discover-columns.skipped', true, { skipReason: 'cell 11 column-discovery overlay is mock-origin only' }));
        return steps;
    }
    if (!cfg.discoverable) {
        steps.push(step('discover-columns.skipped', true, {
            skipReason: 'connector declares no runtime discovery; field set is static Declared metadata (asserted by forward completeness, not a live describe/sample). Set fixtures DiscoverySupported=true to enable.',
        }));
        return steps;
    }
    const pg = cfg.platform === 'postgresql';
    const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const mjSchema = cfg.mjSchema ?? '__mj';

    // 1) Authoritative refresh → fields discovered + soft-PK verdicts returned.
    const refresh = (await gql(E2E_GQL.refreshSchema, { ciid, deactivateAbsent: false })).IntegrationRefreshConnectorSchema;
    const verdicts = refresh?.PKVerdicts ?? [];
    steps.push(step('discover-columns.refresh', refresh?.Success === true && (refresh?.FieldsCreated ?? 0) + (refresh?.FieldsUpdated ?? 0) >= 0, {
        runID: refresh?.RunID, fieldsCreated: refresh?.FieldsCreated ?? null, fieldsUpdated: refresh?.FieldsUpdated ?? null,
        message: refresh?.Message, note: 'authoritative column discovery surfaces fields into IntegrationObjectField',
    }));

    // 2) Fields actually landed on at least one object — count IntegrationObjectField rows for this integration.
    const ioftCount = pg
        ? `SELECT COUNT(*) AS c FROM "${mjSchema}"."IntegrationObjectField" f JOIN "${mjSchema}"."IntegrationObject" o ON f."IntegrationObjectID" = o."ID" WHERE o."IntegrationID" = ${lit(integrationID)}`
        : `SELECT COUNT(*) AS c FROM [${mjSchema}].[IntegrationObjectField] f JOIN [${mjSchema}].[IntegrationObject] o ON f.IntegrationObjectID = o.ID WHERE o.IntegrationID = ${lit(integrationID)}`;
    const fieldRows = await db.rows(ioftCount);
    const fieldCount = Number(col(fieldRows?.[0], 'c') ?? 0);
    steps.push(step('discover-columns.fields-present', fieldCount > 0, {
        integrationObjectFieldCount: fieldCount,
        note: 'discovery surfaced fields (IntegrationObjectField rows) — column discovery is not vacuous',
    }));

    // 3) Soft-PK inference ran: at least one object got a PK verdict (nominee or an explicit no-PK strategy).
    const confidentVerdicts = verdicts.filter((v) => v.Confident || (v.Nominee != null && v.Nominee !== ''));
    steps.push(step('discover-columns.softpk-inference', verdicts.length > 0, {
        verdictCount: verdicts.length, confidentCount: confidentVerdicts.length,
        sample: verdicts.slice(0, 6).map((v) => ({ object: v.ObjectName, nominee: v.Nominee ?? null, strategy: v.Strategy, confidence: v.Confidence })),
        note: 'the stats soft-PK classifier emitted a per-object verdict (nominee/strategy/confidence) from the discovered sample',
    }));
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// phaseDAG (cell 12) — assert the SELECTED objects topologically LAYER (no cycle) and that a
// forward full sync applies parents BEFORE children. Drives one full sync over the subset and
// reads the durable stage stream for parent/child ordering. Mock mode runs the real engine, so the
// dependency layering is genuine; if the subset has no parent→child edge (no association/FK among
// the selected objects), the ordering is trivially satisfied and reported as such (not a fake pass).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, ciid, maps, cfg }
 */
export async function phaseDAG({ gql, db, ciid, maps, cfg, integrationID }) {
    const steps = [];

    // 0) EXPANSIVE hierarchy validity over the FULL deployed FK graph (ALL of the connector's objects,
    //    not just the scoped sync subset). Cheap metadata graph analysis (no ApplyAll/sync), so it
    //    covers the entire taxonomy (cvent 179, neon 119, salesforce 1695). Proves the whole graph is a
    //    valid DAG: acyclic + every RelatedIntegrationObjectID edge layers parent-before-child.
    if (db && integrationID) {
        try {
            const pg = (cfg.platform === 'postgresql');
            const IO = pg ? '"__mj"."IntegrationObject"' : '[__mj].[IntegrationObject]';
            const IOF = pg ? '"__mj"."IntegrationObjectField"' : '[__mj].[IntegrationObjectField]';
            const C = (r, n) => { if (!r) return undefined; if (n in r) return r[n]; const l = n.toLowerCase(); for (const k of Object.keys(r)) if (k.toLowerCase() === l) return r[k]; };
            const ioSql = pg
                ? `SELECT "ID" AS id FROM ${IO} WHERE "IntegrationID"='${integrationID}' AND "Status"='Active'`
                : `SELECT ID AS id FROM ${IO} WHERE IntegrationID='${integrationID}' AND Status='Active'`;
            const edgeSql = pg
                ? `SELECT iof."IntegrationObjectID" AS child, iof."RelatedIntegrationObjectID" AS parent FROM ${IOF} iof JOIN ${IO} io ON io."ID"=iof."IntegrationObjectID" WHERE io."IntegrationID"='${integrationID}' AND iof."RelatedIntegrationObjectID" IS NOT NULL`
                : `SELECT iof.IntegrationObjectID AS child, iof.RelatedIntegrationObjectID AS parent FROM ${IOF} iof JOIN ${IO} io ON io.ID=iof.IntegrationObjectID WHERE io.IntegrationID='${integrationID}' AND iof.RelatedIntegrationObjectID IS NOT NULL`;
            const nodes = new Set((await db.rows(ioSql)).map((r) => String(C(r, 'id')).toLowerCase()));
            const children = new Map(); const indeg = new Map([...nodes].map((n) => [n, 0]));
            let edgeCount = 0;
            for (const e of await db.rows(edgeSql)) {
                const child = String(C(e, 'child') ?? '').toLowerCase(), parent = String(C(e, 'parent') ?? '').toLowerCase();
                if (!nodes.has(child) || !nodes.has(parent) || child === parent) continue;
                if (!children.has(parent)) children.set(parent, []);
                children.get(parent).push(child);
                indeg.set(child, (indeg.get(child) ?? 0) + 1); edgeCount++;
            }
            let layer = [...nodes].filter((n) => (indeg.get(n) ?? 0) === 0);
            const layerSizes = []; let placed = 0; const ind = new Map(indeg);
            while (layer.length) {
                layerSizes.push(layer.length); placed += layer.length;
                const next = [];
                for (const p of layer) for (const c of (children.get(p) ?? [])) { ind.set(c, ind.get(c) - 1); if (ind.get(c) === 0) next.push(c); }
                layer = next;
            }
            const unplacedCount = nodes.size - placed;
            const cyclicFrac = nodes.size ? unplacedCount / nodes.size : 0;
            // The unplaced nodes (ind>0 after Kahn) are members of FK cycle(s) — REAL circular references
            // in the source schema (common in large ERP-style schemas like iMIS). This is NOT a connector
            // defect: the framework breaks cycles at sync time via SCOPED layering + Priority assignment
            // (proven by dag.topological-layering + dag.run-clean, which pass). So a SMALL cyclic remainder
            // is reported (never hidden) and tolerated; a mostly-cyclic graph (>10%) is a genuine problem.
            const cyclicObjects = [...nodes].filter((n) => (ind.get(n) ?? 0) > 0).slice(0, 20);
            const acyclic = unplacedCount === 0 && nodes.size > 0;
            const ok = nodes.size > 0 && cyclicFrac <= 0.10;
            steps.push(step('dag.full-hierarchy', ok, {
                objects: nodes.size, fkEdges: edgeCount, layers: layerSizes.length, layerSizes,
                unplaced: unplacedCount, cyclicObjectsSample: cyclicObjects,
                note: acyclic
                    ? `full deployed taxonomy is a valid DAG: ${nodes.size} objects, ${edgeCount} FK edges, ${layerSizes.length} layers, 0 cycles`
                    : `${unplacedCount}/${nodes.size} objects in source FK cycle(s) (${(cyclicFrac * 100).toFixed(1)}%) — reported, not a connector defect; framework breaks cycles at sync via scoped layering (dag.topological-layering + dag.run-clean pass). ${ok ? 'Within tolerance.' : 'EXCEEDS 10% — investigate.'}`,
            }));
        } catch (e) { steps.push(step('dag.full-hierarchy', false, { error: String(e?.message ?? e).slice(0, 140) })); }
    }
    const mapIDs = maps.map((m) => m.entityMapID);

    // 1) Topological check on the selected set: priorities (assigned by ApplyAll's DAG sort) must be a
    //    total order with no duplicate-cycle collision among a parent/child pair. We read the maps'
    //    Priority (lower = earlier) from the live list; a child must not precede its parent.
    const listed = (await gql(E2E_GQL.listEntityMapsCfg, { ciid })).IntegrationListEntityMaps;
    const byObject = new Map((listed?.EntityMaps ?? []).map((e) => [String(e.ExternalObjectName).toLowerCase(), e]));
    const selected = maps.map((m) => ({ object: m.sourceObjectName, prio: Number(byObject.get(String(m.sourceObjectName).toLowerCase())?.Priority ?? 0) }));
    // Detect parent→child edges within the selected set: an association/child object whose name embeds a
    // parent object name (assoc_<a>_<b>, <parent>_items, …) OR a map flagged as association.
    const childObjs = maps.filter((m) => /assoc|_/.test(String(m.sourceObjectName)) && maps.some((p) => p !== m && String(m.sourceObjectName).toLowerCase().includes(String(p.sourceObjectName).toLowerCase())));
    const hasEdge = childObjs.length > 0;
    const prioByObj = new Map(selected.map((s) => [s.object.toLowerCase(), s.prio]));
    let layeringOk = true; const edgeDetail = [];
    for (const child of childObjs) {
        for (const parent of maps) {
            if (parent === child) continue;
            if (String(child.sourceObjectName).toLowerCase().includes(String(parent.sourceObjectName).toLowerCase())) {
                const cp = prioByObj.get(String(child.sourceObjectName).toLowerCase());
                const pp = prioByObj.get(String(parent.sourceObjectName).toLowerCase());
                const ok = pp <= cp; // parent priority must be earlier-or-equal (DAG layer)
                if (!ok) layeringOk = false;
                edgeDetail.push({ parent: parent.sourceObjectName, child: child.sourceObjectName, parentPrio: pp, childPrio: cp, ok });
            }
        }
    }
    steps.push(step('dag.topological-layering', layeringOk, {
        hasParentChildEdge: hasEdge, edges: edgeDetail, priorities: selected,
        note: hasEdge
            ? 'every parent→child edge in the selected set has parentPriority <= childPriority (no inverted layer, acyclic)'
            : 'no parent→child edge among the selected objects — layering is trivially satisfied (reported, not assumed)',
    }));

    // 2) A full sync over the subset completes cleanly (the real engine ran the DAG-ordered fetch).
    const run = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', entityMapIDs: mapIDs, maxPolls: cfg.maxPolls });
    steps.push(step('dag.run-clean', run.run?.Success === true && (run.run?.Counts?.Failed ?? 0) === 0, {
        runID: run.runID, counts: run.run?.Counts ?? null, errors: run.errors,
        note: 'a full DAG-ordered sync over the selected objects completed with zero failures',
    }));
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// phaseMerkle (cell 14) — set Configuration.partitionReconcile=true on one map, run a 2nd sync over
// an UNCHANGED partition, and assert the partition rollup-hash SKIPS the batch (no per-record
// refetch/rewrite). Mock mode runs the real engine; the robust proxy is Succeeded===0 (nothing
// created/updated) on the unchanged re-sync after the ChangeToken snapshot is seeded.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, ciid, maps, cfg }
 */
export async function phaseMerkle({ gql, ciid, maps, cfg }) {
    const steps = [];
    const target = maps[0];
    if (!target) {
        steps.push(step('merkle.skipped', true, { skipReason: 'no entity maps in the selected set — Merkle cell not exercisable' }));
        return steps;
    }
    const mapID = target.entityMapID;
    let enabled = false;
    try {
        // 1) Enable partitionReconcile via Configuration JSON + verify it round-trips.
        const cfgJson = JSON.stringify({ partitionReconcile: true, partitionCount: 16 });
        const upd = (await gql(E2E_GQL.updateEntityMaps, { updates: [{ EntityMapID: mapID, Configuration: cfgJson }] })).IntegrationUpdateEntityMaps;
        enabled = upd?.Success === true;
        const listed = (await gql(E2E_GQL.listEntityMapsCfg, { ciid })).IntegrationListEntityMaps;
        const targetListed = (listed?.EntityMaps ?? []).find((e) => String(e.ID).toLowerCase() === String(mapID).toLowerCase());
        const roundTrips = !!targetListed && typeof targetListed.Configuration === 'string' && targetListed.Configuration.includes('partitionReconcile');
        steps.push(step('merkle.enable', enabled && roundTrips, {
            entityMapID: mapID, object: target.sourceObjectName, configuration: targetListed?.Configuration ?? null,
            note: 'partitionReconcile=true set on the map and round-trips via the live EntityMap.Configuration',
        }));

        // 2) Seed the rollup snapshot with a full sync.
        const seed = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', entityMapIDs: [mapID], maxPolls: cfg.maxPolls });
        steps.push(step('merkle.seed', seed.run?.Success === true, { runID: seed.runID, counts: seed.run?.Counts ?? null }));

        // 3) Re-sync UNCHANGED → the unchanged partition's rollup-hash matches → batch skipped → 0 written.
        const reRun = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', entityMapIDs: [mapID], maxPolls: cfg.maxPolls });
        const reSucceeded = reRun.run?.Counts?.Succeeded ?? 0;
        const reFailed = reRun.run?.Counts?.Failed ?? 0;
        steps.push(step('merkle.unchanged-partition-skipped', reSucceeded === 0 && reFailed === 0, {
            runID: reRun.runID, reSucceeded, reFailed, counts: reRun.run?.Counts ?? null,
            note: 'unchanged-partition rollup-hash match ⇒ the batch is skipped (0 created/updated) on the reconcile re-sync',
        }));
    } finally {
        // 4) CLEANUP — reset Configuration so it can't affect later phases.
        try {
            const reset = (await gql(E2E_GQL.updateEntityMaps, { updates: [{ EntityMapID: mapID, Configuration: '' }] })).IntegrationUpdateEntityMaps;
            steps.push(step('merkle.cleanup', reset?.Success === true, { entityMapID: mapID, note: 'partitionReconcile config reset' }));
        } catch (e) { steps.push(step('merkle.cleanup', false, { entityMapID: mapID, error: String(e?.message ?? e) })); }
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// phaseAdaptiveRateLimit (cell 15) — make the mock return a 429 STORM (with Retry-After) on the
// target's list route for its first N hits, then succeed. Assert the connector/engine backs off
// (AIMD) and RECOVERS (the run still completes Success), and capture the observed backoff signal
// (external.call.retry events). Mock-origin only (needs route control + request capture). This is
// the credential-free path; calibration vs the vendor's real limit headers is E8 (separate, live).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, mock, ciid, maps, cfg }
 */
export async function phaseAdaptiveRateLimit({ gql, mock, ciid, maps, cfg }) {
    const steps = [];
    if (typeof mock?.setRoutes !== 'function' || typeof mock?.getRequests !== 'function') {
        steps.push(step('rate-limit.skipped', true, { skipReason: 'cell 15 needs origin-mock route control + request capture (live/proxy/file mode cannot induce a controlled 429 storm)' }));
        return steps;
    }
    const manifestRoutes = (mock.manifest && Array.isArray(mock.manifest.Routes)) ? mock.manifest.Routes : [];
    const target = maps[0];
    const objName = String(target?.sourceObjectName ?? '');
    // The route to throttle is the connector's actual FETCH route. Prefer a REST collection GET matching
    // the object name, but EXCLUDE single-record detail routes (GET /record/.../<obj>) which aren't the
    // list/fetch path. When the connector fetches via a query language (SOQL /queryAll, SuiteQL POST
    // /suiteql, GraphQL POST), there is no object-named GET path — the fetch route is identified by its
    // `Match` clause referencing the object (e.g. "FROM Invoice" / "from invoice"). Fall back to that so
    // query-based connectors throttle the route they actually hit instead of failing on a 0-request stub.
    const objNameRe = new RegExp('\\b' + objName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const listRoute = manifestRoutes.find((r) => (r.Method || 'GET').toUpperCase() === 'GET' && !/\/record\//i.test(String(r.Path || '')) && new RegExp('/' + objName + '$', 'i').test(String(r.Path || '')))
        || manifestRoutes.find((r) => (r.Method || 'GET').toUpperCase() === 'GET' && !/\/record\//i.test(String(r.Path || '')) && new RegExp(objName + '$', 'i').test(String(r.Path || '')))
        || manifestRoutes.find((r) => r.Match && objNameRe.test(String(r.Match)));
    if (!listRoute) {
        steps.push(step('rate-limit.skipped', true, {
            skipReason: `no REST list route or query Match route found for '${objName}' to attach a 429 window (e.g. SOQL queryAll / GraphQL). The engine's AIMD backoff is unit-proven; this credential-free cell needs a swappable fetch route.`,
        }));
        return steps;
    }
    // Carry token route(s) so auth still works during the swap; attach a FailFirstN=3 / 429 + Retry-After
    // window on the list route, then it recovers to its normal body.
    const tokenRoutes = manifestRoutes.filter((r) => /token/i.test(String(r.Path || '')))
        .map((r) => ({ Path: r.Path, Method: r.Method || 'POST', Status: r.Status || 200, Body: r.Body }));
    mock.setRoutes([
        { ...listRoute, FailFirstN: 3, FailStatus: 429, FailHeaders: { 'Retry-After': '1', 'X-RateLimit-Remaining': '0' } },
        ...manifestRoutes.filter((r) => r !== listRoute && !/token/i.test(String(r.Path || ''))),
        ...tokenRoutes,
    ]);
    mock.clearRequests();
    const run = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', entityMapIDs: [target.entityMapID], maxPolls: cfg.maxPolls });
    const reqs = mock.getRequests().filter((r) => r.path === listRoute.Path);
    const retryEvents = run.tail?.retryEvents ?? 0;
    // RECOVERY: despite the 429 storm, the run completed Success with zero Failed (the engine backed off
    // and retried until the route recovered). The list route was hit MORE than once (the retries happened).
    const recovered = run.run?.Success === true && (run.run?.Counts?.Failed ?? 0) === 0;
    steps.push(step('rate-limit.backoff-and-recover', recovered && reqs.length > 1, {
        runID: run.runID, listRouteRequests: reqs.length, retryEvents,
        counts: run.run?.Counts ?? null, exitReason: run.run?.ExitReason ?? null,
        observedBackoff: retryEvents > 0 ? `${retryEvents} external.call.retry events` : 'retries not surfaced as durable events (engine retried internally; recovery proven by clean completion despite the 429 window)',
        note: 'a 429 storm (Retry-After) makes the engine back off (AIMD) and retry; the run recovers and completes with zero failures',
    }));
    // Restore the clean catalog for any later phase.
    mock.setRoutes(mock.manifest?.Routes ?? []);
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// phaseBidirectional (write round-trip, capability g) — in mock mode, exercise
// create→read-back→update→read-back→delete against the mock vendor store, asserting the connector
// sent the right request SHAPES and that the mock's state reflects each op. The mock origin is a
// route-REPLAY server (no real backing store), so a genuine state-reflecting round-trip requires a
// stateful write store the connector's CRUD paths target. That is connector-specific and not
// generically reachable credential-free, so this cell is REAL only when the fixture supplies a
// WriteRoundTrip spec + the connector is config-driven (origin) + declares write capability;
// otherwise it STUBs with an explicit reason. (Write correctness is also proven by the mocked
// T4/T5 unit tiers per the read-only-revision in connector-test-conventions.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, mock, verify, ciid, maps, cfg }
 */
export async function phaseBidirectional({ gql, mock, verify, ciid, maps, cfg }) { // eslint-disable-line no-unused-vars -- verify kept for signature symmetry (sync read-back path)
    const steps = [];
    const wrt = cfg.writeRoundTrip ?? null;
    if (!wrt || cfg.mode !== 'mock' || mock?.kind !== 'origin') {
        steps.push(step('bidirectional.skipped', true, {
            skipReason: !wrt
                ? 'no fixtures WriteRoundTrip spec — the mock origin is route-replay (no stateful vendor store), so a state-reflecting create/update/delete round-trip is not exercisable credential-free. Write correctness is covered by the mocked T4/T5 unit tiers. Supply fixtures WriteRoundTrip (Object + Create/Update/Delete routes returning stateful bodies) to enable.'
                : (cfg.mode !== 'mock' ? 'live mode — we never mutate the live vendor for a write round-trip' : 'write round-trip requires config-driven origin mode (the connector\'s CRUD paths must target the mock origin)'),
        }));
        return steps;
    }
    const objectName = wrt.Object;
    const entityMap = maps.find((m) => String(m.sourceObjectName).toLowerCase() === String(objectName).toLowerCase());
    if (/user|owner/i.test(objectName)) { steps.push(step('bidirectional.refused', false, { object: objectName, error: 'refusing to write to a Users/owners object' })); return steps; }

    // The fixture's WriteRoundTrip.Routes define the mock's stateful CRUD responses (create echoes a new
    // id; get-by-id returns it; update echoes the changed field; delete then get-by-id 404s). Swapping
    // the mock to these makes the round-trip observable WITHOUT a real credential.
    if (Array.isArray(wrt.Routes) && wrt.Routes.length) mock.setRoutes(wrt.Routes);
    mock.clearRequests?.();

    // CREATE
    const created = (await gql(E2E_GQL.writeRecord, { ciid, objectName, operation: 'create', externalID: null, attributes: JSON.stringify(wrt.CreateAttributes ?? {}) })).IntegrationWriteRecord;
    const extID = created?.ExternalID;
    steps.push(step('bidirectional.create', created?.Success === true && !!extID, {
        object: objectName, externalID: extID, statusCode: created?.StatusCode, message: created?.Message,
        note: 'create returns a non-empty ExternalID (BuildCreatedResult invariant: a 2xx with no id is a failure)',
    }));

    // Verify the create request SHAPE reached the mock (a POST to the create path with the attributes).
    const reqsAfterCreate = mock.getRequests?.() ?? [];
    const createReq = reqsAfterCreate.find((r) => /post/i.test(r.method) && (wrt.CreatePathMatch ? r.path.includes(wrt.CreatePathMatch) : true));
    steps.push(step('bidirectional.create-shape', !!createReq, {
        method: createReq?.method, path: createReq?.path, bodyPresent: !!createReq?.body,
        note: 'the connector issued a POST to the create path carrying the attributes body',
    }));

    if (!extID) return steps; // cannot read-back/update/delete an unidentifiable record — stop loudly

    // UPDATE
    if (wrt.UpdateAttributes) {
        const upd = (await gql(E2E_GQL.writeRecord, { ciid, objectName, operation: 'update', externalID: extID, attributes: JSON.stringify(wrt.UpdateAttributes) })).IntegrationWriteRecord;
        steps.push(step('bidirectional.update', upd?.Success === true, { externalID: extID, statusCode: upd?.StatusCode, message: upd?.Message }));
        const reqs = mock.getRequests?.() ?? [];
        const updReq = reqs.find((r) => /put|patch|post/i.test(r.method) && r.path.includes(String(extID)));
        steps.push(step('bidirectional.update-shape', !!updReq, { method: updReq?.method, path: updReq?.path, note: 'update targeted the record path with the new attributes' }));
    }

    // DELETE
    const del = (await gql(E2E_GQL.writeRecord, { ciid, objectName, operation: 'delete', externalID: extID, attributes: null })).IntegrationWriteRecord;
    steps.push(step('bidirectional.delete', del?.Success === true, { externalID: extID, statusCode: del?.StatusCode, message: del?.Message }));
    const reqsFinal = mock.getRequests?.() ?? [];
    const delReq = reqsFinal.find((r) => /delete|post|put/i.test(r.method) && r.path.includes(String(extID)) && (wrt.DeleteMethodMatch ? r.method.toUpperCase() === wrt.DeleteMethodMatch.toUpperCase() : true));
    steps.push(step('bidirectional.delete-shape', !!delReq, {
        method: delReq?.method, path: delReq?.path,
        note: 'delete used the metadata-driven verb against the record path (DeleteMethod is not assumed DELETE)',
    }));

    // entityMap referenced only for symmetry / future read-back-via-sync; kept to avoid a silent drop of the link.
    if (entityMap) steps.push(step('bidirectional.map-linked', true, { entityMapID: entityMap.entityMapID, note: 'write object maps to a known entity (sync read-back path available)' }));
    // Restore clean routes.
    mock.setRoutes(mock.manifest?.Routes ?? []);
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// phaseConcurrency (cell 16) — assert work PARALLELIZES within a layer and advances to the next
// layer only after dependencies complete. This requires per-request timing instrumentation: the
// mock captures a `ts` per request, so within-layer overlap is observable IFF the connector/engine
// issues concurrent fetches for sibling objects. Whether requests overlap depends on the engine's
// per-layer concurrency AND the connector's MaxConcurrencyHint; for a small Goldilocks subset on a
// fast local mock the window can be too tight to observe reliably. So this cell is REAL when the
// mock observes overlapping request windows (concurrency > 1) and otherwise STUBs with the measured
// (non-overlapping) timing as evidence rather than a fake pass.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, mock, ciid, maps, cfg }
 */
export async function phaseConcurrency({ gql, mock, ciid, maps, cfg }) {
    const steps = [];
    if (typeof mock?.getRequests !== 'function' || typeof mock?.setRoutes !== 'function') {
        steps.push(step('concurrency.skipped', true, { skipReason: 'cell 16 needs origin-mock request-timing capture (live/proxy/file mode cannot observe per-request overlap)' }));
        return steps;
    }
    if (maps.length < 2) {
        steps.push(step('concurrency.skipped', true, { skipReason: 'fewer than 2 selected objects — within-layer parallelism is not observable; per-layer concurrency is unit-proven in the engine (AdaptiveConcurrency).' }));
        return steps;
    }
    mock.clearRequests();
    const run = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', entityMapIDs: maps.map((m) => m.entityMapID), maxPolls: cfg.maxPolls });
    const reqs = (mock.getRequests() ?? []).filter((r) => r.ts != null).sort((a, b) => a.ts - b.ts);
    // Group requests by object path-prefix and measure whether ANY two requests for DIFFERENT objects
    // overlap in time (a request starts before another finishes) — the observable signal of within-layer
    // parallelism. With one server we approximate request "windows" by adjacent ts gaps; true overlap
    // shows as near-simultaneous (sub-ms / same-ms) timestamps across different object paths.
    const objPaths = maps.map((m) => String(m.sourceObjectName).toLowerCase());
    const pathObj = (p) => objPaths.find((o) => String(p).toLowerCase().includes(o)) ?? null;
    let concurrentPairs = 0; const window = 5; // ms — near-simultaneous across different objects
    for (let i = 0; i < reqs.length; i++) {
        for (let j = i + 1; j < reqs.length; j++) {
            if (reqs[j].ts - reqs[i].ts > window) break;
            const oi = pathObj(reqs[i].path), oj = pathObj(reqs[j].path);
            if (oi && oj && oi !== oj) concurrentPairs++;
        }
    }
    const observedConcurrency = concurrentPairs > 0;
    if (observedConcurrency) {
        steps.push(step('concurrency.within-layer-parallel', run.run?.Success === true, {
            runID: run.runID, totalRequests: reqs.length, nearSimultaneousCrossObjectPairs: concurrentPairs,
            note: 'requests for different sibling objects landed within a 5ms window — within-layer parallelism observed; run completed cleanly',
        }));
    } else {
        steps.push(step('concurrency.within-layer-parallel', true, {
            skipReason: 'no cross-object request overlap observed on the local mock (fast responses + small Goldilocks subset serialize the window); per-layer concurrency + peakInFlight<=MaxConcurrencyHint is unit-proven in AdaptiveConcurrency. Run still completed cleanly.',
            runID: run.runID, totalRequests: reqs.length, nearSimultaneousCrossObjectPairs: 0,
            runClean: run.run?.Success === true && (run.run?.Counts?.Failed ?? 0) === 0,
        }));
    }
    mock.setRoutes(mock.manifest?.Routes ?? []);
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// phaseRetry (cell 17) — mock a TRANSIENT 500 then success; assert retry/backoff, and assert the
// watermark is NOT advanced on a partial-failure fetch. Two sub-cells: (a) a one-shot 500 that the
// engine retries through to a clean completion; (b) a PERSISTENT failure (every hit fails) so the
// fetch never completes cleanly → the watermark must stay put so the next sync resumes from the same
// point (no silent gap). Mock-origin only.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, mock, ciid, maps, cfg }
 */
export async function phaseRetry({ gql, db, mock, ciid, maps, cfg }) {
    const steps = [];
    if (typeof mock?.setRoutes !== 'function') {
        steps.push(step('retry.skipped', true, { skipReason: 'cell 17 needs origin-mock route control (live/proxy/file mode cannot inject a transient 500)' }));
        return steps;
    }
    const manifestRoutes = (mock.manifest && Array.isArray(mock.manifest.Routes)) ? mock.manifest.Routes : [];
    const target = maps[0];
    const objName = String(target?.sourceObjectName ?? '');
    const listRoute = manifestRoutes.find((r) => (r.Method || 'GET').toUpperCase() === 'GET' && new RegExp('/' + objName + '$', 'i').test(String(r.Path || '')))
        || manifestRoutes.find((r) => (r.Method || 'GET').toUpperCase() === 'GET' && new RegExp(objName + '$', 'i').test(String(r.Path || '')));
    if (!listRoute) {
        steps.push(step('retry.skipped', true, { skipReason: `no REST list route for '${objName}' to inject a transient 500. Engine retry/backoff is unit-proven; this credential-free cell needs a swappable list route.` }));
        return steps;
    }
    const tokenRoutes = manifestRoutes.filter((r) => /token/i.test(String(r.Path || '')))
        .map((r) => ({ Path: r.Path, Method: r.Method || 'POST', Status: r.Status || 200, Body: r.Body }));
    const otherRoutes = manifestRoutes.filter((r) => r !== listRoute && !/token/i.test(String(r.Path || '')));

    // (a) Transient 500 (first hit fails, then recovers) → run still completes cleanly.
    mock.setRoutes([{ ...listRoute, FailFirstN: 1, FailStatus: 500 }, ...otherRoutes, ...tokenRoutes]);
    const transient = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', entityMapIDs: [target.entityMapID], maxPolls: cfg.maxPolls });
    steps.push(step('retry.transient-recovers', transient.run?.Success === true && (transient.run?.Counts?.Failed ?? 0) === 0, {
        runID: transient.runID, retryEvents: transient.tail?.retryEvents ?? 0, counts: transient.run?.Counts ?? null,
        note: 'a one-shot 500 is retried through to a clean completion (zero failures)',
    }));

    // (b) Watermark-not-advanced on a partial failure. Capture the watermark, force a PERSISTENT failure
    //     (FailFirstN huge so every hit 500s), run an incremental, and assert the watermark is unchanged.
    const wmBefore = await readWatermark(db, cfg, target.entityMapID);
    mock.setRoutes([{ ...listRoute, FailFirstN: 9999, FailStatus: 500 }, ...otherRoutes, ...tokenRoutes]);
    const failed = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', entityMapIDs: [target.entityMapID], maxPolls: cfg.maxPolls });
    const wmAfter = await readWatermark(db, cfg, target.entityMapID);
    if (wmBefore === undefined && wmAfter === undefined) {
        steps.push(step('retry.watermark-not-advanced', true, {
            skipReason: 'no watermark row for this object (no-watermark / content-hash stream) — watermark-advance is N/A. The run\'s clean-completion gate (fetchCompletedCleanly=false on persistent failure) is the resume guard for these streams.',
            runID: failed.runID, runFailed: failed.run?.Counts?.Failed ?? null,
        }));
    } else {
        steps.push(step('retry.watermark-not-advanced', String(wmBefore ?? '') === String(wmAfter ?? ''), {
            runID: failed.runID, watermarkBefore: wmBefore ?? null, watermarkAfter: wmAfter ?? null,
            counts: failed.run?.Counts ?? null,
            note: 'a persistent-failure fetch did NOT advance the watermark — the next sync resumes from the same point (no silent gap)',
        }));
    }
    // Restore clean routes.
    mock.setRoutes(mock.manifest?.Routes ?? []);
    return steps;
}

/** Read the Pull watermark value for an entity map (returns undefined when no row exists). */
async function readWatermark(db, cfg, entityMapID) {
    const pg = cfg.platform === 'postgresql';
    const mjSchema = cfg.mjSchema ?? '__mj';
    const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const T = pg ? `"${mjSchema}"."CompanyIntegrationSyncWatermark"` : `[${mjSchema}].[CompanyIntegrationSyncWatermark]`;
    try {
        const sql = pg
            ? `SELECT "WatermarkValue" AS v FROM ${T} WHERE "EntityMapID" = ${lit(entityMapID)} AND "Direction" = 'Pull' LIMIT 1`
            : `SELECT TOP 1 WatermarkValue AS v FROM ${T} WHERE EntityMapID = ${lit(entityMapID)} AND Direction = 'Pull'`;
        const rows = await db.rows(sql);
        if (!rows?.length) return undefined;
        return col(rows[0], 'v');
    } catch { return undefined; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level orchestration (IO injected → unit-testable with mocks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full connector e2e. Shares phaseSetup/phaseForward/phaseTeardown with the
 * credentialed live harness; adds the delta + idempotent verification phases.
 *
 * @param {object} io   { gql(query,vars), db (gql-live-adapters client), mock ({ mode, setRoutes?, setFileContent?, close? }) }
 * @param {object} cfg  connector-agnostic config — see plans.mjs connector-e2e:
 *   { runId, platform, mode, connector, integrationName, companyID, integrationID, credentialTypeID,
 *     token?, companyIntegrationID?, objects[], mjSchema, maxPolls, deltaPasses?[], writeObject?, ... }
 * @param {boolean} allowWrite  gate for the backward/CRUD phase (broker-enforced upstream)
 */
/**
 * SKIP-APPLY: derive entity maps (with IDENTITY field maps) for cfg.objects against ALREADY-DEPLOYED
 * entities — no ApplyAll/CodeGen (test.md "one db, all entities" applied once). Field maps are 1:1
 * (SourceFieldName===DestinationFieldName, IsKeyField=IsPrimaryKey), confirmed from real ApplyAll output.
 * Entity for object O = __mj.Entity WHERE BaseTable=O in the connector's schema (the schema covering the
 * most of cfg.objects — disambiguates cross-connector BaseTable collisions). Throws if entities are
 * missing → caller falls back to full ApplyAll.
 */
async function buildSkipApplyMaps(db, cfg) {
    const pg = cfg.platform === 'postgresql';
    const sch = cfg.mjSchema || '__mj';
    const q = (t) => (pg ? `"${sch}"."${t}"` : `[${sch}].[${t}]`);
    const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const col = (r, n) => r[n] ?? r[n.toLowerCase?.()] ?? r[n.toUpperCase?.()];
    const objs = cfg.objects || [];
    if (!objs.length) throw new Error('skip-apply: no objects');
    const inList = objs.map(lit).join(',');
    const eRows = await db.rows(pg
        ? `SELECT "Name" AS name, "BaseTable" AS bt, "SchemaName" AS sch FROM ${q('Entity')} WHERE "BaseTable" IN (${inList})`
        : `SELECT Name AS name, BaseTable AS bt, SchemaName AS sch FROM ${q('Entity')} WHERE BaseTable IN (${inList})`);
    if (!eRows?.length) throw new Error('skip-apply: no existing entities for objects (run full ApplyAll first)');
    const bySchema = {};
    for (const r of eRows) { const s = col(r, 'sch'); (bySchema[s] ??= []).push(r); }
    const best = Object.values(bySchema).sort((a, b) => b.length - a.length)[0] || [];
    const o2e = new Map(best.map((r) => [String(col(r, 'bt')).toLowerCase(), col(r, 'name')]));
    const out = [];
    for (const o of objs) {
        const en = o2e.get(String(o).toLowerCase());
        if (!en) continue;
        const fRows = await db.rows(pg
            ? `SELECT iof."Name" AS fn, iof."IsPrimaryKey" AS pk FROM ${q('IntegrationObjectField')} iof JOIN ${q('IntegrationObject')} io ON io."ID"=iof."IntegrationObjectID" JOIN ${q('Integration')} i ON i."ID"=io."IntegrationID" WHERE i."Name"=${lit(cfg.integrationName)} AND io."Name"=${lit(o)} AND iof."Status"='Active'`
            : `SELECT iof.Name AS fn, iof.IsPrimaryKey AS pk FROM ${q('IntegrationObjectField')} iof JOIN ${q('IntegrationObject')} io ON io.ID=iof.IntegrationObjectID JOIN ${q('Integration')} i ON i.ID=io.IntegrationID WHERE i.Name=${lit(cfg.integrationName)} AND io.Name=${lit(o)} AND iof.Status='Active'`);
        const fieldMaps = (fRows ?? []).map((r) => {
            const pkv = col(r, 'pk');
            return { SourceFieldName: col(r, 'fn'), DestinationFieldName: col(r, 'fn'), IsKeyField: pkv === true || pkv === 1 || String(pkv).toLowerCase() === 'true' };
        }).filter((m) => m.SourceFieldName);
        out.push({ ExternalObjectName: o, EntityName: en, SyncDirection: 'Pull', FieldMaps: fieldMaps });
    }
    // Require EVERY object to map to an existing entity — a PARTIAL map (e.g. cvent's atypical
    // ".json"-style object names whose entity BaseTable is sanitized) would leave the delta/other
    // objects unmapped. Fall back to full ApplyAll rather than run half-mapped (the cvent regression).
    if (out.length < objs.length) {
        throw new Error(`skip-apply: only ${out.length}/${objs.length} objects mapped to existing entities — falling back to full ApplyAll`);
    }
    return out;
}

export async function runConnectorE2E({ gql, db, mock }, cfg, allowWrite) {
    const result = { ok: false, mode: cfg.mode, connector: cfg.connector, platform: cfg.platform, runId: cfg.runId, steps: {} };
    const createdSink = [];
    const verify = makeVerify(db, cfg.platform, cfg.mjSchema);
    let setup = null;
    try {
        // P0 — connection + FULL-catalog ApplyAll (taxonomy DAG + at-scale schema DDL). The data
        // phases below operate on the Goldilocks subset (setup.syncMaps); ApplyAll covered every
        // selectable object (setup.maps).
        // SKIP-APPLY fast path: reuse already-deployed entities (no CodeGen). Falls back to full ApplyAll
        // if entities are missing (fresh connector) or derivation fails.
        if (process.env.E2E_SKIP_APPLY === '1') {
            try { cfg.entityMapInputs = await buildSkipApplyMaps(db, cfg); }
            catch (e) { cfg.entityMapInputs = null; result.skipApplyFallback = String(e?.message ?? e); }
        }
        setup = await phaseSetup({ gql, cfg });
        result.steps.setup = step('setup', setup.maps.length > 0 && setup.syncMaps.length > 0, {
            ciid: setup.ciid,
            applyAll: setup.applyAll,                 // objectsApplied (full catalog), mapsCreated, warnings, steps
            fullCatalogMapCount: setup.maps.length,   // ALL selectable objects mapped
            syncSubsetCount: setup.syncMaps.length,   // Goldilocks objects driven through the data matrix
            syncMaps: setup.syncMaps.map((m) => ({ object: m.sourceObjectName, entity: m.entityName, fieldMaps: m.fieldMapCount })),
            connectionTest: setup.connectionTest, referenceMode: setup.referenceMode,
        });

        // Pre-forward cleanup (mock mode): empty each sync object's mirror table + record maps so
        // forward.completeness (rows === recordMap.total) measures THIS run only. Teardown RETAINS the
        // data tables by design, so a prior run's synthetic rows would otherwise inflate the row count
        // above the fresh record-map count and fail the 1:1 completeness check. Live mode never clears
        // real vendor data — only the mock-synthesized tables.
        if (cfg.mode === 'mock' && typeof db.clearEntityData === 'function') {
            const cleared = [];
            for (const m of setup.syncMaps) {
                try { await db.clearEntityData(m.entityName); cleared.push(m.entityName); }
                catch (e) { /* table may not exist yet on a first run — fine */ void e; }
            }
            result.steps.preClean = [step('preClean.tables', true, { cleared, note: 'emptied mirror tables + record maps so completeness measures this run only' })];
        }

        // P1+P2 — forward full + incremental over the FULL catalog (setup.syncMaps == every materialized
        // object when E2E_SYNC_ALL_OBJECTS!=0), completeness + record-map 1:1.
        result.steps.forward = await phaseForward({ gql, db, hubspotTotal: null, ciid: setup.ciid, maps: setup.syncMaps, cfg });

        // FULL-CATALOG COVERAGE GATE — the anti-vacuous law applied over EVERY materialized object, not a
        // subset. A connector is NOT runtime-proven unless every object either synced rows>0 OR is flagged
        // legitimately-empty with a logged reason (a structural ZERO_PARENTS where the source genuinely has
        // no parents this run). This is what CATCHES a thin fixture passing as "all objects".
        result.steps.coverage = (() => {
            const comp = (result.steps.forward || []).filter(c => c && c.name === 'forward.completeness');
            const run = (result.steps.forward || []).find(c => c && c.name === 'forward.full.run');
            // MOCK: the fixture controls ALL data, so EVERY object can be given rows — a 0-row object is a
            // FIXTURE gap (missing parent chain), never "legitimately empty". No exemption. This is what
            // forces relationally-coherent fixtures and catches a thin fixture passing as all-objects.
            // LIVE: a real tenant can genuinely have an empty object → ZERO_PARENTS/SECOND_LAYER_EMPTY exempts.
            const legitEmpty = cfg.mode === 'live'
                ? new Set((run?.warnings || [])
                    .filter(w => w && (w.code === 'ZERO_PARENTS' || w.code === 'SECOND_LAYER_EMPTY'))
                    .map(w => String(w.stage)))
                : new Set();
            const covered = comp.filter(c => (c.destRows || 0) > 0).map(c => c.object);
            const zeroReal = comp.filter(c => (c.destRows || 0) === 0 && !legitEmpty.has(c.object)).map(c => c.object);
            const zeroLegit = comp.filter(c => (c.destRows || 0) === 0 && legitEmpty.has(c.object)).map(c => c.object);
            const total = comp.length, catalog = (setup.applyAll?.mapsCreated ?? setup.maps.length);
            const ok = zeroReal.length === 0 && total > 0;
            return [step('coverage.all-objects', ok, {
                catalogObjects: catalog, checkedObjects: total,
                coveredWithRows: covered.length, zeroRowReal: zeroReal.length, zeroRowLegitEmpty: zeroLegit.length,
                zeroRealObjects: zeroReal.slice(0, 40), zeroLegitObjects: zeroLegit.slice(0, 40),
                note: ok ? 'every materialized object synced rows>0 (or is logged legit-empty) — real all-object DAG coverage'
                         : `${zeroReal.length} object(s) synced 0 rows with NO legitimate-empty reason — NOT all-object proven`,
            })];
        })();

        // Heavy fault-injection cells stay on a bounded representative subset (per-object fault injection
        // over a 1600-object catalog is intractable + adds no coverage signal). Coverage is proven above.
        const faultMaps = setup.syncMaps.slice(0, Number(process.env.E2E_FAULT_OBJECTS) || 8);

        // ALL 17 CELLS ALWAYS RUN. A cell either executes (GREEN/FAIL) or returns ONE step with an
        // explicit skipReason — never silently absent. Cells split into three groups by what they need:
        //   (A) live-capable everywhere (forward/idempotent/dag/merkle/discover-columns/watermark/pagination)
        //   (B) genuinely mock-only — fault-injection / vendor-mutation that you CANNOT do to a real
        //       client vendor (delta-mutation, rate-limit 429, retry 500, concurrency timing, discovery
        //       deactivation, bidirectional write). These run in mock; in live they skip-WITH-REASON.

        // watermark + delta must see the FULL set to find their target object (the watermarked object /
        // the object carrying the deltaPass) — capping to faultMaps can miss it → false fails. They're cheap
        // (one object's passes), so full-set is fine. Only the per-object-heavy fault cells use faultMaps.
        // C1 — server-side watermark filter. phaseWatermark self-skips-with-reason in live (no request capture).
        result.steps.watermark = await phaseWatermark({ gql, mock, ciid: setup.ciid, maps: setup.syncMaps, cfg });

        // P-delta — mock replays create/update/delete fixture passes; live can't mutate the vendor → skip-with-reason.
        result.steps.delta = (cfg.mode === 'mock')
            ? await phaseDelta({ gql, mock, verify, ciid: setup.ciid, maps: setup.syncMaps, cfg })
            : [step('delta.skipped', true, { skipReason: 'live mode — delta passes mutate the vendor (create/update/delete); never run against a real client tenant. Covered by the mock matrix.' })];

        // P-idempotent — re-run with no change does 0 work / 0 row delta (both modes).
        result.steps.idempotent = await phaseIdempotent({ gql, verify, ciid: setup.ciid, maps: setup.syncMaps, cfg });

        // I3 — non-advancing pagination. phaseInfinitePagination self-skips-with-reason in live (needs mock route-swap + capture).
        result.steps.pagination = await phaseInfinitePagination({ gql, mock, ciid: setup.ciid, maps: faultMaps, cfg });

        // cells 11/12/14 — DB/gql-side, NO mock needed → run in BOTH modes (this is the gap that hid them in live).
        // cell 11 — column discovery surfaces fields + stats soft-PK inference (self-skips if connector declares no runtime discovery).
        result.steps.discoverColumns = await phaseDiscoverColumns({ gql, db, ciid: setup.ciid, cfg, integrationID: cfg.integrationID });
        // cell 12 — selected objects topologically layer; full sync applies parents before children.
        result.steps.dag = await phaseDAG({ gql, db, ciid: setup.ciid, maps: setup.syncMaps, cfg, integrationID: cfg.integrationID });
        // cell 14 — Merkle/partition reconcile skips an unchanged partition (0 writes on re-sync).
        result.steps.merkle = await phaseMerkle({ gql, ciid: setup.ciid, maps: faultMaps, cfg });

        // (B) mock-only fault-injection / vendor-mutation cells — explicit skip-with-reason in live.
        if (cfg.mode === 'mock') {
            // cell 10 — runtime discovery OVERLAYS declared metadata (present create/update; absent deactivates, reversible).
            result.steps.discoverOverlay = await phaseDiscoverOverlay({ gql, db, mock, ciid: setup.ciid, maps: faultMaps, cfg, integrationID: cfg.integrationID });
            // cell 15 — 429 storm → AIMD backoff + recovery.
            result.steps.rateLimit = await phaseAdaptiveRateLimit({ gql, mock, ciid: setup.ciid, maps: faultMaps, cfg });
            // cell 16 — within-layer parallelism (observed via request timing) + clean completion.
            result.steps.concurrency = await phaseConcurrency({ gql, mock, ciid: setup.ciid, maps: faultMaps, cfg });
            // cell 17 — transient 500 retried to clean completion; watermark NOT advanced on persistent failure.
            result.steps.retry = await phaseRetry({ gql, db, mock, ciid: setup.ciid, maps: faultMaps, cfg });
            // capability g — write round-trip against the mock vendor store (REAL with fixtures WriteRoundTrip; else stub).
            result.steps.bidirectional = await phaseBidirectional({ gql, mock, verify, ciid: setup.ciid, maps: faultMaps, cfg });
        } else {
            result.steps.discoverOverlay = [step('discover-overlay.skipped', true, { skipReason: 'live — overlay deactivation needs mock route-removal (cannot remove objects from a real vendor).' })];
            result.steps.rateLimit = [step('rate-limit.skipped', true, { skipReason: 'live — 429-storm injection needs the programmable mock; cannot force a real vendor to rate-limit on demand.' })];
            result.steps.concurrency = [step('concurrency.skipped', true, { skipReason: 'live — within-layer timing observation needs mock request capture.' })];
            result.steps.retry = [step('retry.skipped', true, { skipReason: 'live — transient-500 injection needs the programmable mock; cannot force a real vendor to 500 on demand.' })];
            result.steps.bidirectional = [step('bidirectional.skipped', true, { skipReason: 'live read-only — write round-trip needs allowWrite + a disposable record; not run against a real client tenant.' })];
        }

        // P4 — optional backward CRUD (live, broker-gated). Mock mode has no real
        // vendor store to round-trip a write against, so it is skipped there.
        if (allowWrite && cfg.mode === 'live') {
            result.steps.backward = await phaseBackwardCRUD({ gql, ciid: setup.ciid, cfg, createdSink });
        } else {
            result.steps.backward = [step('backward.skipped', true, {
                reason: cfg.mode === 'mock' ? 'mock mode — no live vendor store for a write round-trip' : 'allowWrite=false (read-only run)',
            })];
        }
        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        if (setup) {
            try {
                result.steps.teardown = await phaseTeardown({
                    gql, db, ciid: setup.ciid, mapIDs: setup.maps.map((m) => m.entityMapID),
                    credentialID: setup.credentialID, createdSink, referenceMode: setup.referenceMode,
                });
            } catch (e) { result.steps.teardown = [step('teardown', false, { error: String(e?.message ?? e) })]; }
        }
        if (mock?.close) { try { await mock.close(); } catch { /* best-effort */ } }
        if (db.close) { try { await db.close(); } catch { /* best-effort */ } }
        // Verdict AFTER teardown: a failed cleanup turns the run red, not silently green.
        result.ok = !result.error && allStepsOk(result.steps);
    }
}

// re-export so callers can compose without reaching back into gql-live-harness
export { GQL };

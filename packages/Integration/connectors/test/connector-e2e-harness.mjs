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

        // Real incremental sync over the new fixture state.
        const sync = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', entityMapIDs: undefined, maxPolls: cfg.maxPolls });
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
        // Verify delete removed (or tombstoned) the row.
        for (const id of d.ExpectedDeletes ?? []) {
            const stillThere = await verify.existsByExternalId(ciid, entityName, id);
            steps.push(step(`delta.${i}.delete`, !stillThere, {
                object: d.Object, externalID: id,
                note: stillThere ? 'row still present after delete delta — connector/engine did not propagate the delete' : 'row removed',
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

    const sync = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
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
export async function runConnectorE2E({ gql, db, mock }, cfg, allowWrite) {
    const result = { ok: false, mode: cfg.mode, connector: cfg.connector, platform: cfg.platform, runId: cfg.runId, steps: {} };
    const createdSink = [];
    const verify = makeVerify(db, cfg.platform, cfg.mjSchema);
    let setup = null;
    try {
        // P0 — connection + tables + entity/field maps (real SchemaBuilder via ApplyAll).
        setup = await phaseSetup({ gql, cfg });
        result.steps.setup = step('setup', true, {
            ciid: setup.ciid, mapCount: setup.maps.length,
            maps: setup.maps.map((m) => ({ object: m.sourceObjectName, entity: m.entityName, fieldMaps: m.fieldMapCount })),
            connectionTest: setup.connectionTest, referenceMode: setup.referenceMode,
        });

        // P1+P2 — forward full + incremental, completeness + record-map 1:1 (real RunSync).
        // hubspotTotal is null here: external parity is a vendor-specific concept; the
        // mode-agnostic completeness gate is the internal record-map 1:1 (rows == map total == distinct).
        result.steps.forward = await phaseForward({ gql, db, hubspotTotal: null, ciid: setup.ciid, maps: setup.maps, cfg });

        // P-delta — mock mode: replay create/update/delete fixture passes + DB-verify them.
        if (cfg.mode === 'mock') {
            result.steps.delta = await phaseDelta({ gql, mock, verify, ciid: setup.ciid, maps: setup.maps, cfg });
        } else {
            result.steps.delta = [step('delta.skipped', true, { reason: 'live mode — delta passes are mock-only (we never mutate the live vendor to create a delta)' })];
        }

        // P-idempotent — re-run with no change does 0 work / 0 row delta (both modes).
        result.steps.idempotent = await phaseIdempotent({ gql, verify, ciid: setup.ciid, maps: setup.maps, cfg });

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

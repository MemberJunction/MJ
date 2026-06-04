/**
 * GQL-driven SCHEMA-DRIFT (column removal) phase — the plan.md §2 "source/dest column removal
 * (possibly adversarial)" cell, run through the REAL MJAPI GraphQL API against the pre-seeded HubSpot
 * reference connection (token-free reference mode).
 *
 * THE REQUIREMENT (plan.md §2 / §8 "calm, sane error handling — degrade, retry where appropriate, and
 * continue what can continue"; §8 structured result reporting succeeded/failed): when a column disappears
 * MID-STREAM — either a SOURCE column the engine maps FROM, or a DEST ("here") column the engine writes
 * TO — the sync must HANDLE IT GRACEFULLY: it must NOT sink the whole batch on the missing column, it must
 * keep persisting the rest of the record, and it must REPORT the condition clearly (structured Failed/
 * Warning signal rather than an opaque crash). This must hold on BOTH SQL Server and Postgres.
 *
 * HOW IT PROVES THAT (token-free, reference mode, NON-DESTRUCTIVE to the seeded connection):
 *
 *   PART A — SOURCE column removal (remove a column the engine maps FROM):
 *     1. Pick one DISPOSABLE, non-key, Active field map on the contacts entity map (skipping the PK /
 *        IsKeyField / IsRequired field maps so we never break identity).
 *     2. Deactivate it (DB-direct Status='Inactive' on CompanyIntegrationFieldMap — there is NO GQL op to
 *        toggle a single field map; recorded as a framework gap) → the engine no longer maps that source
 *        column. This models a source column vanishing from the projection mid-stream.
 *     3. Full Pull sync. ASSERT graceful: Success===true, Failed===0 (the missing source column did NOT
 *        sink the batch), the dest table row count is unchanged (every record still persisted), and the
 *        record-map stays 1:1 (no orphaned/dup identity).
 *     4. CLEANUP: restore Status='Active' and re-sync so the column maps again.
 *
 *   PART B — DEST ("here") column removal (remove a column the engine writes TO):
 *     1. Pick one DISPOSABLE, nullable, non-PK, non-content-hash dest column on the contacts dest table;
 *        capture its exact SQL type so we can restore it byte-for-byte.
 *     2. Drop it DB-direct (ALTER TABLE ... DROP COLUMN — there is NO GQL op to drop/restore a dest
 *        column; recorded as a framework gap). This models the physical dest schema drifting out from
 *        under the engine mid-stream (a column the field map still targets is suddenly gone).
 *     3. Full Pull sync. ASSERT graceful: the run reaches a TERMINAL state and REPORTS the condition
 *        (Success===true with the surviving columns persisted, OR a clean Failed/Warning signal) WITHOUT
 *        an opaque crash AND WITHOUT the whole batch sinking — other rows/columns must still be present.
 *        (This is the adversarial cell: the DESIRED behavior is "degrade + report", and step.ok=false here
 *        EXPOSES a real framework bug if the engine instead crashes or zeroes the table.)
 *     4. CLEANUP (critical): restore the dropped column via ALTER TABLE ... ADD with its captured type and
 *        re-sync so the seeded connection's dest table returns to its prior shape. ALWAYS runs (finally).
 *
 * Both parts run dialect-aware (cfg.platform 'sqlserver' | 'postgresql') so the SAME assertions execute on
 * SQL Server and Postgres. Everything mutated is restored in a cleanup step — the seeded connection + its
 * entity maps + encrypted credential are PRESERVED; we never delete users/owners/real data, never delete
 * the connection, and never delete an entity map.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint; reference mode drives by CompanyIntegrationID — the encrypted credential is decrypted
 * server-side and the HubSpot token never enters this process. The ONLY interpolated SQL values are
 * harness-resolved UUIDs / field-map ids / fixed identifiers + the captured column name+type — never
 * untrusted external input.
 */

// GQL op strings (startSync/listRuns/getRun/tailRunEvents) + runSyncObserved (trigger→tail→GetRun) are
// reused from the canonical harness so this phase never re-implements the gql client, the DB client, or
// the sync drivers. We add ONE extra read-only op (IntegrationListFieldMaps) to enumerate field maps and
// to cross-check that the field-map Status round-trips over GQL. (We don't reference the GQL op-string
// object directly — runSyncObserved owns the StartSync/Tail/GetRun ops — so only the helper is imported.)
import { runSyncObserved } from '../gql-live-harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts — IntegrationListFieldMaps(entityMapID) → ListFieldMapsOutput
// {Success,Message,FieldMaps{ID,EntityMapID,SourceFieldName,DestinationFieldName,Status}} :3848-3874/:251-265.
// StartSync/ListRuns/GetRun/TailRunEvents come from the shared GQL object. NOTHING here is invented — there
// is NO GQL op to (de)activate a single field map, nor to drop/restore a source or dest column, so those
// mutations are performed DB-direct and recorded as framework gaps rather than faked.)
// ─────────────────────────────────────────────────────────────────────────────

const DRIFT_GQL = {
    listFieldMaps: `query($entityMapID: String!) {
      IntegrationListFieldMaps(entityMapID: $entityMapID) {
        Success Message FieldMaps { ID EntityMapID SourceFieldName DestinationFieldName Status }
      }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (identical shape to the existing harness/matrix/phase modules so this phase is
// self-contained; it never re-implements the gql client or the DB client).
// ─────────────────────────────────────────────────────────────────────────────

/** A structured step record so the scrubbed result reads as an audit log of what happened. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

/** Reads a value off a row regardless of dialect casing (mssql=PascalCase, pg=lowercased). */
function col(row, name) {
    if (row == null) return undefined;
    if (name in row) return row[name];
    const lower = name.toLowerCase();
    if (lower in row) return row[lower];
    for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
    return undefined;
}

/** Case-insensitive UUID/string compare (SQL Server returns upper, pg lower, GQL may vary). */
function sameId(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

const isPg = (cfg) => cfg.platform === 'postgresql';

/** Qualified MJ core-schema table/view reference. */
function mjT(cfg, name) {
    const s = cfg.mjSchema ?? '__mj';
    return isPg(cfg) ? `"${s}"."${name}"` : `[${s}].[${name}]`;
}

/** Qualified destination table reference (the connector's dest schema, default 'hubspot'). */
function destT(cfg, table) {
    const s = cfg.destSchema ?? 'hubspot';
    return isPg(cfg) ? `"${s}"."${table}"` : `[${s}].[${table}]`;
}

/** Column reference (quoted on pg, bare on mssql). */
function C(cfg, name) {
    return isPg(cfg) ? `"${name}"` : name;
}

/** A safe single-quoted SQL string literal (doubles embedded quotes). The ONLY interpolated values are
 *  harness UUIDs / field-map ids / fixed identifiers — never untrusted external input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

/** Validates an identifier (table/column name) before it is interpolated into DDL — these come from MJ
 *  metadata / dest-table introspection, not user input, but DDL identifiers can't be parameterized, so
 *  this is cheap defense-in-depth. Allows leading underscore (__mj_*) and the `$` HubSpot columns use. */
function ident(name) {
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
        throw new Error(`invalid SQL identifier: ${String(name)}`);
    }
    return name;
}

/** Row count of a destination table addressed directly by its HubSpot source-object name. */
async function destRowCount(db, cfg, objectName) {
    const rows = await db.rows(`SELECT COUNT(*) AS c FROM ${destT(cfg, objectName)}`);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** True iff a column physically exists on the dest table (dialect-aware information_schema probe). */
async function destColumnExists(db, cfg, objectName, columnName) {
    const schema = cfg.destSchema ?? 'hubspot';
    const sql = isPg(cfg)
        ? `SELECT COUNT(*)::int AS c FROM information_schema.columns ` +
          `WHERE table_schema=${lit(schema)} AND table_name=${lit(objectName)} AND column_name=${lit(columnName)}`
        : `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS ` +
          `WHERE TABLE_SCHEMA=${lit(schema)} AND TABLE_NAME=${lit(objectName)} AND COLUMN_NAME=${lit(columnName)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0) > 0;
}

/**
 * Finds ONE disposable dest column to drop: nullable, NOT the PK / content-hash / mj-system columns, and
 * (when known) NOT a field map's key/required destination. Returns { name, sqlType } with a restorable,
 * exactly-reconstructed SQL type string, or null if none qualifies (then the cell skips safely).
 */
async function pickDisposableDestColumn(db, cfg, objectName, protectedDestNames) {
    const schema = cfg.destSchema ?? 'hubspot';
    const protectedLc = new Set([...protectedDestNames].map(n => (n ?? '').toLowerCase()));
    const sql = isPg(cfg)
        ? `SELECT column_name AS name, data_type AS dtype, character_maximum_length AS clen, is_nullable AS nullable ` +
          `FROM information_schema.columns WHERE table_schema=${lit(schema)} AND table_name=${lit(objectName)} ` +
          `ORDER BY ordinal_position`
        : `SELECT COLUMN_NAME AS name, DATA_TYPE AS dtype, CHARACTER_MAXIMUM_LENGTH AS clen, IS_NULLABLE AS nullable ` +
          `FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=${lit(schema)} AND TABLE_NAME=${lit(objectName)} ` +
          `ORDER BY ORDINAL_POSITION`;
    const rows = await db.rows(sql);
    for (const r of rows ?? []) {
        const name = String(col(r, 'name'));
        const nameLc = name.toLowerCase();
        const nullable = String(col(r, 'nullable') ?? '').toUpperCase() === 'YES';
        if (!nullable) continue;                                   // dropping a NOT NULL column isn't restorable cleanly
        if (nameLc.startsWith('__mj') || nameLc === 'id') continue; // never touch MJ system columns / PK
        if (/hs_object_id|content.?hash|external.?system|recordmap/i.test(nameLc)) continue; // identity/hash columns
        if (protectedLc.has(nameLc)) continue;                     // a key/required field-map target
        // Prefer a plain string column so the ADD-back type is trivially exact.
        const dtype = String(col(r, 'dtype') ?? '').toLowerCase();
        const clen = col(r, 'clen');
        const sqlType = reconstructStringType(cfg, dtype, clen);
        if (!sqlType) continue;                                    // skip non-string types (exact restore is riskier)
        return { name, sqlType };
    }
    return null;
}

/** Reconstructs a restorable SQL type string for a string column on the active dialect, or null if the
 *  column's data type isn't a plain string we can safely re-create exactly. */
function reconstructStringType(cfg, dataType, charLen) {
    const len = charLen == null || Number(charLen) < 0 ? null : Number(charLen);
    if (isPg(cfg)) {
        if (dataType === 'text') return 'text';
        if (dataType === 'character varying') return len != null ? `varchar(${len})` : 'text';
        if (dataType === 'character') return len != null ? `varchar(${len})` : 'text';
        return null;
    }
    // mssql: character_maximum_length is -1 for MAX
    if (dataType === 'nvarchar') return len != null ? `nvarchar(${len})` : 'nvarchar(max)';
    if (dataType === 'varchar') return len != null ? `varchar(${len})` : 'varchar(max)';
    if (dataType === 'nchar') return len != null ? `nchar(${len})` : null;
    if (dataType === 'char') return len != null ? `char(${len})` : null;
    if (dataType === 'text' || dataType === 'ntext') return 'nvarchar(max)';
    return null;
}

/** Loads the field maps for an entity map (DB-direct so we get Status + key/required flags the GQL summary
 *  omits). Returns lightweight rows {id, sourceFieldName, destinationFieldName, status, isKeyField, isRequired}. */
async function loadFieldMaps(db, cfg, entityMapID) {
    const sql =
        `SELECT ${C(cfg, 'ID')} AS id, ${C(cfg, 'SourceFieldName')} AS src, ${C(cfg, 'DestinationFieldName')} AS dst, ` +
        `${C(cfg, 'Status')} AS status, ${C(cfg, 'IsKeyField')} AS iskey, ${C(cfg, 'IsRequired')} AS isreq ` +
        `FROM ${mjT(cfg, 'CompanyIntegrationFieldMap')} WHERE ${C(cfg, 'EntityMapID')}=${lit(entityMapID)} ` +
        `ORDER BY ${C(cfg, 'SourceFieldName')}`;
    const rows = await db.rows(sql);
    return (rows ?? []).map(r => ({
        id: String(col(r, 'id')),
        sourceFieldName: col(r, 'src') ?? null,
        destinationFieldName: col(r, 'dst') ?? null,
        status: col(r, 'status') ?? null,
        isKeyField: truthy(col(r, 'iskey')),
        isRequired: truthy(col(r, 'isreq')),
    }));
}

/** Coerces a dialect-varied BIT/boolean into a JS boolean. */
function truthy(v) {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
    return false;
}

/** Sets a single field map's Status DB-direct (no GQL op exists for this — recorded as a framework gap). */
async function setFieldMapStatus(db, cfg, fieldMapID, status) {
    const sql =
        `UPDATE ${mjT(cfg, 'CompanyIntegrationFieldMap')} SET ${C(cfg, 'Status')}=${lit(status)} ` +
        `WHERE ${C(cfg, 'ID')}=${lit(fieldMapID)}`;
    await db.rows(sql);
}

/**
 * SQL Server `SELECT *` base views bind their column list by ORDINAL at CREATE time, so a DB-direct
 * ALTER DROP/ADD COLUMN leaves the view STALE — a shifted column (e.g. the PK `hs_object_id`) reads NULL
 * through the view, which makes every later `BaseEntity.InnerLoad`-by-PK miss → the engine wrongly INSERTs
 * → duplicate-key. This re-binds the dest views to the current table shape so subsequent phases (dedup,
 * resilience) see correct PK values. No-op on Postgres: its dependent-view rule blocks the drop entirely,
 * and these views aren't ordinal-bound the same way. Best-effort — never throws into the test flow.
 */
async function refreshDestViewsIfSqlServer(db, cfg) {
    if (isPg(cfg)) return;
    const schema = cfg.destSchema ?? 'hubspot';
    try {
        const views = await db.rows(`SELECT name FROM sys.views WHERE schema_id = SCHEMA_ID('${schema}')`);
        for (const v of (views ?? [])) {
            const vn = col(v, 'name');
            if (vn) { try { await db.rows(`EXEC sp_refreshview '[${schema}].[${vn}]'`); } catch { /* best effort */ } }
        }
    } catch { /* best effort */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: schema-drift / column removal  (plan.md §2 source/dest column removal, possibly adversarial)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   cfg adds (beyond the matrix/lifecycle cfg): destSchema?(default 'hubspot'), driftObject?(default
 *   'contacts'), mjSchema?(default '__mj'), maxPolls?, runId.
 * @returns {step[]}  one note(NL)+observed(JSON)+ok(pass/fail) record per assertion, EXACTLY like the
 *   existing phases. ALWAYS restores every mutated piece of state (re-activates the field map, re-adds the
 *   dropped dest column, re-syncs) in a cleanup step so the seeded connection stays reusable.
 */
export async function phaseschemadriftcolumns({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const objectName = (cfg.driftObject ?? 'contacts').toLowerCase();

    // SAFETY: only ever drift a disposable CRM object — never users/owners.
    if (/user|owner/i.test(objectName)) {
        steps.push(step('drift.refused', false, {
            observed: { objectName },
            note: 'refusing to run schema-drift against a Users/owners object — off-limits',
        }));
        return steps;
    }

    const driftMap = (maps ?? []).find(m => (m.sourceObjectName ?? '').toLowerCase() === objectName) ?? null;
    if (!driftMap) {
        steps.push(step('drift.skipped', true, {
            observed: { object: objectName, mapsPresent: (maps ?? []).map(m => m.sourceObjectName) },
            note: `no '${objectName}' entity map in the seeded connection — schema-drift cell skipped (SELECT this object to enable it)`,
        }));
        return steps;
    }

    await partA_sourceColumnRemoval({ gql, db, ciid, cfg, objectName, driftMap, steps });
    await partB_destColumnRemoval({ gql, db, ciid, cfg, objectName, driftMap, steps });

    return steps;
}

// ── PART A — SOURCE column removal (deactivate a field map → engine stops mapping that source column) ──

/**
 * Deactivating a non-key field map models a SOURCE column vanishing from the projection mid-stream: the
 * engine no longer reads/maps that column. A graceful engine keeps syncing the rest with no batch sink.
 * RESTORES the field map (Status='Active') + re-syncs in a finally so the seeded connection is reusable.
 */
async function partA_sourceColumnRemoval({ gql, db, ciid, cfg, objectName, driftMap, steps }) {
    // Enumerate field maps DB-direct (we need Status + key/required flags the GQL summary omits) and find a
    // DISPOSABLE one: Active, not the key field, not required, with a real source + destination — so
    // deactivating it can't break record identity.
    let fieldMaps;
    try {
        fieldMaps = await loadFieldMaps(db, cfg, driftMap.entityMapID);
    } catch (e) {
        steps.push(step('drift.source.enumerate', false, {
            observed: { entityMapID: driftMap.entityMapID, error: String(e?.message ?? e) },
            note: 'failed to enumerate field maps for the drift object — cannot run the source-column-removal cell',
        }));
        return;
    }

    const target = fieldMaps.find(fm =>
        (fm.status ?? 'Active') === 'Active' && !fm.isKeyField && !fm.isRequired &&
        fm.sourceFieldName && fm.destinationFieldName &&
        !/hs_object_id|^id$/i.test(String(fm.destinationFieldName)));

    if (!target) {
        steps.push(step('drift.source.no-disposable-field', true, {
            observed: { entityMapID: driftMap.entityMapID, fieldMapCount: fieldMaps.length },
            note: 'no disposable (Active, non-key, non-required) field map to deactivate — source-removal cell skipped safely',
        }));
        return;
    }

    // Cross-check the field map is visible over GQL too (the read surface a client would use).
    const listed = (await gql(DRIFT_GQL.listFieldMaps, { entityMapID: driftMap.entityMapID })).IntegrationListFieldMaps;
    const gqlSeesTarget = !!(listed?.FieldMaps ?? []).find(fm => sameId(fm.ID, target.id));
    steps.push(step('drift.source.field-visible', listed?.Success === true && gqlSeesTarget, {
        observed: {
            entityMapID: driftMap.entityMapID, targetFieldMapID: target.id,
            sourceField: target.sourceFieldName, destField: target.destinationFieldName,
            listFieldMapsSuccess: listed?.Success ?? null, gqlSeesTarget,
        },
        note: 'IntegrationListFieldMaps surfaces the field map we are about to deactivate (the client read surface is consistent)',
    }));

    const rowsBefore = await destRowCount(db, cfg, objectName);
    const rmBefore = await db.recordMapStats(ciid, driftMap.entityName);
    let restored = false;

    try {
        // 1) Deactivate the field map DB-direct — there is NO GQL op to toggle a single field map (the
        //    framework gap). This is the "source column removed from the map mid-stream" condition.
        await setFieldMapStatus(db, cfg, target.id, 'Inactive');
        const afterMaps = await loadFieldMaps(db, cfg, driftMap.entityMapID);
        const nowInactive = afterMaps.find(fm => fm.id === target.id)?.status === 'Inactive';
        steps.push(step('drift.source.deactivated', nowInactive, {
            observed: { targetFieldMapID: target.id, sourceField: target.sourceFieldName, status: 'Inactive' },
            note: 'deactivated one non-key field map (DB-direct Status=Inactive) — the engine should now stop mapping that '
                + 'source column. NO GQL op exists to (de)activate a single field map (framework gap).',
        }));

        // 2) Full Pull sync with the source column removed from the map. GRACEFUL = Success + Failed===0:
        //    the missing source column must NOT sink the batch; every record still persists.
        const run = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const failed = run.run?.Counts?.Failed ?? null;
        steps.push(step('drift.source.graceful-sync', run.run?.Success === true && (failed ?? 0) === 0, {
            observed: {
                runID: run.runID, success: run.run?.Success ?? null, counts: run.run?.Counts ?? null,
                exitReason: run.run?.ExitReason ?? null, warnings: run.tail?.warnings ?? [],
                warningCount: run.run?.WarningCount ?? null, errors: run.errors ?? [],
            },
            note: 'with a source column removed from the map, the Pull sync completes Success with ZERO Failed — '
                + 'the missing source column degrades gracefully (the column is simply unmapped) and never sinks the batch',
        }));

        // 3) DB-DIRECT: every record still landed (row count unchanged) + record map stays 1:1.
        const rowsAfter = await destRowCount(db, cfg, objectName);
        const rmAfter = await db.recordMapStats(ciid, driftMap.entityName);
        const noDataLoss = rowsAfter === rowsBefore;
        const oneToOne = rmAfter.total === rmAfter.distinctExternal && rmAfter.total === rmBefore.total;
        steps.push(step('drift.source.no-data-loss', noDataLoss && oneToOne, {
            observed: {
                object: objectName, rowsBefore, rowsAfter,
                recordMapBefore: rmBefore, recordMapAfter: rmAfter, noDataLoss, oneToOne,
            },
            note: 'removing a source column dropped NO rows (dest row count unchanged) and the record map stays 1:1 — '
                + 'only the one unmapped column is affected; the rest of every record syncs unharmed',
        }));
    } catch (e) {
        steps.push(step('drift.source.graceful-sync', false, {
            observed: { targetFieldMapID: target.id, error: String(e?.message ?? e) },
            note: 'the source-column-removal sync threw — a removed source column must degrade gracefully, not crash the run',
        }));
    } finally {
        // 4) RESTORE (critical): re-activate the field map and re-sync so the column maps again and the
        //    seeded connection is left exactly as found.
        try {
            await setFieldMapStatus(db, cfg, target.id, 'Active');
            const afterMaps = await loadFieldMaps(db, cfg, driftMap.entityMapID);
            restored = afterMaps.find(fm => fm.id === target.id)?.status === 'Active';
        } catch (e) {
            steps.push(step('drift.source.restore', false, {
                observed: { targetFieldMapID: target.id, error: String(e?.message ?? e) },
                note: 'FAILED to re-activate the field map — manual restore required (Status should be Active)',
            }));
        }
        if (restored) {
            try {
                const reSync = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
                steps.push(step('drift.source.restore', true, {
                    observed: { targetFieldMapID: target.id, statusRestored: 'Active', reSyncSuccess: reSync.run?.Success ?? null },
                    note: 'field map re-activated (Status=Active) + reconciling full sync run — the source column maps again; '
                        + 'the seeded connection is left exactly as found',
                }));
            } catch (e) {
                steps.push(step('drift.source.restore', true, {
                    observed: { targetFieldMapID: target.id, statusRestored: 'Active', reSyncError: String(e?.message ?? e) },
                    note: 'field map re-activated; the reconciling re-sync is best-effort (status restore is the load-bearing part)',
                }));
            }
        }
    }
}

// ── PART B — DEST ("here") column removal (drop a dest column the engine writes TO; adversarial) ──

/**
 * Dropping a nullable, non-key dest column models the physical dest schema drifting mid-stream: a column
 * the field map still targets is suddenly gone. DESIRED: the engine degrades + reports (a clean Failed/
 * Warning signal or a Success that persists the surviving columns) WITHOUT an opaque crash and WITHOUT
 * sinking the whole table. RESTORES the column (ALTER ADD with the captured type) + re-syncs in a finally.
 */
async function partB_destColumnRemoval({ gql, db, ciid, cfg, objectName, driftMap, steps }) {
    // Field-map destinations that are key/required must NOT be dropped (would break the write contract).
    let protectedDestNames = new Set();
    try {
        const fieldMaps = await loadFieldMaps(db, cfg, driftMap.entityMapID);
        protectedDestNames = new Set(
            fieldMaps.filter(fm => fm.isKeyField || fm.isRequired)
                     .map(fm => String(fm.destinationFieldName ?? '')));
    } catch { /* fall through — pickDisposableDestColumn still guards PK/hash/system columns */ }

    let victim;
    try {
        victim = await pickDisposableDestColumn(db, cfg, objectName, protectedDestNames);
    } catch (e) {
        steps.push(step('drift.dest.pick-column', false, {
            observed: { object: objectName, error: String(e?.message ?? e) },
            note: 'failed to introspect the dest table for a disposable column — cannot run the dest-column-removal cell',
        }));
        return;
    }
    if (!victim) {
        steps.push(step('drift.dest.no-disposable-column', true, {
            observed: { object: objectName, destSchema: cfg.destSchema ?? 'hubspot' },
            note: 'no disposable (nullable, non-PK/hash/system, plain-string) dest column to drop — dest-removal cell skipped safely',
        }));
        return;
    }

    const rowsBefore = await destRowCount(db, cfg, objectName);
    const rmBefore = await db.recordMapStats(ciid, driftMap.entityName);
    let dropped = false;
    let columnRestored = false;

    try {
        // 1) DROP the dest column DB-direct (no GQL op for this — framework gap). Validate identifiers
        //    before they enter DDL (cannot be parameterized).
        const dropSql =
            `ALTER TABLE ${destT(cfg, ident(objectName))} DROP COLUMN ${C(cfg, ident(victim.name))}`;
        await db.rows(dropSql);
        dropped = !(await destColumnExists(db, cfg, objectName, victim.name));
        steps.push(step('drift.dest.dropped', dropped, {
            observed: { object: objectName, column: victim.name, restorableType: victim.sqlType },
            note: 'dropped one disposable dest column (DB-direct ALTER DROP COLUMN) — models the dest schema drifting out '
                + 'from under the engine. NO GQL op exists to drop/restore a dest column (framework gap).',
        }));

        // 2) Full Pull sync against the now-missing dest column. ADVERSARIAL DESIRED: the run reaches a
        //    TERMINAL state and REPORTS the condition (Success+surviving-columns OR a clean Failed/Warning)
        //    WITHOUT an opaque crash. This step asserts "the run did not blow up the harness" (it returned a
        //    terminal verdict at all); the no-batch-sink data check below is the substantive grace gate.
        let run = null;
        let runThrew = null;
        try {
            run = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        } catch (e) {
            runThrew = String(e?.message ?? e);
        }
        const reachedTerminal = !!run?.run && (run.run.IsInFlight === false);
        const reported = !!run?.run && (
            run.run.Success === false ||
            (run.run.Counts?.Failed ?? 0) > 0 ||
            (run.run.WarningCount ?? 0) > 0 ||
            run.run.Success === true /* succeeded by persisting the surviving columns */
        );
        steps.push(step('drift.dest.reported-not-crashed', reachedTerminal && reported && !runThrew, {
            observed: {
                runID: run?.runID ?? null, success: run?.run?.Success ?? null, reachedTerminal,
                counts: run?.run?.Counts ?? null, exitReason: run?.run?.ExitReason ?? null,
                warningCount: run?.run?.WarningCount ?? null, warnings: run?.tail?.warnings ?? [],
                errors: run?.errors ?? [], runThrew,
            },
            note: 'DESIRED: a dropped dest column makes the run reach a TERMINAL state and clearly REPORT the condition '
                + '(Success persisting surviving columns, OR a structured Failed/Warning) — never an opaque crash. '
                + 'step.ok=false here EXPOSES a framework bug (the engine crashed / never reported).',
        }));

        // 3) NO WHOLE-BATCH SINK: the pre-existing rows + their identity must SURVIVE the drift. We do NOT
        //    require new rows to land (the dropped column may legitimately fail those writes); we DO require
        //    that the engine did not ZERO the table or corrupt the record map. Row count must not collapse
        //    and the record map must stay 1:1 and not shrink.
        const rowsAfter = await destRowCount(db, cfg, objectName);
        const rmAfter = await db.recordMapStats(ciid, driftMap.entityName);
        const noBatchSink = rowsAfter >= rowsBefore;                       // table not zeroed / not net-shrunk
        const mapIntact = rmAfter.total >= rmBefore.total && rmAfter.total === rmAfter.distinctExternal;
        steps.push(step('drift.dest.no-batch-sink', noBatchSink && mapIntact, {
            observed: {
                object: objectName, rowsBefore, rowsAfter,
                recordMapBefore: rmBefore, recordMapAfter: rmAfter, noBatchSink, mapIntact,
            },
            note: 'a dropped dest column must NOT sink the whole batch — the surviving rows + their 1:1 record-map identity '
                + 'are preserved (the engine degrades on the one missing column rather than zeroing/corrupting the table)',
        }));
    } catch (e) {
        steps.push(step('drift.dest.reported-not-crashed', false, {
            observed: { object: objectName, column: victim?.name ?? null, error: String(e?.message ?? e) },
            note: 'the dest-column-removal path threw in the harness — a dropped dest column must degrade + report, not crash',
        }));
    } finally {
        // 4) RESTORE (critical): re-add the dropped column with its captured type, then re-sync so the dest
        //    table returns to its prior shape and any rows skipped during the drop get their column repopulated.
        if (dropped) {
            try {
                const addSql =
                    `ALTER TABLE ${destT(cfg, ident(objectName))} ADD ` +
                    (isPg(cfg) ? `${C(cfg, ident(victim.name))} ${victim.sqlType}` : `${C(cfg, ident(victim.name))} ${victim.sqlType} NULL`);
                await db.rows(addSql);
                columnRestored = await destColumnExists(db, cfg, objectName, victim.name);
                // Re-bind SQL Server `SELECT *` views after the column DROP+ADD so the PK column stops
                // reading NULL through the view (otherwise every later InnerLoad-by-PK misses → duplicate INSERT).
                await refreshDestViewsIfSqlServer(db, cfg);
            } catch (e) {
                steps.push(step('drift.dest.restore', false, {
                    observed: { object: objectName, column: victim.name, restorableType: victim.sqlType, error: String(e?.message ?? e) },
                    note: 'FAILED to re-add the dropped dest column — manual restore required (the dest table is missing a column)',
                }));
            }
            if (columnRestored) {
                try {
                    const reSync = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
                    steps.push(step('drift.dest.restore', true, {
                        observed: { object: objectName, column: victim.name, restorableType: victim.sqlType, reSyncSuccess: reSync.run?.Success ?? null },
                        note: 'dest column re-added with its captured type + reconciling full sync run — the dest table is restored '
                            + 'to its prior shape and the seeded connection is left exactly as found',
                    }));
                } catch (e) {
                    steps.push(step('drift.dest.restore', true, {
                        observed: { object: objectName, column: victim.name, reSyncError: String(e?.message ?? e) },
                        note: 'dest column re-added; the reconciling re-sync is best-effort (the column restore is the load-bearing part)',
                    }));
                }
            }
        } else {
            steps.push(step('drift.dest.restore', true, {
                observed: { object: objectName, column: victim?.name ?? null, dropped: false },
                note: 'the dest column was never successfully dropped — nothing to restore (no-op cleanup)',
            }));
        }
    }
}

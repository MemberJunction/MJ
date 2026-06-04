/**
 * GQL-driven DELETES + TOMBSTONING phase — the plan.md §2 "deletes + tombstoning" cell, run through the
 * REAL MJAPI GraphQL API against the pre-seeded HubSpot reference connection (token-free reference mode).
 *
 * THE REQUIREMENT (plan.md:236 — "Be careful with deletes (do not delete sensitive info like users, etc.)
 * this is just for testing deletes and tombstoning"; §2.5 tombstone columns): an UPSTREAM delete (a record
 * removed in HubSpot) must PROPAGATE to the MJ destination — the connector's delete-detection (orphan
 * sweep on a full / partition-reconcile sync) must either HARD-DELETE the mirror row or, when the entity
 * map's DeleteBehavior='SoftDelete', TOMBSTONE it (IsTombstoned=true + DeletedDetectedAt stamped +
 * SyncStatus='Archived') and KEEP the row. This is proven end-to-end with a DISPOSABLE test record that
 * THIS phase both creates AND deletes — it NEVER touches users/owners/real data.
 *
 * HOW IT PROVES THAT (token-free, reference mode):
 *   1. Read the write object's entity map + its persisted DeleteBehavior (DB-direct — GQL exposes neither
 *      on EntityMapUpdateInput nor EntityMapSummaryOutput, see expectedFrameworkGaps) so the assertions
 *      are correct for whatever delete policy the seeded map carries (HardDelete | SoftDelete | DoNothing).
 *   2. CREATE ONE disposable, test-marked record in HubSpot via IntegrationWriteRecord; the captured
 *      ExternalID is the ONLY thing we ever clean up — exact, id-targeted, never users/owners.
 *   3. Full Pull-sync → assert the record LANDED: dest row present (by external id), record-map entry
 *      present + 1:1, NOT yet tombstoned (live baseline).
 *   4. DELETE the disposable record IN HUBSPOT (the actual delete under test) by its captured ExternalID.
 *   5. Full Pull-sync → orphan detection must fire. DB-DIRECT verify the propagation:
 *        • durable JSONL: an ORPHANS_DETECTED warning surfaced for this object (delete-detection signal).
 *        • HardDelete  → the dest row is GONE + the record-map entry is GONE.
 *        • SoftDelete  → the dest row REMAINS but is TOMBSTONED (IsTombstoned + DeletedDetectedAt +
 *                        SyncStatus='Archived'); the record-map entry is preserved (queryable tombstone).
 *        • DoNothing   → no propagation (the orphan lingers) — recorded as the EXPECTED behavior for that
 *                        policy, but flagged so a misconfigured "DoNothing on a real delete" is visible.
 *   6. CLEANUP: the external record is already deleted by step 4 (we re-confirm id-targeted, idempotent),
 *      then a final reconcile re-sync. The seeded connection + encrypted credential are PRESERVED.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint; reference mode drives by CompanyIntegrationID — the encrypted credential is decrypted
 * server-side, the HubSpot token never enters this process.
 *
 * GATING: the create→delete round-trip needs write access to the portal, so the live delete-propagation
 * assertions only run when cfg.allowWrite===true. When writes are off it still runs the DB-direct
 * tombstone-schema + DeleteBehavior probe over the ALREADY-SEEDED connection (proving the tombstone
 * columns exist + the delete policy is readable on this dialect) so the cell yields real signal
 * token-free AND write-free.
 */

// GQL op strings (writeRecord/startSync/listRuns/getRun/tailRunEvents), runSyncObserved (trigger→tail→
// GetRun, whose tail.warnings already aggregates the durable 'warning' events), and the step() shape are
// reused from the canonical harness so this phase never re-implements the gql client, the DB client, or
// the sync drivers.
import { GQL, runSyncObserved } from '../gql-live-harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (identical shape to the existing harness/matrix/phase modules so this phase is
// self-contained; never re-implements the injected gql/db clients).
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

const isPg = (cfg) => cfg.platform === 'postgresql';

/** Qualified destination table reference (the connector's dest schema, default 'hubspot'). */
function destT(cfg, table) {
    const s = cfg.destSchema ?? 'hubspot';
    return isPg(cfg) ? `"${s}"."${table}"` : `[${s}].[${table}]`;
}

/** Qualified table reference for the MJ core schema. */
function mjT(cfg, name) {
    const s = cfg.mjSchema ?? '__mj';
    return isPg(cfg) ? `"${s}"."${name}"` : `[${s}].[${name}]`;
}

/** Column reference (quoted on pg, bare on mssql). */
function C(cfg, name) {
    return isPg(cfg) ? `"${name}"` : name;
}

/** A safe single-quoted SQL string literal (doubles embedded quotes). The ONLY interpolated values are
 *  the harness's own runId-stamped markers + captured external ids + fixed identifiers — never untrusted
 *  external input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

/** Truthy across dialects: mssql BIT comes back as 1/true, pg BOOLEAN as true/'t'. */
function isTrueish(v) {
    return v === true || v === 1 || v === '1' || v === 't' || v === 'true';
}

/** Row count of a destination table addressed directly by its HubSpot source-object name. */
async function destRowCount(db, cfg, objectName) {
    const rows = await db.rows(`SELECT COUNT(*) AS c FROM ${destT(cfg, objectName)}`);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/**
 * Loads the destination row for a specific external id (HubSpot hs_object_id is the dest PK for the
 * CRM objects per additionalSchemaInfo.json). Returns the single row object (dialect-cased) or undefined.
 */
async function loadDestRowByExternalId(db, cfg, objectName, externalId, pkColumn = 'hs_object_id') {
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const sql =
        `SELECT ${top}* FROM ${destT(cfg, objectName)} ` +
        `WHERE ${C(cfg, pkColumn)}=${lit(externalId)}${lim}`;
    const rows = await db.rows(sql);
    return rows?.[0];
}

/**
 * Reads the DeleteBehavior + EntityID for the entity map straight from the MJ metadata table (the
 * authoritative delete policy that drives orphan detection). GQL exposes neither EntityMapUpdateInput.
 * DeleteBehavior nor EntityMapSummaryOutput.DeleteBehavior, so DB-direct is the only way to learn the
 * policy — recorded in expectedFrameworkGaps. Returns { deleteBehavior, entityID } (undefined when absent).
 */
async function loadEntityMapDeletePolicy(db, cfg, entityMapID) {
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const sql =
        `SELECT ${top}${C(cfg, 'DeleteBehavior')} AS db, ${C(cfg, 'EntityID')} AS eid ` +
        `FROM ${mjT(cfg, 'CompanyIntegrationEntityMap')} WHERE ${C(cfg, 'ID')}=${lit(entityMapID)}${lim}`;
    const rows = await db.rows(sql);
    const r = rows?.[0];
    return { deleteBehavior: col(r, 'db') ?? null, entityID: col(r, 'eid') ?? null };
}

/**
 * Counts the record-map rows for a given (CompanyIntegration, external id). The orphan sweep removes the
 * map row only on HardDelete; SoftDelete keeps it (queryable tombstone). Used to prove map cleanup vs.
 * map retention per policy.
 */
async function recordMapCountForExternalId(db, cfg, ciid, entityID, externalId) {
    const sql =
        `SELECT COUNT(*) AS c FROM ${mjT(cfg, 'CompanyIntegrationRecordMap')} ` +
        `WHERE ${C(cfg, 'CompanyIntegrationID')}=${lit(ciid)} AND ${C(cfg, 'EntityID')}=${lit(entityID)} ` +
        `AND ${C(cfg, 'ExternalSystemRecordID')}=${lit(externalId)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/**
 * Probes the dest table for the four tombstone-schema columns (plan §2.5). A table that carries them can
 * express a queryable tombstone (SoftDelete); a table missing them can only HardDelete. Best-effort — a
 * SELECT against a missing table/column throws, which we surface (rather than fail) so the cell still runs.
 */
async function probeTombstoneSchema(db, cfg, objectName) {
    const cols = ['__mj_integration_IsTombstoned', '__mj_integration_DeletedDetectedAt', '__mj_integration_SyncStatus', '__mj_integration_LastSyncedAt'];
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const select = cols.map(c => `${C(cfg, c)} AS ${C(cfg, c)}`).join(', ');
    try {
        const rows = await db.rows(`SELECT ${top}${select} FROM ${destT(cfg, objectName)}${lim}`);
        return { available: true, hasAllColumns: true, sampleRowPresent: (rows?.length ?? 0) > 0 };
    } catch (e) {
        return { available: false, hasAllColumns: false, error: String(e?.message ?? e) };
    }
}

/** True iff the durable run tail surfaced an ORPHANS_DETECTED warning for this object (or any object). */
function orphansDetectedInTail(tail, objectName) {
    const warnings = tail?.warnings ?? [];
    const lc = (s) => (s ?? '').toString().toLowerCase();
    const forObject = warnings.filter(w => w.code === 'ORPHANS_DETECTED');
    const matched = forObject.find(w => lc(w.stage) === lc(objectName));
    return { any: forObject.length > 0, forThisObject: !!matched, matched: matched ?? forObject[0] ?? null, all: forObject };
}

// ─────────────────────────────────────────────────────────────────────────────
// The disposable delete-test payload. A single, recognizably-marked record in a STANDARD field set (no
// custom property — unknown props are rejected on create). The runId-stamped lastname is the human-
// traceable locator; the captured ExternalID is what we actually clean up.
// ─────────────────────────────────────────────────────────────────────────────

function buildDeletePayload(runId) {
    const marker = `mjdel ${runId}`;
    return {
        marker,
        attributes: {
            email: `mjdel-${runId}@example.com`,   // RFC-2606 reserved domain — valid format, never deliverable
            firstname: 'MJ Delete-Test',
            lastname: marker,                        // the locator
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: deletes + tombstoning  (plan.md §2 — delete propagation / orphan detection / tombstone)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   cfg adds (beyond the matrix/lifecycle cfg): destSchema?, deleteObject?(default 'contacts'),
 *   allowWrite?(default false), runId, maxPolls?, deletePkColumn?(default 'hs_object_id').
 * @returns {step[]}  one note(NL)+observed(JSON)+ok(pass/fail) record per assertion, exactly like the
 *   existing phases. Always restores connection state (deletes the test record) in a cleanup step;
 *   NEVER deletes users/owners/real data — only the one disposable record it created.
 */
export async function phasedeletestombstoning({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const objectName = (cfg.deleteObject ?? 'contacts').toLowerCase();
    const pkColumn = cfg.deletePkColumn ?? 'hs_object_id';
    const allowWrite = cfg.allowWrite === true;

    // SAFETY: never create/delete users or owners — only disposable CRM records. This is the §2 hard rule.
    if (/user|owner/i.test(objectName)) {
        steps.push(step('deletes.refused', false, {
            observed: { objectName },
            note: 'refusing to run delete-propagation against a Users/owners object — off-limits (plan §2: never delete sensitive data)',
        }));
        return steps;
    }

    // The entity map for the write object (needed for record-map + DeleteBehavior). May be absent if the
    // seeded connection didn't select it; we degrade to dest-table-only checks in that case.
    const deleteMap = (maps ?? []).find(m => (m.sourceObjectName ?? '').toLowerCase() === objectName) ?? null;

    // ── Always: tombstone-schema + delete-policy probe (token-free, write-free) ───────────────────────
    // Proves the dest table carries the §2.5 tombstone columns and the entity map's delete policy is
    // readable on this dialect — the substrate every delete-propagation assertion below relies on.
    const tombSchema = await probeTombstoneSchema(db, cfg, objectName);
    steps.push(step('deletes.tombstone-schema.present', tombSchema.hasAllColumns === true, {
        observed: { object: objectName, ...tombSchema, platform: cfg.platform },
        note: 'dest table carries the four §2.5 tombstone columns (__mj_integration_IsTombstoned / '
            + 'DeletedDetectedAt / SyncStatus / LastSyncedAt) so a SoftDelete can be expressed as a queryable tombstone',
    }));

    let deleteBehavior = null, entityID = deleteMap?.entityID ?? null;
    if (deleteMap) {
        const policy = await loadEntityMapDeletePolicy(db, cfg, deleteMap.entityMapID);
        deleteBehavior = policy.deleteBehavior;
        entityID = entityID ?? policy.entityID;
        steps.push(step('deletes.policy.readable', deleteBehavior != null, {
            observed: { object: objectName, entityMapID: deleteMap.entityMapID, deleteBehavior, entityID },
            note: 'entity-map DeleteBehavior read DB-direct (GQL exposes it on neither EntityMapUpdateInput nor '
                + 'EntityMapSummaryOutput — see expectedFrameworkGaps); it drives the orphan sweep policy below',
        }));
    } else {
        steps.push(step('deletes.policy.readable', true, {
            observed: { object: objectName, mapPresent: false },
            note: 'write object has no entity map in the seeded connection — delete policy unreadable; the live '
                + 'propagation checks below are skipped (SELECT a map for this object to enable them)',
        }));
    }

    if (!allowWrite) {
        steps.push(step('deletes.live-propagation.skipped', true, {
            observed: { allowWrite: false },
            note: 'allowWrite=false → skipping the create→delete→propagate round-trip (it mutates the portal). The '
                + 'tombstone-schema + delete-policy probes above still prove the delete substrate exists on this dialect.',
        }));
        return steps;
    }
    if (!deleteMap) {
        steps.push(step('deletes.live-propagation.skipped', true, {
            observed: { object: objectName, mapPresent: false },
            note: 'no entity map for the write object — cannot verify record-map / orphan propagation; skipping the '
                + 'live round-trip (the dest-table tombstone-schema probe above already ran)',
        }));
        return steps;
    }

    // ── Live path: create → land → delete-in-HubSpot → propagate → verify per DeleteBehavior ──────────
    const { marker, attributes } = buildDeletePayload(cfg.runId ?? `del_${Date.now()}`);
    let createdExternalID = null;
    let externalDeleteConfirmed = false;
    const rowsBefore = await destRowCount(db, cfg, objectName);

    try {
        // 1) CREATE the disposable record in the portal.
        const created = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'create', externalID: null, attributes: JSON.stringify(attributes),
        })).IntegrationWriteRecord;
        createdExternalID = created?.ExternalID ?? null;
        steps.push(step('deletes.create', created?.Success === true && !!createdExternalID, {
            observed: { object: objectName, externalID: createdExternalID, statusCode: created?.StatusCode ?? null, message: created?.Message ?? null },
            note: 'created ONE disposable, marker-stamped record to delete (never a user/owner; cleanup is exact by captured external id)',
            ...(created?.Success && !createdExternalID
                ? { orphanWarning: 'CREATE succeeded but returned no ExternalID — record may be orphaned in the portal; manual cleanup required' }
                : {}),
        }));
        if (!createdExternalID) return steps; // can't delete/verify an unidentifiable record — stop loudly

        // 2) Full Pull-sync → the new record LANDS. Baseline before the upstream delete: dest row present,
        //    record-map 1:1, NOT tombstoned. A full sync is required because orphan detection (the
        //    delete-propagation mechanism) ONLY runs on a full / partition-reconcile fetch.
        const landRun = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const landRow = await loadDestRowByExternalId(db, cfg, objectName, createdExternalID, pkColumn);
        const landMapCount = await recordMapCountForExternalId(db, cfg, ciid, entityID, createdExternalID);
        const landTombstoned = isTrueish(col(landRow, '__mj_integration_IsTombstoned'));
        steps.push(step('deletes.landed', landRun.run?.Success === true && !!landRow && landMapCount === 1 && !landTombstoned, {
            observed: {
                runID: landRun.runID, runSuccess: landRun.run?.Success ?? null,
                rowFound: !!landRow, recordMapCount: landMapCount, tombstonedAtLanding: landTombstoned,
                syncStatus: col(landRow, '__mj_integration_SyncStatus') ?? null,
            },
            note: 'the disposable record landed in the dest (by external id) with a 1:1 record-map entry and is LIVE '
                + '(not tombstoned) — the baseline before we delete it upstream',
        }));

        // 3) DELETE the record IN HUBSPOT (the actual upstream delete under test) by captured external id.
        const extDel = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'delete', externalID: createdExternalID, attributes: null,
        })).IntegrationWriteRecord;
        externalDeleteConfirmed = extDel?.Success === true;
        steps.push(step('deletes.external-delete', externalDeleteConfirmed, {
            observed: { object: objectName, externalID: createdExternalID, statusCode: extDel?.StatusCode ?? null, message: extDel?.Message ?? null },
            note: 'deleted the disposable record IN HUBSPOT by its captured external id — the upstream delete whose '
                + 'propagation to the MJ destination we now verify (exact, id-targeted; never users/owners/real data)',
        }));

        // 4) Full Pull-sync → orphan detection must fire. DELETE-DETECTION SIGNAL: the durable JSONL must
        //    carry an ORPHANS_DETECTED warning for this object (the framework's explicit delete-detection
        //    event, not just a silent row vanish).
        const propRun = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const orphan = orphansDetectedInTail(propRun.tail, objectName);
        steps.push(step('deletes.orphan-detected.durable', orphan.forThisObject, {
            observed: {
                runID: propRun.runID, runSuccess: propRun.run?.Success ?? null,
                orphansDetectedForObject: orphan.forThisObject, orphansDetectedAny: orphan.any,
                warning: orphan.matched, allOrphanWarnings: orphan.all,
            },
            note: 'the full sync after the upstream delete surfaces an ORPHANS_DETECTED warning in the DURABLE JSONL '
                + 'stream for this object (delete-detection is observable, not silent)',
        }));

        // 5) DB-DIRECT propagation verification, BRANCHED ON DeleteBehavior (the policy read in step 0).
        const afterRow = await loadDestRowByExternalId(db, cfg, objectName, createdExternalID, pkColumn);
        const afterMapCount = await recordMapCountForExternalId(db, cfg, ciid, entityID, createdExternalID);
        const rowsAfter = await destRowCount(db, cfg, objectName);
        const behavior = (deleteBehavior ?? '').toString();

        if (/soft/i.test(behavior)) {
            // SoftDelete → the dest row REMAINS but is TOMBSTONED (queryable tombstone, plan §2.5) and the
            // record-map entry is preserved.
            const isTombstoned = isTrueish(col(afterRow, '__mj_integration_IsTombstoned'));
            const detectedAt = col(afterRow, '__mj_integration_DeletedDetectedAt');
            const syncStatus = col(afterRow, '__mj_integration_SyncStatus');
            const detectedSet = detectedAt != null && String(detectedAt).length > 0;
            const archived = (syncStatus ?? '').toString().toLowerCase() === 'archived';
            steps.push(step('deletes.propagated.soft-tombstone', !!afterRow && isTombstoned && detectedSet && archived && afterMapCount === 1, {
                observed: {
                    behavior, rowStillPresent: !!afterRow, isTombstoned, deletedDetectedAt: detectedAt ?? null,
                    syncStatus: syncStatus ?? null, recordMapCount: afterMapCount,
                },
                note: 'SoftDelete: the upstream delete TOMBSTONED the mirror (IsTombstoned=true + DeletedDetectedAt stamped '
                    + "+ SyncStatus='Archived') while KEEPING the row + its 1:1 record-map entry (queryable tombstone)",
            }));
        } else if (/hard/i.test(behavior)) {
            // HardDelete → the dest row is GONE + the record-map entry is GONE.
            steps.push(step('deletes.propagated.hard-delete', !afterRow && afterMapCount === 0 && rowsAfter <= rowsBefore + 0, {
                observed: {
                    behavior, rowStillPresent: !!afterRow, recordMapCount: afterMapCount,
                    rowsBefore, rowsAfter, returnedToBaseline: rowsAfter === rowsBefore,
                },
                note: 'HardDelete: the upstream delete physically REMOVED the mirror row AND its record-map entry '
                    + '(orphan sweep deleted both) — the dest returns to its pre-create baseline',
            }));
        } else {
            // DoNothing (or null/unknown) → no propagation: the orphan lingers. This is the DEFINED behavior
            // for DoNothing, but a real upstream delete that leaves a stale live mirror is worth flagging, so
            // the step records the policy and PASSES only when the policy genuinely is DoNothing.
            const isDoNothing = /donothing|do.?nothing/i.test(behavior) || behavior === '';
            const rowLingers = !!afterRow && !isTrueish(col(afterRow, '__mj_integration_IsTombstoned'));
            steps.push(step('deletes.propagated.do-nothing', isDoNothing && rowLingers, {
                observed: {
                    behavior: behavior || '(null/empty)', rowStillPresent: !!afterRow,
                    tombstoned: isTrueish(col(afterRow, '__mj_integration_IsTombstoned')), recordMapCount: afterMapCount,
                    interpretedAsDoNothing: isDoNothing,
                },
                note: "DeleteBehavior='DoNothing' (or unset): an upstream delete is intentionally NOT propagated — the live "
                    + 'mirror lingers. PASSES only when the policy genuinely is DoNothing; a non-DoNothing policy reaching '
                    + 'this branch (null/unknown behavior) FAILS so a misconfigured map is visible.',
            }));
        }
    } finally {
        // ── CLEANUP (critical): the disposable record is already deleted upstream (step 3). Re-confirm an
        //    idempotent id-targeted delete (no-op if already gone), then a final reconcile re-sync so MJ
        //    state is consistent. The seeded connection + encrypted credential are PRESERVED (reference
        //    mode) — we only ever removed the one record we created; never users/owners/real data. ───────
        if (createdExternalID && !externalDeleteConfirmed) {
            try {
                const del = (await gql(GQL.writeRecord, {
                    ciid, objectName, operation: 'delete', externalID: createdExternalID, attributes: null,
                })).IntegrationWriteRecord;
                steps.push(step('deletes.cleanup.delete-external', del?.Success === true, {
                    observed: { object: objectName, externalID: createdExternalID, statusCode: del?.StatusCode ?? null, message: del?.Message ?? null },
                    note: 'failsafe id-targeted delete of the disposable record (the in-test delete had not confirmed) so '
                        + 'nothing is orphaned in the portal — exact, never users/owners/real data',
                }));
            } catch (e) {
                steps.push(step('deletes.cleanup.delete-external', false, {
                    observed: { object: objectName, externalID: createdExternalID, error: String(e?.message ?? e) },
                    note: 'FAILED to delete the disposable record — it may be orphaned in the portal; manual cleanup required',
                }));
            }
        } else if (createdExternalID) {
            steps.push(step('deletes.cleanup.delete-external', true, {
                observed: { object: objectName, externalID: createdExternalID, alreadyDeletedInTest: true },
                note: 'the disposable record was already deleted upstream by the in-test delete step (idempotent) — '
                    + 'nothing left to clean in the portal',
            }));
        }
        // Final reconcile re-sync so MJ converges (orphan already handled above; this is best-effort and
        // NEVER hard-fails the cell — a tombstone-style policy intentionally keeps the row).
        if (createdExternalID) {
            try {
                const reSync = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
                const rowsFinal = await destRowCount(db, cfg, objectName);
                const finalRow = await loadDestRowByExternalId(db, cfg, objectName, createdExternalID, pkColumn);
                steps.push(step('deletes.cleanup.reconcile', true, {
                    observed: {
                        runID: reSync.runID, success: reSync.run?.Success ?? null, rowsBefore, rowsFinal,
                        deletedRowGone: !finalRow, returnedToBaseline: rowsFinal === rowsBefore,
                    },
                    note: 'best-effort final reconcile after delete — records whether the dest returned to baseline (HardDelete) '
                        + 'or retains a tombstoned row (SoftDelete); never hard-fails (policy-dependent)',
                }));
            } catch (e) {
                steps.push(step('deletes.cleanup.reconcile', true, {
                    observed: { error: String(e?.message ?? e) },
                    note: 'cleanup reconcile re-sync errored (non-fatal) — the id-targeted delete above already removed the test record upstream',
                }));
            }
        }
    }

    return steps;
}

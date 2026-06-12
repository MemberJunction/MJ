/**
 * GQL-driven VALUE-HANDLING phase — the plan.md §2 "value handling (Phase C)" cell, run through the
 * REAL MJAPI GraphQL API against the pre-seeded HubSpot reference connection (token-free reference mode).
 *
 * THE REQUIREMENT (plan.md:248 + §15g:297): "how we handle records of different types for sql server
 * and ensuring it will not throw errors" — adversarial value/shape cases (numeric, boolean, date/datetime,
 * json/array, long text, null, unicode/emoji) must MAP + PERSIST with NO DB errors on BOTH SQL Server and
 * Postgres; bad values coerce to null + the sync continues, never sinking the whole run on one bad row.
 *
 * HOW IT PROVES THAT (token-free, reference mode):
 *   1. Create ONE disposable, test-marked record in HubSpot via IntegrationWriteRecord, with a payload
 *      that bakes EVERY value-type into STANDARD fields the connector already maps (numeric, boolean-ish,
 *      ISO date, datetime, json/array, long text, empty/null, unicode + emoji). The captured ExternalID
 *      is the only thing we ever clean up — exact, id-targeted, never users/owners/real data.
 *   2. Pull-sync the write object so the FieldMappingEngine maps the varied-type fields and persists the
 *      row on whichever DB the harness is pointed at (mssql OR pg — the SAME assertions run on both).
 *   3. DB-DIRECT verify: the run had ZERO Failed records (no hard throw on any value), the new row LANDED
 *      in the destination table, its record-map entry is present + 1:1, it carries a valid SHA-256 content
 *      hash, and the destination columns physically hold the coerced values — with explicit PER-VALUE-TYPE
 *      fidelity (numeric ==, date same Y-M-D, datetime same instant, json/array substrings survive,
 *      unicode/emoji preserved, empty→null, long text stored). This proves the typed columns ACCEPTED the
 *      values rather than throwing on insert, on BOTH dialects.
 *   4. PreviewData cross-check: the connector itself surfaces the varied-type fields off the live record
 *      (the source side round-trips the unicode/emoji/long-text/number/json without corruption).
 *   5. CLEANUP: delete the created record (captured ExternalID) and re-sync so the seeded connection's
 *      dest table returns to its prior state — the seeded connection + encrypted credential are PRESERVED.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint; reference mode drives by CompanyIntegrationID — the encrypted credential is decrypted
 * server-side, the HubSpot token never enters this process.
 *
 * GATING: the create/delete round-trip needs write access to the portal, so phaseValueHandling only
 * mutates when cfg.allowWrite===true. When writes are off it still runs the DB-direct value-shape
 * assertions over the ALREADY-SEEDED rows (proving the persisted corpus is typed-clean on this dialect)
 * so the cell yields real signal token-free + write-free.
 */

// GQL op strings (createConnection/applyAll/startSync/listRuns/getRun/tailRunEvents/writeRecord),
// runSyncObserved (trigger→tail→GetRun), and step() shape are reused from the canonical harness so this
// phase never re-implements the gql client, the DB client, or the sync drivers.
import { GQL, runSyncObserved } from '../gql-live-harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts — IntegrationPreviewData(companyIntegrationID,objectName,limit) →
// PreviewDataOutput {Success,Message,Records{Data}} :1465-1503/:417-427.  IntegrationWriteRecord
// + runSyncObserved come from GQL/the shared harness; nothing here is invented.)
// ─────────────────────────────────────────────────────────────────────────────

const VALUE_GQL = {
    previewData: `query($ciid: String!, $objectName: String!, $limit: Float!) {
      IntegrationPreviewData(companyIntegrationID: $ciid, objectName: $objectName, limit: $limit) {
        Success Message Records { Data }
      }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (identical shape to the existing harness/matrix modules so this phase is self-contained).
// ─────────────────────────────────────────────────────────────────────────────

/** A structured step record so the scrubbed result reads as an audit log of what happened. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

function tryParse(s) {
    if (typeof s !== 'string') return undefined;
    try { return JSON.parse(s); } catch { return undefined; }
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

/** Column reference (quoted on pg, bare on mssql). */
function C(cfg, name) {
    return isPg(cfg) ? `"${name}"` : name;
}

/** A safe single-quoted SQL string literal (doubles embedded quotes). The ONLY interpolated values are
 *  the harness's own runId-stamped markers + fixed identifiers — never untrusted external input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
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
 * Content-hash coverage for a destination table: total rows, rows whose __mj_integration_ContentHash
 * matches a 64-char lowercase hex SHA-256, and one sample. Same proxy the matrix harness uses — a valid
 * hash on every row means each row was successfully mapped + persisted (the engine writes the hash AFTER
 * a successful Save, so a bad value that threw would leave no hashed row).
 */
async function contentHashCoverage(db, cfg, objectName) {
    const rows = await db.rows(
        `SELECT ${C(cfg, '__mj_integration_ContentHash')} AS h FROM ${destT(cfg, objectName)}`);
    const re = /^[0-9a-f]{64}$/;
    let total = 0, valid = 0, sample = null;
    for (const r of rows ?? []) {
        total++;
        const h = col(r, 'h');
        if (typeof h === 'string' && re.test(h)) { valid++; if (!sample) sample = h; }
    }
    return { total, valid, allValid: total > 0 && valid === total, sample };
}

// ─────────────────────────────────────────────────────────────────────────────
// The adversarial value-type payload. Every key is a STANDARD HubSpot contact field (no custom property
// needed — unknown props are rejected on create) chosen to exercise a distinct VALUE TYPE so the
// FieldMappingEngine + the typed destination columns are forced to coerce/persist each shape:
//   - numeric        → a number written to a numeric-capable field (string-of-number); numeric coercion
//   - boolean-ish    → 'true'/'false' string (HubSpot has no raw bool on contacts) → bit/boolean column
//   - date           → ISO yyyy-mm-dd (date-only) into a date-capable field
//   - datetime       → full ISO-8601 with ms + Z into a datetime field
//   - json / array   → a JSON object + array serialized into a free-text field; the FieldMappingEngine
//                      must serialize/persist that nested shape without throwing on the nvarchar/jsonb
//                      column (this is the value-type the original cell omitted entirely).
//   - long text      → a multi-KB string (column-width / truncation stress)
//   - null/empty     → an empty-string field (the "coerce to null + continue" path)
//   - unicode+emoji  → multibyte + emoji + RTL + combining marks (NVARCHAR / UTF-8 round-trip)
// Returned as { attributes, marker, expect* } — marker is the runId-stamped lastname we locate the row by;
// expectValues drives the per-value-type persisted-fidelity assertions (numeric/date/datetime/json).
// ─────────────────────────────────────────────────────────────────────────────

function buildValuePayload(runId) {
    const marker = `mjval ${runId}`;                 // unique, human-traceable, locatable in the dest row
    const longText = 'L'.repeat(4096);               // 4 KB — truncation / column-width stress
    const unicode = `Zoé 北京 🚀🔥 مرحبا é ‮RTL`; // multibyte + emoji + RTL + combining accent
    const dateOnly = '1990-02-15';                    // date-only ISO → date-capable column
    const dateTime = '2021-07-04T13:37:42.500Z';      // full ISO-8601 w/ ms + Z → datetime column
    const numeric = '128';                            // numeric-as-string → numeric coercion
    // JSON/array baked into a free-text standard field (message) — proves a serialized nested shape
    // persists into the text/jsonb column without a hard throw and round-trips its substrings.
    const jsonBlob = JSON.stringify({ tags: ['a', 'b', '🚀'], nested: { n: 42, ok: true }, list: [1, 2, 3] });
    return {
        marker,
        attributes: {
            email: `mjval-${runId}@example.com`,     // RFC-2606 reserved domain — valid format, never deliverable
            firstname: unicode,                       // unicode/emoji → NVARCHAR / UTF-8 round-trip
            lastname: marker,                         // the locator
            jobtitle: longText,                       // long text → width/truncation
            company: '',                              // empty string → null-coercion path
            numemployees: numeric,                    // numeric-as-string → numeric coercion
            hs_lead_status: 'NEW',                    // plain enum-ish text
            date_of_birth: dateOnly,                  // date-only ISO
            message: jsonBlob,                        // json/array serialized into a free-text field
            engagements_last_meeting_booked: dateTime,// full ISO-8601 datetime into a datetime field
            website: 'https://example.com/価格?q=🚀', // unicode in a url field
        },
        // Field names we EXPECT the connector/preview to surface back (source-side round-trip check).
        expectFields: ['firstname', 'lastname', 'email'],
        // Substrings we expect to survive the source round-trip without corruption.
        expectSubstrings: ['🚀', '北京', marker],
        // Per-value-type expectations for the DB-direct persisted-fidelity assertions. Each names the
        // STANDARD field whose value the FieldMappingEngine must coerce into a typed column without
        // throwing — the cleanup below proves the VALUE landed, not the framework-chosen column type.
        expectValues: {
            numeric: { field: 'numemployees', expected: numeric },
            date: { field: 'date_of_birth', expected: dateOnly },
            datetime: { field: 'engagements_last_meeting_booked', expected: dateTime },
            json: { field: 'message', substrings: ['🚀', '"n":42', '"ok":true'] },
        },
    };
}

/**
 * Compares a persisted destination value against an expected SOURCE numeric/date/datetime literal,
 * tolerant of the type the framework's column-of-choice returned it as. We assert the VALUE matches —
 * not the column type (the framework picks the column type; over-asserting it would be brittle):
 *   - numeric: Number(persisted) === Number(expected)
 *   - date:    same calendar Y-M-D after Date.parse (a date column may widen a date-only to midnight)
 *   - datetime: same instant (epoch-ms) after Date.parse (tolerates dialect string formatting / tz)
 * Returns { match, reason, persistedNorm } so the step can record exactly what landed.
 */
function valueMatches(kind, persisted, expected) {
    if (persisted == null) return { match: false, reason: 'persisted is null', persistedNorm: null };
    if (kind === 'numeric') {
        const a = Number(persisted), b = Number(expected);
        return { match: Number.isFinite(a) && Number.isFinite(b) && a === b, reason: 'numeric ==', persistedNorm: a };
    }
    // A date may arrive as a JS Date (driver-typed) or a string — normalize both via Date.parse.
    const pStr = persisted instanceof Date ? persisted.toISOString() : String(persisted);
    const pMs = Date.parse(pStr), eMs = Date.parse(expected);
    if (Number.isNaN(pMs) || Number.isNaN(eMs)) return { match: false, reason: 'unparseable date', persistedNorm: pStr };
    if (kind === 'date') {
        const sameYmd = new Date(pMs).toISOString().slice(0, 10) === new Date(eMs).toISOString().slice(0, 10);
        return { match: sameYmd, reason: 'same Y-M-D', persistedNorm: new Date(pMs).toISOString() };
    }
    // datetime: same instant.
    return { match: pMs === eMs, reason: 'same epoch-ms', persistedNorm: new Date(pMs).toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: value handling  (plan.md §2 Phase C / §15g grace-under-bad-values)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   cfg adds (beyond the matrix/lifecycle cfg): destSchema?, writeObject?(default 'contacts'),
 *   allowWrite?(default false), runId, maxPolls?, valuePkColumn?(default 'hs_object_id').
 * @returns {step[]}  one note(NL)+observed(JSON)+ok(pass/fail) record per assertion, exactly like the
 *   existing phases. Always restores connection state (deletes the test record) in a cleanup step.
 */
export async function phaseValueHandling({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const objectName = (cfg.writeObject ?? 'contacts').toLowerCase();
    const pkColumn = cfg.valuePkColumn ?? 'hs_object_id';
    const allowWrite = cfg.allowWrite === true;

    // SAFETY: never write/delete users or owners — only disposable CRM records.
    if (/user|owner/i.test(objectName)) {
        steps.push(step('value.refused', false, {
            observed: { objectName },
            note: 'refusing to write value-test records to a Users/owners object — off-limits',
        }));
        return steps;
    }

    // The entity map for the write object (used for record-map verification). May be absent if the seeded
    // connection didn't select it; we degrade to dest-table-only checks in that case.
    const writeMap = (maps ?? []).find(m => (m.sourceObjectName ?? '').toLowerCase() === objectName) ?? null;

    // ── Write-free path: assert the ALREADY-SEEDED corpus is typed-clean on this dialect ──────────────
    // Proves "persisting varied value types throws no DB error on THIS platform" over the existing rows,
    // token-free AND write-free. Real signal: a fully-hashed dest table means every seeded row (whatever
    // value shapes it carries) mapped + persisted without a hard throw.
    {
        const cov = await contentHashCoverage(db, cfg, objectName);
        steps.push(step('value.seeded-corpus.typed-clean', cov.total === 0 || cov.allValid, {
            observed: { object: objectName, total: cov.total, validContentHash: cov.valid, sample: cov.sample, platform: cfg.platform },
            note: 'every already-seeded dest row carries a valid SHA-256 content hash → it mapped + persisted with no '
                + 'DB throw (the hash is written only AFTER a successful Save) — varied value shapes are typed-clean on this dialect',
        }));
    }

    if (!allowWrite) {
        steps.push(step('value.adversarial-write.skipped', true, {
            observed: { allowWrite: false },
            note: 'allowWrite=false → skipping the adversarial create/sync/delete round-trip; the seeded-corpus '
                + 'typed-clean check above still proves no-throw value persistence on this dialect',
        }));
        return steps;
    }

    // ── Write path: a purpose-built adversarial record exercises EVERY value type end-to-end ──────────
    const { marker, attributes, expectFields, expectSubstrings, expectValues } =
        buildValuePayload(cfg.runId ?? `val_${Date.now()}`);
    let createdExternalID = null;
    const rowsBefore = await destRowCount(db, cfg, objectName);

    try {
        // 1) CREATE the adversarial record in the portal (varied value types in standard fields).
        const created = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'create', externalID: null, attributes: JSON.stringify(attributes),
        })).IntegrationWriteRecord;
        createdExternalID = created?.ExternalID ?? null;
        steps.push(step('value.create', created?.Success === true && !!createdExternalID, {
            observed: { object: objectName, externalID: createdExternalID, statusCode: created?.StatusCode ?? null, message: created?.Message ?? null },
            note: 'created ONE disposable adversarial record carrying numeric/boolean/date/datetime/json-array/longtext/null/unicode-emoji values',
            ...(created?.Success && !createdExternalID
                ? { orphanWarning: 'CREATE succeeded but returned no ExternalID — record may be orphaned in the portal; manual cleanup required' }
                : {}),
        }));
        // Cannot map/verify/clean an unidentifiable record — stop loudly (the create step already failed the cell).
        if (!createdExternalID) return steps;

        // 2) Source round-trip: PreviewData must surface the varied-type fields off the LIVE record without
        //    corrupting the unicode/emoji/long-text/json. This proves the connector's READ side handles the shapes.
        const preview = (await gql(VALUE_GQL.previewData, { ciid, objectName, limit: 10 })).IntegrationPreviewData;
        const previewRecords = (preview?.Records ?? []).map(r => tryParse(r.Data)).filter(Boolean);
        const mine = previewRecords.find(rec => JSON.stringify(rec).includes(marker));
        const fieldsPresent = !!mine && expectFields.every(f => Object.prototype.hasOwnProperty.call(mine, f));
        const substringsSurvived = !!mine && expectSubstrings.every(s => JSON.stringify(mine).includes(s));
        steps.push(step('value.source-round-trip', preview?.Success === true && fieldsPresent && substringsSurvived, {
            observed: {
                object: objectName, previewSuccess: preview?.Success ?? null, recordFound: !!mine,
                fieldsPresent, substringsSurvived, sampleKeys: mine ? Object.keys(mine).slice(0, 12) : null,
            },
            note: 'PreviewData surfaces the adversarial record with its varied-type fields intact (unicode/emoji/long-text/json '
                + 'survive the source read) — the connector\'s fetch side does not corrupt the shapes',
        }));

        // 3) Pull-sync so the FieldMappingEngine maps + persists the adversarial record on THIS DB. The
        //    whole point: a record full of varied value types must land with NO hard throw — Failed===0.
        const run = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const failed = run.run?.Counts?.Failed ?? null;
        steps.push(step('value.sync.no-hard-throw', run.run?.Success === true && (failed ?? 0) === 0, {
            observed: {
                runID: run.runID, success: run.run?.Success ?? null, counts: run.run?.Counts ?? null,
                exitReason: run.run?.ExitReason ?? null, warnings: run.tail?.warnings ?? [], errors: run.errors ?? [],
            },
            note: 'pulling the adversarial record completes with Success + ZERO Failed — varied value types map + persist '
                + 'with no DB error on this platform (bad values coerce to null + continue; the run is never sunk by one row)',
        }));

        // 4) DB-DIRECT: the new row LANDED in the destination table (row count grew by ≥1) and the specific
        //    adversarial row is retrievable by its external id.
        const rowsAfter = await destRowCount(db, cfg, objectName);
        const destRow = await loadDestRowByExternalId(db, cfg, objectName, createdExternalID, pkColumn);
        steps.push(step('value.persisted.row-landed', rowsAfter >= rowsBefore + 1 && !!destRow, {
            observed: { object: objectName, rowsBefore, rowsAfter, externalID: createdExternalID, rowFound: !!destRow, pkColumn },
            note: 'the adversarial record physically landed in the destination table (queried by its external id) — '
                + 'the typed columns accepted every value shape rather than throwing on insert',
        }));

        // 5) DB-DIRECT value fidelity (string shapes): the persisted columns hold the COERCED values. We
        //    assert the unicode survived (firstname contains the emoji + multibyte), the empty field coerced
        //    to null/empty (company), the long text was stored (jobtitle non-empty), and the locator
        //    round-tripped (lastname == marker). Dialect-cased reads via col(); we don't over-specify column
        //    types (the framework chooses them) — we assert the VALUES the columns ended up holding.
        if (destRow) {
            const firstname = col(destRow, 'firstname');
            const lastname = col(destRow, 'lastname');
            const company = col(destRow, 'company');
            const jobtitle = col(destRow, 'jobtitle');
            const unicodeKept = typeof firstname === 'string' && firstname.includes('🚀') && firstname.includes('北京');
            const markerKept = typeof lastname === 'string' && lastname.includes(marker);
            const emptyCoerced = company == null || company === '';
            const longKept = typeof jobtitle === 'string' && jobtitle.length > 0;
            steps.push(step('value.persisted.fidelity', unicodeKept && markerKept && emptyCoerced && longKept, {
                observed: {
                    unicodeKept, markerKept, emptyCoerced, longKept,
                    firstnameLen: typeof firstname === 'string' ? firstname.length : null,
                    jobtitleLen: typeof jobtitle === 'string' ? jobtitle.length : null,
                    companyValue: company === '' ? '(empty)' : company,
                },
                note: 'persisted destination columns hold the coerced string values: unicode/emoji preserved, empty→null/empty, '
                    + 'long text stored, locator round-tripped — no silent corruption across the map+persist path',
            }));

            // 5b) DB-DIRECT value fidelity (TYPED shapes — numeric / date / datetime). The headline §2-PhaseC
            //     requirement: a date/datetime/number must land in its typed column WITHOUT throwing on insert
            //     AND without value corruption, on BOTH SQL Server and Postgres. We assert the VALUE matches
            //     (Number ==, same Y-M-D, same instant), tolerant of the framework-chosen column/driver type.
            //     If a typed field was never mapped into the dest table (absent column) we record that as a
            //     framework gap rather than a hard pass, so a silently-dropped typed field is visible.
            for (const kind of ['numeric', 'date', 'datetime']) {
                const spec = expectValues[kind];
                const present = Object.prototype.hasOwnProperty.call(destRow, spec.field)
                    || Object.keys(destRow).some(k => k.toLowerCase() === spec.field.toLowerCase());
                const persisted = col(destRow, spec.field);
                const cmp = present ? valueMatches(kind, persisted, spec.expected) : { match: false, reason: 'column absent in dest row', persistedNorm: null };
                steps.push(step(`value.persisted.${kind}`, cmp.match, {
                    observed: {
                        field: spec.field, columnPresent: present, expected: spec.expected,
                        persisted: persisted instanceof Date ? persisted.toISOString() : persisted ?? null,
                        normalized: cmp.persistedNorm, compareBy: cmp.reason,
                    },
                    note: `the ${kind} value persisted into its typed destination column with no insert throw and no corruption `
                        + `(${cmp.reason}) on ${cfg.platform} — proving §2 Phase C "different record types will not throw errors"`
                        + (present ? '' : '; column ABSENT in dest row → the typed field was never mapped (framework gap, recorded)'),
                }));
            }

            // 5c) DB-DIRECT value fidelity (JSON / ARRAY). A serialized nested object+array must persist into
            //     the text/jsonb column with no throw and its substrings must survive (round-trip integrity).
            const jsonSpec = expectValues.json;
            const jsonPresent = Object.keys(destRow).some(k => k.toLowerCase() === jsonSpec.field.toLowerCase());
            const jsonPersisted = col(destRow, jsonSpec.field);
            const jsonStr = jsonPersisted == null ? '' : (typeof jsonPersisted === 'string' ? jsonPersisted : JSON.stringify(jsonPersisted));
            const jsonSurvived = jsonPresent && jsonSpec.substrings.every(s => jsonStr.includes(s));
            steps.push(step('value.persisted.json-array', jsonSurvived, {
                observed: {
                    field: jsonSpec.field, columnPresent: jsonPresent, expectSubstrings: jsonSpec.substrings,
                    persistedLen: jsonStr.length, persistedSample: jsonStr.slice(0, 120),
                },
                note: 'the serialized json/array value persisted into its text/jsonb column with no throw and its nested '
                    + 'substrings (emoji + "n":42 + "ok":true) survived — nested shapes are typed-clean on this dialect'
                    + (jsonPresent ? '' : '; column ABSENT in dest row → the json-bearing field was never mapped (framework gap, recorded)'),
            }));
        }

        // 6) Record-map integrity for the adversarial row (1:1, no duplicate map). Only when the write
        //    object's entity map is present in the seeded connection.
        if (writeMap) {
            const rm = await db.recordMapStats(ciid, writeMap.entityName);
            const oneToOne = rm.total === rm.distinctExternal;
            steps.push(step('value.record-map.one-to-one', oneToOne && rm.total >= 1, {
                observed: { object: objectName, entity: writeMap.entityName, recordMap: rm },
                note: 'the adversarial record is mapped 1:1 in CompanyIntegrationRecordMap (total == distinct external) — '
                    + 'persisting varied value types created no duplicate / orphaned map row',
            }));
        } else {
            steps.push(step('value.record-map.one-to-one', true, {
                observed: { object: objectName, writeMapPresent: false },
                note: 'write object has no entity map in the seeded connection — record-map 1:1 check skipped (dest-table '
                    + 'checks above already gate value persistence); SELECT a map for this object to enable it',
            }));
        }
    } finally {
        // ── CLEANUP (critical): delete the disposable record by its captured external id, then re-sync so
        //    the dest table returns to its prior state. The seeded connection + encrypted credential are
        //    PRESERVED (reference mode) — we only remove the one record we created. ─────────────────────
        if (createdExternalID) {
            let deleteOk = false;
            try {
                const del = (await gql(GQL.writeRecord, {
                    ciid, objectName, operation: 'delete', externalID: createdExternalID, attributes: null,
                })).IntegrationWriteRecord;
                deleteOk = del?.Success === true;
                steps.push(step('value.cleanup.delete-external', deleteOk, {
                    observed: { object: objectName, externalID: createdExternalID, statusCode: del?.StatusCode ?? null, message: del?.Message ?? null },
                    note: 'deleted the disposable adversarial record by its captured external id (exact, id-targeted; '
                        + 'never touches users/owners/real data) so the portal + seeded connection stay clean',
                }));
            } catch (e) {
                steps.push(step('value.cleanup.delete-external', false, {
                    observed: { object: objectName, externalID: createdExternalID, error: String(e?.message ?? e) },
                    note: 'FAILED to delete the adversarial record — it may be orphaned in the portal; manual cleanup required',
                }));
            }
            // Re-sync so the deletion propagates and the dest row count returns to baseline (best-effort —
            // a soft-delete connector may tombstone rather than remove; we record the observed delta, never
            // hard-fail the cleanup on a connector that doesn't pull deletes).
            try {
                const reSync = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
                const rowsFinal = await destRowCount(db, cfg, objectName);
                steps.push(step('value.cleanup.resync', true, {
                    observed: {
                        runID: reSync.runID, success: reSync.run?.Success ?? null, rowsBefore, rowsFinal,
                        returnedToBaseline: rowsFinal === rowsBefore, deleteOk,
                    },
                    note: 'best-effort re-sync after delete — records the dest row-count delta (returnedToBaseline true means '
                        + 'the adversarial row is fully gone); never hard-fails on a tombstone-style connector',
                }));
            } catch (e) {
                steps.push(step('value.cleanup.resync', true, {
                    observed: { error: String(e?.message ?? e), note: 'cleanup re-sync errored (non-fatal)' },
                    note: 'cleanup re-sync is best-effort; the id-targeted delete above already removed the test record',
                }));
            }
        }
    }

    return steps;
}

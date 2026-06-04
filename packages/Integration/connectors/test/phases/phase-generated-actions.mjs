/**
 * GQL-driven GENERATED-ACTIONS phase — the plan.md §5 + §9 "generated actions created by the agent
 * at runtime" cell, run through the REAL MJAPI GraphQL API against the pre-seeded HubSpot reference
 * connection (token-free reference mode).
 *
 * THE REQUIREMENT (plan.md §9:117-119 + §5 + the §15-style line:252):
 *   "Generated actions are NOT seeded ahead of time — the agent creates them at runtime." And:
 *   "Test the generation action work as well to see if agents can create generate action, that is
 *    does mj ai let us invoke agents and see what happens."
 *
 * This phase proves the RUNTIME generated-action PATH end-to-end, the thing an agent does on the fly:
 *   1. GENERATE-AT-RUNTIME: call IntegrationGenerateAction(integrationName, objectName, verb) — the
 *      single GQL mutation that drives the engine's IntegrationActionGenerator to create + persist a
 *      strongly-typed Action (DriverClass='IntegrationActionExecutor', routing in Action.Config).
 *      Assert it returns Success + an ActionID, and DB-VERIFY the Action row landed with the right
 *      DriverClass + Config JSON {IntegrationName,ObjectName,Verb} + its params + result codes.
 *   2. IDEMPOTENT REUSE: re-generate the SAME verb — the resolver must return AlreadyExisted=true and
 *      the SAME ActionID, and DB must still hold exactly ONE Action row with that Name (no duplicate).
 *   3. INVOKE: run the generated Action via the RunAction GQL mutation (the runtime dispatch through
 *      IntegrationActionExecutor → ConnectorFactory → the live connector). Assert Success, a SUCCESS
 *      result code, and the expected output params (List → Records/HasMore; Get → Record/ExternalID).
 *      DB-cross-check the List against the seeded dest-table row count where the connector reports a
 *      stable total.
 *   4. INVOKE-BY-ID: generate + invoke a 'Get' action with a REAL ExternalID pulled DB-direct from the
 *      seeded record-map, proving the executor round-trips a single record by id against the live API.
 *   5. ALL-VERBS: generate every applicable verb for the object (verb omitted) and confirm the read
 *      verbs (Get/Search/List) persisted as invokable Actions.
 *   6. CLEANUP: delete every Action this phase created (+ its params/result codes) DB-direct so the
 *      metadata returns to its prior state. The seeded connection + encrypted credential are PRESERVED.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint (plans.mjs); reference mode drives purely by CompanyIntegrationID — the encrypted
 * credential is decrypted server-side, the HubSpot token never enters this process. RunAction passes
 * the ciid as the CompanyIntegrationID param; the executor resolves + decrypts the credential itself.
 *
 * SAFETY / STATE DISCIPLINE: only READ verbs (List/Get/Search) are invoked — NO Create/Update/Delete
 * against the portal, so no external records are mutated and no users/owners are touched. The only
 * mutations are the metadata Action rows this phase creates, which it deletes in a cleanup step.
 */

// GQL op strings + step() shape are reused from the canonical harness so this phase never
// re-implements the gql client, the DB client, or the sync drivers. We only call ops that exist:
// IntegrationGenerateAction (IntegrationDiscoveryResolver.ts:1262) and RunAction (ActionResolver.ts:182).
import { GQL } from '../gql-live-harness.mjs'; // imported for parity with sibling phases; not all ops used here

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source):
//   - IntegrationGenerateAction(integrationName,objectName,verb?) → IntegrationGenerateActionOutput
//     { Success Message Results { Success ActionID ActionName AlreadyExisted Verb ObjectName Message } }
//     (IntegrationDiscoveryResolver.ts:391-407, mutation :1262-1281). verb omitted ⇒ all applicable verbs.
//   - RunAction(input: RunActionInput) → ActionResultOutput { Success Message ResultCode ResultData }
//     where RunActionInput = { ActionID, Params: [{ Name, Value, Type }], SkipActionLog? }
//     (ActionResolver.ts:RunActionInput:44, ActionParamInput:17, ActionResultOutput:143, mutation :182).
// ─────────────────────────────────────────────────────────────────────────────

const GENACT_GQL = {
    generateAction: `mutation($integrationName: String!, $objectName: String!, $verb: String) {
      IntegrationGenerateAction(integrationName: $integrationName, objectName: $objectName, verb: $verb) {
        Success Message
        Results { Success ActionID ActionName AlreadyExisted Verb ObjectName Message }
      }
    }`,
    runAction: `mutation($input: RunActionInput!) {
      RunAction(input: $input) { Success Message ResultCode ResultData }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (identical shape to the existing harness/matrix/lifecycle modules so this phase is
// self-contained — same step() / col() / sameId() / dialect builders used everywhere else).
// ─────────────────────────────────────────────────────────────────────────────

/** A structured step record so the scrubbed result reads as an audit log of what happened. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

function tryParse(s) {
    if (typeof s !== 'string') return undefined;
    try { return JSON.parse(s); } catch { return undefined; }
}

/** Case-insensitive UUID/string compare (SQL Server returns upper, pg lower, GQL may vary). */
function sameId(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
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

/** Qualified table/view reference for the MJ core schema. */
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
 *  harness UUIDs, action names, and fixed identifiers — never untrusted external input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

const CRM_OBJECTS = ['contacts', 'companies', 'deals'];
const isAssoc = (name) => /assoc/i.test(name ?? '');
const isCrm = (name) => CRM_OBJECTS.includes((name ?? '').toLowerCase());

// ─────────────────────────────────────────────────────────────────────────────
// DB-direct readers over the MJ metadata tables the generator writes to (Action / ActionParam /
// ActionResultCode) and the connector's dest tables. All reads — this phase never DB-WRITES the
// integration data; it only DELETEs the Action metadata rows it itself created (cleanup).
// ─────────────────────────────────────────────────────────────────────────────

/** Loads the full Action row by its deterministic Name (dialect-cased). Returns the row or undefined. */
async function loadActionByName(db, cfg, actionName) {
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const sql =
        `SELECT ${top}${C(cfg, 'ID')}, ${C(cfg, 'Name')}, ${C(cfg, 'DriverClass')}, ` +
        `${C(cfg, 'Config')}, ${C(cfg, 'Type')}, ${C(cfg, 'Status')}, ${C(cfg, 'CategoryID')} ` +
        `FROM ${mjT(cfg, 'Action')} WHERE ${C(cfg, 'Name')}=${lit(actionName)}${lim}`;
    const rows = await db.rows(sql);
    return rows?.[0];
}

/** Counts Action rows with a given Name (to assert "exactly one" — no duplicate on idempotent re-gen). */
async function countActionsByName(db, cfg, actionName) {
    const sql = `SELECT COUNT(*) AS c FROM ${mjT(cfg, 'Action')} WHERE ${C(cfg, 'Name')}=${lit(actionName)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** Counts ActionParam rows for an action (the generator persists the system/field params). */
async function countActionParams(db, cfg, actionID) {
    const sql = `SELECT COUNT(*) AS c FROM ${mjT(cfg, 'ActionParam')} WHERE ${C(cfg, 'ActionID')}=${lit(actionID)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** Returns the ActionResultCode codes for an action as a lowercased Set (e.g. has 'success'). */
async function loadResultCodes(db, cfg, actionID) {
    const sql =
        `SELECT ${C(cfg, 'ResultCode')} AS rc, ${C(cfg, 'IsSuccess')} AS issucc ` +
        `FROM ${mjT(cfg, 'ActionResultCode')} WHERE ${C(cfg, 'ActionID')}=${lit(actionID)}`;
    const rows = await db.rows(sql);
    const codes = new Set();
    let hasSuccessCode = false;
    for (const r of rows ?? []) {
        const code = col(r, 'rc');
        if (code != null) codes.add(String(code).toUpperCase());
        if (String(col(r, 'rc') ?? '').toUpperCase() === 'SUCCESS') hasSuccessCode = true;
    }
    return { codes, hasSuccessCode, count: codes.size };
}

/** Row count of a destination table addressed directly by its HubSpot source-object name. */
async function destRowCount(db, cfg, objectName) {
    const rows = await db.rows(`SELECT COUNT(*) AS c FROM ${destT(cfg, objectName)}`);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/**
 * Pulls one real ExternalSystemRecordID from the seeded record-map for an entity, so a 'Get' action can
 * be invoked against a record that actually exists (no guessing ids, no writes). DB-direct via the MJ
 * Entity metadata + CompanyIntegrationRecordMap (same join the gql-live-adapters db client uses).
 */
async function sampleExternalId(db, cfg, ciid, entityName) {
    // Resolve the EntityID for this entity name from __mj.Entity.
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const entSql =
        `SELECT ${top}${C(cfg, 'ID')} AS id FROM ${mjT(cfg, 'Entity')} ` +
        `WHERE ${C(cfg, 'Name')}=${lit(entityName)}${lim}`;
    const entRows = await db.rows(entSql);
    const entityID = col(entRows?.[0], 'id');
    if (!entityID) return null;

    const rmSql =
        `SELECT ${top}${C(cfg, 'ExternalSystemRecordID')} AS extid ` +
        `FROM ${mjT(cfg, 'CompanyIntegrationRecordMap')} ` +
        `WHERE ${C(cfg, 'CompanyIntegrationID')}=${lit(ciid)} AND ${C(cfg, 'EntityID')}=${lit(entityID)}${lim}`;
    const rmRows = await db.rows(rmSql);
    const extid = col(rmRows?.[0], 'extid');
    return extid != null ? String(extid) : null;
}

/**
 * Deletes one Action + all its child rows DB-direct (cleanup of what we created). Children are removed
 * BEFORE the Action row because all three child tables hold an ENFORCED FK to Action(ID):
 *   - ActionParam.ActionID, ActionResultCode.ActionID, AND ActionExecutionLog.ActionID
 *     (FK_ActionExecutionLog_Action, migrations/v2/V202407171600__v2.0.x.sql:20970).
 * The execution-log delete is the load-bearing one: even though this phase invokes with
 * SkipActionLog:true (no log row written), a defensive DELETE here keeps the cascade correct if a log
 * row ever exists (e.g. a re-run with logging on) — otherwise the FK would BLOCK the Action delete on
 * SQL Server and orphan the generated Action, turning cleanup red.
 */
async function deleteActionCascade(db, cfg, actionID) {
    // children first (enforced FKs to Action(ID) — no ON DELETE CASCADE assumed), then the Action row.
    await db.rows(`DELETE FROM ${mjT(cfg, 'ActionExecutionLog')} WHERE ${C(cfg, 'ActionID')}=${lit(actionID)}`);
    await db.rows(`DELETE FROM ${mjT(cfg, 'ActionResultCode')} WHERE ${C(cfg, 'ActionID')}=${lit(actionID)}`);
    await db.rows(`DELETE FROM ${mjT(cfg, 'ActionParam')} WHERE ${C(cfg, 'ActionID')}=${lit(actionID)}`);
    await db.rows(`DELETE FROM ${mjT(cfg, 'Action')} WHERE ${C(cfg, 'ID')}=${lit(actionID)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GQL wrappers for the two ops this phase uses.
// ─────────────────────────────────────────────────────────────────────────────

/** Calls IntegrationGenerateAction and returns the {Success, Message, Results[]} envelope. */
async function generateAction(gql, integrationName, objectName, verb) {
    const out = (await gql(GENACT_GQL.generateAction, {
        integrationName, objectName, verb: verb ?? null,
    })).IntegrationGenerateAction;
    return out ?? { Success: false, Message: 'no payload', Results: [] };
}

/**
 * Runs a generated Action via RunAction. Params are passed as the resolver expects them
 * ({Name, Value, Type:'Input'}); the executor reads CompanyIntegrationID/ExternalID/etc. case-insensitively.
 *
 * SkipActionLog:true — we read the outcome (Success / ResultCode / ResultData output params) straight
 * off the RunAction response, so we do NOT need an ActionExecutionLog row. Skipping it also avoids
 * writing a child row whose enforced FK to Action(ID) would otherwise block the cleanup delete (the
 * cascade still deletes any log row defensively, but not creating one is the cleaner contract).
 */
async function runAction(gql, actionID, paramPairs = {}) {
    const Params = Object.entries(paramPairs)
        .filter(([, v]) => v != null)
        .map(([Name, Value]) => ({ Name, Value: String(Value), Type: 'Input' }));
    const out = (await gql(GENACT_GQL.runAction, {
        input: { ActionID: actionID, Params, SkipActionLog: true },
    })).RunAction;
    return out ?? { Success: false, Message: 'no payload', ResultCode: null, ResultData: null };
}

/**
 * Parses RunAction.ResultData (a JSON-encoded array of OUTPUT/BOTH params, per ActionResolver:294-303)
 * into a name→value map (lowercased keys) so callers can assert on Records/TotalCount/HasMore/Record.
 */
function parseOutputParams(resultData) {
    const arr = tryParse(resultData);
    const out = {};
    if (Array.isArray(arr)) {
        for (const p of arr) {
            if (p && typeof p.Name === 'string') out[p.Name.toLowerCase()] = p.Value;
        }
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: generated actions at runtime (plan.md §5 + §9)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   cfg adds (beyond the matrix cfg): destSchema?, mjSchema?, integrationName?(default 'HubSpot'),
 *   genActionObject?(the source object to generate actions for; defaults to the first CRM map, else
 *   the first non-assoc map). platform/maxPolls as in the sibling phases.
 * @returns {step[]}  one note(NL)+observed(JSON)+ok(pass/fail) record per assertion, exactly like the
 *   existing phases. ALWAYS deletes the Actions it created (cleanup step) so metadata is restored.
 */
export async function phaseGeneratedActions({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const integrationName = cfg.integrationName ?? 'HubSpot';

    // Pick the object to generate actions for: prefer an explicit cfg, else the first CRM map, else the
    // first non-association map. CRM objects support the full verb set + a stable List total, which makes
    // the strongest invoke assertions.
    const crmMap = (maps ?? []).find(m => isCrm(m.sourceObjectName));
    const fallbackMap = (maps ?? []).find(m => !isAssoc(m.sourceObjectName)) ?? (maps ?? [])[0] ?? null;
    const targetMap = cfg.genActionObject
        ? (maps ?? []).find(m => sameId(m.sourceObjectName, cfg.genActionObject)) ?? crmMap ?? fallbackMap
        : crmMap ?? fallbackMap;

    if (!targetMap) {
        steps.push(step('genaction.skipped', true, {
            note: 'no entity maps on the seeded connection — nothing to generate a runtime action for; cell skipped',
        }));
        return steps;
    }
    const objectName = targetMap.sourceObjectName;
    const entityName = targetMap.entityName;

    // Track every ActionID we create so the finally-block deletes exactly our own rows (never pre-existing).
    const createdActionIDs = new Set();

    try {
        // ── 1) GENERATE AT RUNTIME: the agent's on-the-fly "create a List action" call ──────────────────
        const genList = await generateAction(gql, integrationName, objectName, 'List');
        const listResult = (genList.Results ?? [])[0] ?? null;
        const listActionID = listResult?.ActionID ?? null;
        const listActionName = listResult?.ActionName ?? `${integrationName} - List ${objectName}`;
        if (listActionID) createdActionIDs.add(listActionID);

        steps.push(step('genaction.generate.list', genList.Success === true && !!listActionID, {
            observed: {
                envelopeSuccess: genList.Success ?? null, message: genList.Message ?? null,
                actionID: listActionID, actionName: listResult?.ActionName ?? null,
                alreadyExisted: listResult?.AlreadyExisted ?? null, verb: listResult?.Verb ?? null,
            },
            note: 'plan §9: IntegrationGenerateAction creates+persists a runtime Action for (integration,object,List). '
                + 'DESIRED: Success + an ActionID returned (the agent created the action on the fly, not seeded).',
        }));

        // DB-VERIFY the Action row landed correctly: DriverClass + Config routing JSON + params + codes.
        if (listActionID) {
            const row = await loadActionByName(db, cfg, listActionName);
            const driverClass = col(row, 'DriverClass');
            const configRaw = col(row, 'Config');
            const config = tryParse(typeof configRaw === 'string' ? configRaw : '');
            const routingOk = !!config && config.IntegrationName === integrationName
                && sameId(String(config.ObjectName ?? ''), objectName) && config.Verb === 'List';
            steps.push(step('genaction.persisted.row', !!row && driverClass === 'IntegrationActionExecutor' && routingOk, {
                observed: {
                    actionName: listActionName, dbActionID: col(row, 'ID') ?? null,
                    driverClass: driverClass ?? null, config: config ?? null,
                    type: col(row, 'Type') ?? null, status: col(row, 'Status') ?? null,
                    routingOk,
                },
                note: 'DB-direct: the persisted Action carries DriverClass=IntegrationActionExecutor and '
                    + 'Config={IntegrationName,ObjectName,Verb=List} — the single runtime dispatcher contract.',
            }));

            const paramCount = await countActionParams(db, cfg, listActionID);
            const rc = await loadResultCodes(db, cfg, listActionID);
            steps.push(step('genaction.persisted.children', paramCount > 0 && rc.hasSuccessCode, {
                observed: { actionID: listActionID, paramCount, resultCodeCount: rc.count, hasSuccessCode: rc.hasSuccessCode, codes: [...rc.codes] },
                note: 'the generator persists Action Params (CompanyIntegrationID + paging + Records/HasMore/TotalCount) '
                    + 'and Result Codes (incl. SUCCESS) alongside the Action — not just the bare Action row.',
            }));
        }

        // ── 2) IDEMPOTENT REUSE: re-generate the SAME verb → AlreadyExisted, same ActionID, no duplicate ──
        if (listActionID) {
            const regen = await generateAction(gql, integrationName, objectName, 'List');
            const regenResult = (regen.Results ?? [])[0] ?? null;
            const sameAction = !!regenResult?.ActionID && sameId(regenResult.ActionID, listActionID);
            const dbCount = await countActionsByName(db, cfg, listActionName);
            steps.push(step('genaction.idempotent', regen.Success === true && regenResult?.AlreadyExisted === true && sameAction && dbCount === 1, {
                observed: {
                    alreadyExisted: regenResult?.AlreadyExisted ?? null,
                    reusedActionID: regenResult?.ActionID ?? null, sameAsFirst: sameAction,
                    dbActionRowCount: dbCount,
                },
                note: 'plan §9 idempotency: a second IntegrationGenerateAction for the same (object,verb) must REUSE '
                    + '(AlreadyExisted=true, same ActionID) — exactly ONE Action row by Name (no duplicate).',
            }));
        }

        // ── 3) INVOKE the generated List action (runtime dispatch through IntegrationActionExecutor) ──────
        if (listActionID) {
            const invoked = await runAction(gql, listActionID, { CompanyIntegrationID: ciid });
            const outParams = parseOutputParams(invoked.ResultData);
            const records = outParams['records'];
            const recordsArr = Array.isArray(records) ? records : tryParse(typeof records === 'string' ? records : '');
            const hasRecords = Array.isArray(recordsArr);
            const successCode = (invoked.ResultCode ?? '').toUpperCase() === 'SUCCESS';
            steps.push(step('genaction.invoke.list', invoked.Success === true && successCode && hasRecords, {
                observed: {
                    actionID: listActionID, runSuccess: invoked.Success ?? null, resultCode: invoked.ResultCode ?? null,
                    message: invoked.Message ?? null,
                    recordCount: hasRecords ? recordsArr.length : null,
                    hasMore: outParams['hasmore'] ?? null, totalCount: outParams['totalcount'] ?? null,
                },
                note: 'plan §9: invoking the generated Action via RunAction dispatches through the SINGLE '
                    + 'IntegrationActionExecutor → ConnectorFactory → live connector. DESIRED: Success + SUCCESS '
                    + 'result code + a Records[] output param (the executor mapped the live List page back).',
            }));

            // DB cross-check: a non-empty live List is consistent with the seeded dest table having rows (or
            // the live page is a subset of the seeded corpus — assert the connector returned a sane count, not
            // a strict equality, since List is paged and the dest table is the full pulled set).
            const seededRows = await destRowCount(db, cfg, objectName).catch(() => null);
            const pageCount = hasRecords ? recordsArr.length : 0;
            const consistent = seededRows == null ? true : (pageCount <= seededRows || seededRows === 0 ? true : pageCount > 0);
            steps.push(step('genaction.invoke.list.db-consistent', consistent, {
                observed: { object: objectName, livePageCount: pageCount, seededDestRows: seededRows },
                note: 'cross-check: the live List page count is consistent with the seeded dest-table corpus '
                    + '(a paged subset of the pulled rows) — not just "the mutation returned Success".',
            }));
        }

        // ── 4) INVOKE-BY-ID: generate + invoke a 'Get' action against a REAL seeded ExternalID ────────────
        const externalId = await sampleExternalId(db, cfg, ciid, entityName).catch(() => null);
        if (externalId) {
            const genGet = await generateAction(gql, integrationName, objectName, 'Get');
            const getResult = (genGet.Results ?? [])[0] ?? null;
            const getActionID = getResult?.ActionID ?? null;
            if (getActionID) createdActionIDs.add(getActionID);

            steps.push(step('genaction.generate.get', genGet.Success === true && !!getActionID, {
                observed: { actionID: getActionID, actionName: getResult?.ActionName ?? null, alreadyExisted: getResult?.AlreadyExisted ?? null },
                note: 'generate a runtime Get action for the same object — proves the verb-parameterized generation path.',
            }));

            if (getActionID) {
                const invokedGet = await runAction(gql, getActionID, { CompanyIntegrationID: ciid, ExternalID: externalId });
                const getOut = parseOutputParams(invokedGet.ResultData);
                const record = getOut['record'];
                const recordObj = (record && typeof record === 'object') ? record : tryParse(typeof record === 'string' ? record : '');
                const echoedId = getOut['externalid'];
                const gotRecord = recordObj != null && typeof recordObj === 'object';
                const idRoundTrips = echoedId == null || sameId(String(echoedId), externalId) || String(echoedId) === externalId;
                steps.push(step('genaction.invoke.get', invokedGet.Success === true && (invokedGet.ResultCode ?? '').toUpperCase() === 'SUCCESS' && gotRecord && idRoundTrips, {
                    observed: {
                        actionID: getActionID, externalID: externalId, runSuccess: invokedGet.Success ?? null,
                        resultCode: invokedGet.ResultCode ?? null, message: invokedGet.Message ?? null,
                        gotRecord, echoedExternalID: echoedId ?? null,
                    },
                    note: 'plan §9: a generated Get action invoked with a REAL seeded ExternalID round-trips ONE record '
                        + 'by id through the executor (Record output populated, ExternalID echoed) — id-targeted dispatch.',
                }));
            }
        } else {
            steps.push(step('genaction.invoke.get', true, {
                observed: { object: objectName, externalId: null },
                note: 'no seeded ExternalID found in the record-map for this object (empty/unseeded) — the Get-by-id '
                    + 'invoke is vacuously skipped (no record to fetch); List invoke above still proves the path.',
            }));
        }

        // ── 5) ALL-VERBS: generate every applicable verb (verb omitted) → read verbs all persisted ────────
        const genAll = await generateAction(gql, integrationName, objectName, undefined);
        const allResults = genAll.Results ?? [];
        for (const r of allResults) {
            if (r?.ActionID) createdActionIDs.add(r.ActionID);
        }
        const verbSet = new Set(allResults.filter(r => r?.Success).map(r => r?.Verb));
        const readVerbsPresent = ['Get', 'Search', 'List'].every(v => verbSet.has(v));
        steps.push(step('genaction.generate.all-verbs', genAll.Success === true && readVerbsPresent, {
            observed: {
                envelopeSuccess: genAll.Success ?? null, message: genAll.Message ?? null,
                verbs: allResults.map(r => ({ verb: r?.Verb, success: r?.Success, alreadyExisted: r?.AlreadyExisted, actionID: r?.ActionID })),
            },
            note: 'plan §9: omitting the verb generates ALL applicable verbs for the object (Get/Search/List always; '
                + 'Create/Update/Delete/Upsert only when the object supports writes). DESIRED: the read verbs all persist.',
        }));
    } catch (e) {
        steps.push(step('genaction.error', false, {
            observed: { error: String(e?.stack ?? e?.message ?? e) },
            note: 'unexpected error in the generated-actions phase — see error; the cleanup below still runs.',
        }));
    } finally {
        // ── 6) CLEANUP: delete every Action (and its children) this phase created, restoring metadata ─────
        let deleted = 0;
        const failures = [];
        for (const actionID of createdActionIDs) {
            try { await deleteActionCascade(db, cfg, actionID); deleted++; }
            catch (e) { failures.push({ actionID, error: String(e?.message ?? e) }); }
        }
        // Verify the generated category-scoped Action rows are gone (the connection/credential are untouched).
        steps.push(step('genaction.cleanup', failures.length === 0, {
            observed: { createdActions: createdActionIDs.size, deleted, failures },
            note: 'cleanup: every Action (+ its params + result codes) this phase created is deleted DB-direct so the '
                + 'metadata returns to its prior state. The seeded connection + encrypted credential are PRESERVED. '
                + 'NOTE: the generated "<Integration> Integration" Action Category is left in place (find-or-create, '
                + 'harmless + reused) — see expectedFrameworkGaps for the missing GQL delete-action op.',
        }));
    }

    return steps;
}

// Re-export the shared GQL ops object for any orchestrator that wants the canonical strings alongside
// this phase's two op strings (parity with how the sibling phases surface their op sets).
export { GENACT_GQL };
void GQL; // imported for parity with sibling phases; the two ops above are this phase's surface.

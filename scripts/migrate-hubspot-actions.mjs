#!/usr/bin/env node
/**
 * Migrates existing HubSpot actions in the database to the new
 * connector-driven IntegrationActionExecutor format.
 *
 * Reads the CURRENT database state (actions, params, result codes) via sqlcmd,
 * then merges with the freshly generated .hubspot-actions.json so that:
 *
 *  - Actions with a matching DB record get the DB primaryKey → UPDATE
 *  - Actions with no DB match get no primaryKey → CREATE
 *  - DB actions with no generated match get a deleteRecord marker → DELETE
 *  - Same merge logic applies recursively to ActionParams and ActionResultCodes
 *
 * Usage:
 *   node scripts/migrate-hubspot-actions.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Config ──────────────────────────────────────────────────────────

/**
 * Maps old DB action name → new generated action name.
 * Where the old and new names are identical, the entry maps to itself.
 * Where names diverge (plural → singular, special → generic), the map resolves it.
 *
 * Old actions not in this map and not in CUSTOM_ACTIONS will be delete-marked.
 */
const DB_TO_GENERATED_NAME = {
    // Exact matches (old name == new name)
    'HubSpot - Get Contact':      'HubSpot - Get Contact',
    'HubSpot - Create Contact':   'HubSpot - Create Contact',
    'HubSpot - Update Contact':   'HubSpot - Update Contact',
    'HubSpot - Delete Contact':   'HubSpot - Delete Contact',
    'HubSpot - Get Company':      'HubSpot - Get Company',
    'HubSpot - Create Company':   'HubSpot - Create Company',
    'HubSpot - Update Company':   'HubSpot - Update Company',
    'HubSpot - Get Deal':         'HubSpot - Get Deal',
    'HubSpot - Create Deal':      'HubSpot - Create Deal',
    'HubSpot - Update Deal':      'HubSpot - Update Deal',
    'HubSpot - Create Task':      'HubSpot - Create Task',
    'HubSpot - Update Task':      'HubSpot - Update Task',

    // Renamed: plural → singular
    'HubSpot - Search Contacts':  'HubSpot - Search Contact',
    'HubSpot - Search Companies': 'HubSpot - Search Company',
    'HubSpot - Search Deals':     'HubSpot - Search Deal',
};

/** The 4 custom actions that stay in bizapps-actions.json — NOT migrated or deleted */
const CUSTOM_ACTIONS = new Set([
    'HubSpot - Associate Contact to Company',
    'HubSpot - Merge Contacts',
    'HubSpot - Log Activity',
    'HubSpot - Get Activities by Contact',
]);

// ─── Database Queries ────────────────────────────────────────────────

function loadEnv() {
    const envPath = join(ROOT, '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const env = {};
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    }
    return env;
}

function runQuery(env, sql) {
    const cmd = [
        'sqlcmd',
        '-S', `${env.DB_HOST},${env.DB_PORT}`,
        '-U', env.DB_USERNAME,
        '-P', `'${env.DB_PASSWORD}'`,
        '-d', env.DB_DATABASE,
        '-C', // Trust server certificate
        '-s', '"|"', // Column separator
        '-W', // Trim trailing spaces
        '-h', '-1', // No headers
        '-Q', `"${sql.replace(/"/g, '\\"')}"`,
    ];
    const result = execSync(cmd.join(' '), { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, shell: true });
    return result
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('(') && !line.match(/^\d+ rows? affected/));
}

function queryDbActions(env) {
    const sql = `
        SELECT CONVERT(VARCHAR(36), a.ID) AS ID, a.Name
        FROM __mj.Action a
        WHERE a.Name LIKE 'HubSpot%'
        ORDER BY a.Name
    `;
    const rows = runQuery(env, sql);
    const actions = [];
    for (const row of rows) {
        const [id, name] = row.split('|').map(s => s.trim());
        if (id && name) actions.push({ ID: id, Name: name });
    }
    return actions;
}

function queryDbParams(env, actionIds) {
    if (actionIds.length === 0) return [];
    const inClause = actionIds.map(id => `'${id}'`).join(',');
    const sql = `
        SELECT CONVERT(VARCHAR(36), ap.ID) AS ID,
               CONVERT(VARCHAR(36), ap.ActionID) AS ActionID,
               ap.Name, ap.Type, ap.ValueType, ap.IsArray, ap.IsRequired, ap.Description
        FROM __mj.ActionParam ap
        WHERE ap.ActionID IN (${inClause})
        ORDER BY ap.ActionID, ap.Name
    `;
    const rows = runQuery(env, sql);
    const params = [];
    for (const row of rows) {
        const parts = row.split('|').map(s => s.trim());
        if (parts.length >= 8) {
            params.push({
                ID: parts[0],
                ActionID: parts[1],
                Name: parts[2],
                Type: parts[3],
                ValueType: parts[4],
                IsArray: parts[5] === '1',
                IsRequired: parts[6] === '1',
                Description: parts[7],
            });
        }
    }
    return params;
}

function queryDbResultCodes(env, actionIds) {
    if (actionIds.length === 0) return [];
    const inClause = actionIds.map(id => `'${id}'`).join(',');
    const sql = `
        SELECT CONVERT(VARCHAR(36), rc.ID) AS ID,
               CONVERT(VARCHAR(36), rc.ActionID) AS ActionID,
               rc.ResultCode, rc.IsSuccess, rc.Description
        FROM __mj.ActionResultCode rc
        WHERE rc.ActionID IN (${inClause})
        ORDER BY rc.ActionID, rc.ResultCode
    `;
    const rows = runQuery(env, sql);
    const codes = [];
    for (const row of rows) {
        const parts = row.split('|').map(s => s.trim());
        if (parts.length >= 5) {
            codes.push({
                ID: parts[0],
                ActionID: parts[1],
                ResultCode: parts[2],
                IsSuccess: parts[3] === '1',
                Description: parts[4],
            });
        }
    }
    return codes;
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
    const genPath = join(ROOT, 'metadata/actions/integrations-auto-generated/.hubspot-actions.json');
    if (!existsSync(genPath)) {
        console.error('ERROR: Generated .hubspot-actions.json not found. Run generate-integration-actions.ts first.');
        process.exit(1);
    }

    console.log('Reading .env for DB connection...');
    const env = loadEnv();

    console.log(`Querying ${env.DB_DATABASE} for existing HubSpot actions...`);
    const dbActions = queryDbActions(env);
    console.log(`  Found ${dbActions.length} actions in DB`);

    // Filter to only migratable actions (exclude custom ones)
    const migratableDbActions = dbActions.filter(a => !CUSTOM_ACTIONS.has(a.Name));
    const migratableIds = migratableDbActions.map(a => a.ID);

    console.log('  Querying params and result codes...');
    const dbParams = queryDbParams(env, migratableIds);
    const dbCodes = queryDbResultCodes(env, migratableIds);
    console.log(`  Found ${dbParams.length} params, ${dbCodes.length} result codes`);

    // Group DB params and codes by ActionID
    const paramsByAction = groupBy(dbParams, 'ActionID');
    const codesByAction = groupBy(dbCodes, 'ActionID');

    // Read freshly generated actions
    const generatedActions = JSON.parse(readFileSync(genPath, 'utf-8'));
    const genByName = new Map();
    for (const action of generatedActions) {
        genByName.set(action.fields.Name, action);
    }

    // Track consumed generated action names
    const consumedGenNames = new Set();

    // Build output: merged actions
    const outputActions = [];
    let matchedCount = 0;
    let deleteActionCount = 0;

    for (const dbAction of migratableDbActions) {
        const genName = DB_TO_GENERATED_NAME[dbAction.Name];

        if (genName && genByName.has(genName)) {
            // Match found — merge: new fields + old primaryKey
            const genAction = genByName.get(genName);
            consumedGenNames.add(genName);

            const dbActionParams = paramsByAction.get(dbAction.ID) || [];
            const dbActionCodes = codesByAction.get(dbAction.ID) || [];

            const merged = buildMergedAction(dbAction, genAction, dbActionParams, dbActionCodes);
            outputActions.push(merged);
            matchedCount++;
            console.log(`  MATCH: "${dbAction.Name}" → "${genName}" (ID: ${dbAction.ID})`);
        } else {
            // No match — this old action should be deleted
            const dbActionParams = paramsByAction.get(dbAction.ID) || [];
            const dbActionCodes = codesByAction.get(dbAction.ID) || [];

            const deleteAction = buildDeleteAction(dbAction, dbActionParams, dbActionCodes);
            outputActions.push(deleteAction);
            deleteActionCount++;
            console.log(`  DELETE: "${dbAction.Name}" (ID: ${dbAction.ID})`);
        }
    }

    // Add genuinely new generated actions (no DB match) — no primaryKey
    let newCount = 0;
    for (const action of generatedActions) {
        if (!consumedGenNames.has(action.fields.Name)) {
            outputActions.push(action);
            newCount++;
        }
    }

    // Write output
    writeFileSync(genPath, JSON.stringify(outputActions, null, 2) + '\n');
    console.log(`\nWrote ${outputActions.length} records to .hubspot-actions.json`);

    // Summary
    let deleteParamCount = 0;
    let deleteCodeCount = 0;
    let matchedParamCount = 0;
    let matchedCodeCount = 0;
    let newParamCount = 0;
    let newCodeCount = 0;
    for (const action of outputActions) {
        if (action.deleteRecord) continue;
        const params = action.relatedEntities?.['MJ: Action Params'] || [];
        const codes = action.relatedEntities?.['MJ: Action Result Codes'] || [];
        deleteParamCount += params.filter(p => p.deleteRecord).length;
        deleteCodeCount += codes.filter(c => c.deleteRecord).length;
        matchedParamCount += params.filter(p => p.primaryKey && !p.deleteRecord).length;
        matchedCodeCount += codes.filter(c => c.primaryKey && !c.deleteRecord).length;
        newParamCount += params.filter(p => !p.primaryKey && !p.deleteRecord).length;
        newCodeCount += codes.filter(c => !c.primaryKey && !c.deleteRecord).length;
    }

    console.log(`\nSummary:`);
    console.log(`  Actions:  ${matchedCount} matched (UPDATE), ${newCount} new (CREATE), ${deleteActionCount} delete-marked`);
    console.log(`  Params:   ${matchedParamCount} matched, ${newParamCount} new, ${deleteParamCount} delete-marked`);
    console.log(`  Results:  ${matchedCodeCount} matched, ${newCodeCount} new, ${deleteCodeCount} delete-marked`);
}

// ─── Merge Logic ─────────────────────────────────────────────────────

function buildMergedAction(dbAction, genAction, dbParams, dbCodes) {
    // Use new generated fields but keep the DB action name for backwards compatibility
    const mergedFields = { ...genAction.fields };
    // Keep the DB name if it differs (e.g., plural → singular rename),
    // so agent references don't break. The new name will be used going forward.
    // Actually, use the NEW generated name — this is the canonical name now.
    // Old name → new name is the migration.

    // Merge params: match by Name (case-insensitive)
    const genParams = genAction.relatedEntities?.['MJ: Action Params'] || [];
    const mergedParams = mergeRelatedRecords(
        genParams,
        dbParams.map(p => ({
            fields: {
                ActionID: '@parent:ID',
                Name: p.Name,
                Type: p.Type,
                ValueType: p.ValueType,
                IsArray: p.IsArray,
                IsRequired: p.IsRequired,
                Description: p.Description,
            },
            primaryKey: { ID: p.ID },
        })),
        'Name'
    );

    // Merge result codes: match by ResultCode (case-insensitive)
    const genCodes = genAction.relatedEntities?.['MJ: Action Result Codes'] || [];
    const mergedCodes = mergeRelatedRecords(
        genCodes,
        dbCodes.map(c => ({
            fields: {
                ActionID: '@parent:ID',
                ResultCode: c.ResultCode,
                IsSuccess: c.IsSuccess,
                Description: c.Description,
            },
            primaryKey: { ID: c.ID },
        })),
        'ResultCode'
    );

    return {
        fields: mergedFields,
        primaryKey: { ID: dbAction.ID },
        relatedEntities: {
            'MJ: Action Params': mergedParams,
            'MJ: Action Result Codes': mergedCodes,
        },
    };
}

function buildDeleteAction(dbAction, dbParams, dbCodes) {
    // Build delete markers for the action and all its children
    const paramDeletes = dbParams.map(p => ({
        fields: { ActionID: '@parent:ID', Name: p.Name },
        primaryKey: { ID: p.ID },
        deleteRecord: { delete: true },
    }));

    const codeDeletes = dbCodes.map(c => ({
        fields: { ActionID: '@parent:ID', ResultCode: c.ResultCode },
        primaryKey: { ID: c.ID },
        deleteRecord: { delete: true },
    }));

    return {
        fields: { Name: dbAction.Name },
        primaryKey: { ID: dbAction.ID },
        deleteRecord: { delete: true },
        relatedEntities: {
            'MJ: Action Params': paramDeletes,
            'MJ: Action Result Codes': codeDeletes,
        },
    };
}

/**
 * Merges new and old related records by matching on a key field (case-insensitive).
 *
 * - Matched records: new fields + old primaryKey → UPDATE
 * - New-only records: no primaryKey → CREATE
 * - Old-only records: deleteRecord marker → DELETE
 */
function mergeRelatedRecords(newRecords, oldRecords, keyField) {
    const oldByKey = new Map();
    for (const rec of oldRecords) {
        if (rec.primaryKey?.ID) {
            const key = String(rec.fields[keyField] || '').toLowerCase();
            oldByKey.set(key, rec);
        }
    }

    const consumedOldKeys = new Set();
    const merged = [];

    for (const newRec of newRecords) {
        const key = String(newRec.fields[keyField] || '').toLowerCase();
        const oldRec = oldByKey.get(key);

        if (oldRec) {
            consumedOldKeys.add(key);
            merged.push({
                fields: { ...newRec.fields },
                primaryKey: oldRec.primaryKey,
            });
        } else {
            merged.push(newRec);
        }
    }

    for (const [key, oldRec] of oldByKey) {
        if (!consumedOldKeys.has(key)) {
            merged.push({
                fields: { ...oldRec.fields },
                primaryKey: oldRec.primaryKey,
                deleteRecord: { delete: true },
            });
        }
    }

    return merged;
}

// ─── Utilities ───────────────────────────────────────────────────────

function groupBy(arr, key) {
    const map = new Map();
    for (const item of arr) {
        const k = item[key];
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
    }
    return map;
}

// ─── Run ─────────────────────────────────────────────────────────────

main();

#!/usr/bin/env node
/**
 * Migrates existing BizApps HubSpot actions to IntegrationActionExecutor format.
 *
 * For each migratable action:
 *  1. Takes the NEW generated action record (with IntegrationActionExecutor driver + Config)
 *  2. Preserves the OLD action primaryKey (database ID)
 *  3. Keeps the OLD action name (to avoid breaking agent references)
 *  4. For ActionParams/ResultCodes: matches by name (case-insensitive):
 *     - Matched: new fields + old primaryKey → UPDATE in DB
 *     - New-only: no primaryKey → CREATE in DB
 *     - Old-only: deleteRecord marker → DELETE from DB
 *
 * Output:
 *  - metadata/actions/integrations-auto-generated/.hubspot-actions.json
 *  - Updated metadata/actions/.bizapps-actions.json (only custom actions remain)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Config ──────────────────────────────────────────────────────────

/** Map of old action name → { Verb, ObjectName } for the 18 migratable actions */
const MIGRATION_MAP = {
    'HubSpot - Get Contact':            { Verb: 'Get',    ObjectName: 'contacts' },
    'HubSpot - Create Contact':         { Verb: 'Create', ObjectName: 'contacts' },
    'HubSpot - Update Contact':         { Verb: 'Update', ObjectName: 'contacts' },
    'HubSpot - Delete Contact':         { Verb: 'Delete', ObjectName: 'contacts' },
    'HubSpot - Search Contacts':        { Verb: 'Search', ObjectName: 'contacts' },
    'HubSpot - Get Company':            { Verb: 'Get',    ObjectName: 'companies' },
    'HubSpot - Create Company':         { Verb: 'Create', ObjectName: 'companies' },
    'HubSpot - Update Company':         { Verb: 'Update', ObjectName: 'companies' },
    'HubSpot - Search Companies':       { Verb: 'Search', ObjectName: 'companies' },
    'HubSpot - Get Deal':               { Verb: 'Get',    ObjectName: 'deals' },
    'HubSpot - Create Deal':            { Verb: 'Create', ObjectName: 'deals' },
    'HubSpot - Update Deal':            { Verb: 'Update', ObjectName: 'deals' },
    'HubSpot - Search Deals':           { Verb: 'Search', ObjectName: 'deals' },
    'HubSpot - Create Task':            { Verb: 'Create', ObjectName: 'tasks' },
    'HubSpot - Update Task':            { Verb: 'Update', ObjectName: 'tasks' },
    'HubSpot - Get Deals by Company':   { Verb: 'Search', ObjectName: 'deals' },
    'HubSpot - Get Deals by Contact':   { Verb: 'Search', ObjectName: 'deals' },
    'HubSpot - Get Upcoming Tasks':     { Verb: 'Search', ObjectName: 'tasks' },
};

/** The 4 custom actions that stay in bizapps-actions.json unchanged */
const CUSTOM_ACTIONS = new Set([
    'HubSpot - Associate Contact to Company',
    'HubSpot - Merge Contacts',
    'HubSpot - Log Activity',
    'HubSpot - Get Activities by Contact',
]);

/**
 * Maps old action name → new generated action name.
 */
function findNewGeneratedName(oldName, verb, objectName) {
    const objectDisplayNames = {
        contacts: 'Contact',
        companies: 'Company',
        deals: 'Deal',
        tasks: 'Task',
        tickets: 'Ticket',
        products: 'Product',
    };
    const display = objectDisplayNames[objectName] || objectName;
    return `HubSpot - ${verb} ${display}`;
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
    const oldPath = join(ROOT, 'metadata/actions/.bizapps-actions.json');
    const newPath = join(ROOT, 'metadata/actions/integrations-auto-generated/.hubspot-actions.json');
    const outDir = join(ROOT, 'metadata/actions/integrations-auto-generated');
    const outPath = join(outDir, '.hubspot-actions.json');

    // Read source files
    const oldActions = JSON.parse(readFileSync(oldPath, 'utf-8'));
    const newActions = JSON.parse(readFileSync(newPath, 'utf-8'));

    // Index old actions by name
    const oldByName = new Map();
    for (const action of oldActions) {
        const name = action.fields.Name;
        if (name.startsWith('HubSpot')) {
            oldByName.set(name, action);
        }
    }

    // Index new generated actions by name
    const newByName = new Map();
    for (const action of newActions) {
        newByName.set(action.fields.Name, action);
    }

    // Track which new actions we've consumed
    const consumedNewNames = new Set();

    // Build the output array
    const outputActions = [];

    // 1. Process the 18 migratable actions
    for (const [oldName, config] of Object.entries(MIGRATION_MAP)) {
        const oldAction = oldByName.get(oldName);
        if (!oldAction) {
            console.warn(`WARNING: Old action "${oldName}" not found in bizapps-actions.json`);
            continue;
        }

        // Find corresponding new generated action
        const newGenName = findNewGeneratedName(oldName, config.Verb, config.ObjectName);
        let newAction = newByName.get(newGenName);

        // Fallback: try base Search for special search variants
        if (!newAction) {
            const baseSearchName = findNewGeneratedName(oldName, 'Search', config.ObjectName);
            newAction = newByName.get(baseSearchName);
        }

        if (!newAction) {
            console.warn(`WARNING: No matching new action for "${oldName}" (tried "${newGenName}")`);
            continue;
        }

        consumedNewNames.add(newAction.fields.Name);

        // Build the merged action
        const merged = buildMergedAction(oldAction, newAction, oldName, config);
        outputActions.push(merged);
    }

    // 2. Add genuinely new actions (no old equivalent) — these have no primaryKey
    for (const action of newActions) {
        if (!consumedNewNames.has(action.fields.Name)) {
            outputActions.push(action);
        }
    }

    // 3. Write output
    if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
    }

    writeFileSync(outPath, JSON.stringify(outputActions, null, 2) + '\n');
    console.log(`Wrote ${outputActions.length} actions to ${outPath}`);

    // 4. Update bizapps-actions.json — keep only custom + non-HubSpot actions
    const remainingBizapps = oldActions.filter(action => {
        const name = action.fields.Name;
        if (!name.startsWith('HubSpot')) return true; // Keep non-HubSpot
        return CUSTOM_ACTIONS.has(name); // Keep custom HubSpot actions
    });

    writeFileSync(oldPath, JSON.stringify(remainingBizapps, null, 2) + '\n');
    console.log(`Updated bizapps-actions.json: ${remainingBizapps.length} actions remaining`);

    // Summary
    const migrated = outputActions.filter(a => a.primaryKey);
    const brandNew = outputActions.filter(a => !a.primaryKey);
    console.log(`\nSummary:`);
    console.log(`  Migrated (with old IDs): ${migrated.length}`);
    console.log(`  Brand new (no IDs): ${brandNew.length}`);
    console.log(`  Custom (unchanged in bizapps): ${remainingBizapps.filter(a => a.fields.Name.startsWith('HubSpot')).length}`);
    console.log(`  Non-HubSpot (unchanged): ${remainingBizapps.filter(a => !a.fields.Name.startsWith('HubSpot')).length}`);

    // Count delete markers
    let deleteParamCount = 0;
    let deleteResultCount = 0;
    for (const action of migrated) {
        const params = action.relatedEntities?.['MJ: Action Params'] || [];
        const codes = action.relatedEntities?.['MJ: Action Result Codes'] || [];
        deleteParamCount += params.filter(p => p.deleteRecord).length;
        deleteResultCount += codes.filter(c => c.deleteRecord).length;
    }
    console.log(`  Delete markers: ${deleteParamCount} params, ${deleteResultCount} result codes`);
}

// ─── Merge Logic ─────────────────────────────────────────────────────

function buildMergedAction(oldAction, newAction, oldName, config) {
    // Start with the new action's fields (has IntegrationActionExecutor, Config, etc.)
    const mergedFields = { ...newAction.fields };

    // Keep the old action name to preserve agent references
    mergedFields.Name = oldName;

    // Ensure Config is correct for this specific action
    mergedFields.Config = JSON.stringify({
        IntegrationName: 'HubSpot',
        ObjectName: config.ObjectName,
        Verb: config.Verb,
    });

    // Merge params: match by name (case-insensitive), carry over primaryKeys
    const newParams = newAction.relatedEntities?.['MJ: Action Params'] || [];
    const oldParams = oldAction.relatedEntities?.['MJ: Action Params'] || [];
    const mergedParams = mergeRelatedRecords(newParams, oldParams, 'Name');

    // Merge result codes: match by ResultCode (case-insensitive), carry over primaryKeys
    const newCodes = newAction.relatedEntities?.['MJ: Action Result Codes'] || [];
    const oldCodes = oldAction.relatedEntities?.['MJ: Action Result Codes'] || [];
    const mergedCodes = mergeRelatedRecords(newCodes, oldCodes, 'ResultCode');

    const merged = {
        fields: mergedFields,
        relatedEntities: {
            'MJ: Action Params': mergedParams,
            'MJ: Action Result Codes': mergedCodes,
        },
        primaryKey: oldAction.primaryKey,
    };

    // Include sync if present
    if (oldAction.sync) {
        merged.sync = oldAction.sync;
    }

    return merged;
}

/**
 * Merges new and old related records by matching on a key field (case-insensitive).
 *
 * - Matched records: new fields + old primaryKey/sync (update in DB)
 * - New-only records: no primaryKey (create in DB)
 * - Old-only records: deleteRecord marker (remove from DB)
 */
function mergeRelatedRecords(newRecords, oldRecords, keyField) {
    // Build lookup of old records by key (case-insensitive)
    const oldByKey = new Map();
    for (const rec of oldRecords) {
        if (rec.primaryKey?.ID) {
            const key = String(rec.fields[keyField] || '').toLowerCase();
            oldByKey.set(key, rec);
        }
    }

    const consumedOldKeys = new Set();
    const merged = [];

    // Process new records — attach old primaryKey if name matches
    for (const newRec of newRecords) {
        const key = String(newRec.fields[keyField] || '').toLowerCase();
        const oldRec = oldByKey.get(key);

        if (oldRec) {
            // Match found — carry over primaryKey so mj sync does an UPDATE
            consumedOldKeys.add(key);
            const withPK = {
                fields: { ...newRec.fields },
                primaryKey: oldRec.primaryKey,
            };
            if (oldRec.sync) withPK.sync = oldRec.sync;
            merged.push(withPK);
        } else {
            // No match — new record, will be created
            merged.push(newRec);
        }
    }

    // Old records not matched → delete markers
    for (const [key, oldRec] of oldByKey) {
        if (!consumedOldKeys.has(key)) {
            merged.push({
                fields: { ...oldRec.fields },
                primaryKey: oldRec.primaryKey,
                deleteRecord: { delete: true },
                ...(oldRec.sync ? { sync: oldRec.sync } : {}),
            });
        }
    }

    return merged;
}


// ─── Run ─────────────────────────────────────────────────────────────

main();

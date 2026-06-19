#!/usr/bin/env node
/**
 * FK repair for half-set foreign keys (IsForeignKey=true + null RelatedIntegrationObjectID), which T1
 * ForeignKeyResolution flags and the engine silently drops. Two correct outcomes, applied automatically:
 *
 *  1. RESOLVE — a SCALAR `<Name>Id` / `<Name>TypeId` field whose target object exists as a sibling IO:
 *     set RelatedIntegrationObjectID to an @lookup of that sibling. (A real FK that just didn't resolve.)
 *  2. DEMOTE — an object/json/list/connection-typed field (a GraphQL relationship edge), OR a scalar whose
 *     target sibling does NOT exist: set IsForeignKey=false (it's a column/access-path, not a scalar FK).
 *
 *   node fix-half-set-fks.mjs <metadata.json>          # DRY RUN (report)
 *   node fix-half-set-fks.mjs <metadata.json> --apply  # write (.bak taken); then `mj sync push`
 *
 * No deleteRecord needed — all are field MODIFICATIONS, upserted by sync push.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) { console.error('usage: node fix-half-set-fks.mjs <metadata.json> [--apply]'); process.exit(2); }

const json = JSON.parse(readFileSync(file, 'utf8'));
const root = Array.isArray(json) ? json[0] : json;
const ios = (root.relatedEntities || {})['MJ: Integration Objects'] || [];

// Sibling IO name index (lowercased) for FK-target resolution.
const ioNames = new Map();
for (const io of ios) { const n = io.fields?.Name; if (n) ioNames.set(String(n).toLowerCase(), n); }

const OBJECTISH = /object|json|\[|connection|edge|node|list/i;
// strip a trailing `Id` (NOT `TypeId` — that loses the Type) and map to a sibling object name.
// `EventExhibitorTypeId` -> `EventExhibitorType` (preferred), else `EventExhibitor`; `accountId` -> `Account`.
function resolveTarget(fieldName) {
    const noId = String(fieldName).replace(/Id$/i, '');
    for (const cand of [noId, noId.replace(/Type$/i, ''), noId.replace(/s$/i, ''), noId + 's']) {
        if (!cand) continue;
        const hit = ioNames.get(String(cand).toLowerCase());
        if (hit) return hit;
    }
    return null;
}

const integrationName = root.fields?.Name || '';
let resolved = 0, demotedEdge = 0, demotedNoTarget = 0;
const log = [];

for (const io of ios) {
    const iofs = ((io.relatedEntities || {})['MJ: Integration Object Fields'] || []);
    for (const f of iofs) {
        const ff = f.fields || {};
        if (!(ff.IsForeignKey === true && !ff.RelatedIntegrationObjectID)) continue;
        const t = String(ff.Type || '');
        const isEdge = OBJECTISH.test(t) || t === '';
        if (isEdge) {
            if (apply) ff.IsForeignKey = false;
            demotedEdge++;
        } else {
            const target = resolveTarget(ff.Name);
            if (target) {
                if (apply) ff.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${target}&IntegrationID=@parent:ID`;
                resolved++;
                if (log.length < 10) log.push(`  RESOLVE ${io.fields?.Name}.${ff.Name} -> ${target}`);
            } else {
                if (apply) ff.IsForeignKey = false;
                demotedNoTarget++;
                if (log.length < 10) log.push(`  DEMOTE  ${io.fields?.Name}.${ff.Name} (no sibling '${ff.Name.replace(/(TypeId|Id)$/i,'')}')`);
            }
        }
    }
}

console.log(`${file}:`);
console.log(`  RESOLVED scalar FK -> sibling @lookup: ${resolved}`);
console.log(`  DEMOTED object/edge-typed -> column:   ${demotedEdge}`);
console.log(`  DEMOTED scalar (no sibling target):    ${demotedNoTarget}`);
if (log.length) console.log(log.join('\n'));
if (apply) {
    copyFileSync(file, file + '.bak');
    writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    console.log(`  APPLIED -> ${file} (.bak saved). Half-set FKs now: 0.`);
} else {
    console.log('  DRY RUN — re-run with --apply.');
}

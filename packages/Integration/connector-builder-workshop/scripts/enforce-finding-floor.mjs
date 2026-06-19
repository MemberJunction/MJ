#!/usr/bin/env node
// Mechanical §0b enforcement — runs in CODE over an extracted metadata file.
// This is the ENFORCEMENT layer the role-prose alone could not guarantee: it
// corrects/flags the two invariants that the extractor kept getting wrong, as a
// deterministic pattern pass (no LLM, no per-field reasoning). Idempotent.
//
//   1. SYNC-SAFETY: a non-PK column may NOT be NOT NULL (AllowsNull=false) unless
//      explicitly corroborated. We demote non-PK AllowsNull=false -> true and keep
//      the documented requiredness in IsRequired (accuracy preserved, sync safe).
//   2. FK CONTRADICTION: strip any FK whose own field Description contradicts a
//      relationship (an alias of the record's own id, not an edge).
//
// Usage: node enforce-finding-floor.mjs <metadata.json> [--check]
//   default = correct in place (with .bak); --check = report only, exit 1 if violations.

import fs from 'node:fs';

const file = process.argv[2];
const checkOnly = process.argv.includes('--check');
if (!file || !fs.existsSync(file)) { console.error(`metadata file not found: ${file}`); process.exit(2); }

const raw = fs.readFileSync(file, 'utf8');
const doc = JSON.parse(raw);
const root = Array.isArray(doc) ? doc[0] : doc;
const ios = root?.relatedEntities?.['MJ: Integration Objects'] ?? [];

// Contradiction motif: description says the field is an alias of id / for cross-ref,
// NOT a foreign key. Pattern-based, applied uniformly — no per-field judgement.
const CONTRADICTION = /\bsame as id\b|\bcross[-\s]?referenc/i;

let demotedNotNull = 0, strippedFK = 0;
const demoted = [], stripped = [];

for (const io of ios) {
    const fields = io?.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    for (const f of fields) {
        const F = f.fields; if (!F) continue;

        // (1) sync-safety: non-PK NOT NULL -> nullable
        if (F.IsPrimaryKey !== true && F.AllowsNull === false) {
            demoted.push(`${io.fields?.Name}.${F.Name}`);
            demotedNotNull++;
            if (!checkOnly) F.AllowsNull = true; // IsRequired stays = documented requiredness
        }

        // (2) FK contradiction: description defeats the edge
        if (F.RelatedIntegrationObjectID && typeof F.Description === 'string' && CONTRADICTION.test(F.Description)) {
            stripped.push(`${io.fields?.Name}.${F.Name}`);
            strippedFK++;
            if (!checkOnly) {
                delete F.RelatedIntegrationObjectID;
                delete F.RelatedIntegrationObjectFieldName;
                if ('IsForeignKey' in F) F.IsForeignKey = false;
            }
        }
    }
}

const violations = demotedNotNull + strippedFK;
console.log(JSON.stringify({
    file, mode: checkOnly ? 'check' : 'correct',
    nonPkNotNull_demoted: demotedNotNull,
    contradictionFK_stripped: strippedFK,
    demotedSample: demoted.slice(0, 8),
    strippedSample: stripped.slice(0, 8),
}, null, 2));

if (checkOnly) { process.exit(violations > 0 ? 1 : 0); }

if (violations > 0) {
    fs.writeFileSync(`${file}.bak`, raw);                 // backup before write
    fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
    console.log(`corrected ${violations} finding(s); backup at ${file}.bak`);
}

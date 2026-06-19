#!/usr/bin/env node
// Spec digest extractor — produces planner/spec-digest.json from the Phase 0 + agentic
// markdown docs.  Single source of truth: when Phase 0 evolves, the digest evolves
// with it and the planner sees the new shape on its next run.
//
// Inputs read (relative to repo root):
//   plans/integration-phase-0-pr1.md          — schema columns + base-class signatures
//   plans/integration-agentic-local.md        — bijection slot table + primitive catalog + 13-tier ladder
//   packages/Integration/connector-builder-workshop/floor/phase0-slots.json
//
// Output:
//   packages/Integration/connector-builder-workshop/planner/spec-digest.json
//
// Drift gate: the script also checks that every slot in phase0-slots.json appears
// referenced somewhere in the agentic plan, and exits 1 if not (Gap 8).
// CI runs this on every Branch 2 build.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const WORKSHOP = resolve(__dirname, '..');

const PHASE0_DOC = join(REPO_ROOT, 'plans', 'integration-phase-0-pr1.md');
const AGENTIC_DOC = join(REPO_ROOT, 'plans', 'integration-agentic-local.md');
const SLOTS_FILE = join(WORKSHOP, 'floor', 'phase0-slots.json');
const OUTPUT = join(WORKSHOP, 'planner', 'spec-digest.json');

function readFile(p) {
    if (!existsSync(p)) throw new Error(`Required input missing: ${p}`);
    return readFileSync(p, 'utf-8');
}

function extractPhase0SchemaColumns(md) {
    // Pull out every ALTER TABLE … ADD … column or CREATE TABLE … field referenced
    // in the §A schema section.  This is heuristic — we look for the migration
    // patterns the doc uses to call out columns.
    const cols = new Set();
    const colPattern = /(?:^|\s)([A-Z][A-Za-z0-9_]+)\s+(NVARCHAR|VARCHAR|UNIQUEIDENTIFIER|BIT|INT|DECIMAL|DATETIME|DATE|FLOAT|REAL)\b/g;
    let m;
    while ((m = colPattern.exec(md)) !== null) cols.add(m[1]);
    return [...cols].sort();
}

function extractBaseClassMethods(md) {
    // Grab every TypeScript-shaped method signature in the §C base-class section.
    const methods = new Set();
    const methodPattern = /(?:public|protected|private|abstract|override)\s+(?:async\s+)?([A-Z][A-Za-z0-9_]+)\s*[<(]/g;
    let m;
    while ((m = methodPattern.exec(md)) !== null) methods.add(m[1]);
    return [...methods].sort();
}

function extractPrimitiveCatalog(agenticMd) {
    // The agentic doc §2 + §13a Gap 3 list every primitive.  Recognize them by name.
    const named = [
        'verify-claim', 'audit-source', 'compute-source-diff', 'gap-fill-fork',
        'loop-until-dry', 'adversarial-verify', 'extract-iiof-pipeline',
        'freeze-contract', 'amendment-review', 'verification-ladder', 'floor-check',
    ];
    return named.map(name => ({
        name,
        referenced: agenticMd.includes(name),
    }));
}

function extractTierLadder(agenticMd) {
    // §5 lists T0..T12.  Parse the rung names + cred-required flag.
    const rungs = [];
    const linePattern = /\|\s*(T\d+)_([A-Za-z]+)\s*\|\s*([^|]+?)\s*\|\s*(Yes|No|YES|NO)\s*\|/g;
    let m;
    while ((m = linePattern.exec(agenticMd)) !== null) {
        rungs.push({
            tier: m[1],
            label: m[2],
            verifies: m[3].trim(),
            requiresCredentials: m[4].toUpperCase() === 'YES',
        });
    }
    return rungs;
}

function validateSlotsAgainstAgenticDoc(slots, agenticMd) {
    // Every slot ID should appear in the agentic plan, OR be a
    // deterministic-pipeline slot (skipped), OR match a shorthand-grouped
    // mention.  The slot table's `groupedWith` field opts a slot into the
    // shorthand allowance — when the doc says
    // `Create/Update/Delete{APIPath, Method, BodyShape, BodyKey, IDLocation}`
    // we treat that as covering each of those grouped column names.
    const drift = [];
    // Two accepted shorthand forms:
    //   1. `Create/Update/Delete{APIPath, Method, ...}`
    //   2. `{Create/Update/Delete}{APIPath, Method, ...}`  (escaped curly form used in doc tables)
    const shorthand = /\{?[A-Z][A-Za-z]*(?:\/[A-Z][A-Za-z]*)+\}?\s*\{[^}]+\}/g;
    const shorthandMatches = agenticMd.match(shorthand) ?? [];
    const shorthandPieces = new Set();
    for (const sh of shorthandMatches) {
        // Capture EVERY {...} block in the shorthand, not just the first.  The
        // doc uses `{Create/Update/Delete}{APIPath, Method, ...}` — we want
        // the suffix pieces (the second block) for matching slot suffixes.
        const blocks = sh.match(/\{([^}]+)\}/g) ?? [];
        for (const block of blocks) {
            const content = block.slice(1, -1);
            for (const part of content.split(/[,\/]/).map(s => s.trim())) {
                if (part) shorthandPieces.add(part);
            }
        }
    }
    for (const slot of slots.slots) {
        if (slot.producer === 'deterministic-pipeline') continue;
        const last = slot.id.split('.').pop();
        if (agenticMd.includes(slot.id) || agenticMd.includes(last)) continue;
        // Try the shorthand grouped allowance — match the operation-prefixed
        // suffix (e.g. 'CreateAPIPath' -> suffix 'APIPath') against the
        // grouped pieces.
        const operationStripped = last
            .replace(/^Create/, '').replace(/^Update/, '').replace(/^Delete/, '');
        // The 'API'-prefixed columns (e.g. CreateAPIPath) strip down to APIPath,
        // which the shorthand group lists directly.  Some historical variants
        // dropped the 'API' prefix; accept either form to stay resilient.
        const altStripped = operationStripped.replace(/^API/, '');
        if (shorthandPieces.has(operationStripped) || shorthandPieces.has(altStripped)) continue;
        drift.push(slot.id);
    }
    return drift;
}

function main() {
    const phase0 = readFile(PHASE0_DOC);
    const agentic = readFile(AGENTIC_DOC);
    const slots = JSON.parse(readFile(SLOTS_FILE));

    const digest = {
        _generatedAt: '<runtime>',
        _doc: 'Auto-generated by regenerate-spec-digest.mjs. Do not edit by hand. The planner reads this at run time; CI fails the agentic branch if this is out of sync with the Phase 0 doc.',
        _sources: {
            phase0Md: 'plans/integration-phase-0-pr1.md',
            agenticMd: 'plans/integration-agentic-local.md',
            slotsJson: 'packages/Integration/connector-builder-workshop/floor/phase0-slots.json',
        },
        schemaColumns: extractPhase0SchemaColumns(phase0),
        baseClassMethods: extractBaseClassMethods(phase0),
        primitiveCatalog: extractPrimitiveCatalog(agentic),
        tierLadder: extractTierLadder(agentic),
        bijectionSlots: slots.slots,
        bijectionSlotCount: slots.slots.length,
    };

    const drift = validateSlotsAgainstAgenticDoc(slots, agentic);
    if (drift.length > 0) {
        console.error('[regenerate-spec-digest] DRIFT — slots not referenced in agentic plan:');
        for (const s of drift) console.error(`  - ${s}`);
        process.exitCode = 1;
    }

    writeFileSync(OUTPUT, JSON.stringify(digest, null, 2), 'utf-8');
    console.log(`[regenerate-spec-digest] wrote ${OUTPUT}`);
    console.log(`  schemaColumns: ${digest.schemaColumns.length}`);
    console.log(`  baseClassMethods: ${digest.baseClassMethods.length}`);
    console.log(`  primitives: ${digest.primitiveCatalog.length} (${digest.primitiveCatalog.filter(p => p.referenced).length} referenced)`);
    console.log(`  tierLadder rungs: ${digest.tierLadder.length}`);
    console.log(`  bijectionSlots: ${digest.bijectionSlotCount}`);
    if (process.exitCode === 1) {
        console.error('  DRIFT detected — exit 1');
    }
}

main();

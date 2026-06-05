// LOCKED PRIMITIVE — floor-check
//
// Guarantee: the FINAL structural gate. Iterates the bijection slot table
// (`floor/phase0-slots.json`) and verifies that for every slot:
//   1. An emission exists (the run journal records an agent producer for it).
//   2. The emission has provenance (verify-claim ran and succeeded).
//   3. The value is non-null OR the slot is nullable.
// Also verifies the minimum-thoroughness manifest's structural declarations met,
// the EXTRACTION_REPORT_MATRIX.csv coverage / PK-defer rate, the source-diff
// closure, the code build cleanliness + connector file existence, and the
// verification ladder (no red rung; claimed tier reached).
//
// MECHANICAL GATE (2026-06-05 rewrite): the pass/fail DECISION is computed in JS,
// NOT returned by an LLM. Agents are used ONLY to fetch raw bytes (`cat` the slots
// file + matrix CSV) and run a deterministic existence check (`test -f` the
// connector file). Every failure is pushed to `failures[]` in JS; `pass` is
// `failures.length === 0`, computed in JS. The single agent that remains makes
// ONLY genuinely-fuzzy slot-applicability judgments — never the final verdict.
//
// REMOVED (2026-06-05): live-e2e / dual-dialect / 2^N-write enforcement. Live
// testing is now read-only only, so floor-check NO LONGER fails a run for missing
// write/bidirectional/live-mutation/dual-dialect phases. The e2eLivePhases table
// still lives in the slots file but is no longer iterated here.
//
// `pass: false` → run rejected, output NOT promoted to a connector PR.
//
// Done is structural. Agent cannot declare done.
//
// Inputs:
//   {
//     runID: string,
//     vendor: string,
//     slotsPath: string,                    // workshop/floor/phase0-slots.json
//     manifest: object,                     // planner's minimumThoroughnessManifest
//     journal: object,                      // run journal (events.jsonl summary)
//   }
//
//   journal shape consumed here:
//     {
//       slotEmissions?: { [slotId]: { producer, value, verified } },  // per-slot producer + provenance
//       extractStats?: { matrixPath, objectsExtracted, extractedObjects[] },
//       sourceDiff?: { missing: string[] },
//       codeResult?: { BuildClean: boolean, ConnectorFile: string },
//       ladder?: { tierResults: [{tier,status}], achievedTier: string },
//     }
//
// Output:
//   {
//     pass: boolean,
//     failures: Array<{rule, slot?, detail}>,
//     summary: { totalSlots, filled, verified, nullableSkipped, gapsResidual },
//   }

export const meta = {
    name: 'floor-check',
    description: 'Final gate. JS-computed: iterates Phase 0 bijection slot table; checks manifest, matrix coverage/PK-defer, source-diff closure, build cleanliness + connector file, and ladder. Agent only fetches raw bytes / runs test -f.',
    phases: [
        { title: 'load-bijection', detail: 'Agent cats slots file + matrix CSV; JS parses' },
        { title: 'iterate-slots', detail: 'JS verifies every slot has emission + provenance + non-null-or-nullable' },
        { title: 'manifest-check', detail: 'JS verifies manifest declarations, matrix, source-diff, build, ladder' },
        { title: 'verdict', detail: 'JS aggregates failures[] -> pass' },
    ],
};

const FLOOR_VERDICT_SCHEMA = {
    type: 'object',
    required: ['pass', 'failures', 'summary'],
    properties: {
        pass: { type: 'boolean' },
        failures: {
            type: 'array',
            items: {
                type: 'object',
                required: ['rule', 'detail'],
                properties: {
                    rule: {
                        enum: [
                            'slots-file-unreadable',
                            'slot-not-filled',
                            'slot-not-verified',
                            'unprovable-required',
                            'every-claim-verified',
                            'source-diff-closed',
                            'no-unprovable-asserted',
                            'manifest-extractEveryIO',
                            'manifest-verifyEveryClaim',
                            'e2e-tier-met',
                            'min-adversarial-reviewers-met',
                            'test-data-not-wiped',
                            'build-not-clean',
                            'connector-file-missing',
                            'ladder-rung-red',
                            'ladder-tier-not-reached',
                            // Gap 10 revised — multi-source PK/FK enforcement
                            'pk-defer-rate-too-high',          // >50% IOs have PKVerdict=defer
                            'extraction-matrix-missing',        // EXTRACTION_REPORT_MATRIX.csv absent
                            'extraction-matrix-row-missing',    // matrix has fewer rows than emitted IOs
                        ],
                    },
                    slot: { type: 'string' },
                    detail: { type: 'string' },
                },
            },
        },
        summary: {
            type: 'object',
            required: ['totalSlots', 'filled', 'verified'],
            properties: {
                totalSlots: { type: 'integer' },
                filled: { type: 'integer' },
                verified: { type: 'integer' },
                nullableSkipped: { type: 'integer' },
                gapsResidual: { type: 'integer' },
            },
        },
    },
    additionalProperties: false,
};

// Schema for the byte-fetcher agent: it ONLY cats files + runs test -f. No verdict.
const RAW_FETCH_SCHEMA = {
    type: 'object',
    required: ['slotsContent', 'connectorFileExists'],
    properties: {
        slotsContent: { type: 'string' },        // verbatim bytes of the slots JSON file ('' if unreadable)
        slotsReadable: { type: 'boolean' },
        matrixContent: { type: 'string' },        // verbatim bytes of EXTRACTION_REPORT_MATRIX.csv ('' if absent)
        matrixReadable: { type: 'boolean' },      // false when the file does not exist
        connectorFileExists: { type: 'boolean' }, // result of `test -f <ConnectorFile>` (exit 0 => true)
    },
    additionalProperties: false,
};

const runID = args?.runID ?? '(?)';
const vendor = args?.vendor ?? '(?)';
const slotsPath = args?.slotsPath ?? 'workshop/floor/phase0-slots.json';
const manifest = args?.manifest ?? {};
const journal = args?.journal ?? {};
const extractStats = journal.extractStats ?? {};
const matrixPath = extractStats.matrixPath ?? '';
const codeResult = journal.codeResult ?? {};
const connectorFile = codeResult.ConnectorFile ?? '';

phase('load-bijection');
log(`floor-check: runID=${runID} vendor=${vendor}`);

// ── Agent fetches RAW BYTES only — cat slots, cat matrix, test -f connector. ──
const fetched = await agent(
    `You are a NON-JUDGING file reader for connector run ${runID} (vendor=${vendor}). Run these Bash commands and return ONLY their raw output. Make NO judgment about pass/fail.\n\n` +
        `1. \`cat ${slotsPath}\` -> return its VERBATIM bytes as slotsContent (set slotsReadable=true; on error '' + slotsReadable=false).\n` +
        (matrixPath
            ? `2. If \`test -f ${matrixPath}\` exits 0, \`cat ${matrixPath}\` -> matrixContent (matrixReadable=true). If the file does NOT exist, return matrixContent='' and matrixReadable=false.\n`
            : `2. No matrix path provided: return matrixContent='' and matrixReadable=false.\n`) +
        (connectorFile
            ? `3. Run \`test -f ${connectorFile} && echo EXISTS || echo MISSING\` -> set connectorFileExists=true ONLY if it printed EXISTS.\n`
            : `3. No connector file path provided: return connectorFileExists=false.\n`) +
        `\nDo not interpret, summarize, or validate any content. Return { slotsContent, slotsReadable, matrixContent, matrixReadable, connectorFileExists }.`,
    { agentType: 'independent-reviewer', schema: RAW_FETCH_SCHEMA, phase: 'load-bijection', label: `floor-fetch:${runID}` }
);

// ── Everything below is JS. The agent contributed only raw bytes. ──
const failures = [];

// Parse the slots file in JS.
let slots = [];
if (!fetched || !fetched.slotsReadable || typeof fetched.slotsContent !== 'string' || fetched.slotsContent.trim().length === 0) {
    failures.push({ rule: 'slots-file-unreadable', detail: `could not read slots file at ${slotsPath}` });
} else {
    try {
        const parsed = JSON.parse(fetched.slotsContent);
        slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
        if (slots.length === 0) {
            failures.push({ rule: 'slots-file-unreadable', detail: 'slots file parsed but contained no slots[]' });
        }
    } catch (e) {
        failures.push({ rule: 'slots-file-unreadable', detail: `slots file is not valid JSON: ${String(e && e.message ? e.message : e)}` });
    }
}

phase('iterate-slots');
// ── Per-slot structural verification, decided in JS. ──
const slotEmissions = journal.slotEmissions ?? {};
let filled = 0;
let verified = 0;
let nullableSkipped = 0;

// Slots whose producer is a deterministic pipeline with a fixed value (e.g.
// MetadataSource='Declared') are satisfied by their fixedValue, not by an emission.
const isFixedValueSlot = (slot) => slot && Object.prototype.hasOwnProperty.call(slot, 'fixedValue');

for (const slot of slots) {
    const slotId = slot?.id ?? '(unnamed)';
    const nullable = slot?.nullable === true;

    if (isFixedValueSlot(slot)) {
        // Fixed-value slots are structurally filled + verified by definition.
        filled += 1;
        verified += 1;
        continue;
    }

    const emission = slotEmissions[slotId];

    // (1) emission exists (producer recorded in journal).
    if (!emission || !emission.producer) {
        failures.push({ rule: 'slot-not-filled', slot: slotId, detail: 'no producer emission recorded in journal' });
        continue;
    }
    filled += 1;

    // (2) provenance: verify-claim ran and succeeded.
    if (emission.verified !== true) {
        failures.push({ rule: 'slot-not-verified', slot: slotId, detail: 'emission lacks verify-claim provenance (verified !== true)' });
        // a not-verified slot also can't count toward verified; continue to null check.
    } else {
        verified += 1;
    }

    // (3) value non-null unless slot.nullable.
    const value = emission.value;
    const isNull = value === null || value === undefined;
    if (isNull) {
        if (nullable) {
            nullableSkipped += 1;
        } else {
            failures.push({ rule: 'unprovable-required', slot: slotId, detail: 'value is null/undefined on a non-nullable slot' });
        }
    }
}

phase('manifest-check');
// ── Manifest declarations, decided in JS against the journal. ──

// extractEveryIO: every discovered IO went through extract-iiof-pipeline.
// We treat extractStats.extractedObjects as the proof. If the manifest demands it
// and no objects were extracted, that's a failure.
if (manifest.extractEveryIO === true) {
    const extracted = Array.isArray(extractStats.extractedObjects) ? extractStats.extractedObjects : [];
    if (extracted.length === 0) {
        failures.push({ rule: 'manifest-extractEveryIO', detail: 'manifest.extractEveryIO=true but journal records zero extracted objects' });
    }
}

// verifyEveryClaim: every emitted claim has a verify-claim event.
// The extract pipeline exports verifyEveryClaim (claimsVerified === claimsTotal).
if (manifest.verifyEveryClaim === true) {
    if (extractStats.verifyEveryClaim !== true) {
        const detail = `manifest.verifyEveryClaim=true but not every claim verified (verified=${extractStats.claimsVerified ?? '?'} of ${extractStats.claimsTotal ?? '?'})`;
        failures.push({ rule: 'manifest-verifyEveryClaim', detail });
    }
}

// sourceDiffMustClose: compute-source-diff returned empty missing[].
if (manifest.sourceDiffMustClose === true) {
    const missing = Array.isArray(journal.sourceDiff?.missing) ? journal.sourceDiff.missing : null;
    if (missing === null) {
        failures.push({ rule: 'source-diff-closed', detail: 'manifest.sourceDiffMustClose=true but journal has no sourceDiff.missing array' });
    } else if (missing.length !== 0) {
        failures.push({ rule: 'source-diff-closed', detail: `source-diff did not close: ${missing.length} missing item(s)` });
    }
}

// ── Code build cleanliness + connector file existence (JS verdict on agent's test -f). ──
if (codeResult.BuildClean !== true) {
    failures.push({ rule: 'build-not-clean', detail: `journal.codeResult.BuildClean !== true (was ${JSON.stringify(codeResult.BuildClean)})` });
}
if (!connectorFile) {
    failures.push({ rule: 'connector-file-missing', detail: 'journal.codeResult.ConnectorFile is empty' });
} else if (!fetched || fetched.connectorFileExists !== true) {
    failures.push({ rule: 'connector-file-missing', detail: `test -f ${connectorFile} did not confirm the file exists` });
}

// ── Verification ladder: no red rung; claimed tier reached. ──
const ladder = journal.ladder ?? {};
const tierResults = Array.isArray(ladder.tierResults) ? ladder.tierResults : [];
for (const tr of tierResults) {
    if (tr && tr.status === 'red') {
        failures.push({ rule: 'ladder-rung-red', detail: `ladder rung ${tr.tier ?? '(?)'} is red` });
    }
}
// e2eTier: the manifest's required tier must have been reached (achievedTier >= manifest.e2eTier).
const tierNum = (t) => {
    const m = typeof t === 'string' ? t.match(/T(\d+)/i) : null;
    return m ? parseInt(m[1], 10) : -1;
};
if (manifest.e2eTier) {
    const required = tierNum(manifest.e2eTier);
    const achieved = tierNum(ladder.achievedTier);
    if (required >= 0 && achieved < required) {
        failures.push({ rule: 'e2e-tier-met', detail: `manifest.e2eTier=${manifest.e2eTier} but ladder achievedTier=${ladder.achievedTier ?? 'none'}` });
    }
}

// ── EXTRACTION_REPORT_MATRIX.csv coverage + PK-defer rate (JS over cat'd bytes). ──
const emittedIOCount = Number.isInteger(extractStats.objectsExtracted)
    ? extractStats.objectsExtracted
    : (Array.isArray(extractStats.extractedObjects) ? extractStats.extractedObjects.length : 0);

if (matrixPath) {
    if (!fetched || !fetched.matrixReadable || typeof fetched.matrixContent !== 'string' || fetched.matrixContent.trim().length === 0) {
        failures.push({ rule: 'extraction-matrix-missing', detail: `EXTRACTION_REPORT_MATRIX.csv not readable at ${matrixPath}` });
    } else {
        // Parse the CSV in JS: first line is the header, remaining non-empty lines are rows.
        const lines = fetched.matrixContent.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim().length > 0);
        const header = lines.length > 0 ? lines[0].split(',').map(h => h.trim()) : [];
        const dataLines = lines.slice(1);
        const pkIdx = header.indexOf('PKVerdict');

        // (a) row-count vs emitted IOs.
        if (dataLines.length < emittedIOCount) {
            failures.push({ rule: 'extraction-matrix-row-missing', detail: `matrix has ${dataLines.length} row(s) but ${emittedIOCount} IO(s) were emitted` });
        }

        // (b) PK defer-rate: >50% of rows with PKVerdict=defer => producer was lazy.
        if (pkIdx >= 0 && dataLines.length > 0) {
            let deferCount = 0;
            for (const line of dataLines) {
                const cells = line.split(',');
                const verdictCell = (cells[pkIdx] ?? '').trim().toLowerCase();
                if (verdictCell === 'defer') deferCount += 1;
            }
            if (deferCount > dataLines.length / 2) {
                failures.push({ rule: 'pk-defer-rate-too-high', detail: `${deferCount}/${dataLines.length} matrix rows defer PK (>50%)` });
            }
        }
    }
}

phase('verdict');
// ── JS computes the final verdict. ──
const totalSlots = slots.length;
const gapsResidual = failures.filter(f => f.rule === 'slot-not-filled' || f.rule === 'unprovable-required').length;
const pass = failures.length === 0;

log(`floor-check: ${pass ? 'PASS' : 'FAIL'} — ${failures.length} failure(s) across ${totalSlots} slots (filled=${filled}, verified=${verified}, nullableSkipped=${nullableSkipped})`);

return {
    pass,
    failures,
    summary: {
        totalSlots,
        filled,
        verified,
        nullableSkipped,
        gapsResidual,
    },
};

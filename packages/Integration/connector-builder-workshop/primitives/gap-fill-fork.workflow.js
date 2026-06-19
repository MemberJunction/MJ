// LOCKED PRIMITIVE — gap-fill-fork
//
// Guarantee: fork output flows back through structured handoff and writes to the
// canonical workspace via `mcp-mj-metadata`. The fork never fragments the per-vendor
// directory; the fork agent receives ONLY the gap set + the source list and emits a
// schema-conforming write-back. No raw IO/IOF tokens cross the boundary.
//
// Inputs (names align with the caller in _TEMPLATE.workflow.js):
//   { gaps: string[], sourceBundle: object, vendor: string, writeBackPath?: string, outputDir?: string }
//
// Output:
//   { filledSlots: Array<{slot, value, provenance}>, residualGaps: string[] }

export const meta = {
    name: 'gap-fill-fork',
    description: 'Context-forked agent fills the gap-set against a restricted source list; writes back via mcp-mj-metadata; structured handoff only.',
    phases: [
        { title: 'fork', detail: 'Spawn fork with only the gap set + relevant sources' },
        { title: 'write-back', detail: 'Fork writes filled slots to canonical metadata file' },
        { title: 'residual', detail: 'Report residual gaps for downstream decision' },
    ],
};

const FILL_RESULT_SCHEMA = {
    type: 'object',
    required: ['filledSlots', 'residualGaps'],
    properties: {
        filledSlots: {
            type: 'array',
            items: {
                type: 'object',
                required: ['slot', 'value', 'provenance'],
                properties: {
                    slot: { type: 'string' },
                    value: {},
                    provenance: {
                        type: 'object',
                        required: ['sourceID', 'extractionScript'],
                        properties: {
                            sourceID: { type: 'string' },
                            extractionScript: { type: 'string' },
                        },
                    },
                },
            },
        },
        residualGaps: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
};

phase('fork');
const gaps = Array.isArray(args?.gaps) ? args.gaps : [];
const sourceBundle = args?.sourceBundle ?? {};
log(`gap-fill-fork: ${gaps.length} slots to fill for vendor=${args?.vendor ?? '(?)'}`);

phase('write-back');
// The fork agent's identity depends on which slots are being filled.  For
// Integration-row slots we use metadata-writer; for IO/IOF slots we use
// ioiof-extractor.  The first gap's slot prefix determines dispatch.
const firstSlotPrefix = String(gaps[0] ?? '').split('.')[0].toLowerCase();
const forkAgentType =
    firstSlotPrefix === 'integration' ? 'metadata-writer' :
    (firstSlotPrefix === 'integrationobject' || firstSlotPrefix === 'integrationobjectfield') ? 'ioiof-extractor' :
    'metadata-writer';

const fillResult = await agent(
    `You have ONLY the following slot gaps and source bundle for vendor ${args?.vendor ?? '(?)'} — do not pull in unrelated context.\n\nGAPS: ${JSON.stringify(gaps)}\nSOURCE_BUNDLE: ${JSON.stringify(sourceBundle)}\n\nWrite filled slots back to ${args?.writeBackPath ?? '(canonical metadata file)'} via mcp-mj-metadata. For each gap, attempt to extract a value with a reproducible extractionScript pointed at one of the supplied sources. NEVER fabricate. Slots you cannot reproduce-verify remain in residualGaps. Return the structured fill result.`,
    { agentType: forkAgentType, schema: FILL_RESULT_SCHEMA, phase: 'write-back', label: `fill:${args?.vendor ?? 'unknown'}` }
);

phase('residual');
return fillResult;

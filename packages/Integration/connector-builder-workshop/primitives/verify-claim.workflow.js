// LOCKED PRIMITIVE — verify-claim
//
// Guarantee: a claim only "exists" in the contract if its provenance script
// reproduces against the pinned source. Hallucination and staleness are
// structurally caught.
//
// Inputs (via `args`):
//   {
//     claim: {
//       slot: string,                // Phase 0 slot ID (e.g. "IntegrationObject.APIPath")
//       value: unknown,              // the claimed value
//       extractionScript: string,    // POSIX shell / node snippet that reproduces value
//       sourcePath: string,          // URL or attachment path (pinned)
//     }
//   }
//
// Output schema (returned via `StructuredOutput`):
//   {
//     verified: boolean,
//     actualValue?: unknown,
//     mismatch?: { expected: unknown, actual: unknown, reason: string },
//   }

export const meta = {
    name: 'verify-claim',
    description: 'Re-runs the extraction script for a claim against the pinned source; asserts the reproduced value equals the claimed value.',
    phases: [
        { title: 'fetch-source', detail: 'Re-fetch URL or re-read attachment' },
        { title: 'reproduce', detail: 'Run the extraction script' },
        { title: 'assert', detail: 'Compare reproduced value to claimed value' },
    ],
};

// IMPLEMENTATION STUB.  The learning phase fills in the actual fetch + script-runner
// + comparator.  The shape stays fixed.
phase('fetch-source');
log(`verify-claim invoked for slot ${args?.claim?.slot ?? '(none)'}`);

const VERIFY_CLAIM_SCHEMA = {
    type: 'object',
    required: ['verified'],
    properties: {
        verified: { type: 'boolean' },
        actualValue: {},
        mismatch: {
            type: 'object',
            properties: {
                expected: {},
                actual: {},
                reason: { type: 'string' },
            },
        },
    },
    additionalProperties: false,
};

phase('reproduce');
const result = await agent(
    `Reproduce the value for slot ${args?.claim?.slot} from source ${args?.claim?.sourcePath} using the supplied extraction script. If reproduction matches the claimed value verbatim, return verified=true. If it differs, return verified=false with a mismatch object describing expected vs actual and a one-line reason. NEVER guess; if the script cannot be reproduced (network error, source missing), return verified=false with reason='source-unreachable'. Default to verified=false when uncertain.`,
    // Generic agent — no subagent type needed; verify-claim is a deterministic
    // script-rerunner with light reasoning.
    { schema: VERIFY_CLAIM_SCHEMA, phase: 'reproduce', label: `verify:${args?.claim?.slot}` }
);

phase('assert');
return result;

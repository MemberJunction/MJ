// LOCKED PRIMITIVE — floor-check
//
// Guarantee: the FINAL structural gate. Iterates the bijection slot table
// (`floor/phase0-slots.json`) and verifies that for every slot:
//   1. An emission exists (the run journal records an agent producer for it).
//   2. The emission has provenance (verify-claim ran and succeeded).
//   3. The value is non-null OR the slot is nullable.
// Also verifies the minimum-thoroughness manifest's structural declarations met.
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
// Output:
//   {
//     pass: boolean,
//     failures: Array<{rule, slot?, detail}>,
//     summary: { totalSlots, filled, verified, nullableSkipped, gapsResidual },
//   }

export const meta = {
    name: 'floor-check',
    description: 'Final gate. Iterates Phase 0 bijection slot table; rejects on any missing/unverified/unprovable-required slot or unmet manifest declaration.',
    phases: [
        { title: 'load-bijection', detail: 'Load floor/phase0-slots.json' },
        { title: 'iterate-slots', detail: 'Verify every slot has an emission + provenance' },
        { title: 'manifest-check', detail: 'Verify manifest declarations met by journal' },
        { title: 'verdict', detail: 'Aggregate to pass/fail' },
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

phase('load-bijection');
log(`floor-check: runID=${args?.runID ?? '(?)'} vendor=${args?.vendor ?? '(?)'}`);
phase('iterate-slots');
phase('manifest-check');
phase('verdict');

// independent-reviewer (different model from any producer) runs the floor.
// The reviewer's default-rejection posture aligns with the floor's structural
// "any failure → pass=false" rule.
const verdict = await agent(
    `You are the FINAL GATE for connector run ${args?.runID ?? '(?)'} (vendor=${args?.vendor ?? '(?)'}).\n\nLoad the bijection slot table from ${args?.slotsPath ?? 'workshop/floor/phase0-slots.json'}. For EVERY slot:\n  1. Find the emission in the run journal.  Missing → failures.push({rule:'slot-not-filled', slot, ...}).\n  2. Confirm the emission has provenance via verify-claim.  Missing → failures.push({rule:'slot-not-verified', slot, ...}).\n  3. Confirm value !== null unless slot.nullable === true.  Null on non-nullable → failures.push({rule:'unprovable-required', slot, ...}).\n\nAdditionally verify minimum-thoroughness manifest declarations (${JSON.stringify(args?.manifest ?? {})}):\n  - extractEveryIO=true → every discovered IO went through extract-iiof-pipeline\n  - verifyEveryClaim=true → every claim has a verify-claim event\n  - sourceDiffMustClose=true → compute-source-diff returned empty missing[]\n  - e2eTier matched against verification-ladder.achievedTier\n  - adversarialVerifyMinReviewers met in every adversarial-verify event\n  - test-data directory wiped at PR-open time (presence = failure)\n\nReturn the structured verdict. NEVER soften the floor — even one structural failure forces pass=false.`,
    { agentType: 'independent-reviewer', schema: FLOOR_VERDICT_SCHEMA, phase: 'verdict', label: `floor-check:${args?.runID}` }
);

return verdict;

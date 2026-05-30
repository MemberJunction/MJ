// LOCKED PRIMITIVE — amendment-review
//
// Guarantee: dynamic mutations to the workflow script (sub-agents authoring
// their own sub-workflows on-the-spot) route through AST-diff classification.
// Gate-weakening changes are REJECTED automatically; gate-strengthening or
// scope-neutral changes auto-approve; equivalent substitutions need a verdict.
// See Gap 9 of the agentic plan for the full classification table.
//
// Inputs:
//   {
//     currentPlanPath: string,
//     proposedPlanPath: string,
//     spec_digest: object,                  // injected from planner spec-digest.json
//   }
//
// Output:
//   {
//     verdict: 'approved' | 'rejected' | 'review-required',
//     gateAffectingChanges: Array<{
//       element: string,
//       classification: 'gate-weakening' | 'gate-strengthening' | 'equivalent' | 'cosmetic',
//       beforeAfter: { before: string, after: string },
//     }>,
//     rejectionReasons?: string[],
//   }

export const meta = {
    name: 'amendment-review',
    description: 'AST-diff workflow scripts; classify each changed element; gate-weakening auto-reject, gate-strengthening auto-approve, equivalent substitution → review.',
    phases: [{ title: 'classify-diff', detail: 'AST diff + classification per Gap 9 table' }],
};

const REVIEW_SCHEMA = {
    type: 'object',
    required: ['verdict', 'gateAffectingChanges'],
    properties: {
        verdict: { enum: ['approved', 'rejected', 'review-required'] },
        gateAffectingChanges: {
            type: 'array',
            items: {
                type: 'object',
                required: ['element', 'classification'],
                properties: {
                    element: { type: 'string' },
                    classification: { enum: ['gate-weakening', 'gate-strengthening', 'equivalent', 'cosmetic'] },
                    beforeAfter: {
                        type: 'object',
                        properties: {
                            before: { type: 'string' },
                            after: { type: 'string' },
                        },
                    },
                },
            },
        },
        rejectionReasons: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
};

phase('classify-diff');

const result = await agent(
    `AST-diff workflow scripts.\n\nCURRENT: ${args?.currentPlanPath ?? '(?)'}\nPROPOSED: ${args?.proposedPlanPath ?? '(?)'}\n\nClassify each changed element per Gap 9:\n  REJECT (gate-weakening): adversarial-verify N reduced; loop-until-dry K reduced; locked primitive removed; manifest weakened (e2eTier downgraded, extractEveryIO false, verifyEveryClaim false, sourceDiffMustClose false); bijection slot coverage reduced.\n  APPROVE (gate-strengthening or scope-neutral): N/K increased; additional primitive included; manifest strengthened; new slots added; comment/doc changes.\n  REVIEW (equivalent substitution): primitive replaced with another covering the same guarantee; reviewer model swap; source order swap.\n\nReturn the structured verdict. If ANY change is gate-weakening, verdict must be 'rejected'.`,
    // independent-reviewer is the right subagent — it specializes in gate-rule
    // enforcement on a different model from the planner.
    { agentType: 'independent-reviewer', schema: REVIEW_SCHEMA, phase: 'classify-diff', label: 'amendment-review' }
);

return result;

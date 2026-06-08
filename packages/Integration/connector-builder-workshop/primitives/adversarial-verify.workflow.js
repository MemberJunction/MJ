// LOCKED PRIMITIVE — adversarial-verify
//
// Guarantee: N independent skeptics, blind to each other, prompted to REFUTE
// (default-reject). Majority survives. Filters single-producer laziness. Caller
// supplies N; planner manifest declares minimum N per vendor difficulty (Gap 4):
//   easy=3, medium=4, hard=5.
//
// Inputs:
//   { claim: { slot, value, evidence }, N: number, model?: string }
//
// Output:
//   { survives: boolean, refutations: Array<{reviewer: string, refuted: boolean, reason: string}> }

export const meta = {
    name: 'adversarial-verify',
    description: 'N independent skeptics on a different model attempt to REFUTE the claim. Default reject. Majority survives.',
    phases: [{ title: 'refute', detail: 'Parallel skeptics' }],
};

const REFUTATION_SCHEMA = {
    type: 'object',
    required: ['refuted', 'reason'],
    properties: {
        refuted: { type: 'boolean' },
        reason: { type: 'string' },
    },
    additionalProperties: false,
};

phase('refute');

const N = Math.max(1, Number(args?.N ?? 3));
const claim = args?.claim ?? {};
const reviewers = Array.from({ length: N }, (_, i) => i + 1);

// Each refuter runs as an independent-reviewer subagent.  The workflow runtime
// rotates the model per reviewer (different blind spots = different findings)
// when the caller has supplied multiple model identifiers.
const refutations = (await parallel(
    reviewers.map(i => () =>
        agent(
            `You are reviewer ${i} of ${N}, blind to the others.\n\nClaim: slot=${claim.slot} value=${JSON.stringify(claim.value)}\nEvidence supplied: ${JSON.stringify(claim.evidence ?? {})}\n\nTry to REFUTE. Default reject. Run the FULL checklist: provenance not reproducing, value contradicted by another source in the evidence, claimed source not authoritative, value implausible for the slot's type, AND missing/incorrect constraints (required, nullability, length/precision, enum, PK, FK target). Apply extra scrutiny via your lens (reviewer 1: provenance & reproduction; 2: cross-source contradiction & type/enum; 3+: completeness of constraints & keys) IN ADDITION to — never instead of — the full checklist. Return { refuted: boolean, reason: string }. If you cannot find a specific refutation after honest effort, return refuted=false with reason='no-refutation-found-after-checklist'.`,
            { agentType: 'independent-reviewer', schema: REFUTATION_SCHEMA, phase: 'refute', label: `refute:${claim.slot}:${i}` }
        ).catch(() => null)
    )
)).filter(Boolean).map((r, i) => ({ reviewer: `r${i + 1}`, refuted: r.refuted, reason: r.reason }));

const refutedCount = refutations.filter(r => r.refuted).length;
const survives = refutedCount < Math.ceil(N / 2);

return {
    survives,
    refutations,
};

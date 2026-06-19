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
const QUORUM = Math.ceil(N / 2);   // a majority of the panel must actually respond to bless a claim

const reviewerPrompt = (i) =>
    `You are reviewer ${i} of ${N}, blind to the others.\n\nClaim: slot=${claim.slot} value=${JSON.stringify(claim.value)}\nEvidence supplied: ${JSON.stringify(claim.evidence ?? {})}\n\nTry to REFUTE. Default reject. Run the FULL checklist: provenance not reproducing, value contradicted by another source in the evidence, claimed source not authoritative, value implausible for the slot's type, AND missing/incorrect constraints (required, nullability, length/precision, enum, PK, FK target). Apply extra scrutiny via your lens (reviewer 1: provenance & reproduction; 2: cross-source contradiction & type/enum; 3+: completeness of constraints & keys) IN ADDITION to — never instead of — the full checklist. Return { refuted: boolean, reason: string }. If you cannot find a specific refutation after honest effort, return refuted=false with reason='no-refutation-found-after-checklist'.`;

// Each refuter runs as an independent-reviewer subagent. The runtime rotates the model per reviewer
// (different blind spots) when the caller supplied multiple model identifiers. A reviewer that ERRORS
// returns {i, r:null} (NOT silently dropped — #H13: dropping it shrank the panel and lowered the bar,
// so 2-of-3 reviewers erroring let a claim survive on one non-refuting vote).
const runReviewer = (i) =>
    agent(reviewerPrompt(i), { agentType: 'independent-reviewer', schema: REFUTATION_SCHEMA, phase: 'refute', label: `refute:${claim.slot}:${i}` })
        .then(r => ({ i, r }))
        .catch(() => ({ i, r: null }));

let results = await parallel(Array.from({ length: N }, (_, k) => () => runReviewer(k + 1)));
// Retry errored reviewers ONCE — a transient infra blip must not silently shrink the skeptic panel.
const erroredIdx = results.filter(x => x && x.r === null).map(x => x.i);
if (erroredIdx.length > 0) {
    const retried = await parallel(erroredIdx.map(i => () => runReviewer(i)));
    const byIdx = new Map(retried.map(x => [x.i, x]));
    results = results.map(x => (x && x.r === null && byIdx.has(x.i)) ? byIdx.get(x.i) : x);
}

const refutations = results.filter(x => x && x.r).map(x => ({ reviewer: `r${x.i}`, refuted: !!x.r.refuted, reason: x.r.reason }));
const refutedCount = refutations.filter(r => r.refuted).length;
const respondedCount = refutations.length;
const erroredCount = N - respondedCount;

// Survival = default-reject + fail-CLOSED on an incomplete panel (#H13): a claim survives ONLY when
// (a) a QUORUM of skeptics actually ran (an errored panel cannot bless a claim — it gets re-examined),
// AND (b) fewer than half of the FULL N refuted. The refutation bar stays relative to N (not to the
// shrunken responded set), so missing reviewers can never lower it.
const quorumMet = respondedCount >= QUORUM;
const survives = quorumMet && refutedCount < Math.ceil(N / 2);

return {
    survives,
    quorumMet,
    respondedCount,
    erroredCount,
    refutedCount,
    panelComplete: respondedCount === N,
    refutations,
};

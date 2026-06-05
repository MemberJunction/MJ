// LOCKED PRIMITIVE — amendment-review
//
// Guarantee: dynamic mutations to the workflow script (sub-agents authoring
// their own sub-workflows on-the-spot) route through AST-diff classification.
// Gate-weakening changes are REJECTED automatically; gate-strengthening or
// scope-neutral changes auto-approve; equivalent substitutions need a verdict.
// See Gap 9 of the agentic plan for the full classification table.
//
// MECHANICAL GATE (2026-06-05): the FINAL verdict is computed in JS, NOT trusted
// from the agent's prose. The agent classifies each changed element AND extracts
// objective facts from BOTH plan files — the adversarial N, the loop-until-dry K,
// and the set of locked-primitive scriptPaths. JS then:
//   - rejects if ANY change is classified 'gate-weakening' (regardless of what
//     verdict field the agent returned), and
//   - independently rejects if proposed N < current N, proposed K < current K, or
//     any primitive scriptPath present in current is absent from proposed.
// The agent's own `verdict` is advisory only; JS overrides it.
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
    description: 'AST-diff workflow scripts; classify each changed element + extract N/K/primitive-set from both plans; JS computes verdict (gate-weakening change OR reduced N/K OR removed primitive => rejected). Agent verdict is advisory only.',
    phases: [{ title: 'classify-diff', detail: 'Agent: AST diff + classification + objective N/K/primitive extraction; JS: final verdict' }],
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

// The agent's ROLE: classify changes AND report OBJECTIVE FACTS from each plan
// file (the numeric gate parameters + the primitive scriptPath set). JS judges.
const DIFF_FACTS_SCHEMA = {
    type: 'object',
    required: ['gateAffectingChanges', 'currentFacts', 'proposedFacts'],
    properties: {
        agentVerdict: { enum: ['approved', 'rejected', 'review-required'] },
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
        // Objective, file-derived facts — NOT a judgment. -1 means "not declared".
        currentFacts: {
            type: 'object',
            required: ['adversarialN', 'loopUntilDryK', 'primitiveScriptPaths'],
            properties: {
                adversarialN: { type: 'integer' },
                loopUntilDryK: { type: 'integer' },
                primitiveScriptPaths: { type: 'array', items: { type: 'string' } },
            },
        },
        proposedFacts: {
            type: 'object',
            required: ['adversarialN', 'loopUntilDryK', 'primitiveScriptPaths'],
            properties: {
                adversarialN: { type: 'integer' },
                loopUntilDryK: { type: 'integer' },
                primitiveScriptPaths: { type: 'array', items: { type: 'string' } },
            },
        },
        notes: { type: 'string' },
    },
    additionalProperties: false,
};

phase('classify-diff');
log(`amendment-review: current=${args?.currentPlanPath ?? '(?)'} proposed=${args?.proposedPlanPath ?? '(?)'}`);

const facts = await agent(
    `AST-diff two workflow plan scripts and extract OBJECTIVE facts. You CLASSIFY changes and REPORT numbers; you do NOT make the final call (code does).\n\nCURRENT: ${args?.currentPlanPath ?? '(?)'}\nPROPOSED: ${args?.proposedPlanPath ?? '(?)'}\n\nPART A — classify each changed element per Gap 9:\n  gate-weakening: adversarial-verify N reduced; loop-until-dry K reduced; locked primitive removed; manifest weakened (e2eTier downgraded, extractEveryIO false, verifyEveryClaim false, sourceDiffMustClose false); bijection slot coverage reduced.\n  gate-strengthening / scope-neutral: N/K increased; additional primitive included; manifest strengthened; new slots added; comment/doc changes.\n  equivalent: primitive replaced with another covering the same guarantee; reviewer model swap; source order swap.\n  cosmetic: formatting/comments only.\n\nPART B — extract these OBJECTIVE facts from EACH plan file (read the actual file bytes; do not infer):\n  - adversarialN: the integer N passed to adversarial-verify (the highest/canonical configured N). Use -1 if not declared.\n  - loopUntilDryK: the integer K for loop-until-dry's consecutive-empty-rounds exit. Use -1 if not declared.\n  - primitiveScriptPaths: the SET of locked-primitive scriptPaths the plan composes with (e.g. every primitives/*.workflow.js referenced by workflow({scriptPath:...})). List each path once.\n\nReturn { agentVerdict (your advisory call), gateAffectingChanges[], currentFacts:{adversarialN, loopUntilDryK, primitiveScriptPaths[]}, proposedFacts:{adversarialN, loopUntilDryK, primitiveScriptPaths[]} }. Report facts honestly even if they contradict your advisory verdict.`,
    { agentType: 'independent-reviewer', schema: DIFF_FACTS_SCHEMA, phase: 'classify-diff', label: 'amendment-review' }
);

// ── JS DECIDES. The agent's agentVerdict is advisory; we recompute. ──
const changes = Array.isArray(facts?.gateAffectingChanges) ? facts.gateAffectingChanges : [];
const cur = facts?.currentFacts ?? { adversarialN: -1, loopUntilDryK: -1, primitiveScriptPaths: [] };
const prop = facts?.proposedFacts ?? { adversarialN: -1, loopUntilDryK: -1, primitiveScriptPaths: [] };

const rejectionReasons = [];

// (1) Any change classified gate-weakening => rejected. Do NOT trust agentVerdict.
const weakening = changes.filter(c => c && c.classification === 'gate-weakening');
for (const c of weakening) {
    rejectionReasons.push(`gate-weakening change: ${c.element}`);
}

// (2) Independent numeric gate: reduced N or K => rejected (only when both sides declared it).
const curN = Number.isInteger(cur.adversarialN) ? cur.adversarialN : -1;
const propN = Number.isInteger(prop.adversarialN) ? prop.adversarialN : -1;
if (curN >= 0 && propN >= 0 && propN < curN) {
    rejectionReasons.push(`adversarial N reduced: ${curN} -> ${propN}`);
}
const curK = Number.isInteger(cur.loopUntilDryK) ? cur.loopUntilDryK : -1;
const propK = Number.isInteger(prop.loopUntilDryK) ? prop.loopUntilDryK : -1;
if (curK >= 0 && propK >= 0 && propK < curK) {
    rejectionReasons.push(`loop-until-dry K reduced: ${curK} -> ${propK}`);
}

// (3) Independent primitive-set gate: any primitive present in current but absent
//     from proposed => a locked primitive was removed => rejected.
const propSet = new Set((Array.isArray(prop.primitiveScriptPaths) ? prop.primitiveScriptPaths : []).map(String));
const removedPrimitives = (Array.isArray(cur.primitiveScriptPaths) ? cur.primitiveScriptPaths : [])
    .map(String)
    .filter(p => !propSet.has(p));
for (const p of removedPrimitives) {
    rejectionReasons.push(`locked primitive removed: ${p}`);
}

let verdict;
if (rejectionReasons.length > 0) {
    verdict = 'rejected';
} else if (changes.some(c => c && c.classification === 'equivalent')) {
    // Equivalent substitution with no weakening => needs a human/secondary verdict.
    verdict = 'review-required';
} else {
    verdict = 'approved';
}

log(`amendment-review: verdict=${verdict} (JS-decided; agent advised '${facts?.agentVerdict ?? 'n/a'}'); reasons=${rejectionReasons.length}`);

return {
    verdict,
    gateAffectingChanges: changes,
    ...(rejectionReasons.length > 0 ? { rejectionReasons } : {}),
};

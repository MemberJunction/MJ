// LOCKED PRIMITIVE — floor-check
//
// Guarantee: the FINAL structural gate. Iterates the bijection slot table
// (`floor/phase0-slots.json`) and verifies that for every slot:
//   1. An emission exists (the run journal records an agent producer for it).
//   2. The emission has provenance (verify-claim ran and succeeded).
//   3. The value is non-null OR the slot is nullable.
// Also verifies the minimum-thoroughness manifest's structural declarations met.
//
// ALSO (live-e2e phase enforcement): iterates the ORDERED `e2eLivePhases` table
// from the same slots file and verifies the T10/T11 ladder evidence
// (journal.ladder.*.livePhaseLog) ran EVERY applicable §1→§7 phase, IN the
// declared order, with per-test NL+JSON+pass/fail evidence (§6), with any
// skipped phase/cell carrying a logged reason, and with §7 dual-dialect covered
// on BOTH SQL Server and Postgres. Missing / reordered / unevidenced / silently-
// skipped phases each force pass=false — mirroring how slot gaps do.
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
                            // Live-e2e ordered-phase enforcement (§1→§7 of the canonical test plan)
                            'e2e-phase-missing',          // an applicable e2eLivePhases entry absent from the T10/T11 livePhaseLog
                            'e2e-subphase-missing',       // a Phase B sub-phase (3.1–3.8) applicable but absent
                            'e2e-phase-out-of-order',     // phases ran in an order other than the declared `order`
                            'e2e-phase-evidence-missing', // phase ran but lacks NL + JSON + explicit pass/fail (§6)
                            'e2e-skip-without-reason',    // phase/cell skipped with no logged skipReason (silent omission)
                            'e2e-dual-dialect-missing',   // a dualDialect phase not proven on BOTH SQL Server and Postgres (§7)
                            'min-adversarial-reviewers-met',
                            'test-data-not-wiped',
                            // Gap 10 revised — multi-source PK/FK enforcement
                            'pk-defer-rate-too-high',          // >50% IOs have IsPrimaryKey=undefined
                            'extraction-matrix-missing',        // EXTRACTION_REPORT_MATRIX.csv absent
                            'extraction-matrix-row-missing',    // matrix has fewer rows than emitted IOs
                            'naming-convention-not-applied',    // PK convention found but not applied across vendor
                            'cross-io-fk-missed',               // field name == sibling PK but IsForeignKey=false
                            'fk-target-unresolvable',           // RelatedIntegrationObjectID @lookup doesn't match emitted IO
                            'source-check-incomplete',          // matrix shows source not checked when source exists
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
    `You are the FINAL GATE for connector run ${args?.runID ?? '(?)'} (vendor=${args?.vendor ?? '(?)'}).\n\nLoad the bijection slot table from ${args?.slotsPath ?? 'workshop/floor/phase0-slots.json'}. For EVERY slot:\n  1. Find the emission in the run journal.  Missing → failures.push({rule:'slot-not-filled', slot, ...}).\n  2. Confirm the emission has provenance via verify-claim.  Missing → failures.push({rule:'slot-not-verified', slot, ...}).\n  3. Confirm value !== null unless slot.nullable === true.  Null on non-nullable → failures.push({rule:'unprovable-required', slot, ...}).\n\nAdditionally verify minimum-thoroughness manifest declarations (${JSON.stringify(args?.manifest ?? {})}):\n  - extractEveryIO=true → every discovered IO went through extract-iiof-pipeline\n  - verifyEveryClaim=true → every claim has a verify-claim event\n  - sourceDiffMustClose=true → compute-source-diff returned empty missing[]\n  - e2eTier matched against verification-ladder.achievedTier\n  - adversarialVerifyMinReviewers met in every adversarial-verify event\n  - test-data directory wiped at PR-open time (presence = failure)\n\n--- LIVE-E2E ORDERED-PHASE ENFORCEMENT (§1→§7 of the canonical 'Integration Major Enhancement — Test Plan') ---\nLoad the ORDERED \`e2eLivePhases\` array from the SAME slots file (${args?.slotsPath ?? 'workshop/floor/phase0-slots.json'}). This is the FIXED §1→§7 phase skeleton (env bring-up → Phase A → Phase B 2^N matrix [sub-phases 3.1→3.8] → Phase C value-handling → §5 generation-action/agents → §6 observability → §7 dual-dialect). The HubSpot framework at packages/Integration/connectors/test/ is the reference implementation.\nRead the ladder's live-e2e evidence from the run journal: \`journal.ladder.tierResults\` for tiers T10 and T11, specifically each tier's \`livePhaseLog\` (array of { phaseId, order, nl, json, status:'pass'|'fail'|'skip', skipReason? }). Treat the union of T10's and T11's livePhaseLog entries as the executed-phase record.\nFor EVERY entry in \`e2eLivePhases\` (and, for E2E.PhaseB, every entry in its \`subPhases\`):\n  1. APPLICABILITY: a phase/sub-phase is APPLICABLE unless the connector's discovered capabilities exclude it (e.g. a pull-only connector's push/bidirectional cells under 3.2; a no-watermark connector's watermark cell under 3.1, for which content-hash/keyset is substituted). Determine applicability from the frozen contract's capability flags (SupportsWrite / SupportsIncrementalSync / generation-action availability), NOT from the agent's say-so.\n  2. PRESENCE: every APPLICABLE phase/sub-phase MUST appear in the livePhaseLog. Absent → failures.push({rule:'e2e-phase-missing'|'e2e-subphase-missing', slot:<phaseId>, detail}).\n  3. ORDER: the executed phases MUST appear in non-decreasing declared \`order\` (env(0) → PhaseA(1) → PhaseB(2) [3.1→3.8] → PhaseC(3) → GenAction(4) → Observability(5) → DualDialect(6)). Any inversion → 'e2e-phase-out-of-order'.\n  4. EVIDENCE (§6): every NON-skipped phase/cell MUST carry a non-empty \`nl\` (natural-language statement of what was tested + result), a \`json\` payload (scrubbed IntegrationGetRun / DB counts / progress.jsonl), AND an explicit \`status\` of 'pass' or 'fail'. Missing any of the three → 'e2e-phase-evidence-missing'. A phase reporting only \`Status='Success'\` with no outcome JSON is evidence-missing (the silent-fail rule).\n  5. NO SILENT OMISSION: a phase/sub-phase/cell that is APPLICABLE but skipped MUST carry a non-empty \`skipReason\`. status==='skip' with empty/absent skipReason → 'e2e-skip-without-reason'. (A correctly-justified skip — e.g. push cells on a pull-only connector — is ALLOWED and is NOT a failure.)\n  6. DUAL-DIALECT (§7): for every \`e2eLivePhases\` entry with \`dualDialect:true\`, the applicable phase MUST be proven on BOTH 'sqlserver' AND 'postgres' (each livePhaseLog entry, or the run artifacts it cites, identifies its dialect; both dialects must appear as DISTINCT artifacts). A dualDialect phase proven on only one dialect → 'e2e-dual-dialect-missing'.\nNEVER pass a run whose live-e2e skipped, reordered, or left unevidenced any APPLICABLE §1→§7 phase — these are structural failures exactly like a missing slot.\n\n--- GAP 10 MULTI-SOURCE PK/FK ENFORCEMENT (revised 2026-05-30) ---\nLoad EXTRACTION_REPORT_MATRIX.csv from the run's output dir.\n  - Matrix missing → fail with rule 'extraction-matrix-missing'.\n  - Matrix has fewer rows than emitted IOs → 'extraction-matrix-row-missing'.\n  - For every row: if existing connector .ts exists for this vendor but matrix shows 'ExistingConnectorTs: no' → 'source-check-incomplete'. Same for OpenAPI when sourceID is an OpenAPI URL.\n  - Tally PKVerdict column across all rows. If 'defer' > 50% of emitted IOs → 'pk-defer-rate-too-high' (producer was lazy across the multi-source sweep).\n  - For every emitted IO: scan its IOFs. If a field named '<ObjName>Id' or 'Id' exists with IsPrimaryKey=false AND no Tier-1 evidence in CODE_EVIDENCE contradicts → 'naming-convention-not-applied'.\n  - For every emitted IOF whose name matches another emitted IO's PK name AND IsForeignKey=false → 'cross-io-fk-missed'.\n  - For every IOF with IsForeignKey=true and a RelatedIntegrationObjectID @lookup target: confirm an IO emitted in this run has that exact Name. Unresolvable → 'fk-target-unresolvable'.\n\nReturn the structured verdict. NEVER soften the floor — even one structural failure forces pass=false.`,
    { agentType: 'independent-reviewer', schema: FLOOR_VERDICT_SCHEMA, phase: 'verdict', label: `floor-check:${args?.runID}` }
);

return verdict;

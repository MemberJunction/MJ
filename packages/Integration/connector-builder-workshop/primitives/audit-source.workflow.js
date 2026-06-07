// LOCKED PRIMITIVE — audit-source
//
// Guarantee: source rankings are produced through a structured rubric, not
// self-scored. Parallel inspectors look at the same source from different angles
// and the result conforms to a fixed schema.
//
// Inputs (via `args`):
//   { url?: string, attachmentPath?: string }   // exactly one required
//
// Output:
//   { sourceID, tier, category, freshness, coverage, authority, formatQuality,
//     evidence: { fingerprint: string } }

export const meta = {
    name: 'audit-source',
    description: 'Parallel sweep over a source URL or attachment returning structured tier/category/freshness/coverage/authority/formatQuality scores.',
    phases: [
        { title: 'parallel-audit', detail: 'Five blind inspectors on different facets' },
        { title: 'synthesize', detail: 'Aggregate to structured score; no facet self-overrules another' },
    ],
};

const FACET_SCHEMA = {
    type: 'object',
    required: ['score', 'evidence'],
    properties: {
        score: { type: 'number', minimum: 0, maximum: 1 },
        evidence: { type: 'string' },
    },
    additionalProperties: false,
};

const SOURCE_AUDIT_SCHEMA = {
    type: 'object',
    required: ['sourceID', 'tier', 'category', 'freshness', 'coverage', 'authority', 'formatQuality'],
    properties: {
        sourceID: { type: 'string' },
        tier: { enum: ['tier-1', 'tier-2', 'tier-3', 'tier-4'] },
        category: { enum: ['openapi', 'partner-pdf', 'public-html', 'sdk', 'community', 'other'] },
        freshness: { type: 'number', minimum: 0, maximum: 1 },
        coverage: { type: 'number', minimum: 0, maximum: 1 },
        authority: { type: 'number', minimum: 0, maximum: 1 },
        formatQuality: { type: 'number', minimum: 0, maximum: 1 },
        evidence: {
            type: 'object',
            properties: { fingerprint: { type: 'string' } },
        },
    },
    additionalProperties: false,
};

phase('parallel-audit');
const sourceID = args?.url ?? args?.attachmentPath ?? '(missing)';
log(`audit-source invoked for ${sourceID}`);
// COST FIX (2026-06-06) — independence PRESERVED, not collapsed. We KEEP the 4 blind parallel
// facet-inspectors (their independence is the rigor: no single impression anchors the score —
// collapsing to one call risks exactly that), but run them + the synthesize on HAIKU. Facet
// scoring + tier-mapping is bounded, low-stakes source-RANKING (NOT the extraction), which haiku
// does well — so the cheap tier cuts cost WITHOUT sacrificing inspector independence. Each
// inspector reads the source ONCE to scratch + greps it (never re-reads across turns).
const facets = await parallel([
    () => agent(`Inspect freshness of ${sourceID} — last-updated metadata, version markers, deprecation notices. Read it ONCE to a scratch file + grep. Return score 0..1 plus evidence.`, { agentType: 'source-auditor', model: 'haiku', schema: FACET_SCHEMA, phase: 'parallel-audit', label: 'audit:freshness' }),
    () => agent(`Inspect coverage of ${sourceID} — proportion of plausibly-extractable objects/fields visible from this single source. Read it ONCE to a scratch file + grep. Return score 0..1 plus evidence.`, { agentType: 'source-auditor', model: 'haiku', schema: FACET_SCHEMA, phase: 'parallel-audit', label: 'audit:coverage' }),
    () => agent(`Inspect authority of ${sourceID} — vendor-published vs. third-party, official docs vs. community wiki. Return score 0..1 plus evidence.`, { agentType: 'source-auditor', model: 'haiku', schema: FACET_SCHEMA, phase: 'parallel-audit', label: 'audit:authority' }),
    () => agent(`Inspect format quality of ${sourceID} — machine-parseable (OpenAPI / JSON) > structured HTML > prose. Return score 0..1 plus evidence.`, { agentType: 'source-auditor', model: 'haiku', schema: FACET_SCHEMA, phase: 'parallel-audit', label: 'audit:format' }),
]);

phase('synthesize');
const verdict = await agent(
    `Synthesize the four facets [freshness, coverage, authority, formatQuality] into a structured source audit for ${sourceID}.\n\nFACETS: ${JSON.stringify(facets)}\n\nTier mapping: t1=openapi+vendor-published+fresh, t2=structured-public-html+fresh, t3=partner-pdf+older, t4=community/third-party. Return the structured audit. NEVER self-elevate tier without facet support.`,
    {
        agentType: 'source-auditor',
        model: 'haiku',
        schema: SOURCE_AUDIT_SCHEMA,
        phase: 'synthesize',
        label: `audit:synth:${sourceID}`,
    }
);

return verdict;

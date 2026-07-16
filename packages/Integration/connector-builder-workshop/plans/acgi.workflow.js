// ACGI — per-vendor connector build workflow (PRIVATE client connector, Blue Cypress).
//
// Emitted by ConnectorCreator (planner) for runID connector-acgi-1783465637518-88a6982e.
// Vendor: ACGI Association Anywhere + Certelligence — Oracle mod_plsql XML web services.
//
// ┌─ WHY THIS PLAN LOOKS DIFFERENT FROM A FRESH BUILD ───────────────────────────────┐
// │ Discovery is ALREADY DONE and live-verified. The authoritative inputs are:        │
// │   • sources/DESIGN.md            — transport, auth, ~20-object relational model,   │
// │                                    queue-drain CDC, purge/watermark, error codes.  │
// │   • sources/postman/*.json       — exact request shapes for AA + Certelligence.    │
// │   • sources/docs/*.pdf (+ XSD)   — Integrator Guide + Get Customer Details XSD     │
// │                                    (text at /private/tmp/.../scratchpad/acgi-doctext).│
// │   • metadata/integrations/acgi/.acgi.integration.json — first-pass catalog         │
// │                                    (21 objects / 220 fields) already emitted.      │
// │ So the producer stages VERIFY + REFINE this catalog against those sources — they   │
// │ do NOT re-discover from scratch, and they do NOT re-browse the public web.         │
// └────────────────────────────────────────────────────────────────────────────────┘
//
// TRANSPORT (confirmed live): POST multipart/form-data, one field p_input_xml_doc = XML request doc.
//   Base URL per product+DAD in CompanyIntegration.Configuration (NEVER in code):
//   AA=…/bluecypress/, Cert=…/blucypress/. Procedure appended (CENSSAWEBSVCLIB.GET_CUST_INFO_XML,
//   CENCUSTINTEGRATESYNCWEBSVCLIB.{GET_QUEUE_CUSTS_XML,GET_QUEUE_CUSTS_W_REASONS_XML,PURGE_QUEUE_XML}).
//   Response is text/xml. Extends BaseRESTIntegrationConnector, rides REST over HTTP for the XML feed.
// AUTH (confirmed live): inline credentials in the XML body, element names VARY per procedure
//   (integratorUsername/Password for GET_CUST_INFO; vendorId/vendorPassword | vendor-id/vendor-password
//   for queue/purge). No token step. 4 secrets total (AA + Cert), all runtime from Configuration.
// SYNC: queue-drain CDC, watermark = maxQueueNum. PULL-ONLY (SupportsWrite=false). Tombstone =
//   trigger tableName=CEN_CUST_MAST action=DELETE. Two products = two CompanyIntegration connections
//   sharing ONE Integration; records namespaced by product.
//
// PRIVACY (CONFIDENTIAL.md — BINDING):
//   • NO public Open App. The connector stays PRIVATE — do NOT publish to MemberJunction/Integrations.
//     OpenAppPublish is DISABLED by default; it runs ONLY if a PRIVATE repo path is passed explicitly.
//   • Live testing is strictly READ-ONLY: GET_QUEUE + GET_CUST_INFO only, NEVER PURGE_QUEUE/FORCE_ENQUEUE
//     against the real client system. The purge/watermark-advance loop is proven in MOCK only.
//   • Credentials via the separate-user broker (acgi-observe / acgi-observe-auth, writes:false). The
//     agent never reads credential bytes; live config/URLs live in the broker + credential store.
//
// ORDERING (per operator directive): cheapest-defect-first — EnvPreflight, then the offline behavioral
// tiers (T0..T8 ladder + MOCK hybrid full matrix incl. the purge/watermark loop) BEFORE the LIVE
// read-only round-trip, so a defect never costs a live vendor call.

export const meta = {
    name: 'acgi-build',
    description: 'PRIVATE build for ACGI (AA + Certelligence). Oracle mod_plsql XML web services, pull-only queue-drain CDC. Discovery pre-done + live-verified; producers VERIFY/REFINE the existing 21-object catalog. Read-only live via broker; NO public Open App.',
    phases: [
        { title: 'EnvPreflight', detail: 'S0: DB reachable @ expected migration, MJAPI bootable, generated tree clean, NO stale nested @memberjunction/integration-* dists (GZ #31), turbo dist freshness. Abort cheap.' },
        { title: 'BrandResearch', detail: 'CONFIRM canonical identity + AMS category from the LOCAL confidential sources (DESIGN.md); no public web browse for this private client.' },
        { title: 'Identity', detail: 'Confirm Integration identity slots (Name=ACGI, ClassName=ACGIConnector) already present in the catalog; resolve CredentialTypeID (match-or-create for the 4-secret AA+Cert shape).' },
        { title: 'SourceAudit', detail: 'Rank the confidential sources (XSD Tier-1, Postman Tier-2, PDFs Tier-1). Emit TaxonomyLeaves = the ~21 catalog objects.' },
        { title: 'MetadataWrite', detail: 'Confirm/refine the Integration row + Configuration JSON (products map, transport, readOnly, bulkMaxCustomers) against DESIGN.md.' },
        { title: 'IOIOFExtract', detail: 'VERIFY + REFINE the existing 21-object/220-field catalog against XSD + Postman + PDFs. PK=custId, child FKs→Customer, pull-only, watermark=maxQueueNum. adversarialN=2.' },
        { title: 'SourceDiff', detail: 'Completeness: every catalog object present. sourceDiffMustClose.' },
        { title: 'IndependentReview', detail: 'ONE round, SLIM (counts + sample). Bijection / capability-honesty (pull-only, no write columns) / FK-graph (custId) / naming. LINT.' },
        { title: 'RealityProbe', detail: 'S7 EMPIRICAL, READ-ONLY via broker acgi-observe(-auth): verdicts on declared claims — procedure paths reachable, GET_QUEUE returns maxQueueNum (watermark), custId populated (PK), pull-only write-surface. NEVER PURGE. Verdicts in, authorship out.' },
        { title: 'ProbeAmend', detail: 'ONE round from probe verdicts (corrections from docs, re-probe read-only). Reality outranks the frozen contract.' },
        { title: 'FreezeContract', detail: 'Recording artifact (hash for resume/provenance).' },
        { title: 'CodeBuild', detail: 'ACGIConnector class + vitest with scrubbed XML fixtures. XML-over-multipart transport, per-procedure auth element templating, queue-drain FetchChanges + in-run parent-cache fan-out. index.ts register. Loop ≤2.' },
        { title: 'VerificationLadder', detail: 'T0..T8 (all offline). Mocked XML fixtures (T4/T5), failure-mode injection (T8). Proves the purge/watermark 2-fetch loop, tombstone, per-proc auth, error-code mapping offline.' },
        { title: 'HybridE2E-Mock', detail: 'FULL §1→§7 matrix through MJAPI → real SQL Server (fresh DB), MOCK vendor: all 21 objects land, incremental + purge/watermark-advance loop, DAG fan-out (children non-empty), idempotency. Cheapest-defect-first behavioral proof.' },
        { title: 'HybridE2E-Live', detail: 'READ-ONLY live round-trip via broker (GET_QUEUE + GET_CUST_INFO into fresh SS). Purge/2nd-fetch cells SKIP-with-reason (never purge live). Confirms real-vendor XML shape + PK/watermark presence.' },
        { title: 'FloorCheck', detail: 'Bijection + manifest + EMPIRICAL gates (reality-probe, e2e-mock-dodge honored by the live read-only pass, capability-honesty pull-only, env-preflight). Verdict states EMPIRICAL/LINT split + production-readiness classification.' },
        // NO OpenAppPublish to the public repo (CONFIDENTIAL rule #1). Private publish only if an explicit private repo path is provided.
    ],
};

// Args may arrive as a JSON string — normalize first.
const A = (typeof args === 'string') ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args ?? {});
const VENDOR = A?.vendor ?? 'acgi';
const VENDOR_SLUG = String(VENDOR).toLowerCase();
const CLASS_NAME = 'ACGIConnector';
const INTEGRATION_NAME = 'ACGI';
const REGISTRY_DIR = `packages/Integration/connectors-registry/${VENDOR_SLUG}`;
const METADATA_FILE = `metadata/integrations/${VENDOR_SLUG}/.${VENDOR_SLUG}.integration.json`;
const RUNS_DIR = `${REGISTRY_DIR}/runs/${A?.runID ?? 'unknown'}`;
const DESIGN = `${REGISTRY_DIR}/sources/DESIGN.md`;
const DOCTEXT_DIR = '/private/tmp/claude-501/-Users-bcladmin-Projects-MemberJunction-MJ/8611bafe-adb0-4690-807a-45c95c2f9c11/scratchpad/acgi-doctext';

// READ-ONLY broker plans (writes:false) — the ACGI-aware live probes. Their presence triggers LIVE e2e.
const BROKER_PLANS = Array.isArray(A?.brokerPlans) && A.brokerPlans.length > 0 ? A.brokerPlans : ['acgi-observe', 'acgi-observe-auth'];
// PRIVATE deliverable: public Open App publish is DISABLED. A private Open App is assembled ONLY when an
// explicit private repo path is supplied (never MemberJunction/Integrations). CONFIDENTIAL.md rule #1.
const PRIVATE_REPO = A?.privateIntegrationsRepo ?? null;
const PUBLISH_PRIVATE = !!PRIVATE_REPO;

async function withRetry(thunk, label, tries = 3) {
    let lastErr;
    for (let i = 1; i <= tries; i++) {
        try { return await thunk(); }
        catch (e) {
            lastErr = e;
            const msg = String(e?.message ?? e);
            const transient = /ECONN|ETIMEDOUT|socket hang up|network|fetch failed|429|502|503|504|overloaded|rate.?limit/i.test(msg);
            if (!transient || i === tries) throw e;
            log(`withRetry[${label}] transport blip (attempt ${i}/${tries}): ${msg.slice(0, 160)} — backing off`);
            await Promise.resolve();
        }
    }
    throw lastErr;
}

const MANIFEST = {
    extractEveryIO: true,
    verifyEveryClaim: true,
    sourceDiffMustClose: true,
    e2eTier: A?.maxTier ?? 'T8',        // per vendor_request; live ceiling = read-only round-trip via broker
    adversarialVerifyMinReviewers: 2,   // Tier-1 XSD + Tier-2 Postman, read-only (lower write risk), but PK/FK-heavy across 21 objects + credentialed probe → N=2 (not 1: not a single OpenAPI + hard-constraint-heavy; not 3: read-only + XSD-backed + live-probe-confirmed)
};

// ── EnvPreflight (S0) ────────────────────────────────────────────────
phase('EnvPreflight');
const ENV_PREFLIGHT_SCHEMA = {
    type: 'object', required: ['ok'],
    properties: {
        ok: { type: 'boolean' }, dbReachable: { type: 'boolean' }, migrationLevel: { type: 'string' },
        mjapiBootable: { type: 'boolean' }, generatedTreeClean: { type: 'boolean' },
        staleNestedDists: { type: 'array' }, turboDistFresh: { type: 'boolean' },
        resolved: { type: 'boolean' }, notes: { type: 'array' },
    },
};
const envPreflight = await agent(
    `EnvPreflight (S0) for the ${INTEGRATION_NAME} build — DETERMINISTIC FINDER (you RUN the script; you never eyeball-check).\n` +
    `1. Run: node packages/Integration/connector-builder-workshop/scripts/env-preflight.mjs --repo . --out ${RUNS_DIR}/preflight\n` +
    `   It scans stale nested @memberjunction/integration-* dists (GZ #31 silent-kill class), generated-tree churn (#11/#19/#33), turbo dist staleness (#13), and probes MJAPI. Return its JSON verbatim.\n` +
    `2. DB reachable + highest applied migration version (per the runbook's sqlcmd probe on the isolated ACGI SS instance); fill dbReachable/migrationLevel.\n` +
    `3. If staleNestedDists: SYNC each from its workspace dist (rm -rf nested/dist && cp -R workspace/dist), RE-RUN, set resolved=true ONLY when clean.\n` +
    `Abort-cheap: if ok=false and unresolved, the workflow stops here — 12 stages must never burn on a broken env.`,
    { schema: ENV_PREFLIGHT_SCHEMA, phase: 'EnvPreflight', label: 'env:preflight' }
);
log(`EnvPreflight: ok=${envPreflight.ok} staleNestedDists=${(envPreflight.staleNestedDists ?? []).length} generatedClean=${envPreflight.generatedTreeClean}`);
if (!envPreflight.ok) return { runID: A?.runID, vendor: VENDOR, status: 'EnvPreflightFailed', envPreflight };

// ── BrandResearch (CONFIRM from local confidential sources — no public browse) ──
phase('BrandResearch');
const BRAND_SCHEMA = {
    type: 'object', required: ['CanonicalName'],
    properties: {
        CanonicalName: { type: 'string' }, Description: { type: 'string' },
        NavigationBaseURL: { type: ['string', 'null'] }, IconClass: { type: ['string', 'null'] },
        Category: { type: ['string', 'null'] }, WriteCapability: { type: ['string', 'null'] },
        Sources: { type: 'array', items: { type: 'string' } }, ProductTaxonomy: { type: 'object' },
    },
};
const brand = await agent(
    `CONFIRM (do NOT re-discover, do NOT browse the public web — this is a PRIVATE client connector, sources are confidential/gitignored) the ACGI connector identity from ${DESIGN} and ${METADATA_FILE}. Return: CanonicalName='ACGI', a one-line Description, NavigationBaseURL (marketing site, NOT the per-tenant API base), Category='AMS' (association management system — the Open App folder). ` +
    `WriteCapability MUST be 'read-only' / pull-only — ACGI's integration API is a customer change-queue SYNC (GET_QUEUE + GET_CUST_INFO + PURGE); there is NO documented create/update of customer records for us. ProductTaxonomy = the two products (Association Anywhere, Certelligence) sharing one Integration. This finding is BINDING for the capability-honesty floor gate.`,
    { agentType: 'vendor-brand-researcher', schema: BRAND_SCHEMA, phase: 'BrandResearch', label: 'brand:acgi' }
);

// ── Identity ─────────────────────────────────────────────────────────
phase('Identity');
const PHASE1_SCHEMA = {
    type: 'object', required: ['Status', 'Identity', 'ExistsInDB', 'Provenance'],
    properties: { Status: { enum: ['Complete', 'Conflict', 'NeedsHumanDisambiguation'] }, Identity: { type: 'object' }, ExistsInDB: { type: 'object' }, Provenance: { type: 'array' } },
};
const identity = await agent(
    `Fill/confirm the Integration identity slots for ACGI. The catalog at ${METADATA_FILE} already declares Name='${INTEGRATION_NAME}', ClassName='${CLASS_NAME}', ImportPath='@memberjunction/integration-connectors' — confirm these and DO NOT rename. ` +
    `Resolve CredentialTypeID via match-or-create against the 4-secret shape this connector needs (AA integrator username/password + Certelligence integrator username/password — a per-product credential set; the ConnectionConfig key shape is documented in ${DESIGN} §Auth). Credentials themselves are broker-held; you author only the credential-TYPE row + its ID. Return Status='Complete' when the identity slots resolve without conflict.`,
    { agentType: 'identity-establisher', schema: PHASE1_SCHEMA, phase: 'Identity', label: 'identity:acgi' }
);
if (identity.Status !== 'Complete') throw new Error(`Identity stage produced ${identity.Status}; escalation hatch fired`);

// ── SourceAudit ──────────────────────────────────────────────────────
phase('SourceAudit');
const SOURCES_SCHEMA = {
    type: 'object', required: ['SourcesFile', 'SourceStudyFile', 'TaxonomyLeaves'],
    properties: {
        SourcesFile: { type: 'string' }, SourceStudyFile: { type: 'string' },
        TaxonomyLeaves: { type: 'array', items: { type: 'string' } }, Gaps: { type: 'array' },
        VendorDocsPaths: { type: 'array' }, PostmanPaths: { type: 'array' },
    },
};
const sources = await agent(
    `Audit + rank the CONFIDENTIAL local sources for ACGI (do NOT fetch anything from the public web). Rank: the Get Customer Details XSD (Tier-1, machine-readable field schema) and the Integrator Guide + web-service PDFs (Tier-1 prose) highest; the two Postman collections (${REGISTRY_DIR}/sources/postman/*.json — Tier-2, exact request shapes for AA + Certelligence) next. Extracted PDF text is at ${DOCTEXT_DIR}. ` +
    `Build SOURCE_STUDY.md. Emit TaxonomyLeaves = the ~21 objects already in the catalog (${METADATA_FILE}): Customer + its child tables (CustomerRole, Address, Phone, Email, Website, CommunicationPreference, Membership, Subscription, Job, CommitteePosition, CustomerAttribute, CustomerDimAttr, Alias, Certification, Employee, CompanyAdmin, File, ReferralInfo, Bio, DirectoryOptOut). Set VendorDocsPaths + PostmanPaths so the extractor consults them.`,
    { agentType: 'source-auditor', schema: SOURCES_SCHEMA, phase: 'SourceAudit', label: 'audit:acgi' }
);
await workflow({ scriptPath: 'packages/Integration/connector-builder-workshop/primitives/audit-source.workflow.js' }, { url: sources.SourcesFile }).catch(() => null);

// ── MetadataWrite (confirm/refine Integration row + Configuration JSON) ──
phase('MetadataWrite');
const METADATA_RESULT_SCHEMA = {
    type: 'object', required: ['FieldsPopulated'],
    properties: { FieldsPopulated: { type: 'integer' }, FieldsDeferredAsGaps: { type: 'integer' }, ProvenanceEntries: { type: 'integer' }, ConfigurationJSONKeysUsed: { type: 'array', items: { type: 'string' } } },
};
const metadataResult = await agent(
    `Confirm/refine the Integration ROOT row + Configuration JSON at ${METADATA_FILE} against ${DESIGN}. The Configuration MUST carry (client-specific values stay OUT of code): the products map {AA,Certelligence} → {baseURL, usernameKey, passwordKey}, transport='multipart/form-data; field=p_input_xml_doc', readOnly=true, bulkMaxCustomers=200, includeCodeValues=true. BatchMaxRequestCount=200 (GET_CUST_INFO bulkRequest cap, from ${DESIGN}). ` +
    `Do NOT bake base URLs or credentials into metadata — they are per-deployment (CompanyIntegration.Configuration + credential store). Change only root-row slots; do not perturb IO/IOF rows.`,
    { agentType: 'metadata-writer', schema: METADATA_RESULT_SCHEMA, phase: 'MetadataWrite', label: 'metadata:acgi' }
);

// ── Extract → Freeze → Review amendment loop (LOW cap — this is a REFINE of a live-verified catalog) ──
const REVIEW_SCHEMA = {
    type: 'object', required: ['ConfirmedGapsBlocking'],
    properties: {
        ConfirmedGapsBlocking: { type: 'integer' }, ConfirmedGapsAdvisory: { type: 'integer' },
        JudgmentCalls: { type: 'integer' }, ReviewerErrors: { type: 'integer' },
        BijectionViolationsFound: { type: 'integer' }, IndependentSourcesFetched: { type: 'integer' },
        ModelObserved: { type: 'string' }, ReviewFile: { type: 'string' },
        FixInstructions: { type: 'array', items: { type: 'object' } },
    },
};
// LOW caps: the catalog is already extracted AND live-verified, so few amendments are expected.
// 2 (not 1): 1 never re-dispatches the extractor with FixInstructions (round 0 review → straight to
// escalate), so the loop could never amend. 2 gives exactly ONE real amendment round — enough for
// mechanical fixes (FK target naming, a missed child field) on an already-good catalog. Deadlock
// fingerprint still short-circuits earlier.
const MAX_AMENDMENT_ROUNDS = 3;   // +1: the single blocking gap (CredentialTypeID provenance) was closed manually; one more round lets the re-review confirm and proceed to CodeBuild
let extractStats, frozen, review;
let amendmentRound = 0;
let previousReviewFingerprint = null;
let deferredConnectorFindings = [];

while (amendmentRound < MAX_AMENDMENT_ROUNDS) {
    const isAmendment = amendmentRound > 0;
    const phaseLabel = isAmendment ? `AmendmentRound${amendmentRound}` : 'IOIOFExtract';

    const allFindings = isAmendment ? (review.FixInstructions ?? []) : [];
    const slotOf = (f) => String(f?.slot ?? '').toLowerCase();
    const isIntegrationRowSlot = (f) => slotOf(f).startsWith('integration.');
    const isConnectorSlot = (f) => slotOf(f).startsWith('connector.');
    const integrationRowFindings = allFindings.filter(isIntegrationRowSlot);
    const connectorFindings = allFindings.filter(isConnectorSlot);
    const ioIofFindings = allFindings.filter((f) => !isIntegrationRowSlot(f) && !isConnectorSlot(f));
    if (connectorFindings.length > 0) {
        for (const cf of connectorFindings) if (!deferredConnectorFindings.some((d) => (d?.slot ?? '') === (cf?.slot ?? ''))) deferredConnectorFindings.push(cf);
        log(`Deferred ${connectorFindings.length} connector.* (code) fix(es) to CodeBuild (round ${amendmentRound}).`);
    }
    if (integrationRowFindings.length > 0) {
        phase(phaseLabel);
        await agent(
            `Apply these Integration-ROW FixInstructions surgically to ${METADATA_FILE} (root-level slots only — auth/base/config/batch/watermark). Change ONLY the named slots. Fixes: ${JSON.stringify(integrationRowFindings)}. Return { applied }.`,
            { agentType: 'metadata-writer', schema: { type: 'object', required: ['applied'], properties: { applied: { type: 'integer' } }, additionalProperties: true }, phase: phaseLabel, label: `amend-integration-row:r${amendmentRound}` }
        ).catch(() => null);
    }

    phase(phaseLabel);
    extractStats = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        {
            vendor: VENDOR,
            sourceID: sources.SourcesFile,
            objectList: sources.TaxonomyLeaves,
            writeBackPath: METADATA_FILE,
            outputDir: `${RUNS_DIR}/output`,
            runID: A?.runID,
            adversarialN: MANIFEST.adversarialVerifyMinReviewers,
            // REFINE mode: the existing catalog IS an input to verify against, alongside the XSD/Postman/PDFs.
            // The XSD gives Tier-1 field TYPES for the Customer detail tree; Postman gives exact request shapes.
            refineExistingMetadata: true,
            sourceBundle: {
                existingMetadataPaths: [METADATA_FILE],
                designPath: DESIGN,
                xsdPath: `${REGISTRY_DIR}/sources/docs`,      // Get Customer Details XSD (Tier-1 field schema)
                vendorDocsPaths: [DOCTEXT_DIR, ...(sources.VendorDocsPaths ?? [])],
                postmanPaths: [`${REGISTRY_DIR}/sources/postman`, ...(sources.PostmanPaths ?? [])],
                // NO existingConnectorTsPath — the connector .ts does not exist yet (mode=new) and would be OUTPUT anyway.
            },
            // Emission discipline for ACGI: PK = custId on Customer (explicit in docs → emit).
            // Every child table carries a custId FK → Customer, sparse BACKWARD-ref graph (children point at
            // the single earlier-committed Customer) → KEEP the @lookup soft-FK form
            // (@lookup:MJ: Integration Objects.Name=Customer&IntegrationID=@parent:IntegrationID).
            // Pull-only: SupportsWrite=false on EVERY IO, NO Create/Update/Delete columns.
            // Watermark: SupportsIncrementalSync=true + IncrementalWatermarkField=maxQueueNum on Customer ONLY;
            //   children SupportsIncrementalSync=false (refreshed via parent cache when their customer re-queues).
            // Types: default nvarchar (generous); *Serno + periodSerno = int; *Date fields = date.
            emissionHints: {
                universalPK: { fieldName: 'custId' },
                pullOnly: true,
                watermarkField: 'maxQueueNum',
                childFKField: 'custId',
                childFKTarget: 'Customer',
                fkForm: 'lookup-soft-fk',
                // MODELING DECISION (resolves the round-2/round-3 Gap 5 escalation): the three SECOND-level
                // attribute BAGS are key-value triples, NOT entities — keep them as JSON fields on their
                // immediate parent, do NOT promote them to their own IOs (a promoted table linked only by
                // custId is relationally ambiguous — which job/membership/employee?). All FIRST-level
                // collections stay as their own tables.
                nestedCollectionsAsJson: ['employmentAttributes', 'slotSummaries', 'employeeAttributes'],
                doNotPromoteToIO: ['JobAttribute', 'MembershipSlotSummary', 'EmployeeAttribute'],
            },
            amendmentRound,
            reviewerFindings: isAmendment ? ioIofFindings : null,
            reviewFile: isAmendment ? review.ReviewFile : null,
        }
    );
    log(`Extract round ${amendmentRound}: ${extractStats.objectsExtracted} objects, ${extractStats.fieldsExtracted} fields, ${(extractStats.gapsRemaining ?? []).length} gaps`);

    phase('FreezeContract');
    frozen = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/freeze-contract.workflow.js' },
        { vendor: VENDOR, contract: extractStats, provenanceSidecar: {}, outputDir: `${RUNS_DIR}/output`, adversarialN: MANIFEST.adversarialVerifyMinReviewers, amendmentRound }
    );

    phase('IndependentReview');
    review = await agent(
        `Adversarial review of the ACGI emission (amendment round ${amendmentRound}). SLIM MODE — do NOT read the full XSD/Postman into context. RUN a small count-reconcile node script over ${METADATA_FILE} + the catalog's expected 21 objects and read its compact stdout (object/field/zero-field counts). Then spot-check ~15 emitted fields for: (a) bijection vs the XSD/Postman shapes; (b) capability-honesty — EVERY IO is pull-only (SupportsWrite=false, NO Create/Update/Delete columns) since ACGI has no documented customer write API; (c) FK-graph — every child IO has a custId FK → Customer via the @lookup soft-FK using IntegrationID=@parent:IntegrationID (NOT @parent:ID); (d) PK — custId is PK on Customer. Any zero-field object, a write column on any IO, an @parent:ID FK qualifier, or a bijection violation is a Confirmed Gap (Blocking) with an exact FixInstruction {slot,before,after,locus}.`,
        { agentType: 'independent-reviewer', model: 'sonnet', schema: REVIEW_SCHEMA, phase: 'IndependentReview', label: `review:r${amendmentRound}` }
    );
    log(`Review round ${amendmentRound}: ${review.ConfirmedGapsBlocking} blocking, ${review.BijectionViolationsFound ?? 0} bijection violations`);

    if (review.ConfirmedGapsBlocking === 0) { log(`Amendment loop converged at round ${amendmentRound}`); break; }

    const blockingFixes = review.FixInstructions ?? [];
    if (blockingFixes.length > 0 && blockingFixes.every(isConnectorSlot)) {
        log(`All ${review.ConfirmedGapsBlocking} blocking gap(s) are connector.* → deferring to CodeBuild, exiting extract loop`);
        break;
    }
    const reviewFingerprint = JSON.stringify({ blocking: review.ConfirmedGapsBlocking, violations: review.BijectionViolationsFound ?? 0, fixes: (review.FixInstructions ?? []).map(f => f?.slot ?? '').sort() });
    if (previousReviewFingerprint === reviewFingerprint) {
        log(`Amendment loop deadlock at round ${amendmentRound} → escalate`);
        return { runID: A?.runID, vendor: VENDOR, brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound, status: 'EscalatedDeadlock', message: `Producer + reviewer deadlocked; ${review.ConfirmedGapsBlocking} blocking gaps unresolved.` };
    }
    previousReviewFingerprint = reviewFingerprint;
    amendmentRound++;
}
if (review.ConfirmedGapsBlocking > 0 && amendmentRound >= MAX_AMENDMENT_ROUNDS) {
    log(`Amendment loop exhausted ${MAX_AMENDMENT_ROUNDS} rounds with ${review.ConfirmedGapsBlocking} unresolved`);
    return { runID: A?.runID, vendor: VENDOR, brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound, status: 'EscalatedMaxRounds', message: `Hit ${MAX_AMENDMENT_ROUNDS}-round cap with ${review.ConfirmedGapsBlocking} blocking gaps. Evidence: ${review.ReviewFile}.` };
}

// ── SourceDiff (completeness) ────────────────────────────────────────
phase('SourceDiff');
let sourceDiff = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
    { universe: sources.TaxonomyLeaves ?? [], extracted: extractStats.extractedObjects ?? [] }
);
log(`SourceDiff: ${sourceDiff.missing.length} missing, ${sourceDiff.orphan.length} orphan`);
if (sourceDiff.missing.length > 0) {
    phase('GapFill');
    await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/gap-fill-fork.workflow.js' },
        { vendor: VENDOR, gaps: sourceDiff.missing, sourceBundle: { designPath: DESIGN, existingMetadataPaths: [METADATA_FILE] }, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output` }
    );
    const recovered = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/extract-iiof-pipeline.workflow.js' },
        { vendor: VENDOR, sourceID: sources.SourcesFile, objectList: sourceDiff.missing, writeBackPath: METADATA_FILE, outputDir: `${RUNS_DIR}/output`, runID: A?.runID, adversarialN: MANIFEST.adversarialVerifyMinReviewers, refineExistingMetadata: true }
    );
    extractStats.extractedObjects = [...(extractStats.extractedObjects ?? []), ...(recovered.extractedObjects ?? [])];
    sourceDiff = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/compute-source-diff.workflow.js' },
        { universe: sources.TaxonomyLeaves ?? [], extracted: extractStats.extractedObjects ?? [] }
    );
    log(`SourceDiff after gap-fill: ${sourceDiff.missing.length} missing`);
}

// ── RealityProbe (S7 — EMPIRICAL, READ-ONLY via broker; NEVER PURGE) ──
// ACGI's multipart-XML transport is idiosyncratic, so the generic reality-probe.mjs status-probe is
// insufficient — the ACGI-aware truth comes from the READ-ONLY broker plans (acgi-observe /
// acgi-observe-auth, writes:false). Verdicts on the DECLARED claims: (1) each procedure path reachable
// (auth-gated/reachable, not 404); (2) GET_QUEUE(_W_REASONS) returns <maxQueueNum> → the declared
// watermark exists; (3) GET_CUST_INFO returns <custId> populated over the probe page → the declared PK
// is real & non-null; (4) write-surface = pull-only (no write procedure is invoked — confirms
// SupportsWrite=false). VERDICTS IN, AUTHORSHIP OUT — the probe may NOT add objects/fields/paths.
phase('RealityProbe');
const PROBE_SCHEMA = {
    type: 'object', required: ['ran', 'mode', 'verdicts', 'metadataSha256'],
    properties: {
        ran: { type: 'boolean' }, mode: { type: 'string' }, verdicts: { type: 'array' },
        metadataSha256: { type: 'string' }, claims: { type: 'integer' }, confirmed: { type: 'integer' },
        gatedExists: { type: 'integer' }, achievedCeiling: { type: 'string' },
        metadataDelta: { type: 'boolean' }, rateHeaders: { type: 'object' },
    },
};
const realityProbe = await agent(
    `RealityProbe (S7) for ACGI — READ-ONLY EMPIRICAL verdicts on the DECLARED metadata claims. Live access is via the READ-ONLY broker plans ${JSON.stringify(BROKER_PLANS)} (writes:false). ` +
    `NEVER invoke PURGE_QUEUE or FORCE_ENQUEUE — those mutate the client's live change-queue (CONFIDENTIAL rule #5). ` +
    `Run the broker observe plan(s) through the credential broker (token bytes NEVER enter your context — the broker dereferences them). From the observed responses, emit verdicts (confirmed | gated-exists | wrong | unverified) on: ` +
    `(a) each declared procedure path reachable (CENSSAWEBSVCLIB.GET_CUST_INFO_XML, CENCUSTINTEGRATESYNCWEBSVCLIB.GET_QUEUE_CUSTS(_W_REASONS)_XML) — reachable/auth-gated not 404; ` +
    `(b) watermark: GET_QUEUE response carries <maxQueueNum> (confirms IncrementalWatermarkField=maxQueueNum); ` +
    `(c) PK: GET_CUST_INFO response carries a populated <custId> for the queued customers (confirms Customer PK non-null); ` +
    `(d) write-surface: pull-only — no write procedure exists/was used (confirms SupportsWrite=false). ` +
    `Compute metadataSha256 of ${METADATA_FILE}. metadataDelta MUST be false. Write scrubbed captured XML pages to ${RUNS_DIR}/output as canonical fixtures (PROVENANCE: live-capture, PII scrubbed). If the broker is unavailable, DEGRADE: unauthenticated reachability of the base host/DAD → ceiling 'format-verified-no-creds' with every un-probed claim named. Return the verdict fields verbatim.`,
    { schema: PROBE_SCHEMA, phase: 'RealityProbe', label: 'probe:verdicts' }
);
const probeWrong = (realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified'));
log(`RealityProbe (${realityProbe.mode}): ${(realityProbe.verdicts ?? []).length} verdicts, ${probeWrong.length} falsified, ceiling=${realityProbe.achievedCeiling ?? '?'}`);

// ── ProbeAmend (ONE round; reality outranks the contract) ──
if (probeWrong.length > 0) {
    phase('ProbeAmend');
    const amendOut = await agent(
        `ProbeAmend for ACGI: ${probeWrong.length} declared claim(s) were FALSIFIED by the READ-ONLY RealityProbe:\n${JSON.stringify(probeWrong).slice(0, 4000)}\n` +
        `Correct each in ${METADATA_FILE} — corrections sourced from the DOCS (${DESIGN} / the XSD / Postman), NOT invented. Then RE-PROBE just the corrected claims READ-ONLY via the broker (NEVER purge) and mark each verdict resolved=true. An uncorrectable claim stays falsified and escalates.`,
        { agentType: 'ioiof-extractor', schema: PROBE_SCHEMA, phase: 'ProbeAmend', label: 'probe:amend' }
    );
    realityProbe.verdicts = (amendOut?.verdicts && amendOut.verdicts.length > 0) ? amendOut.verdicts : realityProbe.verdicts;
    log(`ProbeAmend: ${(realityProbe.verdicts ?? []).filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true).length} still unresolved`);
}

// ── CodeBuild + VerificationLadder loop (LOW cap ≤2) ─────────────────
const CODE_RESULT_SCHEMA = {
    type: 'object', required: ['BuildClean'],
    properties: {
        BuildClean: { type: 'boolean' }, LinesOfCode: { type: 'integer' }, TestsWritten: { type: 'integer' },
        GenericCRUDUsedForIOCount: { type: 'integer' }, OverriddenCRUDForIOCount: { type: 'integer' },
        ConnectorFile: { type: 'string' }, TestFile: { type: 'string' },
        BuildErrors: { type: 'array' }, RemainingGaps: { type: 'array' },
    },
};
const MAX_CODE_BUILD_ROUNDS = 2;   // one build + one fix round
let codeResult, ladder;
let codeRound = 0;
let previousCodeFingerprint = null;

while (codeRound < MAX_CODE_BUILD_ROUNDS) {
    const isAmendment = codeRound > 0;
    phase(isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild');
    codeResult = await withRetry(() => agent(
        isAmendment
            ? `Re-build the ACGIConnector. Prior round failed: ${JSON.stringify(codeResult?.BuildErrors ?? ladder?.classifiedFailures ?? [])}. Apply the specific fixes.`
            : `Build the ACGIConnector class at packages/Integration/connectors/src/${CLASS_NAME}.ts from the frozen contract at ${frozen.contractPath} and the design at ${DESIGN}. Key requirements:\n` +
              `• extends BaseRESTIntegrationConnector; @RegisterClass(BaseIntegrationConnector, '${CLASS_NAME}'); IntegrationName getter returns '${INTEGRATION_NAME}'.\n` +
              `• Transport: override MakeHTTPRequest to POST multipart/form-data with ONE field p_input_xml_doc = the built XML request doc; procedure appended to the per-product base URL from CompanyIntegration.Configuration (GetBaseURL reads Configuration.products[<product>].baseURL — NEVER a baked constant).\n` +
              `• Auth: inline in the XML body with per-PROCEDURE element names (integratorUsername/Password for GET_CUST_INFO; vendorId/vendorPassword for GET_QUEUE_W_REASONS; vendor-id/vendor-password for GET_QUEUE plain). Credentials from Configuration keys; NO token step; NEVER inline crypto.\n` +
              `• NormalizeResponse: parse text/xml; check <status>SUCCESS|FAILURE</status> and throw on FAILURE with <message>; map error codes 100(bad creds→connection error)/60(IP not whitelisted→actionable)/200(invalid custId→skip record)/999(unexpected→retry).\n` +
              `• FetchChanges(ObjectName='Customer'): if watermark present AND NOT read-only mode → PURGE_QUEUE(maxQueueNum) first (confirms prior batch landed); then GET_QUEUE_CUSTS_W_REASONS → parse <queuedCusts> (customer id + triggers + maxQueueNum + status); batch GET_CUST_INFO (bulkRequest=true, ≤200 custIds, includeCodeValues=true) for queued IDs; build an instance-level in-run cache {custId→parsed tree} keyed by CompanyIntegrationID; emit Customer records (IsDeleted=true where a trigger tableName=CEN_CUST_MAST action=DELETE); return NewWatermarkValue=maxQueueNum, HasMore=false. Empty queue → Warnings:[{Code:'EMPTY_QUEUE'}].\n` +
              `• FetchChanges(child object): read the in-run parent cache and emit child records with the custId FK; empty cache → Warnings:[{Code:'NO_PARENT_CACHE'}].\n` +
              `• READ-ONLY: readOnly=true (Configuration) OR the never-2nd-fetch path means PURGE/ENQUEUE are NEVER called. SupportsWrite=false — NO Create/Update/Delete methods (do NOT emit 501 stubs).\n` +
              `• Full-record pass-through: ExternalRecord.Fields = the full parsed source tree (customs preserved); only nested child collections excluded via a spread-delete.\n` +
              `• PostProcessRecord: coerce empty *Date strings → null; leave sernos/periodSerno as int.\n` +
              `• Product namespacing: ExternalID = <product>:<custId> so AA custId ≠ Cert custId.\n` +
              `• Sample-union enrichment: wire mergeDeclaredWithSampledFields at IntrospectSchema (NOT DiscoverFields) so per-tenant custom columns reach the schema.\n` +
              `Write vitest __tests__/${CLASS_NAME}.test.ts with SCRUBBED XML fixtures covering: TestConnection (auth ok/100-bad-creds/60-IP), GET_QUEUE parse (maxQueueNum + triggers), GET_CUST_INFO parse (bulk, custId PK, child fan-out), tombstone (CEN_CUST_MAST DELETE), the 2-fetch purge/watermark-advance loop, empty-queue + NO_PARENT_CACHE warnings, per-procedure auth element templating, error-code mapping.${deferredConnectorFindings.length ? ` Also address deferred connector.* fixes: ${JSON.stringify(deferredConnectorFindings)}.` : ''}`,
        { agentType: 'code-builder', schema: CODE_RESULT_SCHEMA, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `code:r${codeRound}` }
    ), `code:r${codeRound}`);
    log(`CodeBuild round ${codeRound}: ${codeResult.LinesOfCode ?? 0} LOC, BuildClean=${codeResult.BuildClean}`);

    const CONNECTOR_FILE = codeResult.ConnectorFile ?? `packages/Integration/connectors/src/${CLASS_NAME}.ts`;
    if (codeResult.BuildClean) {
        const fileCheck = await agent(
            `Run exactly: test -f ${CONNECTOR_FILE} && echo CONNECTOR_FILE_EXISTS || echo CONNECTOR_FILE_MISSING. Return whether the file exists.`,
            { agentType: 'code-builder', schema: { type: 'object', required: ['Exists'], properties: { Exists: { type: 'boolean' }, Path: { type: 'string' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `verify-file:r${codeRound}` }
        );
        if (!fileCheck.Exists) {
            log(`CodeBuild round ${codeRound}: BuildClean reported but file missing → forcing non-clean`);
            codeResult.BuildClean = false;
            codeResult.BuildErrors = [...(codeResult.BuildErrors ?? []), { code: 'CONNECTOR_FILE_MISSING', locus: CONNECTOR_FILE }];
        }
    }
    if (!codeResult.BuildClean) { codeRound++; continue; }

    await agent(
        `Ensure ${CLASS_NAME} is registered. Read packages/Integration/connectors/src/index.ts; if it lacks an export for ${CLASS_NAME}, append:\n  export { ${CLASS_NAME} } from './${CLASS_NAME}.js';\nOtherwise no change. Touch no other line.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Registered'], properties: { Registered: { type: 'boolean' }, AlreadyPresent: { type: 'boolean' } } }, phase: isAmendment ? `CodeBuildRound${codeRound}` : 'CodeBuild', label: `register:r${codeRound}` }
    );

    await agent(
        `Stage build artifacts into the registry dir so mj-test-runner finds them. Run from repo root and verify each symlink:\n` +
        `  mkdir -p ${REGISTRY_DIR}/src ${REGISTRY_DIR}/output\n` +
        `  ln -sf "$(pwd)/${METADATA_FILE}" ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json\n` +
        `  ln -sf "$(pwd)/packages/Integration/connectors/src/${CLASS_NAME}.ts" ${REGISTRY_DIR}/src/${CLASS_NAME}.ts\n` +
        `  ln -sf "$(pwd)/${RUNS_DIR}/output/EXTRACTION_REPORT_MATRIX.csv" ${REGISTRY_DIR}/output/EXTRACTION_REPORT_MATRIX.csv\n` +
        `Then: test -f ${REGISTRY_DIR}/.${VENDOR_SLUG}.integration.json && test -f ${REGISTRY_DIR}/src/${CLASS_NAME}.ts && echo STAGED_OK. Return Staged=true iff STAGED_OK printed.`,
        { agentType: 'code-builder', schema: { type: 'object', required: ['Staged'], properties: { Staged: { type: 'boolean' } } }, phase: isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder', label: `stage-artifacts:r${codeRound}` }
    );

    phase(isAmendment ? `VerificationLadderRound${codeRound}` : 'VerificationLadder');
    ladder = await workflow(
        { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/verification-ladder.workflow.js' },
        { vendor: VENDOR, connectorName: VENDOR_SLUG, manifest: MANIFEST, credentialReference: A?.credentialReference ?? null, maxTier: MANIFEST.e2eTier }
    );
    const hasRed = (ladder?.tierResults ?? []).some(r => r?.status === 'red');
    if (!hasRed) { log(`Code+Ladder converged at round ${codeRound} (achieved ${ladder?.achievedTier ?? '?'})`); break; }

    const codeFingerprint = JSON.stringify({ clean: codeResult.BuildClean, ladderRed: (ladder?.classifiedFailures ?? []).map(f => `${f?.tier}:${f?.code}:${f?.locus}`).sort() });
    if (previousCodeFingerprint === codeFingerprint) {
        log(`Code+Ladder deadlock at round ${codeRound} → escalate`);
        return { runID: A?.runID, vendor: VENDOR, brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder, amendmentRound, codeRound, status: 'EscalatedCodeDeadlock', message: `Code+ladder deadlocked; same failures recur.` };
    }
    previousCodeFingerprint = codeFingerprint;
    codeRound++;
}
if ((!codeResult?.BuildClean || (ladder?.tierResults ?? []).some(r => r?.status === 'red')) && codeRound >= MAX_CODE_BUILD_ROUNDS) {
    log(`Code+Ladder loop exhausted ${MAX_CODE_BUILD_ROUNDS} rounds`);
    return { runID: A?.runID, vendor: VENDOR, brand, identity, sources, metadataResult, extractStats, frozen, review, codeResult, ladder, amendmentRound, codeRound, status: 'EscalatedCodeMaxRounds', message: `Code+Ladder hit ${MAX_CODE_BUILD_ROUNDS}-round cap; rungs still red.` };
}

// ── HybridE2E — MOCK first (full §1→§7 matrix, offline behavioral — cheapest-defect-first) ──
// Proves the REAL SQL Server sync (through MJAPI): all 21 objects land, the 2-fetch incremental +
// purge/watermark-advance loop, DAG fan-out (child tables non-empty when Customer has data), tombstone,
// idempotency (2nd sync zero-growth). The purge loop is PROVABLE ONLY here (live never purges).
phase('HybridE2E-Mock');
const hybridE2EMock = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    { runID: A?.runID, vendor: VENDOR, connectorName: VENDOR_SLUG, integrationName: INTEGRATION_NAME, mode: 'mock', credentialReference: null, brokerPlans: null }
);
log(`HybridE2E-Mock: pass=${hybridE2EMock?.pass}`);

// ── HybridE2E — LIVE read-only round-trip via broker (mandatory: broker creds exist) ──
// Read-only connector → live scope = the read round-trip (there are no write cells). This legitimately
// satisfies e2e-mock-dodge. The purge/2nd-fetch cells SKIP-with-reason (CONFIDENTIAL rule #5 — never
// purge the live client queue). Confirms real-vendor XML shape + PK/watermark presence into fresh SS.
phase('HybridE2E-Live');
const hybridE2ELive = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/hybrid-e2e.workflow.js' },
    {
        runID: A?.runID, vendor: VENDOR, connectorName: VENDOR_SLUG, integrationName: INTEGRATION_NAME,
        mode: 'live',
        credentialReference: A?.credentialReference ?? null,
        brokerPlans: BROKER_PLANS,                 // read-only (writes:false) — triggers live mode
        readOnly: true,                            // NEVER PURGE/ENQUEUE against the live client system
        liveSkipReasons: { purgeWatermarkLoop: 'live is READ-ONLY per CONFIDENTIAL.md #5 — purge/2nd-fetch loop proven in HybridE2E-Mock', writeCells: 'pull-only connector (SupportsWrite=false)' },
    }
);
log(`HybridE2E-Live: pass=${hybridE2ELive?.pass} (mode=${hybridE2ELive?.mode ?? '?'})`);
// The live pass is the primary hybridE2E handed to floor-check (satisfies e2e-mock-dodge when creds exist);
// the mock pass rides in the journal as the purge/watermark-loop + full-object-coverage evidence.
const hybridE2E = hybridE2ELive;

// ── FloorCheck (final gate) ──────────────────────────────────────────
phase('FloorCheck');
const verdict = await workflow(
    { scriptPath: 'packages/Integration/connector-builder-workshop/primitives/floor-check.workflow.js' },
    {
        runID: A?.runID, vendor: VENDOR,
        slotsPath: A?.slotsPath ?? 'packages/Integration/connector-builder-workshop/floor/phase0-slots.json',
        manifest: MANIFEST,
        hybridE2E,
        journal: {
            extractStats, sourceDiff, frozen, review, codeResult, ladder,
            hybridE2E, hybridE2EMock,                 // mock = purge/watermark-loop + full-object-coverage evidence
            sources,
            scopeDecision: extractStats.scopeDecision ?? sources.scopeDecision ?? null,
            envPreflight,
            realityProbe,
            credentialReference: A?.credentialReference ?? null,
            brokerPlans: BROKER_PLANS,                // broker read-only creds are creds too (e2e-mock-dodge #H7)
            brand,                                    // capability-honesty: brand.WriteCapability=read-only
            writeCapableIOCount: extractStats.writeCapableIOCount ?? 0,   // MUST be 0 (pull-only)
            outOfScopeFamilies: extractStats.outOfScopeFamilies ?? [],
            readOnlyConnector: true,
        },
    }
);
log(`FloorCheck: pass=${verdict?.pass} classification=${verdict?.productionReadiness ?? '?'}`);

// ── Private Open App (ONLY if an explicit private repo is provided; NEVER the public Integrations repo) ──
// CONFIDENTIAL.md #1: the connector stays private. Public OpenAppPublish is DISABLED. A standalone
// PRIVATE Open App is assembled only when a private repo path is passed via args.privateIntegrationsRepo.
let publish = null;
if (PUBLISH_PRIVATE && verdict?.pass) {
    phase('PrivateOpenAppPublish');
    const PUBLISH_SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, package: { type: 'string' }, appDir: { type: 'string' }, steps: { type: 'array' } } };
    publish = await agent(
        `Assemble the verified ACGI connector as a PRIVATE Open App into ${PRIVATE_REPO} (a PRIVATE repo — NEVER MemberJunction/Integrations). Run EXACTLY and return JSON stdout verbatim:\n` +
        `  node packages/Integration/connector-builder-workshop/scripts/publish-open-app.mjs --repo ${PRIVATE_REPO} --category ${brand?.Category ?? 'AMS'} --class-base ACGI --connector ${codeResult?.ConnectorFile ?? `packages/Integration/connectors/src/${CLASS_NAME}.ts`} --metadata ${METADATA_FILE} --display ${JSON.stringify(brand?.CanonicalName ?? INTEGRATION_NAME)} --private\n` +
        `ok=true means validate-invariants (four-way identity) passed. A failed 'seed' step (no reachable DB) is NON-blocking. Confirm confidential sources are NOT copied into the app.`,
        { schema: PUBLISH_SCHEMA, phase: 'PrivateOpenAppPublish', label: 'publish:private-open-app' }
    );
    log(`PrivateOpenAppPublish: ok=${publish.ok} package=${publish.package ?? '?'}`);
} else {
    log(`Open App publish SKIPPED — private client connector (CONFIDENTIAL #1). ${PUBLISH_PRIVATE ? 'floor-check did not pass.' : 'No private repo path provided; deliverable is assembled separately as a standalone private Open App.'}`);
}

return {
    runID: A?.runID, vendor: VENDOR,
    brand, identity, sources, metadataResult, extractStats, frozen, review, amendmentRound,
    codeResult, codeRound, ladder, hybridE2EMock, hybridE2E, verdict, publish,
    status: verdict?.pass ? 'Complete' : 'PartialPass',
};

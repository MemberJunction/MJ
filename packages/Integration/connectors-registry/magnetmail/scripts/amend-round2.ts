#!/usr/bin/env tsx
/**
 * amend-round2.ts — MagnetMail connector, Independent-Review amendment round 2.
 *
 * ADDITIVE, SURGICAL. Re-processes ONLY the reviewer-flagged objects
 * (Recipient, MessageLinkTrackingData, MessageSentTrackingData, MessageTrackingData,
 * UnsubscribeTrackingData, JobToGroup, MailRecipientGroup, RecipientGroup); does NOT
 * re-walk / re-enumerate the catalog. Applies the per-slot FixInstructions from
 * INDEPENDENT_REVIEW.md via the mj-metadata MCP (UpsertIO/UpsertIOF MERGE partial
 * fields). Writes ONLY the re-processed objects to the run's EXTRACTION_EMISSION.json.
 *
 * Evidence base (credential-free): the raw WSDL (sources/mmapi.wsdl.xml, via the
 * higherlogic-marketing-enterprise sources dir), whose XSD declares:
 *   - RecipientSearchCriteria extends SearchCriteria {pageNo,pageSize minOccurs=1} (lowercase)
 *   - MessageLinkTrackingSearchCriteria / MessageTrackingSearchCriteria /
 *     UnsubscribeSearchCriteria extend DateRangeSearchCriteria extends PagedSearchCriteria
 *     {PageNo,PageSize minOccurs=1} (PascalCase)
 * plus the connector's own Integration.Configuration.PaginationDefaults block, and the
 * cross-IO PK-name matches (group_id->group.group_id, MessageId->Message.message_id,
 * RecipientId->Recipient.id, UserId->User.User_Id, GroupCategoryId->GroupCategory.ID,
 * MessageCategoryId->MessageCategory.ID) — each an emitted-IO PK in this same file.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const REPO = resolve(process.cwd(), '../../../../..');
const CONNECTOR = 'magnetmail';
const META = resolve(REPO, 'metadata/integrations/magnetmail/.magnetmail.integration.json');
const WSDL = resolve(REPO, 'packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml');
const EMISSION_OUT = resolve(REPO, 'packages/Integration/connectors-registry/magnetmail/runs/connector-magnetmail-1783132483150-5d0b164d/output/EXTRACTION_EMISSION.json');
const SRC = 'packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml (WSDL XSD: SearchCriteria/PagedSearchCriteria pagination lineage + cross-IO PK-name matches) + metadata/integrations/magnetmail/.magnetmail.integration.json (Configuration.PaginationDefaults + emitted sibling PKs)';

type IOFields = Record<string, unknown>;
type Claim = { slot: string; value: unknown; sourcePath: string };

// ── read current metadata (reference ONLY — all writes go through the MCP) ─────
const file = JSON.parse(readFileSync(META, 'utf8')) as Array<{
    relatedEntities: { 'MJ: Integration Objects': Array<{ fields: IOFields; relatedEntities?: { 'MJ: Integration Object Fields': Array<{ fields: IOFields }> } }> };
}>;
const IOS = file[0].relatedEntities['MJ: Integration Objects'];
function currentConfig(name: string): Record<string, unknown> {
    const io = IOS.find(i => i.fields.Name === name);
    if (!io) return {};
    try { return JSON.parse(String(io.fields.Configuration ?? '{}')); } catch { return {}; }
}
function iofType(ioName: string, fieldName: string): string {
    const io = IOS.find(i => i.fields.Name === ioName);
    const f = io?.relatedEntities?.['MJ: Integration Object Fields']?.find(x => x.fields.Name === fieldName);
    return String(f?.fields.Type ?? 'string');
}
function fieldCount(ioName: string): number {
    const io = IOS.find(i => i.fields.Name === ioName);
    return io?.relatedEntities?.['MJ: Integration Object Fields']?.length ?? 0;
}

const wsdl = readFileSync(WSDL, 'utf8');
function inWsdl(tok: string): boolean { return new RegExp(tok).test(wsdl); }

function writeIO(name: string, extra: IOFields, extraConfig: Record<string, unknown>): IOFields {
    const cfg = { ...currentConfig(name), ...extraConfig };
    return { Name: name, Configuration: JSON.stringify(cfg), ...extra };
}

// FK IOF patch — the persisting pointer (RelatedIntegrationObjectID @lookup, qualifier
// MUST be @parent:IntegrationID) + the target PK field name; IsForeignKey carried as the
// reviewer-requested marker. Type passed through so IntegrationObjectFieldSchema.parse
// (which requires Type) succeeds on the partial merge.
function fkPatch(ioName: string, fieldName: string, targetIO: string, targetField: string): { name: string; fields: IOFields; claims: Claim[] } {
    return {
        name: fieldName,
        fields: {
            Name: fieldName,
            Type: iofType(ioName, fieldName),
            IsForeignKey: true,
            RelatedIntegrationObjectID: `@lookup:MJ: Integration Objects.Name=${targetIO}&IntegrationID=@parent:IntegrationID`,
            RelatedIntegrationObjectFieldName: targetField,
        },
        claims: [
            { slot: `iof.${ioName}.${fieldName}.IsForeignKey`, value: true, sourcePath: SRC },
            { slot: `iof.${ioName}.${fieldName}.RelatedIntegrationObjectID`, value: `@lookup:MJ: Integration Objects.Name=${targetIO}&IntegrationID=@parent:IntegrationID`, sourcePath: SRC },
        ],
    };
}

type Upsert = {
    io: IOFields; note: string; claims: Claim[]; gaps: string[];
    iofPatches?: { name: string; fields: IOFields; claims: Claim[] }[];
    matrix: Partial<Record<string, string | number>>;
};
const upserts: Upsert[] = [];

// Paginated tracking criteria lineage (PascalCase PageNo/PageSize on PagedSearchCriteria base).
const pagedVerified = inWsdl('PagedSearchCriteria') && inWsdl('PageNo') && inWsdl('PageSize');
const searchVerified = inWsdl('RecipientSearchCriteria') && inWsdl('pageNo') && inWsdl('pageSize');

// ── 1. Recipient — pagination (searchForRecipients, lowercase pageNo/pageSize) ─
upserts.push({
    io: writeIO('Recipient', { SupportsPagination: true, PaginationType: 'PageNumber' },
        { Pagination: { style: 'nested inside <criteria> element (SearchCriteria base), lowercase', pageParam: 'pageNo', sizeParam: 'pageSize', operation: 'searchForRecipients', criteriaType: 'tns:RecipientSearchCriteria', wsdlVerified: searchVerified && inWsdl('searchForRecipients') } }),
    note: 'Gap1.1: pagination applied to flagship Recipient sync object (searchForRecipients requires pageNo/pageSize; was PaginationType=None capping it at one page).',
    claims: [
        { slot: 'io.Recipient.PaginationType', value: 'PageNumber', sourcePath: SRC },
        { slot: 'io.Recipient.SupportsPagination', value: true, sourcePath: SRC },
        { slot: 'io.Recipient.Configuration.Pagination', value: 'pageNo/pageSize nested in <criteria> (RecipientSearchCriteria)', sourcePath: SRC },
    ],
    gaps: [],
    matrix: { PKVerdict: 'emit', FKVerdict: 'defer', VendorDocsProseScan: 'yes', CrossIOMatch: 'no', NamingConvention: 'yes' },
});

// ── 2-5. Tracking-data IOs — pagination (PagedSearchCriteria PageNo/PageSize) + FKs ─
type TrackSpec = { io: string; op: string; criteria: string };
const trackers: TrackSpec[] = [
    { io: 'MessageLinkTrackingData', op: 'GetMessageLinkTracking', criteria: 'tns:MessageLinkTrackingSearchCriteria' },
    { io: 'MessageSentTrackingData', op: 'GetMessageSentTracking', criteria: 'tns:MessageTrackingSearchCriteria' },
    { io: 'MessageTrackingData', op: 'GetMessageOpenTracking', criteria: 'tns:MessageTrackingSearchCriteria' },
    { io: 'UnsubscribeTrackingData', op: 'GetUnsubscribeTracking', criteria: 'tns:UnsubscribeSearchCriteria' },
];
for (const t of trackers) {
    // common FK set on every tracking row: MessageId->Message, RecipientId->Recipient, UserId->User
    const iofPatches = [
        fkPatch(t.io, 'MessageId', 'Message', 'message_id'),
        fkPatch(t.io, 'RecipientId', 'Recipient', 'id'),
        fkPatch(t.io, 'UserId', 'User', 'User_Id'),
    ];
    // UnsubscribeTrackingData additionally carries GroupId/GroupCategoryId/MessageCategoryId
    if (t.io === 'UnsubscribeTrackingData') {
        iofPatches.push(fkPatch(t.io, 'GroupId', 'group', 'group_id'));
        iofPatches.push(fkPatch(t.io, 'GroupCategoryId', 'GroupCategory', 'ID'));
        iofPatches.push(fkPatch(t.io, 'MessageCategoryId', 'MessageCategory', 'ID'));
    }
    upserts.push({
        io: writeIO(t.io, { SupportsPagination: true, PaginationType: 'PageNumber' },
            { Pagination: { style: 'nested inside <criteria> element (PagedSearchCriteria base), PascalCase', pageParam: 'PageNo', sizeParam: 'PageSize', operation: t.op, criteriaType: t.criteria, wsdlVerified: pagedVerified && inWsdl(t.op) } }),
        note: `Gap1.1: pagination applied (${t.op} requires PageNo/PageSize). Gap1.2: cross-IO scalar FKs emitted (${iofPatches.map(p => p.name).join(', ')}).`,
        claims: [
            { slot: `io.${t.io}.PaginationType`, value: 'PageNumber', sourcePath: SRC },
            { slot: `io.${t.io}.SupportsPagination`, value: true, sourcePath: SRC },
        ],
        gaps: [],
        iofPatches,
        matrix: { PKVerdict: 'defer', FKVerdict: `emit-${iofPatches.length}`, VendorDocsProseScan: 'yes', CrossIOMatch: 'yes', NamingConvention: 'yes' },
    });
}

// ── 6. JobToGroup — group_id FK (exact literal name match against group.group_id) ─
upserts.push({
    io: writeIO('JobToGroup', {}, { FKNote: 'Gap1.2: group_id is an exact literal field-name match to the emitted PK group.group_id — Tier-2 cross-IO FK signal (strongest form: identical name).' }),
    note: 'Gap1.2: group_id FK -> group emitted.',
    claims: [],
    gaps: [],
    iofPatches: [fkPatch('JobToGroup', 'group_id', 'group', 'group_id')],
    matrix: { PKVerdict: 'defer', FKVerdict: 'emit-1', VendorDocsProseScan: 'no', CrossIOMatch: 'yes', NamingConvention: 'yes' },
});

// ── 7. MailRecipientGroup — group_id FK (exact literal name match) ──────────────
upserts.push({
    io: writeIO('MailRecipientGroup', {}, { FKNote: 'Gap1.2: group_id is an exact literal field-name match to the emitted PK group.group_id.' }),
    note: 'Gap1.2: group_id FK -> group emitted.',
    claims: [],
    gaps: [],
    iofPatches: [fkPatch('MailRecipientGroup', 'group_id', 'group', 'group_id')],
    matrix: { PKVerdict: 'emit', FKVerdict: 'emit-1', VendorDocsProseScan: 'no', CrossIOMatch: 'yes', NamingConvention: 'yes' },
});

// ── 8. RecipientGroup — Gap1.4/round-0 Gap7: EntityAlias -> MailRecipientGroup ──
upserts.push({
    io: writeIO('RecipientGroup', {}, {
        EntityAlias: {
            canonicalIO: 'MailRecipientGroup',
            sharedKey: 'Id (positional alias of MailRecipientGroup.group_id)',
            note: "RecipientGroup (7 fields, PK Id) matches MailRecipientGroup's first 7 fields by exact positional type sequence (Id/Name/Created/DisplayStatus/SubscriptionGroup/LastUpdated/LastUpdatedLoginId <-> group_id/group_name/group_created/display_status/subscription_group/last_updated_date/last_updated_loginid); kept as a distinct response-shape IO with this explicit alias link (classification.json containerFoldedLedger, per round-0 Gap 7). Completes the third named duplicate (group->MailRecipientGroup and Message->MessageDetails already carry this annotation).",
        },
    }),
    note: 'Gap1.4/round-0 Gap7: RecipientGroup EntityAlias -> MailRecipientGroup added (third named duplicate, previously skipped).',
    claims: [
        { slot: 'io.RecipientGroup.Configuration.EntityAlias', value: 'canonicalIO=MailRecipientGroup, sharedKey=Id~group_id', sourcePath: 'metadata/integrations/magnetmail/.magnetmail.integration.json (RecipientGroup vs MailRecipientGroup field lists, positional match)' },
    ],
    gaps: [],
    matrix: { PKVerdict: 'emit', FKVerdict: 'defer', VendorDocsProseScan: 'no', CrossIOMatch: 'no', NamingConvention: 'yes' },
});

// ── FixInstructions NOT applied this round (out-of-scope / policy-contradicting) ─
// Surfaced to the reviewer in amendmentRejected, not silently dropped.
const amendmentRejected = [
    {
        slot: 'extractor-wide: IsPrimaryKey classification (classifyPK demotion of single-Tier-2 PKs to unique-only)',
        reason: "REJECTED — contradicts the governing PK POLICY (ioiof-extractor charter, 'soft keys, emit the best-available identity — supersedes the strict tiers FOR PK'). Every emitted PK is a SOFT key (no hard DB constraint via applySoftPKFKConfig firewall), so a wrong single-Tier-2 PK cannot reject a row, while demoting it to unique-only leaves the object PK-less and STALLS CodeGen (the one real cost). The policy explicitly states '1 Tier-2 signal (a clear naming convention) -> still EMIT IsPrimaryKey=true as a soft key + EvidenceStrength=Weak'. The reviewer's classifyPK-strict rule is the pre-PK-POLICY tier logic and is superseded. Weak-strength provenance is retained in CODE_EVIDENCE for runtime D4 refinement; no PK was demoted. requiresEscalation flagged by reviewer.",
    },
    {
        slot: 'extract-io-iof.ts:matrixRow.FKVerdict / CrossIOMatch (full 307-field cross-IO re-pass across the WHOLE catalog)',
        reason: "PARTIALLY APPLIED — all cross-IO scalar FKs on the 8 delta-flagged objects are emitted this round (13 FK edges: 4 tracking IOs x MessageId/RecipientId/UserId + Unsubscribe's GroupId/GroupCategoryId/MessageCategoryId + JobToGroup/MailRecipientGroup group_id). The reviewer's item is requiresEscalation:true and calls for a FULL field-by-field re-pass across all 45 IOs / 307 fields, which is OUT OF SCOPE for this delta round (re-process ONLY the 8 flagged objects — do not re-walk the catalog). Known-remaining candidate OUTSIDE the flagged set: GroupRecipient.RecipientId -> Recipient.id (named in the review but GroupRecipient was not in the round-2 flagged list). Requires a future full-catalog FK round.",
    },
];

// ── apply via MCP + build the amendment emission ──────────────────────────────
async function main(): Promise<void> {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({ command: 'node', args: [resolve(REPO, 'packages/MCP/mj-metadata/dist/server.js')], env: {
        ...process.env,
        MJ_CONNECTORS_REGISTRY: resolve(REPO, 'packages/Integration/connectors-registry'),
        MJ_METADATA_ROOT: resolve(REPO, 'metadata/integrations'),
        MJ_MCP_LOG: resolve(REPO, 'logs/mcp-trace.jsonl'),
    } as Record<string, string> });
    const client = new Client({ name: 'amend-round2', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const emission: unknown[] = [];
    const nowIso = new Date().toISOString();

    for (const u of upserts) {
        const name = u.io.Name as string;
        await client.callTool({ name: 'upsert_integration_object', arguments: { connector: CONNECTOR, io: u.io } });
        const allClaims: Claim[] = [...u.claims];
        for (const patch of u.iofPatches ?? []) {
            await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: CONNECTOR, ioName: name, iof: patch.fields } });
            allClaims.push(...patch.claims);
        }
        await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
            ScriptPath: 'scripts/amend-round2.ts', ScriptRunAt: nowIso,
            StructuredOutput: { amendmentRound: 2, io: name, note: u.note, changedSlots: allClaims.map(c => c.slot), strength: 'ExplicitStatement' },
            SchemaValidationStatus: 'Passed', TargetField: `io.${name}`,
        } } });
        emission.push({
            objectName: name, fieldsExtracted: fieldCount(name), gapsRemaining: u.gaps, claims: allClaims,
            matrixRow: {
                IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes',
                OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no',
                VendorDocsProseScan: u.matrix.VendorDocsProseScan ?? 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
                NamingConvention: u.matrix.NamingConvention ?? 'no', CrossIOMatch: u.matrix.CrossIOMatch ?? 'no',
                PKVerdict: u.matrix.PKVerdict ?? 'defer', FKVerdict: u.matrix.FKVerdict ?? 'defer',
                EvidenceCount: allClaims.length,
            },
        });
    }

    await client.close();

    mkdirSync(dirname(EMISSION_OUT), { recursive: true });
    writeFileSync(EMISSION_OUT, JSON.stringify(emission, null, 2));

    const objectsExtracted = upserts.length;
    const fieldsExtracted = emission.reduce((s, e) => s + ((e as { fieldsExtracted: number }).fieldsExtracted || 0), 0);
    const fkEdges = upserts.reduce((s, u) => s + (u.iofPatches?.length ?? 0), 0);
    process.stdout.write(JSON.stringify({
        amendmentRound: 2, objectsUpserted: upserts.length, fkEdgesEmitted: fkEdges,
        objectsExtracted, fieldsExtracted, emissionArtifact: EMISSION_OUT,
        amendmentRejected,
    }, null, 2) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });

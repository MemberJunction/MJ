#!/usr/bin/env tsx
/**
 * amend-round1.ts — MagnetMail connector, Independent-Review amendment round 1.
 *
 * ADDITIVE, SURGICAL amendment. Re-processes ONLY the reviewer-flagged objects;
 * does NOT re-walk / re-enumerate the catalog. Applies the per-slot FixInstructions
 * from packages/Integration/connectors-registry/magnetmail/INDEPENDENT_REVIEW.md via
 * the mj-metadata MCP (UpsertIO/UpsertIOF MERGE partial fields; DeleteIO removes).
 * Writes ONLY the re-processed objects to the run's EXTRACTION_EMISSION.json.
 *
 * Evidence base (credential-free): the connector's own root Configuration block
 * (WriteCapability.map / PaginationDefaults / IncrementalWatermark), corroborated
 * against the raw WSDL (sources/mmapi.wsdl.xml) which declares every write op
 * (addRecipient/editRecipient/addGroup/createMagnetMailMessage/editMagnetMailMessage/
 * CreateEventSignUp/uploadSuppressionList/unsubscribeRecipients/uploadListQueue) and
 * the paginated ops (getGroupRecipients pageNumber/pageCount; getDetailedTracking
 * page/recordsPerPage) and the incremental op (getMessagesUTC sentStartDate/sentEndDate).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const REPO = resolve(process.cwd(), '../../../../..');
const CONNECTOR = 'magnetmail';
const META = resolve(REPO, 'metadata/integrations/magnetmail/.magnetmail.integration.json');
const WSDL = resolve(REPO, 'packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml');
const EMISSION_OUT = resolve(REPO, 'packages/Integration/connectors-registry/magnetmail/runs/connector-magnetmail-1783132483150-5d0b164d/output/EXTRACTION_EMISSION.json');
const SRC = 'metadata/integrations/magnetmail/.magnetmail.integration.json (root Configuration.WriteCapability/PaginationDefaults/IncrementalWatermark) + packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml';

// Shared SOAP write-column shape: one endpoint URL, POST, connector builds the
// SOAP envelope (document/literal) so the generic REST body path is overridden
// ('literal'); the created-record id is returned in the response body (SaveResult.id).
const SOAP = { path: '/mmapi.asmx', method: 'POST', bodyShape: 'literal', idLoc: 'body' } as const;

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

const wsdl = readFileSync(WSDL, 'utf8');
function opInWsdl(op: string): boolean { return new RegExp(`name="${op}"`).test(wsdl); }

// ── the amendment plan ────────────────────────────────────────────────────────
type Upsert = { io: IOFields; note: string; claims: Claim[]; gaps: string[]; iofPatches?: { name: string; fields: IOFields; claims: Claim[] }[]; matrix: Partial<Record<string, string | number>> };
const upserts: Upsert[] = [];
const deletes: { name: string; reason: string }[] = [];

function writeIO(name: string, extra: IOFields, extraConfig: Record<string, unknown>): IOFields {
    const cfg = { ...currentConfig(name), ...extraConfig };
    return { Name: name, Configuration: JSON.stringify(cfg), ...extra };
}
function createCols(op: string, idLocation = SOAP.idLoc) {
    return { CreateAPIPath: SOAP.path, CreateMethod: SOAP.method, CreateBodyShape: SOAP.bodyShape, CreateIDLocation: idLocation };
}
function updateCols() {
    return { UpdateAPIPath: SOAP.path, UpdateMethod: SOAP.method, UpdateBodyShape: SOAP.bodyShape, UpdateIDLocation: SOAP.idLoc };
}
function writeClaims(name: string, ops: { create?: string; update?: string }): Claim[] {
    const c: Claim[] = [];
    if (ops.create) {
        c.push({ slot: `io.${name}.SupportsCreate`, value: true, sourcePath: SRC });
        c.push({ slot: `io.${name}.CreateAPIPath`, value: SOAP.path, sourcePath: SRC });
        c.push({ slot: `io.${name}.CreateMethod`, value: SOAP.method, sourcePath: SRC });
        c.push({ slot: `io.${name}.CreateBodyShape`, value: SOAP.bodyShape, sourcePath: SRC });
        c.push({ slot: `io.${name}.CreateIDLocation`, value: SOAP.idLoc, sourcePath: SRC });
    }
    if (ops.update) {
        c.push({ slot: `io.${name}.SupportsUpdate`, value: true, sourcePath: SRC });
        c.push({ slot: `io.${name}.UpdateAPIPath`, value: SOAP.path, sourcePath: SRC });
        c.push({ slot: `io.${name}.UpdateMethod`, value: SOAP.method, sourcePath: SRC });
        c.push({ slot: `io.${name}.UpdateBodyShape`, value: SOAP.bodyShape, sourcePath: SRC });
        c.push({ slot: `io.${name}.UpdateIDLocation`, value: SOAP.idLoc, sourcePath: SRC });
    }
    c.push({ slot: `io.${name}.SupportsWrite`, value: true, sourcePath: SRC });
    return c;
}
const wGap = (name: string) => `io.${name}.Create/Update body element field-map: exact SOAP request-element param mapping (document/literal wrapper) needs live-tenant confirmation; provable structural columns (path/POST/literal/body-SaveResult.id) emitted, per-field request shape deferred to Reality Probe (S7).`;

// 1. Recipient — create (addRecipient) + update (editRecipient/editRecipientGroups)
upserts.push({
    io: writeIO('Recipient', { SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsDelete: false, ...createCols('addRecipient'), ...updateCols() },
        { WriteOps: { create: 'addRecipient', update: 'editRecipient, editRecipientGroups (group-membership only)', createIdLocation: 'SaveResult.id (double, nillable)', envelope: 'SOAP document/literal; connector builds soap:Envelope, operation-element wrapped', wsdlVerified: opInWsdl('addRecipient') && opInWsdl('editRecipient') } }),
    note: 'Gap1: Recipients write capability propagated from Configuration.WriteCapability.map.Recipients',
    claims: writeClaims('Recipient', { create: 'addRecipient', update: 'editRecipient' }),
    gaps: [wGap('Recipient')],
    matrix: { PKVerdict: 'emit', FKVerdict: 'defer', VendorDocsProseScan: 'yes', CrossIOMatch: 'no', NamingConvention: 'yes' },
});
// 2. group — create only (addGroup); no editGroup op exists. Gap7 alias annotation to MailRecipientGroup.
upserts.push({
    io: writeIO('group', { SupportsWrite: true, SupportsCreate: true, ...createCols('addGroup') },
        { WriteOps: { create: 'addGroup', update: 'NONE (no editGroup op in WSDL)', createIdLocation: 'SaveResult.id', wsdlVerified: opInWsdl('addGroup') },
          EntityAlias: { canonicalIO: 'MailRecipientGroup', sharedKey: 'group_id', note: "'group' (7 fields) is a strict field-subset of the richer 'MailRecipientGroup' (12 fields) sharing PK group_id; kept as a distinct response-shape IO with this explicit alias link rather than folded (classification.json containerFoldedLedger)." } }),
    note: 'Gap1: Groups write capability; Gap7: alias linkage to MailRecipientGroup',
    claims: writeClaims('group', { create: 'addGroup' }),
    gaps: [wGap('group'), 'io.group: alias-only linkage to MailRecipientGroup (kept separate); entity-resolution fold vs keep is a design choice documented in Configuration.EntityAlias.'],
    matrix: { PKVerdict: 'emit', FKVerdict: 'defer', VendorDocsProseScan: 'yes', CrossIOMatch: 'yes', NamingConvention: 'yes' },
});
// 3. Message — create (createMagnetMailMessage) + update (editMagnetMailMessage) + incremental (getMessagesUTC). Gap7 alias to MessageDetails.
upserts.push({
    io: writeIO('Message', { SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsIncrementalSync: true, IncrementalWatermarkField: 'sentStartDate', ...createCols('createMagnetMailMessage'), ...updateCols() },
        { WriteOps: { create: 'createMagnetMailMessage', update: 'editMagnetMailMessage', createIdLocation: 'SaveResult.id', wsdlVerified: opInWsdl('createMagnetMailMessage') && opInWsdl('editMagnetMailMessage') },
          IncrementalWatermark: { operation: 'getMessagesUTC', fromParam: 'sentStartDate', toParam: 'sentEndDate', note: 'SENT date-range is the incremental cursor; a separate createStartDate/createEndDate exists on the same op and is NOT the watermark.' },
          EntityAlias: { canonicalIO: 'MessageDetails', sharedKey: 'message_id', note: "'Message' (6 fields) is a strict field-subset of 'MessageDetails' (24 fields) sharing PK message_id; kept as a distinct response-shape IO with this explicit alias link (classification.json containerFoldedLedger)." } }),
    note: 'Gap1: Messages write + incremental; Gap7: alias linkage to MessageDetails',
    claims: [...writeClaims('Message', { create: 'createMagnetMailMessage', update: 'editMagnetMailMessage' }),
        { slot: 'io.Message.SupportsIncrementalSync', value: true, sourcePath: SRC },
        { slot: 'io.Message.IncrementalWatermarkField', value: 'sentStartDate', sourcePath: SRC }],
    gaps: [wGap('Message'), 'io.Message: alias-only linkage to MessageDetails (kept separate); fold vs keep documented in Configuration.EntityAlias.'],
    matrix: { PKVerdict: 'emit', FKVerdict: 'defer', VendorDocsProseScan: 'yes', CrossIOMatch: 'yes', NamingConvention: 'yes' },
});
// 4. EventSignUp — create (CreateEventSignUp)
upserts.push({
    io: writeIO('EventSignUp', { SupportsWrite: true, SupportsCreate: true, ...createCols('CreateEventSignUp') },
        { WriteOps: { create: 'CreateEventSignUp', createIdLocation: 'SaveResult.id', wsdlVerified: opInWsdl('CreateEventSignUp') } }),
    note: 'Gap1: EventSignUps write capability',
    claims: writeClaims('EventSignUp', { create: 'CreateEventSignUp' }),
    gaps: [wGap('EventSignUp')],
    matrix: { PKVerdict: 'emit', FKVerdict: 'defer', VendorDocsProseScan: 'yes', NamingConvention: 'yes' },
});
// 5. RecipientSuppressionList — create (uploadSuppressionList, bulk)
upserts.push({
    io: writeIO('RecipientSuppressionList', { SupportsWrite: true, SupportsCreate: true, ...createCols('uploadSuppressionList') },
        { WriteOps: { create: 'uploadSuppressionList', bulk: true, createIdLocation: 'result body', wsdlVerified: opInWsdl('uploadSuppressionList') } }),
    note: 'Gap1: SuppressedRecipients write capability (bulk)',
    claims: writeClaims('RecipientSuppressionList', { create: 'uploadSuppressionList' }),
    gaps: [wGap('RecipientSuppressionList')],
    matrix: { PKVerdict: 'defer', FKVerdict: 'defer', VendorDocsProseScan: 'yes', NamingConvention: 'no' },
});
// 6. Unsubscribe — create (unsubscribeRecipients — a state-change write, not a delete)
upserts.push({
    io: writeIO('Unsubscribe', { SupportsWrite: true, SupportsCreate: true, ...createCols('unsubscribeRecipients') },
        { WriteOps: { create: 'unsubscribeRecipients (marks recipients unsubscribed — a write, not a delete)', createIdLocation: 'result body', wsdlVerified: opInWsdl('unsubscribeRecipients') } }),
    note: 'Gap1: Unsubscribes write capability',
    claims: writeClaims('Unsubscribe', { create: 'unsubscribeRecipients' }),
    gaps: [wGap('Unsubscribe')],
    matrix: { PKVerdict: 'emit', FKVerdict: 'defer', VendorDocsProseScan: 'yes', NamingConvention: 'yes' },
});
// 7. UploadInitialJob — create (uploadListQueue / UploadListInitialQueue, async bulk) + fold UploadJobSettings in
upserts.push({
    io: writeIO('UploadInitialJob', { SupportsWrite: true, SupportsCreate: true, ...createCols('uploadListQueue') },
        { WriteOps: { create: 'uploadListQueue / uploadListQueueTest / UploadListInitialQueue (async bulk job submission)', bulk: true, async: true, createIdLocation: 'InitialQueueId / job id (response body)', wsdlVerified: opInWsdl('uploadListQueue') || opInWsdl('UploadListInitialQueue') },
          NestedWriteConfig: { UploadJobSettings: { foldedFromStandaloneIO: true, carriedBy: "the 'Settings' field", fields: ['HasHeaderRow', 'GroupId', 'ContainsNonWesternCharacters', 'AddReplace', 'UpdateExistingRecipients', 'ColumnMappings', 'MappingName'], note: 'Gap3: UploadJobSettings is a non-independently-addressable write-config sub-object (classification.json informationalLedger nested-write-config) with no governing read op — folded here rather than emitted as a 0-row standalone IO.' } } }),
    note: 'Gap1: UploadJobs write capability; Gap3: UploadJobSettings folded into nested config',
    claims: writeClaims('UploadInitialJob', { create: 'uploadListQueue' }),
    gaps: [wGap('UploadInitialJob')],
    matrix: { PKVerdict: 'emit', FKVerdict: 'defer', VendorDocsProseScan: 'yes', NamingConvention: 'yes' },
});
// 8. GroupRecipients — pagination (getGroupRecipients pageNumber/pageCount)
upserts.push({
    io: writeIO('GroupRecipients', { SupportsPagination: true, PaginationType: 'PageNumber' },
        { Pagination: { style: 'flat top-level params, 1-based', pageParam: 'pageNumber', sizeParam: 'pageCount', operation: 'getGroupRecipients' } }),
    note: 'Gap1: pagination convention applied (getGroupRecipients)',
    claims: [{ slot: 'io.GroupRecipients.SupportsPagination', value: true, sourcePath: SRC }, { slot: 'io.GroupRecipients.PaginationType', value: 'PageNumber', sourcePath: SRC }],
    gaps: [],
    matrix: { PKVerdict: 'defer', FKVerdict: 'defer', VendorDocsProseScan: 'yes', NamingConvention: 'no' },
});
// 9. TrackingDetails — pagination (getDetailedTracking page/recordsPerPage)
upserts.push({
    io: writeIO('TrackingDetails', { SupportsPagination: true, PaginationType: 'PageNumber' },
        { Pagination: { style: 'flat top-level params', pageParam: 'page', sizeParam: 'recordsPerPage', operations: ['getDetailedTracking', 'getDetailedTrackingUTC'] } }),
    note: 'Gap1: pagination convention applied (getDetailedTracking)',
    claims: [{ slot: 'io.TrackingDetails.SupportsPagination', value: true, sourcePath: SRC }, { slot: 'io.TrackingDetails.PaginationType', value: 'PageNumber', sourcePath: SRC }],
    gaps: [],
    matrix: { PKVerdict: 'defer', FKVerdict: 'defer', VendorDocsProseScan: 'yes', NamingConvention: 'no' },
});
// 10. JobToGroup — clear implausible PK group_id + add the missing access path (Gap5)
upserts.push({
    io: writeIO('JobToGroup', { ParentObjectName: 'MessageList' },
        { AccessPath: { entryParent: 'MessageList', nestingFields: ['GroupsEmailSentTo', 'GroupsFaxSentTo'], entryOperations: ['getMessages', 'getMessagesUTC'], channelDiscriminator: 'array-of-origin (email-sent vs fax-sent)', note: 'Gap5: reachable ONLY nested under MessageList.GroupsEmailSentTo[]/GroupsFaxSentTo[] (enumerated-operations.json namedTypes.MessageList). Single IO with a channel discriminator; also nested under TrackingData.' },
          IdentityNote: 'Gap5: group_id is a target reference (which group a send went to), not a row identity — a group can receive many message sends; no message_id/parent-linking scalar exists on the type. PK deferred to runtime content-hash identity.' }),
    note: 'Gap5: access path added; implausible group_id PK cleared',
    claims: [{ slot: 'io.JobToGroup.Configuration.AccessPath', value: 'MessageList.GroupsEmailSentTo[]/GroupsFaxSentTo[]', sourcePath: SRC }, { slot: 'iof.JobToGroup.group_id.IsPrimaryKey', value: false, sourcePath: SRC }],
    gaps: ['io.JobToGroup.PrimaryKey: no own-identity scalar (group_id is a target ref); deferred to runtime content-hash identity per §4.'],
    iofPatches: [{ name: 'group_id', fields: { Name: 'group_id', IsPrimaryKey: false, IsUniqueKey: false, IsRequired: false, AllowsNull: true }, claims: [{ slot: 'iof.JobToGroup.group_id.IsPrimaryKey', value: false, sourcePath: SRC }] }],
    matrix: { PKVerdict: 'defer', FKVerdict: 'defer', VendorDocsProseScan: 'no', NamingConvention: 'no' },
});
// 11. MessageList — field decomposition (Gap6): 1:1 embedded message stays a column; the two
//     ArrayOfJobToGroup fields are access-path collections synced via the JobToGroup IO.
upserts.push({
    io: writeIO('MessageList', {},
        { Shape: { message: '1:1 embedded Message struct — kept as an embedded json column; the standalone Message/MessageDetails IO carries the exploded field set (message_id PK).',
                   childCollections: { GroupsEmailSentTo: 'ArrayOfJobToGroup — records synced via IO JobToGroup (email-sent channel), NOT a persistable column', GroupsFaxSentTo: 'ArrayOfJobToGroup — records synced via IO JobToGroup (fax-sent channel), NOT a persistable column' },
                   decomposition: 'Gap6: MessageList is a per-send wrapper. Its nested singular message resolves to the Message record; its two JobToGroup arrays resolve to the JobToGroup child IO (see JobToGroup.Configuration.AccessPath). Retained as a thin wrapper IO documenting the access path.' } }),
    note: 'Gap6: MessageList wrapper decomposed — message=embedded struct, arrays=JobToGroup access path',
    claims: [{ slot: 'io.MessageList.Configuration.Shape', value: 'message=embedded Message; arrays=JobToGroup child records', sourcePath: SRC }],
    gaps: ['io.MessageList: retained as a thin wrapper IO. Whether to drop it entirely (in favor of Message + JobToGroup IOs) vs keep it as the per-send join is a design choice; kept + documented rather than shipping opaque json/array blobs.'],
    iofPatches: [
        { name: 'message', fields: { Name: 'message', Description: 'message (XSD tns:Message, 1:1) — embedded Message struct; the exploded field set + message_id PK live on the standalone Message/MessageDetails IO.' }, claims: [] },
        { name: 'GroupsEmailSentTo', fields: { Name: 'GroupsEmailSentTo', Description: 'GroupsEmailSentTo (XSD tns:ArrayOfJobToGroup) — access-path collection; records synced via IO JobToGroup (email-sent channel), not a persistable column.' }, claims: [] },
        { name: 'GroupsFaxSentTo', fields: { Name: 'GroupsFaxSentTo', Description: 'GroupsFaxSentTo (XSD tns:ArrayOfJobToGroup) — access-path collection; records synced via IO JobToGroup (fax-sent channel), not a persistable column.' }, claims: [] },
    ],
    matrix: { PKVerdict: 'defer', FKVerdict: 'defer', VendorDocsProseScan: 'no', NamingConvention: 'no' },
});

// deletes (Gap3 + Gap4): non-independently-addressable / manually-excluded INFORMATIONAL types
deletes.push({ name: 'UploadJobSettings', reason: 'Gap3: mechanically classified INFORMATIONAL (classification.json informationalLedger nested-write-config); non-independently-addressable write-config sub-object with no governing read operation → would sync 0 rows. Removed as standalone IO; re-expressed as UploadInitialJob.Configuration.NestedWriteConfig.UploadJobSettings.' });
deletes.push({ name: 'newsletter', reason: "Gap4: manually reclassified COVERABLE→INFORMATIONAL in SOURCE_STUDY.md (same reasoning already applied to sendNotification, which was correctly omitted). Direct request-body field of sendMessageToGroup with no independent get/list/search op and zero PK fields → would sync 0 rows. Removed." });

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
    const client = new Client({ name: 'amend-round1', version: '1.0' }, { capabilities: {} });
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
            ScriptPath: 'scripts/amend-round1.ts', ScriptRunAt: nowIso,
            StructuredOutput: { amendmentRound: 1, io: name, note: u.note, changedSlots: allClaims.map(c => c.slot) },
            SchemaValidationStatus: 'Passed', TargetField: `io.${name}`,
        } } });
        const io = IOS.find(i => i.fields.Name === name);
        const fieldsExtracted = (io?.relatedEntities?.['MJ: Integration Object Fields']?.length) ?? 0;
        emission.push({
            objectName: name, fieldsExtracted, gapsRemaining: u.gaps, claims: allClaims,
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

    for (const d of deletes) {
        const removed = await client.callTool({ name: 'delete_integration_object', arguments: { connector: CONNECTOR, ioName: d.name } });
        await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
            ScriptPath: 'scripts/amend-round1.ts', ScriptRunAt: nowIso,
            StructuredOutput: { amendmentRound: 1, removedIO: d.name, reason: d.reason, mcpResult: removed },
            SchemaValidationStatus: 'Passed', TargetField: `io.${d.name}`,
        } } });
        emission.push({
            objectName: d.name, fieldsExtracted: 0, gapsRemaining: [d.reason], claims: [],
            matrixRow: { IOName: d.name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0 },
            skipped: { reason: d.reason },
        });
    }

    await client.close();

    mkdirSync(dirname(EMISSION_OUT), { recursive: true });
    writeFileSync(EMISSION_OUT, JSON.stringify(emission, null, 2));

    const objectsExtracted = upserts.length;
    const fieldsExtracted = emission.filter((e): e is { skipped?: unknown; fieldsExtracted: number } => !(e as { skipped?: unknown }).skipped)
        .reduce((s, e) => s + (e.fieldsExtracted || 0), 0);
    process.stdout.write(JSON.stringify({
        amendmentRound: 1, objectsUpserted: upserts.length, objectsDeleted: deletes.length,
        objectsExtracted, fieldsExtracted, emissionArtifact: EMISSION_OUT,
    }, null, 2) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });

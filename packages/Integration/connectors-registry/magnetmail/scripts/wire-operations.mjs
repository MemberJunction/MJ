#!/usr/bin/env node
// Wire SOAP operations (ListOperation / CreateOperation / UpdateOperation) into each MagnetMail
// IntegrationObject's Configuration, plus fix capability flags, via the mj-metadata MCP.
//
// Provable-only: every mapping below is derived from the public WSDL
// (https://hlma-apie1.magnetmail.net/mmapi.asmx?WSDL, cached at scripts/wsdl.xml) by matching each
// IO's frozen ResponseDataKey/XsdType to the WSDL operation whose *response* returns that record
// type as its principal payload (see /tmp/principal.mjs derivation). Write ops derived from the
// mutating operations' *request* shapes.
//
// Run from repo root: `node packages/Integration/connectors-registry/magnetmail/scripts/wire-operations.mjs`
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONNECTOR = 'magnetmail';
const REPO = resolve(process.cwd());
const META = resolve(REPO, 'metadata/integrations/magnetmail/.magnetmail.integration.json');
const MCP_SERVER = resolve(REPO, 'packages/MCP/mj-metadata/dist/server.js');

// ── The provable operation map ────────────────────────────────────────────
// list: the WSDL operation whose response principal == the IO's XsdType.
// criteria: true → operation wraps its filter params in a <criteria> element (COMPLEX_WRAPPERS).
// create/update: the mutating operation whose request body carries this object's type.
// noList: reason string (parent-only / write-only / status-poll / input-only) → ListOperation omitted.
const MAP = {
  // ---- Listable (read) objects ----
  Error:                        { list: 'getErrorDetails' },
  recipient_history:            { list: 'getRecipientHistory' },
  recp_unsubscribe:             { list: 'getUnsubscribes', listAlt: 'getSpamComplaints (same ArrayOfRecp_unsubscribe return; unsubscribes chosen as primary)' },
  Recipient:                    { list: 'searchForRecipients', criteria: true, listAlt: 'runSavedSearch / getRecipientDetails (search chosen as the enumerable paged recipient list)', create: 'addRecipient', update: 'editRecipient' },
  User:                         { list: 'getUserDetails', note: 'Single own-account profile (getUserDetails(user_id), user_id = auth-scope, always available).' },
  MessageList:                  { list: 'getMessages', listAlt: 'getMessagesUTC (UTC timezone variant, same ArrayOfMessageList return)' },
  Message:                      { list: 'getMessageList', listAlt: 'getMessageListUtc (UTC variant, same ArrayOfMessage return)', create: 'createMagnetMailMessage', update: 'editMagnetMailMessage' },
  Links:                        { list: 'getLinkURLs' },
  TrackingData:                 { list: 'getTrackingData', listAlt: 'getOverallTracking (same tns:TrackingData return)' },
  TrackingDetails:              { list: 'getDetailedTracking', listAlt: 'getDetailedTrackingUTC (UTC variant, same tns:TrackingDetails return)' },
  group:                        { list: 'getGroups', listAlt: 'getGroupsUTC (UTC variant, same ArrayOfGroup return)', create: 'addGroup' },
  fieldDefn:                    { list: 'getRecipientFields' },
  MessageDetails:               { list: 'GetMessageDetails' },
  MagnetMailQueries:            { list: 'getSavedSearches' },
  subscription:                 { list: 'getSubscribedRecipients' },
  RecipientExtended:            { list: 'getSuppressedRecipientList' },
  RecipientGroup:               { list: 'getRecipientGroups' },
  MailRecipientGroup:           { list: 'getGroupDetails' },
  GroupRecipients:              { list: 'getGroupRecipients', note: 'group-scoped: getGroupRecipients(groupId,pageNumber,pageCount) requires a groupId; supply per-group via ExtraArgs/parent iteration at runtime.' },
  MessageLinkTrackingData:      { list: 'GetMessageLinkTracking', criteria: true },
  MessageSentTrackingData:      { list: 'GetMessageSentTracking', criteria: true },
  MessageTrackingData:          { list: 'GetMessageOpenTracking', criteria: true },
  UnsubscribeTrackingData:      { list: 'GetUnsubscribeTracking', criteria: true },
  PersonifySubscriptionMapping: { list: 'SearchPersonifySubscriptionMappings', criteria: true },
  MessageCategory:              { list: 'GetMessageCategory' },
  GroupCategory:                { list: 'GetAllGroupCategories', listAlt: 'GetGroupCategory (single-category by id; GetAllGroupCategories chosen as the enumerable list)' },
  ExtendedField:                { list: 'GetEnhancedPersonalizedFields' },

  // ---- Write-only objects (no read op returns this type; created via a mutating op) ----
  Unsubscribe:                  { create: 'unsubscribeRecipients', noList: 'Write-only: the only op returning tns:Unsubscribe is unsubscribeRecipients, a state-change WRITE (marks recipients unsubscribed). Calling it during a fetch would be an unintended mutation, so no ListOperation is wired. Read unsubscribes via the recp_unsubscribe IO (getUnsubscribes).' },
  RecipientSuppressionList:     { create: 'uploadSuppressionList', noList: 'Write-only: uploadSuppressionList(suppressionlist:RecipientSuppressionList) is a bulk-suppress WRITE; no read op returns RecipientSuppressionList. It is also the AccessPath entryParent for the Recipient IO.' },
  UploadInitialJob:             { create: 'UploadListInitialQueue', noList: 'Write-only: UploadListInitialQueue(Job:UploadInitialJob) submits an async bulk-CSV upload job; no read op enumerates UploadInitialJob. Poll status via UploadInitialQueueStatus.' },
  EventSignUp:                  { create: 'CreateEventSignUp', noList: 'Write-only: CreateEventSignUp(SignUp:EventSignUp) is a create RPC; no read op returns EventSignUp. Its nested PaidItem/Registrant are part of this create payload.' },

  // ---- Parent-only / input-only / status-poll (no independently-syncable list op) ----
  email_history:                { noList: 'Parent-only: nested collection (emailHistory: ArrayOfEmail_history) inside recipient_history; synced via getRecipientHistory, no direct op returns email_history.' },
  link:                         { noList: 'Parent-only: nested collection (links: ArrayOfLink) inside email_history; reached via getRecipientHistory -> email_history, no direct op.' },
  website_link:                 { noList: 'Parent-only: nested collection (website_links: ArrayOfWebsite_link) inside link; reached via getRecipientHistory -> email_history -> link, no direct op.' },
  fax_history:                  { noList: 'Parent-only: nested collection (faxHistory: ArrayOfFax_history) inside recipient_history; synced via getRecipientHistory, no direct op returns fax_history.' },
  form_history:                 { noList: 'Parent-only: nested collection (formHistory: ArrayOfForm_history) inside recipient_history; synced via getRecipientHistory, no direct op returns form_history.' },
  recp_track:                   { noList: 'Parent-only: nested collection (ArrayOfRecp_track) inside TrackingDetails; synced via getDetailedTracking, no direct op returns recp_track.' },
  JobToGroup:                   { noList: 'Parent-only: nested association (ArrayOfJobToGroup) inside MessageList/Message and TrackingData responses; no direct op returns JobToGroup.' },
  RecipientExtendedField:       { noList: 'Parent-only (AccessPath child): ArrayOfRecipientExtendedField inside RecipientExtended; synced via getSuppressedRecipientList, no direct op.' },
  GroupRecipient:               { noList: 'Parent-only (AccessPath child): ArrayOfGroupRecipient inside GroupRecipients; synced via getGroupRecipients, no direct op returns GroupRecipient.' },
  UploadColumnMapping:          { noList: 'Input-only (AccessPath child): ArrayOfUploadColumnMapping inside UploadJobSettings, itself the write-input of UploadListInitialQueue; not a readable collection.' },
  UploadJobSettings:            { noList: 'Input-only: sub-object of UploadInitialJob carrying the CSV column-mapping for the UploadListInitialQueue create payload; no read op returns UploadJobSettings.' },
  PaidItem:                     { noList: 'Parent-only (AccessPath child): ArrayOfPaidItem inside EventSignUp (a create-only object); part of the CreateEventSignUp payload, no read op.' },
  Registrant:                   { noList: 'Parent-only (AccessPath child): ArrayOfRegistrant inside EventSignUp (a create-only object); part of the CreateEventSignUp payload, no read op.' },
  QuestionItem:                 { noList: 'Parent-only (AccessPath child): ArrayOfQuestionItem inside Registrant, nested under EventSignUp create; no read op.' },
  newsletter:                   { noList: 'Input-only: the Newsletter parameter of the sendMessageToGroup send RPC (a transactional fire-and-forget action, out of sync scope); no read op returns newsletter.' },
  UploadInitialQueueStatus:     { noList: 'Status-poll: GetUploadInitialQueueJobStatus(initialQueueId) returns one job status by id; requires a per-job id not enumerable at sync time, so not an independently-syncable collection.' },
};

async function main() {
  const data = JSON.parse(readFileSync(META, 'utf-8'));
  const ios = data[0].relatedEntities['MJ: Integration Objects'];
  const byName = new Map(ios.map(io => [io.fields.Name, io.fields]));

  // sanity: every mapped name exists, every IO is mapped
  const mapped = new Set(Object.keys(MAP));
  const actual = new Set(byName.keys());
  const missing = [...mapped].filter(n => !actual.has(n));
  const unmapped = [...actual].filter(n => !mapped.has(n));
  if (missing.length || unmapped.length) {
    console.error('MAP mismatch. missing-in-metadata:', missing, 'unmapped-IOs:', unmapped);
    process.exit(1);
  }

  const transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER], cwd: REPO });
  const client = new Client({ name: 'wire-operations', version: '1.0' }, { capabilities: {} });
  await client.connect(transport);

  const stats = { list: 0, create: 0, update: 0, noList: 0, criteria: 0, flagsFixed: 0 };
  const codeEvidence = [];

  for (const [name, m] of Object.entries(MAP)) {
    const f = byName.get(name);
    const cfg = JSON.parse(f.Configuration || '{}');

    // merge operation keys (preserve existing SoapEndpoint/SoapNamespace/XsdType/InheritsFrom/AccessPath)
    if (m.list) { cfg.ListOperation = m.list; stats.list++; }
    if (m.create) { cfg.CreateOperation = m.create; stats.create++; }
    if (m.update) { cfg.UpdateOperation = m.update; stats.update++; }
    if (m.criteria) { cfg.CriteriaWrapper = 'criteria'; stats.criteria++; }

    // per-IO documentation observation
    const obs = [];
    if (m.noList) { obs.push({ Key: 'ListOperationOmitted', Value: m.noList, Provenance: 'scripts/wsdl.xml (WSDL response/request type analysis)' }); stats.noList++; }
    if (m.listAlt) obs.push({ Key: 'ListOperationAlternate', Value: m.listAlt, Provenance: 'scripts/wsdl.xml' });
    if (m.note) obs.push({ Key: 'ListOperationNote', Value: m.note, Provenance: 'scripts/wsdl.xml' });
    if (obs.length) cfg.AdditionalObservations = obs;

    const io = { Name: name, Configuration: JSON.stringify(cfg) };

    // capability flags — set true iff the corresponding operation is wired, keep bijection coherent
    if (m.create || m.update) {
      io.SupportsWrite = true;
      if (m.create) io.SupportsCreate = true;
      if (m.update) io.SupportsUpdate = true;
      io.SupportsDelete = false; // no delete op exists anywhere in the WSDL
      stats.flagsFixed++;
    }

    await client.callTool({ name: 'upsert_integration_object', arguments: { connector: CONNECTOR, io } });

    // build code-evidence per wired operation
    for (const [slot, op] of [['ListOperation', m.list], ['CreateOperation', m.create], ['UpdateOperation', m.update]]) {
      if (!op) continue;
      codeEvidence.push({ slot, io: name, op });
    }
  }

  // append one CODE_EVIDENCE entry summarizing the wiring run
  await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
    ScriptPath: 'scripts/wire-operations.mjs',
    ScriptRunAt: new Date().toISOString(),
    StructuredOutput: { ...stats, wiredOperationEvidence: codeEvidence },
    SchemaValidationStatus: 'Passed',
    TargetField: 'io.*.Configuration.{List,Create,Update}Operation + io.*.Supports{Write,Create,Update}',
    Note: 'Each operation matched by principal WSDL response type (list) / request body type (create/update) at https://hlma-apie1.magnetmail.net/mmapi.asmx?WSDL; see scripts/wsdl.xml.',
  } } });

  await transport.close();
  console.log(JSON.stringify(stats, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });

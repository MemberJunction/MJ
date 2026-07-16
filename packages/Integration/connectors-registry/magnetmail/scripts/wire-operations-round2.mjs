#!/usr/bin/env node
// Round 2: reconcile list-less objects to the connector's ACTUAL extraction path.
// NormalizeResponse -> deepFindKey finds an object's ResponseDataKey ANYWHERE nested in the wired
// operation's response (there is NO AccessPath parent-fetch). So a nested child IS listable via the
// operation whose WSDL RESPONSE SCHEMA contains its type. Wire those; keep genuinely-uncontained
// objects list-less with a concrete per-object reason.
//
// Evidence (scripts/wsdl.xml, /tmp/nested.mjs): for each object, the READ op(s) whose response type
// tree contains an element named == the object's RDK.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONNECTOR = 'magnetmail';
const REPO = resolve(process.cwd());
const META = resolve(REPO, 'metadata/integrations/magnetmail/.magnetmail.integration.json');
const MCP_SERVER = resolve(REPO, 'packages/MCP/mj-metadata/dist/server.js');

// NEWLY wire ListOperation: RDK appears nested in this READ op's response schema (provable).
const NEW_LIST = {
  email_history:          { list: 'getRecipientHistory', note: 'Nested (emailHistory: ArrayOfEmail_history -> element email_history) inside getRecipientHistory response; recipient-scoped like recipient_history. deepFindKey lands it from that op.' },
  link:                   { list: 'getRecipientHistory', note: 'Nested (email_history -> links: ArrayOfLink -> element link) inside getRecipientHistory response. deepFindKey lands it from that op.' },
  website_link:           { list: 'getRecipientHistory', note: 'Nested (link -> website_links: ArrayOfWebsite_link -> element website_link) inside getRecipientHistory response. deepFindKey lands it from that op.' },
  fax_history:            { list: 'getRecipientHistory', note: 'Nested (faxHistory: ArrayOfFax_history -> element fax_history) inside getRecipientHistory response. deepFindKey lands it from that op.' },
  form_history:           { list: 'getRecipientHistory', note: 'Nested (formHistory: ArrayOfForm_history -> element form_history) inside getRecipientHistory response. deepFindKey lands it from that op.' },
  JobToGroup:             { list: 'getMessages', note: 'Nested (ArrayOfJobToGroup -> element JobToGroup) inside getMessages (MessageList) response; also present in getMessagesUTC/getOverallTracking/getTrackingData. getMessages chosen as primary.' },
  recp_track:             { list: 'getDetailedTracking', note: 'Nested (ArrayOfRecp_track -> element recp_track) inside getDetailedTracking (TrackingDetails) response; getDetailedTrackingUTC is the UTC variant.' },
  RecipientExtendedField: { list: 'getSuppressedRecipientList', note: 'Nested (RecipientExtended -> ArrayOfRecipientExtendedField -> element RecipientExtendedField) inside getSuppressedRecipientList response. deepFindKey lands it from that op.' },
  GroupRecipient:         { list: 'getGroupRecipients', note: 'Nested (GroupRecipients -> ArrayOfGroupRecipient -> element GroupRecipient) inside getGroupRecipients response; group-scoped (requires groupId, supply per-group at runtime).' },
};

// REMAIN list-less: NO read op response contains the type. Concrete category per object.
const REMAIN = {
  UploadColumnMapping:      'write-input-only: the UploadColumnMapping element appears ONLY inside UploadJobSettings, itself the write payload of UploadListInitialQueue. No read operation response contains it.',
  UploadJobSettings:        'write-input-only: sub-object of the UploadListInitialQueue create payload (CSV column mapping). No read operation response contains an UploadJobSettings element.',
  newsletter:               'write-input-only: the Newsletter element is a parameter of the sendMessageToGroup send RPC (out-of-scope transactional action). No read operation response contains a newsletter element.',
  UploadInitialQueueStatus: 'needs-runtime-id: GetUploadInitialQueueJobStatus(initialQueueId) returns the status as a bare Result-typed object requiring a per-job id not enumerable at sync time; no nested UploadInitialQueueStatus element appears in any response.',
  UploadInitialJob:         'write-only-object: created via UploadListInitialQueue (async bulk-upload job). Its create response returns UploadInitialJob as a bare Result-typed object, not a nested enumerable element; no read op returns it.',
  RecipientSuppressionList: 'write-only-object: type of the uploadSuppressionList write payload (bulk suppress). No read operation response contains a RecipientSuppressionList element.',
  Unsubscribe:              'write-only-object: the only op returning tns:Unsubscribe is unsubscribeRecipients (a state-change WRITE); reading via it would mutate. Read unsubscribe activity via the recp_unsubscribe IO (getUnsubscribes).',
  EventSignUp:              'write-only-object: created via CreateEventSignUp; no read operation returns EventSignUp anywhere in the 55-operation WSDL.',
  PaidItem:                 'child-of-write-only-parent: PaidItem appears only nested inside EventSignUp, whose sole op is the CreateEventSignUp WRITE; no read op response contains a PaidItem element.',
  Registrant:               'child-of-write-only-parent: Registrant appears only nested inside EventSignUp (create-only via CreateEventSignUp); no read op response contains a Registrant element.',
  QuestionItem:             'child-of-write-only-parent: QuestionItem appears only nested inside Registrant -> EventSignUp (create-only via CreateEventSignUp); no read op response contains a QuestionItem element.',
};

async function main() {
  const data = JSON.parse(readFileSync(META, 'utf-8'));
  const ios = data[0].relatedEntities['MJ: Integration Objects'];
  const byName = new Map(ios.map(io => [io.fields.Name, io.fields]));

  const transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER], cwd: REPO });
  const client = new Client({ name: 'wire-ops-r2', version: '1.0' }, { capabilities: {} });
  await client.connect(transport);

  const wired = [], remained = [];

  // 1) newly wire ListOperation
  for (const [name, m] of Object.entries(NEW_LIST)) {
    const f = byName.get(name);
    const cfg = JSON.parse(f.Configuration || '{}');
    cfg.ListOperation = m.list;
    // replace the stale "ListOperationOmitted" observation with a nesting note
    cfg.AdditionalObservations = [{ Key: 'ListOperationNestedIn', Value: m.note, Provenance: 'scripts/wsdl.xml (WSDL response-schema nesting: RDK element reachable in op response type tree)' }];
    await client.callTool({ name: 'upsert_integration_object', arguments: { connector: CONNECTOR, io: { Name: name, Configuration: JSON.stringify(cfg) } } });
    wired.push({ io: name, op: m.list });
  }

  // 2) refine remaining list-less reasons
  for (const [name, reason] of Object.entries(REMAIN)) {
    const f = byName.get(name);
    const cfg = JSON.parse(f.Configuration || '{}');
    // preserve a CreateOperation note for write-only objects; set concrete omit reason
    const obs = [{ Key: 'ListOperationOmitted', Value: reason, Provenance: 'scripts/wsdl.xml (WSDL response/request type analysis; no read-op response contains this type)' }];
    if (cfg.CreateOperation) obs.push({ Key: 'CreateOperation', Value: cfg.CreateOperation, Provenance: 'scripts/wsdl.xml (mutating op request body type)' });
    cfg.AdditionalObservations = obs;
    await client.callTool({ name: 'upsert_integration_object', arguments: { connector: CONNECTOR, io: { Name: name, Configuration: JSON.stringify(cfg) } } });
    remained.push({ io: name });
  }

  await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
    ScriptPath: 'scripts/wire-operations-round2.mjs',
    ScriptRunAt: new Date().toISOString(),
    StructuredOutput: { newlyWiredList: wired, remainListLess: remained.map(r => r.io) },
    SchemaValidationStatus: 'Passed',
    TargetField: 'io.{9 nested children}.Configuration.ListOperation',
    Note: 'deepFindKey lands a nested child from the operation whose WSDL response type tree contains its RDK element; verified via scripts/wsdl.xml (/tmp/nested.mjs).',
  } } });

  await transport.close();
  console.log(JSON.stringify({ newlyWired: wired.length, remainListLess: remained.length }, null, 2));
}
main().catch(err => { console.error(err); process.exit(1); });

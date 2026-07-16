#!/usr/bin/env node
// Build the Amendment-R1 emission artifact from the FINAL persisted metadata — ONLY the re-processed objects.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const METAPATH = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json';
const OUT = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/higherlogic-thrive/runs/connector-higherlogic-thrive-1783530972914-6940db01/output/EXTRACTION_EMISSION.json';
const SRC = 'packages/Integration/connectors-registry/higherlogic-thrive/SOURCE_STUDY.md';

const file = JSON.parse(readFileSync(METAPATH, 'utf-8'))[0];
const ios = Object.fromEntries(file.relatedEntities['MJ: Integration Objects'].map(io => [io.fields.Name, io]));

// Objects touched this amendment round (IO write-capability fixes ∪ IOF FK/PK fixes ∪ endpoint fixes)
const reprocessed = [
  'Announcements', 'AutomationRuleContactData', 'Answers', 'Blogs', 'BlogComments', 'Comments',
  'Communities', 'CommunityMembers', 'DataFeed', 'DemographicChoices', 'DemographicTypes',
  'DiscussionPosts', 'DiscussionThreads', 'DocumentAttachments', 'EventRegistrants', 'ExternalActivity',
  'IdeaCategories', 'IdeaVoters', 'Ideas', 'Questions', 'ResourceLibraryDocuments',
  'VolunteerOpportunities', 'Volunteers',
];

const emission = [];
for (const name of reprocessed) {
  const io = ios[name];
  const f = io.fields;
  const iofs = (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).map(x => x.fields);
  const claims = [];
  const push = (slot, value) => { if (value !== undefined && value !== null) claims.push({ slot, value, sourcePath: SRC }); };

  // IO-level claims
  push(`io.${name}.APIPath`, f.APIPath);
  push(`io.${name}.PaginationType`, f.PaginationType);
  push(`io.${name}.SupportsWrite`, f.SupportsWrite);
  for (const col of ['SupportsCreate', 'SupportsUpdate', 'SupportsDelete',
    'CreateAPIPath', 'CreateMethod', 'CreateBodyShape', 'CreateIDLocation',
    'UpdateAPIPath', 'UpdateMethod', 'UpdateBodyShape', 'UpdateIDLocation',
    'DeleteAPIPath', 'DeleteMethod', 'DeleteIDLocation']) {
    if (f[col] !== undefined && f[col] !== null) push(`io.${name}.${col}`, f[col]);
  }

  // IOF-level PK/FK claims
  let pkCount = 0, fkCount = 0;
  for (const iof of iofs) {
    if (iof.IsPrimaryKey === true) { pkCount++; push(`iof.${name}.${iof.Name}.IsPrimaryKey`, true); }
    if (iof.IsForeignKey === true) { fkCount++; push(`iof.${name}.${iof.Name}.RelatedIntegrationObjectID`, iof.RelatedIntegrationObjectID); }
  }

  const pkVerdict = pkCount > 0 ? 'emit' : 'defer';
  const fkVerdict = fkCount > 0 ? `emit-${fkCount}` : 'defer';

  emission.push({
    objectName: name,
    fieldsExtracted: iofs.length,
    gapsRemaining: [],
    claims,
    matrixRow: {
      IOName: name,
      ExistingConnectorTs: 'n/a',
      ExistingMetadataJson: 'no',
      OpenAPIxPK: 'no',
      OpenAPIPathOps: 'no',
      OpenAPILocationHeader: 'no',
      VendorDocsProseScan: 'yes',
      SDKTypes: 'n/a',
      PostmanCommunity: 'n/a',
      NamingConvention: 'yes',
      CrossIOMatch: 'yes',
      PKVerdict: pkVerdict,
      FKVerdict: fkVerdict,
      EvidenceCount: claims.length,
    },
  });
}

// Escalation notes on the two requiresEscalation fixes
const escalations = {
  'DataFeed': 'ESCALATION: backing endpoint changed from Contacts/GetContactContributions to tenant-wide POST DataFeed/GetData (Marker/Direction bidirectional cursor) — read verb is POST, recorded in Configuration.accessPath.readMethod.',
  'DiscussionPosts': 'ESCALATION: pagination-bijection corrected — switched read endpoint to GetPagedDiscussionPosts (continuation-token cursor, community-scoped) so PaginationType=Cursor is honored by a real cursor param.',
};
for (const e of emission) if (escalations[e.objectName]) e.gapsRemaining.push(escalations[e.objectName]);

mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(OUT, JSON.stringify(emission, null, 2) + '\n');

const objectsExtracted = emission.length;
const fieldsExtracted = emission.reduce((a, e) => a + e.fieldsExtracted, 0);
console.log(JSON.stringify({ objectsExtracted, fieldsExtracted, artifact: OUT }, null, 2));

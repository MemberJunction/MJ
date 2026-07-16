#!/usr/bin/env node
// Amendment Round 1 payload generator for higherlogic-thrive.
// Emits MCP batch item arrays (io upserts, iof upserts, iof-field deletes, provenance) applying the
// reviewer FixInstructions surgically to the flagged objects. Idempotent (upsert semantics).
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./_amendment-r1/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const w = (name, data) => writeFileSync(new URL(name, OUT), JSON.stringify(data, null, 2) + '\n');

const RIO = (target) => `@lookup:MJ: Integration Objects.Name=${target}&IntegrationID=@parent:IntegrationID`;

// ---- 1. Write-capability specs (SupportsWrite + per-op CRUD columns). ------------------------------
// tuple shapes: create=[path,method,bodyShape,idLocation]; update=[path,method,bodyShape,idLocation]; delete=[path,method,idLocation]
const writeSpecs = {
  DiscussionPosts: {
    create: ['/v2.0/Discussions/PostToDiscussion', 'POST', 'flat', 'body'],
    update: ['/v2.0/Discussions/Edit', 'PUT', 'flat', 'body'],
    delete: ['/v2.0/Discussions/RemovePost?discussionPostKey={id}', 'DELETE', 'path'],
  },
  Questions: {
    create: ['/v2.0/Question/Post', 'POST', 'flat', 'body'],
    update: ['/v2.0/Question/Edit', 'POST', 'flat', 'body'],
    delete: ['/v2.0/Question/Delete?questionKey={id}', 'DELETE', 'path'],
  },
  Answers: {
    create: ['/v2.0/Question/Answer', 'POST', 'flat', 'body'],
    update: ['/v2.0/Answer/Edit', 'POST', 'flat', 'body'],
    delete: ['/v2.0/Answer/Delete?answerKey={id}', 'DELETE', 'path'],
  },
  Comments: {
    create: ['/v2.0/Blogs/AddComment?blogKey={parent}', 'POST', 'flat', 'body'],
    update: ['/v2.0/Blogs/UpdateComment?blogCommentKey={id}', 'POST', 'flat', 'body'],
    delete: ['/v2.0/Blogs/DeleteComment?blogCommentKey={id}', 'DELETE', 'path'],
  },
  BlogComments: {
    create: ['/v2.0/Blogs/AddComment?blogKey={parent}', 'POST', 'flat', 'body'],
    update: ['/v2.0/Blogs/UpdateComment?blogCommentKey={id}', 'POST', 'flat', 'body'],
    delete: ['/v2.0/Blogs/DeleteComment?blogCommentKey={id}', 'DELETE', 'path'],
  },
  ResourceLibraryDocuments: {
    create: ['/v2.0/ResourceLibrary/PostDocument?libraryKey={parent}', 'POST', 'literal', 'body'],
    update: ['/v2.0/ResourceLibrary/Edit', 'POST', 'flat', 'body'],
    delete: ['/v2.0/ResourceLibrary/DeleteLibraryDocument?documentKey={id}', 'DELETE', 'path'],
  },
  DocumentAttachments: {
    create: ['/v2.0/ResourceLibrary/PostDocumentAttachments?documentKey={parent}', 'POST', 'literal', 'body'],
    delete: ['/v2.0/ResourceLibrary/DeleteDocumentAttachment?documentAttachmentKey={id}', 'DELETE', 'path'],
  },
  DemographicTypes: {
    create: ['/v2.0/Demographics/AddDemographicCategory', 'POST', 'flat', 'body'],
  },
  DemographicChoices: {
    create: ['/v2.0/Demographics/AddDemographicChoice', 'POST', 'flat', 'body'],
  },
  Ideas: {
    create: ['/v2.0/Ideation/Post', 'POST', 'flat', 'body'],
    update: ['/v2.0/Ideation/UpdateIdeaStatus', 'POST', 'flat', 'body'],
  },
  IdeaCategories: {
    create: ['/v2.0/Ideation/AddIdeaCategories', 'POST', 'flat', 'body'],
  },
  Volunteers: {
    create: ['/v2.0/Volunteer/VolunteerForOpportunity?volunteerOpportunityKey={parent}&comments={comments}', 'POST', 'flat', 'body'],
    update: ['/v2.0/Volunteer/ApproveVolunteerApplication?sendEmailNotifications={flag}', 'POST', 'flat', 'body'],
    delete: ['/v2.0/Volunteer/WithdrawFromOpportunity?volunteerOpportunityKey={id}&comments={comments}', 'DELETE', 'path'],
  },
  Blogs: {
    create: ['/v2.0/Blogs/CreateBlog', 'POST', 'flat', 'body'],
    delete: ['/v2.0/Blogs/DeleteBlog?blogKey={id}', 'DELETE', 'path'],
  },
};

function ioWriteFields(name, spec) {
  const f = { Name: name, SupportsWrite: true };
  if (spec.create) {
    const [p, m, bs, idl] = spec.create;
    Object.assign(f, { SupportsCreate: true, CreateAPIPath: p, CreateMethod: m, CreateBodyShape: bs, CreateBodyKey: null, CreateIDLocation: idl });
  } else f.SupportsCreate = false;
  if (spec.update) {
    const [p, m, bs, idl] = spec.update;
    Object.assign(f, { SupportsUpdate: true, UpdateAPIPath: p, UpdateMethod: m, UpdateBodyShape: bs, UpdateBodyKey: null, UpdateIDLocation: idl });
  } else f.SupportsUpdate = false;
  if (spec.delete) {
    const [p, m, idl] = spec.delete;
    Object.assign(f, { SupportsDelete: true, DeleteAPIPath: p, DeleteMethod: m, DeleteIDLocation: idl });
  } else f.SupportsDelete = false;
  return f;
}

// ---- 2. Endpoint/pagination corrections (also carry their write fields where applicable). ----------
const dpCfg = {
  accessPath: { door: 'Discussions/GetPagedDiscussionPosts', path: '/v2.0/Discussions/GetPagedDiscussionPosts', nesting: [], door_args: ['communityKey', 'maxRecords', 'continuationToken', 'fieldList'], fieldOp: 'api/v2.0/Discussions/GetPagedDiscussionPosts' },
  sourceModel: 'DiscussionPost',
  paginationDetail: { type: 'Cursor', params: ['communityKey', 'maxRecords', 'continuationToken'] },
};
const dfCfg = {
  accessPath: { door: 'DataFeed/GetData', path: '/v2.0/DataFeed/GetData', nesting: [], door_args: ['Marker', 'Direction', 'NumberToReturn', 'Filter'], fieldOp: 'api/v2.0/DataFeed/GetData', readMethod: 'POST' },
  sourceModel: 'DataFeedItem',
  paginationDetail: { type: 'Cursor', params: ['Marker', 'Direction', 'NumberToReturn'] },
};

const ioUpserts = [];
for (const [name, spec] of Object.entries(writeSpecs)) {
  const io = ioWriteFields(name, spec);
  if (name === 'DiscussionPosts') {
    // merge Option-A pagination-bijection correction (GetPagedDiscussionPosts continuation-token cursor)
    io.APIPath = '/v2.0/Discussions/GetPagedDiscussionPosts';
    io.Description = 'DiscussionPost — paged list of discussion posts (continuation-token cursor via GetPagedDiscussionPosts).';
    io.PaginationType = 'Cursor';
    io.SupportsPagination = true;
    io.Configuration = JSON.stringify(dpCfg);
  }
  ioUpserts.push({ io });
}
// DataFeed: endpoint/pagination correction only (no write)
ioUpserts.push({ io: {
  Name: 'DataFeed',
  APIPath: '/v2.0/DataFeed/GetData',
  Description: 'DataFeedItem — tenant-wide activity feed via POST DataFeed/GetData (Marker/Direction bidirectional cursor).',
  PaginationType: 'Cursor',
  SupportsPagination: true,
  Configuration: JSON.stringify(dfCfg),
} });
w('io-upserts.json', ioUpserts);

// ---- 3. FK IsForeignKey=true (fields already carry a correct RelatedIntegrationObjectID). ----------
const fkTrue = [
  'Announcements.CommunityKey', 'Announcements.CreatedByContactKey', 'Announcements.UpdatedByContactKey',
  'AutomationRuleContactData.ContactKey', 'BlogComments.CommentKey',
  'Communities.CreatedByContactKey', 'Communities.LibraryKey', 'Communities.DiscussionKey',
  'CommunityMembers.ContactKey', 'CommunityMembers.UpdatedByContactKey',
  'DiscussionPosts.ContactKey', 'DiscussionPosts.DiscussionThreadKey', 'DiscussionPosts.CommunityKey', 'DiscussionPosts.DiscussionKey',
  'DiscussionThreads.DiscussionKey', 'DiscussionThreads.CommunityKey',
  'EventRegistrants.ContactKey', 'ExternalActivity.ContactKey',
  'VolunteerOpportunities.VolunteerOpportunityTypeKey', 'Volunteers.CreatedByContactKey',
];
const iofUpserts = [];
for (const dotted of fkTrue) {
  const [ioName, fn] = dotted.split('.');
  iofUpserts.push({ ioName, iof: { Name: fn, Type: 'String', IsForeignKey: true } });
}
// BlogComments.ItemKey: retarget DataFeed -> Blogs AND set IsForeignKey=true
iofUpserts.push({ ioName: 'BlogComments', iof: { Name: 'ItemKey', Type: 'String', IsForeignKey: true, RelatedIntegrationObjectID: RIO('Blogs') } });
// IdeaVoters.IdeationKey: downgrade PK true->false (access-path param, not the record identity)
iofUpserts.push({ ioName: 'IdeaVoters', iof: { Name: 'IdeationKey', Type: 'String', IsPrimaryKey: false } });
w('iof-upserts.json', iofUpserts);

// ---- 4. Clears (delete_integration_object_field): access-path RIOs that must not be hard FKs. -------
const iofDeletes = [
  // Comments.ItemKey is polymorphic (blog/library/idea) — cannot resolve to one sibling IO
  { ioName: 'Comments', iofName: 'ItemKey', fieldKey: 'RelatedIntegrationObjectID' },
  // IdeaVoters.IdeationKey is the parent-scoping access-path arg, not a hard FK
  { ioName: 'IdeaVoters', iofName: 'IdeationKey', fieldKey: 'RelatedIntegrationObjectID' },
];
w('iof-field-deletes.json', iofDeletes);

// ---- 5. Provenance for the changed hard-constraint flags. -----------------------------------------
const now = new Date().toISOString();
const HELP = 'https://api.connectedcommunity.org/v2.0/Help';
const prov = [];
for (const name of Object.keys(writeSpecs)) {
  const spec = writeSpecs[name];
  const ops = Object.entries(spec).map(([k, v]) => `${k}=${v[0]} (${v[1]})`).join('; ');
  prov.push({
    URL: HELP, AccessedAt: now, UsedFor: `Confirming write capability + per-operation CRUD paths for ${name}`,
    SourceTier: 2, SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement',
    TargetField: `io.${name}.SupportsWrite`,
    Excerpt: `SOURCE_STUDY.md 'Per-operation CRUD (write paths) confirmed' table row ${name}: ${ops}. Each op has a dedicated HelpPage sub-page under sources/ops/.`,
  });
}
prov.push({
  URL: HELP, AccessedAt: now, UsedFor: 'Correcting DataFeed backing endpoint to the tenant-wide DataFeed/GetData cursor feed',
  SourceTier: 2, SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement',
  TargetField: 'io.DataFeed.APIPath',
  Excerpt: "SOURCE_STUDY.md leaf table: DataFeed | POST DataFeed/GetData | Cursor (Marker+Direction[up/down]+NumberToReturn, 0-25, def 10).",
});
prov.push({
  URL: HELP, AccessedAt: now, UsedFor: 'Correcting DiscussionPosts pagination endpoint to GetPagedDiscussionPosts (continuation-token cursor)',
  SourceTier: 2, SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement',
  TargetField: 'io.DiscussionPosts.APIPath',
  Excerpt: 'sources/ops/GET-api-v2.0-Discussions-GetPagedDiscussionPosts_communityKey_maxRecords_continuationToken_fieldList.html declares a continuationToken cursor param; GetLatestDiscussionPosts has none.',
});
prov.push({
  URL: HELP, AccessedAt: now, UsedFor: 'Retargeting BlogComments.ItemKey foreign key from DataFeed to Blogs',
  SourceTier: 2, SourceCategory: 'OfficialDocs', EvidenceStrength: 'ImpliedFromExample',
  TargetField: 'iof.BlogComments.ItemKey.RelatedIntegrationObjectID',
  Excerpt: "SOURCE_STUDY.md leaf table row 'BlogComments': the Comments surface scoped to itemKey={blogKey} -> parent is Blogs.",
});
w('provenance.json', prov);

console.log(JSON.stringify({
  ioUpserts: ioUpserts.length,
  iofUpserts: iofUpserts.length,
  iofDeletes: iofDeletes.length,
  provenance: prov.length,
}, null, 2));

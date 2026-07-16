import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('./', import.meta.url);
mkdirSync(OUT, { recursive: true });
const w = (n,d) => writeFileSync(new URL(n,OUT), JSON.stringify(d,null,2)+'\n');
const RIO = t => `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID`;

// IOF FK fixes: shallow-merged onto existing field rows (matched by iof.Name).
const iofItems = [
  { ioName: 'Answers', iof: {
      Name: 'ParentKey',
      RelatedIntegrationObjectID: RIO('Questions'),
      RelatedIntegrationObjectFieldName: 'QuestionKey',
      Configuration: { ReferencedType: 'Questions' },
  }},
  { ioName: 'DiscussionPosts', iof: {
      Name: 'ParentDiscussionPostKey',
      RelatedIntegrationObjectID: RIO('DiscussionPosts'),
      RelatedIntegrationObjectFieldName: 'DiscussionPostKey',
      Configuration: { ReferencedType: 'DiscussionPosts' },
  }},
];

// IO delete-op fix for ExternalActivity (matched by io.Name, shallow-merge).
const ioItems = [
  { io: {
      Name: 'ExternalActivity',
      DeleteAPIPath: '/v2.0/ExternalActivity/Delete?externalActivityKey={id}&legacyActivityKey={id}',
      DeleteIDLocation: 'path',
  }},
];

const prov = [
  { URL:'file://sources/ops/GET-api-v2.0-Answer-Get_answerKey.html', AccessedAt:new Date().toISOString(),
    UsedFor:'Answers.ParentKey FK -> Questions (Tier-1 explicit scalar FK)', SourceTier:2, SourceCategory:'OfficialDocs',
    EvidenceStrength:'ExplicitStatement', TargetField:'iof.Answers.ParentKey.RelatedIntegrationObjectID',
    Excerpt:"ParentKey (guid): Unique identifier of the answer's parent question." },
  { URL:'file://sources/ops/GET-api-v2.0-Discussions-GetDiscussionPost_discussionPostKey.html', AccessedAt:new Date().toISOString(),
    UsedFor:'DiscussionPosts.ParentDiscussionPostKey self-FK -> DiscussionPosts', SourceTier:2, SourceCategory:'OfficialDocs',
    EvidenceStrength:'ExplicitStatement', TargetField:'iof.DiscussionPosts.ParentDiscussionPostKey.RelatedIntegrationObjectID',
    Excerpt:'ParentDiscussionPostKey (guid): Unique Identifier of the Parent Discussion Post. If there is no parent, will return an empty Guid.' },
  { URL:'file://sources/ops/DELETE-api-v2.0-ExternalActivity-Delete_externalActivityKey_legacyActivityKey.html', AccessedAt:new Date().toISOString(),
    UsedFor:'ExternalActivity Delete op = query-param path, no body', SourceTier:2, SourceCategory:'OfficialDocs',
    EvidenceStrength:'ExplicitStatement', TargetField:'io.ExternalActivity.DeleteAPIPath',
    Excerpt:'DELETE api/v2.0/ExternalActivity/Delete?externalActivityKey={externalActivityKey}&legacyActivityKey={legacyActivityKey}. Body Parameters: None.' },
];

w('iof-items.json', iofItems);
w('io-items.json', ioItems);
w('provenance.json', prov);
console.log('wrote', iofItems.length,'iof,', ioItems.length,'io,', prov.length,'prov');

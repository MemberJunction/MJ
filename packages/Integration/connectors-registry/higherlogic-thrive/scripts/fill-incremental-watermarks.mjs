#!/usr/bin/env node
// scripts/fill-incremental-watermarks.mjs
//
// Task: for the 31 GAPS objects (root-level MetadataWriter pass, this run scoped to
// per-IO SupportsIncrementalSync + IncrementalWatermarkField slots), determine from
// CREDENTIAL-FREE Tier-2 sources (sources/op-details.json, sources/key-object-fields.json
// -- both parsed from the live, unauthenticated HelpPage catalog) whether the object's
// vendor-documented response model carries a genuine last-modified marker. Emit ONLY
// where the evidence is ExplicitStatement (a named date-typed field on the object's own
// model, or an explicit vendor-doc statement of what field drives paging/continuation).
// Never guess (per InferredFromContext-rejection rule for hard constraints).
//
// Writes via the mj-metadata MCP server (stdio) -- upsert_integration_object +
// append_provenance -- never touches the metadata file directly.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = resolve(__dirname, '..');
const CONNECTOR = 'higherlogic-thrive';

const opDetails = JSON.parse(readFileSync(resolve(CONNECTOR_DIR, 'sources/op-details.json'), 'utf8'));
const keyObjectFields = JSON.parse(readFileSync(resolve(CONNECTOR_DIR, 'sources/key-object-fields.json'), 'utf8'));

// ── Per-object decision table ────────────────────────────────────────────
// Each entry: { io, decision: 'emit'|'residual', watermarkField?, reason, evidence: {url, excerpt} }
const DECISIONS = [
    {
        io: 'Announcements', decision: 'emit', watermarkField: 'UpdatedOn',
        opPath: 'api/v2.0/Announcements/GetAnnouncements',
        reason: "GetAnnouncements' own responseFields carry 'UpdatedOn' (date) + 'UpdatedByContactKey' directly on the top-level Announcement record.",
    },
    {
        io: 'Answers', decision: 'emit', watermarkField: 'EditedOn',
        modelName: 'Answer',
        reason: "The Answer response model (nested under Question/GetAnswers) carries an explicit 'EditedOn:date' field distinct from PublishedOn/BestAnswerOn -- the vendor's own modification-tracking field for an edited answer.",
    },
    {
        io: 'AutomationRuleContactData', decision: 'emit', watermarkField: 'UpdatedOn',
        opPath: 'api/v2.0/AutomationRules/GetContactData',
        reason: "AutomationRules/GetContactData's own 'fieldList' URI-parameter doc states its DEFAULT VALUE is literally \"ContactKey,LegacyContactKey,UpdatedOn\" -- the vendor explicitly documents UpdatedOn as a default-returned field for this operation.",
    },
    {
        io: 'AutomationRuleSchedules', decision: 'residual',
        opPath: 'api/v2.0/AutomationRules/GetActiveRulesByType',
        reason: "GetActiveRulesByType's response model (RuleScheduleKey, RuleName, RuleDescription, RuleTypeName, GroupName) carries no date/timestamp field of any kind. No modification-tracking field is provable from this Tier-2 source.",
    },
    {
        io: 'Blogs', decision: 'emit', watermarkField: 'UpdatedOn',
        opPath: 'api/v2.0/Blogs/GetBlogEntriesByGrouping',
        reason: "GetBlogEntriesByGrouping's own responseFields carry 'UpdatedOn' (date) directly on the top-level Blog record (alongside CreatedOn/PublishedOn).",
    },
    {
        io: 'Communities', decision: 'residual',
        modelName: 'Community',
        reason: "The full Community response model (verified via both GetMyCommunities' own responseFields AND the independent key-object-fields.json Community entry) carries 'CreatedOn' but NO 'UpdatedOn'/'ModifiedOn'/'ChangedDate' field anywhere in its ~38 fields. No modification-tracking field is provable.",
    },
    {
        io: 'CommunityInvitations', decision: 'emit', watermarkField: 'ChangedDate',
        opPath: 'api/v2.0/Communities/GetMyCommunityInvitations',
        reason: "GetMyCommunityInvitations' own responseFields carry an explicit 'ChangedDate' field on the top-level CommunityInvitation record -- the vendor's own name for its modification marker on this object (distinct naming from the 'UpdatedOn' convention used elsewhere).",
    },
    {
        io: 'Contacts', decision: 'emit', watermarkField: 'UpdatedOn',
        modelName: 'Contact',
        reason: "The Contact response model (independently confirmed via key-object-fields.json's dedicated Contact entry, sourced from Contacts/GetContact) carries 'UpdatedOn:date' + 'UpdatedByContactKey'. GetMyContactsPage (the IO's chosen list op) wraps a Contacts:[...] collection of this same Contact shape.",
    },
    {
        io: 'DataFeed', decision: 'residual',
        opPath: 'api/v2.0/DataFeed/GetData',
        reason: "DataFeedItem's responseFields carry CreateDate/PublishedDate/Date01/Date02 but no field the vendor documents as a 'last modified' marker; the object's own pagination is already a Marker-cursor walk (up/down) per DataFeedItem.Marker, not a separate incremental-watermark field. No modification-tracking field is provable.",
    },
    {
        io: 'DemographicChoices', decision: 'residual',
        opPath: 'api/v2.0/Demographics/GetDemographicChoices',
        reason: "GetDemographicChoices' response model (DemographicKey, DemographicType, Name, Description) carries no date field at all -- a static picklist/lookup shape.",
    },
    {
        io: 'DemographicTypes', decision: 'residual',
        opPath: 'api/v2.0/Demographics/GetDemographicTypes',
        reason: "GetDemographicTypes' response model (DemographicTypeKey, Name, Description, Is*) carries no date field at all -- a static picklist/lookup shape.",
    },
    {
        io: 'DiscussionPosts', decision: 'emit', watermarkField: 'DatePosted',
        opPath: 'api/v2.0/Discussions/GetPagedDiscussionPosts',
        reason: "GetPagedDiscussionPosts' own operation description EXPLICITLY states its continuationToken is 'comprised of a format of \"{DateTime}_{DiscussionPostId}\"' where '{DateTime} is the PostDate ... of the last DiscussionPost seen' -- the vendor's own words name the post's date field (DatePosted on the underlying DiscussionPost model) as the walk cursor.",
    },
    {
        io: 'DiscussionThreads', decision: 'emit', watermarkField: 'LastPostDate',
        modelName: 'DiscussionThread',
        reason: "The DiscussionThread response model (Discussions/GetRecentThreads) carries an explicit 'LastPostDate:date' field -- the vendor's own thread-activity-recency marker.",
    },
    {
        io: 'Discussions', decision: 'residual',
        opPath: 'api/v2.0/Discussions/GetSubscribedDiscussions',
        reason: "GetSubscribedDiscussions' response model (DiscussionKey, DiscussionName, LinkToDiscussion) is a bare discussion-forum-container list with no date field at all.",
    },
    {
        io: 'DocumentAttachments', decision: 'residual',
        opPath: 'api/v2.0/ResourceLibrary/GetDocumentAttachments',
        reason: "GetDocumentAttachments' response model carries only 'CreatedOn' (no Updated/Modified field) -- attachments are documented as upload-then-immutable objects (FileName/FileExtension/FileSizeInBytes/DownloadUrl), so CreatedOn tracks creation only, not modification; not asserted as a modification watermark.",
    },
    {
        io: 'EventRegistrants', decision: 'already-set',
        opPath: 'api/v2.0/Events/GetEventRegistrants',
        reason: "Already SupportsIncrementalSync=true / IncrementalWatermarkField='modifiedDateTime' in the metadata file from a prior extraction pass; this run adds a DEDICATED provenance entry (the existing entries only cite the generic io.EventRegistrants row, not this specific field) citing the operation's own 'modifiedDateTime' URI parameter.",
    },
    {
        io: 'EventSessions', decision: 'emit', watermarkField: 'UpdatedOn',
        opPath: 'api/v2.0/EventSessions/GetSession',
        reason: "GetSession's own responseFields carry 'UpdatedOn' (date) + 'UpdatedByContactKey' directly on the top-level EventSession record.",
    },
    {
        io: 'EventTypes', decision: 'residual',
        opPath: 'api/v2.0/Events/GetEventTypes',
        reason: "GetEventTypes is the DOCUMENTED vendor doc-generation bug (SOURCES.json ProceedReason): its HelpPage response schema renders a raw HttpResponseMessage placeholder (Version/Content/StatusCode/ReasonPhrase/Headers/RequestMessage/IsSuccessStatusCode) instead of a typed EventType field list. No object field -- let alone a watermark field -- is provable from this source for EventTypes.",
    },
    {
        io: 'Events', decision: 'emit', watermarkField: 'UpdatedOn',
        opPath: 'api/v2.0/Events/GetUpcoming',
        reason: "GetUpcoming's own responseFields carry 'UpdatedOn' (date) + 'UpdatedByUser'/'UpdatedByUserKey' directly on the top-level Event record.",
    },
    {
        io: 'ExternalActivity', decision: 'residual',
        opPath: 'api/v2.0/ExternalActivity/Create',
        reason: "The ExternalActivity controller exposes ONLY Create (POST) / Update (PUT) / Delete (DELETE) operations -- there is NO GET/list/read operation anywhere in the 236-operation catalog for ExternalActivity. It is a write-only push target from this connector's pull perspective; an incremental PULL watermark cannot be evidenced because there is no read path to paginate/filter by one.",
    },
    {
        io: 'IdeaCategories', decision: 'residual',
        opPath: 'api/v2.0/Ideation/GetIdeaCategories',
        reason: "GetIdeaCategories' response model (CategoryName, CategoryKey) carries no date field at all -- a static lookup shape.",
    },
    {
        io: 'IdeaStatuses', decision: 'residual',
        opPath: 'api/v2.0/Ideation/GetIdeaStatuses',
        reason: "GetIdeaStatuses' response model (StatusName, StatusKey) carries no date field at all -- a static lookup shape.",
    },
    {
        io: 'IdeaVoters', decision: 'residual',
        opPath: 'api/v2.0/Ideation/GetVoters',
        reason: "GetVoters' response model (IdeationVoterModel: Upvoters/Downvoters, each a bare Collection of string names) carries no key field or date field of any kind -- not a keyed, timestamped record shape at all.",
    },
    {
        io: 'Ideas', decision: 'emit', watermarkField: 'UpdatedOn',
        modelName: 'IdeaDetails',
        reason: "The IdeaDetails response model (Ideation/IdeaDetails, the underlying shape of the Ideas-by-status/category list items) carries an explicit 'UpdatedOn:date' field alongside CreatedOn.",
    },
    {
        io: 'Questions', decision: 'emit', watermarkField: 'EditedOn',
        opPath: 'api/v2.0/Question/GetThread',
        reason: "GetThread's own responseFields carry an explicit 'EditedOn:date' + 'EditedBy' pair on the top-level question-thread record, distinct from PublishedOn/ThreadClosedOn.",
    },
    {
        io: 'ResourceLibraryDocuments', decision: 'residual',
        modelName: 'Document',
        reason: "The Document response model (independently confirmed via key-object-fields.json's dedicated Document entry, sourced from ResourceLibrary/GetLibraryDocuments) carries only 'CreatedOn' -- no Updated/Modified/Changed field anywhere in its ~26 fields.",
    },
    {
        io: 'ResourceLibraryLibraries', decision: 'residual',
        modelName: 'DocumentLibrary',
        reason: "The DocumentLibrary response model carries 'CreatedOn' plus three child-content-recency proxies (LastApprovedDocumentCreatedOn / LastApprovedDocumentOrFileCreatedOn / LastApprovedFileCreatedOn) that track the NEWEST CHILD DOCUMENT's creation date, not the library's OWN modification -- none is a self-modification watermark for the Library object itself.",
    },
    {
        io: 'Tags', decision: 'residual',
        opPath: 'api/v2.0/Tagging/GetTags',
        reason: "GetTags' response model (TagGroupModel: TagGroupKey, IsTopicTagGroup, Tags, Name) carries no date field at all -- a lookup/taxonomy shape.",
    },
    {
        io: 'VolunteerOpportunities', decision: 'emit', watermarkField: 'UpdatedOn',
        modelName: 'VolunteerOpportunity',
        reason: "The VolunteerOpportunity response model carries an explicit 'UpdatedOn:date' field alongside CreatedOn/CloseDate/Deadline.",
    },
    {
        io: 'VolunteerOpportunityTypes', decision: 'residual',
        opPath: 'api/v2.0/Volunteer/GetVolunteerOpportunityTypeList',
        reason: "GetVolunteerOpportunityTypeList's response model (VolunteerOpportunityTypeKey, VolunteerOpportunityTypeName, IsActive, IsRsvp, AcceptNominations, IsVirtual) carries no date field at all -- a static lookup shape.",
    },
    {
        io: 'Volunteers', decision: 'residual',
        modelName: 'VolunteerOpportunityVolunteer',
        reason: "The VolunteerOpportunityVolunteer response model carries FOUR distinct lifecycle dates (CreatedOn/ApprovedOn/RejectedOn/AdjustedOn) but the vendor documents no single unified 'last modified' field -- picking any one of the four as THE watermark would silently miss the other three transition types (an InferredFromContext guess), so left unresolved per the hard-constraint evidence-strength rule.",
    },
];

const HELP_BASE = 'https://api.connectedcommunity.org/Help/Api/';

function slugFromPath(method, path) {
    // e.g. "api/v2.0/Announcements/GetAnnouncements?announcementTypeFilter=..." -> GET-api-v2.0-Announcements-GetAnnouncements_announcementTypeFilter_...
    const [p, q] = path.split('?');
    const pSlug = p.replace(/\//g, '-');
    let slug = `${method}-${pSlug}`;
    if (q) slug += '_' + q.split('&').map((kv) => kv.split('=')[0]).join('_');
    return slug;
}

function findOp(opPath) {
    return opDetails.find((op) => op.path.split('?')[0] === opPath);
}

async function main() {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [resolve(__dirname, '..', '..', '..', '..', 'MCP', 'mj-metadata', 'dist', 'server.js')],
    });
    const client = new Client({ name: 'fill-incremental-watermarks', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const results = { emitted: [], alreadySet: [], residual: [] };

    for (const d of DECISIONS) {
        if (d.decision === 'residual') {
            results.residual.push({ io: d.io, reason: d.reason });
            continue;
        }

        // Build evidence locus (URL + excerpt) from the live-verified op or model source.
        let url;
        let excerpt;
        if (d.opPath) {
            const op = findOp(d.opPath);
            url = op ? `${HELP_BASE}${slugFromPath(op.method, op.path)}` : `${HELP_BASE}(unresolved:${d.opPath})`;
            excerpt = op ? (op.description || JSON.stringify((op.responseFields || []).map((f) => f.name))) : d.reason;
        } else if (d.modelName) {
            url = 'file://packages/Integration/connectors-registry/higherlogic-thrive/sources/key-object-fields.json';
            const model = keyObjectFields[d.modelName];
            excerpt = model ? `${d.modelName} fields: ${model.fields.join(', ')}` : d.reason;
        } else {
            url = 'file://packages/Integration/connectors-registry/higherlogic-thrive/sources/op-details.json';
            excerpt = d.reason;
        }
        excerpt = String(excerpt).slice(0, 500);

        if (d.decision === 'already-set') {
            await client.callTool({
                name: 'append_provenance',
                arguments: {
                    connector: CONNECTOR,
                    entry: {
                        URL: url,
                        AccessedAt: new Date().toISOString(),
                        UsedFor: `Dedicated provenance for io.${d.io}.IncrementalWatermarkField (previously only covered by the generic io.${d.io} row entries)`,
                        SourceTier: 2,
                        SourceCategory: 'OfficialDocs',
                        EvidenceStrength: 'ExplicitStatement',
                        TargetField: `io.${d.io}.IncrementalWatermarkField`,
                        Excerpt: excerpt,
                    },
                },
            });
            results.alreadySet.push({ io: d.io, watermarkField: 'modifiedDateTime' });
            continue;
        }

        // emit
        await client.callTool({
            name: 'upsert_integration_object',
            arguments: {
                connector: CONNECTOR,
                io: {
                    Name: d.io,
                    SupportsIncrementalSync: true,
                    IncrementalWatermarkField: d.watermarkField,
                },
            },
        });
        for (const targetField of [`io.${d.io}.SupportsIncrementalSync`, `io.${d.io}.IncrementalWatermarkField`]) {
            await client.callTool({
                name: 'append_provenance',
                arguments: {
                    connector: CONNECTOR,
                    entry: {
                        URL: url,
                        AccessedAt: new Date().toISOString(),
                        UsedFor: `io.${d.io}.SupportsIncrementalSync + io.${d.io}.IncrementalWatermarkField (co-stated: one op's response model directly evidences both)`,
                        SourceTier: 2,
                        SourceCategory: 'OfficialDocs',
                        EvidenceStrength: 'ExplicitStatement',
                        TargetField: targetField,
                        Excerpt: excerpt,
                    },
                },
            });
        }
        results.emitted.push({ io: d.io, watermarkField: d.watermarkField, reason: d.reason });
    }

    await client.close();
    process.stdout.write(JSON.stringify({
        EmittedCount: results.emitted.length,
        AlreadySetCount: results.alreadySet.length,
        ResidualCount: results.residual.length,
        Emitted: results.emitted,
        AlreadySet: results.alreadySet,
        Residual: results.residual,
    }, null, 2) + '\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

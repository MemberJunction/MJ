#!/usr/bin/env node
// Classifies every enumerated ResourceModel type (E, from extract-op-details.mjs's
// topLevelModels + nestedOnlyModels union) into exactly one bucket:
//   COVERABLE          -> becomes a TaxonomyLeaves entry (a syncable record stream)
//   INFORMATIONAL       -> vendor mechanics / envelopes / action-results / settings
//   EXCLUDED_SCAFFOLDING -> ASP.NET Web API doc-generation noise, not vendor business schema
//   OUT_OF_SCOPE_FAMILY  -> genuine business type but belongs to a family ruled out of scope
//   CONTAINER_FOLDED     -> genuine variant/echo of an already-COVERABLE leaf (not double-counted)
//
// The classification mapping below is the auditable ledger. This script ASSERTS that
// every model in E is accounted for exactly once, and that
//   |E| == |COVERABLE| + |INFORMATIONAL| + |EXCLUDED_SCAFFOLDING| + |OUT_OF_SCOPE_FAMILY| + |CONTAINER_FOLDED|
// -- the mechanical closure the SourceAuditor ledger requires. Run:
//   node classify-catalog.mjs op-details.summary.json

import fs from 'node:fs';

const summaryPath = process.argv[2] || 'op-details.summary.json';
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const E = [...new Set([...summary.topLevelModels, ...summary.nestedOnlyModels])].sort();

// bucket: 'COVERABLE' | 'INFORMATIONAL' | 'EXCLUDED_SCAFFOLDING' | 'OUT_OF_SCOPE_FAMILY' | 'CONTAINER_FOLDED'
// leaf: the TaxonomyLeaves name this model maps to (COVERABLE) or folds into (CONTAINER_FOLDED)
const classification = {
    // ---- COVERABLE (35 leaves) ----
    Contact: { bucket: 'COVERABLE', leaf: 'Contacts', evidence: 'GET Contacts/GetContact, GetMyContactsPage (Cursor), SearchContacts' },
    PaginatedContacts: { bucket: 'CONTAINER_FOLDED', leaf: 'Contacts', evidence: 'envelope wrapper for GetMyContactsPage (Cursor: afterContactKey/beforeContactKey+limit)' },
    Community: { bucket: 'COVERABLE', leaf: 'Communities', evidence: 'GET Communities/Get, GetMyCommunities, GetViewableCommunities' },
    ViewableCommunity: { bucket: 'CONTAINER_FOLDED', leaf: 'Communities', evidence: 'GetViewableCommunities variant shape of Community' },
    CommunityMember: { bucket: 'COVERABLE', leaf: 'CommunityMembers', evidence: 'POST Communities/GetCommunityMembers (Offset: StartRecord/EndRecord)' },
    ContactCommunityUpdate: { bucket: 'CONTAINER_FOLDED', leaf: 'CommunityMembers', evidence: 'POST System/GetCommunityMemberUpdates incremental delta (StartDate/EndDate window)' },
    CommunityAddition: { bucket: 'INFORMATIONAL', evidence: 'nested child of ContactCommunityUpdate delta envelope' },
    CommunityRemoval: { bucket: 'INFORMATIONAL', evidence: 'nested child of ContactCommunityUpdate delta envelope' },
    CommunityInvitation: { bucket: 'COVERABLE', leaf: 'CommunityInvitations', evidence: 'GET Communities/GetMyCommunityInvitations -- ADDED beyond base candidate list (dedicated GET + own resource model)' },
    Discussion: { bucket: 'COVERABLE', leaf: 'Discussions', evidence: 'GET Discussions/GetDiscussion, GetSubscribedDiscussions, GetEligibleDiscussions' },
    DiscussionThread: { bucket: 'COVERABLE', leaf: 'DiscussionThreads', evidence: 'GET Discussions/GetRecentThreads -- ADDED beyond base candidate list (a genuine 3rd tier: Discussion forum > DiscussionThread > DiscussionPost)' },
    DiscussionThreadDetails: { bucket: 'INFORMATIONAL', evidence: 'nested detail shape referenced within thread-update responses' },
    DiscussionThreadResponse: { bucket: 'INFORMATIONAL', evidence: 'POST GetDiscussionThreadUpdates batch-check result, action-shaped not a list' },
    DiscussionPost: { bucket: 'COVERABLE', leaf: 'DiscussionPosts', evidence: 'GET Discussions/GetDiscussionPost, GetDiscussionPosts, GetLatestDiscussionPosts' },
    DiscussionPostPage: { bucket: 'CONTAINER_FOLDED', leaf: 'DiscussionPosts', evidence: 'envelope wrapper for GetPagedDiscussionPosts (Cursor: continuationToken+maxRecords)' },
    DiscussionPostInContext: { bucket: 'CONTAINER_FOLDED', leaf: 'DiscussionPosts', evidence: 'GetDiscussionPostInThread breadcrumb-context variant' },
    DiscussionPostAncestry: { bucket: 'INFORMATIONAL', evidence: 'nested breadcrumb/ancestry chain within DiscussionPostInContext' },
    DiscussionPostExtended: { bucket: 'CONTAINER_FOLDED', leaf: 'DiscussionPosts', evidence: 'GetDiscussionPostReplies reply-list variant' },
    SubscribedDiscussionPost: { bucket: 'CONTAINER_FOLDED', leaf: 'DiscussionPosts', evidence: 'POST GetDiscussionPosts body-filtered variant' },
    Comment: { bucket: 'COVERABLE', leaf: ['Comments', 'BlogComments'], evidence: 'GET Comments/Get?itemKey={itemKey} (generic, any parent -- blogs, library documents), GetComments (Cursor: afterCommentKey/beforeCommentKey+limit, cross-item). BlogComments = the SAME Comment model + endpoint scoped to itemKey={blogKey} (Blogs/AddComment writes into this scope); documented as a distinct leaf per task instruction because its parent FK is Blogs, not a generic Item.' },
    PaginatedComments: { bucket: 'CONTAINER_FOLDED', leaf: 'Comments', evidence: 'envelope wrapper {Comments[],HasMoreComments,Next,Previous} for GetComments' },
    Blog: { bucket: 'COVERABLE', leaf: 'Blogs', evidence: 'GET Blogs/GetBlog, GetBlogsByContactKey, GetLatestEntries, GetBlogEntriesByGrouping' },
    BlogRating: { bucket: 'INFORMATIONAL', evidence: 'POST RecommendBlog toggle-state action-result, not a list' },
    RelatedLink: { bucket: 'INFORMATIONAL', evidence: 'write-only echo for AddRelatedLink (Blogs+ResourceLibrary); no GET/list endpoint exists' },
    // BlogComments (task-requested distinct leaf) reuses the generic Comment resource model,
    // accessed via Comments/Get?itemKey={blogKey} -- documented as an access-path variant of Comments.
    Question: { bucket: 'CONTAINER_FOLDED', leaf: 'Questions', evidence: 'write/echo model for Question/Post, Edit, Recommend, Follow -- no GET returns bare Question' },
    QuestionThread: { bucket: 'COVERABLE', leaf: 'Questions', evidence: 'GET Question/GetThread -- the ONLY read path for a question (bundles Question+Answers); no bulk GetQuestions list exists (GAP)' },
    Answer: { bucket: 'COVERABLE', leaf: 'Answers', evidence: 'GET Answer/Get, Question/GetAnswers (Cursor: afterAnswerKey/beforeAnswerKey+limit)' },
    PaginatedAnswers: { bucket: 'CONTAINER_FOLDED', leaf: 'Answers', evidence: 'envelope wrapper for GetAnswers / nested within QuestionThread.AnswerContainer' },
    PaginatedReplies: { bucket: 'CONTAINER_FOLDED', leaf: 'DiscussionPosts', evidence: 'envelope wrapper for GetDiscussionPostReplies (Cursor: afterReplyDiscussionPostKey/beforeReplyDiscussionPostKey+limit)' },
    Event: { bucket: 'COVERABLE', leaf: 'Events', evidence: 'GET Events/GetUpcoming, POST SearchEvents/SearchCurrentAndFutureEvents (76-field model; GetEvent-by-key has a vendor doc bug returning HttpResponseMessage placeholder)' },
    EventOption: { bucket: 'INFORMATIONAL', evidence: 'nested registration-option sub-object of Event' },
    EventPresenter: { bucket: 'INFORMATIONAL', evidence: 'nested presenter sub-object of EventSession' },
    EventRegistrant: { bucket: 'CONTAINER_FOLDED', leaf: 'EventRegistrants', evidence: 'legacy narrow shape (GetRegistrantDetails, GetRegistrantsByCalendarEvent, RSVPToEvent echo)' },
    EventRegistrantConcise: { bucket: 'COVERABLE', leaf: 'EventRegistrants', evidence: 'GET Events/GetEventRegistrants (Cursor: continuationToken+maxRecords; IncrementalWatermarkField=modifiedDateTime)' },
    EventType: { bucket: 'COVERABLE', leaf: 'EventTypes', evidence: 'GET Events/GetEventTypes, GetEventTypesList -- FIELD GAP: vendor doc bug, all ops return HttpResponseMessage placeholder, zero fields documented' },
    EventSession: { bucket: 'COVERABLE', leaf: 'EventSessions', evidence: 'GET EventSessions/GetSession (34 fields, well documented)' },
    ExternalActivity: { bucket: 'COVERABLE', leaf: 'ExternalActivity', evidence: 'POST/PUT/DELETE ExternalActivity Create/Update/Delete -- WRITE-ONLY stream, no GET/list exists' },
    ItemRating: { bucket: 'INFORMATIONAL', evidence: 'POST RecommendDiscussionPost toggle-state action-result' },
    DocumentRating: { bucket: 'INFORMATIONAL', evidence: 'POST RecommendDocument toggle-state action-result' },
    DocumentFavorite: { bucket: 'INFORMATIONAL', evidence: 'POST AddToFavorites write-echo; GetFavorites itself returns Collection of Document (folds into ResourceLibraryDocuments), not DocumentFavorite' },
    DocumentLibrary: { bucket: 'COVERABLE', leaf: 'ResourceLibraryLibraries', evidence: 'GET ResourceLibrary/GetLibraryList (primary, richer 19-field shape)' },
    Library: { bucket: 'CONTAINER_FOLDED', leaf: 'ResourceLibraryLibraries', evidence: 'GET ResourceLibrary/GetLibraries -- legacy/alt duplicate list op, thinner shape (source idiosyncrasy: two library-list endpoints)' },
    ModerationTypeRef: { bucket: 'INFORMATIONAL', evidence: 'nested moderation-type enum-ref on DocumentLibrary' },
    Document: { bucket: 'COVERABLE', leaf: 'ResourceLibraryDocuments', evidence: 'POST GetLibraryDocuments, GET GetLibraryDocument, GetMyLibraryDocuments, GetFavorites' },
    DocumentAttachment: { bucket: 'COVERABLE', leaf: 'DocumentAttachments', evidence: 'GET ResourceLibrary/GetDocumentAttachments, GetDocumentAttachment' },
    InitiateDirectUploadResponse: { bucket: 'INFORMATIONAL', evidence: 'multipart-upload state-machine plumbing (InitiateUpload), not a record' },
    MultipartInitiatedUpload: { bucket: 'INFORMATIONAL', evidence: 'nested multipart-upload session state' },
    DemographicType: { bucket: 'COVERABLE', leaf: 'DemographicTypes', evidence: 'GET Demographics/GetDemographicTypes' },
    DemographicChoice: { bucket: 'COVERABLE', leaf: 'DemographicChoices', evidence: 'GET Demographics/GetDemographicChoices (x2 overloads)' },
    Demographic: { bucket: 'INFORMATIONAL', evidence: 'nested per-contact demographic value embedded in Contact.Demographics; no standalone bulk list endpoint' },
    FreeFormDemographic: { bucket: 'CONTAINER_FOLDED', leaf: 'DemographicTypes', evidence: 'free-form (open-text) variant surfaced via GetDemographicsVisibleOnMainMicrositeProfile' },
    ContactDemographic: { bucket: 'INFORMATIONAL', evidence: 'write-echo for POST SetContactDemographic; no bulk GET' },
    Announcement: { bucket: 'COVERABLE', leaf: 'Announcements', evidence: 'GET Announcements/GetAnnouncements, GetAnnouncement' },
    IdeaDetails: { bucket: 'COVERABLE', leaf: 'Ideas', evidence: 'GET Ideation/IdeaDetails, GetIdeasByStatus/GetIdeasByCategory (Cursor: afterIdeaKey/beforeIdeaKey+numberToReturn via PagedIdeaList)' },
    PagedIdeaList: { bucket: 'CONTAINER_FOLDED', leaf: 'Ideas', evidence: 'envelope wrapper for GetIdeasByStatus/GetIdeasByCategory' },
    IdeaAttachment: { bucket: 'INFORMATIONAL', evidence: 'nested attachment sub-object of IdeaDetails' },
    IdeaCategory: { bucket: 'COVERABLE', leaf: 'IdeaCategories', evidence: 'GET Ideation/GetIdeaCategories -- ADDED beyond base list (parallel to DemographicTypes/Choices pattern)' },
    IdeaStatus: { bucket: 'COVERABLE', leaf: 'IdeaStatuses', evidence: 'GET Ideation/GetIdeaStatuses -- ADDED beyond base list' },
    IdeationVoterModel: { bucket: 'COVERABLE', leaf: 'IdeaVoters', evidence: 'GET Ideation/GetVoters -- ADDED beyond base list (per-idea voter/contact join, analogous to EventRegistrants)' },
    VolunteerOpportunity: { bucket: 'COVERABLE', leaf: 'VolunteerOpportunities', evidence: 'GET Volunteer/GetVolunteerOpportunityList, GetUpcomingVolunteerOpportunities' },
    VolunteerOpportunityType: { bucket: 'COVERABLE', leaf: 'VolunteerOpportunityTypes', evidence: 'GET Volunteer/GetVolunteerOpportunityTypeList -- ADDED beyond base list' },
    VolunteerOpportunityTravel: { bucket: 'INFORMATIONAL', evidence: 'nested travel-requirement sub-object of VolunteerOpportunity' },
    VolunteerOpportunityVolunteer: { bucket: 'COVERABLE', leaf: 'Volunteers', evidence: 'GET Volunteer/GetVolunteerList (per-opportunity scoped)' },
    Volunteer: { bucket: 'CONTAINER_FOLDED', leaf: 'Volunteers', evidence: 'write-echo for AddToPoolByContactKey/AddToPoolByLegacyKey general-pool sign-up; no GET returns bare Volunteer' },
    VolunteerRole: { bucket: 'INFORMATIONAL', evidence: 'nested role-ref on VolunteerOpportunityVolunteer' },
    VolunteerApplicationStatuses: { bucket: 'INFORMATIONAL', evidence: 'nested status-ref on VolunteerOpportunity' },
    VolunteerExperienceLevel: { bucket: 'INFORMATIONAL', evidence: 'nested experience-level ref (no dedicated GET list found)' },
    TagGroupModel: { bucket: 'COVERABLE', leaf: 'Tags', evidence: 'GET Tagging/GetTags' },
    TagDataModel: { bucket: 'INFORMATIONAL', evidence: 'nested individual tag within TagGroupModel.Tags' },
    ItemTagResponse: { bucket: 'CONTAINER_FOLDED', leaf: 'Tags', evidence: 'GET Discussions/GetThreadTags item-scoped tag application (access-path variant of Tags)' },
    TopicTagGroup: { bucket: 'INFORMATIONAL', evidence: 'nested topic-tag-group ref on Community' },
    RuleSchedule: { bucket: 'COVERABLE', leaf: 'AutomationRuleSchedules', evidence: 'GET AutomationRules/GetActiveRulesByType -- the configured-rule catalog (parent of AutomationRuleContactData)' },
    ContactDataPage: { bucket: 'COVERABLE', leaf: 'AutomationRuleContactData', evidence: 'GET AutomationRules/GetContactData (Cursor: continuationToken+maxRecords, cursor=last row ContactKey; selective fieldList)' },
    AutomationRuleDataSubset: { bucket: 'CONTAINER_FOLDED', leaf: 'AutomationRuleContactData', evidence: 'GetContactDataSubsetByRuleScheduleKey subset-of-fields variant' },
    AvailableFields: { bucket: 'INFORMATIONAL', evidence: 'GetContactDataFields schema-introspection metadata (field catalog), not a record set itself' },
    DataFeedItem: { bucket: 'COVERABLE', leaf: 'DataFeed', evidence: 'POST DataFeed/GetData (generic content feed); also GetContactContributions/GetMyContributions (contact-scoped access-path variant)' },
    DataFeedAttachmentsContainer: { bucket: 'INFORMATIONAL', evidence: 'nested attachments container within DataFeedItem' },
    DataFeedContributor: { bucket: 'INFORMATIONAL', evidence: 'nested contributor sub-object within DataFeedItem' },
    DataFeedParentContainer: { bucket: 'INFORMATIONAL', evidence: 'nested parent-item container within DataFeedItem' },

    // ---- INFORMATIONAL (mechanics, envelopes, settings, action-results, search-helpers) ----
    Address: { bucket: 'INFORMATIONAL', evidence: 'nested address sub-object of Contact' },
    Education: { bucket: 'INFORMATIONAL', evidence: 'nested education-history sub-object of Contact' },
    WorkExperience: { bucket: 'INFORMATIONAL', evidence: 'nested job-history sub-object of Contact' },
    Profile: { bucket: 'INFORMATIONAL', evidence: 'nested profile-config sub-object of Contact' },
    SecurityGroupConcise: { bucket: 'INFORMATIONAL', evidence: 'nested security-group ref on Contact/CommunityMember (no independent list endpoint)' },
    CommunityStatistics: { bucket: 'INFORMATIONAL', evidence: 'nested statistics block on Community' },
    ContactConcise: { bucket: 'INFORMATIONAL', evidence: 'universal lightweight "referenced contact" embed used across Blogs/Discussions/Events/Ideas/Questions/Answers; its only standalone op (Federation/GetContact) is an out-of-scope family' },
    ContactMentionSearchResult: { bucket: 'INFORMATIONAL', evidence: 'POST SearchContactsForMentions @mention-autocomplete helper, narrow UI-support search, not a general sync source (Contacts already covered)' },
    EmailPreference: { bucket: 'INFORMATIONAL', evidence: 'GET GetMyEmailPreferences -- current-authenticated-user only, no bulk-by-contact GET exists' },
    EmailPreferenceByContact: { bucket: 'INFORMATIONAL', evidence: 'nested per-contact preference row within bulk UpdateEmailPreferences request/response' },
    EmailPreferenceByContactUpdateFailure: { bucket: 'INFORMATIONAL', evidence: 'nested failure-detail row within EmailPreferenceUpdateByContactResponse' },
    EmailPreferenceUpdateFailure: { bucket: 'INFORMATIONAL', evidence: 'nested failure-detail row within EmailPreferenceUpdateResponse' },
    EmailPreferenceUpdateByContactResponse: { bucket: 'INFORMATIONAL', evidence: 'POST UpdateEmailPreferences write-result wrapper' },
    EmailPreferenceUpdateResponse: { bucket: 'INFORMATIONAL', evidence: 'POST UpdateMyEmailPreferences write-result wrapper' },
    AuthToken: { bucket: 'INFORMATIONAL', evidence: 'POST Authentication/Login RPC action result -- not an object per the anti-RPC rule' },
    TenantDetail: { bucket: 'INFORMATIONAL', evidence: 'GET Authentication/GetTenantDetail RPC action result -- tenant/base-URL lookup, not a record stream' },
    TenantInfo: { bucket: 'INFORMATIONAL', evidence: 'POST Authentication/Widget RPC action result' },
    CodeOfConduct: { bucket: 'INFORMATIONAL', evidence: 'GET System/GetCodeOfConduct -- single tenant-wide document, not a record set' },
    ProfileSectionUrlModel: { bucket: 'INFORMATIONAL', evidence: 'GET System/GetProfileUrls -- tenant-level URL-template config' },
    MobileAppSettingsModel: { bucket: 'INFORMATIONAL', evidence: 'GET System/GetMobileAppSettings -- tenant-level config' },
    TimeZoneRef: { bucket: 'INFORMATIONAL', evidence: 'nested timezone-ref on Event; no dedicated GetTimeZones endpoint' },
    CurrencyType: { bucket: 'INFORMATIONAL', evidence: 'nested currency-ref on Event; no dedicated GetCurrencyTypes endpoint' },
    MessageClass: { bucket: 'INFORMATIONAL', evidence: 'nested email-preference class-ref' },
    MessageStatus: { bucket: 'INFORMATIONAL', evidence: 'nested moderation-status enum-ref on DiscussionPost' },
    ItemError: { bucket: 'INFORMATIONAL', evidence: 'nested per-item error row within AddItemsResponse (ExternalSearch, out-of-scope family)' },
    AddItemsResponse: { bucket: 'OUT_OF_SCOPE_FAMILY', family: 'ExternalSearch (add-on, separate IAMKey)', evidence: 'POST ExternalSearch/Add*Items write-result wrapper -- ExternalSearch is an explicitly out-of-scope family (see outOfScopeFamilies)' },
    Status: { bucket: 'INFORMATIONAL', evidence: 'generic write-result status wrapper for Volunteer opportunity-signup actions' },

    // ---- EXCLUDED_SCAFFOLDING (ASP.NET Web API doc-generation noise, not vendor business schema) ----
    Controller: { bucket: 'EXCLUDED_SCAFFOLDING', evidence: 'leaks into System/GetApiDetails page -- .NET reflection/introspection artifact, not a Higher Logic business object' },
    Endpoint: { bucket: 'EXCLUDED_SCAFFOLDING', evidence: 'leaks into System/GetApiDetails page -- same framework-introspection artifact' },
    HttpContent: { bucket: 'EXCLUDED_SCAFFOLDING', evidence: 'leaks into the vendor doc-generation bug affecting GetEvent/GetEventType(s)/RegistrantClass pages' },
    HttpRequestMessage: { bucket: 'EXCLUDED_SCAFFOLDING', evidence: 'same vendor doc-generation bug' },
    HttpResponseMessage: { bucket: 'EXCLUDED_SCAFFOLDING', evidence: 'same vendor doc-generation bug -- several ops literally document the raw ASP.NET HttpResponseMessage envelope instead of the typed model (FIELD-LEVEL GAP for EventType/RegistrantClass)' },
    HttpStatusCode: { bucket: 'EXCLUDED_SCAFFOLDING', evidence: 'same vendor doc-generation bug' },
    Version: { bucket: 'EXCLUDED_SCAFFOLDING', evidence: 'same vendor doc-generation bug (.NET AssemblyVersion type)' },

    // ---- OUT_OF_SCOPE_FAMILY (genuine business types, ruled out per scopeDecision) ----
    Friend: { bucket: 'OUT_OF_SCOPE_FAMILY', family: 'Friends (social graph)', evidence: 'GET Friends/GetPendingReceivedFriendRequests etc. -- member-to-member social connections, not an AMS/CRM sync target' },
    MailboxMessage: { bucket: 'OUT_OF_SCOPE_FAMILY', family: 'Messaging (private inbox)', evidence: 'GET Messaging/GetInboxMessages, GetSentMessages -- private user-to-user messages (Offset: firstRecord+maxRecords)' },
    MarkMessageAsReadResponse: { bucket: 'OUT_OF_SCOPE_FAMILY', family: 'Messaging (private inbox)', evidence: 'POST MarkMessagesAsRead write-result within the Messaging family' },
};

const buckets = { COVERABLE: [], INFORMATIONAL: [], EXCLUDED_SCAFFOLDING: [], OUT_OF_SCOPE_FAMILY: [], CONTAINER_FOLDED: [] };
const unclassified = [];
for (const model of E) {
    const c = classification[model];
    if (!c) { unclassified.push(model); continue; }
    buckets[c.bucket].push({ model, ...c });
}

const taxonomyLeaves = [...new Set(buckets.COVERABLE.flatMap((x) => (Array.isArray(x.leaf) ? x.leaf : [x.leaf])))].sort();

const report = {
    enumeratedUniverseCount: E.length,
    coverableModelCount: buckets.COVERABLE.length,
    taxonomyLeavesCount: taxonomyLeaves.length,
    taxonomyLeaves,
    informationalCount: buckets.INFORMATIONAL.length,
    excludedScaffoldingCount: buckets.EXCLUDED_SCAFFOLDING.length,
    outOfScopeFamilyCount: buckets.OUT_OF_SCOPE_FAMILY.length,
    containerFoldedCount: buckets.CONTAINER_FOLDED.length,
    unclassifiedCount: unclassified.length,
    unclassified,
    closureCheck:
        buckets.COVERABLE.length +
            buckets.INFORMATIONAL.length +
            buckets.EXCLUDED_SCAFFOLDING.length +
            buckets.OUT_OF_SCOPE_FAMILY.length +
            buckets.CONTAINER_FOLDED.length +
            unclassified.length ===
        E.length,
    buckets,
};

fs.writeFileSync('catalog-classification.json', JSON.stringify(report, null, 2));

if (unclassified.length > 0) {
    console.error('FAIL: unclassified models remain:', unclassified);
    process.exit(1);
}
if (!report.closureCheck) {
    console.error('FAIL: closure check did not balance');
    process.exit(1);
}

console.log(
    JSON.stringify(
        {
            enumeratedUniverseCount: report.enumeratedUniverseCount,
            coverableModelCount: report.coverableModelCount,
            taxonomyLeavesCount: report.taxonomyLeavesCount,
            informationalCount: report.informationalCount,
            excludedScaffoldingCount: report.excludedScaffoldingCount,
            outOfScopeFamilyCount: report.outOfScopeFamilyCount,
            containerFoldedCount: report.containerFoldedCount,
            closureCheck: report.closureCheck,
        },
        null,
        2
    )
);
console.log('\nTaxonomyLeaves:\n' + taxonomyLeaves.map((l) => '  - ' + l).join('\n'));

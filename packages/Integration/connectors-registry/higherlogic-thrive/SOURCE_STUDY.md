# Source Study — Higher Logic Thrive Community

Vendor: **Higher Logic Thrive Community** (community platform product; distinct from Higher Logic
Vanilla and Higher Logic Thrive Marketing — see Product Boundary below).

Generated: 2026-07-08

## 0. Method (how this study was produced, in code)

1. Discovered the public Community API v2.0 HelpPage at `https://api.connectedcommunity.org/v2.0/Help`
   via `WebSearch`, confirmed reachable with `curl` (HTTP 200), saved the raw index HTML whole to
   `sources/helppage.index.html`.
2. Wrote `scripts/enumerate-helppage.mjs` — parses the saved index HTML's 25 `<h2 id="Controller">` +
   `<table class="help-page-table">` blocks into a structured operation catalog. Output:
   `sources/helppage.catalog.json` / `sources/helppage.catalog.summary.json`.
   **Script output: 25 controllers, 236 operations** (cross-checks the task's "~26 controllers, ~200
   operations" estimate — close, and the exact count is now a number a script printed).
3. Fetched all 236 per-operation sub-pages raw (`scripts/fetch-ops.mjs`, concurrency-8 fetch pool) into
   `sources/ops/*.html` (7.9MB). 235/236 succeeded; one (`Discussions/GetLatestTopics`) returns a
   persistent vendor-side HTTP 500 on repeated retry — a vendor doc-page bug, not an access block
   (the same discussion-topic data is reachable via `GetRecentThreads`/`GetSubscribedDiscussions`).
4. Wrote `scripts/extract-op-details.mjs` — parses every saved op page for URI params, body-model
   refs, the **top-level ResourceModel** the operation returns (the `<a href="/Help/ResourceModel?
   modelName=X">` link immediately preceding the Resource Description table), the **nested field-type
   refs** inside that table (sub-object/FK-shaped fields), the full field list, and the sample JSON.
   Output: `sources/op-details.json` (883KB) / `sources/op-details.summary.json`.
   **Script output: 116 distinct ResourceModel types** — 75 as some operation's top-level response,
   41 appearing only as nested field types. This 116 is the enumerated universe **E**.
5. Wrote `scripts/classify-catalog.mjs` — a ledger that classifies every one of the 116 enumerated
   models into exactly one bucket (`COVERABLE` / `INFORMATIONAL` / `EXCLUDED_SCAFFOLDING` /
   `OUT_OF_SCOPE_FAMILY` / `CONTAINER_FOLDED`) with cited evidence, and **asserts closure**:
   `|E| == |COVERABLE| + |INFORMATIONAL| + |EXCLUDED_SCAFFOLDING| + |OUT_OF_SCOPE_FAMILY| + |CONTAINER_FOLDED|`.
   Script exits non-zero if any model is unclassified or the sum doesn't balance. Output:
   `sources/catalog-classification.json`.

**Script-asserted ledger (the accounting the mechanical-universe-anchor rule requires):**

| Bucket | Count | Meaning |
|---|---:|---|
| Enumerated universe `E` | **116** | every distinct ResourceModel the HelpPage's 235 fetched op pages reference (top-level or nested) |
| COVERABLE | **33** | models that are (or are the closest documented shape for) an independently-listable record stream |
| → TaxonomyLeaves | **34** | leaf names (33 coverable models map to 34 leaves — the `Comment` model powers both `Comments` and `BlogComments` via different `itemKey` scoping) |
| INFORMATIONAL | **54** | nested sub-objects, action-result wrappers, settings/config singletons, search-helpers |
| EXCLUDED_SCAFFOLDING | **7** | `Controller`, `Endpoint`, `HttpContent`, `HttpRequestMessage`, `HttpResponseMessage`, `HttpStatusCode`, `Version` — ASP.NET Web API doc-generation noise, not Higher Logic business schema |
| OUT_OF_SCOPE_FAMILY | **4** | `Friend`, `MailboxMessage`, `MarkMessageAsReadResponse`, `AddItemsResponse` — genuine business types belonging to ruled-out families (Friends, Messaging, ExternalSearch) |
| CONTAINER_FOLDED | **18** | genuine variants/echoes/envelopes of an already-COVERABLE leaf (not double-counted) |
| **Closure check** | **116 = 33+54+7+4+18** | **TRUE** (script-asserted, `catalog-classification.json.closureCheck`) |

Full per-model ledger (all 116, each with its bucket + one-line evidence) is in
`sources/catalog-classification.json`. The 6 leaves added **beyond** the task's 26-name candidate list
(per "no artificial object ceiling") are: `CommunityInvitations`, `DiscussionThreads`, `IdeaCategories`,
`IdeaStatuses`, `IdeaVoters`, `VolunteerOpportunityTypes` — each backed by its own dedicated GET endpoint
+ distinct ResourceModel, evidenced in the ledger. `AutomationRules` (a single name in the task's prompt)
resolved to **two** leaves once evidence was examined — `AutomationRuleSchedules` (the catalog of
configured rules) and `AutomationRuleContactData` (the actual paginated contact-row reads for a given
rule) — a parent/child pair, not a single flat object.

---

## 1. Source: Community API v2.0 HelpPage (Tier 2, `OfficialDocs`, primary)

**URLs**: `https://api.connectedcommunity.org/v2.0/Help` (index) + 236 per-operation sub-pages under
`/Help/Api/<slug>`. Mirrored at `https://api.higherlogic.com/v2.0/Help`.

### Structure

- One `<h2 id="{ControllerName}">` per controller, optionally followed by a `<p>` controller-level
  description paragraph, followed by a `<table class="help-page-table">` listing every operation in
  that controller as `<a href="/Help/Api/{METHOD}-api-v2.0-{Controller}-{Operation}_{params}">{METHOD}
  api/v2.0/{Controller}/{Operation}?{querystring}</a>` + a one-paragraph description.
- Each per-operation sub-page has a **fixed 4-section layout**: `URI Parameters` (name/description/
  type/required-or-default table) → `Body Parameters` (request model name + field table + a
  request-body sample in JSON and XML) → `Resource Description` (the **top-level response
  ResourceModel name**, linked to `/Help/ResourceModel?modelName=X`, immediately followed by a field
  table — field rows themselves link to nested ResourceModel names for complex/collection fields) →
  `Response Formats` (a `<pre class="wrapped">` sample JSON block, plus XML).
- There is **no single index of all ResourceModel names** — `/Help/ResourceModel` (no query) returns a
  241-byte stub. The only way to discover the full model universe is to walk every operation page and
  collect the `ResourceModel?modelName=` links it emits — exactly what `extract-op-details.mjs` does.

### Patterns and motifs

1. **Three distinct Cursor pagination sub-families**, all script-confirmed from real URI param tables:
   - **Seek-key** (`afterXKey`/`beforeXKey`+`limit`) — wraps the response in a consistent envelope
     `{ <PluralName>: [...], HasMore<Something>: bool, Next: string, Previous: string }`. Seen on
     `Contacts/GetMyContactsPage` (`PaginatedContacts`), `Comments/GetComments` (`PaginatedComments`),
     `Question/GetAnswers` (`PaginatedAnswers`), `Discussions/GetDiscussionPostReplies`
     (`PaginatedReplies`), `Ideation/GetIdeasByStatus`/`GetIdeasByCategory` (`PagedIdeaList`).
   - **Continuation-token** (`continuationToken`+`maxRecords`, optional `fieldList`) — returns either a
     bare array (`Events/GetEventRegistrants` → `EventRegistrantConcise[]`) or a
     `{ RecordCount: int, <Plural>Data: [...] }` wrapper (`Discussions/GetPagedDiscussionPosts` →
     `DiscussionPostPage`; `AutomationRules/GetContactData` → `ContactDataPage`). **Idiosyncrasy**:
     neither shape echoes a `NextContinuationToken` field in the documented response — the *client*
     must derive the next call's `continuationToken` from the last returned row's own key field (e.g.
     the last row's `DiscussionPostKey` / `ContactKey`), confirmed by the default `fieldList` values
     (`DiscussionPostKey,DiscussionPostId,DiscussionName,DatePosted` / `ContactKey,LegacyContactKey,
     UpdatedOn`) always putting the key field first.
   - **Marker+Direction** (`Marker`+`Direction` ∈ `{up,down}`+`NumberToReturn`) — seen only on
     `DataFeed/GetData`. Each returned `DataFeedItem` carries its own `Marker` field, confirming the
     same client-derived-cursor idiom as the continuation-token family, generalized to a bidirectional
     walk.
   - **Offset** (`StartRecord`/`EndRecord` on `Communities/GetCommunityMembers`; `firstRecord`/
     `maxRecords` on the out-of-scope `Messaging/GetInboxMessages`) — classic numeric offset, no cursor.
   - **None** — the majority of list endpoints (`GetViewableCommunities`, `GetDemographicTypes`,
     `GetVolunteerOpportunityList`, etc.) take no paging params at all and return the full set, or a
     `maxRecords`/`maxResults`/`numberToReturn` **cap** with no continuation mechanism (a real
     completeness gap for large tenants — see Gaps).
2. **`{Contact/Community/etc}Concise` naming convention** — the vendor consistently ships a lightweight
   "referenced-entity" shape (`ContactConcise`, `EventRegistrantConcise`) alongside the full shape, used
   when the object is embedded as an author/creator/registrant reference inside another object rather
   than being the primary subject of the response.
3. **`*Key` GUID-typed identifiers everywhere; legacy string-typed siblings for AMS-bridged identity** —
   almost every object's PK is a `globally unique identifier`-typed `<Object>Key` field, paired with an
   optional `Legacy<Object>Key` (string) used to bridge to the customer's AMS/CRM-native identifier
   (`Contact.LegacyContactKey`, `ExternalActivity.LegacyContactKey`/`LegacyActivityKey`). Several
   operations accept EITHER the real key OR the legacy key interchangeably (`Contacts/GetContact`,
   `Communities/GetContactCommunities`).
4. **A vendor doc-generation bug on a handful of operations** — `Events/GetEvent`, `Events/GetEventType`,
   `Events/GetEventTypes`, `Events/GetEventTypesList`, `Events/SaveEventType`, `Events/DeleteEventType`,
   `Events/RestoreEventType`, and `RegistrantClass/GetRegistrantClasses` all document their Resource
   Description as the raw ASP.NET `HttpResponseMessage` envelope (`Version`, `Content`, `StatusCode`,
   `ReasonPhrase`, `Headers`, `RequestMessage`, `IsSuccessStatusCode`) instead of the real typed model,
   AND carry no sample JSON at all (confirmed by direct grep of the saved page — no `<pre class=
   "wrapped">` block present). This is real vendor documentation breakage (the same "get by key" bug
   pattern repeats identically across all 7 pages, and the working `Events/GetUpcoming`/`SearchEvents`/
   `SearchCurrentAndFutureEvents`/`CommunityPastEvents`/`ContactEventList` operations DO show the real
   76-field `Event` model) — not an access restriction. It leaves `EventTypes` and `RegistrantClasses`
   field-level-undocumented (see Gaps).
5. **Two library-list endpoints, two model shapes** — `ResourceLibrary/GetLibraryList` (→
   `DocumentLibrary`, 19 fields) and `ResourceLibrary/GetLibraries` (→ `Library`, thinner shape) both
   purport to list libraries — a genuine redundant/legacy API surface, folded into one
   `ResourceLibraryLibraries` leaf with `GetLibraryList` as primary.
6. **`Question`/`QuestionThread` split, no bulk `GetQuestions`** — the `Question` controller has no
   `GET`-by-key or list operation returning a bare `Question`; the only read path is `Question/GetThread`
   (returns `QuestionThread`, which nests the question's own fields alongside its answers). This means
   discovering questionKeys to sync requires an external route (see Gaps).
7. **`ExternalActivity` is write-only** — `POST Create` / `PUT Update` / `DELETE Delete` exist; no
   `GET`/list operation exists anywhere in the catalog. This is the vendor's AMS→Community writeback
   channel, consistent with the context doc's description; it is still a genuine coverable *record
   type* (the extractor should mark `SupportsRead=false`, `SupportsWrite=true`).
8. **Generic `Comments` endpoint is polymorphic via `itemKey`** — `Comments/Get?itemKey={itemKey}` and
   `Comments/GetComments` serve comments for ANY parent (blogs, library documents, ideas, etc.) through
   one shared `Comment` model; `Blogs/AddComment`/`UpdateComment`/`DeleteComment` write into that same
   scope. The task's `BlogComments` leaf is this generic Comments surface scoped to `itemKey={blogKey}`.

### Taxonomies (COVERABLE) — source-mapped

Each row: leaf name · role · primary list `APIPath` · citation (all under
`https://api.connectedcommunity.org/Help/Api/`, saved raw under `sources/ops/`).

| Leaf | Primary APIPath (method) | Pagination | Incremental | PK | Key FK(s) |
|---|---|---|---|---|---|
| Contacts | `GET Contacts/GetMyContactsPage` | Cursor (seek-key: afterContactKey/beforeContactKey+limit, def 100) | none documented | `ContactKey` (guid); alt `LegacyContactKey` | `UpdatedByContactKey`→Contacts (self) |
| Communities | `GET Communities/GetViewableCommunities` | None | none | `CommunityKey` (guid); alt `LegacyGroupKey` | `CreatedByContactKey`→Contacts; `DiscussionKey`→Discussions (1:1); `LibraryKey`→ResourceLibraryLibraries; `ParentCommunityKey`→Communities (self) |
| CommunityMembers | `POST Communities/GetCommunityMembers` | Offset (StartRecord/EndRecord, body) | `POST System/GetCommunityMemberUpdates` (StartDate/EndDate delta window) | (CommunityKey,ContactKey) pair | `ContactKey`→Contacts; nested `Community`→Communities; `InvitedByContactKey`→Contacts |
| CommunityInvitations | `GET Communities/GetMyCommunityInvitations` | None (current-user-scoped) | none | `CommunityInvitationKey` (guid, implied by the DELETE RejectInvitation param) | `CommunityKey`→Communities (implied) |
| Discussions | `GET Discussions/GetSubscribedDiscussions` | None | none | `DiscussionKey` (guid) | none scalar (minimal 3-field model) |
| DiscussionThreads | `GET Discussions/GetRecentThreads` | None (maxToRetrieve cap) | none | `DiscussionThreadKey` (guid) | `DiscussionKey`→Discussions; `CommunityKey`→Communities |
| DiscussionPosts | `GET Discussions/GetPagedDiscussionPosts` | Cursor (continuation-token, client-derived) | none param'd (DatePosted field exists) | `DiscussionPostKey` (guid) | `ContactKey`→Contacts; `DiscussionKey`→Discussions; `DiscussionThreadKey`→DiscussionThreads; `CommunityKey`→Communities; `ParentDiscussionPostKey`→DiscussionPosts (self) |
| Comments | `GET Comments/GetComments` | Cursor (seek-key: afterCommentKey/beforeCommentKey+limit, def 10) | none | `CommentKey` (guid, implied) | `itemKey`→polymorphic parent (access-path) |
| BlogComments | `GET Comments/Get?itemKey={blogKey}` | Cursor (seek-key, same shape) | none | `CommentKey` (same model as Comments) | `itemKey=BlogKey`→Blogs |
| Questions | `GET Question/GetThread` | None — **GAP: no bulk list, questionKey must already be known** | none | `QuestionKey` (guid) | nested `Community`→Communities |
| Answers | `GET Question/GetAnswers` | Cursor (seek-key: afterAnswerKey/beforeAnswerKey+limit) | none | `AnswerKey` (guid) | `ParentKey`→Questions |
| Events | `POST Events/SearchEvents` / `GET GetUpcoming` | None (maxRecords cap) | none param'd | `EventKey` (guid, from GetEvent's URL template) | nested `Community`→Communities |
| EventRegistrants | `GET Events/GetEventRegistrants` | Cursor (continuation-token, client-derived) | **`modifiedDateTime`** (confirmed real watermark param) | `RegistrantKey` (guid) | `ContactKey`→Contacts; `calendarEventKey`→Events (access-path) |
| EventTypes | `GET Events/GetEventTypes` | None | none | `EventTypeKey` (guid, from URL template) — **field-level GAP, see below** | none provable |
| EventSessions | `GET EventSessions/GetSession` | None — **GAP: single-key only, no bulk list endpoint exists** | none | `EventSessionKey` (guid) | `EventSessionCategoryKey`/`CategoryKey` (self-ref); `CreatedByContactKey`/`UpdatedByContactKey`→Contacts |
| RegistrantClasses | `GET RegistrantClass/GetRegistrantClasses` | None (Active bool filter) | none | unknown — **field-level GAP, see below** | none provable |
| ResourceLibraryLibraries | `GET ResourceLibrary/GetLibraryList` | None | none | `LibraryKey` (guid) | nested `Community`→Communities |
| ResourceLibraryDocuments | `POST ResourceLibrary/GetLibraryDocuments` | None (DaysBack rolling window, def 30 + MaxRecords cap, def 10) | `DaysBack` (pseudo-incremental rolling window, not a strict watermark) | `DocumentKey` (guid) | `LibraryKey`→ResourceLibraryLibraries; nested `CreatedByContact`→Contacts |
| DocumentAttachments | `GET ResourceLibrary/GetDocumentAttachments` | None (documentKey parent scope) | none | `DocumentAttachmentKey` (guid) | `DocumentKey`→ResourceLibraryDocuments; nested `UploadedByContact`→Contacts |
| DemographicTypes | `GET Demographics/GetDemographicTypes` | None | none | `DemographicTypeKey` (guid) | none |
| DemographicChoices | `GET Demographics/GetDemographicChoices` | None (demographicTypeKey optional parent filter) | none | `DemographicKey` (guid) | nested `DemographicType`→DemographicTypes |
| Announcements | `GET Announcements/GetAnnouncements` | None (maxResults cap + type/community filters) | none | `AnnouncementKey` (guid) | `CommunityKey`→Communities; `CreatedByContactKey`/`UpdatedByContactKey`→Contacts |
| Ideas | `GET Ideation/GetIdeasByStatus` / `GetIdeasByCategory` | Cursor (seek-key: afterIdeaKey/beforeIdeaKey+numberToReturn) | none | `IdeationKey` (guid) | nested `Status`→IdeaStatuses; nested `Categories`→IdeaCategories; nested `Community`→Communities |
| IdeaCategories | `GET Ideation/GetIdeaCategories` | None | none | (IdeaCategoryKey implied) | none |
| IdeaStatuses | `GET Ideation/GetIdeaStatuses` | None | none | (IdeaStatusKey implied) | none |
| IdeaVoters | `GET Ideation/GetVoters` | None (ideationKey parent, required) | none | (voter = ContactKey, implied) | `ideationKey`→Ideas (access-path) |
| VolunteerOpportunities | `GET Volunteer/GetVolunteerOpportunityList` | None | none | `VolunteerOpportunityKey` (guid) | nested `Community`→Communities; `VolunteerOpportunityTypeKey`→VolunteerOpportunityTypes |
| VolunteerOpportunityTypes | `GET Volunteer/GetVolunteerOpportunityTypeList` | None | none | (VolunteerOpportunityTypeKey implied) | none |
| Volunteers | `GET Volunteer/GetVolunteerList` | None (volunteerOpportunityKey parent, required) | none | `VolunteerOpportunityVolunteerKey` (guid) | nested `VolunteerContact`→Contacts; `CreatedByContactKey`/`ApprovedByContactKey`/`RejectedByContactKey`/`AdjustedByContactKey`→Contacts |
| Tags | `GET Tagging/GetTags` | None (searchText/communityKey filters) | none | `TagGroupKey` (guid) | `communityKey`→Communities (filter/access-path) |
| ExternalActivity | `POST ExternalActivity/Create` | N/A — **write-only, no GET/list exists anywhere** | n/a | `ExternalActivityKey` (guid, echoed on create) | `ContactKey`/`LegacyContactKey`→Contacts; `ExternalActivityTypeKey`/`LegacyActivityTypeKey` (type ref, no dedicated type-list endpoint found) |
| AutomationRuleSchedules | `GET AutomationRules/GetActiveRulesByType` | None | none | (RuleScheduleKey implied) | none |
| AutomationRuleContactData | `GET AutomationRules/GetContactData` | Cursor (continuation-token, client-derived = last row's ContactKey per default fieldList) | `UpdatedOn` (default fieldList member; not itself a query filter) | `ContactKey` (per default fieldList) | `ruleScheduleKey`→AutomationRuleSchedules (access-path); rows are Contacts data |
| DataFeed | `POST DataFeed/GetData` | Cursor (Marker+Direction[up/down]+NumberToReturn, 0-25, def 10) | implicit via Marker (each row carries its own `Marker`) | `ItemKey` (guid) | `Filter.CommunityKeys`→Communities; `Filter.LibraryKey`→ResourceLibraryLibraries; `Filter.AtMentions`→Contacts |

**Per-operation CRUD (write paths) confirmed for objects that have them:**

| Leaf | Create | Update | Delete |
|---|---|---|---|
| DiscussionPosts | `POST Discussions/PostToDiscussion` / `ReplyToDiscussion` | `PUT Discussions/Edit` | `DELETE Discussions/RemovePost?discussionPostKey=` |
| Comments / BlogComments | `POST Blogs/AddComment?blogKey=` / `POST ResourceLibrary/AddComment?documentKey=` | `POST Blogs/UpdateComment?blogCommentKey=` | `DELETE Blogs/DeleteComment?blogCommentKey=` |
| Questions | `POST Question/Post` | `POST Question/Edit` | `DELETE Question/Delete?questionKey=` |
| Answers | `POST Question/Answer` | `POST Answer/Edit` | `DELETE Answer/Delete?answerKey=` |
| ResourceLibraryDocuments | `POST ResourceLibrary/PostDocument?libraryKey=` (+ multipart-upload state machine: InitiateUpload→MultipartUploaded/AbortMultipartUpload→DocumentFromUpload) | `POST ResourceLibrary/Edit` | `DELETE ResourceLibrary/DeleteLibraryDocument?documentKey=` |
| DocumentAttachments | `POST ResourceLibrary/PostDocumentAttachments?documentKey=` | n/a | `DELETE ResourceLibrary/DeleteDocumentAttachment?documentAttachmentKey=` |
| DemographicTypes/Choices | `POST Demographics/AddDemographicCategory` / `AddDemographicChoice` | n/a | n/a |
| Ideas | `POST Ideation/Post` | `POST Ideation/UpdateIdeaStatus` | n/a |
| IdeaCategories | `POST Ideation/AddIdeaCategories` | n/a | n/a |
| Volunteers | `POST Volunteer/VolunteerForOpportunity*` (create) / `ApproveVolunteerApplication` (update) | (see Create) | `DELETE Volunteer/WithdrawFromOpportunity*` |
| **ExternalActivity** | `POST ExternalActivity/Create` — body=flat `ExternalActivityRequest`; ID location = **response body** (`ExternalActivityKey` echoed) | `PUT ExternalActivity/Update` — body=flat `ExternalActivity` **including the key itself in the body**, not a URL path segment (idiosyncrasy: ID location = body, not path) | `DELETE ExternalActivity/Delete?externalActivityKey=&legacyActivityKey=` — ID location = query params |
| CommunityMembers, Communities, Contacts, Discussions, Events, EventSessions, ResourceLibraryLibraries, Announcements, VolunteerOpportunities, VolunteerOpportunityTypes, RegistrantClasses, Tags, IdeaStatuses, IdeaVoters, AutomationRule* | none documented | — | — | (read-only via the Community API v2.0; some of these — Contacts — are written via the separate, out-of-scope Push API v2) |

### Taxonomies (INFORMATIONAL) — source-mapped

Grouped by role, each backed by the ledger in `sources/catalog-classification.json`:

- **Contact-embed sub-objects** — `Address`, `Education`, `WorkExperience`, `Profile`,
  `SecurityGroupConcise`, `Demographic`, `ContactDemographic` — nested fields of `Contact` with no
  independent bulk-list endpoint. (`Contacts/GetContact` field table.)
- **Universal lightweight reference** — `ContactConcise` — embedded as `Author`/`Creator`/`Editor`/
  `ThreadClosedBy` across Blogs, DiscussionPosts, Questions, Answers, Ideas, DiscussionThreads.
- **Pagination envelopes** — `PaginatedContacts`, `PaginatedComments`, `PaginatedAnswers`,
  `PaginatedReplies`, `DiscussionPostPage`, `ContactDataPage`, `PagedIdeaList` — the response wrapper
  shapes for the Cursor-paginated leaves above (documented per-leaf in the table, not separate leaves).
- **Action-result / write-echo wrappers** — `BlogRating`, `DocumentRating`, `ItemRating`,
  `DocumentFavorite`, `EmailPreferenceUpdateResponse`, `EmailPreferenceUpdateByContactResponse`,
  `EmailPreferenceByContact(UpdateFailure)`, `EmailPreferenceUpdateFailure`, `MarkMessageAsReadResponse`
  (Messaging, also out-of-scope), `Status`, `RelatedLink`, `ContactDemographic` — toggle-state / write
  confirmations, not listable records.
- **Auth/tenant RPC results** — `AuthToken` (`Authentication/Login`), `TenantDetail`
  (`Authentication/GetTenantDetail`), `TenantInfo` (`Authentication/Widget`) — RPC actions per the
  anti-RPC-as-object rule, not record streams.
- **Tenant-level config singletons** — `CodeOfConduct` (`System/GetCodeOfConduct`),
  `ProfileSectionUrlModel` (`System/GetProfileUrls`), `MobileAppSettingsModel`
  (`System/GetMobileAppSettings`), `AvailableFields` (`AutomationRules/GetContactDataFields` — a
  field-catalog/schema-introspection response, not a data row).
  `EmailPreference` (`Contacts/GetMyEmailPreferences`) — current-authenticated-user-only, no bulk-by-
  contact GET exists.
- **Search/UI-helper results** — `ContactMentionSearchResult` (`Contacts/SearchContactsForMentions`
  @mention-autocomplete widget support).
- **Nested reference/enum-refs with no dedicated list endpoint** — `TimeZoneRef`, `CurrencyType`
  (on `Event`), `MessageClass` (email-preference class), `MessageStatus` (moderation status on
  `DiscussionPost`), `ModerationTypeRef` (on `DocumentLibrary`), `TopicTagGroup` (on `Community`),
  `TagDataModel` (individual tag within `TagGroupModel.Tags`), `ItemTagResponse` (item-scoped tag
  application, folds as an access-path variant of Tags), `VolunteerRole`,
  `VolunteerApplicationStatuses`, `VolunteerExperienceLevel`, `VolunteerOpportunityTravel`,
  `EventOption`, `EventPresenter`, `IdeaAttachment`, `CommunityStatistics`, `CommunityAddition`,
  `CommunityRemoval` (nested children of `ContactCommunityUpdate`).
- **Upload/multipart plumbing** — `InitiateDirectUploadResponse`, `MultipartInitiatedUpload`.
- **DataFeed nested sub-objects** — `DataFeedContributor`, `DataFeedAttachmentsContainer`,
  `DataFeedParentContainer` — children of `DataFeedItem`.
- **Discussion nested/echo variants** — `DiscussionThreadDetails`, `DiscussionThreadResponse`
  (`GetDiscussionThreadUpdates` batch-check result), `DiscussionPostAncestry` (breadcrumb chain).
- **Item-level error rows** — `ItemError` (nested within the out-of-scope `AddItemsResponse`).

### Excluded scaffolding (vendor doc-generation noise, NOT Higher Logic business schema)

`Controller`, `Endpoint` — leak into `System/GetApiDetails` (a .NET reflection/introspection artifact
listing the API's own controllers). `HttpContent`, `HttpRequestMessage`, `HttpResponseMessage`,
`HttpStatusCode`, `Version` — leak into the 7-page vendor doc-generation bug described in Patterns §4
above (raw ASP.NET envelope types substituted for the real business model). None of these 7 are
Higher Logic vocabulary; they are excluded from both COVERABLE and INFORMATIONAL.

---

## 2. Source: `contextHLT.md` (Tier 3, `OfficialDocs`, operator-supplied)

**Path**: `packages/Integration/connectors-registry/higherlogic-thrive/sources/contextHLT.md` (78KB,
3155 lines).

### Study

- **Structure**: a Claude-Code-oriented "integration lab" brief — a 10-tier source-authority hierarchy
  (Tier 0 customer-provided docs down to Tier 10 community posts), a canonical `HigherLogicThrive
  CommunityAdapter` TypeScript interface, a canonical model set, a customer-configuration JSON schema,
  ~20 "mock server" sections (one per API area) each listing capabilities + test cases, a synthetic-
  data-volume plan (small/medium/large), an error simulator, a rate-limit/pagination simulator, and a
  full repo-layout proposal for a Docker-based mock lab.
- **Scope / what's covered**: an enumerated capability list per API area (`## Mock capabilities` under
  the "Mock API v2.0 server" section) that names ~90 operations across Authentication, Contacts,
  Communities, Discussions, Blogs, Comments, Question, Answer, Events, ResourceLibrary,
  ExternalActivity, ExternalSearch, AutomationRules, DataFeed, Demographics, System, Volunteer.
- **What's explicitly NOT covered / out of scope per the doc's own framing**: Higher Logic Vanilla
  (separate product, separate API — `## Critical product distinction`), Higher Logic Thrive Marketing
  (separate REST/SOAP marketing APIs — same section), and any customer-specific credential/community/
  contact-key value (Tier 0/3/4 material the doc explicitly says can't be produced without real access).
- **Idiosyncrasies**: uses its own bespoke naming (`ContactKey`, `LegacyContactKey`,
  `CommunityMemberRoles`, `RuleScheduleKey`) that — cross-checked against the live HelpPage — matches
  the vendor's real field names closely (e.g. `LegacyContactKey`, `RuleScheduleKey`,
  `modifiedDateTime` on event registrants are all real, HelpPage-confirmed field/param names). This
  significantly raised confidence that the doc's un-verifiable claims (e.g. the IAM key/password vs
  OIDC vs legacy auth-mode split, which the HelpPage's Authentication controller doesn't itself
  disambiguate) are drawn from genuine familiarity with the real API, not fabricated.

### Cross-check verdict (TRUSTED-WHERE-IT-SPEAKS, validated not merely assumed)

| Claim in contextHLT.md | HelpPage verification | Verdict |
|---|---|---|
| ~90 named operations across the 16 listed controllers | 236 operations confirmed across (a superset of) 25 controllers; every named operation in the doc's list matches a real HelpPage operation by name (e.g. `Discussions/GetPagedDiscussionPosts`, `Events/GetEventRegistrants`, `Contacts/GetMyEmailPreferences`) | **CONFIRMED** |
| Thrive Community / Vanilla / Thrive Marketing are 3 separate products/APIs | Corroborated independently by `support.higherlogic.com` articles (Push API v2 is a separate host; the misleadingly-named "API General Information" article turned out to actually describe Thrive Marketing's XML web service — a real, independently-discovered instance of exactly this product-mixing risk) | **CONFIRMED** |
| Push API v2 is a separate route/host/direction from API v2.0 | `support.higherlogic.com/.../Higher-Logic-Push-API-v2` confirms distinct host (`datapushapi.higherlogic.com`), distinct auth (`Key` header), distinct direction (AMS→Community push) | **CONFIRMED** |
| SSO (SAML/OIDC/OAuth2) is a separate identity route, not an API-sync route | `support.higherlogic.com/.../OAuth-2-0-Code-Flow` confirms an authorize/token/userinfo SSO flow, unrelated to data sync | **CONFIRMED** |
| External Search requires a separate add-on + separate IAM key | Not independently verifiable from the HelpPage itself (the HelpPage doesn't document add-on gating), but the `ExternalSearch` controller's own description text says exactly this: *"Note that External Search Endpoints are available as an add-on and they require a separate IAMKey for access"* — HelpPage's OWN controller description corroborates the doc | **CONFIRMED (self-corroborated by the primary source)** |
| Bespoke mock-lab/Docker-compose/adapter-interface architecture | Not evaluated — explicitly out of scope per task instruction; not source-of-truth API documentation | **IGNORED per instruction** |

No claim in `contextHLT.md` was found to be *contradicted* by the live HelpPage.

---

## 3. Source: `support.higherlogic.com` articles (Tier 2/3, `OfficialDocs`)

### Study

Five articles fetched (see `SOURCES.json` for full per-URL notes):

- **"Higher Logic API"** (Tier 2) — base URLs (`api.connectedcommunity.org` US / `api.onlinecommunity.ca`
  Canada) and the 180-240 calls/minute acceptable-use guidance (no hard server-enforced rate limit
  documented, but excessive use risks IP blocking). Feeds `Integration.BatchMaxRequestCount`/
  `BatchRequestWaitTime`.
- **"Higher Logic Push API (v2)"** (Tier 2) — confirms Push API v2 is out of scope (separate host/auth/
  direction). Not walked for its own field catalog since it's out of scope for this connector.
- **"OAuth 2.0 Code Flow"** (Tier 2) — confirms OAuth2/SSO is out of scope (identity route, not sync).
- **"API General Information"** (Tier 3, **flagged pitfall**) — despite its generic title, this page's
  actual content describes Thrive **Marketing's** legacy `ActionRequest`/`GridRequest` XML web service
  (username+password+BrandID auth) — NOT the Community API v2.0. Recorded as a documented vendor-doc-
  organization trap; not cited as evidence for any Community API v2.0 claim.
- **"Higher Logic Push API (v1)"** (Tier 3) — corroborates Push API is a distinct, versioned family;
  not deep-fetched (out of scope).

### Scope

Covers INFORMATIONAL taxonomies only (base URL/rate-limit mechanics, and the out-of-scope-family
boundary evidence for Push API and SSO). None of these articles document individual object schemas —
that is exclusively the HelpPage's job (§1).

---

## 4. Out-of-scope families (`Integration.Configuration.OutOfScopeObjectFamilies`)

| Family | Reason | Evidence |
|---|---|---|
| **Push API v2** (`datapushapi.higherlogic.com/v2`) | Distinct host, distinct auth (`Key` header + ApiKey), distinct direction (AMS/CRM → Community full-record-replacement push, the inverse of this connector's pull direction). A genuinely separate integration surface, not a variant of API v2.0. | `support.higherlogic.com/.../Higher-Logic-Push-API-v2`; corroborated by `contextHLT.md` §"Critical product distinction" |
| **ExternalSearch `Add*Items`** (10 ops: `AddAnnouncementItems`, `AddLibraryItems`, `AddLibraryEntryItems`, `AddCommunityItems`, `AddCourseItems`, `AddBlogItems`, `AddEventItems`, `AddPageContent`, `AddVolunteerOpportunityItems`, `AddGlossaryItems`) | Requires the separate "External Search" add-on AND a separate IAMKey — not available on a standard API v2.0 credential. Self-corroborated by the ExternalSearch controller's own HelpPage description. | HelpPage `ExternalSearch` controller description; `contextHLT.md` |
| **SSO** (SAML / OIDC / OAuth2 Authorization Code) | End-user identity/login route, not a data-sync route. Distinct endpoints (`/authorize`, `/token`, `/userinfo` against an external IdP), no relationship to the Community API v2.0's object model. | `support.higherlogic.com/.../OAuth-2-0-Code-Flow`; `contextHLT.md` |
| **Messaging** (`MailboxMessage`, inbox/sent private messages) | Private user-to-user direct messages — not an AMS/CRM sync target; high-PII, no organizational-record value for a member-data sync connector. | HelpPage `Messaging` controller (`GetInboxMessages`, `GetSentMessages`, Offset pagination: firstRecord/maxRecords) |
| **Friends** (social-graph friend requests) | Member-to-member social connection graph, not organizational membership/engagement data an AMS/CRM sync targets. | HelpPage `Friends` controller (`GetPendingReceivedFriendRequests`, etc.) |
| **Federation** (`Federation/GetTenant`, `Federation/GetContact`) | Cross-tenant identity federation between separate Higher Logic communities — not applicable to a single-tenant AMS/CRM connector. | HelpPage `Federation` controller (2 ops, `tenantKey`-scoped) |

## 5. Scope decision

**In scope**: the pull-direction Community API v2.0 record streams reachable via a single tenant's IAM
credential — the 34 `TaxonomyLeaves` enumerated above, spanning Contacts/Communities/CommunityMembers,
Discussions/Posts/Comments/Blogs/Questions/Answers content, Events/Registrants/Types/Sessions,
ResourceLibrary/Documents/Attachments, Demographics, Announcements, Ideation, Volunteer, Tags,
ExternalActivity (write-only AMS-writeback channel), and the AutomationRules/DataFeed configured-feed
reads.

**Judgment calls exercised** (per task's explicit "IF you judge them in-scope" instruction):
`Messaging`, `Friends`, and `Federation` are ruled **OUT of scope** — all three are genuine record
types the HelpPage proves exist, but none represent organizational/member data an AMS/CRM sync
connector would target (private messages, social-graph edges, and cross-tenant federation identity,
respectively). This keeps the object universe centered on member/community/content/engagement data,
consistent with the rest of the in-scope set.

**Additions beyond the given candidate list** (per "no artificial object ceiling"): `CommunityInvitations`,
`DiscussionThreads`, `IdeaCategories`, `IdeaStatuses`, `IdeaVoters`, `VolunteerOpportunityTypes`, and the
split of "AutomationRules" into `AutomationRuleSchedules` + `AutomationRuleContactData` — each backed by
its own dedicated GET endpoint and distinct ResourceModel in the HelpPage (see ledger).

---

## 6. Gaps (honest negatives — see also the structured `Gaps` array in the agent return)

1. **Field-level HelpPage coverage is < 0.7** — response fields for most objects live entirely on their
   own per-operation sub-page (not summarized anywhere else), and a handful of pages hit the vendor
   doc-generation bug (Patterns §4) returning zero real fields. Recommend the extraction loop budget
   **K=3** amendment rounds so under-covered objects (especially `EventTypes`, `RegistrantClasses`) get
   a second/third pass at whatever alternate evidence exists (sample JSON on sibling ops, nested-field
   echoes elsewhere) before being marked provable-only-partial.
2. **`EventTypes` and `RegistrantClasses` have NO documented fields at all** — every operation that
   would return their shape hits the vendor `HttpResponseMessage`-placeholder doc bug, and neither has
   a usable sample JSON. Only the PK field name for `EventTypes` (`EventTypeKey`) is inferable, from the
   URL template `GetEventType?EventTypeKey={EventTypeKey}`; `RegistrantClasses` has no field evidence
   at all beyond the `Active` boolean query filter. These two leaves need runtime discovery (a live,
   credentialed call) to fill in field-level detail — no further credential-free technique closes this.
3. **`Questions` has no bulk-list endpoint** — the only read path (`Question/GetThread`) requires an
   already-known `questionKey`; there is no `GetQuestions`/`SearchQuestions` operation anywhere in the
   catalog. A real connector would need an alternate discovery route (e.g. cross-posted question IDs
   surfaced via `DataFeed/GetData` with `ItemType` filtering, or `Contacts/GetContactContributions`)
   to enumerate questionKeys before it can sync them.
4. **`EventSessions` has no bulk-list endpoint** — `EventSessions/GetSession` is a single-key lookup
   only; no `GetSessions`/`GetEventSessions` list operation exists. Session keys would need to be
   discovered via a nested field on the (76-field) `Event` model — not confirmed present in the
   documented Event field list, so this is an open question for the extraction phase.
5. **No strict incremental-watermark param on most leaves** — real, confirmed `modifiedDateTime`
   watermark support exists ONLY for `EventRegistrants`. `ResourceLibraryDocuments` has a `DaysBack`
   rolling-window filter (a pseudo-incremental mechanism, not a strict watermark) and `CommunityMembers`
   has a `StartDate`/`EndDate` delta-window endpoint (`GetCommunityMemberUpdates`) — both usable for
   incremental sync but neither is a single "give me everything since date X" cursor field. Most other
   leaves (`Contacts`, `Communities`, `Discussions`, `Announcements`, etc.) have no incremental filter
   param at all — a full walk via their Cursor/None pagination is the only documented mechanism.
6. **`RelatedLink` is write-only** (`POST AddRelatedLink` on Blogs and ResourceLibrary) — no
   `GetRelatedLinks` read endpoint exists, so related links attached to a blog/document cannot be
   independently synced (they can only be observed nested if/when they surface inside `Blog.RelatedLinks`
   / `Document.RelatedLinks`, which the field tables confirm DO exist as nested collections — so this is
   not a full gap, just a note that there's no standalone list endpoint for them).
7. **One HelpPage sub-page is permanently unreachable** — `Discussions/GetLatestTopics` returns a
   persistent vendor-side HTTP 500 (2 attempts, confirmed). Equivalent discussion-topic data is
   available via `GetRecentThreads`/`GetSubscribedDiscussions`, so this does not block the
   `DiscussionThreads`/`Discussions` leaves, but the specific `GetLatestTopics` operation itself
   remains undocumented from this source.
8. **Auth-mode selection logic is not in the HelpPage** — the HelpPage's `Authentication` controller
   documents only `Login`/`GetTenantDetail`/`Widget` at the operation-catalog level; it does not state
   which of IAM key/password, OIDC, or legacy auth a given tenant uses, or how a connector should choose.
   This remains sourced only from `contextHLT.md`'s framing (itself Tier 3, not independently verified
   against a live tenant) — a genuine open question requiring either more support-article research or a
   real tenant's credential-setup screen to resolve definitively.

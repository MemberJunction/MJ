# higherlogic-thrive-community-integration-lab-context.md

## Purpose

This file is a Claude Code / agent-ready context document for building and testing a production-shaped **Higher Logic Thrive Community** integration when the developer does **not** yet have real Higher Logic API credentials, IAM key, IAM password, OAuth/OIDC credentials, tenant/community URL, community keys, contact keys, legacy contact keys, microsite keys, security-group rules, community-group rules, Push API credentials, SSO configuration, event keys, discussion keys, library keys, demographic mappings, AMS/CRM mappings, production API access, or customer-approved write permissions.

The goal is not to pretend to validate a customer’s real Higher Logic Thrive Community site.

The goal is to build the strongest legal Higher Logic Thrive Community Integration Lab possible using:

```txt id="r54klu"
official Higher Logic Community API v2.0 documentation
official Higher Logic Community API support articles
official Higher Logic Push API v2 documentation
official Higher Logic SAML/OIDC SSO documentation
official Higher Logic OAuth 2.0 Code Flow documentation
official Higher Logic support guidance
customer/admin-provided community configuration
customer-provided API endpoint documentation
customer-provided IAM/API credentials later
local Higher Logic Community API v2.0 compatibility mock
local Higher Logic API auth simulator
local IAM key/password simulator
local OIDC API-auth simulator
local legacy-auth simulator
local Push API simulator
local SAML/OIDC SSO simulator
local OAuth2 SSO simulator
local community/group/security-group simulator
local contact/profile/demographic simulator
local discussions/questions/answers/blogs/comments simulator
local events/registrants/attendance simulator
local resource-library/document/upload simulator
local external-activity simulator
local external-search simulator
local automation-rules simulator
local data-feed simulator
local email-preferences simulator
local code-of-conduct simulator
local volunteer simulator
local AMS/CRM data-push simulator
local marketing-route guardrail simulator
synthetic contacts
synthetic organizations
synthetic security groups
synthetic community groups
synthetic demographics
synthetic education/job history/address/phone/email records
synthetic orders/products
synthetic discussions and posts
synthetic questions and answers
synthetic blogs and comments
synthetic events and registrants
synthetic resource libraries and documents
synthetic external activities
synthetic external search items
synthetic automation-rule records
synthetic push payloads
OpenAPI compatibility fixtures
Postman/Newman collections
contract tests
CI
sandbox/customer-test-community calibration scripts
production smoke-test plan
```

The standard is:

```txt id="xr2r32"
Mock real first.
Calibrate with customer test community or authorized API credentials later.
Smoke test production last.
```

## Non-negotiable rule

Claude Code must not invent customer-specific Higher Logic Thrive Community implementation details.

Claude Code may model Higher Logic Thrive-like behavior, especially API v2.0, IAM/OIDC authentication, Push API v2, SSO, contact/profile, community, discussion, event, resource-library, external-activity, external-search, and automation behavior, but every mock must be clearly labeled as a compatibility mock.

Use names like:

```txt id="x0w11q"
higherlogic-thrive-community-compatibility-mock
mock-higherlogic-community-api-v2-server
mock-higherlogic-community-auth-server
mock-higherlogic-push-api-server
mock-higherlogic-thrive-sso-server
mock-higherlogic-community-content-server
```

Do not use names like:

```txt id="n1zl5o"
real-higherlogic-api
official-higherlogic-client
production-thrive-adapter
```

until official docs, customer configuration, and sandbox/customer-test validation exist.

Every real implementation claim must have evidence:

```txt id="qlsyge"
official Higher Logic API docs
official Higher Logic support article
customer docs
vendor/support docs
customer API endpoint documentation
customer test-community response
sandbox/test response
admin confirmation
approved partner implementation doc
```

Partner pages, consultant pages, old API examples, marketing docs, AMS-specific worksheets, community posts, GitHub examples, and blogs are behavioral clues only unless the customer confirms that exact route.

## Critical product distinction

Do not mix these three products/routes:

```txt id="gpeefc"
1. Higher Logic Thrive Community
   Community platform.
   Uses Higher Logic Community API v2.0, Push API, SSO, community data, contacts, communities, discussions, libraries, events, external activity, external search, etc.

2. Higher Logic Vanilla
   Separate community platform.
   Uses Vanilla API v2 and Vanilla Dashboard Swagger.
   Do not reuse Vanilla endpoint assumptions here.

3. Higher Logic Thrive Marketing
   Marketing platform.
   Separate REST/SOAP-style marketing APIs for recipients, groups, message content, tracking metrics, Informz/Real Magnet-style routes.
   Do not mix marketing routes into Thrive Community unless customer confirms marketing is in scope.
```

For this file, assume:

```txt id="hff4wn"
Higher Logic Thrive Community
```

not Vanilla and not Thrive Marketing.

If the customer says “Higher Logic Thrive” but actually means marketing automation, create a separate:

```txt id="jzffp0"
higherlogic-thrive-marketing-integration-lab-context.md
```

## Core framing

Higher Logic Thrive Community is not one single route.

Treat it as a platform with multiple possible integration surfaces.

Possible routes:

```txt id="sh43jw"
Higher Logic Community API v2.0 route
Higher Logic OIDC API-auth route
Higher Logic legacy-auth route
Higher Logic IAM key/password route
Higher Logic Push API v2 route
Higher Logic Push API v1 / hybrid claims-based Push API route
SAML SSO route
OIDC SSO route
OAuth 2.0 Authorization Code SSO route
OAuth/OIDC identity-provider route
AMS/CRM built-in SSO route
claims-based SSO route
contact/profile sync route
community/security-group sync route
demographics sync route
discussion/blog/question/answer content route
resource-library/document route
event/registrant/attendance route
external activity route
external search route
automation rules route
data feed route
volunteer route
email-preferences route
code-of-conduct route
web/widget route
Zapier/native/middleware route
AMS-specific connector route
custom middleware route
hybrid route
```

The first task is not coding the real adapter.

The first task is:

```txt id="ph9751"
identify the route
collect authoritative source docs
build mocks for likely routes
make real adapter disabled until route is confirmed
run contract tests against the mock
calibrate with customer test-community/API credentials later
```

## What can be built without real credentials

Without real credentials, Claude Code can legally build:

```txt id="is3o8h"
source register
evidence log
unknowns register
route decision file
customer/vendor/admin request packet
Higher Logic Thrive adapter interface
mock Community API v2.0 server
mock API-auth server
mock IAM key/password auth simulator
mock OIDC auth simulator
mock legacy auth simulator
mock Push API v2 server
mock SSO server
mock SAML/OIDC SSO simulator
mock OAuth2 code-flow SSO simulator
mock contacts/profile server
mock demographics server
mock communities/groups/security-group server
mock discussions/questions/answers/blogs/comments server
mock events/registrants/attendance server
mock resource-library/document/upload server
mock external-activity server
mock external-search server
mock automation-rules server
mock data-feed server
mock volunteer server
mock email-preferences server
mock code-of-conduct server
mock webhook-like/event-notification receiver if customer route uses middleware
mock AMS/CRM data-push route
mock marketing-route guardrails
synthetic contacts and organizations
synthetic groups and communities
synthetic demographics
synthetic event registrations
synthetic discussion posts
synthetic answers/questions
synthetic resource-library entries
synthetic external activities
synthetic external-search objects
synthetic push payloads
OpenAPI compatibility fixtures
Postman/Newman collections
contract tests
rate-limit/error tests
CI tests
customer-test-community calibration scripts
production smoke-test checklist
```

Without real credentials, Claude Code cannot honestly prove:

```txt id="l4t2rs"
the real customer API base URL
the real customer Canadian vs US API base route
the real customer IAM key
the real customer API password
the real customer OIDC client credentials
the real customer authentication method
the real customer tenant key
the real customer community URL
the real customer community keys
the real customer contact keys
the real customer legacy contact keys
the real customer microsite keys
the real customer demographic mappings
the real customer security group rules
the real customer community group rules
the real customer SSO IdP metadata
the real customer SSO claims
the real customer Push API credential setup
the real customer Push API endpoint choice
the real customer AMS/CRM mapping
the real customer write permissions
the real customer production performance
```

So the mock lab proves architecture and safety.

The customer test community or authorized API access proves real compatibility.

Production smoke tests prove safe live access.

## Source authority hierarchy

Claude Code must rank Higher Logic Thrive Community sources in this order.

### Tier 0 — Customer-provided Higher Logic API endpoint documentation / support-confirmed customer route

Highest authority for customer-specific implementation.

Get from:

```txt id="rexf3a"
customer Higher Logic administrator
customer Thrive Community administrator
customer IT team
customer AMS/CRM integration owner
customer Higher Logic support case
customer Higher Logic CSM
customer API endpoint documentation packet
customer implementation partner
customer secure document handoff
customer admin screen share
customer SSO technical worksheet
customer Push API technical worksheet
```

Use for:

```txt id="uxdbkp"
actual product route
actual API base URL
actual auth method
actual IAM key process
actual OIDC client setup
actual legacy-auth setup
actual Push API route
actual SSO route
actual tenant/community URL
actual community keys
actual contact keys
actual legacy contact keys
actual demographics
actual community/security group mapping
actual AMS/CRM mapping
actual writeback permissions
actual external activity mapping
actual external search setup
actual event sync behavior
actual sample records
actual sandbox/test-community instructions
```

Customer-specific support-confirmed guidance beats generic docs.

### Tier 1 — Official Higher Logic Community API v2.0 documentation

Highest public authority for generic Community API behavior.

Use for:

```txt id="p7rqo3"
endpoint categories
request/response examples
authentication endpoints
contacts
communities
discussions
questions
answers
blogs
comments
events
registrants
resource library
external activity
external search
automation rules
data feed
demographics
volunteer
system endpoints
pagination
continuation token behavior
admin-only endpoint warnings
permission behavior clues
```

Do not use for customer-specific credentials, community keys, contact keys, group rules, or write approval.

### Tier 2 — Official Higher Logic Community API support article

Use for general API access, base URL, broad call-rate guidance, Canadian network note, and support route.

Use for:

```txt id="t25xzl"
API access page discovery
general API purpose
general acceptable usage range
IP blocking risk
Canadian base URL clue
support escalation path
```

Do not treat general rate guidance as a replacement for customer-specific performance testing.

### Tier 3 — Customer/admin-provided Thrive Community configuration

Highest authority for site-specific community behavior.

Get from:

```txt id="ur3cdw"
customer Thrive Community administrator
customer community manager
customer AMS/CRM admin
customer IT/security admin
customer SSO admin
customer Higher Logic implementation owner
customer community settings
customer security group settings
customer community group settings
customer demographic settings
customer SSO settings
customer Push API settings
customer API credentials handoff
```

Use for:

```txt id="x3eaj3"
real community URL
real community/group/security-group rules
real demographic fields
real contact field visibility
real member/nonmember rules
real exclusion rules
real private/community access behavior
real event rules
real directory visibility rules
real discussion/library permissions
real code-of-conduct settings
real email preference behavior
real safe test users
real safe test communities
real safe test events
real write/update approvals
```

Customer admin configuration beats generic examples.

### Tier 4 — Customer test community / staging environment observations

Use after authorized access exists.

Get from:

```txt id="j72qhh"
customer Thrive Community admin
customer IT team
customer integration owner
Higher Logic support if needed
authorized staging/test community owner
```

Use for:

```txt id="xv0wj3"
verifying auth
verifying API base URL
verifying IAM/OIDC/legacy auth
verifying contact response shapes
verifying community response shapes
verifying permission behavior
verifying demographics
verifying discussions/events/libraries
verifying Push API response behavior
verifying external activity writes
verifying external search writes
verifying SSO login
verifying paging/continuation-token behavior
verifying rate-limit behavior
verifying writes only after approval
```

Test-community observations beat assumptions.

### Tier 5 — Official Higher Logic Push API v2 documentation

Use only when Push API is in scope.

Use for:

```txt id="k54wd8"
Push API v2 route
contactinfo endpoint behavior
full-record replacement behavior
list Replace/Add/Remove behavior
contact details
groups
demographics
education
job history
addresses
phone numbers
email addresses
orders/products
date-time format expectations
IsDeleted behavior
case-sensitive IDs
US/Canada Push API base URL clues
```

Do not assume Push API is enabled or that Push API is the customer’s route.

### Tier 6 — Official SAML/OIDC SSO documentation

Use only when SAML/OIDC SSO is in scope.

Use for:

```txt id="d6dbrs"
SAML role split between IdP and SP
metadata exchange
signed requests and responses
certificate validation
OIDC route requirements
external AMS/CRM as IdP possibility
logout/request signing expectations
```

Do not assume customer IdP, metadata URL, claim names, or certificate details.

### Tier 7 — Official OAuth 2.0 Code Flow documentation

Use only when OAuth2 code-flow SSO is in scope.

Use for:

```txt id="btekz3"
authorization request shape
authorization endpoint
token endpoint
redirect URI pattern
state parameter
client ID
client secret
profile scope
authorization_code grant
Basic authorization at token endpoint
profile/user-identifier requirement
```

Do not hardcode customer IdP URLs or claim mappings without confirmation.

### Tier 8 — Official Higher Logic Thrive Marketing docs

Use only to prevent product confusion, or when marketing is explicitly in scope.

Examples:

```txt id="rls3vk"
Thrive Marketing Enterprise REST API
Thrive Marketing Professional SOAP/XML Web Service
Informz/Real Magnet marketing APIs
recipient data
message content
groups
tracking metrics
unsubscribers
ActionRequest/GridRequest
```

Do not mix Thrive Marketing API assumptions into Thrive Community.

### Tier 9 — AMS-specific Higher Logic worksheets / partner docs

Use as route clues only unless the customer confirms the same route.

Examples:

```txt id="fv3rqd"
NetForum Higher Logic integration guides
MemberSuite Higher Logic technical worksheet
Novi Higher Logic integration guide
AMS-specific SSO docs
AMS-specific Push/API worksheets
```

Useful for:

```txt id="isn2ot"
common source questions
credential request patterns
community/security group mapping clues
member refresh/periodic refresh clues
SSO test-user checklist
```

Not sufficient for:

```txt id="v22vlz"
building this customer’s real adapter
assuming field names
assuming group rules
assuming activity writebacks
assuming Push API vs API v2 route
```

### Tier 10 — Partner pages, consultant docs, community posts, GitHub examples

Use only as behavioral clues.

They can suggest:

```txt id="pkrt6v"
common auth mistakes
common community/group mapping issues
SSO troubleshooting patterns
Push API field problems
pagination mistakes
rate-limit caution
```

They cannot define:

```txt id="dlvj1y"
current endpoint behavior
customer API permissions
customer group mappings
customer SSO claims
production-safe write behavior
```

## Required source files

Claude Code must create:

```txt id="ibyi86"
docs/source-register.md
docs/evidence-log.md
docs/unknowns-register.md
docs/no-invention-policy.md
docs/customer-admin-request.md
docs/vendor-api-doc-request.md
docs/customer-discovery-questionnaire.md
docs/product-route-decision.md
```

### source-register.md

Each source entry must include:

```txt id="gs2e9j"
source_id
title
owner
source_type
authority_tier
retrieved_date
url_or_location
requires_login
customer_specific
vendor_specific
what_it_can_support
what_it_cannot_support
implementation_safe
notes
```

Source types:

```txt id="e7d41v"
official_higherlogic_api_doc
official_higherlogic_support_article
official_push_api_doc
official_sso_doc
official_oauth2_sso_doc
customer_admin_config
customer_api_packet
test_community_response
push_api_response
sso_metadata
support_ticket
higher_logic_support_guidance
ams_partner_doc
thrive_marketing_doc
community_post
blog_post
admin_screen_share
```

### evidence-log.md

Every implementation claim must be logged.

Claims include:

```txt id="itktne"
route
API base URL
Push API base URL
Canadian network route
auth method
IAM key
OIDC client setup
legacy auth setup
tenant detail
community URL
community key
contact key
legacy contact key
microsite key
endpoint path
required headers
request body
response body
pagination behavior
continuation token behavior
community visibility behavior
contact field mapping
demographic mapping
security group mapping
community group mapping
event registration mapping
external activity mapping
external search mapping
SSO route
SAML/OIDC claims
OAuth2 client/redirect/token/profile behavior
write permission
error behavior
```

If unsupported:

```txt id="fo6xst"
UNCONFIRMED_DO_NOT_IMPLEMENT
```

### unknowns-register.md

Track unknowns:

```txt id="fhuzb5"
unknown_id
category
question
why_needed
blocking_level
who_to_ask
status
resolution
```

Blocking levels:

```txt id="go5qtf"
BLOCKS_ROUTE_DECISION
BLOCKS_AUTH
BLOCKS_MOCK_CALIBRATION
BLOCKS_REAL_IMPLEMENTATION
BLOCKS_SSO
BLOCKS_PUSH_API
BLOCKS_CONTACT_SYNC
BLOCKS_COMMUNITY_ACCESS
BLOCKS_CONTENT_WRITES
BLOCKS_EXTERNAL_ACTIVITY
BLOCKS_EXTERNAL_SEARCH
BLOCKS_PRODUCTION
NICE_TO_HAVE
```

## Product-route decision

Claude Code must create:

```txt id="erdk02"
docs/product-route-decision.md
```

Allowed route values:

```txt id="vfxq7d"
unknown
thrive_community_api_v2_iam
thrive_community_api_v2_oidc
thrive_community_api_v2_legacy_auth
thrive_community_api_v2_user_context
thrive_community_api_v2_admin_context
thrive_push_api_v2
thrive_push_api_v1_hybrid_claims
thrive_sso_saml
thrive_sso_oidc
thrive_sso_oauth2_code_flow
thrive_sso_claims_based
thrive_ams_built_in_sso
thrive_contact_profile_sync
thrive_community_security_group_sync
thrive_discussions_content_sync
thrive_events_registrant_sync
thrive_resource_library_sync
thrive_external_activity
thrive_external_search
thrive_automation_rules
thrive_data_feed
thrive_volunteer
thrive_marketing_enterprise
thrive_marketing_professional
custom_middleware
hybrid
```

If route is unknown:

```txt id="n1gtel"
real adapter disabled
only mocks and source-acquisition docs allowed
```

If route is confirmed:

```txt id="yc5xji"
required source docs checklist generated
mock scenario selected
contract tests generated
test-community validation plan generated
```

Route decision test cases:

```txt id="qa56rm"
unknown route blocks real adapter
API v2 IAM route enables IAM auth mock
API v2 OIDC route enables OIDC auth mock
legacy-auth route enables legacy auth mock
Push API v2 route enables Push API mock
hybrid claims route enables SSO + Push API mock
SAML SSO route enables SAML simulator
OAuth2 code flow route enables OAuth2 simulator
contact sync route enables contacts/demographics tests
community group sync route enables group access tests
content sync route enables discussions/blogs/questions tests
events route enables events/registrants tests
resource library route enables document/upload tests
external activity route enables writeback safety tests
external search route enables separate IAM key/add-on tests
marketing route blocks community assumptions
hybrid route enables multiple adapters
route change invalidates mappings
```

## Canonical adapter interface

Build an internal adapter interface.

```ts id="mj2dfh"
interface HigherLogicThriveCommunityAdapter {
  authenticate(): Promise<AuthState>;

  getTenantDetail(input: TenantLookupInput): Promise<TenantDetail>;
  whoAmI(includeSecurityGroups?: boolean): Promise<CanonicalContact>;

  getContact(input: ContactLookupInput): Promise<CanonicalContact>;
  searchContacts(query: ContactSearchQuery): Promise<Page<CanonicalContact>>;
  getContactContributions(input: ContactContributionQuery): Promise<Page<CanonicalContribution>>;
  getEmailPreferences(contactKey: string): Promise<EmailPreferenceState>;
  updateEmailPreferences(input: EmailPreferenceUpdate): Promise<WriteResult>;

  getCommunities(query: CommunityQuery): Promise<Page<CanonicalCommunity>>;
  getMyCommunities(): Promise<Page<CanonicalCommunity>>;
  getViewableCommunities(): Promise<Page<CanonicalCommunity>>;
  getCommunityMembers(input: CommunityMemberQuery): Promise<Page<CanonicalContact>>;
  joinCommunity(communityKey: string): Promise<WriteResult>;
  leaveCommunity(communityKey: string): Promise<WriteResult>;

  getDiscussions(query: DiscussionQuery): Promise<Page<CanonicalDiscussion>>;
  getDiscussion(discussionKey: string): Promise<CanonicalDiscussion>;
  getDiscussionPosts(query: DiscussionPostQuery): Promise<Page<CanonicalDiscussionPost>>;
  postToDiscussion(input: DiscussionPostCreate): Promise<WriteResult>;
  replyToDiscussion(input: DiscussionReplyCreate): Promise<WriteResult>;

  getQuestion(questionKey: string): Promise<CanonicalQuestion>;
  getAnswer(answerKey: string): Promise<CanonicalAnswer>;
  recommendAnswer(answerKey: string): Promise<WriteResult>;

  getEvents(query: EventQuery): Promise<Page<CanonicalEvent>>;
  getEvent(eventKey: string): Promise<CanonicalEvent>;
  getEventRegistrants(input: EventRegistrantQuery): Promise<Page<CanonicalEventRegistrant>>;
  rsvpToEvent(eventKey: string): Promise<WriteResult>;

  getLibraryDocuments(query: LibraryDocumentQuery): Promise<Page<CanonicalLibraryDocument>>;
  getLibraryDocument(documentKey: string): Promise<CanonicalLibraryDocument>;
  postLibraryDocument(input: LibraryDocumentCreate): Promise<WriteResult>;

  createExternalActivity(input: ExternalActivityCreate): Promise<WriteResult>;
  updateExternalActivity(input: ExternalActivityUpdate): Promise<WriteResult>;
  deleteExternalActivity(input: ExternalActivityDelete): Promise<WriteResult>;

  pushContactInfo(input: PushContactInfoPayload): Promise<PushResult>;
  pushList(input: PushListPayload): Promise<PushResult>;

  addExternalSearchItems(input: ExternalSearchPayload): Promise<WriteResult>;

  capabilities(): Promise<HigherLogicThriveCapabilities>;
}
```

Implementations:

```txt id="dufikm"
MockHigherLogicApiV2Adapter
MockHigherLogicIamAuthAdapter
MockHigherLogicOidcAuthAdapter
MockHigherLogicLegacyAuthAdapter
MockHigherLogicPushApiV2Adapter
MockHigherLogicSsoAdapter
MockHigherLogicExternalActivityAdapter
MockHigherLogicExternalSearchAdapter
MockHigherLogicMarketingGuardrailAdapter
HigherLogicApiV2Adapter
HigherLogicPushApiAdapter
HigherLogicSsoAdapter
```

Real adapters stay disabled until official docs/customer config/test community confirm route.

## Canonical model

Use canonical objects internally.

```ts id="z477pm"
type CanonicalContact = {
  id: string;
  contactKey?: string;
  legacyContactKey?: string;
  alternativeContactId?: string;
  primaryEmailAddress?: string;
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  parentContactId?: string;
  isOrganization?: boolean;
  isMember?: boolean;
  memberSince?: string;
  memberExpiresOn?: string;
  excludeFromDirectory?: boolean;
  doNotEmail?: boolean;
  title?: string;
  designation?: string;
  groups?: CanonicalContactGroup[];
  demographics?: Record<string, unknown>;
  education?: unknown[];
  jobHistory?: unknown[];
  addresses?: unknown[];
  phoneNumbers?: unknown[];
  emailAddresses?: unknown[];
  orders?: CanonicalProductOrder[];
  raw?: unknown;
};
```

```ts id="xmjioo"
type CanonicalContactGroup = {
  id: string;
  groupId?: string;
  groupName?: string;
  groupType?: string;
  groupSubType?: string;
  role?: string;
  initialJoinDate?: string;
  beginDate?: string;
  endDate?: string;
  accessType?: "community_group" | "security_group" | "unknown";
  raw?: unknown;
};
```

```ts id="mebcdu"
type CanonicalCommunity = {
  id: string;
  communityKey?: string;
  name: string;
  description?: string;
  type?: string;
  hidden?: boolean;
  canView?: boolean;
  canContribute?: boolean;
  canJoin?: boolean;
  statistics?: Record<string, unknown>;
  raw?: unknown;
};
```

```ts id="ln4plo"
type CanonicalDiscussion = {
  id: string;
  discussionKey?: string;
  communityKey?: string;
  name?: string;
  description?: string;
  subscribed?: boolean;
  canPost?: boolean;
  raw?: unknown;
};
```

```ts id="wocyk4"
type CanonicalDiscussionPost = {
  id: string;
  discussionPostKey?: string;
  discussionKey?: string;
  parentPostKey?: string;
  contactKey?: string;
  subject?: string;
  body?: string;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  score?: number;
  raw?: unknown;
};
```

```ts id="q7lk59"
type CanonicalEvent = {
  id: string;
  eventKey?: string;
  calendarEventKey?: string;
  title?: string;
  start?: string;
  end?: string;
  type?: string;
  communityKey?: string;
  registrationType?: string;
  doneState?: boolean;
  raw?: unknown;
};
```

```ts id="ii3u3y"
type CanonicalEventRegistrant = {
  id: string;
  eventKey?: string;
  calendarEventKey?: string;
  contactKey?: string;
  emailAddress?: string;
  firstName?: string;
  lastName?: string;
  registrationStatus?: string;
  modifiedDateTime?: string;
  raw?: unknown;
};
```

```ts id="xkfekd"
type ExternalActivityCreate = {
  externalId: string;
  contactKey?: string;
  legacyContactKey?: string;
  activityType: string;
  activityDate: string;
  sourceSystem: string;
  description?: string;
  metadata?: Record<string, unknown>;
};
```

## Customer configuration model

All customer-specific details must live in config.

```json id="v346yy"
{
  "customer": "Example Association",
  "platform": "higherlogic_thrive_community",
  "route": "thrive_community_api_v2_iam",
  "environment": "mock",
  "urls": {
    "apiBase": "http://localhost:4010/api/v2.0",
    "pushApiBase": "http://localhost:4020/v2",
    "communityBase": "http://localhost:4030"
  },
  "auth": {
    "type": "iam_key_password",
    "iamKeyEnv": "HIGHERLOGIC_IAM_KEY",
    "iamPasswordEnv": "HIGHERLOGIC_IAM_PASSWORD",
    "oidcClientIdEnv": "HIGHERLOGIC_OIDC_CLIENT_ID",
    "oidcClientSecretEnv": "HIGHERLOGIC_OIDC_CLIENT_SECRET"
  },
  "tenant": {
    "communityUrlEnv": "HIGHERLOGIC_COMMUNITY_URL",
    "tenantKeyEnv": "HIGHERLOGIC_TENANT_KEY"
  },
  "contactMapping": {
    "id": "ContactKey",
    "legacyId": "LegacyContactKey",
    "email": "PrimaryEmailAddress",
    "firstName": "FirstName",
    "lastName": "LastName",
    "organizationName": "OrganizationName",
    "isMember": "IsMember",
    "memberExpiresOn": "MemberExpiresOn"
  },
  "accessRules": {
    "defaultDeny": true,
    "isMemberGrantsAccess": true,
    "requireMemberExpiresOnAfterToday": false,
    "communityGroupTypes": ["Committee", "Chapter", "Event"],
    "securityGroupTypes": ["Membership"],
    "denyGroups": [],
    "allowGroups": []
  },
  "pushApi": {
    "enabled": false,
    "mode": "full_record_replacement",
    "listModesAllowed": ["Replace", "Add", "Remove"]
  },
  "sso": {
    "enabled": false,
    "route": "saml",
    "idpMetadataEnv": "HIGHERLOGIC_IDP_METADATA",
    "clientIdEnv": "HIGHERLOGIC_SSO_CLIENT_ID",
    "clientSecretEnv": "HIGHERLOGIC_SSO_CLIENT_SECRET"
  },
  "writeSafety": {
    "productionWritesDisabledByDefault": true,
    "allowContactUpdates": false,
    "allowDiscussionPosts": false,
    "allowRSVPs": false,
    "allowLibraryUploads": false,
    "allowExternalActivityWrites": false,
    "allowExternalSearchWrites": false
  }
}
```

## Mock-real integration lab

The Higher Logic Thrive Community lab should include multiple mock servers.

```txt id="mqv45q"
mock-higherlogic-api-v2-server
mock-higherlogic-auth-server
mock-higherlogic-push-api-v2-server
mock-higherlogic-sso-server
mock-higherlogic-community-content-server
mock-higherlogic-events-server
mock-higherlogic-resource-library-server
mock-higherlogic-external-activity-server
mock-higherlogic-external-search-server
mock-higherlogic-automation-rules-server
mock-higherlogic-marketing-guardrail-server
```

Use Docker Compose.

```txt id="a6kuzc"
higherlogic-thrive-community-integration-lab/
  docker-compose.yml
  mock-server/
  push-api-server/
  sso-server/
  synthetic-data/
  tests/
  postman/
  openapi/
  schemas/
  docs/
```

## Mock API v2.0 server

### Purpose

Model Higher Logic Community API v2.0 behavior without real credentials.

### Mock capabilities

```txt id="olmn7w"
Authentication/Login
Authentication/GetTenantDetail
Authentication/Widget
Contacts/WhoAmI
Contacts/GetWhoAmI
Contacts/GetContact
Contacts/SearchContacts
Contacts/SearchContactsForMentions
Contacts/GetContactKeyByPrimaryEmail
Contacts/GetMyEmailPreferences
Contacts/UpdateEmailPreferences
Contacts/GetContactContributions
Contacts/GetMyContributions
Communities/Get
Communities/GetMyCommunities
Communities/GetContactCommunities
Communities/GetViewableCommunities
Communities/GetCommunitiesCanContribute
Communities/GetCommunitiesICanJoin
Communities/GetCommunityMembers
Communities/JoinCommunity
Communities/LeaveCommunity
Discussions/GetDiscussion
Discussions/GetDiscussionPost
Discussions/GetDiscussionThreadUpdates
Discussions/GetDiscussionPosts
Discussions/GetPagedDiscussionPosts
Discussions/PostToDiscussion
Discussions/ReplyToDiscussion
Discussions/Follow
Blogs/GetLatestEntries
Blogs/CreateBlog
Blogs/PublishBlog
Blogs/UpdateBlog
Blogs/AddComment
Comments/Get
Comments/GetComments
Question/Edit
Answer/Get
Answer/Recommend
Events/GetEvent
Events/GetUpcoming
Events/SearchEvents
Events/GetEventRegistrants
Events/GetRegistrantDetails
Events/EventAttendance
Events/RSVPToEvent
ResourceLibrary/GetLibraryList
ResourceLibrary/GetLibraryDocuments
ResourceLibrary/GetLibraryDocument
ResourceLibrary/PostDocument
ResourceLibrary/InitiateUpload
ResourceLibrary/MultipartUploaded
ResourceLibrary/AbortMultipartUpload
ExternalActivity/Create
ExternalActivity/Update
ExternalActivity/Delete
ExternalSearch/Add*Items
AutomationRules/GetActiveRulesByType
AutomationRules/GetContactData
AutomationRules/GetContactDataFields
DataFeed/GetData
Demographics/GetDemographicTypes
Demographics/GetDemographicChoices
System/GetApiDetails
System/GetCodeOfConduct
System/GetProfileUrls
Volunteer endpoints
```

### Mock paths

Use local compatibility paths only.

```txt id="tr4q0k"
POST /api/v2.0/Authentication/Login
GET  /api/v2.0/Authentication/GetTenantDetail
POST /api/v2.0/Contacts/WhoAmI
GET  /api/v2.0/Contacts/GetWhoAmI
GET  /api/v2.0/Contacts/GetContact
GET  /api/v2.0/Contacts/SearchContacts
GET  /api/v2.0/Contacts/GetContactKeyByPrimaryEmail
GET  /api/v2.0/Contacts/GetMyEmailPreferences
POST /api/v2.0/Contacts/UpdateEmailPreferences
POST /api/v2.0/Contacts/GetContactContributions
GET  /api/v2.0/Communities/Get
GET  /api/v2.0/Communities/GetMyCommunities
GET  /api/v2.0/Communities/GetViewableCommunities
POST /api/v2.0/Communities/GetCommunityMembers
POST /api/v2.0/Communities/JoinCommunity
DELETE /api/v2.0/Communities/LeaveCommunity
GET  /api/v2.0/Discussions/GetDiscussion
GET  /api/v2.0/Discussions/GetDiscussionPost
POST /api/v2.0/Discussions/GetDiscussionThreadUpdates
GET  /api/v2.0/Discussions/GetPagedDiscussionPosts
POST /api/v2.0/Discussions/PostToDiscussion
POST /api/v2.0/Discussions/ReplyToDiscussion
GET  /api/v2.0/Events/GetEvent
GET  /api/v2.0/Events/GetUpcoming
POST /api/v2.0/Events/SearchEvents
GET  /api/v2.0/Events/GetEventRegistrants
POST /api/v2.0/Events/RSVPToEvent
GET  /api/v2.0/ResourceLibrary/GetLibraryList
POST /api/v2.0/ResourceLibrary/GetLibraryDocuments
POST /api/v2.0/ResourceLibrary/PostDocument
POST /api/v2.0/ResourceLibrary/InitiateUpload
POST /api/v2.0/ExternalActivity/Create
PUT  /api/v2.0/ExternalActivity/Update
DELETE /api/v2.0/ExternalActivity/Delete
POST /api/v2.0/ExternalSearch/AddEventItems
POST /api/v2.0/DataFeed/GetData
GET  /api/v2.0/System/GetApiDetails
```

Do not claim these are exact customer-enabled paths until the customer’s route and permissions are confirmed.

### API v2.0 test cases

```txt id="z3om31"
auth succeeds
auth fails
tenant detail returned
wrong community URL
WhoAmI succeeds
WhoAmI forbidden
get contact by contactKey
get contact by legacyContactKey
contact hidden by permission
search contacts
search contacts for mentions
get contact key by email admin-only
get email preferences
update email preferences allowed
update email preferences denied
get my communities
get viewable communities
get communities can contribute
get communities can join
community hidden
community forbidden
join community succeeds
join community forbidden
leave community succeeds
get discussion
post discussion allowed
post discussion denied
reply to discussion allowed
reply denied
get paged discussion posts
continuation token invalid
get event
get upcoming events
get event registrants admin-only
RSVP allowed
RSVP denied
get library documents
post document allowed
multipart upload succeeds
external activity create allowed
external activity denied
external search add allowed
external search add denied
automation rule admin-only
data feed works
demographics visible
permission denied
validation error
malformed JSON response
```

Expected behavior:

```txt id="m7p00x"
API base URL configurable
auth mode configurable
admin-only endpoints tested separately
permission denied is not empty data
pagination/continuation tokens mandatory where applicable
writes disabled by default
raw payload preserved
```

## Mock authentication server

### Purpose

Model Higher Logic API authentication behavior without real credentials.

### Auth modes to simulate

```txt id="e3jyn6"
IAM key/password auth
Authentication/Login token route
OIDC API auth
legacy v2.0 auth
widget auth
user-context token
admin/service-user token
anonymous/guest request
```

### Mock capabilities

```txt id="cp88q8"
valid IAM key/password
invalid IAM key
invalid password
wrong tenant
wrong community URL
expired token
revoked token
token valid but endpoint forbidden
token valid but admin-only endpoint forbidden
token valid but community forbidden
token valid but current user lacks contribution rights
token accidentally logged
Canadian base URL mismatch
```

### Test cases

```txt id="ejyv4x"
valid login returns token
bad login returns 401
wrong community URL returns tenant error
token expires
token revoked
token for user context fails admin endpoint
admin token succeeds admin endpoint
widget auth route succeeds
OIDC auth succeeds
OIDC token wrong audience
legacy auth disabled
secret accidentally logged
```

Expected behavior:

```txt id="vynx3g"
authenticate first
store tokens securely
do not log IAM keys/passwords/tokens
classify 401 separately from 403
wrong tenant/community stops immediately
admin-only permissions surfaced clearly
```

## Mock Push API v2 server

### Purpose

Model Higher Logic Push API v2 behavior for pushing AMS/CRM data into Thrive Community.

### Push API capabilities

```txt id="tndv2a"
POST /contactinfo
POST /list
contact details
groups
demographics
education
job history
addresses
phone numbers
email addresses
orders/products
IsDeleted soft delete behavior
case-sensitive IDs
full-record replacement semantics
list Replace/Add/Remove semantics
date-time parsing
US vs Canada base URL
required field validation
partial payload errors
```

### Mock Push API paths

Use local compatibility paths only.

```txt id="zxkb2v"
POST /v2/contactinfo
POST /v2/list
POST /v2/product
POST /v2/meeting
```

These are local compatibility paths. Do not claim all are enabled for the customer.

### Push API test cases

```txt id="xfoxqe"
push one contact
push organization contact
push individual linked to organization
push contact with groups
push contact with community groups
push contact with security groups
push contact with demographics
push contact with education
push contact with job history
push contact with addresses
push contact with phones
push contact with email addresses
push contact with orders/products
push contact missing required first/last name
push organization missing organization name
case-sensitive ContactId collision
AlternativeContactId not unique
IsDeleted true with only ContactId
contact group BeginDate null active
contact group EndDate null open-ended
Membership group creates security group
Committee group creates community group
Chapter group creates community group
Event group creates community group
unknown GroupType requires support config
date-time UTC parse
date-time offset parse
invalid date-time
full-record replacement removes missing groups
full-record replacement removes missing demographics
list Replace
list Add
list Remove
partial list update
bad credentials
wrong base URL
```

Expected behavior:

```txt id="ush8nv"
Push API route separate from pull API route
full-record replacement semantics tested explicitly
list endpoint partial modes tested separately
case-sensitive IDs preserved
IsDeleted handled as soft delete
group type mapping config-driven
unknown group type blocks until support confirms config
```

## Mock contacts/profile/demographics simulator

### Purpose

Model contact identity, profile fields, demographic fields, visibility, and access.

### Contact cases

```txt id="bcsbxd"
active member
nonmember
expired member
organization
individual linked to organization
primary organization contact
contact excluded from directory
contact do-not-email
contact with no email
contact with duplicate email
contact with changed email
contact with legacy contact key
contact with alternative contact ID
contact with multiple groups
contact with security group
contact with community group
contact with pick demographic
contact with free-form demographic
contact with education
contact with job history
contact with multiple addresses
```

### Test cases

```txt id="ya5npb"
get by contact key
get by legacy contact key
search by email
search by name
admin lookup by primary email
current user profile
profile hidden by permission
demographic type exists
demographic type missing
demographic choice exists
demographic choice missing
pick demographic unknown choice
free-form demographic wrong data type
directory exclusion honored
do-not-email honored
organization relationship changed
member expiration changed
member/nonmember flag changed
```

Expected behavior:

```txt id="ze4ws0"
contactKey and legacyContactKey kept separate
email-only matching requires approval
hidden fields not treated as empty
demographics schema-driven
directory/email preferences respected
```

## Mock communities/groups/security-groups simulator

### Purpose

Model communities, community membership, security groups, group access, and group type mapping.

### Group concepts

```txt id="byyf1m"
community
security group
community group
committee
chapter
event group
membership group
custom group type
role in group
begin date
end date
initial join date
hidden community
viewable community
contributable community
joinable community
invitation
```

### Test cases

```txt id="kljyn3"
get community
community hidden
community forbidden
get my communities
get contact communities
get viewable communities
get communities can contribute
get communities can join
join community allowed
join community denied
leave community allowed
leave community denied
invite to community allowed
invite denied
group BeginDate in future
group EndDate in past
group EndDate null
membership group grants security access
committee group grants community access
chapter group grants community access
event group grants community access
unknown group type rejected
community membership changed
security group removed
```

Expected behavior:

```txt id="v395av"
access decisions config-driven
default deny when group meaning unknown
group IDs not hardcoded without source evidence
begin/end dates honored
hidden community not treated as missing
```

## Mock discussions/questions/answers/blogs/comments simulator

### Purpose

Model user/community content and optional content writes.

### Content objects

```txt id="xz9xj3"
discussion
discussion thread
discussion post
reply
question
answer
recommended/helpful answer
blog
blog comment
generic comment
announcement
tag
mention
subscription/follow
contribution
```

### Test cases

```txt id="dh8rxn"
get discussion
get discussion post
get discussion thread updates
get latest discussion posts
get paged discussion posts
get eligible discussions
post to discussion allowed
post to discussion denied
reply to discussion allowed
reply denied
follow discussion
unfollow discussion
question retrieved
answer retrieved
recommend answer
remove recommendation
blog retrieved
create blog allowed
publish blog allowed
add blog comment
comment retrieved
get comments with before/after key
private community content hidden
admin-only endpoint denied to normal user
content contains HTML
content contains mention
tag reserved for admin
deleted content
```

Expected behavior:

```txt id="q0elzk"
content writes disabled by default
private/community permissions enforced
HTML/body sanitized
pagination tokens handled
admin-only operations require admin context
```

## Mock events/registrants/attendance simulator

### Purpose

Model community event visibility, event search, registrants, RSVP, and attendance.

### Objects

```txt id="f5l8ns"
calendar event
event type
event registrant
event registration status
RSVP-only event
registration event
community event attendance
contact event list
event enabled community
done-state event
recurring event
```

### Test cases

```txt id="xv5b93"
get event
get upcoming events
search current/future events
search includes past events
get event types
save event type allowed
delete event type denied
get event registrant details admin-only
get registrants by event
get paged event registrants
modifiedDateTime filter
event attendance done-state only
community event attendance
contact event list
RSVP to RSVP-only event allowed
RSVP denied for non-RSVP registration type
remove RSVP
parent recurring RSVP applies to occurrences
event hidden by permission
event in private community
event timezone boundary
```

Expected behavior:

```txt id="uh1spu"
event writes/RSVP disabled by default
admin-only registrant data protected
modifiedDateTime incremental sync tested
attendance and registration are distinct
timezone normalized
```

## Mock resource library/document/upload simulator

### Purpose

Model resource-library documents, comments, recommendations, favorites, attachments, and multipart upload.

### Objects

```txt id="j6vazv"
library
library document
document attachment
document comment
favorite
recommendation
related link
upload object
multipart upload part
standard entry
copyright entry
attachment entry
topic community tags
```

### Test cases

```txt id="uecpdr"
get library list
get libraries current user can view
get library document
get library documents
get document attachments
add comment allowed
add comment denied
update comment
delete comment
favorite document
remove favorite
recommend document
remove recommendation
post document allowed
post document denied
small upload single PUT
large upload multipart
multipart upload part missing
multipart upload abort
document from upload succeeds
append attachment succeeds
attachment too large
missing required topic tag
private library hidden
```

Expected behavior:

```txt id="eq7keh"
library writes disabled by default
upload/multipart state machine tested
file-size and attachment rules tested
private library access protected
```

## Mock external activity simulator

### Purpose

Model writeback-style activity creation/update/delete from external systems.

### Objects

```txt id="z9i19p"
external activity
legacy activity key
external activity key
contact key
legacy contact key
activity type
activity date
source system
activity metadata
```

### Test cases

```txt id="c1r6j6"
create external activity allowed
create denied
update external activity allowed
update denied
delete external activity by key
delete by legacy key
duplicate external ID
missing contact
invalid activity type
activity date invalid
timeout before write
timeout after successful write
retry after uncertain outcome
read/reconcile before retry
```

Expected behavior:

```txt id="tqrytw"
external activity writes disabled by default
idempotency key required
never blindly retry uncertain writes
write audit log stored
safe test contact required
```

## Mock external search simulator

### Purpose

Model external search index additions, which may require add-on enablement and separate IAM credentials.

### External search item categories

```txt id="znoqcg"
announcements
library items
library entry items
communities
courses/webinars
blogs
events
pages/navigation
volunteer opportunities
glossary items
```

### Test cases

```txt id="jk0nxy"
add announcement items allowed
add library items allowed
add course items allowed
add event items allowed
add page content allowed
add volunteer opportunity allowed
separate IAM key missing
add-on not enabled
invalid item URL
missing title
duplicate external item
delete/update behavior unknown
private item accidentally indexed
search index delayed
```

Expected behavior:

```txt id="pzah23"
external search route disabled unless add-on confirmed
separate credentials modeled
private-content leak tests required
indexing delay tolerated
```

## Mock automation rules simulator

### Purpose

Model admin-only automation-rule contact pulls and contact-data fields.

### Test cases

```txt id="eefsvk"
get active rules by type
get contacts by rule schedule key
get contact data fields
get contact data with field list
get contact data continuation token
admin-only endpoint denied
invalid rule schedule key
integration ID missing
field missing
field hidden
continuation token expired
large rule result
```

Expected behavior:

```txt id="b6b3wz"
admin-only endpoints protected
field list validated
continuation tokens checkpointed
automation rule outputs treated as contracts
```

## Mock data-feed simulator

### Purpose

Model generic content feed extraction.

### Test cases

```txt id="e0pkki"
data feed returns mixed content
filter announcements
filter blogs
filter discussions
filter questions
filter answers
filter library entries
filter by community
private content excluded
content type unknown
large feed
date filter invalid
schema drift
```

Expected behavior:

```txt id="dbmvee"
content type mapping dynamic
private content rules honored
feed used for display/reporting only unless confirmed
```

## Mock SSO simulator

### Purpose

Model Higher Logic Thrive Community SSO separately from API sync.

### SSO routes to model

```txt id="hcdlsr"
SAML 2.0 SSO
OIDC SSO
OAuth 2.0 Authorization Code SSO
claims-based SSO
AMS/CRM built-in SSO
custom IdP route
```

### SAML/OIDC test cases

```txt id="f9fwc4"
valid SAML login
bad SAML signature
unsigned SAML response
unsigned SP request
expired assertion
clock skew
missing NameID
missing email
wrong audience
wrong recipient
metadata missing
certificate rotated
valid OIDC login
bad issuer
bad audience
missing user-info
logout request signed
logout response invalid
```

### OAuth2 code-flow test cases

```txt id="gruj2t"
authorization request generated
state returned correctly
state mismatch
code returned
code missing
token request succeeds
token request bad client secret
token request wrong redirect URI
profile scope missing unique identifier
profile endpoint missing
profile missing legacy identifier
duplicate identity
JIT provisioning enabled
JIT provisioning disabled
logout
```

Expected behavior:

```txt id="ptdaas"
SSO authenticates identity
API sync and SSO are separate
authorization still uses community/security-group rules
claims/profile mapping customer-configured
SSO secrets not logged
```

## Mock Thrive Marketing guardrail simulator

### Purpose

Prevent accidental mixing of Thrive Community with Thrive Marketing Enterprise/Professional.

### Marketing routes to detect

```txt id="zye65v"
Thrive Marketing Enterprise REST API
Real Magnet-style API
recipient data
message content
groups
tracking metrics
Thrive Marketing Professional SOAP/XML Web Service
Informz ActionRequest
Informz GridRequest
unsubscribers
mailings
```

### Test cases

```txt id="zijxr0"
user asks for message tracking in community adapter
user asks for recipients in community adapter
user asks for Informz GridRequest in community adapter
user asks for Real Magnet REST in community adapter
community route rejects marketing-only endpoint
marketing route requires separate context
```

Expected behavior:

```txt id="wfxexx"
do not mix marketing APIs into community adapter
route decision must explicitly confirm marketing
create separate marketing integration lab if needed
```

## Synthetic data generator

Generate datasets.

### Small

```txt id="w8cdqx"
100 contacts
20 organizations
20 communities
20 security groups
20 community groups
50 demographics
50 discussion threads
200 discussion posts
30 questions
100 answers
20 blogs
100 comments
20 events
100 registrants
20 libraries
100 library documents
50 external activities
50 external search items
20 automation-rule records
50 push payloads
```

### Medium

```txt id="o1grsp"
100,000 contacts
10,000 organizations
1,000 communities
1,000 security groups
2,000 community groups
500 demographics
500,000 discussion threads
2,000,000 discussion posts
100,000 questions
500,000 answers
50,000 blogs
1,000,000 comments
25,000 events
500,000 registrants
5,000 libraries
250,000 library documents
1,000,000 external activities
500,000 external search items
100,000 automation-rule records
1,000,000 push payloads
```

### Large

```txt id="we2ip1"
5,000,000 contacts
500,000 organizations
50,000 communities
50,000 security groups
100,000 community groups
50,000 demographics
50,000,000 discussion threads
500,000,000 discussion posts
10,000,000 questions
50,000,000 answers
5,000,000 blogs
100,000,000 comments
1,000,000 events
25,000,000 registrants
100,000 libraries
10,000,000 library documents
100,000,000 external activities
50,000,000 external search items
10,000,000 automation-rule records
100,000,000 push payloads
```

### Edge cases

```txt id="xkot9z"
duplicate email
missing email
changed email
organization contact
individual linked to organization
deleted contact
excluded from directory
do-not-email contact
expired member
future member expiration
group BeginDate in future
group EndDate in past
unknown group type
case-sensitive ID collision
demographic choice missing
date-time offset mismatch
private community
hidden community
discussion in private community
post by deleted user
answer recommended then removed
event done-state false
registrant modified during pagination
library document over size limit
multipart upload abandoned
external activity duplicate
external search indexes private content
Push API missing group removes group
Push API list Add partial
Push API list Replace full
OIDC claim missing
SAML certificate rotated
rate limit after N requests
```

## Error simulator

Mock all important failures.

```txt id="m88p2m"
400 bad request
401 unauthorized
403 forbidden
404 not found
409 duplicate/conflict
422 validation failure
429 excessive request rate
500 server error
502 bad gateway
503 unavailable
504 timeout
invalid IAM key
invalid IAM password
invalid OIDC token
expired token
revoked token
wrong community URL
Canadian/US base URL mismatch
admin-only endpoint denied
community permission denied
private content hidden
continuation token invalid
malformed JSON
HTML error page instead of JSON
empty response
Push API full-record replacement unexpected removal
Push API invalid DateTime
SSO bad signature
SSO state mismatch
external search add-on disabled
external activity write uncertain
```

Expected behavior:

```txt id="w8gpft"
400 -> fail fast
401 -> re-auth if safe
403 -> permission/admin issue
404 -> reconcile missing record
409 -> idempotency/conflict handling
422 -> mapping/data issue
429 -> backoff and reduce rate
5xx -> bounded retry
timeout on read -> retry
timeout on write -> reconcile first
malformed response -> quarantine
wrong base URL/community -> stop immediately
```

## Rate limit / pagination simulator

### Purpose

Model Higher Logic API usage limits, continuation-token paging, and large sync behavior.

### Pagination styles to test

```txt id="ewpdjo"
maxRecords
continuationToken
afterContactKey
beforeContactKey
afterCommentKey
beforeCommentKey
afterReplyDiscussionPostKey
beforeReplyDiscussionPostKey
Link header rel=next
modifiedDateTime incremental filter
fieldList selective fields
large feed paging
Push API list chunking
```

### Test cases

```txt id="rghkt1"
single page
multiple pages
empty first page
empty middle page
empty final page
continuation token expired
continuation token malformed
Link header missing
Link header malformed
duplicate records across pages
record changes during pagination
same modifiedDateTime collision
429/excessive use
IP block simulation
retry budget exhausted
customer Canadian base URL
```

Expected behavior:

```txt id="bgtmho"
pagination mandatory on list endpoints
checkpoint after safe page completion
dedupe by stable key
use lookback window for modifiedDateTime
honor conservative request rate
reduce concurrency under stress
alert after retry budget exhausted
base URL config-driven
```

## Secret and PII redaction tests

Test that logs never expose:

```txt id="g2hru9"
IAM key
IAM password
OIDC client secret
OAuth2 client secret
access token
refresh token
SAML private key
OIDC secret
Authorization header
SSO assertion
SSO code
session cookie
PrimaryEmailAddress in unsafe logs
phone number
address
demographic sensitive fields
private community content
moderation-sensitive content
raw push payloads in production logs unless explicitly allowed
```

Expected behavior:

```txt id="md0q1x"
redact secrets
redact tokens
minimize PII
private community content protected
debug payload logging disabled by default
CI fails if secrets appear in logs
```

## Contract tests

Create contract tests that run against:

```txt id="ow0bki"
mock
customer-test-community
production-smoke
```

Environment selector:

```txt id="fbxvdl"
TEST_TARGET=mock
TEST_TARGET=customer-test-community
TEST_TARGET=production-smoke
```

Mock can run destructive/bad scenarios.

Customer test community runs approved safe tests.

Production smoke is tiny and mostly read-only.

### Contract test suites

```txt id="ee2xtt"
auth.contract.test.ts
tenant.contract.test.ts
contacts.contract.test.ts
demographics.contract.test.ts
communities-groups.contract.test.ts
discussions-content.contract.test.ts
questions-answers.contract.test.ts
blogs-comments.contract.test.ts
events-registrants.contract.test.ts
resource-library.contract.test.ts
external-activity.contract.test.ts
external-search.contract.test.ts
automation-rules.contract.test.ts
data-feed.contract.test.ts
push-api.contract.test.ts
sso-saml-oidc.contract.test.ts
sso-oauth2-code-flow.contract.test.ts
marketing-guardrail.contract.test.ts
pagination.contract.test.ts
rate-limit.contract.test.ts
errors.contract.test.ts
redaction.contract.test.ts
write-safety.contract.test.ts
```

## Postman / Newman / OpenAPI strategy

Generate:

```txt id="jmk9so"
postman/higherlogic-thrive-local.postman_collection.json
postman/higherlogic-thrive-local.postman_environment.json
postman/higherlogic-thrive-errors.postman_collection.json
postman/higherlogic-thrive-push-api.postman_collection.json
postman/higherlogic-thrive-sso.postman_collection.json
postman/higherlogic-thrive-content-writes.postman_collection.json
postman/higherlogic-thrive-external-activity.postman_collection.json
```

Generate OpenAPI fixtures:

```txt id="uxsi0n"
openapi/higherlogic-community-api-v2-compatibility.openapi.yaml
openapi/higherlogic-push-api-v2-compatibility.openapi.yaml
openapi/higherlogic-sso-compatibility.openapi.yaml
```

Generate schemas:

```txt id="y2riji"
schemas/contact.schema.json
schemas/contact-group.schema.json
schemas/demographic.schema.json
schemas/community.schema.json
schemas/discussion.schema.json
schemas/discussion-post.schema.json
schemas/question.schema.json
schemas/answer.schema.json
schemas/blog.schema.json
schemas/comment.schema.json
schemas/event.schema.json
schemas/event-registrant.schema.json
schemas/library-document.schema.json
schemas/external-activity.schema.json
schemas/external-search-item.schema.json
schemas/push-contactinfo.schema.json
schemas/push-list.schema.json
schemas/error.schema.json
```

Newman/tests should verify:

```txt id="kvwnpo"
auth succeeds
bad auth fails
tenant lookup validates
WhoAmI validates
contacts validate
communities validate
discussions validate
events validate
library documents validate
Push API payload validates
External Activity idempotency validates
External Search add-on disabled scenario validates
pagination works
rate-limit behavior handled
malformed JSON rejected
content writes disabled by default
external activity writes disabled by default
secrets not logged
```

## Customer test-community calibration process

When customer test-community credentials or API docs arrive:

```txt id="l0phd2"
1. Confirm product: Thrive Community, not Vanilla, not Thrive Marketing.
2. Confirm integration route.
3. Confirm API base URL.
4. Confirm US vs Canadian base URL if applicable.
5. Confirm auth method.
6. Confirm IAM/OIDC/legacy auth details.
7. Confirm Push API v2 or API v2 route.
8. Confirm SSO route if in scope.
9. Run auth smoke test.
10. Run tenant/community URL smoke test.
11. Run WhoAmI or current-contact smoke test.
12. Fetch one known safe contact.
13. Fetch one known contact with security groups if allowed.
14. Fetch demographic types/choices if in scope.
15. Fetch one known community.
16. Fetch viewable communities.
17. Fetch one known discussion/post if in scope.
18. Fetch one known event if in scope.
19. Fetch one known registrant only if approved.
20. Fetch one known library/document if in scope.
21. Test Push API with one test contact only if approved.
22. Test External Activity with one harmless test record only if approved.
23. Test External Search only if add-on/credentials confirmed.
24. Validate one harmless permission error.
25. Validate pagination/continuation token on one safe endpoint.
26. Validate SSO test user if SSO is in scope.
27. Capture sanitized request/response examples.
28. Compare test-community schema against mock schema.
29. Update mock fixtures.
30. Update mapping config.
31. Re-run contract tests against mock.
32. Re-run approved contract tests against test community.
```

Do not start with:

```txt id="p0z7b7"
full contact export
full community export
all discussions
all private communities
all registrants
Push API bulk load
content writes
external activity writes
external search indexing
production credentials
```

## Production smoke-test plan

Production tests must be tiny and approved.

### Read-only production smoke

```txt id="m4ukup"
authenticate
confirm tenant/community URL
call WhoAmI or safe current-contact endpoint
fetch one known safe contact
fetch one known safe community
fetch one known public discussion/post if in scope
fetch one known public event if in scope
fetch one known library document if in scope
verify expected fields exist
stop
```

### Write production smoke

Only after written approval.

```txt id="q5bpde"
push one harmless test contact to a test group
or create one harmless external activity for a test contact
or post one harmless test discussion/comment in a hidden/test community
or RSVP one test user to a test RSVP-only event
or add one external search test item only if indexing route approved
use external reference or reconciliation where possible
read/reconcile result
confirm no duplicate
document result
stop
```

Production broad sync is not allowed until read-only smoke passes.

Production Push API bulk load is not allowed until test Push API smoke passes.

Production content writes, RSVP writes, external activity writes, external search indexing, or demographic/group rewrites are not allowed unless explicitly approved.

## Customer/vendor/admin request packet

Claude Code must create:

```txt id="bdpc36"
docs/customer-admin-request.md
docs/vendor-api-doc-request.md
docs/customer-discovery-questionnaire.md
```

Ask for:

### Product/route

```txt id="svf9x9"
Confirm this is Higher Logic Thrive Community, not Vanilla and not Thrive Marketing.
Is API v2.0 in scope?
Is Push API v2 in scope?
Is Push API v1 / hybrid claims route in scope?
Is SSO in scope?
Is SAML, OIDC, OAuth2 code flow, or claims-based SSO in scope?
Is contact/profile sync in scope?
Is community/security group sync in scope?
Are discussions/blogs/questions/answers in scope?
Are events/registrants in scope?
Is resource library in scope?
Is External Activity in scope?
Is External Search in scope?
Are Automation Rules in scope?
Is DataFeed in scope?
Is Volunteer in scope?
Is there a test community?
```

### Credentials/access

```txt id="edq17t"
API base URL
US or Canada network
IAM key
IAM password
OIDC client credentials if used
legacy-auth details if used
Push API credentials if used
External Search separate IAM key if used
SSO metadata/settings
service/admin test user
safe current user
credential rotation process
secure secret delivery process
production credentials later
```

### Tenant/community

```txt id="r0byj4"
community URL
tenant key if known
microsite details
community keys
community names
hidden/private community rules
community contribution rules
community join rules
sample safe communities
```

### Contacts and groups

```txt id="odl0zc"
contact key field
legacy contact key field
AMS/CRM external ID field
primary email rule
member/nonmember rule
member expiration rule
directory exclusion rule
do-not-email rule
security group mapping
community group mapping
group type mapping
custom group types needing support configuration
sample active member
sample expired member
sample nonmember
sample organization
sample contact with multiple groups
```

### Demographics/profile fields

```txt id="dnuqd5"
demographic types
demographic choices
pick vs free-form rules
custom demographics
visible profile fields
sensitive fields
education/job/address/phone/email scope
sample records
```

### Content

```txt id="iwq8v4"
discussions in scope?
questions/answers in scope?
blogs in scope?
comments in scope?
announcements in scope?
content write permissions?
private content in scope?
safe test discussion/post
safe test community
content sanitization expectations
```

### Events

```txt id="m9qb9b"
events in scope?
event type filters?
registrants in scope?
attendance in scope?
RSVP writes in scope?
event registration system source of truth?
sample event key
sample calendar event key
sample registrant
modifiedDateTime incremental rules
```

### Resource library

```txt id="jiywia"
library sync in scope?
document uploads in scope?
attachment uploads in scope?
multipart uploads in scope?
file-size limits to test?
private libraries?
safe test library
safe test document
```

### Push API

```txt id="efmp7k"
Push API enabled?
Push API version?
contactinfo route?
list route?
full-record replacement approved?
list Add/Remove/Replace rules?
GroupType mapping?
IsDeleted usage?
case-sensitive ID expectations?
safe test contact payload
```

### SSO

```txt id="jdonke"
SAML/OIDC/OAuth2/claims route?
IdP owner
IdP metadata
SP metadata
client ID/client secret if OAuth2
authorization endpoint
token endpoint
profile endpoint
redirect URI
unique identifier claim
email claim
member access claim
JIT/provisioning behavior
test users
logout behavior
```

### External Activity / External Search

```txt id="t62k97"
External Activity in scope?
activity types
activity keys
contact matching rule
idempotency field
safe test activity
External Search add-on enabled?
separate IAM key?
item types to index
private content restrictions
search delay expectations
```

### Performance / limits

```txt id="j5736h"
expected contact count
expected community count
expected group count
expected discussion/post count
expected event/registrant count
expected Push API batch size
expected sync frequency
API usage guidance
maintenance windows
support escalation path
```

## Repository structure

```txt id="hdg0qc"
higherlogic-thrive-community-integration-lab/
  README.md
  higherlogic-thrive-community-integration-lab-context.md
  docker-compose.yml
  .env.example

  docs/
    no-invention-policy.md
    source-register.md
    evidence-log.md
    unknowns-register.md
    customer-admin-request.md
    vendor-api-doc-request.md
    customer-discovery-questionnaire.md
    product-route-decision.md
    implementation-readiness-checklist.md
    test-community-validation-checklist.md
    production-readiness-checklist.md
    adapter-design.md
    mock-server-design.md
    api-v2-test-plan.md
    auth-test-plan.md
    push-api-test-plan.md
    sso-test-plan.md
    contacts-profile-test-plan.md
    communities-groups-test-plan.md
    content-sync-test-plan.md
    events-registrants-test-plan.md
    resource-library-test-plan.md
    external-activity-test-plan.md
    external-search-test-plan.md
    automation-rules-test-plan.md
    marketing-guardrail-plan.md
    pagination-rate-limit-plan.md
    write-safety-plan.md
    redaction-plan.md

  config/
    customer.example.json
    capabilities.example.json
    mappings.example.json
    source-register.schema.json
    unknowns-register.schema.json
    route.template.json

  openapi/
    higherlogic-community-api-v2-compatibility.openapi.yaml
    higherlogic-push-api-v2-compatibility.openapi.yaml
    higherlogic-sso-compatibility.openapi.yaml

  schemas/
    contact.schema.json
    contact-group.schema.json
    demographic.schema.json
    community.schema.json
    discussion.schema.json
    discussion-post.schema.json
    question.schema.json
    answer.schema.json
    blog.schema.json
    comment.schema.json
    event.schema.json
    event-registrant.schema.json
    library-document.schema.json
    external-activity.schema.json
    external-search-item.schema.json
    push-contactinfo.schema.json
    push-list.schema.json
    automation-rule-contact-data.schema.json
    data-feed.schema.json
    error.schema.json

  mock-server/
    package.json
    src/
      server.ts
      auth.ts
      iamAuth.ts
      oidcAuth.ts
      legacyAuth.ts
      tenant.ts
      contacts.ts
      demographics.ts
      communities.ts
      groups.ts
      discussions.ts
      questions.ts
      answers.ts
      blogs.ts
      comments.ts
      events.ts
      eventRegistrants.ts
      resourceLibrary.ts
      uploads.ts
      externalActivity.ts
      externalSearch.ts
      automationRules.ts
      dataFeed.ts
      volunteer.ts
      emailPreferences.ts
      codeOfConduct.ts
      system.ts
      pushApi.ts
      pushContactInfo.ts
      pushList.ts
      sso.ts
      samlOidc.ts
      oauth2CodeFlow.ts
      marketingGuardrails.ts
      pagination.ts
      rateLimits.ts
      errors.ts
      redaction.ts
      scenarios.ts

  fixtures/
    contacts/
    organizations/
    groups/
    communities/
    demographics/
    discussions/
    posts/
    questions/
    answers/
    blogs/
    comments/
    events/
    registrants/
    libraries/
    documents/
    external-activities/
    external-search/
    automation-rules/
    push-api/
    sso/
    errors/

  synthetic-data/
    generate-contacts.ts
    generate-organizations.ts
    generate-groups.ts
    generate-demographics.ts
    generate-discussions.ts
    generate-posts.ts
    generate-questions-answers.ts
    generate-events.ts
    generate-registrants.ts
    generate-resource-library.ts
    generate-external-activities.ts
    generate-push-payloads.ts
    generate-edge-cases.ts

  postman/
    higherlogic-thrive-local.postman_collection.json
    higherlogic-thrive-local.postman_environment.json
    higherlogic-thrive-errors.postman_collection.json
    higherlogic-thrive-push-api.postman_collection.json
    higherlogic-thrive-sso.postman_collection.json
    higherlogic-thrive-content-writes.postman_collection.json
    higherlogic-thrive-external-activity.postman_collection.json

  tests/
    source-register.test.ts
    no-invention-policy.test.ts
    route-decision.test.ts
    auth.test.ts
    tenant.test.ts
    contacts.test.ts
    demographics.test.ts
    communities-groups.test.ts
    discussions-content.test.ts
    questions-answers.test.ts
    blogs-comments.test.ts
    events-registrants.test.ts
    resource-library.test.ts
    external-activity.test.ts
    external-search.test.ts
    automation-rules.test.ts
    data-feed.test.ts
    push-api.test.ts
    sso-saml-oidc.test.ts
    sso-oauth2-code-flow.test.ts
    marketing-guardrail.test.ts
    pagination.test.ts
    rate-limit.test.ts
    write-safety.test.ts
    errors.test.ts
    redaction.test.ts
    contract.test.ts

  ci/
    github-actions.yml
```

## Implementation readiness checklist

Not ready for real implementation until:

```txt id="v0zye9"
product confirmed as Thrive Community
integration route confirmed
official docs identified for route
API base URL confirmed
US vs Canada route confirmed
auth method confirmed
IAM/OIDC/legacy credentials process confirmed
test community confirmed or unavailable risk accepted
contact/profile schema confirmed
contact key / legacy contact key mapping confirmed
community/group/security group mapping confirmed
demographic schema confirmed
SSO scope confirmed or out of scope
Push API scope confirmed or out of scope
event/registrant scope confirmed or out of scope
content read/write scope confirmed
resource library scope confirmed or out of scope
external activity scope confirmed or out of scope
external search scope confirmed or out of scope
marketing route explicitly separated
sample records received
support escalation path confirmed
```

## Test-community validation checklist

Minimum test-community tests:

```txt id="vrka25"
auth/token succeeds
bad auth fails as expected
tenant/community lookup succeeds
WhoAmI/current contact succeeds
known contact fetched
known demographic fetched if in scope
known community fetched
known viewable communities fetched
known discussion/post fetched if in scope
known event fetched if in scope
known registrant fetched only if approved
known library document fetched if in scope
pagination/continuation token verified
Push API test contact pushed only if approved
External Activity write tested only if approved
External Search test item indexed only if approved
SSO test user works if in scope
permission error tested if safe
writes not tested until approved
```

## Production readiness checklist

Production not ready until:

```txt id="f92hlx"
test-community validation passed or customer accepted no-test-community risk
mock calibrated to customer API behavior
field mappings approved
community/group/security rules approved
demographic mappings approved
SSO behavior approved
Push API behavior approved if in scope
content read/write behavior approved
event/registrant behavior approved
resource-library behavior approved
external activity behavior approved
external search behavior approved
secret storage approved
redaction tests passed
rollback/reconciliation plan exists
support escalation path exists
monitoring exists
```

## Claude Code prompt

Use this prompt with Claude Code:

```txt id="kzxxvj"
You are building a production-shaped Higher Logic Thrive Community Integration Lab.

Goal:
Create a source-acquisition and no-credentials testing framework for Higher Logic Thrive Community before real credentials arrive.

Do not invent real customer endpoint details.

Do not mix this with Higher Logic Vanilla or Higher Logic Thrive Marketing unless the route decision explicitly confirms that product.

Build:
1. Source register, evidence log, unknowns register, and no-invention policy.
2. Product-route decision system for Community API v2.0 IAM auth, OIDC auth, legacy auth, Push API v2, Push API v1/hybrid claims, SAML SSO, OIDC SSO, OAuth2 Code Flow SSO, AMS built-in SSO, contact/profile sync, community/security group sync, content sync, event/registrant sync, resource library sync, External Activity, External Search, Automation Rules, DataFeed, Volunteer, custom middleware, and hybrid route.
3. Higher Logic Thrive Community adapter interface.
4. Mock API v2.0 server with Authentication, Contacts, Communities, Discussions, Questions, Answers, Blogs, Comments, Events, ResourceLibrary, ExternalActivity, ExternalSearch, AutomationRules, DataFeed, Demographics, System, and Volunteer behavior.
5. Mock authentication server with IAM key/password, OIDC API auth, legacy auth, widget auth, user-context token, admin/service-user token, wrong-tenant, wrong-base-URL, expired-token, and permission-denied scenarios.
6. Mock Push API v2 server with /contactinfo, /list, full-record replacement semantics, list Replace/Add/Remove semantics, case-sensitive IDs, IsDeleted, groups, demographics, education, job history, addresses, phones, emails, and orders/products.
7. Mock contacts/profile/demographics simulator.
8. Mock communities/groups/security-groups simulator.
9. Mock discussions/questions/answers/blogs/comments simulator.
10. Mock events/registrants/attendance simulator.
11. Mock resource-library/document/upload simulator with multipart upload state machine.
12. Mock External Activity simulator with idempotency and unsafe retry protection.
13. Mock External Search simulator with add-on/separate-IAM-key/private-content-leak tests.
14. Mock Automation Rules and DataFeed simulators.
15. Mock SAML/OIDC/OAuth2 Code Flow SSO simulator.
16. Mock Thrive Marketing guardrail simulator so marketing APIs are not mixed into the community adapter.
17. Synthetic data generator for contacts, organizations, groups, communities, demographics, discussions, posts, questions, answers, events, registrants, library documents, external activities, external search items, automation-rule records, and Push API payloads.
18. Error simulator for 400/401/403/404/409/422/429/500/503/timeouts/invalid IAM key/wrong community/continuation token invalid/Push API replacement mistakes/SSO state mismatch.
19. Secret/PII/private-content redaction tests.
20. Postman/Newman, OpenAPI, and schema files.
21. Contract tests that run against mock first, customer test community later, and production-smoke last.
22. Customer/vendor/admin request packet.
23. Test-community calibration checklist.
24. Production smoke-test checklist.

Rules:
- Real adapter disabled until route and official docs/customer config/test community are confirmed.
- Official Higher Logic Community API docs are generic API authority, but customer support/config/test responses are required for customer-specific fields and permissions.
- Push API and API v2 are separate routes.
- External Search may require add-on/separate IAM access and must not be assumed.
- Thrive Marketing APIs are separate and must not be mixed into Thrive Community.
- All real implementation facts must cite source/evidence entries.
- Do not log IAM keys, IAM passwords, OIDC secrets, OAuth2 client secrets, SAML private keys, tokens, Authorization headers, SSO assertions, emails, phone numbers, addresses, sensitive demographics, private community content, or raw production payloads.
- Every write must use idempotency or reconciliation where possible.
- Never blindly retry uncertain writes.
- Push API bulk updates, content writes, RSVP writes, External Activity writes, External Search writes, and demographic/group rewrites are disabled unless explicitly approved.
- Full sync is not allowed until tiny test-community tests pass.

The output should be detailed enough that a developer can run the local mock lab and test nearly every integration failure mode before real Higher Logic Thrive Community credentials arrive.
```

## Bottom line

The correct Higher Logic Thrive Community strategy is:

```txt id="bvbj0o"
Do not wait for real credentials to build.

Build the mock API v2 / auth / Push API / SSO / contacts / groups / communities / discussions / events / resource library / external activity / external search lab now.
Use official docs to shape the mock.
Keep customer-specific facts in config and evidence logs.
When test-community credentials arrive, run the same contract tests against the test community.
Update the mock to match test-community behavior.
Only then run tiny production smoke tests.
```

The mock should be almost real in behavior, but honest in naming.

It is a compatibility lab, not a claim that the real customer’s Higher Logic Thrive Community site has been validated.

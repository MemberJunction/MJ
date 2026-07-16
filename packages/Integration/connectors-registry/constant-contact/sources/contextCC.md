# constant-contact-integration-lab-context.md

## Purpose

This file is a Claude Code / agent-ready context document for building and testing a production-shaped **Constant Contact** integration when the developer does **not** yet have real Constant Contact credentials, API key, client ID, client secret, redirect URI, authorization code, access token, refresh token, authorized Constant Contact account, account ID, contact lists, segments, tags, custom fields, campaign IDs, email campaign activity IDs, reporting access, partner webhook subscription access, SMS permissions, account-services permissions, production send approval, or customer-approved write permissions.

The goal is not to pretend to validate a customer’s real Constant Contact account.

The goal is to build the strongest legal Constant Contact Integration Lab possible using:

```txt id="yloixk"
official Constant Contact V3 API documentation
official Constant Contact OAuth2 documentation
official Constant Contact API Reference
official Constant Contact scopes documentation
official Constant Contact contacts/lists/segments/tags/custom-fields documentation
official Constant Contact bulk activity documentation
official Constant Contact email campaign documentation
official Constant Contact campaign activity documentation
official Constant Contact reporting documentation
official Constant Contact account services documentation
official Constant Contact partner webhook documentation
official Constant Contact webhook authenticity documentation
official Constant Contact rate-limit and response-code documentation
customer/admin-provided Constant Contact configuration
customer-provided app credentials later
customer test account or safe test campaign later
local Constant Contact V3 API compatibility mock
local OAuth2 authorization server simulator
local PKCE authorization simulator
local device-flow simulator
local refresh-token simulator
local scopes/permissions simulator
local contacts/lists/tags/custom-fields simulator
local segments simulator
local bulk activities simulator
local email campaigns simulator
local campaign activities simulator
local campaign scheduling/sending guardrail simulator
local campaign reporting simulator
local contact tracking/reporting simulator
local account services simulator
local partner webhook simulator
local webhook signature/JWKS simulator
local SMS route simulator if confirmed
local legacy event/EventSpot guardrail simulator if mentioned
local Zapier/Make/native integration route simulator
synthetic contacts
synthetic lists
synthetic tags
synthetic segments
synthetic custom fields
synthetic email campaigns
synthetic campaign activities
synthetic campaign sends
synthetic opens/clicks/bounces/unsubscribes
synthetic bulk imports/exports
synthetic webhook deliveries
OpenAPI compatibility fixtures
Postman/Newman collections
contract tests
CI
customer-test-account calibration scripts
production smoke-test plan
```

The standard is:

```txt id="qmzr3d"
Mock real first.
Calibrate with a customer test account or authorized Constant Contact account later.
Smoke test production last.
```

## Non-negotiable rule

Claude Code must not invent customer-specific Constant Contact implementation details.

Claude Code may model Constant Contact-like behavior, especially V3 REST API behavior, OAuth2 authorization behavior, scopes, contacts, contact lists, tags, segments, custom fields, bulk activities, campaigns, campaign activities, reporting, and partner webhooks, but every mock must be clearly labeled as a compatibility mock.

Use names like:

```txt id="caa60d"
constant-contact-compatibility-mock
mock-constant-contact-v3-api-server
mock-constant-contact-oauth-server
mock-constant-contact-webhook-server
mock-constant-contact-campaign-server
```

Do not use names like:

```txt id="dig0ve"
real-constant-contact-api
official-constant-contact-client
production-constant-contact-adapter
```

until official docs, customer credentials, and test-account validation exist.

Every real implementation claim must have evidence:

```txt id="lftgxc"
official Constant Contact docs
official API Reference
customer docs
vendor/support docs
test-account response
admin confirmation
approved partner implementation doc
```

Partner pages, Zapier pages, Make pages, community posts, GitHub examples, blogs, and old V2 examples are behavioral clues only unless the customer confirms that exact route.

## Critical product distinction

Do not mix these routes without confirmation:

```txt id="eqzawi"
1. Constant Contact V3 API
   Current main API route.
   OAuth2-based access.
   Contacts, lists, tags, segments, custom fields, campaigns, campaign activities, reporting, activities, account services, and related resources.

2. Constant Contact Partner Webhooks
   Partner/application-level webhook route.
   Separate setup and subscription model.
   Not a general inbound webhook mechanism for creating contacts.

3. Constant Contact legacy V2 / EventSpot APIs
   Older API surfaces.
   Treat as legacy/confirmed-only.
   Do not mix old EventSpot/event docs into V3 unless the customer explicitly confirms legacy events are in scope.

4. Constant Contact SMS
   Treat as permission/scope/product-plan-dependent.
   Do not assume SMS campaign access exists.

5. Zapier / Make / native app routes
   No-code or partner-style routes.
   Useful, but not equivalent to full V3 API access.
```

For this file, assume:

```txt id="rw0253"
Constant Contact V3 API first
```

and only include partner webhooks, SMS, legacy events, Zapier, or Make when route discovery confirms they are in scope.

## Core framing

Constant Contact is not one single route.

Treat it as a marketing platform with multiple possible integration surfaces.

Possible routes:

```txt id="kku8fc"
Constant Contact V3 REST API route
OAuth2 Authorization Code route
OAuth2 PKCE route
OAuth2 Device Authorization route
OAuth2 client/two-legged route if customer/app type supports it
refresh-token route
contacts sync route
contact lists route
tags route
custom fields route
segments route
bulk activity import/export route
email campaign route
email campaign activity route
campaign schedule/send route
campaign reporting route
contact tracking route
account services route
partner webhooks route
webhook authenticity/JWKS validation route
SMS route if product/scopes confirm
Zapier route
Make route
native integration route
CRM/AMS sync route
data warehouse/reporting route
legacy V2/EventSpot route only if confirmed
custom middleware route
hybrid route
```

The first task is not coding the real adapter.

The first task is:

```txt id="xnq2qv"
identify the route
collect authoritative source docs
build mocks for likely routes
make real adapter disabled until route is confirmed
run contract tests against the mock
calibrate with customer test account or authorized API credentials later
```

## What can be built without real credentials

Without real credentials, Claude Code can legally build:

```txt id="dglqfd"
source register
evidence log
unknowns register
route decision file
customer/vendor/admin request packet
Constant Contact adapter interface
mock V3 REST API server
mock OAuth2 authorization server
mock OAuth2 token server
mock refresh-token behavior
mock PKCE behavior
mock device-flow behavior
mock scopes/permissions server
mock contacts server
mock contact lists server
mock tags server
mock custom fields server
mock segments server
mock activities server
mock bulk contact import/export server
mock email campaigns server
mock campaign activities server
mock scheduling/sending guardrail server
mock reporting server
mock contact tracking server
mock account services server
mock partner webhook subscription server
mock webhook sender/receiver
mock webhook signature/JWKS validation server
mock SMS route if confirmed
mock Zapier/Make route
mock CRM/AMS sync route
mock data warehouse sync route
mock legacy EventSpot guardrail route
synthetic contacts
synthetic lists
synthetic tags
synthetic segments
synthetic custom fields
synthetic campaigns
synthetic campaign activities
synthetic sends
synthetic opens/clicks/bounces/unsubscribes
synthetic bulk activities
synthetic webhooks
OpenAPI compatibility fixtures
Postman/Newman collections
contract tests
rate-limit/error tests
CI tests
test-account calibration scripts
production smoke-test checklist
```

Without real credentials, Claude Code cannot honestly prove:

```txt id="g5hwyx"
the real customer API key
the real customer client ID
the real customer client secret
the real customer redirect URI
the real customer OAuth flow
the real access token
the real refresh token
the real granted scopes
the real account ID
the real authorized account user role
the real contact field schema
the real custom fields
the real contact lists
the real segments
the real tags
the real campaign templates
the real email campaign activity behavior
the real campaign send/schedule permissions
the real reporting access
the real partner webhook configuration
the real webhook subscription topics
the real SMS access
the real account-services permissions
the real rate-limit behavior under customer load
the real production performance
```

So the mock lab proves architecture and safety.

The customer test account or authorized Constant Contact account proves real compatibility.

Production smoke tests prove safe live access.

## Source authority hierarchy

Claude Code must rank Constant Contact sources in this order.

### Tier 0 — Official Constant Contact V3 API documentation and API Reference

Highest public authority for generic API behavior.

Use for:

```txt id="vokryo"
V3 API concepts
base API behavior
OAuth2 requirement
authorization code flow
PKCE flow
device flow
scopes
contacts
contact lists
tags
custom fields
segments
activities
bulk imports/exports
email campaigns
campaign activities
schedule/send behavior
reporting
account services
response codes
pagination
rate limits
webhooks
webhook authenticity
request/response shapes
```

Do not use for customer-specific credentials, granted scopes, account role, list IDs, segment IDs, custom field names, campaign IDs, or send approval.

### Tier 1 — Customer/admin-provided Constant Contact configuration

Highest authority for customer-specific behavior.

Get from:

```txt id="ix2tys"
customer Constant Contact account owner
customer Constant Contact administrator
customer marketing operations team
customer email marketing team
customer CRM/AMS admin
customer IT/security team
customer integration owner
customer developer application owner
customer account services owner
customer webhook subscription owner
customer secure document handoff
customer admin screen share
customer internal implementation folder
```

Use for:

```txt id="qnih2p"
real app/client setup
real API key/client ID
real client secret delivery process
real redirect URI
real OAuth flow
real required scopes
real account user/role
real contact lists
real tags
real segments
real custom fields
real consent/source-of-contact rules
real unsubscribe handling
real email campaign templates
real campaign activity IDs
real campaign scheduling/sending permissions
real reporting requirements
real webhook subscription setup
real account service permissions
real SMS access if any
safe test contacts
safe test lists
safe test campaigns
write/update approvals
```

Customer admin configuration beats generic public examples.

### Tier 2 — Customer test account / authorized test observations

Use after authorized access exists.

Get from:

```txt id="y6482f"
customer Constant Contact admin
customer marketing operations owner
customer developer app owner
customer test account owner
customer safe production test campaign owner
customer IT/security team
```

Use for:

```txt id="p4yj4w"
verifying OAuth flow
verifying token refresh
verifying granted scopes
verifying account identity
verifying contact schema
verifying custom fields
verifying list/tag/segment IDs
verifying bulk activity behavior
verifying campaign creation behavior
verifying campaign activity behavior
verifying reporting shape
verifying partner webhook delivery
verifying webhook signature verification
verifying pagination
verifying rate-limit behavior
verifying writes only after approval
```

Test-account observations beat assumptions.

### Tier 3 — Constant Contact support / developer portal / app management UI

Use this to clarify official docs, app setup, OAuth setup, redirect URI issues, scopes, rate limits, webhooks, partner status, and product access.

Ask support/customer admin for:

```txt id="d4fasy"
which API docs apply
whether V3 API is the intended route
which OAuth flow should be used
how the app should be registered
which redirect URIs are allowed
which scopes are required
how refresh tokens should be handled
whether partner webhooks are available
which webhook topics are available
whether SMS endpoints/scopes are available
whether campaign sending requires additional review/approval
whether account-services endpoints require account owner role
how to test safely with a dummy contact/campaign
support escalation path
```

Use developer portal/app UI output as evidence only when it is captured for the customer’s app.

### Tier 4 — Official OAuth2 and scopes documentation

Use for authorization modeling.

Use for:

```txt id="xmbmmf"
authorization code flow
PKCE flow
device flow
implicit flow if legacy/public-client context requires it
token exchange
refresh tokens
scope selection
offline access behavior
account-level consent
OAuth errors
token expiry
token revocation
```

Do not hardcode granted scopes until the customer’s app authorization has been completed and inspected.

### Tier 5 — Official contacts/lists/tags/custom-fields/segments docs

Use for contact model and segmentation route modeling.

Use for:

```txt id="buk7mw"
contact payload shape
contact subresources
list membership
tag membership
custom field definitions
custom field values
segment definitions
contact status
unsubscribe/opt-out behavior
source-of-contact/permission concepts
bulk activity interactions
```

Do not assume the customer uses any specific list/tag/segment/custom-field names.

### Tier 6 — Official activities/bulk import/export docs

Use when bulk operations are in scope.

Use for:

```txt id="p5cr1h"
bulk contact imports
bulk tag/list membership updates
activity status polling
activity queued/completed/failed states
activity result files
activity queue limits
large dataset behavior
partial failures
```

Do not start real bulk activities until safe test records are approved.

### Tier 7 — Official email campaigns/campaign activities/reporting docs

Use when campaigns or reporting are in scope.

Use for:

```txt id="el8wk6"
email campaign object behavior
campaign activity behavior
create/update preview/test flows
schedule/send requirements
campaign status
reporting endpoints
email sends
opens
clicks
bounces
unsubscribes
forwards
contact activity/tracking
```

Do not send, schedule, or modify production campaigns without written approval.

### Tier 8 — Official partner webhook docs and webhook authenticity docs

Use only if partner webhooks are in scope.

Use for:

```txt id="q9c0t7"
webhook subscription setup
topic IDs
subscription lookup
webhook callback behavior
webhook payload behavior
event-detail retrieval
signature/JWT validation
JWKS public-key retrieval
delivery/retry behavior if documented
```

Do not assume webhooks are available for every app or account.

### Tier 9 — Account services docs

Use only if account management/settings are in scope.

Use for:

```txt id="ph45sk"
account info
account service settings
account read/update scopes
account owner role requirements
business/account metadata
```

Do not assume the integrating user has account owner permissions.

### Tier 10 — Zapier / Make / marketplace / native integration docs

Use only if no-code or partner route is in scope.

Use for:

```txt id="p27und"
Zap triggers/actions
Make modules
native app behavior
webhook-like automation behavior
task/scenario retry behavior
customer account ownership
failure visibility
```

Do not treat no-code docs as full V3 API authority.

### Tier 11 — Community/forum/blog/GitHub/old V2 examples

Use only as behavioral clues.

Examples:

```txt id="cjxh43"
Constant Contact community posts
Stack Overflow
Retool community posts
GitHub examples
old V2 docs
EventSpot examples
blog tutorials
agency implementation posts
```

They can suggest:

```txt id="emc2vd"
common OAuth mistakes
common token refresh issues
common 401/403 problems
common custom field mapping problems
common bulk activity issues
deprecated endpoint issues
webhook misunderstanding
```

They cannot define:

```txt id="qblcwq"
current official endpoint behavior
customer app permissions
customer scopes
customer contact schema
customer production-safe write behavior
```

## Required source files

Claude Code must create:

```txt id="phcw79"
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

```txt id="gq3odp"
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

```txt id="xnkkot"
official_api_doc
official_api_reference
official_oauth_doc
official_scopes_doc
official_contacts_doc
official_campaign_doc
official_reporting_doc
official_webhook_doc
official_rate_limit_doc
customer_admin_config
developer_app_config
test_account_response
webhook_delivery_log
support_ticket
zapier_doc
make_doc
community_post
blog_post
github_example
legacy_v2_doc
admin_screen_share
```

### evidence-log.md

Every implementation claim must be logged.

Claims include:

```txt id="tvxx35"
route
OAuth flow
client ID
client secret
redirect URI
authorization URL behavior
token URL behavior
refresh token behavior
granted scopes
account ID
account user role
base API path
endpoint path
required headers
request body
response body
pagination behavior
rate limit behavior
contact schema
custom field mapping
list IDs
tag IDs
segment IDs
bulk activity behavior
campaign object shape
campaign activity shape
campaign schedule/send permission
reporting object shape
webhook topic
webhook payload shape
webhook signature behavior
account services permission
SMS permission
legacy EventSpot route
write permission
error behavior
```

If unsupported:

```txt id="s5q2o1"
UNCONFIRMED_DO_NOT_IMPLEMENT
```

### unknowns-register.md

Track unknowns:

```txt id="mqehzi"
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

```txt id="op7d87"
BLOCKS_ROUTE_DECISION
BLOCKS_AUTH
BLOCKS_MOCK_CALIBRATION
BLOCKS_REAL_IMPLEMENTATION
BLOCKS_CONTACT_SYNC
BLOCKS_BULK_ACTIVITIES
BLOCKS_CAMPAIGN_READ
BLOCKS_CAMPAIGN_WRITES
BLOCKS_CAMPAIGN_SEND
BLOCKS_REPORTING
BLOCKS_WEBHOOKS
BLOCKS_ACCOUNT_SERVICES
BLOCKS_SMS
BLOCKS_PRODUCTION
NICE_TO_HAVE
```

## Product-route decision

Claude Code must create:

```txt id="v3ycif"
docs/product-route-decision.md
```

Allowed route values:

```txt id="kk4mwc"
unknown
constant_contact_v3_auth_code
constant_contact_v3_pkce
constant_contact_v3_device_flow
constant_contact_v3_client_two_legged
constant_contact_contacts_sync
constant_contact_lists_tags_segments
constant_contact_custom_fields
constant_contact_bulk_activities
constant_contact_email_campaign_read
constant_contact_email_campaign_create_update
constant_contact_campaign_schedule_send
constant_contact_campaign_reporting
constant_contact_contact_tracking
constant_contact_account_services
constant_contact_partner_webhooks
constant_contact_sms
constant_contact_zapier
constant_contact_make
constant_contact_legacy_v2_eventspot
crm_ams_sync
data_warehouse_sync
custom_middleware
hybrid
```

If route is unknown:

```txt id="d4j9zs"
real adapter disabled
only mocks and source-acquisition docs allowed
```

If route is confirmed:

```txt id="zthz8m"
required source docs checklist generated
mock scenario selected
contract tests generated
test-account validation plan generated
```

Route decision test cases:

```txt id="mg16yb"
unknown route blocks real adapter
authorization code route enables auth-code mock
PKCE route enables code-verifier/challenge tests
device flow route enables user-code/polling tests
client/two-legged route enables client credentials tests if confirmed
contacts sync route enables contacts/lists/tags/custom-field tests
segments route enables segment tests
bulk route enables activity/polling tests
campaign read route enables campaign/reporting tests
campaign write route enables campaign write safety tests
campaign send route requires explicit send approval
webhooks route enables partner webhook simulator
account services route enables account owner/scope tests
SMS route requires explicit scope/product confirmation
legacy EventSpot route blocks V3 assumptions
hybrid route enables multiple adapters
route change invalidates mappings
```

## Canonical adapter interface

Build an internal adapter interface.

```ts id="u0e5x1"
interface ConstantContactAdapter {
  authenticate(): Promise<AuthState>;
  refreshToken(refreshToken: string): Promise<AuthState>;

  getAccountSummary(): Promise<ConstantContactAccount>;
  getScopes(): Promise<GrantedScope[]>;

  getContact(contactId: string): Promise<CanonicalContact>;
  searchContacts(query: ContactQuery): Promise<Page<CanonicalContact>>;
  createContact(input: ContactCreateInput): Promise<WriteResult>;
  updateContact(contactId: string, input: ContactUpdateInput): Promise<WriteResult>;
  deleteContact(contactId: string): Promise<WriteResult>;

  getContactLists(): Promise<Page<CanonicalContactList>>;
  getTags(): Promise<Page<CanonicalTag>>;
  getSegments(): Promise<Page<CanonicalSegment>>;
  getCustomFields(): Promise<Page<CanonicalCustomField>>;

  startBulkActivity(input: BulkActivityInput): Promise<BulkActivityStartResult>;
  getActivityStatus(activityId: string): Promise<BulkActivityStatus>;
  getActivityResult(activityId: string): Promise<BulkActivityResult>;

  getEmailCampaigns(query: CampaignQuery): Promise<Page<CanonicalEmailCampaign>>;
  getEmailCampaign(campaignId: string): Promise<CanonicalEmailCampaign>;
  createEmailCampaign(input: EmailCampaignCreateInput): Promise<WriteResult>;
  updateEmailCampaign(campaignId: string, input: EmailCampaignUpdateInput): Promise<WriteResult>;

  getCampaignActivities(campaignId: string): Promise<Page<CanonicalCampaignActivity>>;
  scheduleCampaignActivity(activityId: string, input: ScheduleInput): Promise<WriteResult>;
  unscheduleCampaignActivity(activityId: string): Promise<WriteResult>;

  getCampaignReporting(query: ReportingQuery): Promise<CampaignReportingResult>;
  getContactTracking(contactId: string): Promise<ContactTrackingResult>;

  getWebhookSubscriptions(): Promise<Page<PartnerWebhookSubscription>>;
  processWebhook(event: ConstantContactWebhookEvent): Promise<WebhookProcessResult>;

  capabilities(): Promise<ConstantContactCapabilities>;
}
```

Implementations:

```txt id="egv0lp"
MockConstantContactV3Adapter
MockConstantContactAuthCodeAdapter
MockConstantContactPkceAdapter
MockConstantContactDeviceFlowAdapter
MockConstantContactContactsAdapter
MockConstantContactCampaignsAdapter
MockConstantContactBulkActivitiesAdapter
MockConstantContactReportingAdapter
MockConstantContactPartnerWebhookAdapter
MockConstantContactSmsAdapter
ConstantContactV3Adapter
ConstantContactWebhookAdapter
```

Real adapters stay disabled until official docs/customer config/test account confirm route.

## Canonical model

Use canonical objects internally.

```ts id="tbp4nv"
type CanonicalContact = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  jobTitle?: string;
  phoneNumbers?: unknown[];
  streetAddresses?: unknown[];
  birthdayMonth?: number;
  birthdayDay?: number;
  anniversary?: string;
  listIds?: string[];
  tagIds?: string[];
  customFields?: Record<string, unknown>;
  source?: string;
  permissionToSend?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
};
```

```ts id="zkw4zs"
type CanonicalContactList = {
  id: string;
  name: string;
  membershipCount?: number;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
};
```

```ts id="nc9iui"
type CanonicalTag = {
  id: string;
  name: string;
  createdAt?: string;
  raw?: unknown;
};
```

```ts id="jsplvx"
type CanonicalSegment = {
  id: string;
  name: string;
  segmentType?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
};
```

```ts id="pzhgbl"
type CanonicalCustomField = {
  id: string;
  name: string;
  type?: string;
  label?: string;
  required?: boolean;
  raw?: unknown;
};
```

```ts id="zqgifb"
type CanonicalEmailCampaign = {
  id: string;
  name?: string;
  currentStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  campaignActivities?: CanonicalCampaignActivity[];
  raw?: unknown;
};
```

```ts id="p6cl61"
type CanonicalCampaignActivity = {
  id: string;
  campaignId?: string;
  role?: string;
  formatType?: string;
  currentStatus?: string;
  subject?: string;
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  scheduledAt?: string;
  raw?: unknown;
};
```

```ts id="cmrs4q"
type BulkActivityStatus = {
  id: string;
  state: "processing" | "completed" | "cancelled" | "failed" | "time_out" | "unknown";
  percentDone?: number;
  createdAt?: string;
  completedAt?: string;
  errors?: unknown[];
  raw?: unknown;
};
```

```ts id="pcn6pj"
type ConstantContactWebhookEvent = {
  eventId?: string;
  topicId?: string;
  eventType?: string;
  resourceUrl?: string;
  notificationUrl?: string;
  payload: unknown;
  headers?: Record<string, string>;
};
```

## Customer configuration model

All customer-specific details must live in config.

```json id="ns5aq3"
{
  "customer": "Example Organization",
  "platform": "constant_contact",
  "route": "constant_contact_v3_auth_code",
  "environment": "mock",
  "urls": {
    "apiBase": "http://localhost:4010/v3",
    "oauthBase": "http://localhost:4010/oauth2",
    "webhookBase": "http://localhost:4020"
  },
  "auth": {
    "type": "oauth_authorization_code",
    "clientIdEnv": "CONSTANT_CONTACT_CLIENT_ID",
    "clientSecretEnv": "CONSTANT_CONTACT_CLIENT_SECRET",
    "redirectUriEnv": "CONSTANT_CONTACT_REDIRECT_URI",
    "accessTokenEnv": "CONSTANT_CONTACT_ACCESS_TOKEN",
    "refreshTokenEnv": "CONSTANT_CONTACT_REFRESH_TOKEN"
  },
  "scopes": {
    "required": [
      "contact_data",
      "campaign_data",
      "offline_access"
    ],
    "optional": [
      "account_read",
      "account_update"
    ]
  },
  "contactMapping": {
    "id": "contact_id",
    "email": "email_address.address",
    "firstName": "first_name",
    "lastName": "last_name",
    "companyName": "company_name",
    "listIds": "list_memberships",
    "tagIds": "taggings",
    "customFields": "custom_fields"
  },
  "listScope": {
    "mode": "allowlist",
    "listIds": ["list_000001"]
  },
  "campaignScope": {
    "allowCampaignReads": true,
    "allowCampaignCreates": false,
    "allowCampaignUpdates": false,
    "allowCampaignScheduling": false,
    "allowCampaignSending": false
  },
  "webhooks": {
    "enabled": false,
    "validateSignature": true,
    "jwksCacheSeconds": 3600
  },
  "writeSafety": {
    "productionWritesDisabledByDefault": true,
    "allowContactCreates": false,
    "allowContactUpdates": false,
    "allowBulkImports": false,
    "allowCampaignWrites": false,
    "allowAccountUpdates": false
  }
}
```

## Mock-real integration lab

The Constant Contact lab should include multiple mock servers.

```txt id="bbkki2"
mock-constant-contact-oauth-server
mock-constant-contact-v3-api-server
mock-constant-contact-contacts-server
mock-constant-contact-bulk-activities-server
mock-constant-contact-campaigns-server
mock-constant-contact-reporting-server
mock-constant-contact-webhook-server
mock-constant-contact-account-services-server
mock-constant-contact-sms-guardrail-server
mock-constant-contact-legacy-eventspot-guardrail-server
mock-constant-contact-zapier-make-server
```

Use Docker Compose.

```txt id="h65o4c"
constant-contact-integration-lab/
  docker-compose.yml
  mock-server/
  oauth-server/
  webhook-lab/
  synthetic-data/
  tests/
  postman/
  openapi/
  schemas/
  docs/
```

## Mock OAuth2 server

### Purpose

Model Constant Contact OAuth2 behavior without real credentials.

### OAuth modes to simulate

```txt id="dz2plg"
authorization code flow
authorization code flow with refresh token
PKCE flow
device authorization flow
implicit flow only if legacy/public-client route confirmed
client/two-legged route only if customer/app confirms
scope grants
scope denial
offline_access / refresh token behavior
token expiry
token refresh
token revocation
redirect URI validation
client secret rotation
```

### Mock paths

Use local compatibility paths only.

```txt id="x2qhlp"
GET  /oauth2/authorize
POST /oauth2/token
POST /oauth2/revoke
GET  /oauth2/introspect
POST /oauth2/device_authorization
```

These are local compatibility paths. Do not claim they are production paths.

### OAuth test cases

```txt id="y0e1kp"
valid authorization request
missing client_id
invalid client_id
wrong redirect_uri
state returned correctly
state mismatch
authorization denied by user
authorization code returned
authorization code missing
authorization code already used
token exchange succeeds
bad client secret
missing PKCE code_verifier
wrong PKCE code_verifier
device code pending
device code approved
device code expired
access token expires
refresh token succeeds
refresh token revoked
refresh token rotation if modeled
scope missing
scope denied
token valid but endpoint forbidden
token accidentally logged
```

Expected behavior:

```txt id="orxmsl"
OAuth flow selected by config
state checked
PKCE verifier checked
access token stored securely
refresh token stored securely
client secret never logged
token expiry handled
scope mismatch surfaced clearly
```

## Mock scopes/permissions simulator

### Purpose

Model endpoint access controlled by granted scopes and account role.

### Scope categories to model

```txt id="jmiift"
contact data
campaign data
account read
account update
offline access
SMS-related access if confirmed
webhook/partner access if confirmed
```

### Test cases

```txt id="vsd8az"
contacts read scope granted
contacts write scope missing
campaign read scope granted
campaign write scope missing
account_read missing
account_update missing
offline_access missing so no refresh token
account owner required
non-owner user tries account update
webhook partner access unavailable
SMS scope unavailable
```

Expected behavior:

```txt id="dc2k3b"
do not treat 403 as empty data
required scopes listed in readiness checklist
optional scopes requested only when needed
account role constraints surfaced
```

## Mock contacts server

### Purpose

Model contacts, contact subresources, list memberships, taggings, custom fields, email permission, and status behavior.

### Contact cases

```txt id="plqio2"
active contact
unsubscribed contact
deleted contact
temporary hold contact
contact with one email
contact with multiple emails if modeled
contact with no first name
contact with no last name
contact with company
contact with phone
contact with address
contact with birthday
contact with anniversary
contact on one list
contact on multiple lists
contact with one tag
contact with multiple tags
contact with custom fields
contact with SMS fields if confirmed
duplicate email
changed email
invalid email
```

### Mock paths

Use local compatibility paths modeled after public V3 resource categories.

```txt id="xej1yo"
GET    /v3/contacts
POST   /v3/contacts
GET    /v3/contacts/{contactId}
PUT    /v3/contacts/{contactId}
DELETE /v3/contacts/{contactId}
GET    /v3/contacts/contact_id_xrefs
GET    /v3/contact_lists
POST   /v3/contact_lists
GET    /v3/contact_lists/{listId}
PUT    /v3/contact_lists/{listId}
DELETE /v3/contact_lists/{listId}
GET    /v3/contacts/tags
POST   /v3/contacts/tags
GET    /v3/contacts/custom_fields
POST   /v3/contacts/custom_fields
PUT    /v3/contacts/custom_fields/{customFieldId}
DELETE /v3/contacts/custom_fields/{customFieldId}
```

Do not claim these are exact customer-authorized paths until official docs/test account confirm.

### Contact test cases

```txt id="f6za9o"
list contacts
search/filter contacts
fetch contact
contact not found
create contact allowed
create contact denied
create contact missing email
create contact invalid email
create duplicate email
update contact allowed
update contact denied
update email address
update list memberships
update tag memberships
update custom fields
delete contact allowed
delete contact denied
unsubscribed contact cannot be resubscribed without approved rule
deleted contact appears in xref
contact status changed
permission_to_send missing
source required
pagination required
custom field missing
custom field renamed
custom field type mismatch
```

Expected behavior:

```txt id="nns0me"
contact writes disabled by default
email permission/source rules explicit
unsubscribe status protected
custom fields schema-driven
list/tag IDs config-driven
pagination mandatory
raw payload preserved
```

## Mock contact lists/tags/segments/custom fields simulator

### Purpose

Model Constant Contact segmentation primitives.

### Objects

```txt id="rjwy4w"
contact list
tag
segment
custom field definition
custom field value
list membership
tag membership
segment membership or segment criteria if exposed
```

### Test cases

```txt id="txs1wo"
list contact lists
list missing
list deleted
list renamed
create list allowed
create list denied
tag list
tag missing
tag renamed
tag deleted
create tag allowed
create tag denied
segment list
segment missing
segment dynamic membership changed
custom field list
custom field missing
custom field renamed
custom field type changed
custom field value too long
custom field limit reached
unknown custom field in mapping
```

Expected behavior:

```txt id="j0o2de"
IDs are stable keys
names are not stable keys
segments may be dynamic
custom field definitions fetched before mapping
missing required mapping blocks sync
```

## Mock bulk activities server

### Purpose

Model Constant Contact asynchronous activities for large imports/updates/exports.

### Activity states

```txt id="ks8bsj"
processing
completed
cancelled
failed
time_out
unknown
```

### Mock paths

Use local compatibility paths only.

```txt id="n63a6p"
POST /v3/activities/contacts_file_import
POST /v3/activities/contacts_json_import
POST /v3/activities/contact_exports
GET  /v3/activities
GET  /v3/activities/{activityId}
GET  /v3/activities/{activityId}/results
```

### Test cases

```txt id="djdkjd"
start small import
start large import
start export
activity queued
activity processing
activity completed
activity failed
activity timed out
activity cancelled
activity result file available
activity result file missing
partial row failures
invalid CSV
invalid JSON
too many queued activities
activity queue limit reached
poll too frequently
poll stops too early
activity ID unknown
retry creates duplicate import
```

Expected behavior:

```txt id="kgq82d"
bulk writes disabled by default
poll with backoff
activity state machine explicit
partial failures parsed
result files retained
idempotency/reconciliation required
do not start broad bulk import in production first
```

## Mock email campaigns server

### Purpose

Model campaign creation, update, status, activities, preview/test, scheduling, and send guardrails.

### Campaign concepts

```txt id="tksd0l"
email campaign
campaign activity
primary email activity
subject
preheader
from name
from email
reply-to email
HTML/body content
list recipients
segment recipients
status
draft
scheduled
sent
paused/cancelled
test send
preview
```

### Mock paths

Use local compatibility paths only.

```txt id="j1sa5d"
GET  /v3/emails
POST /v3/emails
GET  /v3/emails/{campaignId}
PUT  /v3/emails/{campaignId}
GET  /v3/emails/{campaignId}/activities
GET  /v3/emails/activities/{activityId}
PUT  /v3/emails/activities/{activityId}
POST /v3/emails/activities/{activityId}/previews
POST /v3/emails/activities/{activityId}/tests
POST /v3/emails/activities/{activityId}/schedules
DELETE /v3/emails/activities/{activityId}/schedules
```

Do not claim these are exact customer-authorized paths until official docs/test account confirm.

### Campaign test cases

```txt id="wxten7"
list campaigns
campaign not found
create campaign allowed
create campaign denied
create campaign missing name
create campaign invalid from email
update campaign allowed
update campaign denied
update sent campaign denied
get campaign activities
activity missing
activity wrong campaign
preview campaign
test send allowed
test send denied
schedule campaign allowed
schedule campaign denied
schedule in past
schedule with empty recipient list
schedule with unsubscribed recipients
unschedule campaign allowed
unschedule denied
send guardrail blocks production send
```

Expected behavior:

```txt id="x31e2t"
campaign writes disabled by default
campaign scheduling/sending requires explicit written approval
test sends use allowlisted recipients
sent campaigns not modified blindly
recipient list/segment IDs config-driven
```

## Mock reporting server

### Purpose

Model campaign and contact reporting.

### Reporting objects

```txt id="h8prps"
campaign summary
activity summary
email sends
opens
clicks
bounces
unsubscribes
forwards
contact tracking
link tracking
unique vs total metrics
time-series metrics
```

### Mock paths

Use local compatibility paths only.

```txt id="goe0kn"
GET /v3/reports/email_reports/{campaignActivityId}/tracking/sends
GET /v3/reports/email_reports/{campaignActivityId}/tracking/opens
GET /v3/reports/email_reports/{campaignActivityId}/tracking/clicks
GET /v3/reports/email_reports/{campaignActivityId}/tracking/bounces
GET /v3/reports/email_reports/{campaignActivityId}/tracking/unsubscribes
GET /v3/reports/contact_reports/{contactId}/activity
```

### Test cases

```txt id="otww6u"
campaign has no reporting yet
campaign sent but reporting delayed
opens returned
clicks returned
bounces returned
unsubscribes returned
forwarding if modeled
contact tracking returned
reporting pagination
same event appears twice
late open/click
bot-like open/click if modeled
contact deleted after event
campaign activity ID wrong
reporting scope missing
```

Expected behavior:

```txt id="re2kb9"
reporting is eventually consistent
metrics not treated as real-time
dedupe by event where possible
late events handled with lookback window
deleted contacts handled explicitly
```

## Mock account services server

### Purpose

Model account-level endpoints and role constraints.

### Objects

```txt id="joh1lf"
account summary
physical address
account contact info
account settings
verified email addresses if modeled
account owner role
```

### Test cases

```txt id="bewaw9"
account read allowed
account read denied
account update allowed
account update denied
user lacks owner role
scope account_read missing
scope account_update missing
update account physical address allowed
update physical address denied
verified email missing
from email not verified
```

Expected behavior:

```txt id="lvfis2"
account updates disabled by default
owner role requirement surfaced
from/reply-to email validation separated from campaign logic
```

## Mock partner webhook simulator

### Purpose

Model Constant Contact partner webhook subscriptions, delivery, detail retrieval, and signature validation.

### Components

```txt id="oifydp"
webhook subscription list
topic ID
subscription details
webhook sender
webhook receiver
detached payload signature
JWKS endpoint
public key cache
payload reattachment validator
delivery log fixture
retry simulator
```

### Mock paths

Use local compatibility paths only.

```txt id="e4egvs"
GET  /v3/partner/webhooks/subscriptions
GET  /v3/partner/webhooks/subscriptions/{topicId}
POST /mock/webhooks/deliver
GET  /.well-known/jwks.json
```

### Webhook event categories to model

```txt id="f2h6sl"
account event
contact event
campaign event
billing/partner event if confirmed
list/tag/segment-related event if confirmed
activity event if confirmed
```

Do not assume every category is available.

### Test cases

```txt id="x4dv4k"
webhook route unavailable
webhook subscription exists
webhook subscription missing
valid webhook
signature valid
signature missing
signature invalid
JWKS unavailable
JWKS key rotated
payload detached incorrectly
payload altered
duplicate webhook
out-of-order webhook
webhook references detail URL
detail URL fetch succeeds
detail URL forbidden
detail URL not found
receiver returns 500
receiver times out
retry arrives
webhook disabled
```

Expected behavior:

```txt id="klsxjg"
webhook is trigger, not full truth
verify signature when configured
cache JWKS with refresh on key miss
dedupe events
fetch latest resource/details where needed
ack only after durable queue if possible
webhook secrets/tokens not logged
```

## Mock SMS route simulator

### Purpose

Model SMS-related access only if the customer has SMS product/scopes confirmed.

### Guardrail

```txt id="sd9dly"
SMS route disabled unless official docs, customer product access, and scopes confirm it.
```

### Test cases

```txt id="xjxets"
SMS access not confirmed -> route blocked
SMS scope missing
SMS contact field missing
SMS consent missing
SMS campaign write denied
SMS reporting unavailable
SMS write attempted in production -> blocked
```

Expected behavior:

```txt id="fl26xx"
do not assume SMS exists
SMS consent treated separately from email consent
SMS writes disabled by default
```

## Mock legacy V2 / EventSpot guardrail simulator

### Purpose

Prevent accidental mixing of old Constant Contact EventSpot/V2 docs with V3 API work.

### Legacy routes to detect

```txt id="te8ra4"
V2 EventSpot
V2 event endpoints
old access_token examples
old contact APIs
old webhook docs
old partner webhook docs
old OAuth endpoints
deprecated paths
```

### Test cases

```txt id="q22g0k"
developer tries to use V2 event endpoint in V3 adapter
developer uses old OAuth URL
developer uses old contact endpoint
developer uses old EventSpot event model
customer explicitly confirms legacy route
legacy route requires separate adapter
```

Expected behavior:

```txt id="sr5i22"
legacy docs are not implementation authority for V3
legacy route requires explicit route decision
create separate legacy adapter/context if needed
```

## Mock CRM / AMS sync simulator

### Purpose

Model syncing Constant Contact contacts, list memberships, campaign engagement, and unsubscribe state into CRM/AMS.

### Objects

```txt id="vhfmhw"
CRM contact
AMS member
email subscription
marketing preference
campaign engagement
list membership
tag membership
custom field mapping
unsubscribe event
bounce event
```

### Test cases

```txt id="et7rxx"
new Constant Contact contact creates CRM contact
existing CRM contact updates Constant Contact contact
Constant Contact unsubscribe updates CRM preference
CRM unsubscribe updates Constant Contact contact only if allowed
campaign open writes activity
campaign click writes activity
bounce writes activity
duplicate email
missing email
changed email
custom field mismatch
list membership maps to interest
tag maps to lifecycle status
CRM write fails
CRM duplicate detected
```

Expected behavior:

```txt id="gm5kax"
Constant Contact contact ID stored as external ID
email-only dedupe requires approval
unsubscribe handling is sacred
marketing consent is not overwritten blindly
engagement writes idempotent
```

## Mock Zapier / Make / native integration route simulator

### Purpose

Model no-code/native automation behavior without relying on live Zapier/Make accounts.

### Objects

```txt id="mqbdq1"
Zap trigger
Zap action
Make scenario
native app connection
authorized Constant Contact app
task history
retry
disabled automation
deleted automation
```

### Test cases

```txt id="t2cafh"
Zap receives new contact
Zap adds contact to list
Zap updates CRM record
Zap action fails
Zap retries
Zap disabled
Zap deleted
Make scenario receives contact event
Make scenario times out
OAuth connection revoked
token expired
task history missing
duplicate task
```

Expected behavior:

```txt id="qzvujr"
no-code route treated as asynchronous
retry/idempotency required
customer owns Zapier/Make account
not a substitute for full V3 API if full sync required
```

## Synthetic data generator

Generate datasets.

### Small

```txt id="v1s0zd"
100 contacts
10 contact lists
20 tags
10 segments
20 custom fields
20 email campaigns
40 campaign activities
1,000 engagement events
50 bulk activity records
50 webhook events
```

### Medium

```txt id="pskna6"
100,000 contacts
500 contact lists
2,000 tags
500 segments
100 custom fields
5,000 email campaigns
10,000 campaign activities
50,000,000 engagement events
10,000 bulk activity records
1,000,000 webhook events
```

### Large

```txt id="vvu0vl"
5,000,000 contacts
10,000 contact lists
100,000 tags
10,000 segments
100 custom fields
500,000 email campaigns
1,000,000 campaign activities
5,000,000,000 engagement events
1,000,000 bulk activity records
100,000,000 webhook events
```

### Edge cases

```txt id="siu0ea"
duplicate email
missing email
invalid email
changed email
unsubscribed contact
deleted contact
temporary hold contact
contact on no lists
contact on many lists
tag deleted
segment dynamic membership changed
custom field renamed
custom field type changed
custom field limit reached
bulk import partial failure
bulk import timeout
activity queue full
campaign draft
campaign scheduled
campaign sent
campaign cancelled
test send
schedule in past
reporting delayed
late open
late click
bounce after unsubscribe
webhook duplicate
webhook out of order
JWKS key rotation
rate limit after N requests
```

## Error simulator

Mock all important failures.

```txt id="wcllum"
400 bad request
401 unauthorized
403 forbidden
404 not found
409 duplicate/conflict
415 unsupported media type
422 validation failure
429 too many requests
500 server error
502 bad gateway
503 unavailable
504 timeout
invalid client ID
invalid client secret
invalid redirect URI
invalid authorization code
expired token
revoked refresh token
scope missing
account role insufficient
contact permission error
custom field validation error
activity queue limit exceeded
campaign send blocked
webhook signature invalid
JWKS unavailable
malformed JSON
HTML error page instead of JSON
empty response
pagination cursor invalid
legacy endpoint attempted
```

Expected behavior:

```txt id="b4dl9x"
400 -> fail fast
401 -> re-auth/refresh if safe
403 -> scope/permission/account-role issue
404 -> reconcile missing record
409 -> idempotency/conflict handling
415 -> content-type bug
422 -> mapping/data issue
429 -> backoff and reduce rate
5xx -> bounded retry
timeout on read -> retry
timeout on write -> reconcile first
malformed response -> quarantine
campaign send blocked -> stop and require approval
webhook signature invalid -> reject
legacy endpoint attempted -> route/config bug
```

## Rate limit / pagination simulator

### Purpose

Model Constant Contact V3 request limits, endpoint-specific limits, bulk activity queue limits, and pagination.

### Test cases

```txt id="tc9ae5"
single page
multiple pages
pagination required
client assumes no pagination and misses records
empty first page
empty middle page
empty final page
next link/cursor missing
pagination token invalid
duplicate records across pages
record changes during pagination
429 with retry hint
429 without retry hint
daily API limit reached
per-second limit reached
endpoint-specific limit reached
bulk activity queue limit reached
polling activity too often
retry budget exhausted
```

Expected behavior:

```txt id="grxqbk"
pagination mandatory on list endpoints
checkpoint after safe page completion
dedupe by stable key
honor retry hints when present
backoff with jitter
reduce concurrency
avoid aggressive polling
alert after retry budget exhausted
do not hardcode one permanent rate-limit number without source check
```

## Secret and PII redaction tests

Test that logs never expose:

```txt id="jidtv5"
client secret
access token
refresh token
authorization code
device code
Authorization header
webhook signature
JWKS private material if any
contact email in unsafe logs
contact phone
contact address
custom field sensitive values
unsubscribe reason if sensitive
campaign content drafts in production logs
raw payloads in production logs unless explicitly allowed
```

Expected behavior:

```txt id="u3pkfx"
redact secrets
redact tokens
minimize PII
do not log campaign HTML/body by default
debug payload logging disabled by default
CI fails if secrets appear in logs
```

## Contract tests

Create contract tests that run against:

```txt id="izokid"
mock
customer-test-account
production-smoke
```

Environment selector:

```txt id="q69480"
TEST_TARGET=mock
TEST_TARGET=customer-test-account
TEST_TARGET=production-smoke
```

Mock can run destructive/bad scenarios.

Customer test account runs approved safe tests.

Production smoke is tiny and mostly read-only.

### Contract test suites

```txt id="xqfxd3"
auth.contract.test.ts
scopes.contract.test.ts
account.contract.test.ts
contacts.contract.test.ts
lists-tags-segments.contract.test.ts
custom-fields.contract.test.ts
bulk-activities.contract.test.ts
campaigns.contract.test.ts
campaign-activities.contract.test.ts
campaign-schedule-send.contract.test.ts
reporting.contract.test.ts
webhooks.contract.test.ts
webhook-authenticity.contract.test.ts
sms-guardrail.contract.test.ts
legacy-v2-guardrail.contract.test.ts
crm-ams-sync.contract.test.ts
zapier-make.contract.test.ts
pagination.contract.test.ts
rate-limit.contract.test.ts
errors.contract.test.ts
redaction.contract.test.ts
write-safety.contract.test.ts
```

## Postman / Newman / OpenAPI strategy

Generate:

```txt id="ftykdj"
postman/constant-contact-local.postman_collection.json
postman/constant-contact-local.postman_environment.json
postman/constant-contact-oauth.postman_collection.json
postman/constant-contact-errors.postman_collection.json
postman/constant-contact-webhooks.postman_collection.json
postman/constant-contact-campaign-safety.postman_collection.json
postman/constant-contact-bulk-activities.postman_collection.json
```

Generate OpenAPI fixtures:

```txt id="l9jz48"
openapi/constant-contact-v3-compatibility.openapi.yaml
openapi/constant-contact-webhook-compatibility.openapi.yaml
```

Generate schemas:

```txt id="ugmpih"
schemas/contact.schema.json
schemas/contact-list.schema.json
schemas/tag.schema.json
schemas/segment.schema.json
schemas/custom-field.schema.json
schemas/bulk-activity.schema.json
schemas/email-campaign.schema.json
schemas/campaign-activity.schema.json
schemas/reporting-event.schema.json
schemas/account.schema.json
schemas/webhook-event.schema.json
schemas/error.schema.json
schemas/pagination.schema.json
```

Newman/tests should verify:

```txt id="podtee"
auth succeeds
bad auth fails
refresh token works
scope missing produces permission error
contact validates
contact list validates
tag validates
segment validates
custom field validates
bulk activity state machine validates
campaign validates
campaign activity validates
schedule/send guardrail blocks by default
reporting validates
webhook signature validates
pagination works
rate limit handled
malformed JSON rejected
legacy endpoint blocked
secrets not logged
```

## Customer test-account calibration process

When customer test credentials arrive:

```txt id="udgz58"
1. Confirm product route: Constant Contact V3, not legacy V2/EventSpot unless explicitly stated.
2. Confirm OAuth flow.
3. Confirm app/client ID.
4. Confirm redirect URI.
5. Confirm scopes requested.
6. Run OAuth authorization smoke test.
7. Exchange authorization code.
8. Confirm access token works.
9. Confirm refresh token works if offline access is expected.
10. Fetch account/user summary if scope allows.
11. Fetch contact lists.
12. Fetch tags if in scope.
13. Fetch custom fields.
14. Fetch segments if in scope.
15. Fetch one known safe contact.
16. Create one safe test contact only if approved.
17. Update one harmless safe test contact only if approved.
18. Run one small bulk activity only if approved.
19. Fetch one known draft campaign if in scope.
20. Fetch one campaign activity if in scope.
21. Fetch one reporting endpoint only for a safe campaign if approved.
22. Validate partner webhook delivery if webhooks are in scope.
23. Validate webhook signature if webhooks are in scope.
24. Validate one harmless permission error.
25. Validate pagination on one safe endpoint.
26. Capture sanitized request/response examples.
27. Compare test-account schema against mock schema.
28. Update mock fixtures.
29. Update mapping config.
30. Re-run contract tests against mock.
31. Re-run approved contract tests against test account.
```

Do not start with:

```txt id="fe4gxn"
full contact export
bulk import of real contacts
bulk list membership update
campaign creation in production
campaign scheduling
campaign sending
account updates
SMS sends
webhook production changes
legacy endpoint migration
```

## Production smoke-test plan

Production tests must be tiny and approved.

### Read-only production smoke

```txt id="t12y4o"
authenticate
refresh token if needed
fetch account summary if approved
fetch contact lists
fetch custom fields
fetch one known safe contact
fetch one known draft campaign if in scope
fetch one reporting summary only if approved
verify expected fields exist
stop
```

### Write production smoke

Only after written approval.

```txt id="t12o6v"
create one harmless test contact on a test list
or update one harmless custom field on a test contact
or create one draft-only test campaign that is not scheduled
or run one tiny test bulk activity with one test contact
use idempotency/reconciliation where possible
read/reconcile result
confirm no duplicate
document result
stop
```

### Campaign scheduling/sending production smoke

Only after separate written approval.

```txt id="lq22td"
use a dedicated test campaign
use a dedicated test list
test recipient list must be allowlisted
schedule/send only to internal approved recipients
verify reporting
stop
```

Production broad sync is not allowed until read-only smoke passes.

Production contact writes are not allowed until write smoke passes.

Production campaign scheduling/sending is not allowed until separate send approval exists.

Production account updates, SMS sends, or broad bulk imports are not allowed unless explicitly approved.

## Customer/vendor/admin request packet

Claude Code must create:

```txt id="k0sbii"
docs/customer-admin-request.md
docs/vendor-api-doc-request.md
docs/customer-discovery-questionnaire.md
```

Ask for:

### Product/API route

```txt id="l0jj7y"
Confirm this is Constant Contact V3 API.
Is the integration contacts sync, campaign reporting, campaign creation, webhooks, SMS, account services, Zapier/Make, data warehouse, or hybrid?
Is any legacy V2/EventSpot route in scope?
Is there a test account or safe production test setup?
```

### Credentials/access

```txt id="vvc9xb"
developer app owner
client ID / API key
client secret delivery process
redirect URI
OAuth flow
PKCE needed?
device flow needed?
refresh token/offline access needed?
required scopes
account user role
test account credentials
production authorization process
credential rotation process
secure secret delivery process
```

### Contacts and segmentation

```txt id="g8bsvd"
contact lists in scope
list IDs
tag IDs
segments in scope
custom fields
required custom fields
sensitive custom fields
source/permission-to-send policy
unsubscribe/opt-out policy
duplicate email policy
sample safe contact
safe test list
```

### Bulk activities

```txt id="x9comq"
bulk imports in scope?
bulk exports in scope?
max batch size expected
activity polling frequency
safe test import file
partial failure handling
who approves production bulk imports?
```

### Campaigns

```txt id="gfna3e"
campaign read in scope?
campaign create/update in scope?
campaign schedule/send in scope?
template requirements
from-name/from-email requirements
reply-to requirements
verified sender requirements
safe draft campaign
safe test list
approved internal test recipients
who approves sends?
```

### Reporting

```txt id="jjx3fw"
campaign reporting in scope?
contact tracking in scope?
which metrics are needed?
opens?
clicks?
bounces?
unsubscribes?
sends?
time window?
late-event handling?
sample campaign activity IDs
```

### Webhooks

```txt id="ikry3y"
partner webhooks in scope?
is partner webhook access enabled?
which topics are needed?
who configures subscriptions?
callback URL
signature validation required?
JWKS caching requirements?
delivery/retry expectations?
test webhook procedure
who monitors failures?
```

### Account services / SMS

```txt id="o6jpvv"
account services in scope?
account_read scope needed?
account_update scope needed?
account owner role available?
SMS in scope?
SMS product enabled?
SMS scopes available?
SMS consent rules?
```

### CRM/AMS/data warehouse

```txt id="g31zsf"
target system
contact dedupe rules
external ID rules
list/tag/segment mapping
custom field mapping
unsubscribe mapping
campaign engagement mapping
reporting sync frequency
full sync vs incremental sync
```

### Performance / limits

```txt id="c1h2m9"
expected contact count
expected list count
expected tag count
expected campaign count
expected reporting volume
expected sync frequency
rate-limit guidance
bulk activity volume
maintenance windows
support escalation path
```

## Repository structure

```txt id="lyx6pe"
constant-contact-integration-lab/
  README.md
  constant-contact-integration-lab-context.md
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
    test-account-validation-checklist.md
    production-readiness-checklist.md
    adapter-design.md
    mock-server-design.md
    oauth-test-plan.md
    scopes-test-plan.md
    contacts-test-plan.md
    lists-tags-segments-test-plan.md
    custom-fields-test-plan.md
    bulk-activities-test-plan.md
    campaign-test-plan.md
    campaign-send-safety-plan.md
    reporting-test-plan.md
    webhook-test-plan.md
    account-services-test-plan.md
    sms-guardrail-plan.md
    legacy-v2-guardrail-plan.md
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
    constant-contact-v3-compatibility.openapi.yaml
    constant-contact-webhook-compatibility.openapi.yaml

  schemas/
    contact.schema.json
    contact-list.schema.json
    tag.schema.json
    segment.schema.json
    custom-field.schema.json
    bulk-activity.schema.json
    email-campaign.schema.json
    campaign-activity.schema.json
    reporting-event.schema.json
    account.schema.json
    webhook-event.schema.json
    pagination.schema.json
    error.schema.json

  mock-server/
    package.json
    src/
      server.ts
      oauth.ts
      pkce.ts
      deviceFlow.ts
      scopes.ts
      account.ts
      contacts.ts
      contactLists.ts
      tags.ts
      segments.ts
      customFields.ts
      bulkActivities.ts
      emailCampaigns.ts
      campaignActivities.ts
      campaignScheduling.ts
      reporting.ts
      contactTracking.ts
      webhooks.ts
      webhookAuthenticity.ts
      smsGuardrails.ts
      legacyV2Guardrails.ts
      crmAmsSync.ts
      zapierMake.ts
      pagination.ts
      rateLimits.ts
      errors.ts
      redaction.ts
      scenarios.ts

  fixtures/
    contacts/
    contact-lists/
    tags/
    segments/
    custom-fields/
    bulk-activities/
    campaigns/
    campaign-activities/
    reporting/
    account/
    webhooks/
    oauth/
    errors/

  synthetic-data/
    generate-contacts.ts
    generate-contact-lists.ts
    generate-tags.ts
    generate-segments.ts
    generate-custom-fields.ts
    generate-bulk-activities.ts
    generate-campaigns.ts
    generate-reporting-events.ts
    generate-webhooks.ts
    generate-edge-cases.ts

  postman/
    constant-contact-local.postman_collection.json
    constant-contact-local.postman_environment.json
    constant-contact-oauth.postman_collection.json
    constant-contact-errors.postman_collection.json
    constant-contact-webhooks.postman_collection.json
    constant-contact-campaign-safety.postman_collection.json
    constant-contact-bulk-activities.postman_collection.json

  tests/
    source-register.test.ts
    no-invention-policy.test.ts
    route-decision.test.ts
    auth.test.ts
    oauth.test.ts
    pkce.test.ts
    device-flow.test.ts
    scopes.test.ts
    account.test.ts
    contacts.test.ts
    contact-lists.test.ts
    tags.test.ts
    segments.test.ts
    custom-fields.test.ts
    bulk-activities.test.ts
    campaigns.test.ts
    campaign-activities.test.ts
    campaign-send-safety.test.ts
    reporting.test.ts
    contact-tracking.test.ts
    webhooks.test.ts
    webhook-authenticity.test.ts
    sms-guardrail.test.ts
    legacy-v2-guardrail.test.ts
    crm-ams-sync.test.ts
    zapier-make.test.ts
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

```txt id="sohfn5"
product confirmed as Constant Contact V3 API
integration route confirmed
official docs identified for route
developer app/client ID confirmed
OAuth flow confirmed
redirect URI confirmed
client secret process confirmed
required scopes confirmed
test account or safe test setup confirmed
contact schema confirmed
custom fields confirmed
lists/tags/segments confirmed
unsubscribe/permission policy confirmed
bulk activity scope confirmed or out of scope
campaign read/write scope confirmed
campaign send scope confirmed or out of scope
reporting scope confirmed
webhook scope confirmed or out of scope
account services scope confirmed or out of scope
SMS scope confirmed or out of scope
legacy V2/EventSpot scope confirmed or excluded
sample records received
support escalation path confirmed
```

## Test-account validation checklist

Minimum test-account tests:

```txt id="jzzg1m"
OAuth authorization succeeds
bad auth fails as expected
token refresh succeeds if expected
scope mismatch tested safely
account summary fetched if allowed
contact lists fetched
tags fetched if in scope
custom fields fetched
segments fetched if in scope
known safe contact fetched
test contact create/update only if approved
bulk activity test only if approved
draft campaign fetched if in scope
campaign activity fetched if in scope
reporting fetched for safe campaign if approved
webhook delivery tested if in scope
webhook signature tested if in scope
pagination verified on one safe endpoint
rate-limit behavior modeled conservatively
writes not tested until approved
```

## Production readiness checklist

Production not ready until:

```txt id="qlpeh5"
test-account validation passed or customer accepted no-test-account risk
mock calibrated to customer API behavior
field mappings approved
list/tag/segment mappings approved
custom fields approved
unsubscribe/consent handling approved
bulk activity behavior approved
campaign read/write behavior approved
campaign send guardrails approved
reporting behavior approved
webhook behavior approved
account services behavior approved
secret storage approved
redaction tests passed
rollback/reconciliation plan exists
support escalation path exists
monitoring exists
```

## Claude Code prompt

Use this prompt with Claude Code:

```txt id="ca165r"
You are building a production-shaped Constant Contact Integration Lab.

Goal:
Create a source-acquisition and no-credentials testing framework for Constant Contact before real credentials arrive.

Do not invent real customer endpoint details.

Build:
1. Source register, evidence log, unknowns register, and no-invention policy.
2. Product-route decision system for V3 Authorization Code, PKCE, Device Flow, client/two-legged route if confirmed, contacts sync, lists/tags/segments/custom fields, bulk activities, email campaign read, email campaign create/update, campaign scheduling/sending, campaign reporting, contact tracking, account services, partner webhooks, SMS, Zapier, Make, legacy V2/EventSpot, CRM/AMS sync, data warehouse sync, custom middleware, and hybrid route.
3. Constant Contact adapter interface.
4. Mock OAuth2 server with authorization code, PKCE, device flow, refresh token, scope grant/denial, token expiry, token revocation, bad redirect URI, bad client secret, and state mismatch behavior.
5. Mock scopes/permissions simulator.
6. Mock V3 contacts server with contacts, list memberships, tags, custom fields, contact status, permission-to-send/source rules, duplicate email, changed email, unsubscribe protection, and pagination.
7. Mock contact lists/tags/segments/custom-fields simulator.
8. Mock bulk activities server with async activity state machine, result files, partial failures, queue limits, timeouts, and polling backoff.
9. Mock email campaigns and campaign activities server with draft/update/preview/test/schedule/send guardrails.
10. Mock reporting server with sends, opens, clicks, bounces, unsubscribes, contact tracking, late events, and reporting delay.
11. Mock account services server with account_read/account_update and account owner constraints.
12. Mock partner webhook server with subscriptions, topic IDs, delivery, duplicate/out-of-order events, detail retrieval, JWT signature verification, JWKS caching, and key rotation.
13. Mock SMS guardrail route disabled unless product/scopes confirm SMS.
14. Mock legacy V2/EventSpot guardrail route so old docs are not mixed into V3.
15. Mock CRM/AMS sync route.
16. Mock Zapier/Make route.
17. Synthetic data generator for contacts, lists, tags, segments, custom fields, campaigns, activities, reporting events, bulk activities, and webhooks.
18. Error simulator for 400/401/403/404/409/415/422/429/500/503/timeouts/invalid client/invalid token/scope missing/activity queue limit/campaign send blocked/webhook signature invalid.
19. Secret/PII/campaign-content redaction tests.
20. Postman/Newman, OpenAPI, and schema files.
21. Contract tests that run against mock first, customer test account later, and production-smoke last.
22. Customer/vendor/admin request packet.
23. Test-account calibration checklist.
24. Production smoke-test checklist.

Rules:
- Real adapter disabled until route and official docs/customer config/test account are confirmed.
- Official V3 docs are generic API authority, but customer configuration/test responses are required for customer-specific fields, lists, segments, scopes, campaigns, and permissions.
- Partner webhooks are separate from normal API writes.
- SMS is disabled unless product access and scopes are confirmed.
- Legacy V2/EventSpot docs are not V3 implementation authority.
- All real implementation facts must cite source/evidence entries.
- Do not log client secrets, authorization codes, access tokens, refresh tokens, device codes, webhook signatures, Authorization headers, contact PII, custom sensitive fields, or campaign body content.
- Every write must use idempotency or reconciliation where possible.
- Never blindly retry uncertain writes.
- Bulk imports, contact updates, campaign creates/updates, campaign scheduling/sending, account updates, and SMS sends are disabled unless explicitly approved.
- Full sync is not allowed until tiny test-account tests pass.

The output should be detailed enough that a developer can run the local mock lab and test nearly every integration failure mode before real Constant Contact credentials arrive.
```

## Bottom line

The correct Constant Contact strategy is:

```txt id="y6qckw"
Do not wait for real credentials to build.

Build the mock V3 API / OAuth / contacts / lists / tags / segments / custom-fields / bulk-activity / campaigns / reporting / webhooks lab now.
Use official docs to shape the mock.
Keep customer-specific facts in config and evidence logs.
When test-account credentials arrive, run the same contract tests against the test account.
Update the mock to match test-account behavior.
Only then run tiny production smoke tests.
```

The mock should be almost real in behavior, but honest in naming.

It is a compatibility lab, not a claim that the real customer’s Constant Contact account has been validated.

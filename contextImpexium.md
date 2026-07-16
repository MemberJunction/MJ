# impexium-remembers-integration-lab-context.md

## Purpose

This file is a Claude Code / agent-ready context document for building and testing a production-shaped **Impexium / re:Members AMS** integration when the developer does **not** yet have real Impexium/re:Members credentials, API keys, client ID, client secret, tenant URL, REST endpoint base URL, webhook credentials, Power Platform connector access, Salesforce-route access, SSO configuration, sandbox access, production access, customer-specific fields, membership type codes, event/product/catalog rules, financial permissions, or writeback approval.

The goal is not to pretend to validate a customer’s real Impexium / re:Members environment.

The goal is to build the strongest legal Impexium / re:Members Integration Lab possible using:

```txt id="bizbv8"
official re:Members / Impexium documentation when provided
customer-provided API documentation
customer-provided integration runbooks
vendor/support-provided API route details
customer sandbox/test environment later
local Impexium REST compatibility mock
local webhook compatibility mock
local Power Platform / Power Automate compatibility mock
local Salesforce-route compatibility mock if confirmed
local SSO simulator
local member/profile simulator
local organization/account simulator
local membership simulator
local committee/chapter/group simulator
local event/catalog/product simulator
local order/invoice/payment simulator
local LMS/CE/certification writeback simulator
local Higher Logic community route simulator
local Higher Logic marketing / Thrive Marketing route simulator
local email marketing route simulator
local accounting/finance route simulator
local mobile app route simulator
local custom middleware simulator
synthetic contacts
synthetic organizations
synthetic memberships
synthetic member types
synthetic groups
synthetic committees
synthetic chapters
synthetic events
synthetic registrations
synthetic products/catalog items
synthetic orders
synthetic invoices
synthetic payments
synthetic activities
synthetic CE/certification records
synthetic webhook deliveries
OpenAPI compatibility fixtures
Postman/Newman collections
contract tests
CI
sandbox calibration scripts
production smoke-test plan
```

The standard is:

```txt id="fzkh66"
Mock real first.
Calibrate with sandbox/test credentials later.
Smoke test production last.
```

## Non-negotiable rule

Claude Code must not invent customer-specific Impexium / re:Members implementation details.

Claude Code may model Impexium-like behavior, especially REST APIs, webhooks, Power Automate-style workflows, SSO, LMS writebacks, Higher Logic community/marketing sync, event/product/order data, and CRM/AMS-style records, but every mock must be clearly labeled as a compatibility mock.

Use names like:

```txt id="n3vjqd"
impexium-compatibility-mock
remembers-compatibility-mock
mock-impexium-rest-server
mock-remembers-api-server
mock-impexium-webhook-server
mock-impexium-sso-server
mock-impexium-power-platform-server
```

Do not use names like:

```txt id="l58gsk"
real-impexium-api
official-impexium-client
production-remembers-adapter
```

until official docs, customer configuration, and sandbox validation exist.

Every real implementation claim must have evidence:

```txt id="x2znfy"
official re:Members / Impexium docs
customer docs
vendor/support docs
customer sandbox response
admin confirmation
approved partner implementation doc
Power Platform connector documentation
Salesforce-route documentation
Higher Logic route documentation
LMS partner implementation notes
```

Partner pages, Higher Logic guides, LMS pages, marketing pages, and public re:Members pages are behavioral clues unless the customer confirms that exact route.

## Critical product distinction

Do not treat “Impexium” as one uniform implementation.

Use a route decision first.

Possible modern names and routes:

```txt id="o6prh0"
Impexium
re:Members AMS
re:Members AMS on Microsoft Power Platform
re:Members AMS Platform built on Salesforce
legacy Impexium customer implementation
customer-specific REST API route
webhooks route
Power Automate connector route
Salesforce-route route
Higher Logic Community route
Higher Logic Thrive Marketing route
LMS / TopClass / OasisLMS route
accounting / Sage Intacct / finance route
event / mobile app / website route
custom middleware route
hybrid route
```

Do not mix these without confirmation:

```txt id="pdcu1l"
1. Impexium / re:Members core AMS API
   Source of truth for members, organizations, memberships, events, products, orders, invoices, and payments.

2. Microsoft Power Platform / Power Automate route
   Workflow/connector route.
   Useful for automations and notifications.
   Not automatically equivalent to full REST API access.

3. Salesforce-built re:Members AMS Platform route
   May imply Salesforce object/API patterns.
   Do not assume Salesforce unless customer confirms.

4. Higher Logic Community route
   Community/profile/security-group sync.
   Not the same as marketing automation.

5. Higher Logic Thrive Marketing route
   Marketing data upload/sync route.
   May use shared views, SQL views, query outputs, or sync-on-send.
   Does not necessarily write tracking/activity data back to Impexium.

6. LMS route
   SSO, member updates, product/catalog sync, purchases, activity writebacks, certification writebacks.
   Requires LMS-specific route confirmation.

7. Finance/accounting route
   Orders, invoices, payments, refunds, revenue recognition, accounting sync.
   Much higher write-safety standard.
```

For this file, assume:

```txt id="lkoqdq"
Impexium / re:Members AMS core integration first.
```

Only enable Power Platform, Salesforce, Higher Logic, LMS, marketing, or finance routes after the route decision confirms them.

## Core framing

Impexium / re:Members is not one single route.

Treat it as an AMS platform with multiple possible integration surfaces.

Possible routes:

```txt id="ycnrxx"
core REST API route
customer-specific API route
OAuth/client-credential route if confirmed
API-key route if confirmed
vendor-issued credential route
webhook route
Power Platform connector route
Power Automate workflow route
Salesforce object/API route if customer is on Salesforce-based re:Members AMS Platform
SSO route
member profile sync route
organization/account sync route
membership sync route
committee/chapter/group sync route
event/catalog/product sync route
order/invoice/payment read route
order/invoice/payment write route
LMS SSO route
LMS course/catalog route
LMS purchase/access route
LMS activity writeback route
LMS certification writeback route
Higher Logic Community route
Higher Logic Thrive Marketing route
email marketing route
accounting/finance route
mobile app route
website/CMS route
custom middleware route
hybrid route
```

The first task is not coding the real adapter.

The first task is:

```txt id="b8fsd6"
identify the route
collect authoritative source docs
build mocks for likely routes
make real adapter disabled until route is confirmed
run contract tests against the mock
calibrate with sandbox later
```

## What can be built without real credentials

Without real credentials, Claude Code can legally build:

```txt id="ar7a8r"
source register
evidence log
unknowns register
route decision file
customer/vendor/admin request packet
Impexium adapter interface
mock REST API server
mock auth/token server
mock API-key validator
mock OAuth/client-credential server
mock vendor credential validator
mock webhook sender/receiver
mock Power Platform connector simulator
mock Power Automate workflow simulator
mock Salesforce-route simulator
mock SSO server
mock member/profile server
mock organization/account server
mock membership server
mock committee/chapter/group server
mock event/catalog/product server
mock order/invoice/payment server
mock LMS SSO server
mock LMS activity writeback server
mock certification writeback server
mock Higher Logic community sync server
mock Higher Logic marketing sync server
mock query/view/shared-view sync server
mock accounting/finance server
mock mobile app sync server
synthetic members
synthetic organizations
synthetic memberships
synthetic member type codes
synthetic groups
synthetic committees
synthetic chapters
synthetic events
synthetic products
synthetic catalog items
synthetic purchases
synthetic orders
synthetic invoices
synthetic payments
synthetic refunds
synthetic activities
synthetic certification completions
synthetic webhook events
OpenAPI compatibility fixtures
Postman/Newman collections
contract tests
CI tests
sandbox calibration scripts
production smoke-test checklist
```

Without real credentials, Claude Code cannot honestly prove:

```txt id="d5fp88"
the real customer API base URL
the real customer API credential type
the real customer API key
the real customer OAuth client ID
the real customer OAuth client secret
the real customer tenant/instance URL
the real customer REST endpoint paths
the real customer webhook event types
the real customer webhook signature behavior
the real customer Power Automate connector permissions
the real customer Salesforce object model
the real customer SSO flow
the real customer member type codes
the real customer membership expiration behavior
the real customer custom fields
the real customer groups/committees/chapters
the real customer event/catalog/product model
the real customer order/invoice/payment model
the real customer writeback permissions
the real customer LMS mappings
the real customer Higher Logic mappings
the real customer query/shared-view definitions
the real customer production performance
```

So the mock lab proves architecture and safety.

Sandbox/test credentials prove real compatibility.

Production smoke tests prove safe live access.

## Source authority hierarchy

Claude Code must rank Impexium / re:Members sources in this order.

### Tier 0 — Customer/vendor-provided Impexium / re:Members API documentation

Highest authority for real implementation.

Get from:

```txt id="t5exnk"
customer Impexium/re:Members administrator
customer AMS administrator
customer IT team
customer integration owner
re:Members support representative
Impexium/re:Members implementation partner
customer secure document handoff
customer internal integration runbook
customer admin screen share
customer sandbox response
```

Use for:

```txt id="njgdmx"
actual product route
actual API base URL
actual credential type
actual auth flow
actual endpoint paths
actual request bodies
actual response bodies
actual webhook topics
actual webhook signing method
actual SSO route
actual member fields
actual organization fields
actual membership fields
actual custom fields
actual member type codes
actual expiration behavior
actual groups/committees/chapters
actual events/products/orders/payments
actual writeback methods
actual sandbox instructions
actual support escalation path
```

Customer/vendor docs beat public partner pages.

### Tier 1 — Sandbox/test environment observations

Use after authorized access exists.

Use for:

```txt id="t6c9gb"
verifying auth
verifying endpoint paths
verifying REST response shapes
verifying webhook behavior
verifying SSO redirects/tokens
verifying Power Automate connector behavior
verifying Salesforce object behavior if applicable
verifying member type codes
verifying custom field behavior
verifying group rules
verifying event/catalog behavior
verifying order/payment behavior
verifying writeback permissions
verifying error bodies
verifying rate limits
```

Sandbox behavior beats generic docs.

### Tier 2 — re:Members official public pages

Use as source-discovery clues.

Useful for:

```txt id="woabp3"
current product naming
re:Members vs Impexium naming
Power Platform route clues
Salesforce-route clues
web APIs and webhooks route clues
Power Automate connector clue
partner ecosystem clues
```

Not sufficient for:

```txt id="g04fps"
building real endpoints
assuming auth flow
assuming customer fields
assuming writeback permissions
assuming exact object model
```

### Tier 3 — Higher Logic Impexium / re:Members integration docs

Use as partner-route evidence only.

Useful for:

```txt id="f3oggv"
Higher Logic marketing route
shared views
SQL views
query outputs
scheduled sync
sync-on-send
profile/demographic personalization fields
upload limitations
tracking-display-only behavior
no-writeback warning
community/profile/security-group worksheet clues if available
```

Not sufficient for:

```txt id="g2l7rl"
core Impexium API implementation
general Impexium writebacks
customer-specific fields
customer-specific query definitions
assuming Higher Logic is in scope
```

### Tier 4 — LMS partner docs

Use as LMS-route evidence only.

Useful for:

```txt id="jcyamf"
standard REST endpoint clue
API credential request process clue
SSO behavior clue
member profile updates
group assignment
catalog/activity import
purchase sync
activity completion writebacks
certification writebacks
```

Not sufficient for:

```txt id="jgd9kd"
customer real endpoint paths
universal Impexium API schema
universal LMS behavior
financial write approval
```

### Tier 5 — Power Platform / Power Automate docs

Use only if customer confirms re:Members Power Platform route.

Useful for:

```txt id="v0l8yu"
connector behavior
workflow triggers
workflow actions
file sync
notifications
collecting data
approval flows
low-code automation constraints
```

Not sufficient for:

```txt id="p7yxh2"
REST endpoint implementation
non-Power-Platform customers
Salesforce-route customers
```

### Tier 6 — Salesforce docs

Use only if the customer confirms they are on re:Members AMS Platform built on Salesforce.

Useful for:

```txt id="kci93z"
Salesforce object/API behavior
OAuth/Connected App behavior
SOQL query behavior
Bulk API behavior
Platform Events if used
permission sets
field-level security
validation rules
flows
```

Not sufficient unless the route is confirmed.

### Tier 7 — Partner pages, marketplace pages, blogs, community posts

Use only as behavioral clues.

They can suggest:

```txt id="f7mzbx"
a route exists
web APIs exist
webhooks exist
SSO exists
REST endpoint exists
Power Automate connector exists
LMS writebacks exist
finance/accounting integrations exist
```

They cannot define:

```txt id="ipn3la"
customer endpoint
customer credentials
customer fields
customer custom objects
customer writeback method
customer production behavior
```

## Required source files

Claude Code must create:

```txt id="yxk4px"
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

```txt id="d5bse4"
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

```txt id="s7sikc"
customer_doc
vendor_doc
sandbox_response
official_public_page
re_members_public_page
higher_logic_partner_doc
lms_partner_doc
power_platform_doc
salesforce_doc
webhook_doc
sso_doc
marketing_page
partner_page
support_ticket
admin_screen_share
```

### evidence-log.md

Every implementation claim must be logged.

Claims include:

```txt id="nr1zob"
route
product version
re:Members vs legacy Impexium
Power Platform route
Salesforce route
auth method
API base URL
endpoint path
required headers
request body
response body
webhook event type
webhook signature method
SSO route
member field mapping
organization field mapping
membership field mapping
member type code
expiration field
group mapping
committee mapping
chapter mapping
event mapping
catalog/product mapping
order/invoice/payment mapping
activity writeback method
certification writeback method
query/shared-view definition
rate limit behavior
pagination behavior
error behavior
write permission
```

If unsupported:

```txt id="iy6wbh"
UNCONFIRMED_DO_NOT_IMPLEMENT
```

### unknowns-register.md

Track unknowns:

```txt id="ndubn0"
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

```txt id="g9es7y"
BLOCKS_ROUTE_DECISION
BLOCKS_AUTH
BLOCKS_MOCK_CALIBRATION
BLOCKS_REAL_IMPLEMENTATION
BLOCKS_SSO
BLOCKS_WEBHOOKS
BLOCKS_POWER_PLATFORM
BLOCKS_SALESFORCE_ROUTE
BLOCKS_MEMBER_SYNC
BLOCKS_EVENT_SYNC
BLOCKS_FINANCIALS
BLOCKS_WRITEBACK
BLOCKS_PRODUCTION
NICE_TO_HAVE
```

## Product-route decision

Claude Code must create:

```txt id="bzg4ln"
docs/product-route-decision.md
```

Allowed route values:

```txt id="owx3h9"
unknown
impexium_legacy_api
remembers_core_rest_api
remembers_customer_specific_api
remembers_webhooks
remembers_power_platform
remembers_power_automate_connector
remembers_salesforce_platform
remembers_sso
remembers_member_profile_sync
remembers_organization_sync
remembers_membership_sync
remembers_committee_chapter_group_sync
remembers_event_catalog_product_sync
remembers_order_invoice_payment_read
remembers_order_invoice_payment_write
remembers_lms_sso
remembers_lms_activity_writeback
remembers_lms_certification_writeback
remembers_higher_logic_community
remembers_higher_logic_marketing
remembers_email_marketing
remembers_accounting_finance
remembers_mobile_app
remembers_website_cms
custom_middleware
hybrid
```

If route is unknown:

```txt id="keyb0m"
real adapter disabled
only mocks and source-acquisition docs allowed
```

If route is confirmed:

```txt id="sk63m6"
required source docs checklist generated
mock scenario selected
contract tests generated
sandbox validation plan generated
```

Route decision test cases:

```txt id="fh0trv"
unknown route blocks real adapter
core REST route enables REST mock
customer-specific API route requires customer docs
webhook route enables webhook simulator
Power Platform route enables connector/workflow simulator
Salesforce route enables Salesforce object simulator
SSO route enables SSO simulator
member sync route enables member/profile tests
group sync route enables committee/chapter/group tests
event/catalog route enables event/product tests
finance route enables invoice/payment safety tests
LMS route enables activity/certification writeback tests
Higher Logic marketing route enables shared-view/query sync tests
hybrid route enables multiple adapters
route change invalidates mappings
```

## Canonical adapter interface

Build an internal adapter interface.

```ts id="wiuaan"
interface ImpexiumAdapter {
  authenticate(): Promise<AuthState>;

  getMember(memberId: string): Promise<CanonicalMember>;
  searchMembers(query: MemberQuery): Promise<Page<CanonicalMember>>;
  updateMember(memberId: string, update: MemberUpdate): Promise<WriteResult>;

  getOrganization(organizationId: string): Promise<CanonicalOrganization>;
  searchOrganizations(query: OrganizationQuery): Promise<Page<CanonicalOrganization>>;

  getMemberships(memberId: string): Promise<CanonicalMembership[]>;
  getMemberTypes(): Promise<CanonicalMemberType[]>;

  getGroups(memberId: string): Promise<CanonicalGroup[]>;
  getCommittees(memberId: string): Promise<CanonicalCommittee[]>;
  getChapters(memberId: string): Promise<CanonicalChapter[]>;

  getEvents(query: EventQuery): Promise<Page<CanonicalEvent>>;
  getEvent(eventId: string): Promise<CanonicalEvent>;
  getRegistrations(eventId: string): Promise<Page<CanonicalEventRegistration>>;

  getProducts(query: ProductQuery): Promise<Page<CanonicalProduct>>;
  getOrders(query: OrderQuery): Promise<Page<CanonicalOrder>>;
  getInvoices(query: InvoiceQuery): Promise<Page<CanonicalInvoice>>;
  getPayments(query: PaymentQuery): Promise<Page<CanonicalPayment>>;

  writeActivity(activity: ActivityWriteback): Promise<WriteResult>;
  writeCertification(certification: CertificationWriteback): Promise<WriteResult>;

  processWebhook(event: ImpexiumWebhookEvent): Promise<WebhookProcessResult>;

  authenticateSsoExchange(input: SsoExchangeInput): Promise<SsoIdentity>;

  capabilities(): Promise<ImpexiumCapabilities>;
}
```

Implementations:

```txt id="v1eb44"
MockImpexiumRestAdapter
MockRemembersCoreRestAdapter
MockImpexiumWebhookAdapter
MockImpexiumPowerPlatformAdapter
MockImpexiumSalesforceRouteAdapter
MockImpexiumSsoAdapter
MockImpexiumLmsAdapter
MockImpexiumHigherLogicCommunityAdapter
MockImpexiumHigherLogicMarketingAdapter
ImpexiumRestAdapter
RemembersRestAdapter
RemembersPowerPlatformAdapter
RemembersSalesforceAdapter
```

Real adapters stay disabled until official docs/sandbox confirm route.

## Canonical model

Use canonical objects internally.

```ts id="r7n8xx"
type CanonicalMember = {
  id: string;
  externalId?: string;
  legacyId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  organizationId?: string;
  organizationName?: string;
  memberType?: string;
  memberTypeCode?: string;
  membershipStatus?: string;
  expiresAt?: string;
  isMember?: boolean;
  isStaff?: boolean;
  groups?: CanonicalGroup[];
  committees?: CanonicalCommittee[];
  chapters?: CanonicalChapter[];
  customFields?: Record<string, unknown>;
  raw?: unknown;
};
```

```ts id="t7yqfu"
type CanonicalOrganization = {
  id: string;
  externalId?: string;
  name: string;
  organizationType?: string;
  membershipStatus?: string;
  expiresAt?: string;
  parentOrganizationId?: string;
  customFields?: Record<string, unknown>;
  raw?: unknown;
};
```

```ts id="llq0zr"
type CanonicalMembership = {
  id: string;
  memberId?: string;
  organizationId?: string;
  memberTypeCode?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  expirationDate?: string;
  raw?: unknown;
};
```

```ts id="g8yevu"
type CanonicalEvent = {
  id: string;
  name: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  registrationStatus?: string;
  productId?: string;
  catalogItemId?: string;
  raw?: unknown;
};
```

```ts id="pctyif"
type CanonicalOrder = {
  id: string;
  memberId?: string;
  organizationId?: string;
  status?: string;
  total?: number;
  currency?: string;
  createdAt?: string;
  lineItems?: CanonicalOrderLine[];
  raw?: unknown;
};
```

```ts id="zypcvu"
type ActivityWriteback = {
  externalId: string;
  memberId: string;
  activityType: string;
  activitySubType?: string;
  activityDate: string;
  sourceSystem: string;
  description?: string;
  metadata?: Record<string, unknown>;
};
```

```ts id="h2toj0"
type CertificationWriteback = {
  externalId: string;
  memberId: string;
  certificationCode?: string;
  certificationName?: string;
  achievedAt: string;
  expiresAt?: string;
  sourceSystem: string;
  metadata?: Record<string, unknown>;
};
```

## Customer configuration model

All customer-specific details must live in config.

```json id="pr86v2"
{
  "customer": "Example Association",
  "platform": "impexium_remembers",
  "route": "remembers_core_rest_api",
  "environment": "mock",
  "urls": {
    "apiBase": "http://localhost:4010/api",
    "webhookBase": "http://localhost:4020/webhooks",
    "ssoBase": "http://localhost:4030/sso"
  },
  "auth": {
    "type": "vendor_issued_api_credentials",
    "apiKeyEnv": "IMPEXIUM_API_KEY",
    "clientIdEnv": "IMPEXIUM_CLIENT_ID",
    "clientSecretEnv": "IMPEXIUM_CLIENT_SECRET",
    "tenantEnv": "IMPEXIUM_TENANT"
  },
  "memberMapping": {
    "id": "memberId",
    "externalId": "externalId",
    "email": "email",
    "firstName": "firstName",
    "lastName": "lastName",
    "organizationId": "organizationId",
    "memberTypeCode": "memberTypeCode",
    "membershipStatus": "membershipStatus",
    "expiresAt": "membershipExpirationDate"
  },
  "accessRules": {
    "defaultDeny": true,
    "activeStatuses": ["Active", "Current"],
    "denyStatuses": ["Expired", "Lapsed", "Suspended"],
    "staffMemberTypeCodes": ["STAFF"],
    "requireExpirationAfterToday": true
  },
  "writeback": {
    "enabled": false,
    "activityType": "LMS_COMPLETION",
    "certificationType": "CERTIFICATION_COMPLETION",
    "idempotencyField": "external_activity_id"
  },
  "webhooks": {
    "enabled": false,
    "secretEnv": "IMPEXIUM_WEBHOOK_SECRET",
    "validateSignature": true
  },
  "powerPlatform": {
    "enabled": false,
    "connectorName": "reMembers",
    "environmentEnv": "POWER_PLATFORM_ENVIRONMENT"
  },
  "salesforceRoute": {
    "enabled": false,
    "instanceUrlEnv": "SALESFORCE_INSTANCE_URL"
  }
}
```

## Mock-real integration lab

The Impexium / re:Members lab should include multiple mock servers.

```txt id="yu54lk"
mock-impexium-auth-server
mock-impexium-rest-api-server
mock-impexium-webhook-server
mock-impexium-sso-server
mock-impexium-power-platform-server
mock-impexium-salesforce-route-server
mock-impexium-member-server
mock-impexium-event-product-server
mock-impexium-order-payment-server
mock-impexium-lms-writeback-server
mock-impexium-higher-logic-community-server
mock-impexium-higher-logic-marketing-server
mock-impexium-finance-server
```

Use Docker Compose.

```txt id="pf2qmt"
impexium-remembers-integration-lab/
  docker-compose.yml
  mock-server/
  webhook-lab/
  sso-server/
  synthetic-data/
  tests/
  postman/
  openapi/
  schemas/
  docs/
```

## Mock authentication server

### Purpose

Model Impexium / re:Members authentication without real credentials.

### Auth modes to simulate

```txt id="gmqioi"
vendor-issued API key
client ID / client secret
OAuth client credentials if confirmed
OAuth authorization code if confirmed
tenant-scoped token
API username/password if confirmed
Power Platform connector auth
Salesforce Connected App auth if Salesforce route confirmed
SSO token
service account
admin account
read-only account
write-enabled account
```

### Mock paths

Use local compatibility paths only.

```txt id="iaxztd"
POST /auth/token
POST /auth/refresh
GET  /auth/introspect
POST /auth/revoke
```

These are local compatibility paths. Do not claim they are real Impexium paths.

### Auth test cases

```txt id="ssecgm"
valid API key
bad API key
missing API key
valid client credentials
bad client secret
wrong tenant
wrong environment
token expired
token revoked
token valid but read-only
token valid but no event access
token valid but no financial access
token valid but no writeback access
Power Platform connector credential revoked
Salesforce token expired
credential accidentally logged
```

Expected behavior:

```txt id="rpyjpc"
authenticate before API call
store credentials securely
do not log API keys/secrets/tokens
wrong tenant stops immediately
403 is permission issue, not empty data
write scopes surfaced separately from read scopes
```

## Mock core REST API server

### Purpose

Model customer-confirmed Impexium / re:Members REST-like behavior without inventing real endpoint details.

### Mock capability areas

```txt id="ssn0bk"
members
contacts
organizations
accounts
memberships
member types
groups
committees
chapters
events
registrations
products
catalog
orders
invoices
payments
activities
certifications
custom fields
audit fields
pagination
filtering
sorting
batch reads
validation errors
rate limits
```

### Mock paths

Use local compatibility paths only.

```txt id="q4q9sa"
GET    /api/members
GET    /api/members/{memberId}
POST   /api/members
PATCH  /api/members/{memberId}

GET    /api/organizations
GET    /api/organizations/{organizationId}

GET    /api/memberships
GET    /api/member-types
GET    /api/groups
GET    /api/committees
GET    /api/chapters

GET    /api/events
GET    /api/events/{eventId}
GET    /api/events/{eventId}/registrations

GET    /api/products
GET    /api/catalog/items

GET    /api/orders
GET    /api/orders/{orderId}
GET    /api/invoices
GET    /api/payments

GET    /api/activities
POST   /api/activities

POST   /api/certifications
```

Do not claim these are the real customer paths.

### REST test cases

```txt id="wttqd9"
fetch member
search members
member not found
member hidden by permission
fetch organization
fetch memberships
fetch member types
fetch groups
fetch committees
fetch chapters
fetch events
fetch registrations
fetch products
fetch orders
fetch invoices
fetch payments
create activity writeback allowed
activity writeback denied
create certification writeback allowed
certification writeback denied
custom field present
custom field missing
invalid filter
unsupported sort
pagination token expired
rate limited
permission denied
validation failure
malformed JSON response
```

Expected behavior:

```txt id="bgxxv4"
adapter abstraction hides platform-specific paths
all endpoint paths remain mock-only until confirmed
schema validation required
pagination required
custom fields config-driven
financial writes disabled by default
raw payload preserved
```

## Mock webhooks server

### Purpose

Model Impexium / re:Members webhooks without assuming real event names.

### Components

```txt id="jsuj3f"
webhook configuration
webhook event selector
webhook sender
webhook receiver
webhook signature simulator
webhook retry simulator
webhook delivery log
webhook disabled state
```

### Event categories to model

```txt id="e9cbk7"
member created
member updated
member deleted/deactivated
organization updated
membership changed
group changed
committee changed
chapter changed
event created
event updated
registration created
registration updated
order created
invoice updated
payment created
product/catalog updated
activity created
certification updated
```

Do not assume these are real event names. They are mock categories.

### Test cases

```txt id="waqa65"
valid webhook
bad signature
missing signature
duplicate webhook
out-of-order webhook
webhook before API record is updated
webhook references missing object
webhook references unauthorized object
malformed JSON
unknown event type
receiver returns 500
receiver times out
retry arrives
webhook disabled
webhook deleted
delivery stopped
```

Expected behavior:

```txt id="o4gd4u"
webhook is trigger, not full truth
dedupe by event ID if present
fetch latest record from API
ack only after durable queue if possible
webhook secrets not logged
event names must be confirmed by customer/vendor
```

## Mock SSO server

### Purpose

Model Impexium / re:Members SSO separately from backend API sync.

### SSO routes to model

```txt id="xar7vz"
vendor-recommended Impexium SSO
SAML
OIDC
OAuth2 authorization code
JWT SSO
custom token handoff
LMS embedded SSO route
community SSO route
mobile app SSO route
```

### Test cases

```txt id="xc3alu"
valid SSO login
bad redirect URI
missing token
expired token
invalid token
token replayed
unknown user
inactive member
expired member
member lacks group
member lacks product purchase
member purchase grants LMS access
email changed
member ID changed
organization relationship changed
logout
clock skew
```

Expected behavior:

```txt id="izrah3"
SSO authenticates identity
authorization still uses membership/group/product rules
SSO not used as full profile sync unless confirmed
claims/profile fields mapped by config
SSO secrets/tokens not logged
```

## Mock member/profile simulator

### Purpose

Model member identity, membership status, expiration, organization relationship, and custom fields.

### Member cases

```txt id="u2zp1x"
active member
expired member
lapsed member
suspended member
prospect
nonmember
staff
student
retired member
organization member
individual linked to organization
member with no email
member with duplicate email
member with changed email
member with multiple memberships
member with custom field missing
member with invalid date
member hidden by permission
member deleted/deactivated
```

### Test cases

```txt id="fyvub9"
create local user from member
update local user from member
deactivate local user
reactivate local user
dedupe by external ID
email-only dedupe blocked unless approved
email changed
member ID changed
organization changed
membership status changed
expiration changed
custom field changed
member type changed
staff flag changed
```

Expected behavior:

```txt id="v188g0"
external ID is primary identity
email alone is not enough unless customer approves
deactivation should not delete by default
raw AMS ID stored
access decision explainable
sync is resumable
```

## Mock organizations/accounts simulator

### Purpose

Model company memberships, organization relationships, parent-child structure, and inherited access.

### Cases

```txt id="m8hmm5"
organization with active membership
organization with expired membership
individual inherits organization membership
individual does not inherit organization membership
primary contact
billing contact
parent organization
subsidiary
branch/chapter organization
organization renamed
organization merged
organization deleted/deactivated
```

### Test cases

```txt id="t5he84"
organization read
organization update
member-company link
primary contact changes
inherit access from company
do not inherit access when forbidden
organization merge handling
duplicate organization
parent organization unavailable
```

Expected behavior:

```txt id="j0l5e3"
organization membership rules config-driven
inheritance not assumed
organization IDs are stable keys
renames do not create duplicates
```

## Mock membership/access-rule simulator

### Purpose

Model access decisions based on membership type, status, expiration, groups, committees, chapters, purchases, and custom fields.

### Rules to support

```txt id="fep8ub"
active status grants access
expired/lapsed/suspended status denies access
membership expiration date must be after today
member type grants access
staff type grants staff access
security group grants access
committee membership grants access
chapter membership grants access
event registration grants access
product/catalog purchase grants access
order/payment status grants access
custom field grants access
deny group overrides allow group
```

### Test cases

```txt id="j816z5"
active + not expired -> allow
active + expired -> deny
lapsed + allow group -> depends on config
deny group + active -> deny
missing expiration -> depends on config
unknown status -> deny by default
multiple memberships -> configured rule
future membership -> depends on config
paid product purchase -> allow
unpaid order -> deny
refunded order -> deny
```

Expected behavior:

```txt id="t0pidb"
default deny when rule cannot be evaluated
rules config-driven
record why access was granted or denied
do not hardcode member type codes
```

## Mock groups/committees/chapters simulator

### Purpose

Model association-specific group structure.

### Objects

```txt id="r0nld0"
group
committee
chapter
section
special interest group
region
role
position
start date
end date
active/inactive flag
```

### Test cases

```txt id="djthsr"
group added
group removed
group expired
committee added
committee removed
committee role changed
chapter added
chapter removed
chapter expired
role renamed
group ID reused
group hidden
multiple groups grant access
deny group overrides allow group
```

Expected behavior:

```txt id="dqlc7q"
group IDs config-driven
role/access rules config-driven
start/end dates honored
removals are idempotent
renames do not duplicate groups
```

## Mock event/catalog/product simulator

### Purpose

Model events, activities, catalog items, products, registrations, and purchases.

### Objects

```txt id="mezx5w"
event
event session
registration
product
catalog item
course/activity
price
capacity
waitlist
purchase eligibility
member price
nonmember price
registration status
```

### Test cases

```txt id="mgl5wa"
event created
event updated
event cancelled
event missing end date
event has sessions
registration created
registration cancelled
registration transferred
catalog product created
catalog product updated
catalog product retired
purchase grants access
purchase pending
purchase failed
purchase refunded
member price vs nonmember price
event timezone issue
```

Expected behavior:

```txt id="q5ns2o"
event/product route separate from member route
purchase/access logic config-driven
payment state not guessed
timezone normalized
```

## Mock orders/invoices/payments simulator

### Purpose

Model read-only and approved-write financial behavior.

### Objects

```txt id="d1xjhv"
order
invoice
payment
refund
credit memo
line item
product purchase
event registration purchase
membership dues
tax
discount
accounting export
```

### Test cases

```txt id="v1jhtn"
read order
read invoice
read payment
payment pending
payment complete
payment failed
refund issued
invoice voided
duplicate payment
closed accounting period
invalid account/item mapping
currency mismatch
timeout before financial write
timeout after successful write
financial write disabled
```

Expected behavior:

```txt id="n6fp03"
financial route read-only by default
financial writes require explicit approval
never blindly retry payments
reconcile before retry
record audit trail
safe test record required
```

## Mock LMS route simulator

### Purpose

Model LMS integration behavior such as SSO, member updates, catalog/activity import, purchase sync, activity completion writeback, and certification writeback.

### Objects

```txt id="tf5p9b"
learner
course/activity
catalog item
purchase
enrollment
completion
CE credit
certification
activity writeback
certification writeback
```

### Test cases

```txt id="yphsgr"
active member SSO to LMS
expired member denied LMS access
member grouped by location
member grouped by membership type
catalog activity imported
purchase imported
purchase grants course access
completion writes activity
completion duplicate prevented
certification writes back
certification duplicate prevented
completion correction
writeback timeout before success
writeback timeout after success
writeback permission denied
```

Expected behavior:

```txt id="c3sfis"
LMS route modeled separately
writebacks require idempotency
read/reconcile before retry
CE/certification writes require approval
```

## Mock activity/certification writeback simulator

### Purpose

Model writing completions, CE credits, and certifications back into Impexium / re:Members.

### Mock paths

Use local compatibility paths only.

```txt id="kxfn4r"
POST /mock/activity-writeback
POST /mock/certification-writeback
GET  /mock/writebacks/{externalId}
```

### Activity request model

```json id="mlf5i7"
{
  "externalId": "completion_000001",
  "memberId": "member_000001",
  "activityType": "LMS_COMPLETION",
  "activitySubType": "COURSE_COMPLETE",
  "activityDate": "2026-06-20T12:00:00Z",
  "sourceSystem": "LMS",
  "description": "Completed Ethics 101"
}
```

### Certification request model

```json id="xeie5z"
{
  "externalId": "cert_000001",
  "memberId": "member_000001",
  "certificationCode": "CERT_ETHICS",
  "certificationName": "Ethics Certificate",
  "achievedAt": "2026-06-20T12:00:00Z",
  "expiresAt": "2028-06-20T12:00:00Z",
  "sourceSystem": "LMS"
}
```

### Test cases

```txt id="j37bvv"
write succeeds
duplicate external ID
missing member
invalid activity type
invalid certification type
activity mapping missing
certification mapping missing
date invalid
permission denied
validation failure
timeout before write
timeout after successful write
retry after uncertain outcome
read/reconcile before retry
```

Expected behavior:

```txt id="pisqcp"
idempotency required
never blindly retry uncertain writes
write audit log stored
safe test record required
production writes disabled by default
```

## Mock Higher Logic Community route simulator

### Purpose

Model Impexium / re:Members to Higher Logic Community sync.

### Objects

```txt id="magst1"
member profiles
security groups
communities
member types
member status
expiration fields
committees
chapters
events
SSO
periodic refresh
member refresh
```

### Test cases

```txt id="qd86fk"
active member gets profile
member type creates security group
expired member removed from security group
staff member maps to staff group
committee maps to hidden committee/community
chapter maps to hidden chapter/community
event appears on calendar
SSO access denied due to missing group
periodic refresh misses user
member refresh fixes stale user
```

Expected behavior:

```txt id="m12o5x"
Higher Logic Community route modeled separately
customer confirms installed mappings
access rules remain config-driven
```

## Mock Higher Logic Marketing route simulator

### Purpose

Model Impexium / re:Members to Thrive Marketing Enterprise sync.

### Objects

```txt id="tsplxi"
shared views
SQL views
queries
segments
profile fields
demographic fields
groups
message personalization fields
sync-on-send
nightly/weekly/hourly sync
embedded lead scoring page
```

### Test cases

```txt id="xzaafa"
shared view exists
shared view missing
SQL view exists
SQL view missing
query missing unique identifier
query returns duplicate unique identifier
profile field missing
demographic field missing
manual sync
daily sync
hourly sync
sync-on-send
upload limitation hit
SOAP content-type style error
tracking writeback attempted but blocked
embedded lead scoring page displayed
```

Expected behavior:

```txt id="j4hc03"
marketing route treated as sync/export route
query/view outputs treated as contracts
tracking writeback blocked unless customer confirms otherwise
unique identifier rule explicit
upload limits surfaced
```

## Mock Power Platform / Power Automate route simulator

### Purpose

Model re:Members Power Platform / Power Automate connector behavior without assuming full REST API behavior.

### Objects

```txt id="xq9y4o"
Power Automate connector
workflow trigger
workflow action
file sync
notification
approval flow
collect data action
connector credential
environment
Dataverse-like record if applicable
```

### Test cases

```txt id="m4jy3v"
connector connection succeeds
connector connection revoked
trigger fires on member update
trigger fires on event registration
trigger fires on payment
action creates third-party record
action updates AMS record if allowed
approval flow blocks write
workflow disabled
workflow retry duplicate
environment mismatch
connector permission denied
```

Expected behavior:

```txt id="l92yu1"
Power Platform route separate from core REST route
workflow actions treated as asynchronous
idempotency required
customer owns environment/config
do not infer endpoint paths from connector behavior
```

## Mock Salesforce-route simulator

### Purpose

Model re:Members AMS Platform built on Salesforce only if customer confirms this route.

### Objects

```txt id="otn7d4"
Salesforce contact
account
membership object
event object
product object
order object
invoice/payment object
custom fields
validation rules
flows
permission sets
field-level security
platform events if used
bulk API if used
```

### Test cases

```txt id="wm8j4r"
Salesforce route not confirmed -> blocked
OAuth Connected App succeeds
OAuth token expired
SOQL query succeeds
SOQL permission denied
field-level security hides field
custom object missing
validation rule blocks write
flow changes write behavior
bulk job succeeds
bulk job partially fails
platform event arrives
```

Expected behavior:

```txt id="qow29o"
Salesforce route disabled unless confirmed
object schema discovered from Salesforce/customer docs
field-level security tested
validation rules/flows treated as real integration behavior
```

## Mock accounting/finance route simulator

### Purpose

Model accounting integrations such as Sage Intacct-style finance routes.

### Objects

```txt id="s3nvvf"
invoice
payment
refund
deposit
GL account
department
chapter
fund
revenue recognition
batch export
accounting sync status
```

### Test cases

```txt id="rzq7k7"
invoice export
payment export
refund export
batch export succeeds
batch export partially fails
GL mapping missing
department/chapter mapping missing
closed period
duplicate export
sync status update denied
financial write disabled
```

Expected behavior:

```txt id="mf8ap4"
finance route separate from AMS core route
financial writes disabled by default
GL mappings customer-approved
duplicate export prevented
reconciliation required
```

## Synthetic data generator

Generate datasets.

### Small

```txt id="ikxz0c"
100 members
20 organizations
10 member types
20 groups
10 committees
10 chapters
20 events
50 registrations
50 products
50 orders
50 invoices
50 payments
100 activities
50 certification records
50 webhook events
```

### Medium

```txt id="bx39ri"
100,000 members
20,000 organizations
100 member types
5,000 groups
2,000 committees
2,000 chapters
5,000 events
100,000 registrations
50,000 products
500,000 orders
500,000 invoices
500,000 payments
1,000,000 activities
250,000 certification records
500,000 webhook events
```

### Large

```txt id="mj55kw"
5,000,000 members
1,000,000 organizations
1,000 member types
100,000 groups
50,000 committees
50,000 chapters
100,000 events
10,000,000 registrations
1,000,000 products
25,000,000 orders
25,000,000 invoices
25,000,000 payments
100,000,000 activities
10,000,000 certification records
50,000,000 webhook events
```

### Edge cases

```txt id="knzxbv"
duplicate email
missing email
changed email
invalid email
active member
expired member
lapsed member
suspended member
nonmember
staff member
organization member
individual linked to organization
organization membership inherited
organization membership not inherited
member with multiple memberships
group BeginDate in future
group EndDate in past
committee expired
chapter removed
event cancelled
registration cancelled
purchase pending
purchase refunded
invoice voided
payment failed
activity duplicate
certification duplicate
webhook duplicate
webhook out of order
Power Automate workflow retried
Salesforce validation rule failure
rate limit after N requests
```

## Error simulator

Mock all important failures.

```txt id="mc1as3"
400 bad request
401 unauthorized
403 forbidden
404 not found
409 duplicate/conflict
422 validation failure
429 too many requests
500 server error
502 bad gateway
503 unavailable
504 timeout
invalid API key
invalid client secret
wrong tenant
wrong environment
expired token
revoked token
permission denied
custom field missing
member type unknown
group type unknown
webhook signature invalid
Power Platform connector revoked
Salesforce validation rule failure
financial write blocked
malformed JSON
HTML error page instead of JSON
empty response
pagination token invalid
```

Expected behavior:

```txt id="cl03v0"
400 -> fail fast
401 -> re-auth if safe
403 -> permission/admin issue
404 -> reconcile missing record
409 -> idempotency/conflict handling
422 -> mapping/data issue
429 -> backoff
5xx -> bounded retry
timeout on read -> retry
timeout on write -> reconcile first
malformed response -> quarantine
wrong tenant/environment -> stop immediately
financial write blocked -> require explicit approval
```

## Rate limit / pagination simulator

### Purpose

Model pagination, throttling, and large sync behavior.

### Pagination styles to test

```txt id="bdh5qo"
page/pageSize
offset/limit
cursor
nextLink
modifiedSince
continuation token
bulk export file
Power Automate trigger batching
Salesforce query locator if Salesforce route confirmed
```

### Test cases

```txt id="wkt7ww"
single page
multiple pages
pagination required
empty first page
empty middle page
empty final page
next token expired
duplicate records across pages
record changes during pagination
same timestamp collision
429 with retry hint
429 without retry hint
bulk export timeout
workflow trigger duplicate
retry budget exhausted
```

Expected behavior:

```txt id="wjs7ih"
pagination mandatory on list endpoints
checkpoint after safe page completion
dedupe by stable key
use lookback window for modifiedSince sync
honor retry hints when present
backoff with jitter
reduce concurrency
alert after retry budget exhausted
```

## Secret and PII redaction tests

Test that logs never expose:

```txt id="mf7kpa"
API key
client secret
access token
refresh token
Authorization header
webhook secret
SSO token
Salesforce token
Power Platform connector secret
member email in unsafe logs
phone number
address
payment details
sensitive custom fields
private group membership
raw production payloads unless explicitly allowed
```

Expected behavior:

```txt id="m81g9s"
redact secrets
redact tokens
minimize PII
payment fields protected
debug payload logging disabled by default
CI fails if secrets appear in logs
```

## Contract tests

Create contract tests that run against:

```txt id="azqvpq"
mock
sandbox
production-smoke
```

Environment selector:

```txt id="d3bdkp"
TEST_TARGET=mock
TEST_TARGET=sandbox
TEST_TARGET=production-smoke
```

Mock can run destructive/bad scenarios.

Sandbox only runs approved safe tests.

Production smoke is tiny and mostly read-only.

### Contract test suites

```txt id="z1ggac"
auth.contract.test.ts
rest-api.contract.test.ts
webhooks.contract.test.ts
sso.contract.test.ts
members.contract.test.ts
organizations.contract.test.ts
memberships-access.contract.test.ts
groups-committees-chapters.contract.test.ts
events-products.contract.test.ts
orders-invoices-payments.contract.test.ts
lms-writeback.contract.test.ts
activity-certification-writeback.contract.test.ts
higher-logic-community.contract.test.ts
higher-logic-marketing.contract.test.ts
power-platform.contract.test.ts
salesforce-route.contract.test.ts
accounting-finance.contract.test.ts
pagination.contract.test.ts
rate-limit.contract.test.ts
errors.contract.test.ts
redaction.contract.test.ts
write-safety.contract.test.ts
```

## Postman / Newman / OpenAPI strategy

Generate:

```txt id="ldrgod"
postman/impexium-local.postman_collection.json
postman/impexium-local.postman_environment.json
postman/impexium-errors.postman_collection.json
postman/impexium-webhooks.postman_collection.json
postman/impexium-sso.postman_collection.json
postman/impexium-writebacks.postman_collection.json
postman/impexium-financial-safety.postman_collection.json
```

Generate OpenAPI fixtures:

```txt id="jpqok1"
openapi/impexium-rest-compatibility.openapi.yaml
openapi/impexium-webhook-compatibility.openapi.yaml
openapi/impexium-lms-writeback-compatibility.openapi.yaml
```

Generate schemas:

```txt id="z48t5f"
schemas/member.schema.json
schemas/organization.schema.json
schemas/membership.schema.json
schemas/group.schema.json
schemas/event.schema.json
schemas/registration.schema.json
schemas/product.schema.json
schemas/order.schema.json
schemas/invoice.schema.json
schemas/payment.schema.json
schemas/activity-writeback.schema.json
schemas/certification-writeback.schema.json
schemas/webhook-event.schema.json
schemas/error.schema.json
schemas/pagination.schema.json
```

Newman/tests should verify:

```txt id="rj55td"
auth succeeds
bad auth fails
tenant mismatch fails
member validates
organization validates
membership validates
group validates
event validates
order/invoice/payment validates
activity writeback idempotency validates
certification writeback idempotency validates
webhook validates
pagination works
rate limit handled
malformed JSON rejected
financial writes disabled by default
secrets not logged
```

## Sandbox calibration process

When sandbox credentials arrive:

```txt id="m1y9w8"
1. Confirm product route: Impexium legacy, re:Members core, Power Platform, Salesforce route, or hybrid.
2. Confirm API base URL.
3. Confirm auth method.
4. Confirm tenant/environment.
5. Run auth smoke test.
6. Fetch one known safe member.
7. Fetch one known safe organization if in scope.
8. Fetch one known active membership.
9. Fetch one known expired/lapsed membership if available.
10. Fetch member types.
11. Fetch one group/committee/chapter if in scope.
12. Fetch one event if in scope.
13. Fetch one product/catalog item if in scope.
14. Fetch one order/invoice/payment only if approved.
15. Test webhook delivery if webhooks are in scope.
16. Test SSO user if SSO is in scope.
17. Test Power Platform connector only if route confirmed.
18. Test Salesforce object read only if route confirmed.
19. Test one harmless activity writeback only if approved.
20. Test one harmless certification writeback only if approved.
21. Validate one harmless permission error.
22. Validate pagination on one safe endpoint.
23. Capture sanitized request/response examples.
24. Compare sandbox schema against mock schema.
25. Update mock fixtures.
26. Update mapping config.
27. Re-run contract tests against mock.
28. Re-run approved contract tests against sandbox.
```

Do not start with:

```txt id="dwjt3x"
full member export
bulk member updates
all events
all orders
all payments
financial writes
activity writebacks
certification writebacks
Power Automate workflow changes
Salesforce object updates
production credentials
```

## Production smoke-test plan

Production tests must be tiny and approved.

### Read-only production smoke

```txt id="chjlw9"
authenticate
confirm tenant/environment
fetch one known safe member
fetch one known safe organization if in scope
fetch member types if approved
fetch one safe event if in scope
fetch one safe product/catalog item if in scope
fetch one order/invoice/payment only if explicitly approved
verify expected fields exist
stop
```

### Write production smoke

Only after written approval.

```txt id="kdbqmv"
write one harmless test activity for a test member
or write one harmless certification test record
or update one harmless test profile field
or trigger one test Power Automate workflow
or create one test-only event/product record if approved
use idempotency key or reconciliation where possible
read/reconcile result
confirm no duplicate
document result
stop
```

### Financial production smoke

Only after separate written approval.

```txt id="bc2y1e"
use a safe test invoice/order/payment
perform one approved reversible or test-only financial action
read/reconcile result
confirm accounting impact
document result
stop
```

Production broad sync is not allowed until read-only smoke passes.

Production writebacks are not allowed until write smoke passes.

Production financial writes are not allowed unless separately approved.

## Customer/vendor/admin request packet

Claude Code must create:

```txt id="n45w70"
docs/customer-admin-request.md
docs/vendor-api-doc-request.md
docs/customer-discovery-questionnaire.md
```

Ask for:

### Product/route

```txt id="vl5gd9"
Confirm product name: Impexium, re:Members AMS, or re:Members AMS Platform.
Is the environment built on Microsoft Power Platform?
Is the environment built on Salesforce?
Is a core REST API route available?
Are webhooks available?
Is Power Automate connector in scope?
Is SSO in scope?
Is LMS integration in scope?
Is Higher Logic Community in scope?
Is Higher Logic Thrive Marketing in scope?
Are finance/accounting integrations in scope?
Is there a sandbox/test environment?
```

### Credentials/access

```txt id="r0cakf"
API base URL
tenant/instance URL
auth method
API key
client ID/client secret
OAuth details if used
service account details
read-only vs write-enabled credentials
webhook secret/signing details
SSO settings
Power Platform environment/connector access
Salesforce Connected App if applicable
sandbox credentials
production credentials later
credential rotation process
secure secret delivery process
```

### Members/profile

```txt id="yf7i2s"
member fields
custom fields
member type codes
membership status values
expiration field/rule
staff member code
nonmember code
lapsed/expired codes
sample active member
sample expired member
sample staff member
sample nonmember
sample organization member
sample member with changed email
```

### Organizations/accounts

```txt id="de8zqn"
organization fields
organization membership rules
individual-to-organization relationship
primary contact rule
billing contact rule
parent-child organization behavior
inheritance rules
sample organizations
```

### Groups/committees/chapters

```txt id="t8vmv2"
group types
committee fields
chapter fields
role/position fields
start/end date behavior
access rules
community/security group mapping
sample committee member
sample chapter member
sample expired group membership
```

### Events/products/catalog

```txt id="apeqvk"
events in scope?
event fields
registration fields
event statuses
product/catalog fields
course/activity catalog fields
purchase access rules
sample event
sample registration
sample product
sample purchase
```

### Orders/invoices/payments

```txt id="me1tjo"
financial objects in scope?
read-only or write?
order statuses
invoice statuses
payment statuses
refund behavior
accounting integration behavior
safe test order
safe test invoice
safe test payment
financial write approval
```

### SSO

```txt id="jlwyka"
SSO route
IdP/SP owner
test users
redirect URLs
logout behavior
member expiration handling
group/product-based access rules
claims/profile field mappings
```

### Webhooks

```txt id="cw1ygm"
webhooks in scope?
available webhook topics/events
who configures webhooks?
callback URL
signature/auth method
delivery/retry behavior
test webhook procedure
who monitors failures?
```

### LMS/writebacks

```txt id="pdpomb"
LMS route in scope?
SSO to LMS?
catalog/activity import?
purchase sync?
activity completion writeback?
certification writeback?
writeback method
activity/certification mappings
idempotency field
safe test member
safe test activity
```

### Higher Logic routes

```txt id="o05bdm"
Higher Logic Community in scope?
Higher Logic Thrive Marketing in scope?
shared views / SQL views / queries?
sync frequency?
sync-on-send?
unique identifier?
profile/demographic fields?
tracking writeback or display-only?
upload limits?
```

### Performance/limits

```txt id="svli38"
expected member count
expected organization count
expected event count
expected order/payment volume
expected sync frequency
rate-limit guidance
webhook volume
Power Automate workflow volume
maintenance windows
support escalation path
```

## Repository structure

```txt id="awxbmg"
impexium-remembers-integration-lab/
  README.md
  impexium-remembers-integration-lab-context.md
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
    sandbox-validation-checklist.md
    production-readiness-checklist.md
    adapter-design.md
    mock-server-design.md
    auth-test-plan.md
    rest-api-test-plan.md
    webhook-test-plan.md
    sso-test-plan.md
    members-profile-test-plan.md
    organizations-test-plan.md
    memberships-access-test-plan.md
    groups-committees-chapters-test-plan.md
    events-products-test-plan.md
    financial-safety-plan.md
    lms-writeback-test-plan.md
    higher-logic-community-test-plan.md
    higher-logic-marketing-test-plan.md
    power-platform-test-plan.md
    salesforce-route-test-plan.md
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
    impexium-rest-compatibility.openapi.yaml
    impexium-webhook-compatibility.openapi.yaml
    impexium-lms-writeback-compatibility.openapi.yaml

  schemas/
    member.schema.json
    organization.schema.json
    membership.schema.json
    member-type.schema.json
    group.schema.json
    committee.schema.json
    chapter.schema.json
    event.schema.json
    registration.schema.json
    product.schema.json
    order.schema.json
    invoice.schema.json
    payment.schema.json
    activity-writeback.schema.json
    certification-writeback.schema.json
    webhook-event.schema.json
    pagination.schema.json
    error.schema.json

  mock-server/
    package.json
    src/
      server.ts
      auth.ts
      restApi.ts
      webhooks.ts
      sso.ts
      members.ts
      organizations.ts
      memberships.ts
      memberTypes.ts
      groups.ts
      committees.ts
      chapters.ts
      events.ts
      registrations.ts
      products.ts
      catalog.ts
      orders.ts
      invoices.ts
      payments.ts
      activities.ts
      certifications.ts
      lmsWritebacks.ts
      higherLogicCommunity.ts
      higherLogicMarketing.ts
      powerPlatform.ts
      salesforceRoute.ts
      accountingFinance.ts
      pagination.ts
      rateLimits.ts
      errors.ts
      redaction.ts
      scenarios.ts

  fixtures/
    members/
    organizations/
    memberships/
    member-types/
    groups/
    committees/
    chapters/
    events/
    registrations/
    products/
    orders/
    invoices/
    payments/
    activities/
    certifications/
    webhooks/
    sso/
    power-platform/
    salesforce-route/
    errors/

  synthetic-data/
    generate-members.ts
    generate-organizations.ts
    generate-memberships.ts
    generate-groups.ts
    generate-events.ts
    generate-products.ts
    generate-orders.ts
    generate-payments.ts
    generate-activities.ts
    generate-certifications.ts
    generate-webhooks.ts
    generate-edge-cases.ts

  postman/
    impexium-local.postman_collection.json
    impexium-local.postman_environment.json
    impexium-errors.postman_collection.json
    impexium-webhooks.postman_collection.json
    impexium-sso.postman_collection.json
    impexium-writebacks.postman_collection.json
    impexium-financial-safety.postman_collection.json

  tests/
    source-register.test.ts
    no-invention-policy.test.ts
    route-decision.test.ts
    auth.test.ts
    rest-api.test.ts
    webhooks.test.ts
    sso.test.ts
    members.test.ts
    organizations.test.ts
    memberships-access.test.ts
    groups-committees-chapters.test.ts
    events-products.test.ts
    orders-invoices-payments.test.ts
    lms-writeback.test.ts
    activity-certification-writeback.test.ts
    higher-logic-community.test.ts
    higher-logic-marketing.test.ts
    power-platform.test.ts
    salesforce-route.test.ts
    accounting-finance.test.ts
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

```txt id="wftd8v"
product route confirmed
Impexium vs re:Members naming confirmed
Power Platform route confirmed or excluded
Salesforce route confirmed or excluded
official/customer API docs received
API base URL confirmed
auth method confirmed
sandbox access confirmed or unavailable risk accepted
member schema confirmed
organization schema confirmed
membership schema confirmed
member type codes confirmed
expiration behavior confirmed
group/committee/chapter mappings confirmed
event/product/catalog scope confirmed
financial scope confirmed or excluded
SSO scope confirmed or excluded
webhook scope confirmed or excluded
LMS/writeback scope confirmed or excluded
Higher Logic route confirmed or excluded
Power Automate connector scope confirmed or excluded
sample records received
support escalation path confirmed
```

## Sandbox validation checklist

Minimum sandbox tests:

```txt id="tmr3qh"
auth succeeds
bad auth fails as expected
tenant/environment confirmed
known member fetched
known organization fetched if in scope
member type/access logic verified
expiration logic verified
group/committee/chapter logic verified if in scope
known event fetched if in scope
known product/catalog item fetched if in scope
known order/invoice/payment fetched only if approved
webhook test delivered if in scope
SSO test user works if in scope
Power Platform connector test if in scope
Salesforce route test if in scope
activity writeback not tested until approved
certification writeback not tested until approved
financial write not tested until separately approved
```

## Production readiness checklist

Production not ready until:

```txt id="bvg7ja"
sandbox validation passed or customer accepted no-sandbox risk
mock calibrated to sandbox
field mappings approved
member type/access rules approved
organization inheritance rules approved
group/committee/chapter rules approved
SSO behavior approved
webhook behavior approved
event/product behavior approved
financial behavior approved
writeback behavior approved
Power Platform behavior approved if in scope
Salesforce route behavior approved if in scope
secret storage approved
redaction tests passed
rollback/reconciliation plan exists
support escalation path exists
monitoring exists
```

## Claude Code prompt

Use this prompt with Claude Code:

```txt id="mphw4p"
You are building a production-shaped Impexium / re:Members Integration Lab.

Goal:
Create a source-acquisition and no-credentials testing framework for Impexium / re:Members before real credentials arrive.

Do not invent real customer endpoint details.

Build:
1. Source register, evidence log, unknowns register, and no-invention policy.
2. Product-route decision system for legacy Impexium API, re:Members core REST API, customer-specific API, webhooks, Power Platform, Power Automate connector, Salesforce-based re:Members AMS Platform, SSO, member sync, organization sync, membership sync, groups/committees/chapters, event/catalog/product sync, financial read/write route, LMS SSO, LMS activity writeback, certification writeback, Higher Logic Community, Higher Logic Thrive Marketing, email marketing, finance/accounting, mobile app, website/CMS, custom middleware, and hybrid route.
3. Impexium adapter interface.
4. Mock authentication server with API key, client credentials, tenant scoping, token expiry, permission-denied, wrong-environment, Power Platform connector, and Salesforce-route auth scenarios.
5. Mock REST API server with members, organizations, memberships, groups, committees, chapters, events, registrations, products, catalog, orders, invoices, payments, activities, certifications, pagination, validation errors, permission errors, and rate limits.
6. Mock webhook sender/receiver with duplicate, out-of-order, bad-signature, delayed-record, retry, and disabled-webhook scenarios.
7. Mock SSO server.
8. Mock member/profile simulator.
9. Mock organization/account simulator.
10. Mock membership/access-rule simulator.
11. Mock groups/committees/chapters simulator.
12. Mock events/catalog/products simulator.
13. Mock orders/invoices/payments simulator with financial writes disabled by default.
14. Mock LMS route with SSO, member updates, group assignment, catalog/activity import, purchase sync, activity writebacks, and certification writebacks.
15. Mock activity/certification writeback simulator with idempotency and unsafe retry protection.
16. Mock Higher Logic Community route.
17. Mock Higher Logic Thrive Marketing route with shared views, SQL views, queries, sync-on-send, upload limitations, and display-only tracking guardrails.
18. Mock Power Platform / Power Automate connector route.
19. Mock Salesforce-route simulator if customer confirms Salesforce-based re:Members AMS Platform.
20. Mock accounting/finance route.
21. Synthetic data generator for members, organizations, memberships, groups, committees, chapters, events, registrations, products, orders, invoices, payments, activities, certifications, and webhooks.
22. Error simulator for 400/401/403/404/409/422/429/500/503/timeouts/invalid credentials/wrong tenant/permission denied/webhook signature invalid/financial write blocked.
23. Secret/PII/payment redaction tests.
24. Postman/Newman, OpenAPI, and schema files.
25. Contract tests that run against mock first, sandbox later, and production-smoke last.
26. Customer/vendor/admin request packet.
27. Sandbox calibration checklist.
28. Production smoke-test checklist.

Rules:
- Real adapter disabled until route and official/customer docs/sandbox are confirmed.
- Public partner pages are behavioral clues, not endpoint authority.
- Higher Logic Marketing route is separate from core Impexium API.
- Power Platform route is separate from core REST API.
- Salesforce route is disabled unless customer confirms Salesforce-based re:Members AMS Platform.
- All real implementation facts must cite source/evidence entries.
- Do not log API keys, client secrets, tokens, webhook secrets, SSO tokens, member PII, payment details, or sensitive custom fields.
- Every write must use idempotency or reconciliation where possible.
- Never blindly retry uncertain writes.
- Financial writes, activity writebacks, certification writebacks, Power Automate changes, Salesforce writes, and production updates are disabled unless explicitly approved.
- Full sync is not allowed until tiny sandbox tests pass.

The output should be detailed enough that a developer can run the local mock lab and test nearly every integration failure mode before real Impexium / re:Members credentials arrive.
```

## Bottom line

The correct Impexium / re:Members strategy is:

```txt id="xz1qxq"
Do not wait for real credentials to build.

Build the mock REST / auth / webhook / SSO / member / organization / membership / event / product / financial / LMS-writeback / Higher-Logic / Power-Platform lab now.
Use public docs only to shape route discovery.
Keep customer-specific facts in config and evidence logs.
When sandbox credentials arrive, run the same contract tests against sandbox.
Update the mock to match sandbox.
Only then run tiny production smoke tests.
```

The mock should be almost real in behavior, but honest in naming.

It is a compatibility lab, not a claim that the real customer’s Impexium / re:Members environment has been validated.

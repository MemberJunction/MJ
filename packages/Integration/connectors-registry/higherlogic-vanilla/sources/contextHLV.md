# higherlogic-vanilla-integration-lab-context.md

## Purpose

This file is a Claude Code / agent-ready context document for building and testing a production-shaped Higher Logic Vanilla integration when the developer does **not** yet have real Higher Logic Vanilla credentials, Vanilla Dashboard access, API v2 access, API tokens, personal access tokens, JWT auth setup, role-token setup, SSO configuration, OAuth 2.0 addon configuration, SAML configuration, OIDC configuration, jsConnect configuration, webhook addon enablement, webhook settings, community URL, tenant/site URL, category IDs, role IDs, user IDs, subcommunity IDs, product IDs, private-community permissions, custom profile fields, moderation permissions, production API access, or customer-approved write permissions.

The goal is not to pretend to validate a customer’s real Higher Logic Vanilla community.

The goal is to build the strongest legal Higher Logic Vanilla Integration Lab possible using:

```txt id="e4n5h8"
official Higher Logic Vanilla API v2 documentation
official Vanilla Dashboard API v2 Swagger/reference when provided later
official Vanilla SSO documentation
official Vanilla OAuth 2.0 SSO documentation
official Vanilla SAML/OIDC documentation
official Vanilla webhook documentation
official Vanilla role-token/personal-token/JWT documentation
official Vanilla webhooks and API integrations docs
customer/admin-provided Vanilla configuration
local Vanilla API v2 compatibility mock
local Vanilla API auth simulator
local role-token simulator
local personal-access-token simulator
local JWT simulator
local SSO simulator
local OAuth2 SSO simulator
local SAML/OIDC simulator
local jsConnect simulator
local webhook sender/receiver simulator
local users/roles/categories/discussions/comments/reactions simulator
local groups/subcommunities/products simulator
local knowledge-base/article simulator
local moderation/escalation/reporting simulator
local analytics/export simulator
local Zapier/Salesforce/native integration route simulator
synthetic users
synthetic roles and permissions
synthetic categories
synthetic discussions
synthetic comments
synthetic questions and answers
synthetic reactions
synthetic groups
synthetic subcommunities
synthetic products
synthetic articles/knowledge-base content
synthetic moderation/escalation events
synthetic webhook deliveries
OpenAPI/Swagger compatibility fixtures
Postman/Newman collections
contract tests
CI
sandbox/customer-test-community calibration scripts
production smoke-test plan
```

The standard is:

```txt id="z5tnbb"
Mock real first.
Calibrate with customer test community or dashboard Swagger later.
Smoke test production last.
```

## Non-negotiable rule

Claude Code must not invent customer-specific Higher Logic Vanilla implementation details.

Claude Code may model Vanilla-like behavior, especially API v2 behavior, API token behavior, role-token behavior, SSO behavior, OAuth2/SAML/OIDC/jsConnect behavior, webhook behavior, and community-content behavior, but every mock must be clearly labeled as a compatibility mock.

Use names like:

```txt id="qylkq0"
higherlogic-vanilla-compatibility-mock
mock-vanilla-api-v2-server
mock-vanilla-auth-server
mock-vanilla-sso-server
mock-vanilla-webhook-server
mock-vanilla-community-server
```

Do not use names like:

```txt id="yvj1jp"
real-vanilla-api
official-higherlogic-vanilla-client
production-vanilla-adapter
```

until official docs, customer configuration, and sandbox/customer-test validation exist.

Every real implementation claim must have evidence:

```txt id="rcj9p3"
official Vanilla docs
customer docs
customer Dashboard API v2 Swagger
vendor/support docs
sandbox/test-community response
admin confirmation
approved partner implementation doc
```

Partner pages, Zapier pages, marketplace pages, community posts, GitHub examples, blogs, and marketing pages are behavioral clues only unless the customer confirms that exact route.

## Core framing

Higher Logic Vanilla is not one single route.

Treat Higher Logic Vanilla as a community platform with multiple possible integration surfaces.

Possible routes:

```txt id="kxuo0r"
Vanilla API v2 route
Vanilla Dashboard API v2 Swagger route
personal access token route
JWT API auth route
role-token route
user-authenticated API route
admin/service-user API route
SSO route
OAuth 2.0 SSO route
SAML SSO route
OIDC SSO route
JWT SSO route
jsConnect SSO route
webhooks route
user/profile sync route
roles/permissions route
category/access route
discussions/comments route
questions/answers route
reactions route
groups route
subcommunities route
products route
knowledge-base/articles route
moderation/escalation route
analytics/export route
Zapier workflow route
Salesforce middleware route
native integration route
data warehouse/Fivetran-style route
custom middleware route
hybrid route
```

The first task is not coding the real adapter.

The first task is:

```txt id="ezg45u"
identify the route
collect authoritative source docs
build mocks for likely routes
make real adapter disabled until route is confirmed
run contract tests against the mock
calibrate with customer Dashboard/API/test-community later
```

## What can be built without real credentials

Without real credentials, Claude Code can legally build:

```txt id="pi0kv3"
source register
evidence log
unknowns register
route decision file
customer/vendor/admin request packet
Higher Logic Vanilla adapter interface
mock API v2 server
mock API v2 Swagger/OpenAPI fixture
mock token-auth server
mock personal-access-token validator
mock JWT API auth validator
mock role-token issuer/validator
mock OAuth2 SSO server
mock SAML/OIDC SSO server
mock JWT SSO server
mock jsConnect server
mock webhook event sender
mock webhook receiver
mock user/profile sync route
mock roles/permissions route
mock categories route
mock discussions route
mock comments route
mock questions/answers route
mock reactions route
mock groups route
mock subcommunities route
mock products route
mock knowledge-base/articles route
mock moderation/escalation/report route
mock analytics/export route
mock Zapier/Salesforce/native integration route
synthetic users
synthetic roles
synthetic permissions
synthetic categories
synthetic discussions
synthetic comments
synthetic answers
synthetic reactions
synthetic groups
synthetic subcommunities
synthetic products
synthetic articles
synthetic moderation events
synthetic webhook deliveries
OpenAPI compatibility fixtures
Postman/Newman collections
contract tests
rate-limit/error tests
CI tests
customer-test-community calibration scripts
production smoke-test checklist
```

Without real credentials, Claude Code cannot honestly prove:

```txt id="go2dpi"
the real customer Vanilla community URL
the real customer Dashboard API v2 Swagger output
the real customer API token
the real customer personal access token
the real customer JWT auth configuration
the real customer role-token behavior
the real customer allowed endpoints
the real customer roles
the real customer permissions
the real customer category access rules
the real customer private-community settings
the real customer subcommunities
the real customer products
the real customer SSO provider
the real customer OAuth2 profile mapping
the real customer SAML/OIDC claims
the real customer jsConnect configuration
the real customer webhook addon status
the real customer webhook subscriptions
the real customer custom profile fields
the real customer moderation/escalation workflow
the real customer production write permissions
the real customer rate limits in practice
the real customer production performance
```

So the mock lab proves architecture and safety.

The customer test community or authorized Dashboard/API proves real compatibility.

Production smoke tests prove safe live access.

## Source authority hierarchy

Claude Code must rank Higher Logic Vanilla sources in this order.

### Tier 0 — Customer Dashboard API v2 Swagger / customer-specific API reference

Highest authority for the customer’s actual Vanilla API surface.

Get from:

```txt id="m6i2qh"
customer Vanilla administrator
customer community admin
customer IT team
customer integration owner
customer Dashboard > Settings > API Integrations > API V2
customer-provided Swagger/OpenAPI export
customer admin screen share
customer secure document handoff
```

Use for:

```txt id="vactdi"
actual enabled endpoints
actual request schemas
actual response schemas
actual auth setup
actual role-token behavior if enabled
actual user fields
actual custom profile fields
actual category IDs
actual role IDs
actual permission behavior
actual webhook setup
actual rate-limit behavior if exposed
actual available resources
```

The customer Dashboard API v2 reference beats the generic public API reference.

### Tier 1 — Official Higher Logic Vanilla API v2 documentation

Highest public authority for generic Vanilla API behavior.

Use for:

```txt id="v4aqbv"
API v2 concepts
pagination model
Link-header pagination behavior
endpoint categories
authentication models
role-token behavior
personal access token behavior
JWT behavior
date filters
Smart IDs
CSV export behavior
API integration settings
API v2 reference discovery
```

Do not use for customer-specific endpoint enablement, roles, category permissions, or custom fields.

### Tier 2 — Customer/admin-provided Vanilla configuration

Highest authority for customer-specific behavior beyond API schema.

Get from:

```txt id="z9v0aj"
customer Vanilla administrator
customer community manager
customer moderator lead
customer IT/security team
customer SSO administrator
customer Higher Logic CSM/support case
customer internal implementation folder
customer secure document handoff
customer admin screen share
customer Dashboard settings
customer webhook settings
customer SSO settings
customer roles/permissions page
```

Use for:

```txt id="oh9p9m"
real community URL
real API integration settings
real token creation process
real role-token policy
real roles
real permissions
real categories
real category access rules
real private-community settings
real user profile fields
real custom profile fields
real groups
real subcommunities
real products
real SSO provider settings
real webhook addon status
real webhook subscriptions
real moderation/escalation workflow
safe test users
safe test discussions
safe test categories
write/update approvals
```

Customer admin configuration beats generic examples.

### Tier 3 — Customer test community / staging community observations

Use after authorized access exists.

Get from:

```txt id="k2uctn"
customer Vanilla admin
customer community manager
customer integration owner
Higher Logic support if needed
authorized staging/test community owner
```

Use for:

```txt id="yty77w"
verifying auth
verifying API token behavior
verifying role-token behavior
verifying actual response shapes
verifying roles and permissions
verifying category access
verifying private-community behavior
verifying SSO redirect/token behavior
verifying custom user fields
verifying discussions/comments behavior
verifying webhook delivery
verifying moderation/escalation behavior
verifying pagination
verifying rate-limit behavior
verifying writes only after approval
```

Test-community observations beat assumptions.

### Tier 4 — Higher Logic Vanilla support / Customer Success / implementation guidance

Use this to clarify official docs, API access, addon enablement, webhook enablement, SSO setup, OAuth profile mapping, SAML/OIDC setup, jsConnect, permissions, and support constraints.

Ask support/customer admin for:

```txt id="idvftv"
which API docs apply
whether API v2 is enabled
where customer Dashboard Swagger is located
which API auth route is recommended
how to create API tokens
whether role tokens are enabled/appropriate
whether webhooks addon is enabled
which webhook events are available
how webhooks should be configured
which SSO route is configured
whether OAuth2/SAML/OIDC/JWT/jsConnect applies
whether custom SSO work is required
which fields are safe to sync
which endpoints are safe to write to
whether a test community exists
known integration constraints
support escalation path
```

Support guidance is authoritative when specific to the customer/project.

### Tier 5 — Official Vanilla SSO documentation

Use only if SSO is in scope.

Use for:

```txt id="a1z3hl"
SSO overview
OAuth 2.0 SSO behavior
SAML SSO behavior
OIDC SSO behavior
JWT SSO behavior
jsConnect behavior
JIT provisioning behavior
email-based account mapping
profile endpoint mapping
profile field mapping
display-name handling
redirect/logout behavior
```

Do not assume every customer uses the same SSO route.

### Tier 6 — Official Vanilla webhook documentation

Use only if webhooks are in scope.

Use for:

```txt id="bn5wry"
webhook addon requirement
Dashboard webhook location
available event categories
article events
answer events
comment events
group events
discussion/post events
escalation/moderation events
notification behavior
webhook configuration concepts
```

Do not assume the webhook addon is enabled or that every event is subscribed.

### Tier 7 — Official Vanilla integrations page / partner route docs

Use for source discovery and route clues.

Use for:

```txt id="b20idq"
Zapier workflow route
Salesforce middleware route
native integration route
JS embed route
data warehouse/Fivetran-style route
external native integration route
analytics/tag-manager route
translation route
federated-search route
support-ticket escalation route
```

Do not treat integration pages as endpoint-level API authority.

### Tier 8 — Higher Logic Thrive Community API docs

Use with caution.

Higher Logic has broader Thrive Community API docs that may not be the same as Higher Logic Vanilla API v2.

Use only if the customer explicitly confirms that the project involves:

```txt id="w0v721"
Higher Logic Thrive Community
Higher Logic API v2.0
Thrive Community Activity Sync
Thrive Community External Activities API
Higher Logic API Endpoint Documentation
```

Do not mix Thrive Community API assumptions into Vanilla unless confirmed.

### Tier 9 — GitHub/open-source Vanilla docs and community examples

Use only as behavioral/developer clues.

These can help with:

```txt id="xf1tw0"
historic Vanilla terminology
developer docs organization
self-hosted/open-source behavior
older endpoint examples
common integration mistakes
```

But they cannot define:

```txt id="jrqa0x"
Vanilla cloud customer capabilities
Higher Logic-hosted production behavior
customer-specific API enablement
customer-specific endpoint permissions
customer-specific SSO behavior
```

If using GitHub docs, record that cloud customers may need Higher Logic support/CSM confirmation.

### Tier 10 — Zapier / Make / community/forum/blog/GitHub examples

Use only as behavioral clues.

Examples:

```txt id="bb1zjv"
Zapier app pages
Make app pages
Medium/blog integration examples
GitHub snippets
Stack Overflow/community discussions
agency implementation posts
open.vanillaforums.com posts
```

They can suggest:

```txt id="x3pdmn"
common auth mistakes
common API endpoint categories
common SSO problems
common webhook testing problems
common permission issues
common category access issues
```

They cannot define:

```txt id="nil3x8"
current official endpoint behavior
customer API permissions
customer token behavior
customer role IDs
customer category IDs
customer webhook subscriptions
production-safe write behavior
```

## Required source files

Claude Code must create:

```txt id="qx6qmf"
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

```txt id="doy28s"
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

```txt id="jt6bxx"
customer_dashboard_swagger
official_vanilla_api_doc
official_auth_doc
official_sso_doc
official_webhook_doc
customer_admin_config
test_community_response
webhook_delivery_log
support_ticket
higher_logic_support_guidance
integration_page
thrive_api_doc
github_doc
community_post
blog_post
zapier_doc
make_doc
admin_screen_share
```

### evidence-log.md

Every implementation claim must be logged.

Claims include:

```txt id="t9f7px"
route
community URL
API v2 base path
auth method
token type
personal access token behavior
JWT auth behavior
role-token behavior
SSO route
OAuth2 profile mapping
SAML/OIDC claims
jsConnect behavior
user endpoint
role endpoint
category endpoint
discussion endpoint
comment endpoint
reaction endpoint
group endpoint
subcommunity endpoint
product endpoint
article endpoint
moderation/escalation endpoint
webhook event type
webhook payload shape
pagination behavior
rate limit behavior
field mapping
custom profile field mapping
category permission behavior
write permission
error behavior
```

If unsupported:

```txt id="gdl4j3"
UNCONFIRMED_DO_NOT_IMPLEMENT
```

### unknowns-register.md

Track unknowns:

```txt id="cqifyl"
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

```txt id="xxzonp"
BLOCKS_ROUTE_DECISION
BLOCKS_AUTH
BLOCKS_MOCK_CALIBRATION
BLOCKS_REAL_IMPLEMENTATION
BLOCKS_SSO
BLOCKS_WEBHOOKS
BLOCKS_USER_SYNC
BLOCKS_ROLE_SYNC
BLOCKS_CONTENT_WRITES
BLOCKS_MODERATION
BLOCKS_PRODUCTION
NICE_TO_HAVE
```

## Product-route decision

Claude Code must create:

```txt id="k1v4ju"
docs/product-route-decision.md
```

Allowed route values:

```txt id="jb1um1"
unknown
vanilla_api_v2_personal_access_token
vanilla_api_v2_jwt
vanilla_api_v2_role_token
vanilla_api_v2_user_authenticated
vanilla_api_v2_admin_service_user
vanilla_sso_oauth2
vanilla_sso_saml
vanilla_sso_oidc
vanilla_sso_jwt
vanilla_sso_jsconnect
vanilla_webhooks
vanilla_user_profile_sync
vanilla_roles_permissions_sync
vanilla_discussions_comments_sync
vanilla_knowledge_base_sync
vanilla_moderation_escalation
vanilla_zapier
vanilla_salesforce_middleware
vanilla_native_integration
vanilla_data_warehouse
custom_middleware
hybrid
```

If route is unknown:

```txt id="ytd417"
real adapter disabled
only mocks and source-acquisition docs allowed
```

If route is confirmed:

```txt id="ex9756"
required source docs checklist generated
mock scenario selected
contract tests generated
test-community validation plan generated
```

Route decision test cases:

```txt id="gfs3qr"
unknown route blocks real adapter
personal access token route enables token-auth mock
JWT API route enables JWT auth mock
role-token route enables role-token cache/expiry tests
SSO OAuth2 route enables OAuth2 SSO simulator
SSO SAML/OIDC route enables federation simulator
jsConnect route enables jsConnect simulator
webhooks route enables webhook simulator
user sync route enables users/roles/profile tests
content sync route enables discussions/comments/article tests
moderation route enables escalation/report tests
Zapier/Salesforce route enables partner-route simulator
hybrid route enables multiple adapters
route change invalidates mappings
```

## Canonical adapter interface

Build an internal adapter interface.

```ts id="lfe18l"
interface HigherLogicVanillaAdapter {
  authenticate(): Promise<AuthState>;

  getCurrentUser(): Promise<CanonicalVanillaUser>;
  getUser(userId: string): Promise<CanonicalVanillaUser>;
  searchUsers(query: UserQuery): Promise<Page<CanonicalVanillaUser>>;
  updateUser(userId: string, update: UserUpdate): Promise<WriteResult>;

  getRoles(): Promise<CanonicalRole[]>;
  getUserRoles(userId: string): Promise<CanonicalRole[]>;
  updateUserRoles(userId: string, roles: RoleUpdate): Promise<WriteResult>;

  getCategories(query: CategoryQuery): Promise<Page<CanonicalCategory>>;
  getCategory(categoryId: string): Promise<CanonicalCategory>;

  getDiscussions(query: DiscussionQuery): Promise<Page<CanonicalDiscussion>>;
  getDiscussion(discussionId: string): Promise<CanonicalDiscussion>;
  createDiscussion(input: DiscussionCreateInput): Promise<WriteResult>;
  updateDiscussion(discussionId: string, input: DiscussionUpdateInput): Promise<WriteResult>;

  getComments(query: CommentQuery): Promise<Page<CanonicalComment>>;
  getComment(commentId: string): Promise<CanonicalComment>;
  createComment(input: CommentCreateInput): Promise<WriteResult>;
  updateComment(commentId: string, input: CommentUpdateInput): Promise<WriteResult>;

  getReactions(target: ReactionTarget): Promise<Page<CanonicalReaction>>;
  createReaction(input: ReactionCreateInput): Promise<WriteResult>;
  deleteReaction(reactionId: string): Promise<WriteResult>;

  getGroups(query: GroupQuery): Promise<Page<CanonicalGroup>>;
  getGroup(groupId: string): Promise<CanonicalGroup>;

  getSubcommunities(query: SubcommunityQuery): Promise<Page<CanonicalSubcommunity>>;
  getProducts(query: ProductQuery): Promise<Page<CanonicalProduct>>;

  getArticles(query: ArticleQuery): Promise<Page<CanonicalArticle>>;
  getArticle(articleId: string): Promise<CanonicalArticle>;

  processWebhook(event: VanillaWebhookEvent): Promise<WebhookProcessResult>;

  authenticateSsoExchange(input: SsoExchangeInput): Promise<SsoIdentity>;

  capabilities(): Promise<HigherLogicVanillaCapabilities>;
}
```

Implementations:

```txt id="cwi56p"
MockVanillaApiV2Adapter
MockVanillaPersonalAccessTokenAdapter
MockVanillaJwtAdapter
MockVanillaRoleTokenAdapter
MockVanillaSsoAdapter
MockVanillaOAuth2SsoAdapter
MockVanillaSamlOidcAdapter
MockVanillaJsConnectAdapter
MockVanillaWebhookAdapter
MockVanillaZapierAdapter
MockVanillaSalesforceMiddlewareAdapter
VanillaApiV2Adapter
VanillaWebhookAdapter
VanillaSsoAdapter
```

Real adapters stay disabled until official docs/customer Dashboard/test community confirm route.

## Canonical model

Use canonical objects internally.

```ts id="nphvz8"
type CanonicalVanillaUser = {
  id: string;
  name?: string;
  email?: string;
  photoUrl?: string;
  roles?: CanonicalRole[];
  roleIds?: string[];
  ssoId?: string;
  externalId?: string;
  banned?: boolean;
  deleted?: boolean;
  dateInserted?: string;
  dateLastActive?: string;
  profileFields?: Record<string, unknown>;
  raw?: unknown;
};
```

```ts id="m1a1u6"
type CanonicalRole = {
  id: string;
  name: string;
  permissions?: Record<string, boolean>;
  raw?: unknown;
};
```

```ts id="d78fp6"
type CanonicalCategory = {
  id: string;
  name: string;
  parentCategoryId?: string;
  url?: string;
  allowedRoleIds?: string[];
  permissions?: Record<string, unknown>;
  archived?: boolean;
  raw?: unknown;
};
```

```ts id="uydx87"
type CanonicalDiscussion = {
  id: string;
  categoryId?: string;
  insertUserId?: string;
  name: string;
  body?: string;
  type?: string;
  status?: string;
  closed?: boolean;
  pinned?: boolean;
  score?: number;
  dateInserted?: string;
  dateUpdated?: string;
  commentCount?: number;
  raw?: unknown;
};
```

```ts id="rou7kw"
type CanonicalComment = {
  id: string;
  discussionId?: string;
  insertUserId?: string;
  body?: string;
  dateInserted?: string;
  dateUpdated?: string;
  deleted?: boolean;
  raw?: unknown;
};
```

```ts id="bmz6wv"
type CanonicalArticle = {
  id: string;
  title: string;
  body?: string;
  locale?: string;
  status?: string;
  categoryId?: string;
  helpfulCount?: number;
  unhelpfulCount?: number;
  raw?: unknown;
};
```

```ts id="pe4e3q"
type VanillaWebhookEvent = {
  eventId?: string;
  eventType: string;
  objectType: string;
  objectId?: string;
  triggeredAt?: string;
  payload: unknown;
  headers?: Record<string, string>;
};
```

## Customer configuration model

All customer-specific details must live in config.

```json id="xazj8n"
{
  "customer": "Example Community",
  "platform": "higherlogic_vanilla",
  "route": "vanilla_api_v2_personal_access_token",
  "environment": "mock",
  "urls": {
    "communityBase": "http://localhost:4010",
    "apiBase": "http://localhost:4010/api/v2",
    "dashboardSwagger": "http://localhost:4010/settings/swagger"
  },
  "auth": {
    "type": "personal_access_token",
    "personalAccessTokenEnv": "VANILLA_PERSONAL_ACCESS_TOKEN",
    "jwtSecretEnv": "VANILLA_JWT_SECRET",
    "roleTokenSigningKeyEnv": "VANILLA_ROLE_TOKEN_SIGNING_KEY"
  },
  "sso": {
    "enabled": false,
    "route": "oauth2",
    "clientIdEnv": "VANILLA_SSO_CLIENT_ID",
    "clientSecretEnv": "VANILLA_SSO_CLIENT_SECRET",
    "redirectUriEnv": "VANILLA_SSO_REDIRECT_URI",
    "profileMapping": {
      "email": "email",
      "name": "name",
      "photoUrl": "picture",
      "externalId": "id"
    }
  },
  "roles": {
    "adminRoleIds": ["role_admin"],
    "moderatorRoleIds": ["role_moderator"],
    "memberRoleIds": ["role_member"],
    "guestRoleIds": ["role_guest"],
    "denyRoleIds": ["role_banned"]
  },
  "categoryScope": {
    "mode": "allowlist",
    "categoryIds": ["cat_community", "cat_support", "cat_ideas"]
  },
  "webhooks": {
    "enabled": false,
    "secretEnv": "VANILLA_WEBHOOK_SECRET",
    "subscribedEvents": [
      "discussion_add",
      "comment_add",
      "user_update",
      "group_join",
      "escalation_update"
    ]
  },
  "writeSafety": {
    "productionWritesDisabledByDefault": true,
    "allowUserUpdates": false,
    "allowRoleUpdates": false,
    "allowDiscussionCreates": false,
    "allowCommentCreates": false,
    "allowModerationActions": false
  }
}
```

## Mock-real integration lab

The Higher Logic Vanilla lab should include multiple mock servers.

```txt id="lj387k"
mock-vanilla-api-v2-server
mock-vanilla-auth-server
mock-vanilla-role-token-server
mock-vanilla-sso-server
mock-vanilla-webhook-server
mock-vanilla-community-content-server
mock-vanilla-moderation-server
mock-vanilla-zapier-server
mock-vanilla-salesforce-middleware-server
mock-vanilla-data-warehouse-server
```

Use Docker Compose.

```txt id="mnbeko"
higherlogic-vanilla-integration-lab/
  docker-compose.yml
  mock-server/
  sso-server/
  webhook-lab/
  synthetic-data/
  tests/
  postman/
  openapi/
  schemas/
  docs/
```

## Mock API v2 server

### Purpose

Model Higher Logic Vanilla API v2 behavior without real credentials.

### Mock capabilities

```txt id="d91txm"
API v2 base path
Dashboard Swagger-compatible OpenAPI fixture
users
roles
categories
discussions
comments
reactions
groups
subcommunities
products
articles
knowledge-base content
moderation/escalations
reports/exports
date filters
ID range expressions if modeled
CSV export behavior if modeled
pagination with Link headers
numbered pagination
more pagination
permission-based response differences
field expansion behavior
validation errors
rate limits
```

### Mock paths

Use local compatibility paths only.

```txt id="ux3qb6"
GET    /api/v2/users
GET    /api/v2/users/{userId}
PATCH  /api/v2/users/{userId}
GET    /api/v2/users/{userId}/discussions
GET    /api/v2/users/{userId}/comments

GET    /api/v2/roles
GET    /api/v2/users/{userId}/roles
PUT    /api/v2/users/{userId}/roles

GET    /api/v2/categories
GET    /api/v2/categories/{categoryId}

GET    /api/v2/discussions
POST   /api/v2/discussions
GET    /api/v2/discussions/{discussionId}
PATCH  /api/v2/discussions/{discussionId}
DELETE /api/v2/discussions/{discussionId}

GET    /api/v2/comments
POST   /api/v2/comments
GET    /api/v2/comments/{commentId}
PATCH  /api/v2/comments/{commentId}
DELETE /api/v2/comments/{commentId}

GET    /api/v2/reactions
POST   /api/v2/reactions
DELETE /api/v2/reactions/{reactionId}

GET    /api/v2/groups
GET    /api/v2/groups/{groupId}

GET    /api/v2/subcommunities
GET    /api/v2/products

GET    /api/v2/articles
GET    /api/v2/articles/{articleId}

GET    /settings/swagger
```

Do not claim these are exact customer-enabled paths until the customer Dashboard Swagger/test community confirms.

### API v2 test cases

```txt id="x2pvxn"
get users
get user
get user discussions
get user comments
user not found
user deleted
user banned
user hidden by permission
list roles
get user roles
update user roles allowed
update user roles denied
list categories
category private
category hidden by role
list discussions
get discussion
create discussion allowed
create discussion denied
update discussion allowed
delete discussion denied
list comments
get comment
create comment allowed
create comment denied
comment deleted
list reactions
create reaction allowed
delete reaction allowed
list groups
group hidden
list subcommunities
subcommunities endpoint denied
list products
products endpoint denied
list articles
article deleted/restored
pagination required
Link header missing
date filter invalid
permission denied
validation error
malformed JSON response
```

Expected behavior:

```txt id="i4ex9b"
API base URL configurable
Dashboard Swagger drives real contract later
pagination handled using Link headers
role/category permissions tested separately
writes disabled by default
raw payload preserved
permission denied is not empty data
```

## Mock authentication server

### Purpose

Model Vanilla API authentication behavior without real credentials.

### Auth modes to simulate

```txt id="ph2d8u"
personal access token
JWT API auth
role token
user-session-authenticated API
admin/service-user token
anonymous/guest request
```

### Mock capabilities

```txt id="unaml4"
valid token
missing token
malformed Authorization header
expired token
revoked token
wrong community/site
token with admin permissions
token with moderator permissions
token with member permissions
token with guest permissions
token valid but endpoint forbidden
token valid but category forbidden
token valid but write forbidden
secret accidentally logged
```

### Test cases

```txt id="pdfmu7"
valid personal access token
bad personal access token
expired personal access token
valid JWT
bad JWT signature
JWT expired
JWT wrong audience
role token valid
role token expired
role token used on unsupported endpoint
guest request cached
authorized user request not cacheable
service user lacks role
token accidentally logged
```

Expected behavior:

```txt id="m8f01x"
authenticate first
store token securely
do not log tokens
classify 401 separately from 403
role token limited to supported endpoints
guest/member/admin behavior tested separately
```

## Mock role-token simulator

### Purpose

Model Vanilla role-token behavior specifically, because role tokens are not normal user tokens.

### Role-token concepts to model

```txt id="yv8ry3"
role-only claims
no user identity
short expiration
limited endpoint support
guest request caching
authorized user request differences
shared cache by role set
unsupported endpoint failure
```

### Test cases

```txt id="n18jd3"
role token issued
role token expires in short window
role token valid for user resource allowed endpoint
role token valid for subcommunities endpoint
role token valid for products endpoint
role token rejected on discussions write
role token rejected on comments write
role token rejected where user identity required
role set changed
cached role token stale
clock skew
```

Expected behavior:

```txt id="qddk4i"
role tokens not used for user-specific writes
role tokens not used as identity tokens
unsupported endpoint fails loudly
cache TTL honored
```

## Mock users/profile simulator

### Purpose

Model user sync, profile mapping, account status, SSO ID expansion, and custom profile fields.

### User cases

```txt id="loqbdp"
active user
guest user
member user
moderator user
admin user
banned user
deleted user
unconfirmed user
user with no email
user with duplicate email
user with changed email
user with SSO ID
user with external ID
user with profile photo
user with custom fields
user with hidden profile fields
user with role changes
```

### Test cases

```txt id="rmd9g1"
fetch user
search users
filter users by date inserted
filter users by role if supported
expand SSO IDs if supported
profile field exists
profile field missing
custom field hidden
email changed
SSO ID changed
user banned
user deleted
user role changed
user not visible due to permission
```

Expected behavior:

```txt id="jtsgva"
user ID is stable primary key
email-only dedupe requires customer approval
SSO ID/external ID mapped only if confirmed
hidden fields not treated as empty
deleted/banned users handled explicitly
```

## Mock roles/permissions simulator

### Purpose

Model Vanilla roles and permission-based access.

### Objects

```txt id="a49xuc"
role
permission
user role assignment
category permission
private community setting
moderator permission
admin permission
guest permission
member permission
```

### Test cases

```txt id="m3oad1"
list roles
role missing
role renamed
role ID changed
user has one role
user has multiple roles
user has deny role
role grants category access
role denies category access
role grants moderation permission
role lacks API permission
update user roles allowed
update user roles denied
private community enabled
private community disabled
SSO user assigned default role
```

Expected behavior:

```txt id="sel458"
role IDs not hardcoded without customer confirmation
permission decisions explainable
default deny when role cannot be evaluated
role writes disabled by default
```

## Mock categories/access simulator

### Purpose

Model category hierarchy, private categories, and role-based access.

### Objects

```txt id="se8rnq"
category
parent category
sub-category
category permissions
archived category
hidden category
knowledge-base category
discussion category
Q&A category
idea category
private category
```

### Test cases

```txt id="k7y8w3"
category list
category hidden from guest
category visible to member
category hidden from member
category visible to moderator
category archived
parent category missing
category renamed
category moved
category permission changed
discussion in hidden category
comment in hidden category
user loses category access
```

Expected behavior:

```txt id="xzze0c"
category IDs config-driven
access evaluated before sync/write
hidden category not treated as missing
category changes invalidate cached permissions
```

## Mock discussions/comments simulator

### Purpose

Model community content sync and optional writebacks.

### Discussion cases

```txt id="o3eal5"
normal discussion
question discussion
idea discussion
announcement
pinned discussion
closed discussion
deleted discussion
restored discussion
discussion in private category
discussion with accepted answer
discussion with many comments
discussion with attachments if modeled
discussion with rich text/HTML
discussion with mentions
discussion with tags
```

### Comment cases

```txt id="zdzn5v"
normal comment
edited comment
deleted comment
restored comment
comment by deleted user
comment by banned user
comment in private category
comment with HTML
comment with mention
comment with attachment if modeled
```

### Test cases

```txt id="xzz3qq"
list discussions
get discussion
create discussion allowed
create discussion denied
update discussion allowed
delete discussion denied
list comments by discussion
list comments by user
create comment allowed
create comment denied
comment body validation
HTML sanitization
private-category content hidden
deleted content handled
large discussion with many comments
pagination across comments
```

Expected behavior:

```txt id="mec296"
content writes disabled by default
HTML/body sanitized
private content protected
comment pagination required
deleted/restored states explicit
```

## Mock questions/answers simulator

### Purpose

Model Q&A behavior and accepted/rejected answer events.

### Test cases

```txt id="waow2x"
question created
answer added
answer accepted
answer rejected
accepted answer changed
answer deleted
question closed
question in private category
webhook answer accepted
webhook answer rejected
```

Expected behavior:

```txt id="l28bgs"
Q&A state modeled separately from normal discussion
answer status changes trigger downstream update
private-category permissions still apply
```

## Mock reactions simulator

### Purpose

Model reactions, likes, helpful/unhelpful votes, and content engagement.

### Objects

```txt id="f9of9v"
reaction
reaction type
discussion reaction
comment reaction
article helpful/unhelpful
user reaction count
score/reputation if modeled
```

### Test cases

```txt id="k7a6n5"
reaction created
reaction removed
duplicate reaction
reaction type unknown
reaction on discussion
reaction on comment
helpful article vote
unhelpful article vote
reaction by deleted user
reaction in hidden category
reaction permission denied
```

Expected behavior:

```txt id="md0ef9"
reaction types not hardcoded beyond confirmed set
dedupe user/content/reaction type
private content protected
engagement sync is eventually consistent
```

## Mock groups/subcommunities/products simulator

### Purpose

Model Vanilla group-like and segmentation/access concepts.

### Objects

```txt id="js3wt0"
group
group membership
subcommunity
product
user joins group
user leaves group
role token access to subcommunities/products
```

### Test cases

```txt id="nof0z8"
list groups
group hidden
group created webhook
group edited webhook
group deleted webhook
user joins group webhook
user leaves group webhook
subcommunities endpoint allowed with role token
subcommunities endpoint denied with normal token
products endpoint allowed with role token
products endpoint denied without role token
product access changes
```

Expected behavior:

```txt id="upb5f2"
group/subcommunity/product route confirmed before implementation
membership changes idempotent
role-token endpoint limitations respected
```

## Mock knowledge-base/articles simulator

### Purpose

Model article events, knowledge-base sync, translations, and helpful/unhelpful feedback.

### Objects

```txt id="w5b0s1"
article
article category
translation
locale
draft
published
deleted
restored
helpful vote
unhelpful vote
```

### Test cases

```txt id="qc257b"
article added
article edited
article deleted
article restored
article marked helpful
article marked unhelpful
translation added
translation updated
locale missing
draft hidden
published visible
article in private KB category
```

Expected behavior:

```txt id="g6tzgv"
article status explicit
translation/locale handled
private KB access protected
article feedback modeled separately from reactions if needed
```

## Mock moderation/escalation simulator

### Purpose

Model moderation workflows, spam/abuse reports, escalations, and support-ticket integration.

### Objects

```txt id="wu7uzi"
report
moderation queue item
escalation
assigned user
escalation status
post removed
post restored
spam flag
abuse flag
external ticket ID
Jira/Freshdesk/Salesforce case link if route confirmed
```

### Test cases

```txt id="wbxf8s"
post reported
post escalated
escalation assigned
escalation status changed
post removed
post restored
spam detected
abuse detected
external ticket created
external ticket create fails
duplicate escalation
escalation webhook out of order
moderator permission denied
```

Expected behavior:

```txt id="uh70md"
moderation route requires approval
external ticket writes idempotent
out-of-order escalation events handled
sensitive moderation data redacted
```

## Mock webhooks simulator

### Purpose

Model Higher Logic Vanilla outbound webhook notifications.

### Components

```txt id="i3yklp"
webhook addon enablement
Dashboard webhook configuration
webhook event selector
webhook sender
webhook receiver
auth/secret simulator if customer config uses one
delivery log fixture
retry simulator
```

### Webhook event categories to model

```txt id="c0wxe8"
article events
answer accepted/rejected events
comment added/edited/deleted events
discussion/post events
group created/edited/deleted events
user joins/leaves group events
escalation created/assigned/updated events
moderation events
user/profile events if confirmed
```

### Test cases

```txt id="vj6ef8"
webhook addon disabled
webhook addon enabled
valid webhook
bad auth
missing auth
duplicate webhook
out-of-order webhook
webhook before API record is updated
webhook references missing object
webhook references private object
malformed JSON
unknown event type
receiver returns 500
receiver times out
retry arrives
webhook disabled
webhook deleted
webhook delivery stopped
```

Expected behavior:

```txt id="wsi4ft"
webhook is trigger, not full truth
dedupe by event ID if present, otherwise composite key
fetch latest record from API where correctness matters
ack only after durable queue if possible
webhook secrets not logged
```

## Mock SSO simulator

### Purpose

Model Vanilla SSO behavior separately from API behavior.

### SSO routes to model

```txt id="q5jodn"
OAuth 2.0 SSO
SAML SSO
OIDC SSO
JWT SSO
jsConnect
custom OAuth addon
```

### OAuth2 SSO simulator

Model:

```txt id="q9xkb8"
authorization code flow
implicit flow if needed
client ID
client secret
authorization URI
token endpoint
profile endpoint
registration URI
sign-out URI
scope
profile JSON response
profile field mapping
email-based account matching
Just-In-Time provisioning
display-name handling
profile photo mapping
nested profile JSON with dot notation
```

Test cases:

```txt id="g5kyxk"
valid OAuth login
bad client secret
bad redirect URI
token endpoint unavailable
profile endpoint unavailable
profile missing email
profile email changed
profile display name missing
nested profile mapping works
nested profile mapping fails
JIT provisioning creates user
JIT provisioning disabled
existing user matched by email
duplicate email
logout/sign-out
```

### SAML/OIDC simulator

Model:

```txt id="zm739e"
IdP metadata
SP metadata
NameID
email claim
display name claim
role/group claim
clock skew
assertion expiry
signature validation
OIDC discovery
ID token
user-info endpoint
logout
```

Test cases:

```txt id="i4a0o4"
valid SAML login
bad signature
expired assertion
clock skew
missing NameID
missing email
valid OIDC login
bad issuer
bad audience
missing user-info
role claim missing
logout failure
```

### jsConnect/JWT SSO simulator

Model:

```txt id="hxedkp"
shared secret
signed payload
timestamp
nonce
email
name
photo
unique ID
role mapping
```

Test cases:

```txt id="p67fan"
valid signed payload
bad signature
expired timestamp
nonce replay
missing email
missing unique ID
role mapping unknown
```

Expected behavior:

```txt id="c7f9iy"
SSO authenticates identity
authorization still uses roles/permissions/category rules
SSO route not mixed with API token route
profile mapping customer-configured
SSO secrets not logged
```

## Mock analytics/export simulator

### Purpose

Model API/CSV/data warehouse style extraction.

### Objects

```txt id="wsggat"
users
discussions
comments
reactions
pageviews if available
participation metrics
article feedback
moderation events
CSV export file
data warehouse connector extract
```

### Test cases

```txt id="kqi8ja"
initial full export
incremental export
CSV export succeeds
CSV export missing column
CSV export malformed
large export
date filter invalid
same timestamp collision
late content update
deleted content
private content excluded
analytics lag
schema drift
```

Expected behavior:

```txt id="d1ecaz"
exports treated as contracts
schema snapshot stored
private content rules honored
lookback window for late updates
analytics lag documented
```

## Mock Zapier / Salesforce / native integration route simulator

### Purpose

Model non-direct API routes without relying on live partner accounts.

### Objects

```txt id="xm3lzo"
Zap trigger
Zap action
Salesforce middleware sync
native integration config
external native integration
Fivetran/data warehouse connector
JS embed
Federated Search connector
support-ticket escalation connector
translation connector
```

### Test cases

```txt id="wwbjw5"
Zap receives new discussion
Zap receives new user
Zap action creates CRM lead
Zap action fails
Zap retries
Salesforce middleware syncs activity
Salesforce middleware fails
native integration disabled
external connector token revoked
Fivetran extract delayed
JS embed blocked
Federated Search connector stale
support ticket duplicate
```

Expected behavior:

```txt id="drsldn"
partner route treated as asynchronous unless proven otherwise
customer owns partner account
retry/idempotency required
not a substitute for full API if full sync required
```

## Synthetic data generator

Generate datasets.

### Small

```txt id="w7ck44"
100 users
10 roles
20 categories
100 discussions
500 comments
300 reactions
20 groups
5 subcommunities
20 products
50 articles
50 moderation events
100 webhook events
```

### Medium

```txt id="del7t6"
50,000 users
100 roles
500 categories
250,000 discussions
2,000,000 comments
5,000,000 reactions
10,000 groups
100 subcommunities
1,000 products
50,000 articles
500,000 moderation events
1,000,000 webhook events
```

### Large

```txt id="hzncpk"
5,000,000 users
1,000 roles
50,000 categories
50,000,000 discussions
500,000,000 comments
1,000,000,000 reactions
1,000,000 groups
10,000 subcommunities
100,000 products
5,000,000 articles
100,000,000 moderation events
100,000,000 webhook events
```

### Edge cases

```txt id="vd7yzi"
duplicate email
missing email
changed email
deleted user
banned user
guest user
user with multiple roles
user with deny role
role deleted
category private
category archived
discussion deleted
discussion restored
comment deleted
comment restored
accepted answer changed
reaction duplicated
group join duplicate
group leave before join
article translated
article deleted/restored
escalation updated out of order
webhook duplicate
webhook out of order
role token expired
SSO profile missing email
API pagination Link header missing
rate limit after N requests
```

## Error simulator

Mock all important failures.

```txt id="le2rbk"
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
invalid token
expired token
revoked token
role token unsupported endpoint
role token expired
SSO bad signature
SSO missing profile email
webhook bad auth
malformed JSON
HTML error page instead of JSON
empty response
pagination Link header missing
Dashboard Swagger unavailable
webhook addon disabled
```

Expected behavior:

```txt id="xj7pd9"
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
role token unsupported endpoint -> route/config bug
webhook addon disabled -> admin blocker
```

## Rate limit / pagination simulator

### Purpose

Model Vanilla API pagination and request-limit behavior.

### Pagination styles to test

```txt id="wdkjdm"
numbered pagination
more pagination
Link-header pagination
page and limit parameters
CSV export pagination if used
missing Link header
partial page
empty final page
duplicate records across pages
record changes during pagination
```

### Test cases

```txt id="sg1xdi"
single page
multiple pages
pagination required
client assumes no pagination and misses records
empty first page
empty middle page
empty final page
Link header first/previous/next/last
Link header first/previous/next only
Link header malformed
duplicate records across pages
record changes during pagination
429 with Retry-After
429 without Retry-After
retry budget exhausted
```

Expected behavior:

```txt id="sdv4eg"
pagination mandatory on list endpoints
follow Link headers
checkpoint after safe page completion
dedupe by external ID
honor Retry-After when present
backoff with jitter
reduce concurrency
alert after retry budget exhausted
```

## Secret and PII redaction tests

Test that logs never expose:

```txt id="yqa0ua"
personal access token
JWT signing secret
JWT token
role token
Authorization header
SSO client secret
SAML private key
OIDC client secret
jsConnect secret
webhook secret
session cookie
user email in unsafe logs
profile fields with PII
moderation report sensitive content
raw private-category content in production logs
raw payloads in production logs unless explicitly allowed
```

Expected behavior:

```txt id="lg7v90"
redact secrets
redact tokens
minimize PII
private content protected
moderation content redacted
debug payload logging disabled by default
CI fails if secrets appear in logs
```

## Contract tests

Create contract tests that run against:

```txt id="a8z2ks"
mock
customer-test-community
production-smoke
```

Environment selector:

```txt id="zl43t0"
TEST_TARGET=mock
TEST_TARGET=customer-test-community
TEST_TARGET=production-smoke
```

Mock can run destructive/bad scenarios.

Customer test community runs approved safe tests.

Production smoke is tiny and mostly read-only.

### Contract test suites

```txt id="w8a6sn"
auth.contract.test.ts
role-token.contract.test.ts
users.contract.test.ts
roles-permissions.contract.test.ts
categories.contract.test.ts
discussions.contract.test.ts
comments.contract.test.ts
questions-answers.contract.test.ts
reactions.contract.test.ts
groups.contract.test.ts
subcommunities-products.contract.test.ts
articles.contract.test.ts
moderation-escalation.contract.test.ts
webhooks.contract.test.ts
sso-oauth2.contract.test.ts
sso-saml-oidc.contract.test.ts
sso-jsconnect.contract.test.ts
analytics-export.contract.test.ts
zapier-salesforce-native.contract.test.ts
pagination.contract.test.ts
rate-limit.contract.test.ts
errors.contract.test.ts
redaction.contract.test.ts
write-safety.contract.test.ts
```

## Postman / Newman / OpenAPI strategy

Generate:

```txt id="qwdeso"
postman/vanilla-local.postman_collection.json
postman/vanilla-local.postman_environment.json
postman/vanilla-errors.postman_collection.json
postman/vanilla-webhooks.postman_collection.json
postman/vanilla-sso.postman_collection.json
postman/vanilla-content-writes.postman_collection.json
```

Generate OpenAPI fixtures:

```txt id="v5bx13"
openapi/vanilla-api-v2-compatibility.openapi.yaml
openapi/vanilla-webhook-compatibility.openapi.yaml
```

Generate schemas:

```txt id="od9o62"
schemas/user.schema.json
schemas/role.schema.json
schemas/category.schema.json
schemas/discussion.schema.json
schemas/comment.schema.json
schemas/reaction.schema.json
schemas/group.schema.json
schemas/subcommunity.schema.json
schemas/product.schema.json
schemas/article.schema.json
schemas/escalation.schema.json
schemas/webhook-event.schema.json
schemas/pagination-link-header.schema.json
schemas/error.schema.json
```

Newman/tests should verify:

```txt id="j1xlqh"
auth succeeds
bad auth fails
role token endpoint limits enforced
users validate
roles validate
categories validate
discussions validate
comments validate
groups validate
articles validate
webhook event validates
SSO flow validates
pagination works
rate limit handled
malformed JSON rejected
content writes disabled by default
moderation writes disabled by default
secrets not logged
```

## Customer test-community calibration process

When customer test-community credentials or Dashboard Swagger arrive:

```txt id="p7xzei"
1. Confirm integration route.
2. Confirm Vanilla community URL.
3. Confirm API v2 Dashboard Swagger location.
4. Export or inspect customer-specific Swagger if possible.
5. Confirm auth method.
6. Confirm personal access token/JWT/role-token route.
7. Confirm SSO route if in scope.
8. Confirm webhook addon enabled if in scope.
9. Run auth smoke test.
10. Fetch current user or safe known user.
11. Fetch roles.
12. Fetch one known test category.
13. Fetch one known test discussion.
14. Fetch one known test comment.
15. Fetch one known private-category access-denied case if safe.
16. Fetch one known group if in scope.
17. Fetch subcommunities/products if in scope.
18. Fetch one known article if in scope.
19. Validate pagination on one safe endpoint.
20. Validate one harmless error.
21. Validate webhook delivery if webhooks are in scope.
22. Validate SSO test user if SSO is in scope.
23. Capture sanitized request/response examples.
24. Compare test-community schema against mock schema.
25. Update mock fixtures.
26. Update mapping config.
27. Re-run contract tests against mock.
28. Re-run approved contract tests against test community.
```

Do not start with:

```txt id="zgx2e7"
full user export
all discussions
all comments
all private categories
user role updates
discussion creation
comment creation
moderation actions
production credentials
```

## Production smoke-test plan

Production tests must be tiny and approved.

### Read-only production smoke

```txt id="chgcpm"
authenticate
fetch current user or safe known user
fetch roles if approved
fetch one known public category
fetch one known public discussion
fetch one known public comment
fetch one known private/access-denied case only if approved
fetch one group/article only if in scope
verify expected fields exist
stop
```

### Write production smoke

Only after written approval.

```txt id="ngvg6n"
create one harmless test discussion in a hidden/test category
or create one harmless test comment on a test discussion
or update one harmless test profile field on a test user
or trigger one test webhook
or perform one moderation action only if explicitly approved
use external reference or reconciliation where possible
read/reconcile result
confirm no duplicate
document result
stop
```

Production broad sync is not allowed until read-only smoke passes.

Production content writes are not allowed until write smoke passes.

Production role updates, SSO changes, webhook changes, moderation actions, or private-content extraction are not allowed unless explicitly approved.

## Customer/vendor/admin request packet

Claude Code must create:

```txt id="c96a7t"
docs/customer-admin-request.md
docs/vendor-api-doc-request.md
docs/customer-discovery-questionnaire.md
```

Ask for:

### Product/API route

```txt id="ulbwyq"
Is the integration API v2-based?
Is Dashboard API v2 Swagger accessible?
Is the integration personal-access-token based?
Is the integration JWT-based?
Is the integration role-token based?
Is SSO in scope?
Is OAuth2 SSO in scope?
Is SAML/OIDC in scope?
Is JWT SSO or jsConnect in scope?
Are webhooks in scope?
Is user/profile sync in scope?
Is role/permission sync in scope?
Are discussions/comments/articles in scope?
Is moderation/escalation in scope?
Is Zapier/Salesforce/native integration in scope?
Is there a staging/test community?
```

### Credentials / access

```txt id="uqqjya"
community base URL
API base URL
Dashboard API v2 Swagger location
personal access token process
JWT auth setup
role-token setup
service/admin user account
OAuth2 client settings if SSO
SAML/OIDC metadata if SSO
jsConnect secret if SSO
webhook secret/auth if webhooks
staging/test credentials
production credentials later
credential rotation process
secure secret delivery process
```

### Users/profile

```txt id="onoh85"
user fields needed
custom profile fields
SSO ID/external ID fields
email mapping rules
display name rules
photo/avatar rules
deleted/banned user handling
safe test users
sample admin/moderator/member/guest users
```

### Roles/permissions/categories

```txt id="l9k26h"
role IDs
role names
permission rules
private community enabled?
category IDs
category hierarchy
private categories
hidden categories
access rules
moderator roles
admin roles
safe test category
```

### Content

```txt id="d7b4v0"
discussions in scope?
comments in scope?
questions/answers in scope?
reactions in scope?
groups in scope?
subcommunities in scope?
products in scope?
articles/knowledge base in scope?
private content in scope?
content create/update/delete allowed?
safe test discussion/comment/article
```

### Webhooks

```txt id="k7w427"
webhook addon enabled?
which webhook events should be subscribed?
who configures webhook?
webhook URL
auth/secret strategy
delivery/retry behavior
test webhook procedure
who monitors failures?
```

### SSO

```txt id="d4et3v"
SSO route
OAuth2/SAML/OIDC/JWT/jsConnect?
IdP owner
client ID/client secret
metadata URL/file
redirect URLs
logout URLs
profile endpoint
profile field mapping
JIT provisioning enabled?
email matching rule
display-name behavior
test users
access-denial behavior
```

### Moderation / escalation

```txt id="zo6w1u"
moderation route in scope?
reports in scope?
escalations in scope?
external ticketing system?
which moderation events matter?
who approves moderation actions?
safe test escalation
sensitive content handling
```

### Performance / limits

```txt id="l6pb62"
expected user count
expected discussion count
expected comment count
expected article count
expected webhook volume
expected sync frequency
API rate-limit guidance
pagination requirements
timeout limits
maintenance windows
support escalation path
```

## Repository structure

```txt id="h6gxdt"
higherlogic-vanilla-integration-lab/
  README.md
  higherlogic-vanilla-integration-lab-context.md
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
    role-token-test-plan.md
    sso-test-plan.md
    webhook-test-plan.md
    users-profile-test-plan.md
    roles-permissions-test-plan.md
    categories-access-test-plan.md
    content-sync-test-plan.md
    moderation-escalation-test-plan.md
    analytics-export-test-plan.md
    zapier-salesforce-native-test-plan.md
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
    vanilla-api-v2-compatibility.openapi.yaml
    vanilla-webhook-compatibility.openapi.yaml

  schemas/
    user.schema.json
    role.schema.json
    category.schema.json
    discussion.schema.json
    comment.schema.json
    reaction.schema.json
    group.schema.json
    subcommunity.schema.json
    product.schema.json
    article.schema.json
    escalation.schema.json
    webhook-event.schema.json
    pagination-link-header.schema.json
    error.schema.json

  mock-server/
    package.json
    src/
      server.ts
      auth.ts
      personalAccessToken.ts
      jwtAuth.ts
      roleTokens.ts
      users.ts
      roles.ts
      permissions.ts
      categories.ts
      discussions.ts
      comments.ts
      reactions.ts
      groups.ts
      subcommunities.ts
      products.ts
      articles.ts
      moderation.ts
      escalations.ts
      webhooks.ts
      sso.ts
      oauth2Sso.ts
      samlOidcSso.ts
      jsConnect.ts
      analyticsExport.ts
      zapier.ts
      salesforceMiddleware.ts
      nativeIntegrations.ts
      pagination.ts
      rateLimits.ts
      errors.ts
      redaction.ts
      scenarios.ts

  fixtures/
    users/
    roles/
    permissions/
    categories/
    discussions/
    comments/
    reactions/
    groups/
    subcommunities/
    products/
    articles/
    moderation/
    escalations/
    webhooks/
    sso/
    errors/

  synthetic-data/
    generate-users.ts
    generate-roles.ts
    generate-categories.ts
    generate-discussions.ts
    generate-comments.ts
    generate-reactions.ts
    generate-groups.ts
    generate-articles.ts
    generate-moderation-events.ts
    generate-webhooks.ts
    generate-edge-cases.ts

  postman/
    vanilla-local.postman_collection.json
    vanilla-local.postman_environment.json
    vanilla-errors.postman_collection.json
    vanilla-webhooks.postman_collection.json
    vanilla-sso.postman_collection.json
    vanilla-content-writes.postman_collection.json

  tests/
    source-register.test.ts
    no-invention-policy.test.ts
    route-decision.test.ts
    auth.test.ts
    personal-access-token.test.ts
    jwt-auth.test.ts
    role-token.test.ts
    users.test.ts
    roles-permissions.test.ts
    categories-access.test.ts
    discussions.test.ts
    comments.test.ts
    questions-answers.test.ts
    reactions.test.ts
    groups.test.ts
    subcommunities-products.test.ts
    articles.test.ts
    moderation-escalation.test.ts
    webhooks.test.ts
    sso-oauth2.test.ts
    sso-saml-oidc.test.ts
    sso-jsconnect.test.ts
    analytics-export.test.ts
    zapier-salesforce-native.test.ts
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

```txt id="v5b0tf"
integration route confirmed
customer Dashboard API v2 Swagger inspected or exported
official docs identified for route
community base URL confirmed
auth method confirmed
API token/JWT/role-token process confirmed
test community confirmed or unavailable risk accepted
roles/permissions confirmed
category IDs and access rules confirmed
user/profile schema confirmed
custom profile fields confirmed
SSO scope confirmed or out of scope
webhook scope confirmed or out of scope
content read/write scope confirmed
moderation/escalation scope confirmed or out of scope
Zapier/Salesforce/native route confirmed or out of scope
pagination behavior confirmed
rate-limit guidance confirmed
safe test users/categories/content received
support escalation path confirmed
```

## Test-community validation checklist

Minimum test-community tests:

```txt id="wix6ri"
auth/token succeeds
bad auth fails as expected
Dashboard Swagger accessible or documented unavailable
known test user fetched
roles fetched
known category fetched
private category access behavior verified if safe
known discussion fetched
known comment fetched
pagination verified on one safe endpoint
role token tested if in scope
SSO test user works if in scope
webhook test delivered if in scope
permission error tested if safe
writes not tested until approved
```

## Production readiness checklist

Production not ready until:

```txt id="i5duhu"
test-community validation passed or customer accepted no-test-community risk
mock calibrated to customer API behavior
Dashboard Swagger/source register updated
field mappings approved
role/permission rules approved
category access rules approved
SSO behavior approved
webhook behavior approved
content read/write behavior approved
moderation/escalation behavior approved
Zapier/Salesforce/native behavior approved if in scope
secret storage approved
redaction tests passed
rollback/reconciliation plan exists
support escalation path exists
monitoring exists
```

## Claude Code prompt

Use this prompt with Claude Code:

```txt id="e5e0o4"
You are building a production-shaped Higher Logic Vanilla Integration Lab.

Goal:
Create a source-acquisition and no-credentials testing framework for Higher Logic Vanilla before real credentials arrive.

Do not invent real customer endpoint details.

Build:
1. Source register, evidence log, unknowns register, and no-invention policy.
2. Product-route decision system for Vanilla API v2, personal access tokens, JWT API auth, role tokens, user-authenticated API, admin/service-user API, OAuth2 SSO, SAML SSO, OIDC SSO, JWT SSO, jsConnect, webhooks, user/profile sync, roles/permissions sync, discussions/comments sync, knowledge-base sync, moderation/escalation, Zapier, Salesforce middleware, native integrations, data warehouse sync, custom middleware, and hybrid route.
3. Higher Logic Vanilla adapter interface.
4. Mock API v2 server with users, roles, categories, discussions, comments, reactions, groups, subcommunities, products, articles, moderation/escalation, pagination, Link headers, validation errors, permission errors, and rate limits.
5. Mock auth server with personal access token, JWT API auth, role token, service-user token, and guest/authorized behavior.
6. Mock role-token simulator with short-lived role-only JWTs and endpoint limitations.
7. Mock users/profile/custom-fields simulator.
8. Mock roles/permissions/category-access simulator.
9. Mock discussion/comment/Q&A/reaction simulator.
10. Mock groups/subcommunities/products simulator.
11. Mock knowledge-base/articles simulator.
12. Mock moderation/escalation simulator.
13. Mock webhook sender/receiver with article, answer, comment, discussion/post, group, user-group, escalation, and moderation-like events.
14. Mock SSO server for OAuth2, SAML, OIDC, JWT SSO, and jsConnect.
15. Mock analytics/export route.
16. Mock Zapier/Salesforce/native/data-warehouse route.
17. Synthetic data generator for users, roles, permissions, categories, discussions, comments, reactions, groups, subcommunities, products, articles, moderation events, and webhooks.
18. Error simulator for 400/401/403/404/409/422/429/500/503/timeouts/invalid token/expired role token/webhook disabled/malformed JSON.
19. Secret/PII/private-content redaction tests.
20. Postman/Newman, OpenAPI, and schema files.
21. Contract tests that run against mock first, customer test community later, and production-smoke last.
22. Customer/vendor/admin request packet.
23. Test-community calibration checklist.
24. Production smoke-test checklist.

Rules:
- Real adapter disabled until route and official docs/customer Dashboard/test community are confirmed.
- Customer Dashboard API v2 Swagger is more authoritative than the generic API reference for that customer.
- Partner docs, GitHub docs, community posts, and blogs are behavioral clues unless customer confirms that exact route.
- Do not mix Higher Logic Thrive Community API assumptions into Higher Logic Vanilla unless customer confirms that route.
- All real implementation facts must cite source/evidence entries.
- Do not log personal access tokens, JWT signing secrets, role tokens, Authorization headers, SSO client secrets, SAML private keys, OIDC secrets, jsConnect secrets, webhook secrets, session cookies, user PII, private-category content, or moderation-sensitive content.
- Every write must use idempotency or reconciliation where possible.
- Never blindly retry uncertain writes.
- User updates, role updates, content writes, moderation actions, webhook setting changes, and SSO changes are disabled unless explicitly approved.
- Full sync is not allowed until tiny test-community tests pass.

The output should be detailed enough that a developer can run the local mock lab and test nearly every integration failure mode before real Higher Logic Vanilla credentials arrive.
```

## Bottom line

The correct Higher Logic Vanilla strategy is:

```txt id="bk4f26"
Do not wait for real credentials to build.

Build the mock API v2 / auth / role-token / users / roles / categories / discussions / comments / reactions / groups / articles / SSO / webhook / moderation lab now.
Use official docs to shape the mock.
Treat customer Dashboard API v2 Swagger as the highest implementation source once provided.
Keep customer-specific facts in config and evidence logs.
When test-community credentials arrive, run the same contract tests against the test community.
Update the mock to match test-community behavior.
Only then run tiny production smoke tests.
```

The mock should be almost real in behavior, but honest in naming.

It is a compatibility lab, not a claim that the real customer’s Higher Logic Vanilla community has been validated.

# dynamics365context.md

## Purpose

This file is a Claude Code / agent-ready context document for building and testing a production-shaped Microsoft Dynamics 365 integration when the developer does **not** personally have Dynamics 365 credentials, Dataverse environment access, Finance & Operations environment access, Entra app-registration rights, admin-consent rights, application-user setup access, Power Platform admin access, webhook/plugin-registration access, data-management workspace access, or the ability to configure a real customer environment.

The goal is not to pretend to validate a customer’s real Dynamics 365 tenant. The goal is to build the strongest legal Dynamics 365 Integration Lab possible using public Microsoft documentation, Dataverse Web API docs, Finance & Operations integration docs, local mocks, generated fixtures, synthetic CRM/ERP data, OAuth simulators, Dataverse metadata simulators, OData simulators, batch simulators, webhook/business-event simulators, change-tracking simulators, contract tests, and CI.

## Core framing

“Dynamics 365” is not one single API.

It usually means one or more of these families:

```txt id="dx365_core"
Dynamics 365 customer engagement apps:
  Sales
  Customer Service
  Field Service
  Customer Insights / Journeys
  Project Operations parts
  other model-driven apps

Core platform:
  Microsoft Dataverse
  Power Platform
  Dataverse Web API
  Dataverse tables, columns, relationships, choices, solutions, plug-ins, webhooks

Dynamics 365 finance and operations apps:
  Finance
  Supply Chain Management
  Commerce
  Project Operations parts
  Human Resources areas
  OData data entities
  Data management package API
  recurring integrations
  business events
  data events

Other Dynamics products:
  Business Central
  separate APIs and integration model
```

For most Dynamics 365 Sales / Customer Service / Field Service integrations, treat **Dataverse** as the primary integration surface.

For Finance & Operations, treat **OData data entities**, **Data management package APIs**, **business events**, and **data events** as the primary surfaces.

Do not assume that a Dataverse integration and a Finance & Operations integration work the same way.

## Main integration surfaces

Model these surfaces:

```txt id="surfaces"
Dataverse / Customer Engagement:
  Microsoft Dataverse Web API
  OAuth through Microsoft Entra ID
  application user / service principal
  delegated user auth
  OData query syntax
  $metadata / CSDL
  tables / rows / columns
  relationships / navigation properties
  alternate keys
  upsert
  batch requests
  bulk APIs / multiple-operation actions where applicable
  change tracking
  webhooks
  plug-ins
  service endpoints
  Power Automate connector
  solutions and environment-specific metadata

Finance & Operations:
  OData data entities
  custom data entities
  Data management package REST API
  recurring integrations
  batch jobs
  business events
  data events
  legal entities / companies
  cross-company behavior
  number sequences
  financial dimensions
  posting / validation rules
  custom services if used

Shared Microsoft cloud:
  Entra ID app registration
  OAuth 2.0 tokens
  admin consent
  least-privilege permissions
  environment URLs
  tenant IDs
  app IDs
  client secrets or certificates
  managed identities where applicable
```

## What an agent can legally do

Claude Code or another coding agent can legally:

```txt id="legal_can"
read public Microsoft Dynamics 365 documentation
read public Dataverse Web API documentation
read public Finance & Operations integration documentation
read public Microsoft identity platform documentation
read public Power Platform documentation
model Dataverse Web API behavior
model Dataverse metadata behavior
model Dynamics 365 table/entity behavior
model Finance & Operations OData behavior
model Data management package API behavior
model business events and data events
generate Dynamics-compatible OpenAPI/spec layers
build a local Dataverse-compatible mock server
build a local Finance & Operations-compatible mock server
generate fake Entra OAuth token responses
generate fake application-user permission behavior
generate fake CRM records
generate fake ERP records
generate fake metadata
generate fake alternate keys
generate fake change tracking tokens
generate fake webhook/event payloads
generate fake batch responses
generate fake plugin/webhook errors
generate fake legal entities / companies
generate fake financial dimensions
generate Postman collections
generate contract tests
generate pagination/filtering/change-tracking tests
generate CI pipelines
generate customer/admin onboarding checklists
```

Claude Code should **not**:

```txt id="legal_cannot"
create a Microsoft tenant while pretending to be a customer
accept Microsoft/admin consent on behalf of another organization
use leaked tenant IDs, client secrets, certificates, refresh tokens, or access tokens
bypass Entra ID authentication
scrape private Dynamics 365 / Dataverse / Finance & Operations data
attack public Microsoft endpoints
claim live validation without authorized environment access
register plug-ins/webhooks/business events in a real environment without admin authorization
request broad tenant-wide privileges without explaining least-privilege alternatives
```

## Best legal ways to build/test Dynamics 365 without personal setup

### Option A — Dynamics 365 Integration Lab

Build a local Dockerized lab that your integration client can call as if it were Dynamics 365.

The lab should include:

```txt id="lab"
fake Entra OAuth token endpoint
fake Dataverse environment URL
fake Finance & Operations environment URL
fake tenant ID
fake environment ID
fake application user
fake delegated user
fake Dataverse Web API
fake Dataverse $metadata / CSDL
fake Dataverse tables and relationships
fake standard tables:
  account
  contact
  lead
  opportunity
  incident / case
  activitypointer
  task
  appointment
  product
  salesorder
  invoice
  campaign
  marketing list
fake custom tables:
  new_membership
  new_eventregistration
  new_externalintegrationlog
fake alternate keys
fake upsert behavior
fake batch behavior
fake change tracking
fake Dataverse webhooks
fake Dataverse plug-in/service endpoint behavior
fake F&O OData entities
fake F&O data management package API
fake business events
fake data events
fake legal entities/companies
fake financial dimensions
fake validation and posting errors
fake throttling / Retry-After
fake 400 / 401 / 403 / 404 / 409 / 412 / 429 / 5xx errors
Postman/Newman tests
CI runner
```

This is the strongest no-credential setup because it tests the integration at the HTTP, OAuth, metadata, permission, CRM/ERP record, batch, event, and sync boundary.

### Option B — Dataverse-first contract pack

For Dynamics 365 Sales, Customer Service, Field Service, and many model-driven apps, start with Dataverse.

Agent tasks:

```txt id="dataverse_contract"
inspect public Dataverse Web API docs
inspect Dataverse table/entity docs
inspect OAuth/authentication docs
inspect change tracking docs
inspect webhook/event framework docs
create openapi/dataverse-compatibility.openapi.yaml
create metadata/dataverse-csdl.xml
model WhoAmI
model accounts
model contacts
model leads
model opportunities
model cases
model activities
model products
model sales orders
model invoices
model custom tables
model relationships
model alternate keys
model upsert
model $batch
model change tracking
model webhooks
model errors and service protection limits
generate mock server from OpenAPI
generate typed client stubs if desired
generate schema validation tests
```

Use this when the target Dynamics 365 app is Dataverse-backed.

### Option C — Finance & Operations integration lab

For Dynamics 365 Finance, Supply Chain Management, Commerce, or F&O-style Project Operations workflows, build a separate F&O simulator.

Model:

```txt id="fo_lab"
OData data entities
custom data entities
cross-company queries
legal entities
customers
vendors
released products
sales orders
purchase orders
invoices
payments
journals
inventory transactions
warehouse entities
data management package REST API
recurring integrations
batch jobs
business events
data events
change tracking
financial dimensions
number sequences
posting periods
validation errors
```

Test:

```txt id="fo_tests"
OData read
OData create
OData update
OData delete where allowed
cross-company query
legal entity required
financial dimension required
invalid dimension
closed period
number sequence missing
sales order import
journal import
data package upload
package import scheduled
batch job completes
batch job fails
business event delivered
data event delivered
data event out of order
```

Production rule:

```txt id="fo_rule"
Finance & Operations integrations must model legal entity, batch, validation, and posting behavior.
Do not treat F&O entities like simple CRM rows.
```

### Option D — Metadata-driven Dataverse simulator

Dataverse environments are highly customized. Build a metadata-driven mapper.

Model:

```txt id="metadata_model"
entity logical name
entity set name
primary key
primary name attribute
columns
column logical names
display names
choice values
status/status reason
lookups
relationships
alternate keys
ownership
createdon/modifiedon
statecode/statuscode
custom tables
custom columns
managed/unmanaged solution components
```

Test:

```txt id="metadata_tests"
logical name vs display name
entity set name mismatch
custom table exists
custom table missing
custom column exists
custom column missing
choice value valid
choice value invalid
lookup target wrong
relationship missing
alternate key missing
field read-only
field required
field hidden by security
field-level security denied
```

Production rule:

```txt id="metadata_rule"
Dataverse integrations must use logical names and metadata.
Display names are not stable API contracts.
```

### Option E — Change tracking simulator

For Dataverse incremental sync, model change tracking.

Model:

```txt id="ct_model"
change tracking enabled table
initial query
delta link / change token
created row
updated row
deleted row
version token
expired token
table without change tracking
permission-hidden change
```

Test:

```txt id="ct_tests"
initial sync
delta sync
new record
updated record
deleted record
multiple updates to same record
permission-hidden record
change token persisted
change token invalid/expired
controlled full resync
table not enabled for change tracking
```

Production rule:

```txt id="ct_rule"
Change tracking is the backbone of efficient Dataverse sync.
If change tracking is unavailable, use careful modifiedon polling with a lookback window.
```

### Option F — Webhook / plug-in / service endpoint lab

Dataverse supports server-side event handling through plug-ins, workflows, Azure integrations, and webhooks.

Build a webhook/event simulator.

Model:

```txt id="webhook_model"
message: Create / Update / Delete / Associate / Disassociate
primaryEntityName
stage
mode: sync / async
filtering attributes
pre image
post image
depth
correlationId
initiatingUserId
owningBusinessUnit
payload
retry behavior
disabled endpoint
```

Test:

```txt id="webhook_tests"
create account event
update contact event
delete opportunity event
update ignored because filtering attributes do not match
duplicate event
out-of-order event
event depth recursion
webhook returns 500
webhook times out
endpoint disabled
payload missing post image
webhook triggers fetch latest state
```

Production rule:

```txt id="webhook_rule"
Use webhooks/events as triggers.
Fetch or reconcile latest state before final writeback.
```

### Option G — Alternate key / upsert lab

External integrations should not rely only on GUIDs.

Build alternate-key and upsert simulator.

Model:

```txt id="upsert_model"
primary id: accountid/contactid/etc.
external ID column
alternate key definition
upsert by alternate key
duplicate alternate key
missing key value
changed external ID
conflict
```

Test:

```txt id="upsert_tests"
create with external ID
update by external ID
upsert create path
upsert update path
duplicate external ID
missing external ID
alternate key not defined
alternate key pending/failed
lookup by alternate key
relationship binding by alternate key
```

Production rule:

```txt id="upsert_rule"
For external-system sync, define alternate keys and store both Dataverse GUIDs and external IDs.
```

### Option H — Batch and bulk operation lab

Build simulator for Dataverse batch and multiple-record operations.

Model:

```txt id="batch_model"
$batch
changesets
transactional changeset behavior
partial read batch
create/update/delete operations
UpsertMultiple
UpdateMultiple
CreateMultiple where applicable
service protection throttling
payload size limit
```

Test:

```txt id="batch_tests"
batch read success
batch write success
changeset rollback
one operation fails
partial non-transactional behavior where applicable
large batch rejected
invalid content boundary
429 throttling
retry safe batch
retry unsafe batch
idempotency key/external ID reconciliation
```

Production rule:

```txt id="batch_rule"
Batching improves throughput, but write retries must be idempotent.
Do not blindly retry uncertain create/payment/order writes.
```

### Option I — Power Automate / connector fallback simulator

Some Dynamics integrations are implemented through Power Automate, Logic Apps, or first-party connectors instead of custom code.

Build a connector-style simulator.

Model:

```txt id="connector_model"
Dataverse connector trigger
Dataverse connector action
Finance & Operations connector trigger/action
HTTP trigger
Power Automate flow endpoint
Logic Apps endpoint
retry policy
run history
connection reference
environment variables
solution deployment
```

Test:

```txt id="connector_tests"
trigger fires
trigger delayed
trigger duplicate
connection expired
connection lacks permission
flow returns 202
flow fails after accepting request
flow retry creates duplicate
environment variable missing
solution not imported
```

Production rule:

```txt id="connector_rule"
Power Automate is useful, but treat it as an asynchronous integration surface with retry and run-history failure modes.
```

### Option J — Synthetic CRM/ERP data generator

Generate realistic Dynamics-style datasets.

Generate Dataverse:

```txt id="synthetic_dataverse"
100,000 accounts
500,000 contacts
100,000 leads
50,000 opportunities
200,000 activities
100,000 cases
50,000 products
100,000 sales orders
100,000 invoices
200 custom columns
50 custom tables
100,000 change events
50,000 webhook events
```

Generate Finance & Operations:

```txt id="synthetic_fo"
50 legal entities
100,000 customers
50,000 vendors
500,000 released products
1,000,000 sales orders
1,000,000 purchase orders
1,000,000 invoices
500,000 payments
500,000 journal lines
200 financial dimension values
100,000 business/data events
```

Use the generator to test:

```txt id="synthetic_tests"
pagination
OData filters
relationship expansion
change tracking
alternate key upsert
batch operations
webhook reconciliation
F&O data package imports
cross-company filters
financial dimension validation
large sync checkpointing
throttling
```

### Option K — Admin/customer-ready handoff package

Even before credentials, generate a handoff package so a Dynamics/Power Platform admin can later enable access cleanly.

Agent should generate:

```txt id="admin_handoff"
tenant ID
environment URL
environment ID
Dynamics app type: Sales / Customer Service / Field Service / Finance / Supply Chain / Business Central / mixed
whether Dataverse is in scope
whether Finance & Operations is in scope
app registration requirements
client secret or certificate requirements
application user setup
security role requirements
table permissions
field-level security requirements
Dataverse solution import requirements
required table logical names
required entity set names
required custom columns
required alternate keys
required change tracking tables
required webhooks/plug-ins/service endpoints
required Power Automate/Logic Apps flows
F&O legal entities
F&O data entities
F&O data projects
F&O data package API setup
F&O business/data events
sample account/contact/order/invoice IDs
sample legal entity/company IDs
expected volume
expected sync frequency
smoke-test plan
rollback/safety notes
```

## Suggested repository structure

```txt id="repo"
dynamics365-integration-lab/
  README.md
  dynamics365context.md
  docker-compose.yml
  .env.example

  docs/
    architecture.md
    customer-onboarding.md
    dynamics365-admin-request.md
    dataverse-permissions-plan.md
    application-user-plan.md
    metadata-mapping-plan.md
    alternate-key-plan.md
    change-tracking-plan.md
    webhook-plugin-plan.md
    batch-bulk-plan.md
    finance-operations-plan.md
    power-automate-fallback-plan.md
    validation-plan.md

  openapi/
    dataverse-compatibility.openapi.yaml
    finance-operations-odata-compatibility.openapi.yaml
    finance-operations-data-package-compatibility.openapi.yaml
    dynamics365-webhook-compatibility.openapi.yaml

  metadata/
    dataverse-csdl.xml
    dataverse-tables.json
    dataverse-relationships.json
    dataverse-choices.json
    finance-operations-entities.json

  postman/
    dynamics365-local.postman_collection.json
    dynamics365-local.postman_environment.json
    dataverse-local.postman_collection.json
    finance-operations-local.postman_collection.json
    dynamics365-errors.postman_collection.json

  mock-server/
    package.json
    src/
      server.ts
      auth.ts
      oauthToken.ts
      dataverseMetadata.ts
      dataverseWebApi.ts
      dataverseTables.ts
      accounts.ts
      contacts.ts
      leads.ts
      opportunities.ts
      cases.ts
      activities.ts
      products.ts
      salesOrders.ts
      invoices.ts
      customTables.ts
      relationships.ts
      alternateKeys.ts
      batch.ts
      changeTracking.ts
      dataverseWebhooks.ts
      pluginEvents.ts
      serviceProtection.ts
      financeOperationsOData.ts
      financeDataPackageApi.ts
      legalEntities.ts
      financeBusinessEvents.ts
      financeDataEvents.ts
      powerAutomate.ts
      permissions.ts
      errors.ts
      pagination.ts
      filters.ts
      throttling.ts
    fixtures/
      auth/
      metadata/
      dataverse/
      accounts/
      contacts/
      leads/
      opportunities/
      cases/
      activities/
      sales/
      invoices/
      customTables/
      financeOperations/
      legalEntities/
      dataPackages/
      businessEvents/
      webhooks/
      errors/

  synthetic-data/
    generate-dataverse-fixtures.ts
    generate-finance-operations-fixtures.ts
    fixtures.generated.json

  webhook-lab/
    receiver.ts
    event-generator.ts
    replay-scenarios/
      duplicate-event.json
      out-of-order-event.json
      update-filtered-out.json
      webhook-timeout.json
      plugin-depth-recursion.json
      post-image-missing.json

  change-tracking-lab/
    delta-generator.ts
    scenarios/
      initial-sync.json
      subsequent-delta.json
      deleted-row.json
      token-expired.json
      table-not-enabled.json

  finance-operations-lab/
    data-package-generator.ts
    odata-generator.ts
    business-event-generator.ts
    scenarios/
      import-package-success.json
      import-package-failed.json
      batch-job-pending.json
      sales-order-event.json
      legal-entity-mismatch.json

  tests/
    auth.test.ts
    permissions.test.ts
    dataverse-metadata.test.ts
    dataverse-webapi.test.ts
    accounts.test.ts
    contacts.test.ts
    relationships.test.ts
    alternate-keys.test.ts
    upsert.test.ts
    batch.test.ts
    change-tracking.test.ts
    webhooks.test.ts
    plugin-events.test.ts
    service-protection.test.ts
    finance-odata.test.ts
    finance-data-package.test.ts
    finance-business-events.test.ts
    legal-entities.test.ts
    power-automate.test.ts
    pagination.test.ts
    filters.test.ts
    errors.test.ts
    sync.test.ts

  ci/
    github-actions.yml
```

## Dataverse authentication model

Model both application and delegated flows.

### Application / service principal

Local fake token response:

```json id="app_token"
{
  "token_type": "Bearer",
  "expires_in": 3599,
  "access_token": "fake-dataverse-app-token",
  "aud": "https://org.crm.dynamics.com",
  "tid": "fake-tenant-id",
  "appid": "fake-client-id",
  "roles": []
}
```

Test:

```txt id="app_auth_tests"
client credentials token
certificate-based auth
client secret auth
bad client ID
bad client secret
bad certificate
wrong tenant
wrong resource/audience
application user not created in Dataverse
application user lacks security role
token valid but Dataverse returns 403
```

### Delegated user

Local fake token response:

```json id="delegated_token"
{
  "token_type": "Bearer",
  "expires_in": 3599,
  "access_token": "fake-dataverse-user-token",
  "scp": "user_impersonation",
  "tid": "fake-tenant-id",
  "oid": "fake-user-id"
}
```

Test:

```txt id="delegated_auth_tests"
user signed in
user not signed in
MFA/conditional access failure
user lacks Dataverse role
field-level security denied
business unit restriction
token expired
refresh token revoked
```

Production rule:

```txt id="auth_rule"
Application users and delegated users behave differently.
Pick deliberately based on whether the integration acts as the app or as a human user.
```

## Environment URL handling

Use configuration:

```txt id="env_config"
DYNAMICS_ENVIRONMENT_URL=https://org.crm.dynamics.com
DATAVERSE_WEB_API_BASE_URL=https://org.crm.dynamics.com/api/data/v9.2
TENANT_ID=<tenant-id>
CLIENT_ID=<client-id>
CLIENT_SECRET=<secret>
AUTH_MODE=application|delegated
```

Local mode:

```txt id="local_env"
DYNAMICS_ENVIRONMENT_URL=http://localhost:4010
DATAVERSE_WEB_API_BASE_URL=http://localhost:4010/api/data/v9.2
TENANT_ID=fake-tenant-id
CLIENT_ID=fake-client-id
AUTH_MODE=application
```

Test:

```txt id="env_tests"
wrong environment URL
wrong API version
sandbox vs production URL
regional cloud URL if applicable
base URL trailing slash
resource/audience mismatch
network timeout
DNS failure
```

Production rule:

```txt id="env_rule"
Never hardcode a Dynamics environment URL.
Every customer environment is different.
```

## Dataverse tables and rows

Model:

```txt id="dataverse_rows"
table logical name
entity set name
row GUID
primary name column
columns
lookups
relationships
owner
statecode
statuscode
createdon
modifiedon
version/etag
```

Standard tables to model:

```txt id="standard_tables"
account
contact
lead
opportunity
incident
activitypointer
task
appointment
phonecall
email
product
pricelevel
quote
salesorder
invoice
campaign
list
systemuser
team
businessunit
```

Test:

```txt id="row_tests"
create row
read row
update row
delete row
deactivate row
reactivate row
lookup binding
relationship associate
relationship disassociate
owner assignment
business unit restriction
state/status transition
invalid state/status combination
etag conflict
```

Production rule:

```txt id="row_rule"
Dataverse rows are permissioned and metadata-driven.
Do not treat them like schemaless JSON documents.
```

## OData query model

Model:

```txt id="odata_model"
$select
$filter
$orderby
$top
$skiptoken
$expand
$count
FetchXML if used
parameter aliases
formatted values
lookup annotations
```

Test:

```txt id="odata_tests"
select specific fields
filter by modifiedon
filter by alternate key
filter by status
filter by lookup
expand relationship
large result pagination
skiptoken paging
formatted values requested
lookup annotations requested
invalid filter
unsupported query
injection attempt
```

Production rule:

```txt id="odata_rule"
Always use $select.
Pulling every column from Dataverse is slow, expensive, and brittle.
```

## Dataverse pagination

Model:

```txt id="dv_pagination"
@odata.nextLink
skiptoken
page size
server-driven paging
large table
deleted rows not returned in normal query
```

Test:

```txt id="dv_page_tests"
single page
multiple pages
empty first page
empty final page
nextLink present
nextLink expired
timeout on middle page
retry same nextLink
duplicate record across pages
page size changed
```

Production rule:

```txt id="dv_page_rule"
Follow @odata.nextLink exactly.
Do not construct skip tokens manually.
```

## Relationships and lookups

Model:

```txt id="rel_model"
many-to-one lookup
one-to-many relationship
many-to-many relationship
navigation property name
@odata.bind
alternate-key binding
polymorphic lookup
activity party
customer lookup account/contact
```

Test:

```txt id="rel_tests"
bind contact to account
bind opportunity to account
bind case to customer
customer lookup account
customer lookup contact
activity party email recipient
many-to-many associate
relationship missing
wrong navigation property
alternate-key bind success
alternate-key bind fails
```

Production rule:

```txt id="rel_rule"
Lookup column names and navigation property names are not always the same.
Use metadata.
```

## Alternate keys and upsert

Model:

```txt id="ak_model"
alternate key name
key columns
external ID column
key status
upsert by alternate key
duplicate key
missing key
```

Test:

```txt id="ak_tests"
upsert account by external ID
upsert contact by external ID
alternate key not active
duplicate key
missing key value
changed external ID
relationship bind by alternate key
```

Production rule:

```txt id="ak_rule"
Use alternate keys for external-system identity.
Store both Dataverse GUIDs and external IDs.
```

## Dataverse batch model

Model:

```txt id="batch"
$batch
changeset
transactional changeset
multipart boundaries
create/update/delete
retrieve multiple
content-id references
```

Test:

```txt id="batch2_tests"
batch retrieve
changeset success
changeset rollback
one operation fails
content-id reference
large batch rejected
invalid boundary
retry safe batch
retry unsafe batch
```

Production rule:

```txt id="batch2_rule"
Batch writes must be idempotent or reconciled before retry.
```

## Change tracking model

Model response:

```json id="ct_response"
{
  "value": [
    {
      "accountid": "acc_000001",
      "name": "Asha Corp",
      "modifiedon": "2026-06-16T12:00:00Z"
    }
  ],
  "@odata.deltaLink": "http://localhost:4010/api/data/v9.2/accounts?$deltatoken=delta_001"
}
```

Deleted row:

```json id="ct_delete"
{
  "id": "acc_000002",
  "reason": "deleted"
}
```

Test:

```txt id="ct2_tests"
initial delta
nextLink
deltaLink
row created
row updated
row deleted
delta token persisted
delta token invalid
change tracking not enabled
permission-hidden change
full resync fallback
```

## Webhooks / plug-ins

Model event payload:

```json id="webhook_payload"
{
  "MessageName": "Update",
  "PrimaryEntityName": "contact",
  "PrimaryEntityId": "contact_000001",
  "Stage": 40,
  "Mode": 1,
  "CorrelationId": "corr_000001",
  "Depth": 1,
  "InitiatingUserId": "user_000001",
  "InputParameters": {
    "Target": {
      "contactid": "contact_000001",
      "emailaddress1": "asha@example.org"
    }
  }
}
```

Test:

```txt id="webhook2_tests"
create event
update event
delete event
filtering attribute match
filtering attribute no match
duplicate event
out-of-order event
depth recursion
missing post image
endpoint 500
endpoint timeout
endpoint disabled
```

Production rule:

```txt id="webhook2_rule"
Webhooks should be idempotent and should not trust event payloads as final state.
Fetch latest row where correctness matters.
```

## Service protection / throttling

Model:

```txt id="throttle_model"
429 Too Many Requests
Retry-After header
service protection limit exceeded
concurrent request limit
execution time limit
large query timeout
batch too large
```

Behavior:

```txt id="throttle_behavior"
honor Retry-After
exponential backoff with jitter
cap retries
pause sync safely
reduce batch size
avoid duplicate writes
alert after retry budget exhausted
```

Production rule:

```txt id="throttle_rule"
Dynamics integrations must be service-protection-limit aware.
Throttling is normal at scale.
```

## Finance & Operations OData model

Model base paths:

```txt id="fo_paths"
GET  /data/CustomersV3
POST /data/CustomersV3
PATCH /data/CustomersV3(dataAreaId='usmf',CustomerAccount='C0001')
GET  /data/SalesOrderHeadersV2
GET  /data/SalesOrderLines
GET  /data/VendorsV2
GET  /data/ReleasedProductsV2
```

Model:

```txt id="fo_entities"
dataAreaId / company / legal entity
entity key
OData $select
OData $filter
OData $top
OData $skip
cross-company
custom data entity
business validation
```

Test:

```txt id="fo_odata_tests"
read customers
create customer
update customer
cross-company query
missing dataAreaId
wrong legal entity
invalid financial dimension
invalid customer group
closed period
business validation error
custom entity missing
permission denied
```

Production rule:

```txt id="fo_odata_rule"
F&O OData entities enforce business rules.
They are not direct database tables.
```

## Finance & Operations Data management package API

Model:

```txt id="package_model"
data project
data package
upload package
import package
export package
job execution ID
batch job status
staging errors
validation errors
success file
error file
```

Test:

```txt id="package_tests"
upload package
import package scheduled
job pending
job executing
job succeeded
job failed
staging validation error
business validation error
download error log
retry import safely
duplicate external record
```

Production rule:

```txt id="package_rule"
Data package APIs are asynchronous.
A successful scheduling response is not the same as successful import.
```

## Finance & Operations business events / data events

Model:

```txt id="fo_event_model"
business event
data event
event ID
legal entity
entity name
create/update/delete event
endpoint
payload
attempt
delivery status
out-of-order delivery
```

Test:

```txt id="fo_event_tests"
business event emitted
data event create
data event update
data event delete
legal-entity-specific subscription
duplicate event
out-of-order event
endpoint returns 500
endpoint retries
payload triggers OData read
data event not fired because change tracking disabled
```

Production rule:

```txt id="fo_event_rule"
F&O events are triggers.
Use them to reconcile by OData/API reads, not as the only source of truth.
```

## Power Automate / Logic Apps model

Model:

```txt id="flow_model"
HTTP trigger
Dataverse trigger
F&O connector trigger
connection reference
flow run ID
run status
retry policy
environment variable
solution-aware flow
```

Test:

```txt id="flow_tests"
flow receives request
flow returns 202
flow fails later
flow retries
connection expired
connection lacks permission
environment variable missing
duplicate trigger
manual replay
```

Production rule:

```txt id="flow_rule"
Treat flows as asynchronous middleware with their own failure and retry behavior.
```

## Error scenarios

Mock every important status/state:

```txt id="errors"
400 bad request
401 invalid/expired token
403 missing Dataverse role / application user / F&O permission
404 row/entity not found or not visible
409 duplicate/conflict
412 eTag mismatch
415 wrong content type
422 validation/mapping failure
429 service protection/throttling
500 server error
502 bad gateway
503 unavailable
504 timeout
Dataverse alternate key inactive
Dataverse change tracking disabled
Dataverse plugin/webhook disabled
F&O legal entity mismatch
F&O data package import failed
F&O business event delivery failed
Power Automate flow failed after 202
```

Expected behavior:

```txt id="error_behavior"
400 -> fail fast and log sanitized context
401 -> refresh/re-authenticate as appropriate
403 -> surface permission/app-user/security-role issue
404 -> missing or not visible; reconcile
409 -> conflict resolution or idempotent retry
412 -> refresh row and retry if safe
415 -> fix content type
422 -> mapping/data validation failure
429 -> backoff
5xx -> bounded retry
timeout on write -> reconcile before retrying
```

## Postman/Newman strategy

Agent should generate:

```txt id="postman"
postman/dynamics365-local.postman_collection.json
postman/dynamics365-local.postman_environment.json
postman/dataverse-local.postman_collection.json
postman/finance-operations-local.postman_collection.json
postman/dynamics365-errors.postman_collection.json
```

Tests should verify:

```txt id="postman_tests"
OAuth token response
WhoAmI-like response
metadata response
account/contact CRUD
lookup binding
alternate-key upsert
batch request
change tracking response
webhook payload
F&O OData response
F&O data package response
business event response
error bodies
throttling behavior
no secret leakage in scripts
```

CI command:

```bash id="newman"
newman run postman/dynamics365-local.postman_collection.json \
  -e postman/dynamics365-local.postman_environment.json
```

## OpenAPI / contract-test strategy

Agent should generate:

```txt id="openapi"
openapi/dataverse-compatibility.openapi.yaml
openapi/finance-operations-odata-compatibility.openapi.yaml
openapi/finance-operations-data-package-compatibility.openapi.yaml
openapi/dynamics365-webhook-compatibility.openapi.yaml
```

Use it for:

```txt id="contract_uses"
Prism mock server
Mockoon import
schema validation
typed model generation
contract tests
Schemathesis/property-based tests if compatible
```

Minimum modeled Dataverse paths:

```txt id="dv_paths"
POST /oauth2/v2.0/token

GET /api/data/v9.2/WhoAmI
GET /api/data/v9.2/$metadata

GET /api/data/v9.2/accounts
POST /api/data/v9.2/accounts
GET /api/data/v9.2/accounts({accountid})
PATCH /api/data/v9.2/accounts({accountid})
DELETE /api/data/v9.2/accounts({accountid})

GET /api/data/v9.2/contacts
POST /api/data/v9.2/contacts
PATCH /api/data/v9.2/contacts({contactid})

GET /api/data/v9.2/leads
GET /api/data/v9.2/opportunities
GET /api/data/v9.2/incidents
GET /api/data/v9.2/activitypointers

POST /api/data/v9.2/$batch

POST /webhooks/dataverse
```

Minimum modeled Finance & Operations paths:

```txt id="fo_min_paths"
GET /data/CustomersV3
POST /data/CustomersV3
GET /data/VendorsV2
GET /data/ReleasedProductsV2
GET /data/SalesOrderHeadersV2
GET /data/SalesOrderLines
POST /data/DataManagementDefinitionGroups/Microsoft.Dynamics.DataEntities.ImportFromPackage
GET /data/DataManagementDefinitionGroups/Microsoft.Dynamics.DataEntities.GetExecutionSummaryStatus
POST /webhooks/finance-operations
```

Exact table/entity names, fields, alternate keys, roles, legal entities, and custom objects must be aligned to the customer environment before live validation.

## Production-grade behaviors to prove

The lab should prove:

```txt id="prod_proof"
OAuth token lifecycle works
application user and delegated user cases are separate
environment URLs are configurable
metadata is parsed and used
logical names are used instead of display names
entity set names are correct
relationships and lookups are bound correctly
alternate keys and upsert work
change tracking works or fallback polling is defined
batch writes are idempotent or reconciled
webhooks are idempotent and trigger reconciliation
service protection limits are handled
F&O legal entity behavior is modeled
F&O data package imports are treated as asynchronous
F&O events are handled as triggers
custom tables/columns do not break parser
permission failures are surfaced clearly
secrets are redacted
sync can resume after partial failure
CI catches contract regressions
```

## What to ask a Dynamics/Power Platform admin later

Generate this as `docs/dynamics365-admin-request.md`:

```txt id="admin_request"
Please provide:
- Dynamics 365 app type: Sales, Customer Service, Field Service, Finance, Supply Chain, Commerce, Project Operations, Business Central, or mixed
- Dataverse environment URL if applicable
- Finance & Operations environment URL if applicable
- tenant ID
- environment ID
- whether app-only integration is allowed
- app registration owner/admin contact
- client ID / certificate or client secret setup process through secure channel
- application user setup status
- security role assigned to application user
- required table permissions
- field-level security constraints
- table logical names
- entity set names
- custom table names
- custom column names
- choice/status values
- lookup relationship names
- alternate key definitions
- change tracking enabled tables
- webhook/plugin/service endpoint registration requirements
- Power Automate/Logic Apps flows if used
- F&O legal entities/companies
- F&O data entities
- F&O data projects/package APIs if used
- F&O business events/data events if used
- sample account/contact/order/invoice IDs
- expected data volume
- expected sync frequency
- whether write operations are in scope
- whether financial/ERP writes are in scope
```

## Minimal smoke-test plan for real credentials later

When authorized credentials are eventually provided, the same integration lab should run a constrained smoke test.

For Dataverse:

```txt id="dv_smoke"
1. confirm environment URL
2. acquire token
3. call WhoAmI
4. confirm application user/security role
5. retrieve $metadata
6. fetch one known account
7. fetch one known contact
8. validate custom columns
9. validate lookup relationship names
10. test alternate-key lookup if configured
11. run one tiny filtered query
12. verify pagination behavior
13. verify change tracking on one table if enabled
14. run read-only sync on a tiny scope
15. compare results to expected sample IDs
```

For Finance & Operations:

```txt id="fo_smoke"
1. confirm environment URL
2. acquire token
3. fetch one known legal entity/company
4. query one safe OData entity
5. fetch one known customer/vendor/product
6. validate cross-company behavior if needed
7. validate custom data entity if used
8. test one data package status call if used
9. verify business/data event setup only if approved
10. run read-only sync on a tiny scope
```

Do not begin with broad sync, plug-in registration, business-event subscription, order imports, invoice writes, or financial posting.

## Write/upsert smoke-test plan

Only after read-only tests pass and the customer explicitly confirms write scope.

For Dataverse:

```txt id="dv_write_smoke"
1. identify one test table
2. identify one test row or create one harmless test row
3. upsert by alternate key
4. read the row back
5. replay same upsert
6. confirm idempotency/no duplicate bad state
7. test validation failure
8. test permission failure
9. test eTag conflict if possible
```

For Finance & Operations:

```txt id="fo_write_smoke"
1. use one test legal entity
2. use one safe test data entity
3. create or update one harmless test record
4. read it back by key
5. replay same write if idempotent
6. confirm no duplicate bad state
7. test validation failure
8. do not post financial transactions unless explicitly approved
```

## Claude Code task prompt

Use this prompt with Claude Code:

```txt id="claude_prompt"
You are building a Dynamics 365 Integration Lab in this repository.

Goal:
Create a production-shaped local development and test harness for Microsoft Dynamics 365 integrations without requiring real tenant access, Dynamics credentials, Dataverse environment access, Finance & Operations environment access, app registration access, admin consent, webhook/plugin registration, or live customer data.

Legal constraints:
Use only public Microsoft documentation, generated fixtures, local mocks, and synthetic data. Do not attempt to create tenants, obtain credentials, bypass authentication, register real plugins/webhooks, or call private customer data.

Deliverables:
1. docker-compose.yml that starts a local Dynamics 365-compatible mock environment.
2. mock-server implementation with Entra OAuth tokens, application/delegated auth, Dataverse Web API, metadata, tables, relationships, alternate keys, upsert, batch, change tracking, webhooks/plugin events, service protection limits, Finance & Operations OData, Data management package API, business events, data events, Power Automate fallback behavior, permissions, and error scenarios.
3. openapi/dataverse-compatibility.openapi.yaml.
4. openapi/finance-operations-odata-compatibility.openapi.yaml.
5. openapi/finance-operations-data-package-compatibility.openapi.yaml.
6. openapi/dynamics365-webhook-compatibility.openapi.yaml.
7. metadata/dataverse-csdl.xml and metadata JSON fixtures.
8. postman/dynamics365-local collection and environment.
9. synthetic data generators for Dataverse CRM data and Finance & Operations ERP data.
10. webhook-lab receiver and event generator.
11. change-tracking-lab delta generator.
12. finance-operations-lab data-package and business-event generators.
13. tests covering auth, permissions, metadata, OData queries, table CRUD, lookups, relationships, alternate keys, upsert, batch, change tracking, webhooks, service protection, F&O OData, F&O data packages, F&O events, Power Automate fallback, pagination, filtering, errors, and sync.
14. docs/dynamics365-admin-request.md, docs/dataverse-permissions-plan.md, docs/application-user-plan.md, docs/metadata-mapping-plan.md, docs/alternate-key-plan.md, docs/change-tracking-plan.md, docs/webhook-plugin-plan.md, docs/batch-bulk-plan.md, docs/finance-operations-plan.md, docs/power-automate-fallback-plan.md, and docs/validation-plan.md.

Requirements:
- Use configurable DYNAMICS_ENVIRONMENT_URL, DATAVERSE_WEB_API_BASE_URL, FINOPS_BASE_URL, TENANT_ID, CLIENT_ID, CLIENT_SECRET, CERTIFICATE_PATH, AUTH_MODE, and ENVIRONMENT_TYPE.
- Never log client secrets, private keys, authorization codes, refresh tokens, access tokens, cookies, webhook secrets, or Authorization headers.
- Include scenarios for 400/401/403/404/409/412/415/422/429/500/503/timeouts.
- Include application user missing/security-role missing scenarios.
- Include delegated user lacks-role scenario.
- Include logical-name vs display-name metadata scenarios.
- Include alternate-key inactive/duplicate/missing scenarios.
- Include lookup binding and relationship-name mismatch scenarios.
- Include change tracking enabled/disabled/token-expired scenarios.
- Include webhook duplicate/out-of-order/depth-recursion scenarios.
- Include $batch changeset rollback scenarios.
- Include service protection throttling with Retry-After scenarios.
- Include F&O legal entity mismatch scenarios.
- Include F&O data package asynchronous job success/failure scenarios.
- Include F&O business/data event duplicate/out-of-order scenarios.
- Include financial/ERP write timeout and reconciliation scenarios.
- Include CI command to run all tests locally.
```

## Source links to include in repo docs

Use current public sources when building the lab:

```txt id="source_links"
Microsoft Dataverse developer documentation
Microsoft Dataverse Web API overview
Microsoft Dataverse OAuth authentication documentation
Dataverse Web API OData query docs
Dataverse metadata / CSDL docs
Dataverse alternate keys and upsert docs
Dataverse batch request docs
Dataverse change tracking docs
Dataverse webhooks docs
Dataverse event framework docs
Dataverse service protection / throttling docs
Dynamics 365 implementation guide for integration patterns
Dynamics 365 Finance & Operations OData docs
Dynamics 365 Finance & Operations Data management package REST API docs
Dynamics 365 Finance & Operations recurring integrations docs
Dynamics 365 Finance & Operations business events docs
Dynamics 365 Finance & Operations data events docs
Power Automate / Logic Apps Dataverse connector docs
Microsoft identity platform OAuth docs
```

## Bottom line

The best legal no-credential Dynamics 365 strategy is not “just unit tests.”

It is a full **Dynamics 365 Integration Lab**:

```txt id="bottom_line"
public Microsoft Dynamics/Dataverse/F&O docs
+ generated Dataverse and F&O OpenAPI compatibility contracts
+ local Dataverse-compatible mock server
+ local F&O-compatible mock server
+ Entra OAuth simulator
+ application-user/delegated-user permission simulator
+ metadata/CSDL simulator
+ CRM table/relationship/upsert simulator
+ change-tracking simulator
+ webhook/plugin-event simulator
+ batch/bulk simulator
+ F&O OData/data-package simulator
+ business/data event simulator
+ synthetic CRM/ERP datasets
+ service-protection/throttling simulator
+ Power Automate fallback simulator
+ CI pipeline
+ admin-ready onboarding/validation package
```

This gives the integration serious production shape before a Microsoft Dynamics 365 / Power Platform admin provides authorized environment, app registration, consent, security role, webhook, or Finance & Operations access.

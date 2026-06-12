# PropFuel Source Study

## Executive Summary

PropFuel's authoritative documentation is **dispersed and operationally focused** — available through an official help portal but lacking machine-readable API contracts. **No OpenAPI spec, Postman collection, GraphQL SDL, or SDK type definitions** were discovered in public sources. All 7 identified sources are HTML-based help articles or marketing pages. The user-provided **data export context** (`sources/data-export-context.md`) is the **most technical source available**, describing the file-feed API more explicitly than official help center articles.

**Authority verdict**: 4 Tier-1 (vendor-owned help portal + marketing site) + 3 Tier-2 (secondary help articles) = **HIGH authority for operational guidance, MEDIUM authority for technical specification**. The technical ceiling is "enough to build a connector" only when combined with live introspection or the user-provided context.

---

## Source-by-Source Study

### 1. PropFuel Help Center — Connectors & Fields Category
**URL**: https://help.propfuel.com/en/categories/1371649  
**Tier**: 1 (vendor-owned)  
**Category**: OfficialDocs  
**Accessibility**: Reachable (public, no auth)

#### Structure
- **Coverage**: 57+ articles organized by connector type (AMS, CRM, marketing platforms, webhooks, technical options)
- **Scope**: Integration setup, field mapping, bidirectional sync, connector-specific credential requirements
- **Format**: HTML help portal (Zendesk-style knowledge base)

#### Taxonomies Documented
1. **ConnectorAuthentication** — COVERABLE
   - Each connector article specifies required credentials (OAuth, API keys, username/password, API URLs)
   - Patterns vary per system (iMIS uses username/password/API URL; HubSpot uses OAuth; Mailchimp uses API keys)
   - **Evidence locus**: Individual connector subpages (e.g., iMIS article)

2. **FieldMapping** — COVERABLE
   - How to map vendor fields to PropFuel contact fields
   - Custom field creation support
   - **Evidence locus**: "Advanced Field Mapping Options" article + per-connector guides

3. **BidirectionalSync** — COVERABLE
   - Data flow direction (inbound, outbound, bidirectional)
   - Write-back limitations (some connectors read-only; others support updating)
   - **Evidence locus**: "Updating Data in Your AMS via PropFuel" article + connector-specific notes

4. **DataExportFileList** — INFORMATIONAL
   - Connector architecture references list/download/ack file-feed pattern
   - Not explicitly spelled out in this category; inferred from user context
   - **Evidence locus**: None in this category directly; user-provided context is primary source

#### Gaps
- **No endpoint paths** documented (e.g., no `/list`, `/download`, `/ack` URLs)
- **No schema definitions** (request/response structures, field types, constraints)
- **No error codes** (what 401 vs 403 vs 429 mean in context of connector)
- **No rate limits** (requests/sec, batch sizes)
- **No pagination strategy** (offset vs cursor vs file-based keyset)

#### Evidence Quality
**EvidenceStrength**: ExplicitStatement (vendor author)  
**Refresh**: Articles updated regularly (product releases referenced)  
**Completeness**: Operational completeness high; technical completeness low

---

### 2. PropFuel Help Center — Connectors Overview Article
**URL**: https://help.propfuel.com/en/articles/5714945  
**Tier**: 1 (vendor-owned)  
**Category**: OfficialDocs  
**Accessibility**: Reachable (public, no auth)

#### Structure
- **Purpose**: Landing article explaining what connectors are, why they exist, general setup flow
- **Audience**: Non-technical users setting up integrations via UI
- **Content**: Functional overview, not API reference

#### Taxonomies Documented
1. **ConnectorOverview** — INFORMATIONAL
   - 50+ connectors exist for various AMS/CRM platforms
   - Connectors enable bidirectional data flow
   - Each integration requires platform-specific credentials
   - **Evidence locus**: This article (high-level); directs to per-connector articles for details

2. **ConnectorAuthentication** — INFORMATIONAL
   - Generic pattern: "ask to connect via OAuth" or "enter credentials"
   - No unified auth scheme
   - **Evidence locus**: General statement; specifics in per-connector articles

#### Key Limitation
This article is a **routing page** — it *references* technical details but does NOT contain them. Users must click through to individual connector articles for actual endpoint/credential specifics.

#### Gaps
- **No endpoints, schemas, or technical spec** (by design — this is an overview)
- **Incomplete connector list** (article says "50+ connectors" but does not enumerate all or link all)

---

### 3. PropFuel Help Center — Main Portal
**URL**: https://help.propfuel.com/  
**Tier**: 1 (vendor-owned)  
**Category**: OfficialDocs  
**Accessibility**: Reachable (public, no auth)

#### Structure
- **Purpose**: Home page indexing all help documentation
- **Organization**: Getting Started (23), Connectors & Fields (57), Email Campaigns (31), Website Engagement (9), SMS (10), Analysis & Reporting (16), Campaign Guides (15), Additional Resources (31)
- **Total**: 190+ articles

#### Taxonomies Documented
1. **ConnectorOverview** — INFORMATIONAL
   - Via the Connectors & Fields category
   - **Evidence locus**: Category link on main page

#### Critical Gap
**No "Developer" or "API Reference" section** — PropFuel does NOT surface API documentation as a distinct section for technical builders. All documentation is operational (UI-focused, campaign-focused).

---

### 4. PropFuel Help Center — iMIS Connector Article
**URL**: https://help.propfuel.com/en/articles/5718977  
**Tier**: 2 (vendor-owned, connector-specific)  
**Category**: OfficialDocs  
**Accessibility**: Reachable (public, no auth)

#### Structure
- **Purpose**: Setup guide for integrating PropFuel with iMIS AMS
- **Audience**: iMIS customers setting up the integration via PropFuel UI
- **Content**: Credential form fields, brief description of data flow

#### Taxonomies Documented
1. **ConnectorAuthentication** — COVERABLE
   - **Credentials Required**:
     - Username (iMIS user account)
     - Password (iMIS user password)
     - API URL (full path to API service, e.g., `https://YourOrganization.org/api`)
   - **Evidence locus**: Credential form description in the article
   - **Evidence strength**: ExplicitStatement

2. **ConnectorWriteBack** — COVERABLE (partially)
   - iMIS connector supports write-back to AMS
   - "Talk to your account manager" for write-back specifics
   - **Evidence locus**: Write-back section (defers to account manager)
   - **Evidence strength**: ImpliedFromExample (not fully documented)

#### Technical Specification
The article documents one **API call** explicitly:
- **"GetParty api call"** — retrieves contact information
- No endpoint path, method, or response schema provided

#### Data Flow Methods
- **REST API** (primary)
- **IQA** (Inquiry/Query Approach) — alternative method, not detailed

#### Gaps
- **No REST endpoint paths** (no `/api/contacts` or similar)
- **No request/response examples** (what GetParty POST looks like)
- **No field schema** (what properties are available, what are required, types)
- **No error handling** (what if API returns 401, 500, etc.)
- **No pagination** (how to fetch > 100 records)
- **Write-back not documented** (users directed to account manager)

#### Evidence Quality
**EvidenceStrength**: ExplicitStatement for auth, ImpliedFromExample for write-back  
**Completeness**: Minimum viable for UI-driven setup; insufficient for API client development

---

### 5. PropFuel Marketing Website — Home Page
**URL**: https://www.propfuel.com/  
**Tier**: 1 (vendor-owned)  
**Category**: OfficialDocs (marketing)  
**Accessibility**: Reachable (public, no auth)

#### Structure
- **Purpose**: Product landing page
- **Content**: Business pitch, use cases, platform capabilities, customer success stories
- **Audience**: Prospects, not technical integrators

#### Taxonomies Documented
(None — this is marketing material)

#### Business Information (Non-Technical)
- AI-powered member insights and engagement platform
- Integrations with Nimble AMS, Fonteva, iMIS, YourMembership, MemberClicks, and others
- Three engines: Insights, Automation (70+ templates), Engagement (email/web/SMS)
- Typical results: 45% engagement rate, $650K revenue growth, 72% reverse decline rate

#### Gaps
- **Zero technical documentation** (expected for marketing site)
- **No API reference links**

---

### 6. PropFuel Marketing Website — Capabilities Page
**URL**: https://www.propfuel.com/capabilities  
**Tier**: 2 (vendor-owned)  
**Category**: OfficialDocs (marketing)  
**Accessibility**: Reachable (public, no auth)

#### Structure
- **Purpose**: Feature overview for prospects
- **Content**: High-level capabilities, not implementation details

#### Taxonomies Documented
(None — this is marketing material)

#### Content Summary
- **Insights Engine**: Member interest/at-risk detection
- **Automation Engine**: 70+ templates, scheduled/trigger campaigns
- **Engagement Engine**: Email, website, SMS channels
- Bidirectional AMS sync mentioned, not detailed

#### Gaps
- **Zero technical specification**
- **No integration details**

---

### 7. PropFuel Help Center — Workflow Actions Article
**URL**: https://help.propfuel.com/en/articles/5717441  
**Tier**: 2 (vendor-owned)  
**Category**: OfficialDocs  
**Accessibility**: Reachable (public, no auth)

#### Structure
- **Purpose**: Explain what actions can be triggered in campaigns (send email, update field, etc.)
- **Audience**: Campaign designers in PropFuel

#### Taxonomies Documented
1. **WorkflowActions** — INFORMATIONAL
   - What actions campaigns can perform
   - Action types (send email, SMS, webhook, update field, etc.)
   - **Evidence locus**: Article content

#### Relevance to Connectors
- Indirect relevance: shows what callbacks/write-backs PropFuel can perform
- Helps understand bidirectional sync patterns

#### Gaps
- **No connector-specific action details**
- **No webhook payload schema**

---

## User-Provided Context (Primary Technical Source)

**File**: `/sources/data-export-context.md`  
**Authority**: User-provided operational context from PropFuel client  
**Tier**: Not formally ranked (extracts from PropFuel internal/customer documentation)  
**Category**: OfficialContext

### Structure
- Data export happens on hourly schedule
- Files are JSON format with naming `[microtime]-[data type].json`
- Three API endpoints documented with full precision

### Taxonomies Documented

1. **DataExportFileList** — COVERABLE
   - **Endpoint**: `GET https://app.propfuel.com/dataexport/2019/list`
   - **Purpose**: Retrieve list of available export files
   - **Auth**: Bearer token
   - **Evidence locus**: "Get File List" section

2. **DataExportFileDownload** — COVERABLE
   - **Endpoint**: `GET https://app.propfuel.com/dataexport/2019/download/{file}`
   - **Purpose**: Download a specific file by name
   - **Auth**: Bearer token
   - **Parameters**: filename (from list response)
   - **Response Format**: JSON (array of objects, one per record)
   - **Evidence locus**: "Download File" section

3. **DataExportFileAcknowledge** — COVERABLE
   - **Endpoint**: `POST https://app.propfuel.com/dataexport/2019/ack/{file}`
   - **Purpose**: Mark file as processed and remove from list
   - **Auth**: Bearer token
   - **Evidence locus**: "Acknowledge File" section

4. **DataExportAuthentication** — COVERABLE
   - **Scheme**: Bearer token (HTTP Authorization header)
   - **Header Format**: `Authorization: Bearer <token>`
   - **Evidence locus**: "Authentication" section

5. **DataExportNaming** — INFORMATIONAL
   - Filename pattern: `[microtime]-[data type].json`
   - Microtime = sortable timestamp (chronological ordering)
   - Data type = encoded in filename suffix (e.g., `opens`, `clicks`, `inquiries`)
   - **Evidence locus**: "File Format" section

### Critical Details
- **Account ID in path**: The account ID (e.g., `2019`) appears in all URLs, suggesting multi-tenant support
- **File-based pagination**: No traditional API pagination (offset/cursor); instead, files are the pagination unit
- **Idempotency**: Files persist until acknowledged; re-querying `list` returns same files until `ack` is called
- **Data format**: JSON array of objects (standard REST convention)

### Gaps in This Source
- **No field schema** for individual records (what properties does each record contain?)
- **No error codes** (what if Bearer token is invalid? 401? 403?)
- **No rate limits** (how frequently can list/download/ack be called?)
- **No data retention policy** (how long do unacknowledged files persist?)
- **No data type enumeration** (what are the possible data types beyond examples?)

### Evidence Quality
**EvidenceStrength**: ExplicitStatement (operational context)  
**Source Authority**: Derived from PropFuel customer documentation; likely accurate  
**Completeness**: Sufficient for initial connector build; gaps require live introspection or support contact

---

## Taxonomy Summary

### COVERABLE Taxonomies (Syncable Objects)

The following taxonomies are **directly related to connector integration** and are discoverable from the sources:

| Taxonomy | Source | Completeness | Authority |
|----------|--------|--------------|-----------|
| **ConnectorAuthentication** | Help Center Connectors & Fields, iMIS article, user context | Medium | Tier-1 |
| **FieldMapping** | Help Center Connectors & Fields | Medium | Tier-1 |
| **BidirectionalSync** | Help Center, Connectors article | Low | Tier-1 |
| **DataExportFileList** | User-provided context | High | User-provided |
| **DataExportFileDownload** | User-provided context | High | User-provided |
| **DataExportFileAcknowledge** | User-provided context | High | User-provided |

**Total COVERABLE taxonomies**: 6

**Leaf object inventory** (what the extractor should classify):
1. `DataExport.FileList` (GET endpoint)
2. `DataExport.FileDownload` (GET endpoint)
3. `DataExport.FileAcknowledge` (POST endpoint)
4. `Connector.Mapping` (field mapping configuration — informational, not a syncable object)
5. `Connector.Authentication` (credentials — driver-specific, not a data object)

### INFORMATIONAL Taxonomies (Framework Mechanics)

The following taxonomies describe vendor mechanics that inform extraction logic but are NOT syncable objects:

| Taxonomy | Source | Purpose |
|----------|--------|---------|
| **ConnectorOverview** | Help Center | Understand connector architecture; 50+ supported systems |
| **WorkflowActions** | Help article | Understand what write-back actions are possible |
| **DataExportNaming** | User context | File naming convention for timestamp sorting |

---

## Machine-Readable Schemas

**Verdict**: **NONE DISCOVERED**

### Search Results
- ❌ **OpenAPI/Swagger**: No `/swagger.json`, `/openapi.json`, or API spec endpoint found
- ❌ **GraphQL SDL**: No GraphQL endpoint discovered
- ❌ **Postman Collection**: No published Postman workspace or collection found
- ❌ **SDK Type Definitions**: No TypeScript, Python, or other SDK with type exports found
- ❌ **GitHub Repository**: PropFuel has GitHub repos but none contain API docs (only GitHub Actions)
- ❌ **Developer Portal**: No dedicated developer.propfuel.com or similar portal found

**Impact**: The connector must infer schema from:
1. Live data samples (runtime discovery)
2. User-provided context (file-feed specifics)
3. Help article prose descriptions

---

## Authority Assessment

### Tier-1 Sources (Vendor-Owned, Authoritative)
1. **Help Center Connectors & Fields** (https://help.propfuel.com/en/categories/1371649)
   - Authority: Highest (vendor-authored operational docs)
   - Completeness: Medium (operational, not technical spec)

2. **Help Center Main Portal** (https://help.propfuel.com/)
   - Authority: Highest (vendor-authored)
   - Completeness: Medium (covers many topics, but no API reference)

3. **Marketing Website** (https://www.propfuel.com/)
   - Authority: High (vendor-published)
   - Completeness: Low (business narrative, not technical)

### Tier-2 Sources (Vendor-Owned, Secondary)
1. **Help Center iMIS Article** (specific connector doc)
   - Authority: High (vendor-authored for specific system)
   - Completeness: Low (minimum viable for UI setup)

2. **Capabilities Page** (https://www.propfuel.com/capabilities)
   - Authority: High (vendor-authored)
   - Completeness: Low (marketing overview)

3. **Workflow Actions Article** (secondary help topic)
   - Authority: High (vendor-authored)
   - Completeness: Low (not directly relevant to data export)

### User-Provided Context
- **Authority**: High (operational context from customer)
- **Completeness**: Medium (covers file-feed API; gaps on schema, errors, rate limits)
- **Tier**: Not formally ranked; treat as supplementary Tier-1 technical source

---

## Recommended Extraction Strategy

### Phase 1: Static Metadata (Declared)
Use:
- **User-provided data export context** (3 endpoints: list, download, ack)
- **Help Center authentication patterns** (Bearer token specified)

Populate:
- Integration Object (DataExport) with 3 Operations (FileList, FileDownload, FileAcknowledge)
- Operation columns (APIPath, Method, bodyShape, etc.)
- Authentication (Bearer token, required)

### Phase 2: Runtime Discovery (Discovered)
At connector creation time:
- Test connectivity to list/download/ack endpoints
- Infer response schema from live file responses
- Detect error codes and rate limits from live interactions
- Enumerate data type values from live list response

### Phase 3: Live Sync (Custom)
At sync time:
- Use full-record pass-through to capture field schema from actual files
- Implement content-hash idempotency (no PK assumption on file records)
- Defer unknown fields to custom column capture

---

## Conclusion

PropFuel's authority landscape is **vendor-published and complete for operations, but sparse for technical specification**. The help center is the canonical source for "how to set up a connector" but insufficient for "how to build an API client." The user-provided data export context fills the largest technical gap, enabling a file-feed connector build.

**Proceed to extraction** using the user-provided context + help center authentication patterns. **Request extended API documentation from PropFuel support** for schema, error codes, and rate limits before finalizing the connector. **Plan for runtime discovery** to fill schema gaps.

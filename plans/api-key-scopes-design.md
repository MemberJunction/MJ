# MemberJunction API Key Authorization System - Design Document

## Document Status
- **Version**: 1.2
- **Date**: January 26, 2026
- **Author**: MJ Development Team
- **Status**: Draft - Pending Review

---

## Executive Summary

This document proposes enhancements to MemberJunction's API Key authorization system to support **fine-grained, pattern-based access control** across multiple applications (MJAPI, MCP Server, Portal, etc.). The design enables:

1. **Application-level restriction**: API keys optionally bound to specific applications
2. **Application scope ceiling with patterns**: Each app defines scope + resource patterns it can use
3. **Hierarchical scopes**: Permission tree with inheritance (app-agnostic, reusable)
4. **Two-level pattern matching**: App ceiling patterns AND key-level patterns
5. **Include/Exclude rules**: Flexible permission grants with exceptions at both levels
6. **Deny trumps all**: Explicit deny rules for security boundaries at both levels
7. **Enhanced audit logging**: Detailed scope evaluation tracking

### Critical Design Principle

> **User permissions are the ceiling.** API key scopes can only **narrow** permissions, never expand them. If a user lacks access to an entity or has Row-Level Security (RLS) restrictions, those constraints always apply regardless of API key scopes.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Industry Comparison](#industry-comparison)
3. [Gap Analysis](#gap-analysis)
4. [Proposed Architecture](#proposed-architecture)
5. [Schema Design](#schema-design)
6. [Evaluation Algorithm](#evaluation-algorithm)
7. [Implementation Components](#implementation-components)
8. [Example Use Cases](#example-use-cases)
9. [Migration Strategy](#migration-strategy)
10. [Open Questions](#open-questions)

---

## Current State Analysis

### Existing Schema

```sql
-- Current APIScope table
CREATE TABLE APIScope (
    ID UNIQUEIDENTIFIER PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL UNIQUE,    -- e.g., 'entities:read'
    Category NVARCHAR(100) NOT NULL,        -- e.g., 'Entities'
    Description NVARCHAR(500) NULL
);

-- Current APIKey table
CREATE TABLE APIKey (
    ID UNIQUEIDENTIFIER PRIMARY KEY,
    Hash NVARCHAR(64) NOT NULL UNIQUE,      -- SHA-256 hash
    UserID UNIQUEIDENTIFIER NOT NULL,       -- Key owner
    Label NVARCHAR(255) NOT NULL,
    Description NVARCHAR(1000) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    ExpiresAt DATETIMEOFFSET NULL,
    LastUsedAt DATETIMEOFFSET NULL,
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL
);

-- Current APIKeyScope junction
CREATE TABLE APIKeyScope (
    ID UNIQUEIDENTIFIER PRIMARY KEY,
    APIKeyID UNIQUEIDENTIFIER NOT NULL,
    ScopeID UNIQUEIDENTIFIER NOT NULL,
    UNIQUE(APIKeyID, ScopeID)
);

-- Current APIKeyUsageLog
CREATE TABLE APIKeyUsageLog (
    ID UNIQUEIDENTIFIER PRIMARY KEY,
    APIKeyID UNIQUEIDENTIFIER NOT NULL,
    Endpoint NVARCHAR(500) NOT NULL,
    Operation NVARCHAR(255) NULL,
    Method NVARCHAR(10) NOT NULL,
    StatusCode INT NOT NULL,
    ResponseTimeMs INT NULL,
    IPAddress NVARCHAR(45) NULL,
    UserAgent NVARCHAR(500) NULL
);
```

### What Works Today

| Component | Status | Description |
|-----------|--------|-------------|
| Key Generation | ✅ | `mj_sk_[64 hex]` format with SHA-256 hashing |
| Key Validation | ✅ | Format check, hash lookup, expiry, user status |
| Usage Logging | ✅ | Basic endpoint, method, IP, response time |
| Scope Assignment | ⚠️ | Junction table exists, scopes not enforced |
| Scope Enforcement | ❌ | No authorization layer checks scopes |

### Current Limitations

1. **No application binding**: Keys work with any application
2. **Flat scope structure**: No hierarchy or inheritance
3. **Exact match only**: Cannot use patterns like `entity:read:Users,Accounts`
4. **Scope explosion risk**: Would need thousands of scopes for MJAPI entities
5. **No deny rules**: Cannot explicitly block specific resources
6. **Limited audit detail**: No scope evaluation tracking

---

## Industry Comparison

### AWS IAM

**Strengths:**
- Powerful policy language with `Effect`, `Action`, `Resource`, `Condition`
- Wildcards in actions (`s3:Get*`) and resources (`arn:aws:s3:::bucket/*`)
- Explicit deny always wins over allow
- Condition keys for contextual access (time, IP, tags)

**Policy Structure:**
```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:ListBucket"],
  "Resource": ["arn:aws:s3:::my-bucket/*"],
  "Condition": {
    "IpAddress": {"aws:SourceIp": "192.168.1.0/24"}
  }
}
```

**Evaluation Logic:**
1. Explicit Deny → Access Denied
2. Explicit Allow → Access Allowed
3. Implicit Deny (no matching policy)

**Reference:** [AWS IAM Policy Elements](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html)

---

### Azure RBAC

**Strengths:**
- Four-level scope hierarchy: Management Group → Subscription → Resource Group → Resource
- Permission inheritance downward
- Separate `actions` vs `dataActions` (control plane vs data plane)
- Conditions for fine-grained access

**Role Definition Structure:**
```json
{
  "Name": "Custom Role",
  "Actions": ["Microsoft.Storage/storageAccounts/read"],
  "NotActions": ["Microsoft.Storage/storageAccounts/delete"],
  "DataActions": ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"],
  "NotDataActions": [],
  "AssignableScopes": ["/subscriptions/{subscription-id}"]
}
```

**Key Concepts:**
- `Actions` + `DataActions` = what's allowed
- `NotActions` + `NotDataActions` = exceptions from broader permissions
- Conditions evaluated after basic permission check

**Reference:** [Azure RBAC Role Definitions](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-definitions)

---

### Google Cloud IAM

**Strengths:**
- Granular permissions like `storage.objects.create`
- Roles bundle permissions (primitive, predefined, custom)
- IAM Conditions with CEL (Common Expression Language)
- Resource hierarchy with inheritance

**Condition Example:**
```
resource.name.startsWith("projects/_/buckets/my-bucket/objects/uploads/") &&
request.time < timestamp("2025-12-31T00:00:00Z")
```

**Reference:** [Google Cloud IAM Roles](https://docs.cloud.google.com/iam/docs/roles-overview)

---

### Salesforce OAuth

**Strengths:**
- OAuth scopes define API access levels
- Server and client must agree on scope contract
- Custom scopes for specific business needs
- Role-aligned connected apps

**Pattern:**
- Standard scopes: `api`, `refresh_token`, `web`, `full`
- Granular scopes: Read vs write permissions per object type
- Multiple connected apps with different scope sets per user role

**Reference:** [Salesforce OAuth Tokens and Scopes](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_tokens_scopes.htm)

---

### HubSpot Private Apps

**Strengths:**
- Granular scopes like `crm.objects.contacts.read`
- Migrated from API keys to scoped tokens (security improvement)
- Required vs optional scopes for app installation
- Account-tier aware permissions

**Key Lesson:**
> HubSpot deprecated root-access API keys in 2022 because a compromised key could access all data. Private apps with granular scopes limit blast radius.

**Pattern:**
- `crm.objects.{object}.read`
- `crm.objects.{object}.write`
- `automation.workflows.read`

**Reference:** [HubSpot API Scopes](https://developers.hubspot.com/docs/api/scopes)

---

### OAuth 2.0 Best Practices

**Key Principles:**

1. **Avoid scope explosion**: Start simple, add granularity when needed
2. **Use namespaces**: `resource:action` or `resource:action:target`
3. **Combine scopes with claims**: Scopes for entry-point, claims for fine-grained
4. **Always require scopes**: Never issue scopeless tokens
5. **Deny by default**: No matching scope = denied

**Recommended Pattern:**
- Coarse-grained for general access
- Fine-grained where precision matters
- Pattern matching to avoid exhaustive lists

**Reference:** [OAuth Scopes Best Practices (Curity)](https://curity.io/resources/learn/scope-best-practices/)

---

## Gap Analysis

| Requirement | AWS | Azure | GCP | Salesforce | HubSpot | **MJ Current** | **MJ Proposed** |
|-------------|-----|-------|-----|------------|---------|----------------|-----------------|
| Application binding | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| App scope ceiling | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Hierarchical scopes | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ✅ |
| Wildcards in resources | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Pattern matching | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Include/Exclude | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Explicit deny | ✅ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Conditions | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⏳ Future |
| Audit detail | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |

---

## Proposed Architecture

### Core Design Principles

1. **User permissions are the ceiling**: Scopes narrow, never expand
2. **Scopes are app-agnostic**: Reusable across applications
3. **Apps define their scope ceiling with patterns**: Each app declares which scopes + resource patterns it can use
4. **API keys optionally bound to apps**: NULL = works with all apps
5. **Two-level pattern evaluation**: App ceiling patterns checked first, then key patterns
6. **Deny trumps allow at both levels**: Any deny rule blocks access immediately
7. **Pattern-based resources**: Avoid scope explosion with wildcards

### Conceptual Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API KEY                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ UserID: user-123 (max permissions ceiling)                          │    │
│  │ Status: Active                                                      │    │
│  │ ExpiresAt: 2027-01-01                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│         ┌──────────────────────────┼──────────────────────────┐             │
│         ▼                          ▼                          ▼             │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐        │
│  │ Application │           │ Application │           │ Application │        │
│  │   MCP       │           │   MJAPI     │           │   Portal    │        │
│  │  (optional) │           │  (optional) │           │  (optional) │        │
│  └─────────────┘           └─────────────┘           └─────────────┘        │
│         │                          │                          │             │
│         ▼                          ▼                          ▼             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      SCOPE RULES (APIKeyScope)                       │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ Scope: entity:runview                                          │  │    │
│  │  │ Pattern: Users,Accounts,Products                               │  │    │
│  │  │ PatternType: Include | IsDeny: false                          │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ Scope: agent:execute                                           │  │    │
│  │  │ Pattern: Skip*                                                 │  │    │
│  │  │ PatternType: Include | IsDeny: false                          │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  │  ┌───────────────────────────────────────────────────────────────┐  │    │
│  │  │ Scope: entity:runview                                          │  │    │
│  │  │ Pattern: EmployeeSalaries,Credentials                          │  │    │
│  │  │ PatternType: Include | IsDeny: TRUE  ← BLOCKS ACCESS          │  │    │
│  │  └───────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Three-Tier Permission Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TIER 1: User Permissions (Ceiling)                        │
│                                                                              │
│   User's Role + RLS = Maximum possible access                               │
│   Example: User can access Accounts, Users, but NOT EmployeeSalaries        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              TIER 2: Application Ceiling (APIApplicationScope)               │
│                                                                              │
│   What scopes + resource patterns this APP can use                          │
│   NOW INCLUDES: ResourcePattern, PatternType, IsDeny, Priority              │
│                                                                              │
│   Example: MCP can use entity:runview for pattern "MJ:*,Users,Accounts"     │
│            MCP CANNOT use mutation scopes at all                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   TIER 3: API Key Scopes (APIKeyScope)                       │
│                                                                              │
│   What scopes + resource patterns THIS KEY is allowed                       │
│   INCLUDES: ResourcePattern, PatternType, IsDeny, Priority                  │
│                                                                              │
│   Example: Key can use entity:runview for "Users,Accounts" only             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EFFECTIVE PERMISSIONS                                │
│                                                                              │
│                    Intersection of all three tiers                          │
│                                                                              │
│   Final access = User CAN access AND App ALLOWS AND Key GRANTS              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Scope Hierarchy (App-Agnostic)

```
APIScope Tree (ParentID creates hierarchy):
│
├── entity
│   ├── runview     (ResourceType = 'Entity')
│   ├── create      (ResourceType = 'Entity')
│   ├── update      (ResourceType = 'Entity')
│   └── delete      (ResourceType = 'Entity')
│
├── agent
│   └── execute     (ResourceType = 'Agent')
│
├── query
│   └── run         (ResourceType = 'Query')
│
├── mutation
│   └── run         (ResourceType = 'Mutation')
│
└── admin
    ├── users
    │   ├── read
    │   └── manage
    └── keys
        └── manage
```

**Key Change**: Scopes are now **app-agnostic**. The `APIApplicationScope` junction table defines which scopes (with patterns) each application is allowed to use.

---

## Schema Design

### Entity Relationship Diagram

```
┌─────────────────────────┐              ┌─────────────────────────┐
│     APIApplication      │              │         User            │
├─────────────────────────┤              ├─────────────────────────┤
│ ID (PK)                 │              │ ID (PK)                 │
│ Name (UK)               │              │ Email                   │
│ Description             │              │ ...                     │
│ IsActive                │              └──────────┬──────────────┘
└──────────┬──────────────┘                         │
           │                                        │
           │ 1:M                                    │ 1:M
           ▼                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 APIKey                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ ID (PK)                                                                      │
│ Hash (UK)                                                                    │
│ UserID (FK) ──────────────────────────────────────────────► User             │
│ Label                                                                        │
│ Description                                                                  │
│ Status (Active/Revoked)                                                      │
│ ExpiresAt                                                                    │
│ LastUsedAt                                                                   │
│ CreatedByUserID (FK) ─────────────────────────────────────► User             │
└───────┬─────────────────────────────────────────────────┬────────────────────┘
        │                                                 │
        │ 1:M                                             │ 1:M
        ▼                                                 ▼
┌───────────────────────────┐               ┌─────────────────────────────────┐
│   APIKeyApplication       │               │         APIKeyScope             │
├───────────────────────────┤               ├─────────────────────────────────┤
│ ID (PK)                   │               │ ID (PK)                         │
│ APIKeyID (FK)             │               │ APIKeyID (FK)                   │
│ ApplicationID (FK)        │               │ ScopeID (FK)                    │
└───────────────────────────┘               │ ResourcePattern                 │
                                            │ PatternType (Include/Exclude)   │
                                            │ IsDeny                          │
                                            │ Priority                        │
                                            └─────────────┬───────────────────┘
                                                          │
           ┌──────────────────────────────────────────────┘
           │ M:1
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APIScope                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ID (PK)                                                                      │
│ ParentID (FK, self-reference) ← Creates hierarchy                           │
│ Name                                                                         │
│ FullPath (UK) (e.g., 'entity:runview')                                      │
│ Category                                                                     │
│ ResourceType ('Entity', 'Agent', 'Query', 'Mutation', NULL)                 │
│ Description                                                                  │
│ IsActive                                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
           ▲
           │ M:1
           │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         APIApplicationScope                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ID (PK)                                                                      │
│ ApplicationID (FK)                                                           │
│ ScopeID (FK)                                                                 │
│ ResourcePattern          ← NEW: Pattern matching at app level               │
│ PatternType (Include/Exclude) ← NEW                                         │
│ IsDeny                   ← NEW: Deny rules at app level                     │
│ Priority                 ← NEW: Rule ordering                               │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                           APIKeyUsageLog                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ ID (PK)                                                                      │
│ APIKeyID (FK)                                                                │
│ ApplicationID (FK)                                                           │
│ Endpoint                                                                     │
│ Operation                                                                    │
│ Method                                                                       │
│ StatusCode                                                                   │
│ ResponseTimeMs                                                               │
│ IPAddress                                                                    │
│ UserAgent                                                                    │
│ RequestedResource        ← What they tried to access                        │
│ ScopesEvaluated (JSON)   ← Detailed evaluation log                          │
│ AuthorizationResult      ← Allowed/Denied/NoScopesRequired                  │
│ DeniedReason             ← Why access was denied                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### New Tables

```sql
-- =============================================================================
-- API APPLICATIONS - Register consuming applications
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.APIApplication (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL UNIQUE,        -- 'MJAPI', 'MCPServer', 'Portal', 'CLI'
    Description NVARCHAR(500) NULL,
    IsActive BIT NOT NULL DEFAULT 1
);

-- =============================================================================
-- API SCOPES - Hierarchical permission tree (APP-AGNOSTIC)
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.APIScope ADD
    ParentID UNIQUEIDENTIFIER NULL
        REFERENCES ${flyway:defaultSchema}.APIScope(ID),
    FullPath NVARCHAR(MAX) NOT NULL,           -- e.g., 'entity:runview'
    ResourceType NVARCHAR(50) NULL,            -- 'Entity', 'Agent', 'Query', 'Mutation', NULL
    IsActive BIT NOT NULL DEFAULT 1;

-- Add unique constraint for hierarchy
ALTER TABLE ${flyway:defaultSchema}.APIScope
    ADD CONSTRAINT UQ_APIScope_ParentName UNIQUE (ParentID, Name);

-- =============================================================================
-- API APPLICATION SCOPES - Which scopes each app CAN use (app's ceiling)
-- NOW WITH PATTERN MATCHING - same structure as APIKeyScope
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.APIApplicationScope (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ApplicationID UNIQUEIDENTIFIER NOT NULL
        REFERENCES ${flyway:defaultSchema}.APIApplication(ID) ON DELETE CASCADE,
    ScopeID UNIQUEIDENTIFIER NOT NULL
        REFERENCES ${flyway:defaultSchema}.APIScope(ID),

    -- Pattern matching for resources under this scope
    ResourcePattern NVARCHAR(1000) NULL,       -- 'Users,Accounts' or 'Skip*' or '*'
    PatternType NVARCHAR(20) NOT NULL DEFAULT 'Include'
        CHECK (PatternType IN ('Include', 'Exclude')),

    -- Deny trumps all - if set, this rule BLOCKS access
    IsDeny BIT NOT NULL DEFAULT 0,

    -- For ordering/priority when multiple rules match
    Priority INT NOT NULL DEFAULT 0,           -- Higher = evaluated first

    CONSTRAINT UQ_APIApplicationScope UNIQUE (ApplicationID, ScopeID, ResourcePattern)
);

-- =============================================================================
-- API KEY APPLICATIONS - Which apps can use this key (optional binding)
-- If no records exist for an API key, key works with ALL apps
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.APIKeyApplication (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    APIKeyID UNIQUEIDENTIFIER NOT NULL
        REFERENCES ${flyway:defaultSchema}.APIKey(ID) ON DELETE CASCADE,
    ApplicationID UNIQUEIDENTIFIER NOT NULL
        REFERENCES ${flyway:defaultSchema}.APIApplication(ID),
    CONSTRAINT UQ_APIKeyApplication UNIQUE (APIKeyID, ApplicationID)
);

-- =============================================================================
-- API KEY SCOPES - Junction with pattern rules (ENHANCED)
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.APIKeyScope ADD
    -- Pattern matching for resources under this scope
    ResourcePattern NVARCHAR(1000) NULL,       -- 'Users,Accounts' or 'Skip*' or '*'
    PatternType NVARCHAR(20) NOT NULL DEFAULT 'Include'
        CHECK (PatternType IN ('Include', 'Exclude')),

    -- Deny trumps all - if set, this rule BLOCKS access
    IsDeny BIT NOT NULL DEFAULT 0,

    -- For ordering/priority when multiple rules match
    Priority INT NOT NULL DEFAULT 0;           -- Higher = evaluated first

-- Update unique constraint to include pattern
ALTER TABLE ${flyway:defaultSchema}.APIKeyScope
    DROP CONSTRAINT UQ_APIKeyScope;
ALTER TABLE ${flyway:defaultSchema}.APIKeyScope
    ADD CONSTRAINT UQ_APIKeyScope UNIQUE (APIKeyID, ScopeID, ResourcePattern);

-- =============================================================================
-- API KEY USAGE LOG - Enhanced with scope details
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.APIKeyUsageLog ADD
    ApplicationID UNIQUEIDENTIFIER NULL
        REFERENCES ${flyway:defaultSchema}.APIApplication(ID),
    RequestedResource NVARCHAR(500) NULL,      -- What they tried to access
    ScopesEvaluated NVARCHAR(MAX) NULL,        -- JSON array of evaluation details
    AuthorizationResult NVARCHAR(20) NOT NULL DEFAULT 'Allowed'
        CHECK (AuthorizationResult IN ('Allowed', 'Denied', 'NoScopesRequired')),
    DeniedReason NVARCHAR(500) NULL;           -- Why access was denied
```

---

## Evaluation Algorithm

### Flow Diagram

```
                    Request: {apiKey, appId, scopePath, resource}
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │     1. VALIDATE API KEY               │
                    │     (format, hash, expiry, user)      │
                    └───────────────────┬───────────────────┘
                                        │
                              ┌─────────┴─────────┐
                              │     Valid?        │
                              └─────────┬─────────┘
                                   No ──┤ Yes
                                   │    ▼
                                   │   ┌───────────────────────────────────────┐
                                   │   │     2. CHECK APP BINDING              │
                                   │   │     (Key has app restrictions?)       │
                                   │   └───────────────────┬───────────────────┘
                                   │                       │
                                   │             ┌─────────┴─────────┐
                                   │             │ No restrictions   │ Has restrictions
                                   │             └─────────┬─────────┘─────────────┐
                                   │                       │                       │
                                   │                       │               ┌───────┴───────┐
                                   │                       │               │ Key bound to  │
                                   │                       │               │ this app?     │
                                   │                       │               └───────┬───────┘
                                   │                       │                  No ──┤ Yes
                                   │                       │                  │    │
                                   │                       ▼                  │    ▼
                                   │   ┌───────────────────────────────────────────────────┐
                                   │   │     3. EVALUATE APP CEILING (APIApplicationScope) │
                                   │   │     Load app's scope rules, check pattern match   │
                                   │   │     (ordered by Priority DESC, IsDeny DESC)       │
                                   │   └───────────────────┬───────────────────────────────┘
                                   │                       │
                                   │             ┌─────────┴─────────┐
                                   │             │ App deny match?   │
                                   │             └─────────┬─────────┘
                                   │                Yes ───┤ No
                                   │                │      ▼
                                   │                │    ┌─────────┴─────────┐
                                   │                │    │ App allow match?  │
                                   │                │    └─────────┬─────────┘
                                   │                │         No ──┤ Yes
                                   │                │         │    ▼
                                   │                │         │   ┌───────────────────────────────────────┐
                                   │                │         │   │     4. EVALUATE KEY SCOPES (APIKeyScope) │
                                   │                │         │   │     Load key's scope rules, check pattern │
                                   │                │         │   │     (ordered by Priority DESC, IsDeny DESC)│
                                   │                │         │   └───────────────────┬───────────────────────┘
                                   │                │         │                       │
                                   │                │         │             ┌─────────┴─────────┐
                                   │                │         │             │ Key deny match?   │
                                   │                │         │             └─────────┬─────────┘
                                   │                │         │                Yes ───┤ No
                                   │                │         │                │      ▼
                                   │                │         │                │    ┌─────────┴─────────┐
                                   │                │         │                │    │ Key allow match?  │
                                   │                │         │                │    └─────────┬─────────┘
                                   │                │         │                │         No ──┤ Yes
                                   │                │         │                │         │    │
                                   ▼                ▼         ▼                ▼         ▼    ▼
                    ┌────────────────────────────────────────────────────┐    ┌─────────────────┐
                    │                    DENIED                          │    │     ALLOWED     │
                    │                 (Log reason)                       │    └─────────────────┘
                    └────────────────────────────────────────────────────┘
```

### Pseudocode

```typescript
interface AuthorizationRequest {
    apiKeyId: string;
    applicationId: string;
    scopePath: string;      // e.g., 'entity:runview'
    resource: string;       // e.g., 'Users'
}

interface AuthorizationResult {
    allowed: boolean;
    reason: string;
    matchedAppRule?: APIApplicationScope;
    matchedKeyRule?: APIKeyScope;
    evaluatedRules: EvaluatedRule[];
}

function evaluateAccess(request: AuthorizationRequest): AuthorizationResult {
    const evaluatedRules: EvaluatedRule[] = [];

    // 1. Check if API key is bound to specific apps
    const keyApps = loadKeyApplications(request.apiKeyId);

    if (keyApps.length > 0) {
        // Key has app restrictions - check if this app is allowed
        if (!keyApps.includes(request.applicationId)) {
            return {
                allowed: false,
                reason: 'API key not authorized for this application',
                evaluatedRules: []
            };
        }
    }
    // If keyApps is empty, key works with all apps

    // 2. Evaluate application scope ceiling (with pattern matching)
    const appResult = evaluateAppCeiling(
        request.applicationId,
        request.scopePath,
        request.resource
    );
    evaluatedRules.push(...appResult.evaluatedRules);

    if (!appResult.allowed) {
        return {
            allowed: false,
            reason: appResult.reason,
            matchedAppRule: appResult.matchedRule,
            evaluatedRules
        };
    }

    // 3. Evaluate API key scope rules (with pattern matching)
    const keyResult = evaluateKeyScopes(
        request.apiKeyId,
        request.scopePath,
        request.resource
    );
    evaluatedRules.push(...keyResult.evaluatedRules);

    return {
        allowed: keyResult.allowed,
        reason: keyResult.reason,
        matchedAppRule: appResult.matchedRule,
        matchedKeyRule: keyResult.matchedRule,
        evaluatedRules
    };
}

function evaluateAppCeiling(
    applicationId: string,
    scopePath: string,
    resource: string
): EvaluationResult {
    // Load app's scope rules, ordered by Priority DESC, IsDeny DESC
    const rules = loadApplicationScopeRules(applicationId, scopePath);

    for (const rule of rules) {
        const matchResult = evaluateRule(rule, resource);

        if (matchResult.matched) {
            if (rule.IsDeny) {
                return {
                    allowed: false,
                    reason: `Application denies access: ${rule.ID}`,
                    matchedRule: rule,
                    evaluatedRules: [matchResult]
                };
            }

            // First matching allow rule wins
            return {
                allowed: true,
                reason: 'Application allows access',
                matchedRule: rule,
                evaluatedRules: [matchResult]
            };
        }
    }

    // No matching rules at app level = app doesn't support this scope/resource
    return {
        allowed: false,
        reason: 'Application does not allow this scope/resource combination',
        evaluatedRules: []
    };
}

function evaluateKeyScopes(
    apiKeyId: string,
    scopePath: string,
    resource: string
): EvaluationResult {
    // Load key's scope rules, ordered by Priority DESC, IsDeny DESC
    const rules = loadKeyScopeRules(apiKeyId, scopePath);

    for (const rule of rules) {
        const matchResult = evaluateRule(rule, resource);

        if (matchResult.matched) {
            if (rule.IsDeny) {
                return {
                    allowed: false,
                    reason: `Denied by key rule: ${rule.ID}`,
                    matchedRule: rule,
                    evaluatedRules: [matchResult]
                };
            }

            // First matching allow rule wins
            return {
                allowed: true,
                reason: 'Matched key allow rule',
                matchedRule: rule,
                evaluatedRules: [matchResult]
            };
        }
    }

    // No matching rules = denied (explicit grant required)
    return {
        allowed: false,
        reason: 'No matching key scope rules',
        evaluatedRules: []
    };
}

function evaluateRule(rule: ScopeRule, resource: string): EvaluatedRule {
    // Handle NULL pattern as wildcard (match all)
    if (!rule.ResourcePattern) {
        return { rule, matched: true, patternMatched: '*' };
    }

    // Handle comma-separated list
    const patterns = rule.ResourcePattern.split(',').map(p => p.trim());

    // Check if resource matches any pattern
    for (const pattern of patterns) {
        if (globMatch(resource, pattern)) {
            const matched = rule.PatternType === 'Include';
            return { rule, matched, patternMatched: pattern };
        }
    }

    // No pattern matched
    const matched = rule.PatternType === 'Exclude';
    return { rule, matched, patternMatched: null };
}

function globMatch(value: string, pattern: string): boolean {
    if (pattern === '*') return true;

    // Convert glob pattern to regex
    // * = any characters, ? = single character
    const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
        .replace(/\*/g, '.*')                   // * -> .*
        .replace(/\?/g, '.');                   // ? -> .

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(value);
}
```

### Evaluation Order

Rules are evaluated in the following order at **each level** (app and key):
1. **Priority DESC**: Higher priority rules evaluated first
2. **IsDeny DESC**: Within same priority, deny rules before allow rules
3. **Specificity**: More specific patterns implicitly have higher priority

---

## Implementation Components

### Package Structure

```
packages/
└── APIKeys/                              # NEW PACKAGE
    ├── src/
    │   ├── index.ts                      # Public exports
    │   ├── APIKeyEngine.ts               # Main orchestrator
    │   ├── ScopeEvaluator.ts             # Pattern matching, rule evaluation
    │   │   ├── evaluateAppCeiling()      # App-level pattern check
    │   │   └── evaluateKeyScopes()       # Key-level pattern check
    │   ├── ApplicationRegistry.ts        # App registration/validation
    │   ├── UsageLogger.ts                # Enhanced audit logging
    │   ├── PatternMatcher.ts             # Glob pattern matching
    │   └── interfaces.ts                 # Types and interfaces
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `APIKeyEngine` | Main entry point, coordinates validation and evaluation |
| `ScopeEvaluator` | Two-level evaluation: app ceiling patterns, then key scope patterns |
| `ApplicationRegistry` | Validates app registration, loads app scope ceiling rules |
| `UsageLogger` | Enhanced logging with both app and key evaluation details |
| `PatternMatcher` | Glob/wildcard pattern matching engine (shared by both levels) |

### Integration Points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MJAPI                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  getUserPayload()                                                    │    │
│  │       │                                                              │    │
│  │       ▼                                                              │    │
│  │  EncryptionEngine.ValidateAPIKey()                                   │    │
│  │       │                                                              │    │
│  │       ▼                                                              │    │
│  │  APIKeyEngine.evaluateAccess(appId='MJAPI', scope, resource)        │    │
│  │       │                                                              │    │
│  │       ├── Check app ceiling (APIApplicationScope patterns)          │    │
│  │       └── Check key scopes (APIKeyScope patterns)                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           MCP Server                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Tool Handler                                                        │    │
│  │       │                                                              │    │
│  │       ▼                                                              │    │
│  │  APIKeyEngine.evaluateAccess(appId='MCPServer', scope, resource)    │    │
│  │       │                                                              │    │
│  │       ├── Check app ceiling (MCPServer can't use mutation scopes)   │    │
│  │       └── Check key scopes (what this specific key allows)          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Example Use Cases

### Use Case 1: MCP Key - One Agent, Five Entities

**Scenario**: Integration needs to run only the "SkipAnalysisAgent" and read from 5 specific entities.

```sql
-- 1. Create API Key (existing flow)
-- Key is created with UserID = integration-user

-- 2. Bind to MCP Server application (optional - restricts key to MCP only)
INSERT INTO APIKeyApplication (APIKeyID, ApplicationID)
VALUES (@keyId, @mcpAppId);

-- 3. Grant agent execution for ONE specific agent
INSERT INTO APIKeyScope (APIKeyID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority)
VALUES (@keyId, @scope_agent_execute, 'SkipAnalysisAgent', 'Include', 0, 0);

-- 4. Grant entity read for 5 specific entities
INSERT INTO APIKeyScope (APIKeyID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority)
VALUES (@keyId, @scope_entity_runview, 'Users,Accounts,Products,Orders,Invoices', 'Include', 0, 0);
```

**Evaluation Example**:
```
Request: entity:runview, 'Users'
  → App ceiling check: MCP allows entity:runview for '*' → PASS
  → Key scope check: 'Users' matches 'Users,Accounts,...' → ALLOWED

Request: entity:runview, 'Employees'
  → App ceiling check: MCP allows entity:runview for '*' → PASS
  → Key scope check: 'Employees' doesn't match pattern → DENIED

Request: agent:execute, 'SkipAnalysisAgent'
  → App ceiling check: MCP allows agent:execute for '*' → PASS
  → Key scope check: matches 'SkipAnalysisAgent' → ALLOWED

Request: agent:execute, 'DifferentAgent'
  → App ceiling check: MCP allows agent:execute for '*' → PASS
  → Key scope check: no matching rule → DENIED
```

### Use Case 2: MJAPI Key - Queries Starting with J, Ending with X

**Scenario**: Report generator needs access to specific query patterns.

```sql
-- 1. Bind to MJAPI application
INSERT INTO APIKeyApplication (APIKeyID, ApplicationID)
VALUES (@keyId, @mjapiAppId);

-- 2. Grant query access with pattern
INSERT INTO APIKeyScope (APIKeyID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority)
VALUES (@keyId, @scope_query_run, 'J*X', 'Include', 0, 0);
```

**Evaluation Example**:
```
Request: query:run, 'GetJanuaryReportDataX' → ALLOWED (J...X pattern)
Request: query:run, 'JobStatusX' → ALLOWED (J...X pattern)
Request: query:run, 'GetAllUsers' → DENIED (doesn't match J*X)
```

### Use Case 3: Full Access EXCEPT Sensitive Entities

**Scenario**: Developer key with broad access but explicit blocks on sensitive data.

```sql
-- 1. No app binding = works with all apps

-- 2. Grant full entity access (lower priority)
INSERT INTO APIKeyScope (APIKeyID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority)
VALUES (@keyId, @scope_entity_runview, '*', 'Include', 0, 0);

-- 3. DENY sensitive entities (higher priority, IsDeny = 1)
INSERT INTO APIKeyScope (APIKeyID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority)
VALUES (@keyId, @scope_entity_runview, 'EmployeeSalaries,AuditLogs,Credentials,APIKeys', 'Include', 1, 100);
```

**Evaluation Example**:
```
Request: entity:runview, 'Users' → ALLOWED (matches * pattern)
Request: entity:runview, 'EmployeeSalaries' → DENIED (deny rule matches first)
Request: entity:runview, 'APIKeys' → DENIED (deny rule matches first)
```

### Use Case 4: Multi-Application Key (No App Binding)

**Scenario**: CI/CD pipeline needs access to both MJAPI and MCP without explicit binding.

```sql
-- 1. No APIKeyApplication records = key works with all apps

-- 2. Grant mutation access (used by MJAPI)
INSERT INTO APIKeyScope (APIKeyID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority)
VALUES (@keyId, @scope_mutation_run, 'Create*,Update*', 'Include', 0, 0);

-- 3. Grant entity access (used by MCP)
INSERT INTO APIKeyScope (APIKeyID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority)
VALUES (@keyId, @scope_entity_runview, '*', 'Include', 0, 0);
```

### Use Case 5: Application Scope Ceiling with Patterns

**Scenario**: MCP Server should only allow entity access for MJ core entities and specific business entities.

```sql
-- Define MCP Server's scope ceiling WITH PATTERNS
-- MCP can use entity:runview, but only for specific entity patterns
INSERT INTO APIApplicationScope (ApplicationID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority) VALUES
    -- Allow all MJ: prefixed entities
    (@mcpAppId, @scope_entity_runview, 'MJ: *', 'Include', 0, 0),
    -- Allow specific business entities
    (@mcpAppId, @scope_entity_runview, 'Users,Accounts,Products,Orders', 'Include', 0, 0),
    -- DENY sensitive entities at app level (even if key grants access)
    (@mcpAppId, @scope_entity_runview, 'EmployeeSalaries,Credentials,APIKeys', 'Include', 1, 100);

-- MCP can run agents, but only Skip* agents
INSERT INTO APIApplicationScope (ApplicationID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority) VALUES
    (@mcpAppId, @scope_agent_execute, 'Skip*', 'Include', 0, 0);

-- MCP CANNOT use mutation scopes at all (no records = not allowed)
```

**Evaluation Example**:
```
Request via MCP: entity:runview, 'Users'
  → App ceiling: 'Users' matches 'Users,Accounts,...' → PASS
  → Key scope check: (depends on key rules)

Request via MCP: entity:runview, 'EmployeeSalaries'
  → App ceiling: DENIED by app-level deny rule (Priority 100)
  → Key scope check: NEVER REACHED - blocked at app level

Request via MCP: mutation:run, 'CreateUser'
  → App ceiling: MCP has no rules for mutation scope → DENIED
  → Key scope check: NEVER REACHED - app doesn't support mutation

Request via MCP: agent:execute, 'SkipAnalysisAgent'
  → App ceiling: 'SkipAnalysisAgent' matches 'Skip*' → PASS
  → Key scope check: (depends on key rules)

Request via MCP: agent:execute, 'DangerousAgent'
  → App ceiling: 'DangerousAgent' doesn't match 'Skip*' → DENIED
  → Key scope check: NEVER REACHED - blocked at app level
```

---

## Enhanced Usage Logging

### Log Entry Structure

```typescript
interface APIKeyUsageLogEntry {
    ID: string;
    APIKeyID: string;
    ApplicationID: string;
    Endpoint: string;
    Operation: string;
    Method: string;
    StatusCode: number;
    ResponseTimeMs: number;
    IPAddress: string;
    UserAgent: string;

    // NEW FIELDS
    RequestedResource: string;
    ScopesEvaluated: ScopeEvaluation[];      // Both app and key evaluations
    AuthorizationResult: 'Allowed' | 'Denied' | 'NoScopesRequired';
    DeniedReason: string | null;
}

interface ScopeEvaluation {
    level: 'application' | 'key';            // Which level was evaluated
    scopeId: string;
    scopePath: string;
    pattern: string;
    patternType: 'Include' | 'Exclude';
    isDeny: boolean;
    matched: boolean;
    result: 'Allowed' | 'Denied' | 'NoMatch';
}
```

### Example Log Entry

```json
{
    "ID": "log-uuid-123",
    "APIKeyID": "key-uuid-456",
    "ApplicationID": "mcp-server-id",
    "Endpoint": "/mcp/tools/call",
    "Operation": "RunAgent",
    "Method": "POST",
    "StatusCode": 200,
    "ResponseTimeMs": 1234,
    "IPAddress": "192.168.1.100",
    "UserAgent": "claude-desktop/1.0",
    "RequestedResource": "SkipAnalysisAgent",
    "ScopesEvaluated": [
        {
            "level": "application",
            "scopeId": "scope-agent-execute",
            "scopePath": "agent:execute",
            "pattern": "Skip*",
            "patternType": "Include",
            "isDeny": false,
            "matched": true,
            "result": "Allowed"
        },
        {
            "level": "key",
            "scopeId": "scope-agent-execute",
            "scopePath": "agent:execute",
            "pattern": "SkipAnalysisAgent",
            "patternType": "Include",
            "isDeny": false,
            "matched": true,
            "result": "Allowed"
        }
    ],
    "AuthorizationResult": "Allowed",
    "DeniedReason": null
}
```

---

## Migration Strategy

### Phase 1: Schema Enhancement (Non-Breaking)

1. Add new columns to existing tables with defaults
2. Create new tables (APIApplication, APIApplicationScope, APIKeyApplication)
3. No enforcement yet - existing keys continue to work

```sql
-- Add columns with NULL/defaults so existing data works
ALTER TABLE APIScope ADD
    ParentID UNIQUEIDENTIFIER NULL,
    FullPath NVARCHAR(MAX) NULL,
    ResourceType NVARCHAR(50) NULL,
    IsActive BIT NOT NULL DEFAULT 1;

-- Backfill FullPath from Name for existing scopes
UPDATE APIScope SET FullPath = Name WHERE FullPath IS NULL;
ALTER TABLE APIScope ALTER COLUMN FullPath NVARCHAR(MAX) NOT NULL;
```

### Phase 2: Seed Data

1. Create standard APIApplication records
2. Build scope hierarchy (app-agnostic)
3. Define each app's scope ceiling with patterns via APIApplicationScope
4. Migrate existing flat scopes to hierarchical structure

```sql
-- Seed applications
INSERT INTO APIApplication (ID, Name, Description, IsActive) VALUES
    (NEWID(), 'MJAPI', 'MemberJunction GraphQL API', 1),
    (NEWID(), 'MCPServer', 'Model Context Protocol Server', 1),
    (NEWID(), 'Portal', 'Web Portal Application', 1);

-- Build scope hierarchy (app-agnostic)
INSERT INTO APIScope (ID, ParentID, Name, FullPath, ResourceType) VALUES
    (@scope_entity, NULL, 'entity', 'entity', NULL),
    (@scope_entity_runview, @scope_entity, 'runview', 'entity:runview', 'Entity'),
    (@scope_entity_create, @scope_entity, 'create', 'entity:create', 'Entity'),
    (@scope_agent, NULL, 'agent', 'agent', NULL),
    (@scope_agent_execute, @scope_agent, 'execute', 'agent:execute', 'Agent');

-- Define app scope ceilings WITH PATTERNS
INSERT INTO APIApplicationScope (ApplicationID, ScopeID, ResourcePattern, PatternType, IsDeny, Priority) VALUES
    -- MCP: all entity operations, all agents
    (@mcpAppId, @scope_entity_runview, '*', 'Include', 0, 0),
    (@mcpAppId, @scope_agent_execute, '*', 'Include', 0, 0),
    -- MJAPI: all operations
    (@mjapiAppId, @scope_entity_runview, '*', 'Include', 0, 0),
    (@mjapiAppId, @scope_mutation_run, '*', 'Include', 0, 0);
```

### Phase 3: Package Implementation

1. Create `@memberjunction/api-keys` package
2. Implement two-level ScopeEvaluator (app ceiling + key scopes)
3. Add integration points in MJAPI and MCP Server
4. Enable enforcement with feature flag

### Phase 4: Enforcement Rollout

1. **Soft Mode**: Log violations but don't block
2. **Warning Mode**: Log warnings, prepare users
3. **Enforcement Mode**: Block unauthorized requests

---

## Open Questions

### 1. Default Behavior for Keys Without Applications

**Question**: If an API key has NO records in APIKeyApplication, should it work with:
- **ALL apps** (most flexible) ← **Recommended**
- **NO apps** (explicit grant required)

**Recommendation**: ALL apps. This is backward compatible and provides flexibility. Keys can be restricted to specific apps by adding APIKeyApplication records.

---

### 2. Default Behavior for Keys Without Scopes

**Question**: If an API key has NO scopes assigned, should it have:
- **Full access** (backward compatibility, limited by user permissions and app ceiling)
- **No access** (explicit grant required)

**Recommendation**: Full access during migration, configurable per-deployment after.

---

### 3. Scope Inheritance

**Question**: If granted `entity:*`, does that imply:
- `entity:runview`
- `entity:create`
- `entity:update`
- `entity:delete`

**Recommendation**: Yes, wildcards cascade. `entity:*` includes all entity operations.

---

### 4. FullPath Computation

**Question**: Should `APIScope.FullPath` be:
- **Computed column** (auto-maintained)
- **Trigger-maintained** (on insert/update)
- **Application-maintained** (set by code)

**Recommendation**: Trigger-maintained for data integrity.

---

### 5. Pattern Syntax

**Question**: Which pattern syntax to support:
- **Glob only**: `*`, `?` (simpler, covers most cases)
- **Regex**: Full regex power (complex, potential security issues)
- **Both**: Flag to indicate pattern type

**Recommendation**: Glob only for initial release. Regex adds complexity and ReDoS risk.

---

## Summary

This design provides MemberJunction with an enterprise-grade API authorization system that:

1. **Matches industry standards**: Aligns with AWS IAM, Azure RBAC, and OAuth best practices
2. **Avoids scope explosion**: Pattern matching eliminates need for thousands of entity-specific scopes
3. **Maintains security**: User permissions remain the ceiling, deny rules trump allow
4. **Scopes are reusable**: App-agnostic scopes shared across applications
5. **Two-level pattern matching**: App ceiling patterns AND key scope patterns
6. **Apps have pattern-based ceilings**: Each app defines which scopes + resource patterns it can use
7. **Flexible key binding**: Keys work with all apps by default, optionally restricted
8. **Provides audit trail**: Detailed two-level scope evaluation logging for compliance and debugging

The phased migration approach ensures backward compatibility while enabling organizations to adopt enhanced authorization controls at their own pace.

---

## References

### Cloud Provider Documentation
- [AWS IAM Policy Elements](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html)
- [AWS IAM Policy Evaluation Logic](https://builder.aws.com/content/2d1bIioM3UgQZqyaYquu3kTaWAg/comprehensive-guide-of-aws-iam-policy-evaluation-logic)
- [Azure RBAC Overview](https://learn.microsoft.com/en-us/azure/role-based-access-control/overview)
- [Azure Role Definitions](https://learn.microsoft.com/en-us/azure/role-based-access-control/role-definitions)
- [Google Cloud IAM Roles](https://docs.cloud.google.com/iam/docs/roles-overview)

### OAuth and API Best Practices
- [OAuth Scopes Best Practices (Curity)](https://curity.io/resources/learn/scope-best-practices/)
- [OAuth 2.0 Access Tokens and Least Privilege (Auth0)](https://auth0.com/blog/oauth2-access-tokens-and-principle-of-least-privilege/)
- [HubSpot API Scopes](https://developers.hubspot.com/docs/api/scopes)
- [Salesforce OAuth Tokens and Scopes](https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_tokens_scopes.htm)

### MemberJunction Documentation
- [API Keys for MJAPI Plan](./api-keys-for-mjapi.md)
- [Encryption Package](../packages/Encryption/README.md)
- [Credentials Package](../packages/Credentials/Engine/README.md)

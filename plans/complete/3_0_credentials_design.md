# MemberJunction 3.0: Unified Credential Management System

> **Status**: Draft v2 (Simplified)
> **Last Updated**: December 25, 2024
> **Target Release**: MemberJunction 3.0

## Overview

This document outlines the design for a unified, metadata-driven credential management system for MemberJunction 3.0. The system leverages the new field-level encryption infrastructure to provide secure, centralized credential storage with audit logging and per-request credential selection across all MJ subsystems.

## Design Philosophy

This design follows MemberJunction's core principle of keeping the framework lean while enabling extensibility. Rather than building a complex 6-entity hierarchy, we provide:

1. **3 core entities** for credential management (CredentialType, CredentialCategory, Credential)
2. **Leverage existing infrastructure** (AuditLog for access tracking, field-level encryption for security)
3. **Extensibility points** for SaaS/multi-tenant implementations (users add their own tenant join tables)

## Problem Statement

Currently, MJ has **50+ different credential patterns** spread across multiple subsystems:

| Subsystem | Count | Current Pattern |
|-----------|-------|-----------------|
| AI Providers | 15+ | `AI_VENDOR_API_KEY__*` env vars |
| Communication Providers | 4 | Mixed (API keys, OAuth2, service accounts) |
| Storage Providers | 7 | Mixed (access keys, OAuth2, service accounts) |
| Authentication Providers | 5 | OAuth2/OIDC client credentials |
| Database | 1 | Connection credentials |
| Integrations | Various | API keys |

### Key Issues with Current Approach

1. **No encryption** - All credentials stored as plaintext in environment variables
2. **No multi-tenancy** - One set of credentials per deployment
3. **No audit trail** - No tracking of credential usage
4. **No rotation support** - Changing credentials requires deployment
5. **No per-request override** - Can't use different credentials per API call
6. **No centralized management** - Each subsystem handles credentials differently
7. **No validation** - Credentials not validated until first use (often fails silently)

## Proposed Solution

A streamlined, metadata-driven credential management system that:

1. Uses MJ's new field-level encryption for credential values
2. Stores credential type definitions with JSON Schema for flexibility
3. Provides hierarchical categorization for organization
4. Leverages existing AuditLog for access tracking
5. Enables per-request credential selection via CredentialID parameters
6. Falls back to environment variables for backward compatibility

---

## Data Model

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CREDENTIAL ENTITIES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐                                                    │
│  │ CredentialCategory  │◄─────────┐                                         │
│  ├─────────────────────┤          │ (self-referential hierarchy)            │
│  │ ID                  │──────────┘                                         │
│  │ Name                │                                                    │
│  │ Description         │       ┌─────────────────────┐                      │
│  │ ParentID            │       │ CredentialType      │                      │
│  │ IconClass           │       ├─────────────────────┤                      │
│  └─────────────────────┘       │ ID                  │                      │
│           ▲                    │ Name                │                      │
│           │                    │ Description         │                      │
│           │                    │ Category            │                      │
│           │                    │ FieldSchema (JSON)  │                      │
│           │                    │ IconClass           │                      │
│           │                    │ ValidationEndpoint  │                      │
│           │                    └─────────────────────┘                      │
│           │                             ▲                                   │
│           │                             │                                   │
│  ┌────────┴─────────────────────────────┴───────────────────────────┐       │
│  │ Credential                                                        │       │
│  ├───────────────────────────────────────────────────────────────────┤       │
│  │ ID                                                                │       │
│  │ CredentialTypeID ──────────────────────────────────────────────►  │       │
│  │ CategoryID ────────────────────────────────────────────────────►  │       │
│  │ Name                                                              │       │
│  │ Description                                                       │       │
│  │ Values (ENCRYPTED JSON blob)                                      │       │
│  │ IsDefault                                                         │       │
│  │ IsActive                                                          │       │
│  │ ExpiresAt                                                         │       │
│  │ LastValidatedAt                                                   │       │
│  │ LastUsedAt                                                        │       │
│  │ IconClass                                                         │       │
│  └───────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐       │
│  │ EXISTING: AuditLog + AuditLogType                                 │       │
│  │ Used for credential access logging via CredentialEngine wrapper   │       │
│  └───────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Entity Definitions

#### CredentialCategory

Hierarchical organization for credentials.

```sql
CREATE TABLE [__mj].[CredentialCategory] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX),
    ParentID UNIQUEIDENTIFIER REFERENCES [__mj].[CredentialCategory](ID),
    IconClass NVARCHAR(100)               -- Font Awesome class, e.g., 'fa-solid fa-folder'
    -- Note: __mj_CreatedAt/__mj_UpdatedAt and FK indexes added automatically by CodeGen
);

-- Example hierarchy:
-- ├── AI Services (fa-solid fa-brain)
-- │   ├── Language Models
-- │   └── Embedding Models
-- ├── Communication (fa-solid fa-envelope)
-- │   ├── Email
-- │   └── SMS/WhatsApp
-- └── Storage (fa-solid fa-cloud)
--     ├── Cloud Storage
--     └── Databases
```

#### CredentialType

Defines a category of credentials (e.g., "SendGrid API", "OpenAI"). Uses JSON Schema for field definitions instead of a separate CredentialTypeField table.

```sql
CREATE TABLE [__mj].[CredentialType] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(MAX),
    Category NVARCHAR(50) NOT NULL,       -- 'AI', 'Communication', 'Storage', 'Authentication', 'Database', 'Integration'
    FieldSchema NVARCHAR(MAX) NOT NULL,   -- JSON Schema defining required fields
    IconClass NVARCHAR(100),              -- Font Awesome class, e.g., 'fa-brands fa-openai'
    ValidationEndpoint NVARCHAR(500)      -- Optional endpoint to validate credentials
    -- Note: __mj_CreatedAt/__mj_UpdatedAt added automatically by CodeGen
);
```

**FieldSchema JSON Schema Example for SendGrid:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "apiKey": {
      "type": "string",
      "title": "API Key",
      "description": "SendGrid API key starting with SG.",
      "pattern": "^SG\\..+$",
      "isSecret": true,
      "order": 0
    }
  },
  "required": ["apiKey"]
}
```

**FieldSchema JSON Schema Example for MS Graph:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "tenantId": {
      "type": "string",
      "title": "Tenant ID",
      "description": "Azure AD tenant ID (GUID)",
      "pattern": "^[a-f0-9-]{36}$",
      "isSecret": false,
      "order": 0
    },
    "clientId": {
      "type": "string",
      "title": "Client ID",
      "description": "Application client ID (GUID)",
      "pattern": "^[a-f0-9-]{36}$",
      "isSecret": false,
      "order": 1
    },
    "clientSecret": {
      "type": "string",
      "title": "Client Secret",
      "description": "Application client secret",
      "isSecret": true,
      "order": 2
    },
    "accountEmail": {
      "type": "string",
      "format": "email",
      "title": "Account Email",
      "description": "Email of mailbox to send from",
      "isSecret": false,
      "order": 3
    }
  },
  "required": ["tenantId", "clientId", "clientSecret"]
}
```

**Example Records:**
| Name | Category | IconClass |
|------|----------|-----------|
| SendGrid | Communication | fa-solid fa-envelope |
| OpenAI | AI | fa-brands fa-openai |
| Anthropic | AI | fa-solid fa-robot |
| Azure Blob Storage | Storage | fa-brands fa-microsoft |
| AWS S3 | Storage | fa-brands fa-aws |

#### Credential

A specific set of credentials. The `Values` field stores all credential data as an encrypted JSON blob.

```sql
CREATE TABLE [__mj].[Credential] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    CredentialTypeID UNIQUEIDENTIFIER NOT NULL REFERENCES [__mj].[CredentialType](ID),
    CategoryID UNIQUEIDENTIFIER REFERENCES [__mj].[CredentialCategory](ID),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX),
    Values NVARCHAR(MAX) NOT NULL,        -- ENCRYPTED JSON blob containing all credential values
    IsDefault BIT NOT NULL DEFAULT 0,     -- Default credential for this type
    IsActive BIT NOT NULL DEFAULT 1,
    ExpiresAt DATETIMEOFFSET,             -- Optional expiration
    LastValidatedAt DATETIMEOFFSET,       -- Last time credentials were validated
    LastUsedAt DATETIMEOFFSET,            -- Last time credentials were used
    IconClass NVARCHAR(100),              -- Override icon for this specific credential

    CONSTRAINT UQ_Credential_Name UNIQUE (CredentialTypeID, Name)
    -- Note: __mj_CreatedAt/__mj_UpdatedAt and FK indexes added automatically by CodeGen
);
```

**Entity Field Metadata for Encryption:**
The `Values` field will be configured with:
- `Encrypt: true`
- `AllowDecryptInAPI: false` (values never sent to client in clear text)
- This uses MJ's field-level encryption infrastructure with the configured key source

---

## Encryption Architecture

This system leverages MemberJunction's **field-level encryption infrastructure** (implemented in the encryption-field-level branch). The `Values` column on the `Credential` entity is marked for encryption in the entity metadata.

### Key Benefits of Using Field-Level Encryption

1. **Single encrypted blob** - All credential values stored together, simpler than per-field encryption
2. **Pluggable key sources** - Supports environment variables, Azure Key Vault, AWS KMS, or custom providers
3. **Automatic encryption/decryption** - BaseEntity handles encryption transparently via `TransformValue`
4. **AllowDecryptInAPI control** - Set to false so encrypted values are never sent to clients
5. **Consistent with MJ patterns** - Same encryption infrastructure used across all entities

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ENCRYPTION FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. SAVING CREDENTIAL                                                       │
│  ───────────────────                                                        │
│  credentialEntity.Values = JSON.stringify({ apiKey: 'SG.xxx', ... })       │
│  await credentialEntity.Save()                                              │
│       │                                                                     │
│       ▼                                                                     │
│  BaseEntity.TransformValue() → EncryptionService.encryptValue()            │
│       │                                                                     │
│       ▼                                                                     │
│  Key Source (env/Azure KV/AWS KMS) → AES-256-GCM encryption                │
│       │                                                                     │
│       ▼                                                                     │
│  Stored: "$ENC:v1:base64(IV+ciphertext+authTag)"                           │
│                                                                             │
│  2. RETRIEVING CREDENTIAL (Server-side via CredentialEngine)               │
│  ───────────────────────────────────────────────────────────────            │
│  CredentialEngine.getCredential(credentialId) → logs access                │
│       │                                                                     │
│       ▼                                                                     │
│  credentialEntity.Load() → TransformValue() → decrypts Values field        │
│       │                                                                     │
│       ▼                                                                     │
│  Returns: { apiKey: 'SG.xxx', clientId: '...', ... }                       │
│                                                                             │
│  3. API RESPONSE (Client-side)                                              │
│  ─────────────────────────────                                              │
│  Since AllowDecryptInAPI=false, client receives:                           │
│  Values: "[!ENCRYPTED$]" (sentinel value, never the real data)             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Audit Logging via Existing AuditLog

Instead of creating a new `CredentialAccessLog` table, we use MJ's existing `AuditLog` and `AuditLogType` entities.

### AuditLogType Setup

Add a new AuditLogType for credential access:

```sql
INSERT INTO [__mj].[AuditLogType] (ID, Name, Description, ParentID, AuthorizationID)
VALUES (
    'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',  -- Generated GUID
    'Credential Access',
    'Logs access to encrypted credentials including decryption operations',
    NULL,  -- Could be under a parent 'Security' type
    NULL
);
```

### AuditLog Fields Used

| AuditLog Field | Credential Access Usage |
|----------------|------------------------|
| `UserID` | User who accessed the credential |
| `AuditLogTypeID` | Points to "Credential Access" type |
| `Status` | 'Success' or 'Failed' |
| `Description` | "Decrypted credential 'Production SendGrid'" |
| `Details` | JSON with operation context: `{ "operation": "Decrypt", "subsystem": "CommunicationEngine", "sourceIP": "..." }` |
| `EntityID` | Points to Credentials entity |
| `RecordID` | The credential's primary key ID |

---

## CredentialEngine

The `CredentialEngine` is a wrapper around credential access that ensures every decryption is logged. Providers should **never access credentials directly** - they must go through the engine.

### Why a Separate Engine?

1. **Centralized audit logging** - Every credential access is logged automatically
2. **Access control** - Can add authorization checks in one place
3. **Caching** - Can cache decrypted values for performance (with TTL)
4. **Metrics** - Track credential usage patterns
5. **Abstraction** - Providers don't need to know about encryption details

### CredentialEngine API

```typescript
/**
 * CredentialEngine wraps credential access to ensure audit logging
 * and provide a clean API for providers.
 */
export class CredentialEngine {
    private static _instance: CredentialEngine;

    public static get Instance(): CredentialEngine {
        if (!this._instance) {
            this._instance = new CredentialEngine();
        }
        return this._instance;
    }

    /**
     * Resolves and decrypts a credential, logging the access.
     *
     * Resolution order:
     * 1. Direct values from options (per-request override)
     * 2. Named credential from database
     * 3. Default credential for type from database
     * 4. Environment variables (unless disabled)
     */
    public async getCredential(
        credentialTypeName: string,
        options: CredentialResolutionOptions = {}
    ): Promise<ResolvedCredential> {
        const startTime = Date.now();
        let credential: CredentialEntity | null = null;
        let values: Record<string, string> = {};
        let source: 'database' | 'environment' | 'request' = 'database';

        try {
            // 1. Direct values override
            if (options.directValues) {
                values = options.directValues;
                source = 'request';
            }
            // 2. Database lookup
            else if (!options.skipDatabaseLookup) {
                credential = await this.loadCredential(credentialTypeName, options);
                if (credential) {
                    // Decryption happens automatically via BaseEntity
                    values = JSON.parse(credential.Values);
                    source = 'database';
                }
            }
            // 3. Environment fallback
            if (!values && !options.disableEnvironmentFallback) {
                values = this.getFromEnvironment(credentialTypeName);
                source = 'environment';
            }

            // Log successful access
            await this.logAccess(credential, options.contextUser, {
                operation: 'Decrypt',
                subsystem: options.subsystem,
                success: true,
                durationMs: Date.now() - startTime
            });

            // Update LastUsedAt
            if (credential) {
                credential.LastUsedAt = new Date();
                await credential.Save();
            }

            return { credential, values, source, expiresAt: credential?.ExpiresAt };

        } catch (error) {
            // Log failed access
            await this.logAccess(credential, options.contextUser, {
                operation: 'Decrypt',
                subsystem: options.subsystem,
                success: false,
                errorMessage: error.message,
                durationMs: Date.now() - startTime
            });
            throw error;
        }
    }

    /**
     * Stores a new credential with encryption and audit logging.
     */
    public async storeCredential(
        credentialTypeName: string,
        name: string,
        values: Record<string, string>,
        options: StoreCredentialOptions,
        contextUser: UserInfo
    ): Promise<CredentialEntity> {
        // Validate against FieldSchema
        const credType = await this.loadCredentialType(credentialTypeName);
        this.validateValues(values, credType.FieldSchema);

        // Create credential entity
        const md = new Metadata();
        const credential = await md.GetEntityObject<CredentialEntity>('Credentials', contextUser);
        credential.NewRecord();
        credential.CredentialTypeID = credType.ID;
        credential.Name = name;
        credential.Values = JSON.stringify(values);  // Encryption happens on save
        credential.IsDefault = options.isDefault ?? false;
        credential.CategoryID = options.categoryId;
        credential.IconClass = options.iconClass;

        await credential.Save();

        // Log creation
        await this.logAccess(credential, contextUser, {
            operation: 'Create',
            success: true
        });

        return credential;
    }

    /**
     * Updates credential values with encryption and audit logging.
     */
    public async updateCredential(
        credentialId: string,
        values: Record<string, string>,
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<CredentialEntity>('Credentials', contextUser);
        await credential.Load(credentialId);

        // Validate against FieldSchema
        const credType = await this.loadCredentialType(credential.CredentialType);
        this.validateValues(values, credType.FieldSchema);

        credential.Values = JSON.stringify(values);  // Encryption happens on save
        await credential.Save();

        // Log update
        await this.logAccess(credential, contextUser, {
            operation: 'Update',
            success: true
        });
    }

    /**
     * Validates credentials against the provider's validation endpoint.
     */
    public async validateCredential(
        credentialId: string,
        contextUser: UserInfo
    ): Promise<CredentialValidationResult> {
        const resolved = await this.getCredential('', {
            credentialId,
            contextUser,
            subsystem: 'CredentialEngine.validate'
        });

        if (!resolved.credential) {
            return { isValid: false, errors: ['Credential not found'], warnings: [], validatedAt: new Date() };
        }

        // Get credential type for validation endpoint
        const credType = await this.loadCredentialType(resolved.credential.CredentialType);

        if (!credType.ValidationEndpoint) {
            return { isValid: true, errors: [], warnings: ['No validation endpoint configured'], validatedAt: new Date() };
        }

        // Call validation endpoint
        const result = await this.callValidationEndpoint(credType.ValidationEndpoint, resolved.values);

        // Update LastValidatedAt
        resolved.credential.LastValidatedAt = new Date();
        await resolved.credential.Save();

        return result;
    }

    /**
     * Internal: Log access to AuditLog
     */
    private async logAccess(
        credential: CredentialEntity | null,
        contextUser: UserInfo | undefined,
        details: {
            operation: 'Decrypt' | 'Create' | 'Update' | 'Delete' | 'Validate';
            subsystem?: string;
            success: boolean;
            errorMessage?: string;
            durationMs?: number;
        }
    ): Promise<void> {
        const md = new Metadata();
        const auditLog = await md.GetEntityObject<AuditLogEntity>('Audit Logs', contextUser);
        auditLog.NewRecord();

        auditLog.UserID = contextUser?.ID ?? 'system';
        auditLog.AuditLogTypeID = this.credentialAccessAuditLogTypeId;
        auditLog.Status = details.success ? 'Success' : 'Failed';
        auditLog.Description = credential
            ? `${details.operation} credential '${credential.Name}'`
            : `${details.operation} credential (not found)`;
        auditLog.Details = JSON.stringify({
            operation: details.operation,
            subsystem: details.subsystem,
            errorMessage: details.errorMessage,
            durationMs: details.durationMs
        });

        if (credential) {
            auditLog.EntityID = this.credentialsEntityId;
            auditLog.RecordID = credential.ID;
        }

        await auditLog.Save();
    }
}
```

---

## Multi-Tenancy Support

The core credential system is **tenant-agnostic** by design. SaaS implementers can add multi-tenancy through their own join tables:

### Example: TenantCredential Join Table

```sql
-- User-defined table (not part of core MJ)
-- This is just an example pattern for SaaS implementers
CREATE TABLE [dbo].[TenantCredential] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    TenantID UNIQUEIDENTIFIER NOT NULL REFERENCES [dbo].[Tenant](ID),
    CredentialID UNIQUEIDENTIFIER NOT NULL REFERENCES [__mj].[Credential](ID),
    IsDefault BIT NOT NULL DEFAULT 0,  -- Default for this tenant

    CONSTRAINT UQ_TenantCredential UNIQUE (TenantID, CredentialID)
    -- Note: If using MJ entities, __mj timestamps and FK indexes are added by CodeGen
);
```

### Usage Pattern

```typescript
// SaaS-specific credential resolution
async function getTenantCredential(
    tenantId: string,
    credentialTypeName: string,
    contextUser: UserInfo
): Promise<ResolvedCredential> {
    // 1. Look up tenant's credential mapping
    const rv = new RunView();
    const mappings = await rv.RunView({
        EntityName: 'Tenant Credentials',  // User-defined entity
        ExtraFilter: `TenantID='${tenantId}' AND Credential.CredentialType='${credentialTypeName}'`,
        OrderBy: 'IsDefault DESC'
    }, contextUser);

    if (mappings.Results.length > 0) {
        // 2. Use CredentialEngine with the mapped credential ID
        return await CredentialEngine.Instance.getCredential(credentialTypeName, {
            credentialId: mappings.Results[0].CredentialID,
            contextUser
        });
    }

    // 3. Fall back to default credential
    return await CredentialEngine.Instance.getCredential(credentialTypeName, { contextUser });
}
```

---

## Integration with Subsystems

Actions, AI providers, and communication providers can receive a `CredentialID` parameter to specify which credential to use.

### Action Parameter Example

```typescript
// Action that sends email via SendGrid
@RegisterClass(BaseAction, 'Send Email')
export class SendEmailAction extends BaseAction {
    @ActionParam({
        Name: 'CredentialID',
        Description: 'Optional: Specific SendGrid credential to use',
        Type: 'uuid',
        IsRequired: false
    })
    public CredentialID?: string;

    public async Run(params: ActionParams, contextUser: UserInfo): Promise<ActionResult> {
        const credential = await CredentialEngine.Instance.getCredential('SendGrid', {
            credentialId: this.CredentialID,
            contextUser,
            subsystem: 'SendEmailAction'
        });

        // Use credential.values.apiKey to send email
        sgMail.setApiKey(credential.values.apiKey);
        // ...
    }
}
```

### AI Provider Example

```typescript
export class OpenAILLM extends BaseLLM {
    public async ChatCompletion(
        params: ChatParams,
        credentialId?: string  // Optional credential override
    ): Promise<ChatResult> {
        const credential = await CredentialEngine.Instance.getCredential('OpenAI', {
            credentialId,
            contextUser: params.contextUser,
            subsystem: 'OpenAILLM'
        });

        const client = new OpenAI({ apiKey: credential.values.apiKey });
        // ...
    }
}
```

### Communication Provider Example

```typescript
export class SendGridProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(
        message: ProcessedMessage,
        credentialId?: string
    ): Promise<MessageResult> {
        const credential = await CredentialEngine.Instance.getCredential('SendGrid', {
            credentialId,
            contextUser: message.contextUser,
            subsystem: 'CommunicationEngine.SendGrid'
        });

        sgMail.setApiKey(credential.values.apiKey);
        // ...
    }
}
```

---

## Current Credential Inventory

### AI Providers

| Provider | Env Variable Pattern | Fields |
|----------|---------------------|--------|
| OpenAI | `AI_VENDOR_API_KEY__OPENAILLM` | apiKey |
| Anthropic | `AI_VENDOR_API_KEY__ANTHROPICLLM` | apiKey |
| Azure OpenAI | `AI_VENDOR_API_KEY__AZURELLM` | apiKey, endpoint |
| Google Vertex | `AI_VENDOR_API_KEY__VERTEXLLM` | apiKey |
| Groq | `AI_VENDOR_API_KEY__GROQLLM` | apiKey |
| Mistral | `AI_VENDOR_API_KEY__MISTRALLM` | apiKey |
| AWS Bedrock | AWS credentials | accessKeyId, secretAccessKey, region |
| Cerebras | `AI_VENDOR_API_KEY__CEREBRASLLM` | apiKey |
| OpenRouter | `AI_VENDOR_API_KEY__OPENROUTERLLM` | apiKey |
| x.AI | `AI_VENDOR_API_KEY__XAILLM` | apiKey |

### Communication Providers

| Provider | Env Variables | Fields |
|----------|--------------|--------|
| SendGrid | `COMMUNICATION_VENDOR_API_KEY__SENDGRID` | apiKey |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | accountSid, authToken, phoneNumber, whatsappNumber |
| Gmail | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | clientId, clientSecret, refreshToken, redirectUri |
| MS Graph | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_ACCOUNT_EMAIL` | tenantId, clientId, clientSecret, accountEmail |

### Storage Providers

| Provider | Env Variable Prefix | Fields |
|----------|-------------------|--------|
| AWS S3 | `STORAGE_AWS_*` | accessKeyId, secretAccessKey, region, bucket |
| Azure Blob | `STORAGE_AZURE_*` | accountName, accountKey, connectionString, container |
| Google Cloud | `STORAGE_GOOGLE_*` | projectId, keyFilename, bucket |
| Google Drive | `STORAGE_GOOGLE_DRIVE_*` | clientId, clientSecret, refreshToken |
| Dropbox | `STORAGE_DROPBOX_*` | accessToken, refreshToken, clientId, clientSecret |
| Box | `STORAGE_BOX_*` | clientId, clientSecret, accessToken, refreshToken |
| SharePoint | `STORAGE_SHAREPOINT_*` | clientId, clientSecret, tenantId, siteId |

### Authentication Providers

| Provider | Env Variables | Fields |
|----------|--------------|--------|
| Azure AD | `TENANT_ID`, `WEB_CLIENT_ID` | tenantId, clientId, clientSecret |
| Auth0 | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | domain, clientId, clientSecret |
| Okta | `OKTA_DOMAIN`, `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET` | domain, clientId, clientSecret |
| Cognito | `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | userPoolId, clientId, region |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | clientId, clientSecret |

### Database

| Type | Env Variables | Fields |
|------|--------------|--------|
| SQL Server | `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | host, port, database, username, password |

### Integrations

| Integration | Env Variables | Fields |
|-------------|--------------|--------|
| Skip API | `ASK_SKIP_API_KEY`, `ASK_SKIP_ORGANIZATION_ID` | apiKey, organizationId |

---

## Usage Examples

```typescript
// 1. Default behavior (backward compatible)
// Uses database default → falls back to env vars
await engine.SendSingleMessage('SendGrid', 'Standard Email', message);

// 2. Use specific named credential from database
const cred = await CredentialEngine.Instance.getCredential('SendGrid', {
    credentialName: 'Marketing SendGrid',
    contextUser
});

// 3. Use credential by ID (from UI selection or action parameter)
await engine.SendSingleMessage('SendGrid', 'Standard Email', message, credentialId);

// 4. Per-request credentials (no database/env)
const cred = await CredentialEngine.Instance.getCredential('SendGrid', {
    directValues: { apiKey: 'SG.customer-provided-key' },
    disableEnvironmentFallback: true,
    contextUser
});

// 5. Store new credentials
await CredentialEngine.Instance.storeCredential(
    'SendGrid',
    'Customer ABC SendGrid',
    { apiKey: 'SG.abc123...' },
    { categoryId: emailCategoryId, iconClass: 'fa-solid fa-star' },
    contextUser
);

// 6. Validate credentials
const validation = await CredentialEngine.Instance.validateCredential(
    credentialId,
    contextUser
);
if (!validation.isValid) {
    console.error('Credential validation failed:', validation.errors);
}
```

---

## Migration Path

### Phase 1: Field-Level Encryption Infrastructure ✓
- Implement field-level encryption in BaseEntity
- Support pluggable key sources (env, Azure KV, AWS KMS)
- Add encryption metadata to EntityField (Encrypt, AllowDecryptInAPI, SendEncryptedValue)

### Phase 2: Credential Entities (Current)
- Create CredentialCategory, CredentialType, Credential entities
- Create AuditLogType for credential access
- Implement CredentialEngine wrapper
- Add CodeGen templates for credential entities

### Phase 3: Provider Integration
- Add optional credentialId parameter to provider methods
- Update AI providers (BaseLLM, embeddings)
- Update communication providers
- Update storage providers
- Environment variable fallback for backward compatibility

### Phase 4: UI and Advanced Features
- Angular UI for credential management (uses encrypted field support in MJFormField)
- Credential picker component for Action parameters
- Validation endpoint integration
- Expiration warnings and notifications

---

## Summary

| Feature | Current State | 3.0 Solution |
|---------|--------------|--------------|
| **Storage** | Environment variables only | Database (encrypted) + env fallback |
| **Encryption** | None (plaintext) | Field-level AES-256-GCM via MJ infrastructure |
| **Multi-tenancy** | Not supported | Extensible via user-defined join tables |
| **Per-request override** | Not supported | `directValues` or `credentialId` options |
| **Audit logging** | None | AuditLog integration via CredentialEngine |
| **Validation** | None (fails at runtime) | On-demand validation with provider endpoints |
| **Key management** | Not possible | Pluggable key sources (env, vault, KMS) |
| **UI management** | None | Leverages encrypted field UI in MJFormField |
| **Backward compatibility** | N/A | Env var fallback preserves existing behavior |

### Core Entities (3 new + 1 existing)

1. `CredentialCategory` - Hierarchical organization
2. `CredentialType` - Defines credential templates with JSON Schema
3. `Credential` - Named credential instances with encrypted JSON values
4. `AuditLog` + `AuditLogType` - Existing entities used for access logging

### New Package

`@memberjunction/credentials` - CredentialEngine and related utilities

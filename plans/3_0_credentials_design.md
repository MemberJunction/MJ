# MemberJunction 3.0: Unified Credential Management System

> **Status**: Draft
> **Last Updated**: December 9, 2025
> **Target Release**: MemberJunction 3.0

## Overview

This document outlines the design for a unified, metadata-driven credential management system for MemberJunction 3.0. The system will provide secure, centralized credential storage with encryption, multi-tenancy support, audit logging, and per-request credential selection across all MJ subsystems.

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

A unified, metadata-driven credential management system that:

1. Stores encrypted credentials in the database
2. Supports multiple credential sets per provider (multi-tenancy)
3. Provides audit logging of credential access
4. Enables per-request credential selection
5. Falls back to environment variables for backward compatibility
6. Supports credential rotation without deployment

---

## Data Model

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CREDENTIAL ENTITIES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐       ┌─────────────────────────┐                 │
│  │ CredentialType      │       │ CredentialTypeField     │                 │
│  ├─────────────────────┤       ├─────────────────────────┤                 │
│  │ ID                  │──────<│ CredentialTypeID        │                 │
│  │ Name                │       │ FieldName               │                 │
│  │ Description         │       │ DisplayName             │                 │
│  │ Category            │       │ Description             │                 │
│  │ ProviderClass       │       │ DataType                │                 │
│  │ IconURL             │       │ IsRequired              │                 │
│  │ ValidationEndpoint  │       │ IsSecret (encrypted)    │                 │
│  └─────────────────────┘       │ DefaultValue            │                 │
│                                │ ValidationRegex         │                 │
│                                │ DisplayOrder            │                 │
│                                │ HelpText                │                 │
│                                └─────────────────────────┘                 │
│                                                                             │
│  ┌─────────────────────┐       ┌─────────────────────────┐                 │
│  │ Credential          │       │ CredentialValue         │                 │
│  ├─────────────────────┤       ├─────────────────────────┤                 │
│  │ ID                  │──────<│ CredentialID            │                 │
│  │ CredentialTypeID    │>──────│ CredentialTypeFieldID   │>────────────    │
│  │ Name                │       │ Value (ENCRYPTED)       │                 │
│  │ Description         │       │ ExpiresAt               │                 │
│  │ OrganizationID      │       └─────────────────────────┘                 │
│  │ IsDefault           │                                                   │
│  │ IsActive            │       ┌─────────────────────────┐                 │
│  │ ExpiresAt           │       │ CredentialAccessLog     │                 │
│  │ LastValidatedAt     │       ├─────────────────────────┤                 │
│  │ LastUsedAt          │       │ ID                      │                 │
│  └─────────────────────┘       │ CredentialID            │>────────────    │
│                                │ AccessedAt              │                 │
│                                │ AccessedByUserID        │                 │
│                                │ Operation               │                 │
│                                │ SourceIP                │                 │
│                                │ Success                 │                 │
│                                │ ErrorMessage            │                 │
│                                └─────────────────────────┘                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ CredentialEncryptionKey                                              │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ ID                                                                   │   │
│  │ KeyVersion                                                           │   │
│  │ EncryptedKey (encrypted with master key from env/vault)              │   │
│  │ Algorithm (AES-256-GCM)                                              │   │
│  │ IsActive                                                             │   │
│  │ CreatedAt                                                            │   │
│  │ RotatedAt                                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Entity Definitions

#### CredentialType

Defines a category of credentials (e.g., "SendGrid API", "Azure AD Service Principal", "AWS S3").

```sql
CREATE TABLE [__mj].[CredentialType] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(MAX),
    Category NVARCHAR(50) NOT NULL,  -- 'AI', 'Communication', 'Storage', 'Authentication', 'Database', 'Integration'
    ProviderClass NVARCHAR(255),      -- e.g., 'SendGridProvider', 'OpenAILLM'
    IconURL NVARCHAR(500),
    ValidationEndpoint NVARCHAR(500), -- Optional endpoint to validate credentials
    __mj_CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);
```

**Example Records:**
- `('SendGrid', 'SendGrid email service', 'Communication', 'SendGridProvider')`
- `('OpenAI', 'OpenAI language models', 'AI', 'OpenAILLM')`
- `('Azure Blob Storage', 'Azure cloud storage', 'Storage', 'AzureBlobProvider')`

#### CredentialTypeField

Defines the fields required for each credential type.

```sql
CREATE TABLE [__mj].[CredentialTypeField] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    CredentialTypeID UNIQUEIDENTIFIER NOT NULL REFERENCES [__mj].[CredentialType](ID),
    FieldName NVARCHAR(100) NOT NULL,       -- Internal name: 'apiKey', 'clientId'
    DisplayName NVARCHAR(100) NOT NULL,     -- UI label: 'API Key', 'Client ID'
    Description NVARCHAR(500),
    DataType NVARCHAR(50) NOT NULL DEFAULT 'string',  -- 'string', 'password', 'url', 'email', 'number', 'boolean', 'json'
    IsRequired BIT NOT NULL DEFAULT 1,
    IsSecret BIT NOT NULL DEFAULT 0,         -- If true, value is encrypted and masked in UI
    DefaultValue NVARCHAR(500),
    ValidationRegex NVARCHAR(500),           -- Optional regex for validation
    DisplayOrder INT NOT NULL DEFAULT 0,
    HelpText NVARCHAR(MAX),
    __mj_CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT UQ_CredentialTypeField UNIQUE (CredentialTypeID, FieldName)
);
```

**Example for SendGrid:**
```sql
INSERT INTO CredentialTypeField VALUES
(SendGridTypeID, 'apiKey', 'API Key', 'SendGrid API key starting with SG.', 'password', 1, 1, NULL, '^SG\..+$', 0, NULL);
```

**Example for MS Graph:**
```sql
INSERT INTO CredentialTypeField VALUES
(MSGraphTypeID, 'tenantId', 'Tenant ID', 'Azure AD tenant ID (GUID)', 'string', 1, 0, NULL, '^[a-f0-9-]{36}$', 0, NULL),
(MSGraphTypeID, 'clientId', 'Client ID', 'Application client ID (GUID)', 'string', 1, 0, NULL, '^[a-f0-9-]{36}$', 1, NULL),
(MSGraphTypeID, 'clientSecret', 'Client Secret', 'Application client secret', 'password', 1, 1, NULL, NULL, 2, NULL),
(MSGraphTypeID, 'accountEmail', 'Account Email', 'Email of mailbox to send from', 'email', 0, 0, NULL, NULL, 3, NULL);
```

#### Credential

A specific set of credentials for a type.

```sql
CREATE TABLE [__mj].[Credential] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    CredentialTypeID UNIQUEIDENTIFIER NOT NULL REFERENCES [__mj].[CredentialType](ID),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX),
    OrganizationID UNIQUEIDENTIFIER,         -- For multi-tenant: which org owns this
    IsDefault BIT NOT NULL DEFAULT 0,        -- Default credential for this type
    IsActive BIT NOT NULL DEFAULT 1,
    ExpiresAt DATETIME2,                     -- Optional expiration
    LastValidatedAt DATETIME2,               -- Last time credentials were validated
    LastUsedAt DATETIME2,                    -- Last time credentials were used
    __mj_CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT UQ_Credential_Name UNIQUE (CredentialTypeID, OrganizationID, Name)
);
```

#### CredentialValue

The actual credential values (encrypted for secrets).

```sql
CREATE TABLE [__mj].[CredentialValue] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    CredentialID UNIQUEIDENTIFIER NOT NULL REFERENCES [__mj].[Credential](ID),
    CredentialTypeFieldID UNIQUEIDENTIFIER NOT NULL REFERENCES [__mj].[CredentialTypeField](ID),
    Value NVARCHAR(MAX) NOT NULL,            -- Encrypted if IsSecret=1 on field
    EncryptionKeyVersion INT,                 -- Which key version was used to encrypt
    ExpiresAt DATETIME2,                      -- Field-level expiration (e.g., tokens)
    __mj_CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT UQ_CredentialValue UNIQUE (CredentialID, CredentialTypeFieldID)
);
```

#### CredentialAccessLog

Audit trail for credential usage.

```sql
CREATE TABLE [__mj].[CredentialAccessLog] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    CredentialID UNIQUEIDENTIFIER NOT NULL REFERENCES [__mj].[Credential](ID),
    AccessedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    AccessedByUserID UNIQUEIDENTIFIER REFERENCES [__mj].[User](ID),
    Operation NVARCHAR(50) NOT NULL,         -- 'Read', 'Use', 'Update', 'Validate'
    Subsystem NVARCHAR(100),                 -- 'CommunicationEngine', 'AIEngine', etc.
    SourceIP NVARCHAR(50),
    Success BIT NOT NULL DEFAULT 1,
    ErrorMessage NVARCHAR(MAX),

    INDEX IX_CredentialAccessLog_CredentialID (CredentialID),
    INDEX IX_CredentialAccessLog_AccessedAt (AccessedAt)
);
```

#### CredentialEncryptionKey

Key management for credential encryption.

```sql
CREATE TABLE [__mj].[CredentialEncryptionKey] (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    KeyVersion INT NOT NULL UNIQUE,
    EncryptedKey NVARCHAR(MAX) NOT NULL,     -- Key encrypted with master key
    Algorithm NVARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    RotatedAt DATETIME2,
    RetiredAt DATETIME2
);
```

---

## Encryption Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ENCRYPTION HIERARCHY                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ MASTER KEY                                                           │   │
│  │ ─────────────────────────────────────────────────────────────────── │   │
│  │ Source: Environment variable (CREDENTIAL_MASTER_KEY) or             │   │
│  │         External vault (Azure Key Vault, AWS KMS, HashiCorp Vault)  │   │
│  │                                                                      │   │
│  │ Purpose: Encrypts/decrypts Data Encryption Keys (DEKs)              │   │
│  │ Never stored in database                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ DATA ENCRYPTION KEY (DEK)                                            │   │
│  │ ─────────────────────────────────────────────────────────────────── │   │
│  │ Stored in: CredentialEncryptionKey table (encrypted with master)    │   │
│  │ Algorithm: AES-256-GCM                                               │   │
│  │ Rotation: Supports multiple versions for key rotation                │   │
│  │                                                                      │   │
│  │ Purpose: Encrypts/decrypts individual credential values             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ CREDENTIAL VALUES                                                    │   │
│  │ ─────────────────────────────────────────────────────────────────── │   │
│  │ Stored in: CredentialValue.Value column                              │   │
│  │ Format: Base64(IV + Ciphertext + AuthTag)                           │   │
│  │ Tracks: EncryptionKeyVersion for re-encryption during rotation      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

- **Envelope Encryption**: Master key encrypts DEKs, DEKs encrypt data
- **Key Rotation**: Multiple key versions supported, old versions kept for decryption
- **Re-encryption**: Background process to re-encrypt with new keys
- **Vault Integration**: Master key can come from external vault services

---

## TypeScript Implementation

### Core Types (`@memberjunction/credentials`)

```typescript
/**
 * Represents a resolved credential ready for use
 */
export interface ResolvedCredential {
    /** The credential entity (null if from env/request) */
    credential: CredentialEntity | null;

    /** Decrypted field values */
    values: Record<string, string>;

    /** Source of the credential */
    source: 'database' | 'environment' | 'request';

    /** When the credential expires (if applicable) */
    expiresAt?: Date;
}

/**
 * Options for credential resolution
 */
export interface CredentialResolutionOptions {
    /** Specific credential ID to use */
    credentialId?: string;

    /** Credential name to look up */
    credentialName?: string;

    /** Organization ID for multi-tenant lookups */
    organizationId?: string;

    /** If true, skip database lookup and only use environment/request */
    skipDatabaseLookup?: boolean;

    /** If true, don't fall back to environment variables */
    disableEnvironmentFallback?: boolean;

    /** Direct credential values (for per-request override) */
    directValues?: Record<string, string>;

    /** User context for audit logging */
    contextUser?: UserInfo;
}

/**
 * Result of credential validation
 */
export interface CredentialValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    validatedAt: Date;
}
```

### Credential Manager

```typescript
/**
 * Central credential management service.
 * Handles credential storage, retrieval, encryption, and audit logging.
 */
export class CredentialManager {
    private static _instance: CredentialManager;

    public static get Instance(): CredentialManager {
        if (!this._instance) {
            this._instance = new CredentialManager();
        }
        return this._instance;
    }

    /**
     * Resolves credentials for a provider.
     *
     * Resolution order:
     * 1. Direct values from options (per-request override)
     * 2. Named credential from database
     * 3. Default credential for type from database
     * 4. Environment variables (unless disabled)
     */
    public async resolveCredential(
        credentialTypeName: string,
        options: CredentialResolutionOptions = {}
    ): Promise<ResolvedCredential>;

    /**
     * Stores a new credential in the database.
     */
    public async storeCredential(
        credentialTypeName: string,
        name: string,
        values: Record<string, string>,
        options: StoreCredentialOptions,
        contextUser: UserInfo
    ): Promise<CredentialEntity>;

    /**
     * Updates credential values.
     */
    public async updateCredential(
        credentialId: string,
        values: Record<string, string>,
        contextUser: UserInfo
    ): Promise<void>;

    /**
     * Validates credentials against the provider.
     */
    public async validateCredential(
        credentialId: string,
        contextUser: UserInfo
    ): Promise<CredentialValidationResult>;

    /**
     * Rotates encryption keys.
     */
    public async rotateEncryptionKey(contextUser: UserInfo): Promise<void>;
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

## Integration with Subsystems

### Communication Provider Example

```typescript
// Before (current)
export class SendGridProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        sgMail.setApiKey(process.env.COMMUNICATION_VENDOR_API_KEY__SENDGRID);
        // ...
    }
}

// After (3.0)
export class SendGridProvider extends BaseCommunicationProvider {
    protected getCredentialTypeName(): string {
        return 'SendGrid';
    }

    public async SendSingleMessage(
        message: ProcessedMessage,
        credentialOptions?: CredentialResolutionOptions
    ): Promise<MessageResult> {
        const resolved = await this.credentialManager.resolveCredential(
            this.getCredentialTypeName(),
            credentialOptions
        );
        sgMail.setApiKey(resolved.values.apiKey);
        // ...
    }
}
```

### AI Provider Example

```typescript
// Before (current)
export class OpenAILLM extends BaseLLM {
    protected async getAPIKey(): Promise<string> {
        return GetAIAPIKey('OpenAILLM');
    }
}

// After (3.0)
export class OpenAILLM extends BaseLLM {
    protected getCredentialTypeName(): string {
        return 'OpenAI';
    }

    public async ChatCompletion(
        params: ChatParams,
        credentialOptions?: CredentialResolutionOptions
    ): Promise<ChatResult> {
        const resolved = await this.credentialManager.resolveCredential(
            this.getCredentialTypeName(),
            credentialOptions
        );
        const client = new OpenAI({ apiKey: resolved.values.apiKey });
        // ...
    }
}
```

---

## Usage Examples

```typescript
// 1. Default behavior (backward compatible)
// Uses database default → falls back to env vars
await engine.SendSingleMessage('SendGrid', 'Standard Email', message);

// 2. Use specific named credential from database
await engine.SendSingleMessage('SendGrid', 'Standard Email', message, {
    credentialName: 'Marketing SendGrid'
});

// 3. Use credential by ID (from UI selection)
await engine.SendSingleMessage('SendGrid', 'Standard Email', message, {
    credentialId: 'a1b2c3d4-e5f6-...'
});

// 4. Multi-tenant - organization-specific credential
await engine.SendSingleMessage('SendGrid', 'Standard Email', message, {
    organizationId: tenantOrgId
});

// 5. Per-request credentials (no database/env)
await engine.SendSingleMessage('SendGrid', 'Standard Email', message, {
    directValues: { apiKey: 'SG.customer-provided-key' },
    disableEnvironmentFallback: true
});

// 6. Store new credentials via API
await CredentialManager.Instance.storeCredential(
    'SendGrid',
    'Customer ABC SendGrid',
    { apiKey: 'SG.abc123...' },
    { organizationId: customerOrgId },
    contextUser
);

// 7. Validate credentials
const validation = await CredentialManager.Instance.validateCredential(
    credentialId,
    contextUser
);
```

---

## Migration Path

### Phase 1: Interim Solution (v2.x Patch)
- Add optional credential parameters to provider methods
- Support per-request credential override via simple objects
- Maintain full backward compatibility with env vars
- No database storage yet

### Phase 2: Database Storage (v3.0)
- Implement credential entities and encryption
- Add CredentialManager class
- Migrate providers to use CredentialManager
- Env vars become fallback option

### Phase 3: UI and Advanced Features (v3.x)
- Angular UI for credential management
- Credential validation endpoints
- Key rotation automation
- Audit log reporting

---

## Summary

| Feature | Current State | 3.0 Solution |
|---------|--------------|--------------|
| **Storage** | Environment variables only | Database (encrypted) + env fallback |
| **Encryption** | None (plaintext) | AES-256-GCM with key rotation |
| **Multi-tenancy** | Not supported | Organization-scoped credentials |
| **Per-request override** | Not supported | `directValues` or `credentialId` options |
| **Audit logging** | None | Full access logging |
| **Validation** | None (fails at runtime) | On-demand validation with provider endpoints |
| **Key rotation** | Not possible | Versioned keys with re-encryption |
| **UI management** | None | Metadata-driven forms auto-generated |
| **Backward compatibility** | N/A | Env var fallback preserves existing behavior |

### New Entities

1. `CredentialType` - Defines credential categories
2. `CredentialTypeField` - Defines fields per type
3. `Credential` - Named credential instances
4. `CredentialValue` - Encrypted field values
5. `CredentialAccessLog` - Audit trail
6. `CredentialEncryptionKey` - Key management

### New Package

`@memberjunction/credentials` - Core credential management library

# AI Provider Authentication Guide

This document describes how authentication works for AI providers in MemberJunction, including the credential resolution hierarchy, the decoupled binding system, priority-based failover, and backward compatibility with legacy environment variables.

## Overview

MemberJunction's AI system supports a flexible, hierarchical credential resolution system that allows you to:

1. **Use secure, encrypted credentials** stored in the database via the Credentials system
2. **Bind credentials independently** via the AICredentialBinding table (decoupled from core AI entities)
3. **Configure priority-based failover** with multiple credentials per binding level
4. **Override credentials at multiple levels** (vendor, model, prompt, or per-request)
5. **Maintain backward compatibility** with legacy environment variable-based authentication
6. **Support complex authentication schemes** beyond simple API keys (e.g., Azure endpoints, OAuth)

## Architecture Layers

The AI authentication system spans two packages with distinct responsibilities:

| Package | Responsibility | Database Access |
|---------|----------------|-----------------|
| `@memberjunction/ai` | Core LLM abstractions, provider implementations | None (standalone) |
| `@memberjunction/ai-prompts` | Prompt execution, credential resolution | Full database access |

The `@memberjunction/ai` package is intentionally kept free of database dependencies so it can be used standalone in any TypeScript environment. The `@memberjunction/ai-prompts` package handles credential resolution before instantiating models.

## Decoupled Credential Binding

### Why Decoupled Bindings?

Rather than embedding `CredentialID` directly into `AIVendor`, `AIModelVendor`, and `AIPromptModel` tables, MemberJunction uses a separate **`AICredentialBinding`** junction table. This design provides several benefits:

| Benefit | Description |
|---------|-------------|
| **Safe Core Updates** | MJ can ship updates to vendors, models, and prompts without overwriting customer credentials |
| **Customer Independence** | Credential bindings are customer data, separate from MJ's distributed metadata |
| **Priority-Based Failover** | Multiple credentials per level with priority ordering |
| **Flexible Management** | Enable/disable bindings without deletion |

### AICredentialBinding Table

The binding table uses a polymorphic design:

```sql
CREATE TABLE AICredentialBinding (
    ID UNIQUEIDENTIFIER PRIMARY KEY,
    CredentialID UNIQUEIDENTIFIER NOT NULL,  -- FK to Credential
    BindingType NVARCHAR(20) NOT NULL,       -- 'Vendor', 'ModelVendor', 'PromptModel'

    -- Polymorphic FKs (only one populated based on BindingType)
    AIVendorID UNIQUEIDENTIFIER NULL,
    AIModelVendorID UNIQUEIDENTIFIER NULL,
    AIPromptModelID UNIQUEIDENTIFIER NULL,

    Priority INT NOT NULL DEFAULT 0,         -- Lower = higher priority (0 is highest)
    IsActive BIT NOT NULL DEFAULT 1
);
```

### Vendor Credential Type Declaration

Each AI vendor can declare what type of credential it expects via `AIVendor.CredentialTypeID`:

```sql
-- OpenAI expects a simple API Key
UPDATE AIVendor SET CredentialTypeID = @ApiKeyTypeId WHERE Name = 'OpenAI';

-- Google Vertex expects GCP Service Account credentials
UPDATE AIVendor SET CredentialTypeID = @GcpServiceAccountTypeId WHERE Name = 'Google Vertex';
```

This enables:
- **UI guidance** when creating credentials for a vendor
- **Type-based default resolution** when no explicit binding exists
- **Validation** that bound credentials match expected types

## Credential Resolution Hierarchy

When executing a prompt, credentials are resolved in the following order (highest priority first):

| Priority | Source | Description | Failover Support |
|----------|--------|-------------|------------------|
| 1 | Per-request override | `AIPromptParams.credentialId` | No (explicit) |
| 2 | PromptModel bindings | `AICredentialBinding` WHERE `BindingType='PromptModel'` | Yes (by Priority) |
| 3 | ModelVendor bindings | `AICredentialBinding` WHERE `BindingType='ModelVendor'` | Yes (by Priority) |
| 4 | Vendor bindings | `AICredentialBinding` WHERE `BindingType='Vendor'` | Yes (by Priority) |
| 5 | Type-based default | `Credential.IsDefault=1` matching `AIVendor.CredentialTypeID` | No |
| 6 | Legacy: Runtime array | `AIPromptParams.apiKeys[]` | No |
| 7 | Legacy: Environment var | `AI_VENDOR_API_KEY__<DRIVER>` | No |

### Priority-Based Failover

At binding levels 2-4, multiple bindings can exist with different `Priority` values. The system tries credentials in priority order (lower numbers first):

```
Binding for OpenAI vendor:
  Priority 0: Production API Key (default, tried first)
  Priority 1: Rate-Limited Backup Key (used if Priority 0 fails)
  Priority 2: Emergency Fallback Key (used if Priority 1 fails)
```

**Failover triggers:**
- Credential not found or inactive
- Credential expired
- Authentication failure from provider
- Rate limit exceeded (optional, configurable)

### Important: Credential vs Legacy Precedence

**When ANY credential binding or credential ID is found (priorities 1-5), the system uses the Credentials path and ignores legacy methods (priorities 6-7).** This ensures that once you migrate to the Credentials system, you get consistent, audited credential usage.

The legacy methods (`apiKeys[]` parameter and environment variables) only apply when no credentials are configured at any level.

## Credential Types for AI Providers

The Credentials system supports various authentication schemes through typed credential values:

### Simple API Key
Most providers (OpenAI, Anthropic, Groq, Mistral, etc.):
```json
{
  "apiKey": "sk-..."
}
```

### API Key with Endpoint
Providers with custom endpoints (Azure OpenAI, self-hosted):
```json
{
  "apiKey": "...",
  "endpoint": "https://my-resource.openai.azure.com"
}
```

### Azure Service Principal
For Azure-based services with service principal auth:
```json
{
  "tenantId": "...",
  "clientId": "...",
  "clientSecret": "..."
}
```

### GCP Service Account
For Google Vertex AI:
```json
{
  "projectId": "my-project",
  "location": "us-central1",
  "serviceAccountKey": { ... }
}
```

### AWS IAM
For AWS Bedrock:
```json
{
  "accessKeyId": "...",
  "secretAccessKey": "...",
  "region": "us-east-1"
}
```

## How Credentials Flow to Providers

When a credential is resolved, its `Values` field (a JSON object) is stringified and passed to the provider constructor:

```typescript
// Resolution in AIPromptRunner
const credentialValues = await CredentialEngine.Instance.getCredential(
    credentialTypeName,
    { credentialId, contextUser, subsystem: 'AIPromptRunner' }
);

// Passed as JSON string to constructor
const apiKeyOrConfig = JSON.stringify(credentialValues.values);
const llm = ClassFactory.CreateInstance<BaseLLM>(BaseLLM, driverClass, apiKeyOrConfig);
```

Provider implementations handle parsing:

```typescript
// Simple provider (OpenAI, Anthropic)
constructor(apiKey: string) {
    super(apiKey);
    // Try to parse as JSON first, fall back to raw string
    let key = apiKey;
    try {
        const config = JSON.parse(apiKey);
        key = config.apiKey || apiKey;
    } catch {
        // Not JSON, use as-is (legacy format)
    }
    this._client = new OpenAI({ apiKey: key });
}

// Complex provider (Azure OpenAI)
constructor(apiKey: string) {
    super(apiKey);
    const config = JSON.parse(apiKey);
    this._client = new AzureOpenAI({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        deploymentName: config.deploymentId
    });
}
```

## Database Schema

### AICredentialBinding Table

The binding table decouples credentials from core AI entities:

```sql
-- Bind a credential to a vendor (default for all models)
INSERT INTO __mj.AICredentialBinding
    (CredentialID, BindingType, AIVendorID, Priority)
VALUES (@MyCredentialId, 'Vendor', @OpenAIVendorId, 0);

-- Bind a credential to a model-vendor combo (overrides vendor binding)
INSERT INTO __mj.AICredentialBinding
    (CredentialID, BindingType, AIModelVendorID, Priority)
VALUES (@AzureCredentialId, 'ModelVendor', @Gpt4AzureModelVendorId, 0);

-- Bind a credential to a specific prompt-model config (highest specificity)
INSERT INTO __mj.AICredentialBinding
    (CredentialID, BindingType, AIPromptModelID, Priority)
VALUES (@SpecialCredentialId, 'PromptModel', @ImportantPromptModelId, 0);
```

### AIVendor.CredentialTypeID

Each vendor can declare what credential type it expects:

```sql
-- AIVendor table has CredentialTypeID FK
AIVendor.CredentialTypeID → CredentialType(ID)
```

This is used for:
1. UI guidance when creating credentials
2. Type-based default resolution (Priority 5)
3. Validation of credential bindings

## Usage Examples

### Example 1: Vendor-Level Default

Set up a default OpenAI credential for all OpenAI models:

```sql
-- Create credential
INSERT INTO __mj.Credential (CredentialTypeID, Name, Values, IsDefault)
VALUES (@ApiKeyTypeId, 'OpenAI Production', '{"apiKey":"sk-..."}', 1);

-- Bind to vendor
INSERT INTO __mj.AICredentialBinding (CredentialID, BindingType, AIVendorID, Priority)
VALUES (@CredentialId, 'Vendor', @OpenAIVendorId, 0);
```

Now all OpenAI models will use this credential automatically.

### Example 2: Model-Vendor Override

Use a different credential for GPT-4 via Azure:

```sql
-- Create Azure credential
INSERT INTO __mj.Credential (CredentialTypeID, Name, Values)
VALUES (@ApiKeyWithEndpointTypeId, 'Azure GPT-4',
        '{"apiKey":"...","endpoint":"https://mycompany.openai.azure.com"}');

-- Bind to model-vendor relationship
INSERT INTO __mj.AICredentialBinding (CredentialID, BindingType, AIModelVendorID, Priority)
VALUES (@AzureCredentialId, 'ModelVendor', @Gpt4AzureModelVendorId, 0);
```

### Example 3: Priority-Based Failover

Set up multiple credentials for failover:

```sql
-- Primary credential (Priority 0 - tried first)
INSERT INTO __mj.AICredentialBinding (CredentialID, BindingType, AIVendorID, Priority)
VALUES (@PrimaryCredentialId, 'Vendor', @OpenAIVendorId, 0);

-- Backup credential (Priority 1 - used if primary fails)
INSERT INTO __mj.AICredentialBinding (CredentialID, BindingType, AIVendorID, Priority)
VALUES (@BackupCredentialId, 'Vendor', @OpenAIVendorId, 1);

-- Emergency credential (Priority 2 - last resort)
INSERT INTO __mj.AICredentialBinding (CredentialID, BindingType, AIVendorID, Priority)
VALUES (@EmergencyCredentialId, 'Vendor', @OpenAIVendorId, 2);
```

### Example 4: Prompt-Specific Override

Use a special credential for a specific prompt:

```sql
-- Create a dedicated credential
INSERT INTO __mj.Credential (CredentialTypeID, Name, Values)
VALUES (@ApiKeyTypeId, 'High-Rate-Limit Key', '{"apiKey":"sk-special..."}');

-- Bind to prompt-model
INSERT INTO __mj.AICredentialBinding (CredentialID, BindingType, AIPromptModelID, Priority)
VALUES (@SpecialCredentialId, 'PromptModel', @ImportantPromptModelId, 0);
```

### Example 5: Per-Request Override (Code)

Override credential at runtime for testing or multi-tenant scenarios:

```typescript
const params = new AIPromptParams();
params.prompt = myPrompt;
params.contextUser = currentUser;
params.credentialId = tenantCredentialId;  // Highest priority

const result = await AIPromptRunner.RunPrompt(params);
```

### Example 6: Disable Binding Temporarily

Disable a binding without deleting it:

```sql
UPDATE __mj.AICredentialBinding
SET IsActive = 0
WHERE ID = @BindingId;
```

The system will skip inactive bindings and try the next priority.

## Legacy Environment Variable Support

For backward compatibility, the system falls back to environment variables when no credentials are configured:

```bash
# Format: AI_VENDOR_API_KEY__<DRIVERCLASS>
AI_VENDOR_API_KEY__OPENAILLM=sk-...
AI_VENDOR_API_KEY__ANTHROPICLLM=sk-ant-...
AI_VENDOR_API_KEY__GROQLLM=gsk-...
AI_VENDOR_API_KEY__AZUREOPENAILLM={"apiKey":"...","endpoint":"..."}
```

### Migration Path

1. **Start**: Use environment variables (current state for most deployments)
2. **Create Credentials**: Add credentials to the database
3. **Create Bindings**: Add entries to AICredentialBinding for vendors/models
4. **Test**: Verify credential resolution works
5. **Clean Up**: Optionally remove environment variables

The legacy support is maintained indefinitely, so you can migrate at your own pace.

## Security Benefits

Using the Credentials system provides:

| Feature | Benefit |
|---------|---------|
| Encrypted at rest | AES-256-GCM encryption for stored values |
| Audit trail | All credential access logged to AuditLog |
| Expiration support | Credentials can have expiration dates |
| Validation endpoints | Optional provider validation |
| Centralized management | UI for credential rotation |
| Multi-tenant ready | Per-organization credentials |
| Decoupled from core data | MJ updates won't affect credential bindings |
| Priority failover | Automatic fallback on credential failures |

## Troubleshooting

### Credential Not Found

If you get "Credential not found" errors:

1. Verify the credential exists in the `Credential` table
2. Check that `IsActive = 1` on the credential
3. Ensure `ExpiresAt` is null or in the future
4. Verify the credential type matches the expected schema
5. Check for active bindings in `AICredentialBinding`

### Wrong Credential Used

If the wrong credential is being used:

1. Check the resolution hierarchy (see table above)
2. Look for bindings at higher specificity levels (PromptModel > ModelVendor > Vendor)
3. Check `Priority` values - lower numbers have higher precedence
4. Use `AIPromptParams.credentialId` to force a specific credential
5. Check `AIPromptRun` records to see which credential was resolved

### Failover Not Working

If credentials aren't failing over as expected:

1. Ensure multiple bindings exist with different `Priority` values
2. Verify all fallback bindings have `IsActive = 1`
3. Check that fallback credentials are not expired
4. Review logs for specific failure reasons

### Legacy Fallback Not Working

If environment variables aren't being used:

1. Ensure no bindings exist in `AICredentialBinding` for the vendor/model
2. Ensure no `IsDefault=1` credential exists matching the vendor's `CredentialTypeID`
3. Check the environment variable name matches exactly: `AI_VENDOR_API_KEY__<DRIVERCLASS>`
4. The driver class name is case-insensitive but should match the registered class

## API Reference

### AIPromptParams Credential Fields

```typescript
interface AIPromptParams {
    /**
     * Optional credential ID for per-request override.
     * Takes highest priority over all other credential sources.
     * When set, legacy authentication methods are ignored.
     */
    credentialId?: string;

    /**
     * Legacy: Array of runtime API key overrides.
     * Only used when no credentials are configured at any level.
     * @deprecated Prefer using credentialId for new implementations
     */
    apiKeys?: AIAPIKey[];
}
```

### AICredentialBinding Entity

```typescript
interface AICredentialBindingEntity {
    ID: string;
    CredentialID: string;
    BindingType: 'Vendor' | 'ModelVendor' | 'PromptModel';
    AIVendorID: string | null;
    AIModelVendorID: string | null;
    AIPromptModelID: string | null;
    Priority: number;  // Lower = higher priority (0 is highest)
    IsActive: boolean;
}
```

### Credential Resolution Function

```typescript
// Internal resolution in AIPromptRunner
private async resolveCredentialForExecution(
    driverClass: string,
    promptId: string | undefined,
    modelId: string | undefined,
    vendorId: string | undefined,
    params: AIPromptParams
): Promise<string>
```

## Related Documentation

- [Credentials System](../../Credentials/README.md) - Core credential management
- [Encryption System](../../Security/Encryption/README.md) - Field-level encryption
- [AI Core Package](../Core/README.md) - Provider abstractions
- [AI Prompts Package](./README.md) - Prompt execution engine

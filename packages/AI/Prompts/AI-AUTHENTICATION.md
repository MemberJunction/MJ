# AI Provider Authentication Guide

This document describes how authentication works for AI providers in MemberJunction, including the credential resolution hierarchy, integration with the Credentials system, and backward compatibility with legacy environment variables.

## Overview

MemberJunction's AI system supports a flexible, hierarchical credential resolution system that allows you to:

1. **Use secure, encrypted credentials** stored in the database via the Credentials system
2. **Override credentials at multiple levels** (vendor, model, prompt, or per-request)
3. **Maintain backward compatibility** with legacy environment variable-based authentication
4. **Support complex authentication schemes** beyond simple API keys (e.g., Azure endpoints, OAuth)

## Architecture Layers

The AI authentication system spans two packages with distinct responsibilities:

| Package | Responsibility | Database Access |
|---------|----------------|-----------------|
| `@memberjunction/ai` | Core LLM abstractions, provider implementations | None (standalone) |
| `@memberjunction/ai-prompts` | Prompt execution, credential resolution | Full database access |

The `@memberjunction/ai` package is intentionally kept free of database dependencies so it can be used standalone in any TypeScript environment. The `@memberjunction/ai-prompts` package handles credential resolution before instantiating models.

## Credential Resolution Hierarchy

When executing a prompt, credentials are resolved in the following order (highest priority first):

| Priority | Source | Entity/Parameter | Use Case |
|----------|--------|------------------|----------|
| 1 | Per-request override | `AIPromptParams.credentialId` | Testing, special cases, multi-tenant |
| 2 | Prompt-Model specific | `AIPromptModel.CredentialID` | Specific prompt uses specific credential |
| 3 | Model-Vendor specific | `AIModelVendor.CredentialID` | Azure OpenAI for GPT-4, etc. |
| 4 | Vendor default | `AIVendor.CredentialID` | Default key for all OpenAI models |
| 5 | Legacy: Runtime array | `AIPromptParams.apiKeys[]` | Legacy runtime override |
| 6 | Legacy: Environment var | `AI_VENDOR_API_KEY__<DRIVER>` | Legacy fallback |

### Important: Credential vs Legacy Precedence

**When ANY credential ID is found (priorities 1-4), the system uses the Credentials path and ignores legacy methods (priorities 5-6).** This ensures that once you migrate to the Credentials system, you get consistent, audited credential usage.

The legacy methods (`apiKeys[]` parameter and environment variables) only apply when no credential IDs are configured at any level.

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

### CredentialID Fields

The following entities have `CredentialID` foreign key fields:

```sql
-- Default credential for all models from this vendor
AIVendor.CredentialID → Credential(ID)

-- Override for specific model+vendor combination
AIModelVendor.CredentialID → Credential(ID)

-- Override for specific prompt+model combination
AIPromptModel.CredentialID → Credential(ID)
```

### Extended Properties

Each `CredentialID` field includes extended properties documenting the resolution hierarchy:

```
MS_Description: "Optional reference to a credential for authentication.
Takes precedence over [parent level] credentials. When set, legacy
authentication methods (environment variables, apiKeys parameter) are ignored."
```

## Usage Examples

### Example 1: Vendor-Level Default

Set up a default OpenAI credential for all OpenAI models:

```sql
-- Create credential
INSERT INTO __mj.Credential (CredentialTypeID, Name, Values, IsDefault)
VALUES (@ApiKeyTypeId, 'OpenAI Production', '{"apiKey":"sk-..."}', 1);

-- Link to vendor
UPDATE __mj.AIVendor
SET CredentialID = @CredentialId
WHERE Name = 'OpenAI';
```

Now all OpenAI models will use this credential automatically.

### Example 2: Model-Vendor Override

Use a different credential for GPT-4 via Azure:

```sql
-- Create Azure credential
INSERT INTO __mj.Credential (CredentialTypeID, Name, Values)
VALUES (@ApiKeyWithEndpointTypeId, 'Azure GPT-4',
        '{"apiKey":"...","endpoint":"https://mycompany.openai.azure.com"}');

-- Link to model-vendor relationship
UPDATE __mj.AIModelVendor
SET CredentialID = @AzureCredentialId
WHERE ModelID = @Gpt4ModelId AND VendorID = @AzureVendorId;
```

### Example 3: Prompt-Specific Override

Use a special credential for a specific prompt:

```sql
-- Create a dedicated credential
INSERT INTO __mj.Credential (CredentialTypeID, Name, Values)
VALUES (@ApiKeyTypeId, 'High-Rate-Limit Key', '{"apiKey":"sk-special..."}');

-- Link to prompt-model
UPDATE __mj.AIPromptModel
SET CredentialID = @SpecialCredentialId
WHERE PromptID = @ImportantPromptId;
```

### Example 4: Per-Request Override (Code)

Override credential at runtime for testing or multi-tenant scenarios:

```typescript
const params = new AIPromptParams();
params.prompt = myPrompt;
params.contextUser = currentUser;
params.credentialId = tenantCredentialId;  // Highest priority

const result = await AIPromptRunner.RunPrompt(params);
```

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
2. **Add Credentials**: Create credentials in the database
3. **Link Credentials**: Set `CredentialID` on `AIVendor` entities
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

## Troubleshooting

### Credential Not Found

If you get "Credential not found" errors:

1. Verify the `CredentialID` exists in the `Credential` table
2. Check that `IsActive = 1` on the credential
3. Ensure `ExpiresAt` is null or in the future
4. Verify the credential type matches the expected schema

### Wrong Credential Used

If the wrong credential is being used:

1. Check the resolution hierarchy (see table above)
2. Look for `CredentialID` at higher priority levels
3. Use `AIPromptParams.credentialId` to force a specific credential
4. Check `AIPromptRun` records to see which credential was resolved

### Legacy Fallback Not Working

If environment variables aren't being used:

1. Ensure no `CredentialID` is set at any level (vendor, model-vendor, prompt-model)
2. Check the environment variable name matches exactly: `AI_VENDOR_API_KEY__<DRIVERCLASS>`
3. The driver class name is case-insensitive but should match the registered class

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
     * Only used when no credentialId is set at any level.
     * @deprecated Prefer using credentialId for new implementations
     */
    apiKeys?: AIAPIKey[];
}
```

### Credential Resolution Function

```typescript
// Internal resolution in AIPromptRunner
private async resolveCredentialForExecution(
    driverClass: string,
    promptModel: AIPromptModelEntity | null,
    modelVendor: AIModelVendorEntity | null,
    vendor: AIVendorEntity | null,
    params: AIPromptParams
): Promise<string>
```

## Related Documentation

- [Credentials System](../../Credentials/README.md) - Core credential management
- [Encryption System](../../Security/Encryption/README.md) - Field-level encryption
- [AI Core Package](../Core/README.md) - Provider abstractions
- [AI Prompts Package](./README.md) - Prompt execution engine

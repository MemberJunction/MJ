# @memberjunction/encryption

Comprehensive and general purpose encryption package. Used for field-level encryption for MemberJunction entities. Field-level encryption provides transparent encrypt-on-save and decrypt-on-load operations, configurable per field via entity metadata. This package can be used for any other use-cases where encryption/decryption is required.

## Features

- **AES-256-GCM Encryption** - Industry-standard authenticated encryption (AEAD) that prevents tampering
- **Pluggable Key Sources** - Environment variables, config files, or custom providers (vault services, cloud KMS)
- **Declarative Configuration** - Enable encryption via EntityField metadata without code changes
- **Transparent Operation** - Automatic encryption on save, decryption on load
- **Key Rotation Support** - Full re-encryption with transactional safety
- **Secure Defaults** - API responses hide encrypted fields by default

## Installation

```bash
npm install @memberjunction/encryption
```

## Quick Start

### 1. Set Up Encryption Key

Create a 256-bit (32 byte) encryption key:

```bash
# Generate a secure key
openssl rand -base64 32
```

Store it in an environment variable:

```bash
export MJ_ENCRYPTION_KEY_PII=your-base64-key-here
```

### 2. Configure the Encryption Key in Database

Run the migration to create encryption infrastructure, then register your key:

```sql
-- Insert your encryption key (after running the migration)
INSERT INTO [${flyway:defaultSchema}].[EncryptionKey] (
    ID, Name, Description, EncryptionKeySourceID, EncryptionAlgorithmID,
    KeyLookupValue, KeyVersion, Marker, IsActive, Status, ActivatedAt
)
VALUES (
    NEWID(),
    'PII Master Key',
    'Encryption key for personally identifiable information',
    '38A961D2-022B-49C2-919F-1825A0E9C6F9',  -- EnvVarKeySource
    'B2E88E95-D09B-4DA6-B0AE-511B21B70952',  -- AES-256-GCM
    'MJ_ENCRYPTION_KEY_PII',
    '1',
    '$ENC$',
    1,
    'Active',
    SYSDATETIMEOFFSET()
);
```

### 3. Enable Encryption on Entity Fields

Update the EntityField metadata to enable encryption:

```sql
UPDATE [${flyway:defaultSchema}].[EntityField]
SET Encrypt = 1,
    EncryptionKeyID = 'your-key-id-here',
    AllowDecryptInAPI = 0,  -- Secure default: don't send plaintext to clients
    SendEncryptedValue = 0  -- Secure default: send null instead of ciphertext
WHERE Entity = 'Contacts'
  AND Name IN ('SSN', 'TaxID', 'BankAccountNumber');
```

### 4. Encrypt Existing Data

After enabling encryption on a field, run the EnableFieldEncryption action:

```typescript
import { EnableFieldEncryptionAction } from '@memberjunction/encryption';

const action = new EnableFieldEncryptionAction();
const result = await action.Run({
    Params: [
        { Name: 'EntityFieldID', Value: 'field-uuid-here' },
        { Name: 'BatchSize', Value: 100 }
    ],
    ContextUser: currentUser
});
```

## API Response Behavior

The encryption system provides secure-by-default API responses:

| AllowDecryptInAPI | SendEncryptedValue | API Response |
|-------------------|-------------------|--------------|
| true | N/A | Decrypted plaintext |
| false | true | Encrypted ciphertext ($ENC$...) |
| false | false | NULL (most secure, **default**) |

## Key Source Providers

### Environment Variable (Default)

The simplest option - store keys in environment variables:

```bash
# Generate a 256-bit key
openssl rand -base64 32

# Set in environment
export MJ_ENCRYPTION_KEY_PII=your-base64-key-here
```

Database configuration:
- **EncryptionKeySourceID**: `38A961D2-022B-49C2-919F-1825A0E9C6F9`
- **KeyLookupValue**: Environment variable name (e.g., `MJ_ENCRYPTION_KEY_PII`)

### Configuration File

Store keys in `mj.config.cjs` (not recommended for production):

```javascript
module.exports = {
    encryptionKeys: {
        pii_master_key: 'base64-encoded-key-here'
    }
};
```

Database configuration:
- **EncryptionKeySourceID**: `CBF9632D-EF05-42E2-82F6-5BAC79FAA565`
- **KeyLookupValue**: Key name in config (e.g., `pii_master_key`)

### AWS KMS

Uses AWS Key Management Service with envelope encryption. Install the optional dependency:

```bash
npm install @aws-sdk/client-kms
```

**Setup:**

1. Create a symmetric CMK in AWS KMS
2. Generate a data key:
   ```bash
   aws kms generate-data-key \
     --key-id alias/your-cmk-alias \
     --key-spec AES_256 \
     --query 'CiphertextBlob' \
     --output text
   ```
3. Store the output (base64 CiphertextBlob) as the KeyLookupValue

**Authentication:** Uses the standard AWS credential chain:
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM role (on EC2, ECS, Lambda)
- Shared credentials file

Database configuration:
- **EncryptionKeySourceID**: `D8E4F521-3A7B-4C9E-8F12-6B5A4C3D2E1F`
- **KeyLookupValue**: Base64-encoded CiphertextBlob from GenerateDataKey

```sql
INSERT INTO [${flyway:defaultSchema}].[EncryptionKey] (
    ID, Name, EncryptionKeySourceID, EncryptionAlgorithmID,
    KeyLookupValue, IsActive, Status
)
VALUES (
    NEWID(),
    'AWS KMS PII Key',
    'D8E4F521-3A7B-4C9E-8F12-6B5A4C3D2E1F',  -- AWS KMS
    'B2E88E95-D09B-4DA6-B0AE-511B21B70952',  -- AES-256-GCM
    'AQIDAHh...base64-ciphertext-blob...',    -- From GenerateDataKey
    1,
    'Active'
);
```

### Azure Key Vault

Retrieves keys from Azure Key Vault secrets. Install the optional dependencies:

```bash
npm install @azure/keyvault-secrets @azure/identity
```

**Setup:**

1. Create an Azure Key Vault
2. Create a secret containing your base64-encoded key:
   ```bash
   # Generate key
   KEY=$(openssl rand -base64 32)

   # Store in Key Vault
   az keyvault secret set \
     --vault-name your-vault-name \
     --name mj-encryption-key \
     --value "$KEY"
   ```

**Authentication:** Uses DefaultAzureCredential:
- Managed Identity (on Azure VMs, App Service, Functions)
- Service principal (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`)
- Azure CLI credentials

Database configuration:
- **EncryptionKeySourceID**: `A2B3C4D5-E6F7-8901-2345-6789ABCDEF01`
- **KeyLookupValue**: Full secret URL or secret name (if `AZURE_KEYVAULT_URL` is set)

```sql
INSERT INTO [${flyway:defaultSchema}].[EncryptionKey] (
    ID, Name, EncryptionKeySourceID, EncryptionAlgorithmID,
    KeyLookupValue, IsActive, Status
)
VALUES (
    NEWID(),
    'Azure Key Vault PII Key',
    'A2B3C4D5-E6F7-8901-2345-6789ABCDEF01',  -- Azure Key Vault
    'B2E88E95-D09B-4DA6-B0AE-511B21B70952',  -- AES-256-GCM
    'https://your-vault.vault.azure.net/secrets/mj-encryption-key',
    1,
    'Active'
);
```

**Tip:** Set `AZURE_KEYVAULT_URL` to use short secret names:
```bash
export AZURE_KEYVAULT_URL=https://your-vault.vault.azure.net
# Then KeyLookupValue can just be: mj-encryption-key
```

### Custom Provider

Extend `EncryptionKeySourceBase` for other vault services:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { EncryptionKeySourceBase } from '@memberjunction/encryption';

@RegisterClass(EncryptionKeySourceBase, 'HashiCorpVaultKeySource')
export class HashiCorpVaultKeySource extends EncryptionKeySourceBase {
    get SourceName(): string { return 'HashiCorp Vault'; }

    ValidateConfiguration(): boolean {
        return !!process.env.VAULT_ADDR && !!process.env.VAULT_TOKEN;
    }

    async GetKey(lookupValue: string): Promise<Buffer> {
        // Implement vault API call to retrieve secret
        // Return the key as a Buffer
    }

    async KeyExists(lookupValue: string): Promise<boolean> {
        // Check if secret exists at path
    }
}
```

## Key Rotation

Rotate keys without downtime using the RotateEncryptionKey action:

```typescript
import { RotateEncryptionKeyAction } from '@memberjunction/encryption';

// 1. Deploy new key to environment
// export MJ_ENCRYPTION_KEY_PII_V2=new-base64-key-here

// 2. Run rotation
const action = new RotateEncryptionKeyAction();
const result = await action.Run({
    Params: [
        { Name: 'EncryptionKeyID', Value: 'existing-key-uuid' },
        { Name: 'NewKeyLookupValue', Value: 'MJ_ENCRYPTION_KEY_PII_V2' },
        { Name: 'BatchSize', Value: 100 }
    ],
    ContextUser: currentUser
});

// 3. After rotation, update environment to use new key
// export MJ_ENCRYPTION_KEY_PII=new-key-value
// Remove MJ_ENCRYPTION_KEY_PII_V2
```

## Programmatic API

### EncryptionEngine

```typescript
import { EncryptionEngine } from '@memberjunction/encryption';

const engine = EncryptionEngine.Instance;

// Encrypt a value
const encrypted = await engine.Encrypt(
    'sensitive-data',
    encryptionKeyId,
    contextUser
);

// Decrypt a value
const decrypted = await engine.Decrypt(encrypted, contextUser);

// Check if a value is encrypted
if (engine.IsEncrypted(someValue)) {
    const parts = engine.ParseEncryptedValue(someValue);
    console.log(`Encrypted with key: ${parts.keyId}`);
}

// Clear caches (after key rotation)
engine.ClearCaches();
```

## API Key Management

The `EncryptionEngine` provides secure API key management for authentication scenarios like MCP servers, external integrations, and programmatic access.

### Creating API Keys

```typescript
import { EncryptionEngine } from '@memberjunction/encryption';

const result = await EncryptionEngine.Instance.CreateAPIKey({
    userId: 'user-guid-here',
    label: 'MCP Server Integration',
    description: 'Used for Claude Desktop MCP connections',
    expiresAt: new Date('2025-12-31') // Optional - omit for non-expiring keys
}, contextUser);

if (result.success) {
    // CRITICAL: Save this key immediately - it cannot be recovered!
    console.log('Your API Key:', result.rawKey);
    console.log('API Key ID:', result.apiKeyId);
} else {
    console.error('Failed to create API key:', result.error);
}
```

**Key Format**: `mj_sk_[64 hex characters]` (70 characters total)

**Security**: Only the SHA-256 hash is stored in the database. The raw key is returned exactly once at creation time and cannot be recovered.

### Validating API Keys

```typescript
const validation = await EncryptionEngine.Instance.ValidateAPIKey(
    request.headers['x-api-key'],
    systemUser
);

if (validation.isValid) {
    // Use validation.user for authorized operations
    console.log('Authenticated user:', validation.user.Name);
    console.log('API Key ID:', validation.apiKeyId);
} else {
    throw new Error(validation.error);
}
```

The validation method:
- Checks key format
- Looks up the hash in the CredentialEngine cache (fast!)
- Verifies the key is active and not expired
- Loads the associated user from the database
- Updates `LastUsedAt` and logs usage

### Other API Key Methods

```typescript
// Generate a key without storing it (for custom storage scenarios)
const { raw, hash } = EncryptionEngine.Instance.GenerateAPIKey();

// Hash a key for manual comparison
const keyHash = EncryptionEngine.Instance.HashAPIKey(rawKey);

// Validate key format before processing
if (!EncryptionEngine.Instance.IsValidAPIKeyFormat(key)) {
    throw new Error('Invalid API key format');
}

// Revoke an API key (permanently disables it)
const revoked = await EncryptionEngine.Instance.RevokeAPIKey(apiKeyId, contextUser);
```

### API Key Database Schema

The API key system uses these tables (part of MemberJunction core):

**MJ: API Keys**
- `ID` - Unique identifier
- `Hash` - SHA-256 hash of the raw key
- `UserID` - Associated user (operations execute with this user's permissions)
- `Label` - Friendly name
- `Status` - `Active` or `Revoked`
- `ExpiresAt` - Optional expiration date
- `LastUsedAt` - Automatically updated on each use

**MJ: API Key Usage Logs**
- Tracks API key usage for analytics and security monitoring

## Encrypted Value Format

Encrypted values are stored as self-describing strings:

```
$ENC$<keyId>$<algorithm>$<iv>$<ciphertext>$<authTag>
```

Example:
```
$ENC$550e8400-e29b-41d4-a716-446655440000$AES-256-GCM$Base64IV$Base64Ciphertext$Base64AuthTag
```

This format allows:
- Quick detection of encrypted values
- Identification of which key was used
- Algorithm-agnostic decryption
- Future-proof key rotation

## Security Considerations

1. **Key Management**
   - Never store keys in the database
   - Use environment variables or secure vault services
   - Rotate keys regularly (recommended: annually)
   - Generate keys with `openssl rand -base64 32`

2. **Authenticated Encryption**
   - AES-256-GCM provides both confidentiality and integrity
   - Auth tag prevents tampering with ciphertext
   - Random IVs prevent pattern analysis

3. **API Security**
   - Default: encrypted fields return `null` to clients
   - Explicitly enable `AllowDecryptInAPI` only when needed
   - Consider using `SendEncryptedValue` for client-side decryption scenarios

4. **Key Rotation**
   - Plan for rotation before key compromise
   - Test rotation in staging environment first
   - Monitor rotation progress for large datasets
   - Keep old keys accessible until rotation completes

## Database Schema

The encryption infrastructure includes three new tables:

- **MJ: Encryption Key Sources** - Where keys come from (env vars, config, vaults)
- **MJ: Encryption Algorithms** - Available algorithms (AES-256-GCM, etc.)
- **MJ: Encryption Keys** - Configured keys linking sources and algorithms

EntityField extensions:
- **Encrypt** - Enable encryption for this field
- **EncryptionKeyID** - Which key to use
- **AllowDecryptInAPI** - Whether to decrypt in API responses
- **SendEncryptedValue** - Send ciphertext when decryption not allowed

## Performance

- Key configurations are cached with 5-minute TTL
- Key material is cached with 5-minute TTL
- Encryption/decryption uses Node.js native crypto (fast)
- Batch processing for key rotation and initial encryption
- Lazy loading - encryption engine only activated when needed

## Troubleshooting

### "Encryption key not found"
- Check that the key exists in `MJ: Encryption Keys` table
- Verify `IsActive = 1` and `Status = 'Active'`
- Check that the referenced algorithm and source are also active

### "Key length mismatch"
- Ensure your key is exactly 32 bytes (256 bits) for AES-256
- Generate with: `openssl rand -base64 32`
- The base64 string should be ~44 characters

### "Failed to decrypt"
- The key may have been rotated - check KeyVersion
- The data may be corrupted
- Auth tag mismatch indicates tampering

### API returns null for encrypted fields
- Check `AllowDecryptInAPI` flag on the EntityField
- Default is `false` for security
- Update to `true` if API clients need plaintext

## License

ISC

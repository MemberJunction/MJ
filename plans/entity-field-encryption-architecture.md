# Entity Field-Level Encryption Architecture

**Status:** Proposed
**Author:** Claude Code
**Created:** 2025-12-05
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Goals & Non-Goals](#goals--non-goals)
3. [Current Architecture Analysis](#current-architecture-analysis)
4. [Proposed Entity Model](#proposed-entity-model)
5. [Key Source Provider Pattern](#key-source-provider-pattern)
6. [Encryption Engine Design](#encryption-engine-design)
7. [Integration Points](#integration-points)
8. [Server-Side vs Client-Side Decryption](#server-side-vs-client-side-decryption)
9. [Encrypted Value Format](#encrypted-value-format)
10. [Key Rotation Strategy](#key-rotation-strategy)
11. [Database Migration](#database-migration)
12. [Implementation Phases](#implementation-phases)
13. [Security Considerations](#security-considerations)
14. [Performance Considerations](#performance-considerations)
15. [Future Enhancements](#future-enhancements)

---

## Executive Summary

This document proposes a comprehensive field-level encryption system for MemberJunction that allows developers to enable encryption on any entity field through metadata configuration. The system provides:

- **Declarative encryption**: Toggle encryption on/off per field via EntityField metadata
- **Pluggable key sources**: Abstract provider pattern for retrieving keys from various sources (env vars, vaults, config files)
- **Multiple algorithms**: Support for different encryption algorithms (AES-256-GCM, AES-256-CBC, etc.)
- **Flexible decryption control**: Option to keep data encrypted in API responses or decrypt before sending to client
- **Key rotation support**: Built-in versioning for safe key rotation without data loss

### Why This Fits MJ Architecture

After thorough analysis of the MemberJunction codebase, this feature is an excellent fit because:

1. **`ProcessEntityRows()`** in SQLServerDataProvider already transforms field data (dates) - perfect hook for decryption
2. **`generateSPParams()`** is where field values are extracted for SQL - perfect hook for encryption
3. **`@RegisterClass` + ClassFactory** pattern is proven for pluggable providers (Auth, Storage, AI)
4. **EntityField metadata** is designed to be extensible with new columns

---

## Goals & Non-Goals

### Goals

- Enable field-level encryption through simple metadata configuration
- Support multiple key storage backends (env vars initially, vaults later)
- Allow both server-side-only and client-visible decryption
- Provide automatic encryption on save and decryption on load
- Support key rotation without data migration downtime
- Follow existing MJ patterns and conventions

### Non-Goals

- **Searchability of encrypted fields** - encrypted fields will not be searchable (by design for security)
- **Client-side encryption/decryption** - all crypto operations happen server-side
- **Transparent database encryption (TDE)** - this is field-level application encryption, not database-level
- **Homomorphic encryption** - no computation on encrypted data

---

## Current Architecture Analysis

### Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CURRENT DATA FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────── WRITE PATH ────────────────────────┐         │
│  │                                                             │         │
│  │  Client → BaseEntity.Set() → BaseEntity.Save()              │         │
│  │           → generateSPParams() [line 2420-2470]             │         │
│  │           → let value = field.Value  ◄── ENCRYPT HERE       │         │
│  │           → SQL execution                                   │         │
│  │                                                             │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ┌──────────────────────── READ PATH ─────────────────────────┐         │
│  │                                                             │         │
│  │  Path A: Direct SQL (99% of reads - resolvers)             │         │
│  │  SQL → Raw Data → MapFieldNames → Client                   │         │
│  │         ↑                                                   │         │
│  │    ProcessEntityRows() [line 3605] ◄── DECRYPT HERE        │         │
│  │                                                             │         │
│  │  Path B: RunView with ResultType='entity_object'           │         │
│  │  SQL → ProcessEntityRows → LoadFromData → BaseEntity        │         │
│  │                                                             │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Files & Locations

| File | Purpose | Encryption Role |
|------|---------|-----------------|
| `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | Data provider | Encryption/decryption hooks |
| `packages/MJCore/src/generic/baseEntity.ts` | Entity base class | Field access patterns |
| `packages/MJCoreEntities/src/generated/entity_subclasses.ts` | Generated entities | EntityField metadata |
| `packages/MJServer/src/generated/generated.ts` | GraphQL resolvers | API data flow |
| `packages/MJGlobal/src/ClassFactory.ts` | Plugin system | Provider registration |

### Existing Transformation Pattern

The `ProcessEntityRows()` method already performs field-level transformations (datetime handling), providing a proven pattern:

```typescript
// From SQLServerDataProvider.ts line 3605-3682
public async ProcessEntityRows(rows: any[], entityInfo: EntityInfo): Promise<any[]> {
    // Find fields needing transformation
    const datetimeFields = entityInfo.Fields.filter(
        (field) => field.TSType === EntityFieldTSType.Date
    );

    // Process each row
    return rows.map((row) => {
        const processedRow = { ...row };
        for (const field of datetimeFields) {
            // Transform field value
            processedRow[field.Name] = transformedValue;
        }
        return processedRow;
    });
}
```

This pattern will be extended for encryption/decryption.

---

## Proposed Entity Model

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ENCRYPTION ENTITY MODEL                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────┐     ┌────────────────────────┐              │
│  │ MJ: Encryption Key     │     │ MJ: Encryption         │              │
│  │      Sources           │     │      Algorithms        │              │
│  ├────────────────────────┤     ├────────────────────────┤              │
│  │ ID                     │     │ ID                     │              │
│  │ Name         (unique)  │     │ Name         (unique)  │              │
│  │ Description            │     │ Description            │              │
│  │ DriverClass            │     │ NodeCryptoName         │              │
│  │ DriverImportPath       │     │ KeyLengthBits          │              │
│  │ ConfigTemplate (JSON)  │     │ IVLengthBytes          │              │
│  │ IsActive               │     │ IsAEAD                 │              │
│  │ Status                 │     │ IsActive               │              │
│  └────────────┬───────────┘     └───────────┬────────────┘              │
│               │                             │                            │
│               │ FK                          │ FK                         │
│               ▼                             ▼                            │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │                   MJ: Encryption Keys                       │         │
│  ├────────────────────────────────────────────────────────────┤         │
│  │ ID                                                          │         │
│  │ Name                    (unique)                            │         │
│  │ Description                                                 │         │
│  │ EncryptionKeySourceID   FK → Encryption Key Sources         │         │
│  │ EncryptionAlgorithmID   FK → Encryption Algorithms          │         │
│  │ KeyLookupValue          (e.g., env var name, vault path)    │         │
│  │ KeyVersion              (for key rotation support)          │         │
│  │ Marker                  (e.g., "$ENC$")                     │         │
│  │ IsActive                                                    │         │
│  │ Status                  (Active/Inactive/Rotating/Expired)  │         │
│  │ ActivatedAt                                                 │         │
│  │ ExpiresAt                                                   │         │
│  └────────────────────────────────────────────────────────────┘         │
│               │                                                          │
│               │ Referenced by                                            │
│               ▼                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │                     EntityField (extended)                  │         │
│  ├────────────────────────────────────────────────────────────┤         │
│  │ ... existing columns ...                                    │         │
│  │ + Encrypt                 (bit, default 0)                  │         │
│  │ + EncryptionKeyID         (FK → MJ: Encryption Keys)        │         │
│  │ + AllowDecryptInAPI       (bit, default 1)                  │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Entity Definitions

#### MJ: Encryption Key Sources

Defines where encryption keys are retrieved from.

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(100) | Unique name (e.g., "Environment Variable") |
| Description | nvarchar(max) | Human-readable description |
| DriverClass | nvarchar(255) | TypeScript class name (e.g., "EnvVarKeySource") |
| DriverImportPath | nvarchar(500) | Package path (e.g., "@memberjunction/core") |
| ConfigTemplate | nvarchar(max) | JSON template for source-specific config |
| IsActive | bit | Whether this source type is available |
| Status | nvarchar(20) | Active/Inactive/Deprecated |

**Initial Key Sources:**
- Environment Variable - reads from `process.env`
- Configuration File - reads from `mj.config.cjs`
- (Future) AWS KMS
- (Future) Azure Key Vault
- (Future) HashiCorp Vault

#### MJ: Encryption Algorithms

Defines available encryption algorithms.

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(50) | Unique name (e.g., "AES-256-GCM") |
| Description | nvarchar(max) | Human-readable description |
| NodeCryptoName | nvarchar(50) | Node.js crypto algorithm name (e.g., "aes-256-gcm") |
| KeyLengthBits | int | Required key length in bits |
| IVLengthBytes | int | Required IV length in bytes |
| IsAEAD | bit | Whether algorithm provides authenticated encryption |
| IsActive | bit | Whether this algorithm is available |

**Initial Algorithms:**
- AES-256-GCM (recommended, authenticated)
- AES-256-CBC (legacy compatibility)
- AES-128-GCM (smaller key size option)

#### MJ: Encryption Keys

Defines specific encryption keys and their configuration.

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | Primary key |
| Name | nvarchar(100) | Unique key name (e.g., "PII Master Key") |
| Description | nvarchar(max) | Purpose/scope of this key |
| EncryptionKeySourceID | uniqueidentifier | FK to key source |
| EncryptionAlgorithmID | uniqueidentifier | FK to algorithm |
| KeyLookupValue | nvarchar(500) | Source-specific lookup (env var name, vault path) |
| KeyVersion | nvarchar(20) | Version string for rotation (default "1") |
| Marker | nvarchar(20) | Prefix for encrypted values (default "$ENC$") |
| IsActive | bit | Whether key can be used for new encryption |
| Status | nvarchar(20) | Active/Inactive/Rotating/Expired |
| ActivatedAt | datetimeoffset | When key became active |
| ExpiresAt | datetimeoffset | Optional expiration date |

#### EntityField Extensions

New columns added to the existing EntityField table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| Encrypt | bit | 0 | Enable encryption for this field |
| EncryptionKeyID | uniqueidentifier | NULL | FK to encryption key to use |
| AllowDecryptInAPI | bit | 1 | Whether to decrypt in API responses |

---

## Key Source Provider Pattern

Following MJ's established extensibility patterns (similar to Auth providers, Storage providers, AI providers):

### Abstract Base Class

```typescript
// packages/MJCore/src/generic/encryption/EncryptionKeySourceBase.ts

import { EncryptionKeySourceConfig } from './interfaces';

/**
 * Abstract base class for encryption key sources.
 * Implementations provide different ways to retrieve encryption keys
 * (environment variables, vault services, config files, etc.)
 */
export abstract class EncryptionKeySourceBase {
    protected config: EncryptionKeySourceConfig;

    constructor(config: EncryptionKeySourceConfig) {
        this.config = config;
    }

    /** Human-readable name of the key source */
    abstract get SourceName(): string;

    /** Validates that the source is properly configured */
    abstract validateConfiguration(): boolean;

    /**
     * Retrieves the raw key material for the given lookup value
     * @param lookupValue - The identifier for the key (e.g., env var name)
     * @param keyVersion - Optional version for versioned key stores
     * @returns Buffer containing the raw key bytes
     */
    abstract getKey(lookupValue: string, keyVersion?: string): Promise<Buffer>;

    /**
     * Checks if a key exists without retrieving it
     * @param lookupValue - The identifier for the key
     */
    abstract keyExists(lookupValue: string): Promise<boolean>;

    /** Optional async initialization for sources that need setup */
    async initialize(): Promise<void> { }

    /** Optional cleanup for sources with connections */
    async dispose(): Promise<void> { }
}
```

### Environment Variable Implementation

```typescript
// packages/MJCore/src/generic/encryption/providers/EnvVarKeySource.ts

import { RegisterClass } from '@memberjunction/global';
import { EncryptionKeySourceBase } from '../EncryptionKeySourceBase';

@RegisterClass(EncryptionKeySourceBase, 'EnvVarKeySource')
export class EnvVarKeySource extends EncryptionKeySourceBase {

    get SourceName(): string {
        return 'Environment Variable';
    }

    validateConfiguration(): boolean {
        // Always valid - keys are validated at lookup time
        return true;
    }

    async keyExists(lookupValue: string): Promise<boolean> {
        return process.env[lookupValue] !== undefined;
    }

    async getKey(lookupValue: string, keyVersion?: string): Promise<Buffer> {
        // For env vars, version is typically appended: KEY_NAME_V2
        const envVarName = keyVersion && keyVersion !== '1'
            ? `${lookupValue}_V${keyVersion}`
            : lookupValue;

        const keyValue = process.env[envVarName];

        if (!keyValue) {
            throw new Error(
                `Encryption key not found in environment variable: ${envVarName}. ` +
                `Ensure the environment variable is set with a base64-encoded key.`
            );
        }

        // Keys should be base64 encoded in env vars
        try {
            return Buffer.from(keyValue, 'base64');
        } catch (e) {
            throw new Error(
                `Invalid base64 encoding for encryption key in ${envVarName}. ` +
                `Keys must be base64-encoded.`
            );
        }
    }
}
```

### Configuration File Implementation

```typescript
// packages/MJCore/src/generic/encryption/providers/ConfigFileKeySource.ts

import { RegisterClass } from '@memberjunction/global';
import { EncryptionKeySourceBase } from '../EncryptionKeySourceBase';
import { cosmiconfigSync } from 'cosmiconfig';

@RegisterClass(EncryptionKeySourceBase, 'ConfigFileKeySource')
export class ConfigFileKeySource extends EncryptionKeySourceBase {
    private config: Record<string, string> | null = null;

    get SourceName(): string {
        return 'Configuration File';
    }

    async initialize(): Promise<void> {
        const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
        const result = explorer.search();

        if (result?.config?.encryptionKeys) {
            this.config = result.config.encryptionKeys;
        }
    }

    validateConfiguration(): boolean {
        return this.config !== null;
    }

    async keyExists(lookupValue: string): Promise<boolean> {
        return this.config?.[lookupValue] !== undefined;
    }

    async getKey(lookupValue: string, keyVersion?: string): Promise<Buffer> {
        if (!this.config) {
            throw new Error('Configuration file not loaded. Call initialize() first.');
        }

        const keyName = keyVersion && keyVersion !== '1'
            ? `${lookupValue}_v${keyVersion}`
            : lookupValue;

        const keyValue = this.config[keyName];

        if (!keyValue) {
            throw new Error(
                `Encryption key "${keyName}" not found in configuration file. ` +
                `Add it to the "encryptionKeys" section of mj.config.cjs.`
            );
        }

        return Buffer.from(keyValue, 'base64');
    }
}
```

### Future Provider Stubs

```typescript
// Future implementations following the same pattern:

// @RegisterClass(EncryptionKeySourceBase, 'AWSKMSKeySource')
// export class AWSKMSKeySource extends EncryptionKeySourceBase { ... }

// @RegisterClass(EncryptionKeySourceBase, 'AzureKeyVaultKeySource')
// export class AzureKeyVaultKeySource extends EncryptionKeySourceBase { ... }

// @RegisterClass(EncryptionKeySourceBase, 'HashiCorpVaultKeySource')
// export class HashiCorpVaultKeySource extends EncryptionKeySourceBase { ... }
```

---

## Encryption Engine Design

### Core Engine Class

```typescript
// packages/MJCore/src/generic/encryption/EncryptionEngine.ts

import * as crypto from 'crypto';
import { MJGlobal } from '@memberjunction/global';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { EncryptionKeySourceBase } from './EncryptionKeySourceBase';
import {
    EncryptionKeyEntity,
    EncryptionAlgorithmEntity,
    EncryptionKeySourceEntity
} from '@memberjunction/core-entities';

export interface EncryptedValueParts {
    marker: string;
    keyId: string;
    keyVersion: string;
    algorithm: string;
    iv: string;
    ciphertext: string;
    authTag?: string;
}

export interface KeyConfiguration {
    keyId: string;
    keyVersion: string;
    marker: string;
    algorithm: {
        name: string;
        nodeCryptoName: string;
        keyLengthBits: number;
        ivLengthBytes: number;
        isAEAD: boolean;
    };
    source: {
        driverClass: string;
        lookupValue: string;
    };
}

export class EncryptionEngine {
    private static _instance: EncryptionEngine;

    // Cache for key material (key ID + version -> Buffer)
    private keyMaterialCache: Map<string, { key: Buffer; expiry: Date }> = new Map();

    // Cache for key configurations (key ID -> KeyConfiguration)
    private keyConfigCache: Map<string, { config: KeyConfiguration; expiry: Date }> = new Map();

    // Cache for key source instances (driver class -> instance)
    private keySourceCache: Map<string, EncryptionKeySourceBase> = new Map();

    // Cache TTL in milliseconds (5 minutes default)
    private readonly CACHE_TTL_MS = 5 * 60 * 1000;

    private constructor() {}

    static get Instance(): EncryptionEngine {
        if (!this._instance) {
            this._instance = new EncryptionEngine();
        }
        return this._instance;
    }

    /**
     * Encrypts a value using the specified encryption key configuration
     * @param plaintext - The value to encrypt (string or Buffer)
     * @param encryptionKeyId - The ID of the encryption key to use
     * @param contextUser - User context for metadata access
     * @returns Serialized encrypted value string
     */
    async encrypt(
        plaintext: string | Buffer,
        encryptionKeyId: string,
        contextUser?: UserInfo
    ): Promise<string> {
        if (plaintext === null || plaintext === undefined) {
            return plaintext as unknown as string;
        }

        const keyConfig = await this.getKeyConfiguration(encryptionKeyId, contextUser);
        const keyMaterial = await this.getKeyMaterial(keyConfig, contextUser);

        // Generate random IV
        const iv = crypto.randomBytes(keyConfig.algorithm.ivLengthBytes);

        // Create cipher
        const cipher = crypto.createCipheriv(
            keyConfig.algorithm.nodeCryptoName,
            keyMaterial,
            iv,
            keyConfig.algorithm.isAEAD ? { authTagLength: 16 } : undefined
        );

        // Encrypt
        const data = typeof plaintext === 'string'
            ? Buffer.from(plaintext, 'utf8')
            : plaintext;
        const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);

        // Build serialized format
        const parts = [
            keyConfig.marker,
            encryptionKeyId,
            keyConfig.keyVersion,
            keyConfig.algorithm.name,
            iv.toString('base64'),
            ciphertext.toString('base64')
        ];

        // Add auth tag for AEAD algorithms
        if (keyConfig.algorithm.isAEAD) {
            const authTag = cipher.getAuthTag();
            parts.push(authTag.toString('base64'));
        }

        return parts.join('$');
    }

    /**
     * Decrypts a value if it's encrypted, returns original value if not
     * @param value - The value to decrypt (may or may not be encrypted)
     * @param contextUser - User context for metadata access
     * @returns Decrypted value or original if not encrypted
     */
    async decrypt(
        value: string,
        contextUser?: UserInfo
    ): Promise<string> {
        if (!this.isEncrypted(value)) {
            return value;
        }

        const parsed = this.parseEncryptedValue(value);
        const keyConfig = await this.getKeyConfiguration(parsed.keyId, contextUser);
        const keyMaterial = await this.getKeyMaterial(keyConfig, contextUser, parsed.keyVersion);

        // Create decipher
        const decipher = crypto.createDecipheriv(
            keyConfig.algorithm.nodeCryptoName,
            keyMaterial,
            Buffer.from(parsed.iv, 'base64'),
            keyConfig.algorithm.isAEAD ? { authTagLength: 16 } : undefined
        );

        // Set auth tag for AEAD algorithms
        if (parsed.authTag && keyConfig.algorithm.isAEAD) {
            decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64'));
        }

        // Decrypt
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
            decipher.final()
        ]);

        return plaintext.toString('utf8');
    }

    /**
     * Checks if a value is encrypted (has the encryption marker)
     */
    isEncrypted(value: unknown): boolean {
        return typeof value === 'string' && value.startsWith('$ENC$');
    }

    /**
     * Parses an encrypted value string into its component parts
     */
    parseEncryptedValue(value: string): EncryptedValueParts {
        const parts = value.split('$').filter(p => p !== '');

        if (parts.length < 6) {
            throw new Error(`Invalid encrypted value format: expected at least 6 parts, got ${parts.length}`);
        }

        return {
            marker: '$' + parts[0] + '$',
            keyId: parts[1],
            keyVersion: parts[2],
            algorithm: parts[3],
            iv: parts[4],
            ciphertext: parts[5],
            authTag: parts[6] // May be undefined for non-AEAD
        };
    }

    /**
     * Gets the key configuration from cache or database
     */
    private async getKeyConfiguration(
        keyId: string,
        contextUser?: UserInfo
    ): Promise<KeyConfiguration> {
        const cacheKey = keyId;
        const cached = this.keyConfigCache.get(cacheKey);

        if (cached && cached.expiry > new Date()) {
            return cached.config;
        }

        // Load from database
        const rv = new RunView();
        const keyResult = await rv.RunView<EncryptionKeyEntity>({
            EntityName: 'MJ: Encryption Keys',
            ExtraFilter: `ID = '${keyId}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!keyResult.Success || keyResult.Results.length === 0) {
            throw new Error(`Encryption key not found: ${keyId}`);
        }

        const key = keyResult.Results[0];

        // Load algorithm
        const algoResult = await rv.RunView<EncryptionAlgorithmEntity>({
            EntityName: 'MJ: Encryption Algorithms',
            ExtraFilter: `ID = '${key.EncryptionAlgorithmID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!algoResult.Success || algoResult.Results.length === 0) {
            throw new Error(`Encryption algorithm not found: ${key.EncryptionAlgorithmID}`);
        }

        const algo = algoResult.Results[0];

        // Load source
        const sourceResult = await rv.RunView<EncryptionKeySourceEntity>({
            EntityName: 'MJ: Encryption Key Sources',
            ExtraFilter: `ID = '${key.EncryptionKeySourceID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!sourceResult.Success || sourceResult.Results.length === 0) {
            throw new Error(`Encryption key source not found: ${key.EncryptionKeySourceID}`);
        }

        const source = sourceResult.Results[0];

        const config: KeyConfiguration = {
            keyId: key.ID,
            keyVersion: key.KeyVersion,
            marker: key.Marker || '$ENC$',
            algorithm: {
                name: algo.Name,
                nodeCryptoName: algo.NodeCryptoName,
                keyLengthBits: algo.KeyLengthBits,
                ivLengthBytes: algo.IVLengthBytes,
                isAEAD: algo.IsAEAD
            },
            source: {
                driverClass: source.DriverClass,
                lookupValue: key.KeyLookupValue
            }
        };

        // Cache it
        this.keyConfigCache.set(cacheKey, {
            config,
            expiry: new Date(Date.now() + this.CACHE_TTL_MS)
        });

        return config;
    }

    /**
     * Gets the actual key material (bytes) from the key source
     */
    private async getKeyMaterial(
        config: KeyConfiguration,
        contextUser?: UserInfo,
        overrideVersion?: string
    ): Promise<Buffer> {
        const version = overrideVersion || config.keyVersion;
        const cacheKey = `${config.keyId}:${version}`;

        const cached = this.keyMaterialCache.get(cacheKey);
        if (cached && cached.expiry > new Date()) {
            return cached.key;
        }

        // Get or create key source instance
        let source = this.keySourceCache.get(config.source.driverClass);

        if (!source) {
            source = MJGlobal.Instance.ClassFactory.CreateInstance<EncryptionKeySourceBase>(
                EncryptionKeySourceBase,
                config.source.driverClass
            );
            await source.initialize();
            this.keySourceCache.set(config.source.driverClass, source);
        }

        // Get key from source
        const keyMaterial = await source.getKey(config.source.lookupValue, version);

        // Validate key length
        const expectedBytes = config.algorithm.keyLengthBits / 8;
        if (keyMaterial.length !== expectedBytes) {
            throw new Error(
                `Key length mismatch: expected ${expectedBytes} bytes for ${config.algorithm.name}, ` +
                `got ${keyMaterial.length} bytes`
            );
        }

        // Cache it
        this.keyMaterialCache.set(cacheKey, {
            key: keyMaterial,
            expiry: new Date(Date.now() + this.CACHE_TTL_MS)
        });

        return keyMaterial;
    }

    /**
     * Clears all caches - useful for testing or after key rotation
     */
    clearCaches(): void {
        this.keyMaterialCache.clear();
        this.keyConfigCache.clear();
    }
}
```

---

## Integration Points

### 1. Encryption on Save

**Location:** `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`
**Method:** `generateSPParams()` around line 2444

```typescript
// Current code:
let value = theField.Value;

// New code with encryption:
let value = theField.Value;

// Encrypt if field is marked for encryption
if (theField.EntityFieldInfo.Encrypt && value != null && value !== '') {
    const encryptionKeyId = theField.EntityFieldInfo.EncryptionKeyID;
    if (encryptionKeyId) {
        value = await EncryptionEngine.Instance.encrypt(
            value.toString(),
            encryptionKeyId,
            contextUser
        );
    } else {
        LogError(`Field ${theField.Name} has Encrypt=true but no EncryptionKeyID`);
    }
}
```

### 2. Decryption on Load

**Location:** `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts`
**Method:** `ProcessEntityRows()` around line 3605

```typescript
public async ProcessEntityRows(
    rows: any[],
    entityInfo: EntityInfo,
    contextUser?: UserInfo  // NEW: Add context user parameter
): Promise<any[]> {
    if (!rows || rows.length === 0) {
        return rows;
    }

    // ... existing datetime processing ...

    // NEW: Find encrypted fields that allow API decryption
    const encryptedFields = entityInfo.Fields.filter(
        f => f.Encrypt && f.AllowDecryptInAPI
    );

    if (encryptedFields.length > 0) {
        const encryptionEngine = EncryptionEngine.Instance;

        for (const row of processedRows) {
            for (const field of encryptedFields) {
                const value = row[field.Name];

                if (value && encryptionEngine.isEncrypted(value)) {
                    try {
                        row[field.Name] = await encryptionEngine.decrypt(
                            value,
                            contextUser
                        );
                    } catch (e) {
                        LogError(`Failed to decrypt field ${field.Name}: ${e.message}`);
                        // Leave encrypted value as-is on failure
                    }
                }
            }
        }
    }

    return processedRows;
}
```

### 3. EntityFieldInfo Extension

**Location:** `packages/MJCore/src/generic/entityInfo.ts`

Add new properties to `EntityFieldInfo`:

```typescript
export class EntityFieldInfo {
    // ... existing properties ...

    /** Whether this field should be encrypted at rest */
    public Encrypt: boolean = false;

    /** The encryption key ID to use for this field */
    public EncryptionKeyID: string | null = null;

    /** Whether to decrypt this field when returning via API */
    public AllowDecryptInAPI: boolean = true;
}
```

---

## Server-Side vs Client-Side Decryption

The `AllowDecryptInAPI` flag provides fine-grained control:

### Behavior Matrix

| Encrypt | AllowDecryptInAPI | API Response | Server Access |
|---------|-------------------|--------------|---------------|
| false | N/A | Plaintext | Plaintext |
| true | true | Decrypted | Decrypted |
| true | false | Encrypted ($ENC$...) | Can decrypt via code |

### Use Cases

**AllowDecryptInAPI = true (Default)**
- PII fields that authorized users should see (names, addresses)
- Sensitive business data that's encrypted at rest but visible in UI
- Data that needs to be searchable/sortable in the application

**AllowDecryptInAPI = false**
- API keys, secrets, passwords
- Encryption keys for other systems
- Data that should only be accessed programmatically on server

### Server-Side Only Access Pattern

For fields with `AllowDecryptInAPI = false`, server code can still decrypt:

```typescript
// In a server-side action or business logic
const engine = EncryptionEngine.Instance;
const encryptedValue = entity.SecretAPIKey; // Gets "$ENC$..."

if (engine.isEncrypted(encryptedValue)) {
    const decrypted = await engine.decrypt(encryptedValue, contextUser);
    // Use decrypted value for server-side operations
}
```

---

## Encrypted Value Format

### Format Specification

```
$ENC$<keyId>$<keyVersion>$<algorithm>$<iv>$<ciphertext>[$<authTag>]
```

| Part | Description | Example |
|------|-------------|---------|
| Marker | Always "$ENC$" | $ENC$ |
| keyId | UUID of encryption key | a1b2c3d4-... |
| keyVersion | Version string | 1, 2, v2 |
| algorithm | Algorithm name | AES-256-GCM |
| iv | Base64-encoded IV | dGVzdGl2MTI= |
| ciphertext | Base64-encoded encrypted data | Y2lwaGVydGV4dA== |
| authTag | Base64 auth tag (AEAD only) | YXV0aHRhZw== |

### Example

```
$ENC$a1b2c3d4-e5f6-7890-abcd-ef1234567890$1$AES-256-GCM$dGVzdGl2MTIzNDU2$Y2lwaGVydGV4dGhlcmU=$YXV0aHRhZ2hlcmU=
```

### Benefits

1. **Self-describing**: Contains all info needed to decrypt
2. **Version-aware**: Supports key rotation with keyVersion
3. **Detectable**: Easy to check if a value is encrypted
4. **URL-safe**: Base64 encoding is URL-safe
5. **Database-friendly**: Stores as regular string/nvarchar

---

## Key Rotation Strategy

### Rotation Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       KEY ROTATION WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Phase 1: Prepare New Key                                               │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ 1. Generate new key material                                    │     │
│  │ 2. Store in key source (env var, vault, etc.)                  │     │
│  │ 3. Create new Encryption Key record with:                      │     │
│  │    - KeyVersion = "2" (or next version)                        │     │
│  │    - Status = "Active"                                         │     │
│  │    - Same EncryptionKeySourceID & EncryptionAlgorithmID        │     │
│  │ 4. Update EntityField.EncryptionKeyID to new key               │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  Phase 2: Transition Period                                             │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ - New writes use new key (KeyVersion = "2")                    │     │
│  │ - Old reads still work (encrypted value contains key version)  │     │
│  │ - Both key versions active and accessible                      │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  Phase 3: Re-encryption (Optional)                                      │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ - Run batch job to re-encrypt old data with new key            │     │
│  │ - Process in batches to avoid locking                          │     │
│  │ - Can be done gradually over time                              │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  Phase 4: Retire Old Key                                                │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │ 1. Verify no data remains encrypted with old key               │     │
│  │ 2. Set old key Status = "Inactive"                             │     │
│  │ 3. Eventually remove old key material from source              │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Points

1. **No downtime**: Both old and new keys work during transition
2. **Version in ciphertext**: Encrypted values contain key version, so decryption always uses correct key
3. **Gradual migration**: Re-encryption can happen over time
4. **Rollback possible**: Can revert to old key if issues arise

---

## Database Migration

### Complete Migration Script

```sql
/***
 * File: V202512050000__v2.130.x__Add_Encryption_Infrastructure.sql
 *
 * Adds field-level encryption infrastructure:
 * - Encryption Key Sources (providers for retrieving keys)
 * - Encryption Algorithms (supported crypto algorithms)
 * - Encryption Keys (key configurations)
 * - EntityField extensions (Encrypt, EncryptionKeyID, AllowDecryptInAPI)
 ***/

BEGIN TRY
    BEGIN TRANSACTION;

    -- =====================================================
    -- 1. ENCRYPTION KEY SOURCES
    -- Defines where encryption keys are retrieved from
    -- =====================================================

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EncryptionKeySource' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
    BEGIN
        CREATE TABLE [${flyway:defaultSchema}].[EncryptionKeySource](
            [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
            [Name] [nvarchar](100) NOT NULL,
            [Description] [nvarchar](max) NULL,
            [DriverClass] [nvarchar](255) NOT NULL,
            [DriverImportPath] [nvarchar](500) NULL,
            [ConfigTemplate] [nvarchar](max) NULL,
            [IsActive] [bit] NOT NULL DEFAULT (1),
            [Status] [nvarchar](20) NOT NULL DEFAULT (N'Active'),
            [__mj_CreatedAt] [datetimeoffset] NOT NULL DEFAULT (getutcdate()),
            [__mj_UpdatedAt] [datetimeoffset] NOT NULL DEFAULT (getutcdate()),
            CONSTRAINT [PK_EncryptionKeySource_ID] PRIMARY KEY ([ID])
        );

        ALTER TABLE [${flyway:defaultSchema}].[EncryptionKeySource]
            ADD CONSTRAINT [UQ_EncryptionKeySource_Name] UNIQUE ([Name]);

        ALTER TABLE [${flyway:defaultSchema}].[EncryptionKeySource]
            ADD CONSTRAINT [CK_EncryptionKeySource_Status]
            CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated'));
    END;

    -- Extended property for table
    EXEC sys.sp_addextendedproperty
        @name=N'MS_Description',
        @value=N'Defines sources for retrieving encryption keys (environment variables, vault services, config files, etc.)',
        @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
        @level1type=N'TABLE', @level1name=N'EncryptionKeySource';

    -- =====================================================
    -- 2. ENCRYPTION ALGORITHMS
    -- Defines available encryption algorithms
    -- =====================================================

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EncryptionAlgorithm' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
    BEGIN
        CREATE TABLE [${flyway:defaultSchema}].[EncryptionAlgorithm](
            [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
            [Name] [nvarchar](50) NOT NULL,
            [Description] [nvarchar](max) NULL,
            [NodeCryptoName] [nvarchar](50) NOT NULL,
            [KeyLengthBits] [int] NOT NULL,
            [IVLengthBytes] [int] NOT NULL,
            [IsAEAD] [bit] NOT NULL DEFAULT (0),
            [IsActive] [bit] NOT NULL DEFAULT (1),
            [__mj_CreatedAt] [datetimeoffset] NOT NULL DEFAULT (getutcdate()),
            [__mj_UpdatedAt] [datetimeoffset] NOT NULL DEFAULT (getutcdate()),
            CONSTRAINT [PK_EncryptionAlgorithm_ID] PRIMARY KEY ([ID])
        );

        ALTER TABLE [${flyway:defaultSchema}].[EncryptionAlgorithm]
            ADD CONSTRAINT [UQ_EncryptionAlgorithm_Name] UNIQUE ([Name]);
    END;

    -- Extended property for table
    EXEC sys.sp_addextendedproperty
        @name=N'MS_Description',
        @value=N'Defines available encryption algorithms and their configuration parameters.',
        @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
        @level1type=N'TABLE', @level1name=N'EncryptionAlgorithm';

    -- =====================================================
    -- 3. ENCRYPTION KEYS
    -- Defines specific encryption keys and their configuration
    -- =====================================================

    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EncryptionKey' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
    BEGIN
        CREATE TABLE [${flyway:defaultSchema}].[EncryptionKey](
            [ID] [uniqueidentifier] NOT NULL DEFAULT (newsequentialid()),
            [Name] [nvarchar](100) NOT NULL,
            [Description] [nvarchar](max) NULL,
            [EncryptionKeySourceID] [uniqueidentifier] NOT NULL,
            [EncryptionAlgorithmID] [uniqueidentifier] NOT NULL,
            [KeyLookupValue] [nvarchar](500) NOT NULL,
            [KeyVersion] [nvarchar](20) NOT NULL DEFAULT (N'1'),
            [Marker] [nvarchar](20) NOT NULL DEFAULT (N'$ENC$'),
            [IsActive] [bit] NOT NULL DEFAULT (1),
            [Status] [nvarchar](20) NOT NULL DEFAULT (N'Active'),
            [ActivatedAt] [datetimeoffset] NULL,
            [ExpiresAt] [datetimeoffset] NULL,
            [__mj_CreatedAt] [datetimeoffset] NOT NULL DEFAULT (getutcdate()),
            [__mj_UpdatedAt] [datetimeoffset] NOT NULL DEFAULT (getutcdate()),
            CONSTRAINT [PK_EncryptionKey_ID] PRIMARY KEY ([ID])
        );

        ALTER TABLE [${flyway:defaultSchema}].[EncryptionKey]
            ADD CONSTRAINT [UQ_EncryptionKey_Name] UNIQUE ([Name]);

        ALTER TABLE [${flyway:defaultSchema}].[EncryptionKey]
            WITH CHECK ADD CONSTRAINT [FK_EncryptionKey_Source]
            FOREIGN KEY ([EncryptionKeySourceID])
            REFERENCES [${flyway:defaultSchema}].[EncryptionKeySource] ([ID]);

        ALTER TABLE [${flyway:defaultSchema}].[EncryptionKey]
            WITH CHECK ADD CONSTRAINT [FK_EncryptionKey_Algorithm]
            FOREIGN KEY ([EncryptionAlgorithmID])
            REFERENCES [${flyway:defaultSchema}].[EncryptionAlgorithm] ([ID]);

        ALTER TABLE [${flyway:defaultSchema}].[EncryptionKey]
            ADD CONSTRAINT [CK_EncryptionKey_Status]
            CHECK ([Status] IN (N'Active', N'Inactive', N'Rotating', N'Expired'));

        -- Indexes for foreign keys
        CREATE INDEX IDX_AUTO_MJ_FKEY_EncryptionKey_SourceID
            ON [${flyway:defaultSchema}].[EncryptionKey] ([EncryptionKeySourceID]);
        CREATE INDEX IDX_AUTO_MJ_FKEY_EncryptionKey_AlgorithmID
            ON [${flyway:defaultSchema}].[EncryptionKey] ([EncryptionAlgorithmID]);
    END;

    -- Extended property for table
    EXEC sys.sp_addextendedproperty
        @name=N'MS_Description',
        @value=N'Defines encryption keys used for field-level encryption, including source, algorithm, and rotation configuration.',
        @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
        @level1type=N'TABLE', @level1name=N'EncryptionKey';

    -- =====================================================
    -- 4. EXTEND ENTITYFIELD
    -- Add encryption-related columns
    -- =====================================================

    -- Add Encrypt column
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[EntityField]') AND name = 'Encrypt')
    BEGIN
        ALTER TABLE [${flyway:defaultSchema}].[EntityField]
            ADD [Encrypt] [bit] NOT NULL DEFAULT (0);

        EXEC sys.sp_addextendedproperty
            @name=N'MS_Description',
            @value=N'When true, this field will be encrypted at rest using the specified EncryptionKeyID.',
            @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
            @level1type=N'TABLE', @level1name=N'EntityField',
            @level2type=N'COLUMN', @level2name=N'Encrypt';
    END;

    -- Add EncryptionKeyID column
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[EntityField]') AND name = 'EncryptionKeyID')
    BEGIN
        ALTER TABLE [${flyway:defaultSchema}].[EntityField]
            ADD [EncryptionKeyID] [uniqueidentifier] NULL;

        ALTER TABLE [${flyway:defaultSchema}].[EntityField]
            WITH CHECK ADD CONSTRAINT [FK_EntityField_EncryptionKey]
            FOREIGN KEY ([EncryptionKeyID])
            REFERENCES [${flyway:defaultSchema}].[EncryptionKey] ([ID]);

        CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID
            ON [${flyway:defaultSchema}].[EntityField] ([EncryptionKeyID])
            WHERE [EncryptionKeyID] IS NOT NULL;

        EXEC sys.sp_addextendedproperty
            @name=N'MS_Description',
            @value=N'References the encryption key to use when Encrypt is true.',
            @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
            @level1type=N'TABLE', @level1name=N'EntityField',
            @level2type=N'COLUMN', @level2name=N'EncryptionKeyID';
    END;

    -- Add AllowDecryptInAPI column
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[EntityField]') AND name = 'AllowDecryptInAPI')
    BEGIN
        ALTER TABLE [${flyway:defaultSchema}].[EntityField]
            ADD [AllowDecryptInAPI] [bit] NOT NULL DEFAULT (1);

        EXEC sys.sp_addextendedproperty
            @name=N'MS_Description',
            @value=N'When true, encrypted fields will be decrypted before returning via API. When false, the encrypted value is returned.',
            @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
            @level1type=N'TABLE', @level1name=N'EntityField',
            @level2type=N'COLUMN', @level2name=N'AllowDecryptInAPI';
    END;

    -- =====================================================
    -- 5. SEED DEFAULT DATA
    -- Pre-populate with standard key sources and algorithms
    -- =====================================================

    -- Default key sources with hardcoded UUIDs
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EncryptionKeySource] WHERE [Name] = 'Environment Variable')
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[EncryptionKeySource]
            ([ID], [Name], [Description], [DriverClass], [DriverImportPath], [ConfigTemplate])
        VALUES
            ('A1B2C3D4-0001-0001-0001-000000000001',
             'Environment Variable',
             'Retrieves encryption keys from environment variables. Keys should be base64-encoded.',
             'EnvVarKeySource',
             '@memberjunction/core',
             '{"envVarName": "string"}');
    END;

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EncryptionKeySource] WHERE [Name] = 'Configuration File')
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[EncryptionKeySource]
            ([ID], [Name], [Description], [DriverClass], [DriverImportPath], [ConfigTemplate])
        VALUES
            ('A1B2C3D4-0001-0001-0001-000000000002',
             'Configuration File',
             'Retrieves encryption keys from mj.config.cjs encryptionKeys section.',
             'ConfigFileKeySource',
             '@memberjunction/core',
             '{"keyName": "string"}');
    END;

    -- Default algorithms with hardcoded UUIDs
    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EncryptionAlgorithm] WHERE [Name] = 'AES-256-GCM')
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[EncryptionAlgorithm]
            ([ID], [Name], [Description], [NodeCryptoName], [KeyLengthBits], [IVLengthBytes], [IsAEAD])
        VALUES
            ('B2C3D4E5-0001-0001-0001-000000000001',
             'AES-256-GCM',
             'AES 256-bit encryption with Galois/Counter Mode. Provides authenticated encryption (AEAD). Recommended for most use cases.',
             'aes-256-gcm',
             256,
             12,
             1);
    END;

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EncryptionAlgorithm] WHERE [Name] = 'AES-256-CBC')
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[EncryptionAlgorithm]
            ([ID], [Name], [Description], [NodeCryptoName], [KeyLengthBits], [IVLengthBytes], [IsAEAD])
        VALUES
            ('B2C3D4E5-0001-0001-0001-000000000002',
             'AES-256-CBC',
             'AES 256-bit encryption with Cipher Block Chaining. Legacy mode without authentication.',
             'aes-256-cbc',
             256,
             16,
             0);
    END;

    IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EncryptionAlgorithm] WHERE [Name] = 'AES-128-GCM')
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[EncryptionAlgorithm]
            ([ID], [Name], [Description], [NodeCryptoName], [KeyLengthBits], [IVLengthBytes], [IsAEAD])
        VALUES
            ('B2C3D4E5-0001-0001-0001-000000000003',
             'AES-128-GCM',
             'AES 128-bit encryption with Galois/Counter Mode. Smaller key size, still provides AEAD.',
             'aes-128-gcm',
             128,
             12,
             1);
    END;

    COMMIT TRANSACTION;
    PRINT 'Encryption infrastructure migration completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();

    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
```

---

## Implementation Phases

| Phase | Scope | Deliverables | Dependencies |
|-------|-------|--------------|--------------|
| **1** | **Metadata & Infrastructure** | Database migration, new entities, entity_subclasses.ts updates | None |
| **2** | **Base Provider Framework** | EncryptionKeySourceBase abstract class, ClassFactory registration | Phase 1 |
| **3** | **Env Var Provider** | EnvVarKeySource implementation | Phase 2 |
| **4** | **Encryption Engine** | EncryptionEngine class with encrypt/decrypt methods, caching | Phase 3 |
| **5** | **Write Integration** | Hook into generateSPParams for encryption on save | Phase 4 |
| **6** | **Read Integration** | Hook into ProcessEntityRows for decryption on load | Phase 4 |
| **7** | **EntityFieldInfo Extension** | Add Encrypt/EncryptionKeyID/AllowDecryptInAPI to EntityFieldInfo | Phase 1 |
| **8** | **Config File Provider** | ConfigFileKeySource implementation | Phase 2 |
| **9** | **UI Components** | EntityField editor with encryption settings in Explorer | Phase 6 |
| **10** | **Documentation** | Developer docs, examples, best practices | Phase 6 |

### Phase Details

#### Phase 1: Metadata & Infrastructure (2-3 days)
- Create and run database migration
- Run CodeGen to generate entity classes
- Verify entities appear in Explorer

#### Phase 2: Base Provider Framework (1 day)
- Create `EncryptionKeySourceBase` abstract class
- Set up directory structure in `packages/MJCore/src/generic/encryption/`
- Add exports to package

#### Phase 3: Environment Variable Provider (1 day)
- Implement `EnvVarKeySource`
- Add unit tests
- Document environment variable format

#### Phase 4: Encryption Engine (2-3 days)
- Implement `EncryptionEngine` class
- Add key caching with TTL
- Add comprehensive error handling
- Unit tests for encrypt/decrypt cycle

#### Phase 5: Write Integration (1-2 days)
- Modify `generateSPParams()` in SQLServerDataProvider
- Handle null/empty values correctly
- Add logging for encryption operations

#### Phase 6: Read Integration (1-2 days)
- Modify `ProcessEntityRows()` in SQLServerDataProvider
- Pass contextUser through call chain
- Handle decryption failures gracefully

#### Phase 7: EntityFieldInfo Extension (1 day)
- Add new properties to EntityFieldInfo
- Update metadata loading to populate encryption fields

#### Phase 8: Config File Provider (1 day)
- Implement `ConfigFileKeySource`
- Add to mj.config.cjs schema documentation

#### Phase 9: UI Components (2-3 days)
- Add encryption settings to EntityField editor
- Key selection dropdown
- AllowDecryptInAPI toggle

#### Phase 10: Documentation (1-2 days)
- Developer guide for enabling encryption
- Key management best practices
- Troubleshooting guide

**Total Estimated Effort: 15-20 days**

---

## Security Considerations

### Key Storage Best Practices

1. **Never store keys in database** - Keys should only be in secure storage (env vars, vaults)
2. **Use base64 encoding** - Ensures keys are transmitted/stored correctly
3. **Rotate keys regularly** - Use the key rotation workflow
4. **Audit key access** - Consider logging key retrieval (not the key itself)

### Algorithm Recommendations

- **Default to AES-256-GCM** - Authenticated encryption prevents tampering
- **Avoid CBC for new implementations** - No authentication, susceptible to padding oracle attacks
- **Never roll your own crypto** - Use Node.js crypto module exclusively

### Access Control

- Only users with EntityField edit permissions can enable/configure encryption
- Consider adding specific "Encryption Administrator" role for key management
- Encrypted fields with `AllowDecryptInAPI = false` require server-side code access

### Data Residency

- Encrypted data can safely cross boundaries (field contains only ciphertext)
- Key material never leaves the server process
- Consider compliance requirements for key storage location

---

## Performance Considerations

### Caching Strategy

```typescript
// Key material cache: 5 minute TTL
private readonly CACHE_TTL_MS = 5 * 60 * 1000;

// Cache hierarchy:
// 1. Key configuration (entity metadata) - cached per key ID
// 2. Key material (actual bytes) - cached per key ID + version
// 3. Key source instances - cached per driver class
```

### Batch Operations

- Encryption/decryption per-field adds latency
- For bulk imports, consider batch pre-encryption
- Monitor query times for entities with many encrypted fields

### Index Implications

- Encrypted fields cannot be indexed effectively
- Don't encrypt fields used in WHERE clauses
- Consider separate search index for searchable attributes

### Estimated Overhead

| Operation | Estimated Overhead |
|-----------|-------------------|
| Single field encryption | 1-5ms |
| Single field decryption | 1-5ms |
| Key retrieval (cached) | <1ms |
| Key retrieval (uncached) | 10-50ms |

---

## Future Enhancements

### Additional Key Sources

- **AWS KMS** - Server-side keys managed by AWS
- **Azure Key Vault** - Server-side keys managed by Azure
- **HashiCorp Vault** - Enterprise secret management
- **Google Cloud KMS** - GCP key management

### Advanced Features

- **Blind indexing** - Enable exact-match search on encrypted fields
- **Key rotation automation** - Scheduled key rotation with automatic re-encryption
- **Encryption audit log** - Track all encryption/decryption operations
- **Client-side encryption SDK** - For sensitive client-side operations

### Integration Opportunities

- **Record Changes** - Encrypt historical versions
- **Audit Log** - Encrypt sensitive audit data
- **File Storage** - Encrypt file contents
- **API Keys entity** - Built-in encryption for secrets

---

## Appendix A: Key Generation Examples

### Generating a 256-bit Key

```bash
# Generate a 256-bit (32 byte) key and base64 encode it
openssl rand -base64 32

# Example output: K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=
```

### Setting Environment Variable

```bash
# Linux/macOS
export MJ_ENCRYPTION_KEY_PII="K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols="

# Windows PowerShell
$env:MJ_ENCRYPTION_KEY_PII = "K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols="

# Windows Command Prompt
set MJ_ENCRYPTION_KEY_PII=K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=
```

### Configuration File Example

```javascript
// mj.config.cjs
module.exports = {
    // ... other config ...

    encryptionKeys: {
        "pii_master": "K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=",
        "pii_master_v2": "aW5kZXhfbmV3X2tleV9mb3JfdjJfcm90YXRpb24="
    }
};
```

---

## Appendix B: Usage Examples

### Enabling Encryption on a Field

1. Navigate to Entity Fields in Explorer
2. Select the field to encrypt (e.g., `SocialSecurityNumber`)
3. Set:
   - `Encrypt` = Yes
   - `EncryptionKeyID` = (select "PII Master Key")
   - `AllowDecryptInAPI` = Yes (or No for server-only access)
4. Save

### Creating an Encryption Key

```sql
-- Using SQL (or via Explorer UI)
INSERT INTO [__mj].[EncryptionKey] (
    [Name],
    [Description],
    [EncryptionKeySourceID],  -- Environment Variable source
    [EncryptionAlgorithmID],  -- AES-256-GCM
    [KeyLookupValue]
)
VALUES (
    'PII Master Key',
    'Master encryption key for all PII fields',
    'A1B2C3D4-0001-0001-0001-000000000001',  -- Env Var source
    'B2C3D4E5-0001-0001-0001-000000000001',  -- AES-256-GCM
    'MJ_ENCRYPTION_KEY_PII'  -- Env var name
);
```

### Server-Side Decryption (for AllowDecryptInAPI = false)

```typescript
import { EncryptionEngine } from '@memberjunction/core';

async function useApiKey(entity: IntegrationConfigEntity, contextUser: UserInfo) {
    const engine = EncryptionEngine.Instance;

    // entity.APIKey contains "$ENC$..." because AllowDecryptInAPI = false
    if (engine.isEncrypted(entity.APIKey)) {
        const decryptedKey = await engine.decrypt(entity.APIKey, contextUser);

        // Use decrypted key for API call
        const client = new ExternalAPIClient(decryptedKey);
        await client.doSomething();
    }
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-05 | Claude Code | Initial draft |

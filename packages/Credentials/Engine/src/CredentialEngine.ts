import {
    BaseEngine,
    EntityInfo,
    IMetadataProvider,
    LogError,
    LogStatus,
    Metadata,
    RunView,
    UserInfo
} from "@memberjunction/core";
import sql from 'mssql';
import {
    AuditLogEntity,
    CredentialCategoryEntity,
    CredentialEntity,
    CredentialTypeEntity,
    APIKeyEntity,
    APIScopeEntity,
    APIKeyScopeEntity
} from "@memberjunction/core-entities";
import {
    CredentialResolutionOptions,
    ResolvedCredential,
    StoreCredentialOptions,
    CredentialValidationResult,
    CredentialAccessDetails
} from "./types";




// Hardcoded ID for the "Credential Access" AuditLogType
// This matches the ID in /metadata/audit-log-types/.credential-audit-types.json
const CREDENTIAL_ACCESS_AUDIT_LOG_TYPE_ID = 'E8D4D100-E785-42D3-997F-ECFF3B0BCFC0';

/**
 * CredentialEngine provides secure credential management with:
 * - Automatic caching of credential metadata (types, categories, credentials)
 * - Audit logging of all credential access
 * - Field-level encryption via MemberJunction's EncryptionEngine
 * - Per-request credential override support
 *
 * All credential access should go through this engine to ensure proper
 * audit logging and consistent credential resolution.
 *
 * Credentials are stored encrypted in the database. The `Values` field contains
 * a JSON blob with credential data (e.g., `{ "apiKey": "sk-..." }`). This field
 * uses MJ field-level encryption - values are encrypted on save and decrypted
 * on load automatically by the entity framework.
 *
 * @example
 * ```typescript
 * // Initialize the engine
 * await CredentialEngine.Instance.Config(false, contextUser);
 *
 * // Get a credential by name
 * const cred = await CredentialEngine.Instance.getCredential('OpenAI', {
 *     contextUser,
 *     subsystem: 'AIService'
 * });
 *
 * // Use the typed credential values
 * openai.setApiKey(cred.values.apiKey);
 * ```
 */
export class CredentialEngine extends BaseEngine<CredentialEngine> {
    // Cached entity data
    private _credentials: CredentialEntity[] = [];
    private _credentialTypes: CredentialTypeEntity[] = [];
    private _credentialCategories: CredentialCategoryEntity[] = [];
    private _apiKeys: APIKeyEntity[] = [];
    private _apiScopes: APIScopeEntity[] = [];
    private _apiKeyScopes: APIKeyScopeEntity[] = []; // No entity class yet

    // Cached entity ID for audit logging
    private _credentialsEntityId: string | null = null;

    /**
     * Configures the engine by loading credential metadata from the database.
     * Must be called before using the engine, typically at application startup.
     *
     * @param forceRefresh - If true, reload data even if already loaded
     * @param contextUser - Required on server-side for data access
     * @param provider - Optional metadata provider override
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const params = [
            {
                PropertyName: '_credentials',
                EntityName: 'MJ: Credentials',
                CacheLocal: true
            },
            {
                PropertyName: '_credentialTypes',
                EntityName: 'MJ: Credential Types',
                CacheLocal: true
            },
            {
                PropertyName: '_credentialCategories',
                EntityName: 'MJ: Credential Categories',
                CacheLocal: true
            },
            {
                PropertyName: '_apiScopes',
                EntityName: 'MJ: API Scopes',
                CacheLocal: true
            },
            {
                PropertyName: '_apiKeys',
                EntityName: 'MJ: API Keys',
                CacheLocal: true
            },           
            {
                PropertyName: '_apiKeyScopes',
                EntityName: 'MJ: API Key Scopes',
                CacheLocal: true
            }      
        ];

        // get the entity ID for MJ: Credentials
        let entityMatch: EntityInfo;
        if (provider) {
            entityMatch = provider.Entities.find(e => e.Name?.trim().toLowerCase() === 'mj: credentials')
        }
        else {
            const md = new Metadata();
            entityMatch = md.EntityByName("MJ: Credentials");
        }
        if (entityMatch) {
            this._credentialsEntityId = entityMatch.ID;
        }
        else {
            throw new Error("Entity not found for MJ: Credentials!")
        }

        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    /**
     * Returns the singleton instance of the CredentialEngine.
     */
    public static get Instance(): CredentialEngine {
        return super.getInstance<CredentialEngine>();
    }

    // ====================================
    // Cached Data Accessors
    // ====================================

    /**
     * Returns all active credentials loaded from the database.
     */
    public get Credentials(): CredentialEntity[] {
        return this._credentials;
    }

    /**
     * Returns all credential types loaded from the database.
     */
    public get CredentialTypes(): CredentialTypeEntity[] {
        return this._credentialTypes;
    }

    /**
     * Returns all credential categories loaded from the database.
     */
    public get CredentialCategories(): CredentialCategoryEntity[] {
        return this._credentialCategories;
    }


    /**
     * Returns all cached API keys.
     */
    public get APIKeys(): APIKeyEntity[] {
        return this._apiKeys;
    }
    /**
     * Returns all cached API key scopes.
     */
    public get APIKeyScopes(): APIKeyScopeEntity[] {
        return this._apiKeyScopes;
    }
    /**
     * Returns all cached API scopes.
     */
    public get APIScopes(): APIScopeEntity[] {
        return this._apiScopes;
    }

    /**
     * Finds an API key by its hash.
     * This is the primary lookup method for API key validation.
     * 
     * @param hash - The SHA-256 hash of the API key
     * @returns The cached API key or undefined if not found
     */
    public getAPIKeyByHash(hash: string): APIKeyEntity | undefined {
        return this._apiKeys.find(k => k.Hash === hash);
    }


    // ====================================
    // Lookup Methods
    // ====================================

    /**
     * Gets a credential type by name.
     */
    public getCredentialTypeByName(typeName: string): CredentialTypeEntity | undefined {
        return this._credentialTypes.find(t =>
            t.Name.trim().toLowerCase() === typeName.trim().toLowerCase()
        );
    }

    /**
     * Gets the default credential for a given type.
     */
    public getDefaultCredentialForType(credentialTypeName: string): CredentialEntity | undefined {
        const credType = this.getCredentialTypeByName(credentialTypeName);
        if (!credType) return undefined;

        return this._credentials.find(c =>
            c.CredentialTypeID === credType.ID && c.IsDefault && c.IsActive
        );
    }

    /**
     * Gets a credential by ID.
     */
    public getCredentialById(credentialId: string): CredentialEntity | undefined {
        return this._credentials.find(c => c.ID === credentialId);
    }

    /**
     * Gets a credential by type and name.
     */
    public getCredentialByName(credentialTypeName: string, credentialName: string): CredentialEntity | undefined {
        const credType = this.getCredentialTypeByName(credentialTypeName);
        if (!credType) return undefined;

        return this._credentials.find(c =>
            c.CredentialTypeID === credType.ID &&
            c.Name.trim().toLowerCase() === credentialName.trim().toLowerCase() &&
            c.IsActive
        );
    }

    // ====================================
    // Main Credential Resolution
    // ====================================

    /**
     * Resolves and returns a credential with decrypted values, logging the access.
     *
     * Resolution order:
     * 1. Direct values from options (per-request override)
     * 2. Specific credential by ID (if credentialId provided)
     * 3. Specific credential by name (if credentialName provided)
     * 4. Default credential for the named credential from database
     *
     * The `Values` field is automatically decrypted by MJ's field-level encryption
     * when the entity is loaded. The decrypted JSON is then parsed and returned
     * as the `values` object.
     *
     * @param credentialName - The name of the credential to resolve (e.g., 'OpenAI', 'SendGrid')
     * @param options - Resolution options including contextUser, overrides, and subsystem
     * @returns Resolved credential with decrypted values
     * @throws Error if credential is not found
     */
    public async getCredential<T extends Record<string, string> = Record<string, string>>(
        credentialName: string,
        options: CredentialResolutionOptions = {}
    ): Promise<ResolvedCredential<T>> {
        const startTime = Date.now();
        let credential: CredentialEntity | null = null;
        let values: T = {} as T;
        let source: 'database' | 'request' = 'database';

        try {
            // Ensure engine is loaded
            this.TryThrowIfNotLoaded();

            // 1. Direct values override (highest priority)
            if (options.directValues) {
                values = options.directValues as T;
                source = 'request';
            }
            // 2. Database lookup
            else {
                credential = this.resolveCredential(credentialName, options);
                if (credential) {
                    // Values field is already decrypted by BaseEntity via field-level encryption
                    values = this.parseCredentialValues(credential.Values) as T;
                    source = 'database';
                } else {
                    throw new Error(`Credential not found: ${credentialName}`);
                }
            }

            // Log successful access
            await this.logAccess(credential, options.contextUser, {
                operation: 'Decrypt',
                subsystem: options.subsystem,
                success: true,
                durationMs: Date.now() - startTime
            });

            // Update LastUsedAt (fire and forget)
            if (credential && options.contextUser) {
                this.updateLastUsedAt(credential.ID, options.contextUser).catch(e => LogError(e));
            }

            return {
                credential,
                values,
                source,
                expiresAt: credential?.ExpiresAt
            };

        } catch (error) {
            // Log failed access
            await this.logAccess(credential, options.contextUser, {
                operation: 'Decrypt',
                subsystem: options.subsystem,
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error),
                durationMs: Date.now() - startTime
            });
            throw error;
        }
    }

    /**
     * Stores a new credential with encryption and audit logging.
     *
     * @param credentialTypeName - The type of credential
     * @param name - Name for the credential
     * @param values - The credential values (will be encrypted)
     * @param options - Storage options
     * @param contextUser - Required user context
     * @returns The created credential
     */
    public async storeCredential(
        credentialTypeName: string,
        name: string,
        values: Record<string, string>,
        options: StoreCredentialOptions,
        contextUser: UserInfo
    ): Promise<CredentialEntity> {
        this.TryThrowIfNotLoaded();

        const credType = this.getCredentialTypeByName(credentialTypeName);
        if (!credType) {
            throw new Error(`Credential type not found: ${credentialTypeName}`);
        }

        // Validate against FieldSchema
        this.validateValues(values, credType.FieldSchema);

        // Create credential entity via metadata
        const md = new Metadata();
        const credEntity = await md.GetEntityObject<CredentialEntity>('MJ: Credentials', contextUser);
        credEntity.NewRecord();
        credEntity.CredentialTypeID = credType.ID;
        credEntity.Name = name;
        credEntity.Description = options.description || null;
        credEntity.Values = JSON.stringify(values); // Encryption happens on save
        credEntity.IsDefault = options.isDefault ?? false;
        credEntity.IsActive = true;
        credEntity.CategoryID = options.categoryId || null;
        credEntity.IconClass = options.iconClass || null;
        credEntity.ExpiresAt = options.expiresAt || null;

        const saved = await credEntity.Save();
        if (!saved) {
            throw new Error('Failed to save credential');
        }

        // Log creation
        await this.logAccess(
            credEntity,
            contextUser,
            {
                operation: 'Create',
                success: true
            }
        );

        // Refresh cache
        await this.RefreshItem('_credentials');

        return credEntity;
    }

    /**
     * Updates credential values with encryption and audit logging.
     *
     * @param credentialId - ID of the credential to update
     * @param values - New credential values
     * @param contextUser - Required user context
     */
    public async updateCredential(
        credentialId: string,
        values: Record<string, string>,
        contextUser: UserInfo
    ): Promise<void> {
        this.TryThrowIfNotLoaded();

        const md = new Metadata();
        const credEntity = await md.GetEntityObject<CredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credEntity.Load(credentialId);
        if (!loaded) {
            throw new Error(`Credential not found: ${credentialId}`);
        }

        // Get credential type for validation
        const credType = this._credentialTypes.find(t => t.ID === credEntity.CredentialTypeID);
        if (credType) {
            this.validateValues(values, credType.FieldSchema);
        }

        credEntity.Values = JSON.stringify(values); // Encryption happens on save
        const saved = await credEntity.Save();
        if (!saved) {
            throw new Error('Failed to update credential');
        }

        // Log update
        await this.logAccess(credEntity, contextUser, {
            operation: 'Update',
            success: true
        });

        // Refresh cache
        await this.RefreshItem('_credentials');
    }

    /**
     * Validates credentials against the provider's validation endpoint.
     *
     * @param credentialId - ID of the credential to validate
     * @param contextUser - Required user context
     * @returns Validation result
     */
    public async validateCredential(
        credentialId: string,
        contextUser: UserInfo
    ): Promise<CredentialValidationResult> {
        this.TryThrowIfNotLoaded();

        const credential = this.getCredentialById(credentialId);
        if (!credential) {
            return {
                isValid: false,
                errors: ['Credential not found'],
                warnings: [],
                validatedAt: new Date()
            };
        }

        // Get credential type for validation endpoint
        const credType = this._credentialTypes.find(t => t.ID === credential.CredentialTypeID);
        if (!credType?.ValidationEndpoint) {
            return {
                isValid: true,
                errors: [],
                warnings: ['No validation endpoint configured'],
                validatedAt: new Date()
            };
        }

        const values = this.parseCredentialValues(credential.Values);

        // Call validation endpoint
        const result = await this.callValidationEndpoint(credType.ValidationEndpoint, values);

        // Update LastValidatedAt
        if (contextUser) {
            this.updateLastValidatedAt(credentialId, contextUser).catch(e => LogError(e));
        }

        // Log validation
        await this.logAccess(credential, contextUser, {
            operation: 'Validate',
            success: result.isValid
        });

        return result;
    }

    // ====================================
    // Private Helper Methods
    // ====================================

    /**
     * Resolves a credential from the cache based on options.
     *
     * Priority:
     * 1. By ID (if credentialId provided)
     * 2. By name (credentialName parameter)
     * 3. Default for that name
     */
    private resolveCredential(
        credentialName: string,
        options: CredentialResolutionOptions
    ): CredentialEntity | null {
        // Try by ID first
        if (options.credentialId) {
            return this.getCredentialById(options.credentialId) || null;
        }

        // Try by name (using the main credentialName param or the override)
        const nameToFind = options.credentialName || credentialName;
        const cred = this._credentials.find(c =>
            c.Name.trim().toLowerCase() === nameToFind.trim().toLowerCase() &&
            c.IsActive
        );

        if (cred) {
            return cred;
        }

        // No match found
        return null;
    }

    /**
     * Parses JSON credential values, handling already-parsed objects.
     */
    private parseCredentialValues(valuesField: string): Record<string, string> {
        if (!valuesField) return {};

        try {
            // Handle case where it's already an object
            if (typeof valuesField === 'object') {
                return valuesField as Record<string, string>;
            }
            return JSON.parse(valuesField);
        } catch (e) {
            LogError(`Failed to parse credential values: ${e}`);
            return {};
        }
    }

    /**
     * Validates credential values against a JSON Schema.
     */
    private validateValues(values: Record<string, string>, fieldSchemaJson: string): void {
        if (!fieldSchemaJson) return;

        try {
            const schema = JSON.parse(fieldSchemaJson);
            const required = schema.required || [];

            for (const field of required) {
                if (!values[field]) {
                    throw new Error(`Required field missing: ${field}`);
                }
            }

            // Additional validation could be added here using a JSON Schema validator
        } catch (e) {
            if (e instanceof SyntaxError) {
                LogError(`Invalid FieldSchema JSON: ${e}`);
            } else {
                throw e;
            }
        }
    }

    /**
     * Updates the LastUsedAt timestamp on a credential.
     */
    private async updateLastUsedAt(credentialId: string, contextUser: UserInfo): Promise<void> {
        try {
            const md = new Metadata();
            const credEntity = await md.GetEntityObject<CredentialEntity>('MJ: Credentials', contextUser);
            await credEntity.Load(credentialId);
            credEntity.LastUsedAt = new Date();
            await credEntity.Save();
        } catch (e) {
            // Non-fatal - just log
            LogError(e);
        }
    }

    /**
     * Updates the LastValidatedAt timestamp on a credential.
     */
    private async updateLastValidatedAt(credentialId: string, contextUser: UserInfo): Promise<void> {
        try {
            const md = new Metadata();
            const credEntity = await md.GetEntityObject<CredentialEntity>('MJ: Credentials', contextUser);
            await credEntity.Load(credentialId);
            credEntity.LastValidatedAt = new Date();
            await credEntity.Save();
        } catch (e) {
            // Non-fatal - just log
            LogError(e);
        }
    }

    /**
     * Calls a validation endpoint to verify credentials.
     * Override this method for custom validation logic.
     */
    protected async callValidationEndpoint(
        endpoint: string,
        values: Record<string, string>
    ): Promise<CredentialValidationResult> {
        // Default implementation - subclasses can override
        // In a real implementation, this would make an HTTP call to the endpoint
        LogStatus(`Validation endpoint configured but not implemented: ${endpoint}`);
        return {
            isValid: true,
            errors: [],
            warnings: ['Validation endpoint call not implemented'],
            validatedAt: new Date()
        };
    }

    /**
     * Logs credential access to the AuditLog entity.
     */
    private async logAccess(
        credential: CredentialEntity | null,
        contextUser: UserInfo | undefined,
        details: CredentialAccessDetails
    ): Promise<void> {
        try {
            // Skip logging if no context user (can't create audit log without user)
            if (!contextUser) {
                return;
            }

            const md = new Metadata();
            const auditLog = await md.GetEntityObject<AuditLogEntity>('Audit Logs', contextUser);
            auditLog.NewRecord();

            auditLog.UserID = contextUser.ID;
            auditLog.AuditLogTypeID = CREDENTIAL_ACCESS_AUDIT_LOG_TYPE_ID;
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

            if (credential && this._credentialsEntityId) {
                auditLog.EntityID = this._credentialsEntityId;
                auditLog.RecordID = credential.ID;
            }

            await auditLog.Save();
        } catch (e) {
            // Non-fatal - don't let audit logging failure break credential access
            LogError(`Failed to log credential access: ${e}`);
        }
    }
}

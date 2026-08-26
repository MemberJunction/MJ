import {
    BaseEngine,
    EntityInfo,
    IMetadataProvider,
    LogError,
    LogStatus,
    Metadata,
    UserInfo
} from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";

import {
    MJAuditLogEntity,
    MJCredentialCategoryEntity,
    MJCredentialEntity,
    MJCredentialTypeEntity
} from "@memberjunction/core-entities";

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import {
    CredentialResolutionOptions,
    ResolvedCredential,
    StoreCredentialOptions,
    CredentialValidationResult,
    CredentialAccessDetails
} from "./types";
import {
    CredentialExpirationConfig,
    CredentialExpirationEvaluation,
    CredentialExpiredError,
    CredentialNotFoundError,
    DEFAULT_EXPIRATION_CONFIG,
    evaluateExpiration
} from "./expiration";




// Hardcoded ID for the "Credential Access" AuditLogType
// This matches the ID in /metadata/audit-log-types/.credential-audit-types.json
const CREDENTIAL_ACCESS_AUDIT_LOG_TYPE_ID = '9375C9F9-1A58-44D6-9B09-8C6AF0714383';

/**
 * CredentialEngine provides secure credential management with:
 * - Automatic caching of credential metadata (types, categories, credentials)
 * - Audit logging of all credential access
 * - Field-level encryption via MemberJunction's EncryptionEngine
 * - Per-request credential override support
 * - Expiration enforcement (see {@link CredentialEngine.ExpirationConfig})
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
    private _credentials: MJCredentialEntity[] = [];
    private _credentialTypes: MJCredentialTypeEntity[] = [];
    private _credentialCategories: MJCredentialCategoryEntity[] = [];

    // Cached entity ID for audit logging
    private _credentialsEntityId: string | null = null;

    // Ajv JSON Schema validator
    private _ajv: Ajv;
    private _schemaValidators: Map<string, ValidateFunction> = new Map();

    // Expiration policy governing how expired credentials are handled
    private _expirationConfig: CredentialExpirationConfig = { ...DEFAULT_EXPIRATION_CONFIG };

    // Credential IDs already warned about this process, so a credential resolved
    // in a hot loop produces one warning rather than one per call. Cleared on refresh.
    private _expiryWarningsIssued: Set<string> = new Set();

    constructor() {
        super();

        // Initialize Ajv with options
        this._ajv = new Ajv({
            allErrors: true,      // Collect all errors, not just first
            strict: false,        // Allow additional properties not in schema
            coerceTypes: false    // Don't auto-convert types
        });

        // Add format validation (uri, email, date, etc.)
        addFormats(this._ajv);
    }

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
            }
        ];

        // get the entity ID for MJ: Credentials
        let entityMatch: EntityInfo;
        if (provider) {
            entityMatch = provider.Entities.find(e => e.Name?.trim().toLowerCase() === 'mj: credentials')
        }
        else {
            const md = this.ProviderToUse;
            entityMatch = md.EntityByName("MJ: Credentials");
        }
        if (entityMatch) {
            this._credentialsEntityId = entityMatch.ID;
        }
        else {
            throw new Error("Entity not found for MJ: Credentials!")
        }

        // Cached credential rows are about to be replaced, so previously issued
        // warnings no longer describe the data in hand.
        this._expiryWarningsIssued.clear();

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
    public get Credentials(): MJCredentialEntity[] {
        return this._credentials;
    }

    /**
     * Returns all credential types loaded from the database.
     */
    public get CredentialTypes(): MJCredentialTypeEntity[] {
        return this._credentialTypes;
    }

    /**
     * Returns all credential categories loaded from the database.
     */
    public get CredentialCategories(): MJCredentialCategoryEntity[] {
        return this._credentialCategories;
    }

    // ====================================
    // Expiration Policy
    // ====================================

    /**
     * The active expiration policy.
     *
     * Defaults to blocking expired credentials with a 30-day warning window and
     * no grace period. Set this once at application startup, before any
     * credential is resolved:
     *
     * ```typescript
     * CredentialEngine.Instance.ExpirationConfig = { policy: 'warn' };
     * ```
     *
     * Assigning a partial object merges it over the current configuration, so
     * callers can change one knob without restating the others.
     */
    public get ExpirationConfig(): CredentialExpirationConfig {
        return { ...this._expirationConfig };
    }

    public set ExpirationConfig(config: Partial<CredentialExpirationConfig>) {
        this._expirationConfig = { ...this._expirationConfig, ...config };
        // A policy change can make previously suppressed warnings relevant again.
        this._expiryWarningsIssued.clear();
    }

    /**
     * Evaluates a credential's expiry against the clock and the active policy.
     *
     * Exposed so consumers that maintain their own credential lists — for
     * example a caller walking a set of fallback bindings — can ask the same
     * question the engine asks, instead of comparing dates by hand and drifting
     * from the engine's warning window and grace period.
     *
     * @param credential - The credential to evaluate.
     * @param policyOverride - Optional per-call policy override.
     */
    public getExpirationStatus(
        credential: MJCredentialEntity,
        policyOverride?: CredentialExpirationConfig['policy']
    ): CredentialExpirationEvaluation {
        const config = policyOverride
            ? { ...this._expirationConfig, policy: policyOverride }
            : this._expirationConfig;
        return evaluateExpiration(credential.ExpiresAt, config);
    }

    // ====================================
    // Lookup Methods
    // ====================================

    /**
     * Gets a credential type by name.
     */
    public getCredentialTypeByName(typeName: string): MJCredentialTypeEntity | undefined {
        return this._credentialTypes.find(t =>
            t.Name.trim().toLowerCase() === typeName.trim().toLowerCase()
        );
    }

    /**
     * Gets the default credential for a given type.
     *
     * Expired credentials are excluded, honoring the documented contract of the
     * `ExpiresAt` column that an expired credential is treated as inactive. Use
     * {@link getCredentialById} when you need an expired record regardless.
     */
    public getDefaultCredentialForType(credentialTypeName: string): MJCredentialEntity | undefined {
        const credType = this.getCredentialTypeByName(credentialTypeName);
        if (!credType) return undefined;

        return this._credentials.find(c =>
            UUIDsEqual(c.CredentialTypeID, credType.ID) && c.IsDefault && c.IsActive &&
            this.getExpirationStatus(c).usable
        );
    }

    /**
     * Gets a credential by ID.
     *
     * Deliberately unfiltered: addressing a credential by its primary key is an
     * exact request, and administration/rotation tooling must be able to load an
     * expired record in order to replace it. Check {@link getExpirationStatus}
     * if you need to know whether the result is still usable.
     */
    public getCredentialById(credentialId: string): MJCredentialEntity | undefined {
        return this._credentials.find(c => UUIDsEqual(c.ID, credentialId));
    }

    /**
     * Gets a credential by type and name.
     *
     * Expired credentials are excluded, for the same reason as
     * {@link getDefaultCredentialForType}.
     */
    public getCredentialByName(credentialTypeName: string, credentialName: string): MJCredentialEntity | undefined {
        const credType = this.getCredentialTypeByName(credentialTypeName);
        if (!credType) return undefined;

        return this._credentials.find(c =>
            UUIDsEqual(c.CredentialTypeID, credType.ID) &&
            c.Name.trim().toLowerCase() === credentialName.trim().toLowerCase() &&
            c.IsActive &&
            this.getExpirationStatus(c).usable
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
     * Expiry is enforced here, at resolution time rather than at cache-load
     * time: the engine caches credential rows for the life of the process, so a
     * credential that lapses between two calls must be caught on the second
     * call, not left live until the next refresh.
     *
     * @param credentialName - The name of the credential to resolve (e.g., 'OpenAI', 'SendGrid')
     * @param options - Resolution options including contextUser, overrides, and subsystem
     * @returns Resolved credential with decrypted values
     * @throws {CredentialNotFoundError} if no credential matches the requested name or ID
     * @throws {CredentialExpiredError} if the credential is past its expiry and the active policy blocks it
     */
    public async getCredential<T extends Record<string, string> = Record<string, string>>(
        credentialName: string,
        options: CredentialResolutionOptions = {}
    ): Promise<ResolvedCredential<T>> {
        const startTime = Date.now();
        let credential: MJCredentialEntity | null = null;
        let values: T = {} as T;
        let source: 'database' | 'request' = 'database';
        // Values supplied by the caller have a lifetime the caller owns, so they
        // are reported valid unless a database record says otherwise.
        let expiration: CredentialExpirationEvaluation = evaluateExpiration(null);

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
                    // Expiry is checked before the values are read, so a blocked
                    // credential is never decrypted and never reaches the caller.
                    expiration = this.getExpirationStatus(credential, options.expirationPolicy);
                    if (!expiration.usable) {
                        throw new CredentialExpiredError(
                            credential.Name,
                            expiration.expiresAt!,
                            credential.ID,
                            Math.abs(expiration.daysUntilExpiration ?? 0)
                        );
                    }
                    this.warnIfExpiringOrExpired(credential, expiration);

                    // Values field is already decrypted by BaseEntity via field-level encryption
                    values = this.parseCredentialValues(credential.Values) as T;
                    source = 'database';
                } else {
                    throw new CredentialNotFoundError(credentialName);
                }
            }

            // Log successful access
            await this.logAccess(credential, options.contextUser, {
                operation: 'Decrypt',
                subsystem: options.subsystem,
                success: true,
                durationMs: Date.now() - startTime,
                expirationStatus: expiration.status
            });

            // Update LastUsedAt (fire and forget)
            if (credential && options.contextUser) {
                this.updateLastUsedAt(credential.ID, options.contextUser).catch(e => LogError(e));
            }

            return {
                credential,
                values,
                source,
                expiresAt: credential?.ExpiresAt,
                expirationStatus: expiration.status,
                daysUntilExpiration: expiration.daysUntilExpiration
            };

        } catch (error) {
            // Log failed access
            await this.logAccess(credential, options.contextUser, {
                operation: 'Decrypt',
                subsystem: options.subsystem,
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error),
                durationMs: Date.now() - startTime,
                expirationStatus: expiration.status
            });
            throw error;
        }
    }

    /**
     * Emits a warning for a credential that is expiring soon, or that was let
     * through while expired under a `'warn'` policy or inside the grace period.
     *
     * Warnings are issued once per credential per process so that a credential
     * resolved inside a hot loop does not flood the log; the set is cleared when
     * the engine refreshes or the policy changes.
     */
    private warnIfExpiringOrExpired(
        credential: MJCredentialEntity,
        expiration: CredentialExpirationEvaluation
    ): void {
        if (expiration.status === 'valid') {
            return;
        }
        if (this._expiryWarningsIssued.has(credential.ID)) {
            return;
        }
        this._expiryWarningsIssued.add(credential.ID);

        const days = expiration.daysUntilExpiration ?? 0;
        if (expiration.status === 'expiring-soon') {
            LogStatus(
                `Credential '${credential.Name}' expires in ${days} day(s) ` +
                `(${expiration.expiresAt?.toISOString()}). Rotate it before it lapses.`
            );
        } else {
            const reason = expiration.withinGrace ? 'inside the configured grace period' : "under a 'warn' expiration policy";
            LogError(
                `Credential '${credential.Name}' EXPIRED ${Math.abs(days)} day(s) ago ` +
                `(${expiration.expiresAt?.toISOString()}) but was used anyway ${reason}. ` +
                `This is not a safe steady state — rotate the credential.`
            );
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
    ): Promise<MJCredentialEntity> {
        this.TryThrowIfNotLoaded();

        const credType = this.getCredentialTypeByName(credentialTypeName);
        if (!credType) {
            throw new Error(`Credential type not found: ${credentialTypeName}`);
        }

        // Apply default and const values from schema
        const valuesWithDefaults = this.applySchemaDefaults(values, credType.FieldSchema);

        // Validate against FieldSchema using Ajv
        this.validateValues(valuesWithDefaults, credType.FieldSchema, credType.ID);

        // Create credential entity via metadata
        const md = this.ProviderToUse;
        const credEntity = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        credEntity.NewRecord();
        credEntity.CredentialTypeID = credType.ID;
        credEntity.Name = name;
        credEntity.Description = options.description || null;
        credEntity.Values = JSON.stringify(valuesWithDefaults); // Encryption happens on save
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

        const md = this.ProviderToUse;
        const credEntity = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credEntity.Load(credentialId);
        if (!loaded) {
            throw new Error(`Credential not found: ${credentialId}`);
        }

        // Get credential type for validation
        const credType = this._credentialTypes.find(t => UUIDsEqual(t.ID, credEntity.CredentialTypeID));
        if (credType) {
            // Apply default and const values from schema
            const valuesWithDefaults = this.applySchemaDefaults(values, credType.FieldSchema);

            // Validate against FieldSchema using Ajv
            this.validateValues(valuesWithDefaults, credType.FieldSchema, credType.ID);

            // Use values with defaults applied
            credEntity.Values = JSON.stringify(valuesWithDefaults); // Encryption happens on save
        } else {
            // No credential type found, just use provided values
            credEntity.Values = JSON.stringify(values);
        }

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
        const credType = this._credentialTypes.find(t => UUIDsEqual(t.ID, credential.CredentialTypeID));
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
     *
     * Expired credentials are deliberately still matched here. Filtering them
     * out would make an expired credential indistinguishable from a missing one,
     * and "Credential not found: OpenAI" sends an operator hunting for a record
     * that exists and merely needs rotating. The caller — {@link getCredential} —
     * evaluates expiry on the match and raises the specific error instead.
     */
    private resolveCredential(
        credentialName: string,
        options: CredentialResolutionOptions
    ): MJCredentialEntity | null {
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
     * Gets or compiles a JSON Schema validator for a credential type.
     * Validators are cached for performance.
     */
    private getValidator(credentialTypeId: string, schemaJson: string): ValidateFunction {
        if (!this._schemaValidators.has(credentialTypeId)) {
            const schema = JSON.parse(schemaJson);
            const validator = this._ajv.compile(schema);
            this._schemaValidators.set(credentialTypeId, validator);
        }
        return this._schemaValidators.get(credentialTypeId)!;
    }

    /**
     * Validates credential values against a JSON Schema using Ajv.
     * Supports all JSON Schema Draft 7 constraints including:
     * - required fields
     * - const (fixed values)
     * - enum (allowed values)
     * - format (uri, email, date, etc.)
     * - pattern (regex)
     * - minLength/maxLength
     * - minimum/maximum
     */
    private validateValues(values: Record<string, string>, fieldSchemaJson: string, credentialTypeId?: string): void {
        if (!fieldSchemaJson) return;

        try {
            const validator = credentialTypeId
                ? this.getValidator(credentialTypeId, fieldSchemaJson)
                : this._ajv.compile(JSON.parse(fieldSchemaJson));

            const valid = validator(values);

            if (!valid) {
                const errors = this.formatValidationErrors(validator.errors || []);
                throw new Error(`Credential validation failed:\n${errors.join('\n')}`);
            }
        } catch (e) {
            if (e instanceof SyntaxError) {
                LogError(`Invalid FieldSchema JSON: ${e}`);
                throw new Error('Invalid credential type schema');
            }
            throw e;
        }
    }

    /**
     * Formats Ajv validation errors into user-friendly messages.
     */
    private formatValidationErrors(errors: ErrorObject[]): string[] {
        return errors.map(error => {
            const field = error.instancePath.replace(/^\//, '') || 'credential';

            switch (error.keyword) {
                case 'required':
                    return `Missing required field: ${error.params.missingProperty}`;

                case 'const':
                    return `Field "${field}" must be "${error.params.allowedValue}"`;

                case 'enum':
                    const allowed = error.params.allowedValues.join(', ');
                    return `Field "${field}" must be one of: ${allowed}`;

                case 'format':
                    return `Field "${field}" must be a valid ${error.params.format}`;

                case 'pattern':
                    return `Field "${field}" does not match required pattern`;

                case 'minLength':
                    return `Field "${field}" must be at least ${error.params.limit} characters`;

                case 'maxLength':
                    return `Field "${field}" must be no more than ${error.params.limit} characters`;

                case 'minimum':
                    return `Field "${field}" must be at least ${error.params.limit}`;

                case 'maximum':
                    return `Field "${field}" must be no more than ${error.params.limit}`;

                default:
                    return `Field "${field}": ${error.message}`;
            }
        });
    }

    /**
     * Applies default and const values from JSON Schema to credential values.
     * This ensures fields with default or const constraints are auto-populated.
     */
    private applySchemaDefaults(values: Record<string, string>, fieldSchemaJson: string): Record<string, string> {
        if (!fieldSchemaJson) return values;

        try {
            const schema = JSON.parse(fieldSchemaJson);
            const properties = schema.properties || {};
            const result = { ...values };

            for (const [fieldName, fieldSchema] of Object.entries(properties)) {
                const propSchema = fieldSchema as Record<string, unknown>;

                // Apply const if field is missing (const takes priority)
                if (!(fieldName in result) && 'const' in propSchema) {
                    result[fieldName] = String(propSchema.const);
                }
                // Apply default if field is missing and no const
                else if (!(fieldName in result) && 'default' in propSchema) {
                    result[fieldName] = String(propSchema.default);
                }
            }

            return result;
        } catch (e) {
            LogError(`Failed to apply schema defaults: ${e}`);
            return values;
        }
    }

    /**
     * Updates the LastUsedAt timestamp on a credential.
     */
    private async updateLastUsedAt(credentialId: string, contextUser: UserInfo): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const credEntity = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
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
            const md = this.ProviderToUse;
            const credEntity = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
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
        credential: MJCredentialEntity | null,
        contextUser: UserInfo | undefined,
        details: CredentialAccessDetails
    ): Promise<void> {
        try {
            // Skip logging if no context user (can't create audit log without user)
            if (!contextUser) {
                return;
            }

            const md = this.ProviderToUse;
            const auditLog = await md.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', contextUser);
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
                durationMs: details.durationMs,
                expirationStatus: details.expirationStatus
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
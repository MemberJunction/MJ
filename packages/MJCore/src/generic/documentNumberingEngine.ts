/**
 * @fileoverview First-Class Scoped Document Auto-Numbering (`DocumentNumberingEngine`).
 *
 * Replaces ad-hoc `SELECT MAX(...) + 1`, `Date.now()` suffixes, and per-app stored procedures across
 * business applications with a concurrency-safe, dialect-aware (`sqlserver` + `postgresql`), gap-free
 * transactional numbering engine:
 *
 * - **Rich Pattern Grammar**: `{PREFIX}`, `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{FY}`, `{FY2}`, `{TenantID}`,
 *   `{Field:FieldName[:TRANSFORM[:FALLBACK]]}`, `{Scope:KeyName}`, and `{SEQ:N}` / `{SEQ}`.
 * - **Multi-Dimensional Partitioning**: independent counters partitioned by `scopeByTenant`, `scopeFields`
 *   (e.g. `['CompanyID']`, `['AppScope']`, `['BrandID']`), custom `DocumentScopeResolver` values, and
 *   `resetPeriod` (`'Never' | 'CalendarYear' | 'CalendarMonth' | 'FiscalYear'`).
 * - **`NOT NULL` Validation & Reserved Namespace Protection**: `BaseEntity.Validate()` automatically
 *   exempts blank auto-numbered fields on unsaved records (`!entity.IsSaved`) while still rejecting null
 *   on saved records and preventing hand-typed values from colliding with the system sequence format
 *   (`manualValueMode: 'AllowNonColliding'`).
 * - **Trigger-Safe Atomic SQL Allocation**:
 *   - SQL Server: `DECLARE @allocated TABLE ... UPDATE ... WITH (UPDLOCK, HOLDLOCK) ... OUTPUT ... INTO @allocated`
 *     (safe on tables with triggers, range-locked against concurrent first-row inserts).
 *   - PostgreSQL: `INSERT ... ON CONFLICT ("SequenceKey", "ScopeKey") DO UPDATE ... RETURNING`.
 *   - Rides the caller's ambient entity transaction (`DatabaseProviderBase.Save()`) for gap-free rollback.
 *
 * @module @memberjunction/core
 */

import {
    BaseSingleton,
    SafeJSONParse,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';
import type { DatabaseProviderBase } from './databaseProviderBase';
import type { EntityInfo } from './entityInfo';
import type { UserInfo } from './securityInfo';

export type DocumentResetPeriod = 'Never' | 'CalendarYear' | 'CalendarMonth' | 'FiscalYear';
export type ManualNumberPolicy = 'AllowNonColliding' | 'AllowAny' | 'Forbid';

export interface IDocumentNumberPolicy {
    /** Target string field on the entity to populate (e.g. `'OrderNumber'`, `'EntryNumber'`, `'IssueNumber'`). */
    targetField: string;
    /**
     * Globally-unique counter identifier. Defaults to `${entityInfo.Name}.${targetField}`.
     * Multiple entities or fields can share one counter by specifying the same `sequenceKey`.
     */
    sequenceKey?: string;
    /** Pattern template, e.g. `'{PREFIX}-{YYYY}-{SEQ:4}'` or `'{Field:AppScope:UPPER:ISS}-{SEQ:1}'`. */
    pattern: string;
    /** Static prefix substituted for `{PREFIX}`. */
    prefix?: string;
    /** Entity field names that partition the sequence into independent counters (e.g. `['CompanyID']`). */
    scopeFields?: string[];
    /** Optional fallback string when a `scopeFields` entry is null or blank on the entity. */
    scopeFieldFallbacks?: Record<string, string>;
    /** When true, includes `user.TenantContext.TenantID` in the counter `ScopeKey`. */
    scopeByTenant?: boolean;
    /** Counter reset cadence. Default `'Never'`. */
    resetPeriod?: DocumentResetPeriod;
    /** Optional Date/ISO field on the entity used to derive `{YYYY}`, `{MM}`, `{DD}`, `{FY}`, and `resetPeriod`. */
    dateSourceField?: string;
    /** Starting month (`1..12`) of the fiscal year when `{FY}` or `resetPeriod: 'FiscalYear'` is used. Default `1`. */
    fiscalYearStartMonth?: number;
    /** First sequence integer allocated for a newly-initialized scope. Default `1`. */
    startAt?: number;
    /** Step size added on each subsequent allocation. Default `1`. */
    incrementBy?: number;
    /** Policy for caller-supplied values on unsaved records. Default `'AllowNonColliding'`. */
    manualValueMode?: ManualNumberPolicy;
    /** Default `true`: once saved, `targetField` cannot be modified on subsequent updates. */
    immutableAfterCreate?: boolean;
    /** Default `true`: wrap standalone `DatabaseProviderBase.Save()` in an `EntityTransactionScope` for rollback safety. */
    gapFreeTransactional?: boolean;
}

export interface DocumentSequenceAllocationRequest {
    readonly sequenceKey: string;
    readonly scopeKey: string;
    readonly startAt: number;
    readonly incrementBy: number;
    readonly provider: DatabaseProviderBase;
    readonly contextUser?: UserInfo;
}

export interface IDocumentSequenceStore {
    AllocateNext(request: DocumentSequenceAllocationRequest): Promise<number>;
}

export interface DocumentScopeResolutionContext {
    readonly entity: BaseEntity;
    readonly policy: IDocumentNumberPolicy;
    readonly provider: DatabaseProviderBase;
    readonly contextUser?: UserInfo;
    readonly now: Date;
}

export type DocumentScopeResolver = (
    ctx: DocumentScopeResolutionContext,
) => Promise<Record<string, string>> | Record<string, string>;

const SAFE_SQL_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface BuiltSequenceSqlStatement {
    readonly sql: string;
    readonly parameters: ReadonlyArray<string | number>;
}

/**
 * Production SQL sequence store backed by `${MJCoreSchemaName}.DocumentSequenceCounter`.
 * Emits trigger-safe `UPDLOCK, HOLDLOCK` + `OUTPUT ... INTO` on SQL Server and atomic
 * `INSERT ... ON CONFLICT DO UPDATE RETURNING` on PostgreSQL, riding `provider.ExecuteSQL`
 * inside the caller's active transaction.
 */
export class SqlTableDocumentSequenceStore implements IDocumentSequenceStore {
    public BuildAllocateStatement(
        platform: 'sqlserver' | 'postgresql',
        schemaName: string,
        sequenceKey: string,
        scopeKey: string,
        startAt: number,
        incrementBy: number,
    ): BuiltSequenceSqlStatement {
        if (!SAFE_SQL_IDENTIFIER_REGEX.test(schemaName)) {
            throw new Error(
                `SqlTableDocumentSequenceStore: invalid schema identifier '${schemaName}'.`,
            );
        }

        if (platform === 'postgresql') {
            const sql = [
                `INSERT INTO "${schemaName}"."DocumentSequenceCounter"`,
                `    ("ID", "SequenceKey", "ScopeKey", "CurrentValue", "CreatedAt", "UpdatedAt")`,
                `VALUES`,
                `    (gen_random_uuid(), $1, $2, $3, NOW(), NOW())`,
                `ON CONFLICT ("SequenceKey", "ScopeKey")`,
                `DO UPDATE SET`,
                `    "CurrentValue" = "${schemaName}"."DocumentSequenceCounter"."CurrentValue" + $4,`,
                `    "UpdatedAt" = NOW()`,
                `RETURNING "CurrentValue" AS "AllocatedValue";`,
            ].join('\n');
            return {
                sql,
                parameters: [sequenceKey, scopeKey, startAt, incrementBy],
            };
        }

        const sql = [
            `DECLARE @inc BIGINT = ?;`,
            `DECLARE @seqKey NVARCHAR(255) = ?;`,
            `DECLARE @scpKey NVARCHAR(255) = ?;`,
            `DECLARE @startVal BIGINT = ?;`,
            `DECLARE @allocated TABLE (AllocatedValue BIGINT NOT NULL);`,
            `UPDATE [${schemaName}].[DocumentSequenceCounter] WITH (UPDLOCK, HOLDLOCK)`,
            `SET [CurrentValue] = [CurrentValue] + @inc,`,
            `    [UpdatedAt] = GETUTCDATE()`,
            `OUTPUT inserted.[CurrentValue] INTO @allocated(AllocatedValue)`,
            `WHERE [SequenceKey] = @seqKey AND [ScopeKey] = @scpKey;`,
            `IF NOT EXISTS (SELECT 1 FROM @allocated)`,
            `BEGIN`,
            `    INSERT INTO [${schemaName}].[DocumentSequenceCounter]`,
            `        ([ID], [SequenceKey], [ScopeKey], [CurrentValue], [CreatedAt], [UpdatedAt])`,
            `    OUTPUT inserted.[CurrentValue] INTO @allocated(AllocatedValue)`,
            `    VALUES (NEWSEQUENTIALID(), @seqKey, @scpKey, @startVal, GETUTCDATE(), GETUTCDATE());`,
            `END;`,
            `SELECT AllocatedValue FROM @allocated;`,
        ].join('\n');
        return {
            sql,
            parameters: [incrementBy, sequenceKey, scopeKey, startAt],
        };
    }

    public async AllocateNext(request: DocumentSequenceAllocationRequest): Promise<number> {
        const stmt = this.BuildAllocateStatement(
            request.provider.PlatformKey,
            request.provider.MJCoreSchemaName,
            request.sequenceKey,
            request.scopeKey,
            request.startAt,
            request.incrementBy,
        );
        const rows = await request.provider.ExecuteSQL<{ AllocatedValue?: number | string; allocatedvalue?: number | string }>(
            stmt.sql,
            [...stmt.parameters],
            {
                isMutation: true,
                description: `DocumentNumberingEngine:${request.sequenceKey}`,
            },
            request.contextUser,
        );
        const raw = rows?.[0]?.AllocatedValue ?? rows?.[0]?.allocatedvalue;
        const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        if (!Number.isFinite(parsed)) {
            throw new Error(
                `DocumentNumberingEngine failed to allocate sequence value for '${request.sequenceKey}' (scope '${request.scopeKey}').`,
            );
        }
        return parsed;
    }
}

/**
 * Deterministic concurrency-safe in-memory sequence store for unit tests and mock providers.
 */
export class InMemoryDocumentSequenceStore implements IDocumentSequenceStore {
    private readonly _counters = new Map<string, number>();
    private readonly _locks = new Map<string, Promise<void>>();

    public Reset(): void {
        this._counters.clear();
        this._locks.clear();
    }

    public PeekCurrentValue(sequenceKey: string, scopeKey: string): number | undefined {
        return this._counters.get(`${sequenceKey}::${scopeKey}`);
    }

    public async AllocateNext(request: DocumentSequenceAllocationRequest): Promise<number> {
        const compositeKey = `${request.sequenceKey}::${request.scopeKey}`;
        const prior = this._locks.get(compositeKey) ?? Promise.resolve();
        let releaseGate: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
            releaseGate = resolve;
        });
        const tail = prior.then(() => gate);
        this._locks.set(compositeKey, tail);

        await prior;
        try {
            const existing = this._counters.get(compositeKey);
            const nextValue = existing === undefined ? request.startAt : existing + request.incrementBy;
            this._counters.set(compositeKey, nextValue);
            return nextValue;
        } finally {
            releaseGate();
            if (this._locks.get(compositeKey) === tail) {
                this._locks.delete(compositeKey);
            }
        }
    }
}

interface CachedNumberPolicyEntry {
    readonly signature: string;
    readonly policies: ReadonlyArray<IDocumentNumberPolicy>;
}

/**
 * Singleton engine coordinating declarative and programmatic document auto-numbering policies.
 */
export class DocumentNumberingEngine extends BaseSingleton<DocumentNumberingEngine> {
    public static readonly AUTO_NUMBER_SETTING_NAME = 'AutoNumberPolicy';

    private readonly _programmaticPolicies = new Map<string, IDocumentNumberPolicy[]>();
    private readonly _metadataCache = new Map<string, CachedNumberPolicyEntry>();
    private readonly _scopeResolvers = new Map<string, DocumentScopeResolver>();
    private readonly _reservedPatternRegexCache = new Map<string, RegExp>();
    private readonly _systemAssignedFields = new WeakMap<BaseEntity, Set<string>>();
    private _sequenceStore: IDocumentSequenceStore = new SqlTableDocumentSequenceStore();

    public constructor() {
        super();
    }

    public static get Instance(): DocumentNumberingEngine {
        return super.getInstance<DocumentNumberingEngine>();
    }

    public SetSequenceStore(store: IDocumentSequenceStore): void {
        this._sequenceStore = store;
    }

    public GetSequenceStore(): IDocumentSequenceStore {
        return this._sequenceStore;
    }

    public RegisterPolicy(entityName: string, policy: IDocumentNumberPolicy | ReadonlyArray<IDocumentNumberPolicy>): void {
        const key = entityName.trim().toLowerCase();
        if (!key) {
            throw new Error('DocumentNumberingEngine.RegisterPolicy: entityName must be non-empty.');
        }
        const list = Array.isArray(policy) ? [...policy] : [policy as IDocumentNumberPolicy];
        this._programmaticPolicies.set(key, list);
    }

    public UnregisterPolicy(entityName: string): void {
        this._programmaticPolicies.delete(entityName.trim().toLowerCase());
    }

    public RegisterScopeResolver(sequenceKeyOrEntityName: string, resolver: DocumentScopeResolver): void {
        this._scopeResolvers.set(sequenceKeyOrEntityName.trim().toLowerCase(), resolver);
    }

    public ClearProgrammaticPolicies(): void {
        this._programmaticPolicies.clear();
        this._metadataCache.clear();
        this._scopeResolvers.clear();
        this._reservedPatternRegexCache.clear();
    }

    public ResolvePolicies(entityInfo: EntityInfo | null | undefined): ReadonlyArray<IDocumentNumberPolicy> {
        if (!entityInfo || !entityInfo.Name) {
            return [];
        }
        const programmatic = this._programmaticPolicies.get(entityInfo.Name.trim().toLowerCase());
        const fromMetadata = this.resolveMetadataPolicies(entityInfo);
        if (!programmatic || programmatic.length === 0) {
            return fromMetadata;
        }
        if (fromMetadata.length === 0) {
            return programmatic;
        }
        // Programmatic policies override metadata policies targeting the same field; remaining metadata policies stay active.
        const overriddenFields = new Set(programmatic.map((p) => p.targetField.trim().toLowerCase()));
        return [
            ...fromMetadata.filter((m) => !overriddenFields.has(m.targetField.trim().toLowerCase())),
            ...programmatic,
        ];
    }

    /**
     * Returns true when `fieldName` on `entityInfo` is governed by an active auto-number policy,
     * allowing `BaseEntity.Validate()` to suppress the pre-save `cannot be null` error on new records.
     */
    public WillAutoPopulateOnCreate(entityInfo: EntityInfo | null | undefined, fieldName: string): boolean {
        const wanted = fieldName.trim().toLowerCase();
        return this.ResolvePolicies(entityInfo).some((p) => p.targetField.trim().toLowerCase() === wanted);
    }

    /**
     * Returns true when an unsaved `entity` has at least one auto-numbered target field that is blank
     * and will require counter allocation during `Save()`.
     */
    public NeedsAllocation(entity: BaseEntity): boolean {
        if (entity.IsSaved) {
            return false;
        }
        const policies = this.ResolvePolicies(entity.EntityInfo);
        if (policies.length === 0) {
            return false;
        }
        return policies.some((p) => {
            const field = entity.GetFieldByName(p.targetField);
            return field !== null && this.isBlankValue(field.Value);
        });
    }

    /**
     * Returns true when any active auto-number policy on `entityInfo` requests gap-free transactional
     * wrapping (default `true`).
     */
    public RequiresTransactionalSave(entityInfo: EntityInfo | null | undefined): boolean {
        return this.ResolvePolicies(entityInfo).some((p) => p.gapFreeTransactional !== false);
    }

    /**
     * Validates manual overrides on new records (`Forbid` vs `AllowNonColliding` reserved-namespace check)
     * and enforces post-create immutability on saved records.
     */
    public ValidateAutoNumberFields(entity: BaseEntity, result: ValidationResult): void {
        const policies = this.ResolvePolicies(entity.EntityInfo);
        if (policies.length === 0) {
            return;
        }
        const systemAssigned = this._systemAssignedFields.get(entity);

        for (const policy of policies) {
            const field = entity.GetFieldByName(policy.targetField);
            if (!field) {
                continue;
            }

            if (!entity.IsSaved) {
                if (this.isBlankValue(field.Value)) {
                    continue;
                }
                if (systemAssigned?.has(field.Name.trim().toLowerCase())) {
                    continue;
                }
                const mode: ManualNumberPolicy = policy.manualValueMode ?? 'AllowNonColliding';
                const strVal = String(field.Value).trim();
                if (mode === 'Forbid') {
                    result.Success = false;
                    result.Errors.push(
                        new ValidationErrorInfo(
                            field.Name,
                            `Field '${field.Name}' on ${entity.EntityInfo.Name} is system-numbered and cannot be assigned manually.`,
                            strVal,
                            ValidationErrorType.Failure,
                        ),
                    );
                } else if (mode === 'AllowNonColliding') {
                    const reservedRegex = this.compileReservedNamespaceRegex(policy);
                    if (reservedRegex && reservedRegex.test(strVal)) {
                        result.Success = false;
                        result.Errors.push(
                            new ValidationErrorInfo(
                                field.Name,
                                `Manual value '${strVal}' for '${field.Name}' uses the reserved system sequence format '${policy.pattern}'. Leave it blank for automatic assignment or use a distinct external prefix.`,
                                strVal,
                                ValidationErrorType.Failure,
                            ),
                        );
                    }
                }
            } else if (policy.immutableAfterCreate !== false) {
                if (field.Dirty && String(field.OldValue ?? '') !== String(field.Value ?? '')) {
                    result.Success = false;
                    result.Errors.push(
                        new ValidationErrorInfo(
                            field.Name,
                            `Auto-numbered field '${field.Name}' on ${entity.EntityInfo.Name} cannot be modified after creation.`,
                            field.Value === null || field.Value === undefined ? null : String(field.Value),
                            ValidationErrorType.Failure,
                        ),
                    );
                }
            }
        }
    }

    /**
     * Allocates and stamps sequence numbers for all blank auto-numbered fields on an unsaved `entity`.
     * Returns the list of field names populated during this call.
     */
    public async AllocateAndAssignForEntity(
        entity: BaseEntity,
        provider: DatabaseProviderBase,
        contextUser: UserInfo | undefined,
        now: Date = new Date(),
    ): Promise<string[]> {
        if (entity.IsSaved) {
            return [];
        }
        const policies = this.ResolvePolicies(entity.EntityInfo);
        if (policies.length === 0) {
            return [];
        }

        const assignedFields: string[] = [];
        for (const policy of policies) {
            const field = entity.GetFieldByName(policy.targetField);
            if (!field || !this.isBlankValue(field.Value)) {
                continue;
            }

            const sequenceKey = (policy.sequenceKey?.trim() || `${entity.EntityInfo.Name}.${policy.targetField}`).trim();
            const customScope = await this.resolveCustomScopeMap(entity, policy, sequenceKey, provider, contextUser, now);
            const effectiveDate = this.resolveReferenceDate(entity, policy.dateSourceField, now);
            const fiscalYear = this.computeFiscalYear(effectiveDate, policy.fiscalYearStartMonth ?? 1, customScope);
            const scopeKey = this.BuildScopeKey(entity, policy, contextUser, effectiveDate, fiscalYear, customScope);

            const seqValue = await this._sequenceStore.AllocateNext({
                sequenceKey,
                scopeKey,
                startAt: policy.startAt ?? 1,
                incrementBy: policy.incrementBy ?? 1,
                provider,
                contextUser,
            });

            const formatted = this.FormatPattern(
                policy,
                seqValue,
                entity,
                contextUser,
                effectiveDate,
                fiscalYear,
                customScope,
            );
            field.Value = formatted;
            this.markSystemAssigned(entity, field.Name);
            assignedFields.push(field.Name);
        }

        return assignedFields;
    }

    /**
     * Deterministically derives the partition `ScopeKey` for a policy and entity instance.
     */
    public BuildScopeKey(
        entity: BaseEntity,
        policy: IDocumentNumberPolicy,
        contextUser: UserInfo | undefined,
        referenceDate: Date,
        fiscalYear: number,
        customScope: Record<string, string> = {},
    ): string {
        const segments: string[] = [];

        if (policy.scopeByTenant) {
            const tenantId = contextUser?.TenantContext?.TenantID?.trim();
            if (!tenantId) {
                throw new Error(
                    `DocumentNumberingEngine: policy for '${entity.EntityInfo.Name}.${policy.targetField}' requires TenantContext.TenantID (scopeByTenant = true).`,
                );
            }
            segments.push(`Tenant=${tenantId}`);
        }

        if (policy.scopeFields && policy.scopeFields.length > 0) {
            for (const scopeFieldName of policy.scopeFields) {
                const rawVal = entity.GetFieldByName(scopeFieldName)?.Value;
                const fallback = policy.scopeFieldFallbacks?.[scopeFieldName];
                const resolved = !this.isBlankValue(rawVal)
                    ? String(rawVal).trim()
                    : fallback !== undefined
                      ? fallback.trim()
                      : '';
                if (!resolved) {
                    throw new Error(
                        `DocumentNumberingEngine: required scope field '${scopeFieldName}' is empty on ${entity.EntityInfo.Name} while allocating '${policy.targetField}'.`,
                    );
                }
                segments.push(`Field:${scopeFieldName}=${resolved}`);
            }
        }

        const customKeys = Object.keys(customScope).sort();
        for (const key of customKeys) {
            segments.push(`Scope:${key}=${customScope[key]}`);
        }

        const resetPeriod: DocumentResetPeriod = policy.resetPeriod ?? 'Never';
        if (resetPeriod === 'CalendarYear') {
            segments.push(`YYYY=${referenceDate.getUTCFullYear()}`);
        } else if (resetPeriod === 'CalendarMonth') {
            const mm = String(referenceDate.getUTCMonth() + 1).padStart(2, '0');
            segments.push(`YYYYMM=${referenceDate.getUTCFullYear()}-${mm}`);
        } else if (resetPeriod === 'FiscalYear') {
            segments.push(`FY=${fiscalYear}`);
        }

        return segments.length > 0 ? segments.join('|') : '__GLOBAL__';
    }

    /**
     * Renders `policy.pattern` with the allocated integer `sequenceNumber`.
     */
    public FormatPattern(
        policy: IDocumentNumberPolicy,
        sequenceNumber: number,
        entity: BaseEntity,
        contextUser: UserInfo | undefined,
        referenceDate: Date,
        fiscalYear: number,
        customScope: Record<string, string> = {},
    ): string {
        const yyyy = String(referenceDate.getUTCFullYear());
        const yy = yyyy.slice(-2);
        const mm = String(referenceDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(referenceDate.getUTCDate()).padStart(2, '0');
        const fy = String(fiscalYear);
        const fy2 = fy.slice(-2);

        return policy.pattern.replace(/\{([^{}]+)\}/g, (_full, tokenBody: string) => {
            const trimmed = tokenBody.trim();
            if (trimmed === 'PREFIX') {
                return policy.prefix ?? '';
            }
            if (trimmed === 'YYYY') {
                return yyyy;
            }
            if (trimmed === 'YY') {
                return yy;
            }
            if (trimmed === 'MM') {
                return mm;
            }
            if (trimmed === 'DD') {
                return dd;
            }
            if (trimmed === 'FY') {
                return fy;
            }
            if (trimmed === 'FY2') {
                return fy2;
            }
            if (trimmed === 'TenantID') {
                const tid = contextUser?.TenantContext?.TenantID?.trim();
                if (!tid) {
                    throw new Error(
                        `DocumentNumberingEngine: pattern '${policy.pattern}' references {TenantID} without an active TenantContext.`,
                    );
                }
                return tid;
            }
            if (trimmed === 'SEQ' || trimmed.startsWith('SEQ:')) {
                const widthStr = trimmed.includes(':') ? trimmed.split(':')[1] : '1';
                const width = Math.max(1, Number.parseInt(widthStr, 10) || 1);
                return String(sequenceNumber).padStart(width, '0');
            }
            if (trimmed.startsWith('Field:')) {
                const parts = trimmed.split(':');
                const fieldName = parts[1] ?? '';
                const transform = (parts[2] ?? '').toUpperCase();
                const fallback = parts[3] ?? policy.scopeFieldFallbacks?.[fieldName] ?? '';
                const rawFieldVal = entity.GetFieldByName(fieldName)?.Value;
                let str = !this.isBlankValue(rawFieldVal) ? String(rawFieldVal) : fallback;
                str = this.applyFieldTransform(str, transform);
                if (!str) {
                    throw new Error(
                        `DocumentNumberingEngine: pattern '${policy.pattern}' token '{${trimmed}}' resolved to an empty string on ${entity.EntityInfo.Name}.`,
                    );
                }
                return str;
            }
            if (trimmed.startsWith('Scope:')) {
                const scopeName = trimmed.slice('Scope:'.length).trim();
                const val = customScope[scopeName];
                if (val === undefined || val === '') {
                    throw new Error(
                        `DocumentNumberingEngine: pattern '${policy.pattern}' token '{${trimmed}}' was not provided by ScopeResolver.`,
                    );
                }
                return val;
            }
            throw new Error(`DocumentNumberingEngine: unsupported pattern token '{${trimmed}}' in '${policy.pattern}'.`);
        });
    }

    private applyFieldTransform(value: string, transform: string): string {
        if (transform === 'UPPER') {
            return value.trim().toUpperCase();
        }
        if (transform === 'LOWER') {
            return value.trim().toLowerCase();
        }
        if (transform === 'TRIM') {
            return value.trim();
        }
        if (transform === 'ALNUM') {
            return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        }
        return value.trim();
    }

    private compileReservedNamespaceRegex(policy: IDocumentNumberPolicy): RegExp | null {
        const cacheKey = `${policy.pattern}::${policy.prefix ?? ''}`;
        const existing = this._reservedPatternRegexCache.get(cacheKey);
        if (existing) {
            return existing;
        }
        if (!policy.pattern.includes('{SEQ')) {
            return null;
        }

        // Convert pattern tokens into a conservative regular expression matching generated system numbers.
        // Only compile when the pattern carries at least one static literal or prefix anchor so an unanchored
        // pattern like `{Field:Code}-{SEQ:1}` with arbitrary prefixes does not falsely match every hyphenated string.
        const hasStaticPrefix =
            (policy.pattern.includes('{PREFIX}') && Boolean(policy.prefix && policy.prefix.length > 0)) ||
            /^[A-Za-z0-9]+[-_/]/.test(policy.pattern);
        if (!hasStaticPrefix) {
            return null;
        }

        let regexSource = '^';
        let cursor = 0;
        const tokenRe = /\{([^{}]+)\}/g;
        let match: RegExpExecArray | null = tokenRe.exec(policy.pattern);
        while (match !== null) {
            if (match.index > cursor) {
                regexSource += this.escapeRegexLiteral(policy.pattern.slice(cursor, match.index));
            }
            const token = match[1].trim();
            if (token === 'PREFIX') {
                regexSource += this.escapeRegexLiteral(policy.prefix ?? '');
            } else if (token === 'YYYY' || token === 'FY') {
                regexSource += '\\d{4}';
            } else if (token === 'YY' || token === 'MM' || token === 'DD' || token === 'FY2') {
                regexSource += '\\d{2}';
            } else if (token === 'SEQ' || token.startsWith('SEQ:')) {
                regexSource += '\\d+';
            } else {
                regexSource += '[A-Za-z0-9_-]+';
            }
            cursor = match.index + match[0].length;
            match = tokenRe.exec(policy.pattern);
        }
        if (cursor < policy.pattern.length) {
            regexSource += this.escapeRegexLiteral(policy.pattern.slice(cursor));
        }
        regexSource += '$';

        const compiled = new RegExp(regexSource, 'i');
        this._reservedPatternRegexCache.set(cacheKey, compiled);
        return compiled;
    }

    private escapeRegexLiteral(literal: string): string {
        return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private async resolveCustomScopeMap(
        entity: BaseEntity,
        policy: IDocumentNumberPolicy,
        sequenceKey: string,
        provider: DatabaseProviderBase,
        contextUser: UserInfo | undefined,
        now: Date,
    ): Promise<Record<string, string>> {
        const resolver =
            this._scopeResolvers.get(sequenceKey.toLowerCase()) ??
            this._scopeResolvers.get(entity.EntityInfo.Name.trim().toLowerCase());
        if (!resolver) {
            return {};
        }
        return await resolver({ entity, policy, provider, contextUser, now });
    }

    private resolveReferenceDate(entity: BaseEntity, dateSourceField: string | undefined, fallback: Date): Date {
        if (!dateSourceField) {
            return fallback;
        }
        const raw = entity.GetFieldByName(dateSourceField)?.Value;
        if (raw instanceof Date && !isNaN(raw.getTime())) {
            return raw;
        }
        if (typeof raw === 'string' && raw.trim().length > 0) {
            const parsed = new Date(raw);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        return fallback;
    }

    private computeFiscalYear(
        referenceDate: Date,
        fiscalYearStartMonth: number,
        customScope: Record<string, string>,
    ): number {
        if (customScope.FY && /^\d{4}$/.test(customScope.FY)) {
            return Number.parseInt(customScope.FY, 10);
        }
        const startMonth = Math.min(12, Math.max(1, fiscalYearStartMonth));
        const year = referenceDate.getUTCFullYear();
        const month1Based = referenceDate.getUTCMonth() + 1;
        if (startMonth === 1) {
            return year;
        }
        return month1Based >= startMonth ? year + 1 : year;
    }

    private resolveMetadataPolicies(entityInfo: EntityInfo): ReadonlyArray<IDocumentNumberPolicy> {
        const settings = entityInfo.Settings ?? [];
        const setting = settings.find(
            (s) => s.Name?.trim().toLowerCase() === DocumentNumberingEngine.AUTO_NUMBER_SETTING_NAME.toLowerCase(),
        );
        const configAutoNumber = entityInfo.ConfigurationObject?.AutoNumber;
        const signature = `${setting?.Value ?? ''}|${configAutoNumber ? JSON.stringify(configAutoNumber) : ''}`;
        if (signature === '|') {
            return [];
        }

        const cacheKey = entityInfo.ID || entityInfo.Name;
        const cached = this._metadataCache.get(cacheKey);
        if (cached && cached.signature === signature) {
            return cached.policies;
        }

        const policies: IDocumentNumberPolicy[] = [];
        if (configAutoNumber) {
            if (Array.isArray(configAutoNumber)) {
                policies.push(...configAutoNumber);
            } else {
                policies.push(configAutoNumber);
            }
        }
        if (setting?.Value) {
            const parsed = SafeJSONParse<IDocumentNumberPolicy | IDocumentNumberPolicy[]>(setting.Value, false);
            if (parsed) {
                const fromSetting = Array.isArray(parsed) ? parsed : [parsed];
                const overrideTargets = new Set(fromSetting.map((p) => p.targetField.trim().toLowerCase()));
                const retained = policies.filter((p) => !overrideTargets.has(p.targetField.trim().toLowerCase()));
                policies.length = 0;
                policies.push(...retained, ...fromSetting);
            }
        }

        this._metadataCache.set(cacheKey, { signature, policies });
        return policies;
    }

    private markSystemAssigned(entity: BaseEntity, fieldName: string): void {
        let set = this._systemAssignedFields.get(entity);
        if (!set) {
            set = new Set<string>();
            this._systemAssignedFields.set(entity, set);
        }
        set.add(fieldName.trim().toLowerCase());
    }

    private isBlankValue(value: BaseEntity['Fields'][number]['Value']): boolean {
        return value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0);
    }
}

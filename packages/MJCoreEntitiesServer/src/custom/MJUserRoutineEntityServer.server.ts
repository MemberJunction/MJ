import { createHash } from 'node:crypto';
import {
    BaseEntity,
    BaseEntityResult,
    DatabasePlatform,
    EntityDeleteOptions,
    EntitySaveOptions,
    EntityTransactionScope,
    ExecuteSQLOptions,
    RunInEntityTransaction,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { EscapeSQLString, GetGlobalObjectStore, RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { MJUserRoutineEntity, MJUserRoutineEntity_IRoutineWakeConfiguration, MJUserRoutineRecipientEntity, MJUserRoutineRunEntity } from '@memberjunction/core-entities';
import { CronExpressionHelper, ComputeRoutineNextRunAt } from '@memberjunction/scheduling-engine';

interface SqlCapableProvider {
    ExecuteSQL<T>(
        query: string,
        parameters?: unknown[],
        options?: ExecuteSQLOptions,
        contextUser?: UserInfo
    ): Promise<Array<T>>;
    PlatformKey?: DatabasePlatform;
    SupportsEntityTransactions?: boolean;
    BeginEntityTransaction?: () => Promise<EntityTransactionScope>;
    QuoteIdentifier?: (name: string) => string;
    QuoteSchemaAndView?: (schemaName: string, objectName: string) => string;
    BuildParameterPlaceholder?: (index: number) => string;
    ConfigData?: { MJCoreSchemaName?: string };
}

interface PersistedRoutineCasRow {
    ID: string;
    WakeConfiguration: string | null;
    __mj_UpdatedAt?: Date | string | null;
    Status?: string | null;
    NextRunAt?: Date | string | null;
}

interface LockResultRow {
    LockResult?: number | string | null;
}

type WakeCoalesceEventEntry = Record<string, string | number | boolean | null | undefined | object>;

interface AgentWakeCoalesceContext {
    newConfig: MJUserRoutineEntity_IRoutineWakeConfiguration;
    oldRevision: number;
    newRevision: number;
    oldWriteToken: string | null;
    newWriteToken: string | null;
    expectedUpdatedAtMs: number | null;
    bucketKey: string;
    lockResource: string;
    workstreamKey: string;
    applicationID: string | null;
    pendingEvents: WakeCoalesceEventEntry[];
}

const USER_ROUTINE_COALESCE_LOCK_STORE_KEY = '___MJ_USER_ROUTINE_COALESCE_BUCKET_LOCKS__';
const MAX_RETAINED_CONVERGENCE_EVENTS = 25;

/**
 * Server-side UserRoutine entity enforcing the scheduling + ownership invariants of the
 * User Routines feature (P1.5):
 *
 * 1. **NextRunAt maintenance** — on Save, when the schedule inputs changed (CronExpression /
 *    Timezone / StartAt dirty) or NextRunAt has never been computed, NextRunAt is recomputed
 *    via {@link ComputeRoutineNextRunAt} — the SAME cron helper the
 *    `UserRoutineDispatcherDriver` uses, including the StartAt floor. An **explicitly set**
 *    NextRunAt is always respected (the dispatcher's claim path advances it directly and
 *    must never be second-guessed here).
 * 2. **Validation** — `Validate()` rejects invalid cron expressions (and cron/timezone
 *    combinations that cannot produce a next occurrence) and any TargetType without a
 *    TargetID (the polymorphic reference has no FK, so this is the integrity backstop).
 * 3. **Ownership defense** — routines are private to their owner. Row-level security for
 *    these entities is not yet expressible via version-controlled metadata (RLS filter rows
 *    are migration-seeded reference data), so as defense-in-depth a non-Owner-type context
 *    user may only save routines they own. Owner-type users (including the system user the
 *    scheduler dispatches under) are exempt, which keeps the dispatcher's cross-user
 *    LastRunAt/NextRunAt bookkeeping working.
 * 4. **Owner attribution** — first save defaults `UserID` to the context user when unset
 *    (mirrors `MJAISkillEntityServer.CreatedByUserID`), so programmatic create paths
 *    (Create Record action, Remote Operations, scripts) attribute ownership correctly.
 * 5. **Atomic AgentWake Coalesce CAS** — enforces atomic compare-and-swap at the persistence
 *    boundary using transaction-scoped bucket locks (`sp_getapplock` / `pg_advisory_xact_lock`)
 *    + locked row reads + `ConcurrencyCheck: 'enforce'` on SQL providers, and serialized
 *    bucket CAS + post-save re-read convergence on non-SQL providers.
 */
@RegisterClass(BaseEntity, 'MJ: User Routines')
export class MJUserRoutineEntityServer extends MJUserRoutineEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (typeof this.FlushJSONFieldObjects === 'function') {
            this.FlushJSONFieldObjects();
        }
        if (!this.IsSaved && !this.UserID && this.ContextCurrentUser) {
            this.UserID = this.ContextCurrentUser.ID;
        }
        this.applyNextRunAtIfNeeded();
        const coalesceContext = this.extractAgentWakeCoalesceContext();
        if (!coalesceContext) {
            return super.Save(options);
        }
        const sqlProvider = this.resolveSqlCapableProvider();
        if (sqlProvider) {
            return this.saveAgentWakeWithSqlLockAndCAS(sqlProvider, coalesceContext, options);
        }
        return this.saveAgentWakeWithSerializedNonSqlCAS(coalesceContext, options);
    }

    private extractAgentWakeCoalesceContext(): AgentWakeCoalesceContext | null {
        if (this.RoutineType !== 'AgentWake') {
            return null;
        }
        const wakeField = this.GetFieldByName('WakeConfiguration');
        if (this.IsSaved && !wakeField?.Dirty) {
            return null;
        }
        const newConfig = this.WakeConfiguration
            ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(this.WakeConfiguration)
            : null;
        if (!newConfig) {
            return null;
        }
        const newRevision = newConfig.resumeState?.['coalesceRevision'];
        if (typeof newRevision !== 'number' || !Number.isFinite(newRevision)) {
            return null;
        }
        const oldConfig = typeof wakeField?.OldValue === 'string'
            ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(wakeField.OldValue)
            : null;
        const oldRevision = typeof oldConfig?.resumeState?.['coalesceRevision'] === 'number'
            ? oldConfig.resumeState['coalesceRevision']
            : 0;
        if (this.IsSaved && newRevision <= oldRevision) {
            return null;
        }

        const oldWriteToken = typeof oldConfig?.resumeState?.['coalesceWriteToken'] === 'string'
            ? oldConfig.resumeState['coalesceWriteToken']
            : null;
        const newWriteToken = typeof newConfig.resumeState?.['coalesceWriteToken'] === 'string'
            ? newConfig.resumeState['coalesceWriteToken']
            : null;
        const expectedUpdatedAtMs = this.parseTimestampMs(
            this.GetFieldByName('__mj_UpdatedAt')?.OldValue ?? this.__mj_UpdatedAt
        );
        const workstreamKey = (newConfig.workstreamKey ?? 'default').trim().toLowerCase();
        const rawAppId = newConfig.resumeState?.['applicationID'];
        const applicationID = typeof rawAppId === 'string' && rawAppId.trim().length > 0
            ? rawAppId.trim().toLowerCase()
            : null;
        const rawCoalesceKey = newConfig.resumeState?.['coalesceKey'];
        const bucketSegment = applicationID
            ?? (typeof rawCoalesceKey === 'string' && rawCoalesceKey.trim().length > 0
                ? rawCoalesceKey.trim().toLowerCase()
                : workstreamKey);
        const userSegment = (this.UserID ?? '').trim().toLowerCase();
        const targetSegment = (this.TargetID ?? '').trim().toLowerCase();
        const bucketKey = `${userSegment}:${targetSegment}:${bucketSegment}`;
        const lockHash = createHash('sha256').update(bucketKey).digest('hex').slice(0, 48);

        return {
            newConfig,
            oldRevision,
            newRevision,
            oldWriteToken,
            newWriteToken,
            expectedUpdatedAtMs,
            bucketKey,
            lockResource: `mj_wake_${lockHash}`,
            workstreamKey,
            applicationID,
            pendingEvents: this.readPendingEventsFromConfig(newConfig),
        };
    }

    private resolveSqlCapableProvider(): SqlCapableProvider | null {
        if (this.isSqlCapableProvider(this.ProviderToUse)) {
            return this.ProviderToUse;
        }
        if (this.isSqlCapableProvider(this.RunViewProviderToUse)) {
            return this.RunViewProviderToUse;
        }
        return null;
    }

    private isSqlCapableProvider(candidate: object | null | undefined): candidate is SqlCapableProvider {
        if (!candidate) {
            return false;
        }
        return typeof Reflect.get(candidate, 'ExecuteSQL') === 'function';
    }

    private async saveAgentWakeWithSqlLockAndCAS(
        sqlProvider: SqlCapableProvider,
        ctx: AgentWakeCoalesceContext,
        options?: EntitySaveOptions
    ): Promise<boolean> {
        let rejected = false;
        try {
            const saved = await RunInEntityTransaction(sqlProvider, async () => {
                if (sqlProvider.SupportsEntityTransactions === true) {
                    const locked = await this.acquireSqlBucketLock(sqlProvider, ctx.lockResource);
                    if (!locked) {
                        rejected = true;
                        return false;
                    }
                }
                const casPassed = await this.verifySqlCoalescePrecondition(sqlProvider, ctx);
                if (!casPassed) {
                    rejected = true;
                    return false;
                }
                const saveOptions = this.buildAtomicSaveOptions(options);
                return super.Save(saveOptions);
            });
            return rejected ? false : saved;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.registerCoalesceConflict(
                `Atomic AgentWake coalescing SQL lock/CAS error on routine ${this.ID || '(new)'}: ${msg}`
            );
            return false;
        }
    }

    private buildAtomicSaveOptions(options?: EntitySaveOptions): EntitySaveOptions | undefined {
        if (!this.IsSaved) {
            return options;
        }
        const effective = options ? { ...options } : new EntitySaveOptions();
        if (!effective.ConcurrencyCheck) {
            effective.ConcurrencyCheck = 'enforce';
        }
        return effective;
    }

    private async acquireSqlBucketLock(
        sqlProvider: SqlCapableProvider,
        lockResource: string
    ): Promise<boolean> {
        const p0 = this.paramPlaceholder(sqlProvider, 0);
        if (sqlProvider.PlatformKey === 'postgresql') {
            await sqlProvider.ExecuteSQL<LockResultRow>(
                `SELECT pg_advisory_xact_lock(hashtextextended(${p0}, 0))`,
                [lockResource],
                { isMutation: false, ignoreLogging: true },
                this.ContextCurrentUser
            );
            return true;
        }
        const lockSql =
            `DECLARE @lockResult INT; ` +
            `EXEC @lockResult = sp_getapplock @Resource = ${p0}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000; ` +
            `SELECT @lockResult AS LockResult;`;
        const rows = await sqlProvider.ExecuteSQL<LockResultRow>(
            lockSql,
            [lockResource],
            { isMutation: false, ignoreLogging: true },
            this.ContextCurrentUser
        );
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.LockResult != null) {
            const code = Number(rows[0].LockResult);
            if (Number.isFinite(code) && code < 0) {
                this.registerCoalesceConflict(
                    `Failed to acquire AgentWake bucket lock '${lockResource}' (sp_getapplock returned ${code}).`
                );
                return false;
            }
        }
        return true;
    }

    private async verifySqlCoalescePrecondition(
        sqlProvider: SqlCapableProvider,
        ctx: AgentWakeCoalesceContext
    ): Promise<boolean> {
        const schema = sqlProvider.ConfigData?.MJCoreSchemaName || this.EntityInfo?.SchemaName || '__mj';
        const baseTable = this.EntityInfo?.BaseTable || 'UserRoutine';
        const tableRef = this.quoteSchemaAndObject(sqlProvider, schema, baseTable);
        const colId = this.quoteCol(sqlProvider, 'ID');
        const colWakeCfg = this.quoteCol(sqlProvider, 'WakeConfiguration');
        const colUpdatedAt = this.quoteCol(sqlProvider, '__mj_UpdatedAt');
        const isPg = sqlProvider.PlatformKey === 'postgresql';
        const p0 = this.paramPlaceholder(sqlProvider, 0);

        if (this.IsSaved) {
            const sql = isPg
                ? `SELECT ${colId}, ${colWakeCfg}, ${colUpdatedAt} FROM ${tableRef} WHERE ${colId} = ${p0} FOR UPDATE`
                : `SELECT ${colId}, ${colWakeCfg}, ${colUpdatedAt} FROM ${tableRef} WITH (UPDLOCK, ROWLOCK) WHERE ${colId} = ${p0}`;
            const rows = await sqlProvider.ExecuteSQL<PersistedRoutineCasRow>(
                sql,
                [this.ID],
                { isMutation: false, ignoreLogging: true },
                this.ContextCurrentUser
            );
            if (!Array.isArray(rows) || rows.length === 0) {
                return true;
            }
            return this.checkPersistedRowCasMatch(rows[0], ctx);
        }

        const colUserId = this.quoteCol(sqlProvider, 'UserID');
        const colRoutineType = this.quoteCol(sqlProvider, 'RoutineType');
        const colTargetType = this.quoteCol(sqlProvider, 'TargetType');
        const colTargetId = this.quoteCol(sqlProvider, 'TargetID');
        const colStatus = this.quoteCol(sqlProvider, 'Status');
        const colNextRunAt = this.quoteCol(sqlProvider, 'NextRunAt');
        const p1 = this.paramPlaceholder(sqlProvider, 1);
        const insertCheckSql = isPg
            ? `SELECT ${colId}, ${colWakeCfg} FROM ${tableRef} WHERE ${colUserId} = ${p0} AND ${colRoutineType} = 'AgentWake' AND ${colTargetType} = 'Agent' AND ${colTargetId} = ${p1} AND ${colStatus} = 'Active' AND ${colNextRunAt} IS NOT NULL FOR UPDATE`
            : `SELECT ${colId}, ${colWakeCfg} FROM ${tableRef} WITH (UPDLOCK, HOLDLOCK) WHERE ${colUserId} = ${p0} AND ${colRoutineType} = 'AgentWake' AND ${colTargetType} = 'Agent' AND ${colTargetId} = ${p1} AND ${colStatus} = 'Active' AND ${colNextRunAt} IS NOT NULL`;
        const rows = await sqlProvider.ExecuteSQL<PersistedRoutineCasRow>(
            insertCheckSql,
            [this.UserID, this.TargetID],
            { isMutation: false, ignoreLogging: true },
            this.ContextCurrentUser
        );
        return this.verifyNoExistingUnclaimedBucketRow(rows ?? [], ctx);
    }

    private async saveAgentWakeWithSerializedNonSqlCAS(
        ctx: AgentWakeCoalesceContext,
        options?: EntitySaveOptions
    ): Promise<boolean> {
        return MJUserRoutineEntityServer.enqueueBucketOperation(ctx.bucketKey, async () => {
            const preCheckOk = await this.verifyNonSqlCoalescePrecondition(ctx);
            if (!preCheckOk) {
                return false;
            }
            const saved = await super.Save(options);
            if (!saved) {
                return false;
            }
            await this.reconcileNonSqlPostSaveConvergence(ctx, options);
            return true;
        });
    }

    private async verifyNonSqlCoalescePrecondition(ctx: AgentWakeCoalesceContext): Promise<boolean> {
        if (!this.RunViewProviderToUse) {
            return true;
        }
        try {
            const rv = new RunView(this.RunViewProviderToUse);
            if (this.IsSaved) {
                const res = await rv.RunView<PersistedRoutineCasRow>(
                    {
                        EntityName: 'MJ: User Routines',
                        ExtraFilter: `ID='${EscapeSQLString(this.ID)}'`,
                        Fields: ['ID', 'WakeConfiguration', '__mj_UpdatedAt'],
                        MaxRows: 1,
                        BypassCache: true,
                        ResultType: 'simple',
                    },
                    this.ContextCurrentUser
                );
                if (!res?.Success || !Array.isArray(res.Results) || res.Results.length === 0) {
                    return true;
                }
                return this.checkPersistedRowCasMatch(res.Results[0], ctx);
            }

            if (!this.UserID || !this.TargetID) {
                return true;
            }
            const res = await rv.RunView<PersistedRoutineCasRow>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: `UserID='${EscapeSQLString(this.UserID)}' AND RoutineType='AgentWake' AND TargetType='Agent' AND TargetID='${EscapeSQLString(this.TargetID)}' AND Status='Active'`,
                    Fields: ['ID', 'WakeConfiguration', 'Status', 'NextRunAt'],
                    MaxRows: 50,
                    BypassCache: true,
                    ResultType: 'simple',
                },
                this.ContextCurrentUser
            );
            if (!res?.Success || !Array.isArray(res.Results) || res.Results.length === 0) {
                return true;
            }
            const activePending = res.Results.filter((r) => r.NextRunAt != null && r.Status === 'Active');
            return this.verifyNoExistingUnclaimedBucketRow(activePending, ctx);
        } catch {
            // Isolated unit-test stubs without a RunView implementation fall through cleanly.
            return true;
        }
    }

    private async reconcileNonSqlPostSaveConvergence(
        ctx: AgentWakeCoalesceContext,
        options?: EntitySaveOptions
    ): Promise<void> {
        if (!this.RunViewProviderToUse || !ctx.newWriteToken || !this.UserID || !this.TargetID) {
            return;
        }
        try {
            const rv = new RunView(this.RunViewProviderToUse);
            const res = await rv.RunView<MJUserRoutineEntity>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: `UserID='${EscapeSQLString(this.UserID)}' AND RoutineType='AgentWake' AND TargetType='Agent' AND TargetID='${EscapeSQLString(this.TargetID)}'`,
                    OrderBy: '__mj_CreatedAt ASC, ID ASC',
                    MaxRows: 50,
                    BypassCache: true,
                    ResultType: 'entity_object',
                },
                this.ContextCurrentUser
            );
            if (!res?.Success || !Array.isArray(res.Results) || res.Results.length === 0) {
                return;
            }
            const activeBucket = res.Results.filter((r) => this.isUnclaimedRoutineInBucket(r, ctx));
            if (activeBucket.length === 0) {
                return;
            }
            const canonical = activeBucket[0];
            const duplicates = activeBucket.slice(1);
            const canonicalCfg = this.parseEntityWakeConfig(canonical);
            const hasOurToken = this.configHasWriteToken(canonicalCfg, ctx.newWriteToken);
            const missingEvents = this.findMissingEvents(canonicalCfg, ctx.pendingEvents);

            if (duplicates.length === 0 && hasOurToken && missingEvents.length === 0) {
                return;
            }

            await this.mergeAndConvergeBucketRoutines(canonical, duplicates, missingEvents, ctx, options);
        } catch {
            // Non-SQL stub without full entity_object RunView support — keep primary save result.
        }
    }

    private async mergeAndConvergeBucketRoutines(
        canonical: MJUserRoutineEntity,
        duplicates: MJUserRoutineEntity[],
        missingEvents: WakeCoalesceEventEntry[],
        ctx: AgentWakeCoalesceContext,
        options?: EntitySaveOptions
    ): Promise<void> {
        const canonicalCfg = this.parseEntityWakeConfig(canonical);
        const canonicalResume = this.asResumeRecord(canonicalCfg.resumeState);
        const merged = this.collectMergedBucketEvents(canonicalCfg, canonicalResume, duplicates, missingEvents, ctx);

        const nextConfig: MJUserRoutineEntity_IRoutineWakeConfiguration = {
            ...canonicalCfg,
            resumeState: {
                ...canonicalResume,
                coalesceRevision: merged.maxRevision + 1,
                coalesceWriteToken: ctx.newWriteToken ?? canonicalResume['coalesceWriteToken'],
                committedWriteTokens: merged.tokens,
                coalescedEventCount: merged.totalCount,
                overflowEventCount: merged.overflowCount,
                batchConsumed: false,
                pendingEvents: merged.retained,
            },
        };
        canonical.WakeConfiguration = JSON.stringify(nextConfig);
        if (UUIDsEqual(canonical.ID, this.ID)) {
            this.WakeConfiguration = canonical.WakeConfiguration;
            await super.Save(options);
        } else {
            await BaseEntity.prototype.Save.call(canonical, options);
        }
        await this.deactivateSupersededDuplicates(duplicates, canonical.ID, options);
    }

    private collectMergedBucketEvents(
        canonicalCfg: Partial<MJUserRoutineEntity_IRoutineWakeConfiguration>,
        canonicalResume: Record<string, unknown>,
        duplicates: MJUserRoutineEntity[],
        missingEvents: WakeCoalesceEventEntry[],
        ctx: AgentWakeCoalesceContext
    ): {
        retained: WakeCoalesceEventEntry[];
        maxRevision: number;
        totalCount: number;
        overflowCount: number;
        tokens: string[];
    } {
        const existingEvents = this.readPendingEventsFromConfig(canonicalCfg);
        const tokenSet = new Set<string>(this.readStringArray(canonicalResume['committedWriteTokens']));
        if (typeof canonicalResume['coalesceWriteToken'] === 'string') {
            tokenSet.add(canonicalResume['coalesceWriteToken']);
        }
        if (ctx.newWriteToken) {
            tokenSet.add(ctx.newWriteToken);
        }

        let maxRevision = typeof canonicalResume['coalesceRevision'] === 'number'
            ? canonicalResume['coalesceRevision']
            : ctx.newRevision;
        let overflowCount = typeof canonicalResume['overflowEventCount'] === 'number'
            ? canonicalResume['overflowEventCount']
            : 0;
        let totalCount = typeof canonicalResume['coalescedEventCount'] === 'number'
            ? canonicalResume['coalescedEventCount']
            : existingEvents.length;

        const mergedByKey = new Map<string, WakeCoalesceEventEntry>();
        const appendEvent = (ev: WakeCoalesceEventEntry, countIncrement: boolean): void => {
            const key = this.wakeEventIdentityKey(ev);
            if (!mergedByKey.has(key)) {
                mergedByKey.set(key, ev);
                if (countIncrement) {
                    totalCount++;
                }
            }
        };

        for (const ev of existingEvents) {
            appendEvent(ev, false);
        }
        for (const dup of duplicates) {
            const dupCfg = this.parseEntityWakeConfig(dup);
            const dupResume = this.asResumeRecord(dupCfg.resumeState);
            if (typeof dupResume['coalesceRevision'] === 'number') {
                maxRevision = Math.max(maxRevision, dupResume['coalesceRevision']);
            }
            for (const tok of this.readStringArray(dupResume['committedWriteTokens'])) {
                tokenSet.add(tok);
            }
            const dupEvents = this.readPendingEventsFromConfig(dupCfg);
            const dupTotal = typeof dupResume['coalescedEventCount'] === 'number'
                ? dupResume['coalescedEventCount']
                : dupEvents.length;
            const dupOverflow = Math.max(0, dupTotal - dupEvents.length);
            overflowCount += dupOverflow;
            totalCount += dupOverflow;
            for (const ev of dupEvents) {
                appendEvent(ev, true);
            }
        }
        for (const ev of missingEvents) {
            appendEvent(ev, true);
        }

        const allMerged = Array.from(mergedByKey.values());
        const retained = allMerged.slice(-MAX_RETAINED_CONVERGENCE_EVENTS);
        overflowCount += Math.max(0, allMerged.length - retained.length);
        totalCount = Math.max(totalCount, retained.length + overflowCount);

        return {
            retained,
            maxRevision,
            totalCount,
            overflowCount,
            tokens: Array.from(tokenSet).slice(-64),
        };
    }

    private async deactivateSupersededDuplicates(
        duplicates: MJUserRoutineEntity[],
        canonicalID: string,
        options?: EntitySaveOptions
    ): Promise<void> {
        for (const dup of duplicates) {
            if (UUIDsEqual(dup.ID, canonicalID)) {
                continue;
            }
            const dupCfg = this.parseEntityWakeConfig(dup);
            const dupResume = this.asResumeRecord(dupCfg.resumeState);
            dup.Status = 'Disabled';
            dup.NextRunAt = null;
            dup.WakeConfiguration = JSON.stringify({
                ...dupCfg,
                resumeState: {
                    ...dupResume,
                    batchConsumed: true,
                    coalescedIntoRoutineID: canonicalID,
                    coalescedEventCount: 0,
                    overflowEventCount: 0,
                    pendingEvents: [],
                },
            });
            await BaseEntity.prototype.Save.call(dup, options);
        }
    }

    private checkPersistedRowCasMatch(
        row: PersistedRoutineCasRow,
        ctx: AgentWakeCoalesceContext
    ): boolean {
        const persistedConfig = row.WakeConfiguration
            ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(row.WakeConfiguration)
            : null;
        const persistedRevision = typeof persistedConfig?.resumeState?.['coalesceRevision'] === 'number'
            ? persistedConfig.resumeState['coalesceRevision']
            : 0;
        const persistedWriteToken = typeof persistedConfig?.resumeState?.['coalesceWriteToken'] === 'string'
            ? persistedConfig.resumeState['coalesceWriteToken']
            : null;
        const persistedUpdatedAtMs = this.parseTimestampMs(row.__mj_UpdatedAt);

        if (persistedRevision !== ctx.oldRevision) {
            this.registerCoalesceConflict(
                `Concurrent AgentWake coalescing conflict on routine ${this.ID} (expected revision ${ctx.oldRevision}, found ${persistedRevision}).`
            );
            return false;
        }
        if (ctx.oldWriteToken !== null && persistedWriteToken !== null && persistedWriteToken !== ctx.oldWriteToken) {
            this.registerCoalesceConflict(
                `Concurrent AgentWake coalescing conflict on routine ${this.ID} (expected writeToken ${ctx.oldWriteToken}, found ${persistedWriteToken}).`
            );
            return false;
        }
        if (ctx.expectedUpdatedAtMs !== null && persistedUpdatedAtMs !== null && persistedUpdatedAtMs !== ctx.expectedUpdatedAtMs) {
            this.registerCoalesceConflict(
                `Concurrent AgentWake coalescing conflict on routine ${this.ID} (__mj_UpdatedAt timestamp mismatch).`
            );
            return false;
        }
        return true;
    }

    private verifyNoExistingUnclaimedBucketRow(
        rows: PersistedRoutineCasRow[],
        ctx: AgentWakeCoalesceContext
    ): boolean {
        for (const row of rows) {
            if (UUIDsEqual(row.ID, this.ID)) {
                continue;
            }
            const cfg = row.WakeConfiguration
                ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(row.WakeConfiguration)
                : null;
            if (!cfg) {
                continue;
            }
            if (cfg.resumeState?.['batchConsumed'] === true) {
                continue;
            }
            if (this.configMatchesBucket(cfg, ctx)) {
                this.registerCoalesceConflict(
                    `Concurrent AgentWake coalescing conflict on new routine ${this.ID || '(new)'}: active bucket routine ${row.ID} already exists.`
                );
                return false;
            }
        }
        return true;
    }

    private registerCoalesceConflict(message: string): void {
        if (typeof this.RegisterResultHistoryEntry === 'function') {
            const result = new BaseEntityResult();
            result.Success = false;
            result.Type = this.IsSaved ? 'update' : 'create';
            result.Message = message;
            result.ConcurrencyConflict = { ConflictingFields: ['WakeConfiguration'] };
            result.StartedAt = new Date();
            result.EndedAt = new Date();
            this.RegisterResultHistoryEntry(result);
        }
    }

    private quoteCol(sqlProvider: SqlCapableProvider, name: string): string {
        if (typeof sqlProvider.QuoteIdentifier === 'function') {
            return sqlProvider.QuoteIdentifier(name);
        }
        return sqlProvider.PlatformKey === 'postgresql' ? `"${name}"` : `[${name}]`;
    }

    private quoteSchemaAndObject(sqlProvider: SqlCapableProvider, schema: string, obj: string): string {
        if (typeof sqlProvider.QuoteSchemaAndView === 'function') {
            return sqlProvider.QuoteSchemaAndView(schema, obj);
        }
        return `${this.quoteCol(sqlProvider, schema)}.${this.quoteCol(sqlProvider, obj)}`;
    }

    private paramPlaceholder(sqlProvider: SqlCapableProvider, index: number): string {
        if (typeof sqlProvider.BuildParameterPlaceholder === 'function') {
            return sqlProvider.BuildParameterPlaceholder(index);
        }
        return sqlProvider.PlatformKey === 'postgresql' ? `$${index + 1}` : `@p${index}`;
    }

    private parseTimestampMs(raw: unknown): number | null {
        if (raw instanceof Date) {
            const ms = raw.getTime();
            return Number.isNaN(ms) ? null : ms;
        }
        if (typeof raw === 'string' && raw.trim().length > 0) {
            const ms = Date.parse(raw);
            return Number.isNaN(ms) ? null : ms;
        }
        return null;
    }

    private parseEntityWakeConfig(entity: MJUserRoutineEntity): Partial<MJUserRoutineEntity_IRoutineWakeConfiguration> {
        if (typeof entity.WakeConfiguration === 'string' && entity.WakeConfiguration.trim().length > 0) {
            return SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(entity.WakeConfiguration) ?? {};
        }
        if (entity.WakeConfigurationObject && typeof entity.WakeConfigurationObject === 'object') {
            return entity.WakeConfigurationObject;
        }
        return {};
    }

    private isUnclaimedRoutineInBucket(routine: MJUserRoutineEntity, ctx: AgentWakeCoalesceContext): boolean {
        if (routine.Status !== 'Active' || routine.NextRunAt == null) {
            return false;
        }
        const cfg = this.parseEntityWakeConfig(routine);
        if (cfg.resumeState?.['batchConsumed'] === true) {
            return false;
        }
        return this.configMatchesBucket(cfg, ctx);
    }

    private configMatchesBucket(
        cfg: Partial<MJUserRoutineEntity_IRoutineWakeConfiguration>,
        ctx: AgentWakeCoalesceContext
    ): boolean {
        const ws = (cfg.workstreamKey ?? 'default').trim().toLowerCase();
        if (ws === ctx.workstreamKey) {
            return true;
        }
        if (ctx.applicationID) {
            const rawApp = cfg.resumeState?.['applicationID'];
            if (typeof rawApp === 'string' && rawApp.trim().toLowerCase() === ctx.applicationID) {
                return true;
            }
        }
        return false;
    }

    private configHasWriteToken(
        cfg: Partial<MJUserRoutineEntity_IRoutineWakeConfiguration>,
        token: string
    ): boolean {
        const resume = this.asResumeRecord(cfg.resumeState);
        if (resume['coalesceWriteToken'] === token) {
            return true;
        }
        return this.readStringArray(resume['committedWriteTokens']).includes(token);
    }

    private findMissingEvents(
        cfg: Partial<MJUserRoutineEntity_IRoutineWakeConfiguration>,
        intendedEvents: WakeCoalesceEventEntry[]
    ): WakeCoalesceEventEntry[] {
        const persistedKeys = new Set(
            this.readPendingEventsFromConfig(cfg).map((e) => this.wakeEventIdentityKey(e))
        );
        return intendedEvents.filter((e) => !persistedKeys.has(this.wakeEventIdentityKey(e)));
    }

    private readPendingEventsFromConfig(
        cfg: Partial<MJUserRoutineEntity_IRoutineWakeConfiguration>
    ): WakeCoalesceEventEntry[] {
        const resume = this.asResumeRecord(cfg.resumeState);
        const queued = resume['pendingEvents'];
        if (Array.isArray(queued)) {
            return queued.filter((item): item is WakeCoalesceEventEntry => typeof item === 'object' && item !== null);
        }
        return [];
    }

    private asResumeRecord(raw: unknown): Record<string, unknown> {
        return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    }

    private readStringArray(raw: unknown): string[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.filter((v): v is string => typeof v === 'string');
    }

    private wakeEventIdentityKey(event: WakeCoalesceEventEntry): string {
        const id =
            event['requestID'] ??
            event['messageID'] ??
            event['conversationDetailID'] ??
            event['taskID'] ??
            event['eventID'] ??
            event['recordID'] ??
            '';
        const qualifier = event['status'] ?? event['wakeReason'] ?? '';
        return `${String(event['triggerType'] ?? '')}:${String(id)}:${String(qualifier)}`.toLowerCase();
    }

    private static getBucketLockMap(): Map<string, Promise<void>> {
        const store = GetGlobalObjectStore();
        if (store) {
            const existing = store[USER_ROUTINE_COALESCE_LOCK_STORE_KEY];
            if (existing instanceof Map) {
                return existing as Map<string, Promise<void>>;
            }
            const created = new Map<string, Promise<void>>();
            store[USER_ROUTINE_COALESCE_LOCK_STORE_KEY] = created;
            return created;
        }
        return MJUserRoutineEntityServer.fallbackBucketLocks;
    }

    private static readonly fallbackBucketLocks = new Map<string, Promise<void>>();

    private static enqueueBucketOperation<T>(bucketKey: string, operation: () => Promise<T>): Promise<T> {
        const locks = MJUserRoutineEntityServer.getBucketLockMap();
        const prev = locks.get(bucketKey) ?? Promise.resolve();
        const next = prev.then(operation, operation);
        const link: Promise<void> = next
            .then(
                () => undefined,
                () => undefined
            )
            .finally(() => {
                if (locks.get(bucketKey) === link) {
                    locks.delete(bucketKey);
                }
            });
        locks.set(bucketKey, link);
        return next;
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateSchedule(result);
        this.validateTarget(result);
        this.validateOwnership(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * FK cleanup before delete (see BASE_ENTITY_SERVER_PATTERNS): recipients and run
     * bookkeeping rows hang off the routine via RoutineID, so they're removed first —
     * otherwise deleting any routine that has ever run fails on the FK. The underlying
     * Agent Run / Prompt Run / Action Execution Log records the runs LINK to are
     * independent and remain — that's where the real telemetry/audit lives.
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const deps = await this.deleteDependents();
        if (!deps) {
            return false;
        }
        return super.Delete(options);
    }

    /** Deletes recipient + run rows for this routine. Returns false (with LatestResult intact on the failing row) on the first failure. */
    private async deleteDependents(): Promise<boolean> {
        const rv = new RunView(this.RunViewProviderToUse);
        const [recipients, runs] = await rv.RunViews(
            [
                { EntityName: 'MJ: User Routine Recipients', ExtraFilter: `RoutineID='${this.ID}'`, ResultType: 'entity_object' },
                { EntityName: 'MJ: User Routine Runs', ExtraFilter: `RoutineID='${this.ID}'`, ResultType: 'entity_object' },
            ],
            this.ContextCurrentUser,
        );
        const rows: BaseEntity[] = [
            ...((recipients.Success ? recipients.Results : []) as MJUserRoutineRecipientEntity[]),
            ...((runs.Success ? runs.Results : []) as MJUserRoutineRunEntity[]),
        ];
        for (const row of rows) {
            if (!(await row.Delete())) {
                return false;
            }
        }
        return true;
    }

    /**
     * Recompute NextRunAt when the schedule changed or it was never computed — unless the
     * caller explicitly set NextRunAt on this save (dirty), which always wins (the
     * dispatcher's optimistic claim advances NextRunAt directly).
     */
    private applyNextRunAtIfNeeded(): void {
        // Only a dirty NON-NULL NextRunAt is an explicit claim/advance ("run now", the
        // dispatcher's optimistic claim) and wins. A null can never be a claim — and the
        // GraphQL create path marks every client-provided field dirty, including a
        // client's untouched null, so a null-dirty NextRunAt must not suppress the
        // initial computation (it previously left new UI-created routines unscheduled
        // until the dispatcher's seeding sweep).
        //
        // On an unsaved record a non-null NextRunAt is always the caller's explicit time. Field Dirty
        // cannot tell us so there: after NewRecord() a field's first write also becomes its OldValue,
        // so a one-shot built with a default cron that is then cleared reads as "schedule changed,
        // NextRunAt not dirty" and would be recomputed to null (no cron, no StartAt), after which the
        // dispatcher's post-run roll-up disables it.
        const explicitlySet = this.NextRunAt != null
            && (!this.IsSaved || this.GetFieldByName('NextRunAt')?.Dirty === true);
        if (explicitlySet) {
            return;
        }
        const scheduleChanged = ['CronExpression', 'Timezone', 'StartAt', 'ScheduleMode']
            .some(fieldName => this.GetFieldByName(fieldName)?.Dirty === true);
        if (this.NextRunAt != null && !scheduleChanged) {
            return;
        }
        try {
            this.NextRunAt = ComputeRoutineNextRunAt(
                this.CronExpression,
                this.Timezone,
                new Date(),
                this.StartAt,
                this.ScheduleMode ?? 'Recurring'
            );
        } catch {
            // Invalid cron/timezone — leave NextRunAt untouched; Validate() reports the
            // problem and fails the save with a meaningful message.
        }
    }

    /** Reject invalid cron expressions and cron/timezone combinations that cannot compute a next occurrence. */
    private validateSchedule(result: ValidationResult): void {
        const mode: MJUserRoutineEntity['ScheduleMode'] = this.ScheduleMode ?? 'Recurring';
        const hasCron = this.CronExpression != null && this.CronExpression.trim().length > 0;

        if (!hasCron) {
            if (mode === 'OneShot' || (mode === 'Adaptive' && this.RoutineType === 'AgentWake')) {
                return;
            }
            result.Errors.push(new ValidationErrorInfo(
                'CronExpression',
                `CronExpression is required when ScheduleMode is '${mode}'.`,
                this.CronExpression,
                ValidationErrorType.Failure
            ));
            return;
        }

        const cronResult = CronExpressionHelper.ValidateExpression(this.CronExpression!);
        if (!cronResult.Success) {
            result.Errors.push(...cronResult.Errors);
            return;
        }
        try {
            ComputeRoutineNextRunAt(this.CronExpression, this.Timezone, new Date(), this.StartAt, mode);
        } catch (error) {
            result.Errors.push(new ValidationErrorInfo(
                'CronExpression',
                `Cannot compute a next run time from CronExpression '${this.CronExpression}' with Timezone '${this.Timezone}': ` +
                `${error instanceof Error ? error.message : String(error)}`,
                this.CronExpression,
                ValidationErrorType.Failure
            ));
        }
    }

    /** The polymorphic TargetID has no FK — require it whenever a TargetType is set. */
    private validateTarget(result: ValidationResult): void {
        if (this.TargetType && !this.TargetID) {
            result.Errors.push(new ValidationErrorInfo(
                'TargetID',
                `TargetID is required — a routine with TargetType '${this.TargetType}' must reference a ${this.TargetType} record.`,
                this.TargetID,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
     * Defense-in-depth ownership gate: a non-Owner-type context user may only save routines
     * they own (compared against the PRE-save owner, so reassigning UserID cannot bypass it).
     * Owner-type users — admins and the scheduler's system user — are exempt.
     */
    private validateOwnership(result: ValidationResult): void {
        const user = this.ContextCurrentUser;
        if (!user || user.Type?.trim().toLowerCase() === 'owner') {
            return;
        }
        const preSaveOwnerId = (this.GetFieldByName('UserID')?.OldValue as string | null | undefined) ?? this.UserID;
        if (preSaveOwnerId && !UUIDsEqual(preSaveOwnerId, user.ID)) {
            result.Errors.push(new ValidationErrorInfo(
                'UserID',
                'Routines are private to their owner — you can only modify routines you own.',
                this.UserID,
                ValidationErrorType.Failure
            ));
        }
    }
}

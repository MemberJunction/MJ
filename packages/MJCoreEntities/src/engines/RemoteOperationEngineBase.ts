/**
 * @fileoverview Metadata cache for `MJ: Remote Operations` rows — the `@RegisterForStartup` engine the
 * generic `ExecuteRemoteOperation` resolver consults to gate dispatch on the operation's metadata
 * (Status / approval), independent of the in-code ClassFactory registration.
 *
 * Why this exists as defense-in-depth: CodeGen only emits Active + Approved operations, so a Disabled or
 * unapproved op normally has no generated class and is therefore unregistered + already unreachable. But a
 * hand-authored (`GenerationType='Manual'`) op keeps its `@RegisterClass` decorator in source even if the
 * metadata row is later set to `Status='Disabled'`. This engine lets the resolver honor that metadata state
 * at runtime — a registered-but-disabled op is rejected — with a synchronous in-memory cache hit (no per-call
 * DB query), kept fresh by the BaseEngine entity-event subscription.
 *
 * @module @memberjunction/core-entities
 */
import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo, RegisterForStartup } from '@memberjunction/core';
import { MJRemoteOperationEntity } from '../generated/entity_subclasses';

/** Why an operation is not currently invokable (for a clear caller-facing rejection). */
export interface RemoteOperationInvokabilityResult {
    /** True when the operation may be dispatched. */
    Invokable: boolean;
    /** Machine-readable reason code when not invokable (e.g. `OPERATION_DISABLED`, `OPERATION_NOT_APPROVED`). */
    ResultCode?: string;
    /** Human-readable reason when not invokable. */
    Reason?: string;
}

/**
 * Caches every `MJ: Remote Operations` row and answers "may this operation key be dispatched?" from metadata.
 * Client-safe (pure metadata caching); the server resolver uses it as a defense-in-depth gate.
 */
@RegisterForStartup()
export class RemoteOperationEngineBase extends BaseEngine<RemoteOperationEngineBase> {
    private _remoteOperations: MJRemoteOperationEntity[] = [];
    private _byKey: Map<string, MJRemoteOperationEntity> | null = null;

    /** The process-wide singleton. */
    public static get Instance(): RemoteOperationEngineBase {
        return super.getInstance<RemoteOperationEngineBase>();
    }

    /** Loads (or refreshes) the cached Remote Operation rows. */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                PropertyName: '_remoteOperations',
                EntityName: 'MJ: Remote Operations',
                CacheLocal: true,
            },
        ];
        this._byKey = null; // invalidate the key index; rebuilt lazily after (re)load
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    /** All cached Remote Operation rows. */
    public get RemoteOperations(): MJRemoteOperationEntity[] {
        return this._remoteOperations;
    }

    /** Case-insensitive lookup of an operation row by its `OperationKey` (`undefined` if there is no row). */
    public GetOperationByKey(operationKey: string): MJRemoteOperationEntity | undefined {
        if (!operationKey) {
            return undefined;
        }
        if (!this._byKey) {
            this._byKey = new Map(this._remoteOperations.map((o) => [o.OperationKey.trim().toLowerCase(), o]));
        }
        return this._byKey.get(operationKey.trim().toLowerCase());
    }

    /**
     * Decides whether the operation key may be dispatched, from its metadata row. When there is NO row for the
     * key (a code-only operation), it is considered invokable — the in-code ClassFactory registration governs.
     * When a row exists it must be `Active`, and `AI`-generated ops must additionally be `Approved`.
     */
    public IsInvokable(operationKey: string): RemoteOperationInvokabilityResult {
        const row = this.GetOperationByKey(operationKey);
        if (!row) {
            return { Invokable: true }; // no metadata row → governed solely by code registration
        }
        if (row.Status !== 'Active') {
            return { Invokable: false, ResultCode: 'OPERATION_DISABLED', Reason: `Remote operation '${operationKey}' is not active (Status='${row.Status}')` };
        }
        if (row.GenerationType === 'AI' && row.CodeApprovalStatus !== 'Approved') {
            return { Invokable: false, ResultCode: 'OPERATION_NOT_APPROVED', Reason: `Remote operation '${operationKey}' has unapproved AI-generated code (CodeApprovalStatus='${row.CodeApprovalStatus}')` };
        }
        return { Invokable: true };
    }
}

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { MJAuditLogTypeEntity } from "../generated/entity_subclasses";

/**
 * Caches the rows of `MJ: Audit Log Types` so callers that emit audit-log
 * entries can resolve `AuditLogTypeID` by NAME instead of by hardcoded UUID.
 *
 * The seed data (under `metadata/audit-log-types/`) is the source of truth
 * for the IDs — code that hardcodes them goes stale silently if a row is
 * renamed or replaced. Code that calls `ByName(...)` fails loud at the
 * lookup site instead, which is much easier to track down.
 *
 * Singleton via `BaseEngine`. Idempotent `Config()` — subsequent calls
 * short-circuit once the cache is loaded.
 *
 * @example
 * await AuditLogTypeEngine.Instance.Config(false, contextUser, provider);
 * const t = AuditLogTypeEngine.Instance.ByName('List Shared');
 * if (!t) throw new Error('Audit log type "List Shared" not seeded');
 * auditLog.AuditLogTypeID = t.ID;
 */
export class AuditLogTypeEngine extends BaseEngine<AuditLogTypeEngine> {
    public static get Instance(): AuditLogTypeEngine {
        return super.getInstance<AuditLogTypeEngine>();
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Audit Log Types',
                PropertyName: '_AuditLogTypes',
                CacheLocal: true,
            },
        ];
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    public get AuditLogTypes(): MJAuditLogTypeEntity[] {
        return this._AuditLogTypes;
    }
    private _AuditLogTypes: MJAuditLogTypeEntity[] = [];

    /**
     * Look up a row by exact `Name`. Returns `undefined` if the engine
     * hasn't been configured yet or no row matches — callers should treat
     * the latter as "seed metadata missing" and throw, never silently
     * persist rows with an undefined `AuditLogTypeID`.
     */
    public ByName(name: string): MJAuditLogTypeEntity | undefined {
        return this._AuditLogTypes.find(t => t.Name === name);
    }
}

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { MJResourceTypeEntity } from "../generated/entity_subclasses";

/**
 * Caches the rows of `MJ: Resource Types` so callers that scope a
 * `MJResourcePermission` (or any resource-typed surface) to a specific kind
 * of resource can resolve `ResourceTypeID` by NAME instead of by hardcoded
 * UUID.
 *
 * The seed data (under `metadata/resource-types/`) is the source of truth
 * for the IDs — code that hardcodes them goes stale silently if a row is
 * renamed or replaced. Code that calls `ByName(...)` fails loud at the
 * lookup site, which is much easier to track down.
 *
 * Singleton via `BaseEngine`. Idempotent `Config()` — subsequent calls
 * short-circuit once the cache is loaded.
 *
 * @example
 * await ResourceTypeEngine.Instance.Config(false, contextUser, provider);
 * const rt = ResourceTypeEngine.Instance.ByName('Lists');
 * if (!rt) throw new Error('Resource type "Lists" not seeded');
 * permission.ResourceTypeID = rt.ID;
 */
export class ResourceTypeEngine extends BaseEngine<ResourceTypeEngine> {
    public static get Instance(): ResourceTypeEngine {
        return super.getInstance<ResourceTypeEngine>();
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Resource Types',
                PropertyName: '_ResourceTypes',
                CacheLocal: true,
            },
        ];
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    public get ResourceTypes(): MJResourceTypeEntity[] {
        return this._ResourceTypes;
    }
    private _ResourceTypes: MJResourceTypeEntity[] = [];

    /**
     * Look up a row by exact `Name`. Returns `undefined` if the engine
     * hasn't been configured yet or no row matches — callers should treat
     * the latter as "seed metadata missing" and throw, never silently
     * persist rows with an undefined `ResourceTypeID`.
     */
    public ByName(name: string): MJResourceTypeEntity | undefined {
        return this._ResourceTypes.find(rt => rt.Name === name);
    }
}

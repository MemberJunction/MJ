/**
 * `BaseEngineRegistry.FindCachedEntity()` reads the configs of every loaded engine on each call. With
 * IsA load hints it runs for every record an IsA parent with an opted-in `SubtypeSelector` loads,
 * which includes every row of an entity-object `RunView`. `BaseEngine.Configs` deep-copies on every
 * read, so the registry reads `ReadonlyConfigs`, the engine's own array (#4792).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import type { BaseEntity } from '../generic/baseEntity';
import type { UserInfo } from '../generic/securityInfo';

const PRODUCT_TYPES: Partial<BaseEnginePropertyConfig> = { Type: 'entity', EntityName: 'Product Types', PropertyName: 'ProductTypes' };

/** A `BaseEngine` that declares its configs through `LoadConfigs()`, with the data load stubbed out. */
class CacheDonorEngine extends BaseEngine<CacheDonorEngine> {
    public ProductTypes: BaseEntity[] = [];

    public async Config(): Promise<void> {
        // Configs are declared through Declare().
    }

    public override get Loaded(): boolean {
        return true;
    }

    public async Declare(configs: Partial<BaseEnginePropertyConfig>[]): Promise<void> {
        // The context user only reaches the load methods stubbed out below.
        await this.LoadConfigs(configs, {} as UserInfo);
    }

    protected override CheckPermissionsOrSkipAll(configs: BaseEnginePropertyConfig[]): BaseEnginePropertyConfig[] {
        return configs;
    }

    protected override async LoadMultipleEntityConfigs(): Promise<void> {
        // No data: the registry only needs the configs and the property array.
    }

    protected override async LoadSingleDatasetConfig(): Promise<void> {
        // As above.
    }

    protected override RegisterCacheChangeCallbacks(): void {
        // No provider in a unit test.
    }
}

/** An engine that doesn't extend `BaseEngine`: it has `Configs` and no `ReadonlyConfigs`. */
class DuckTypedDonor {
    public Loaded = true;
    public Configs = [{ ...PRODUCT_TYPES }];
    public ProductTypes: BaseEntity[] = [];
}

const registered: object[] = [];

function register<T extends object>(engine: T): T {
    BaseEngineRegistry.Instance.RegisterEngine(engine);
    registered.push(engine);
    return engine;
}

afterEach(() => {
    vi.restoreAllMocks();
    for (const engine of registered.splice(0)) {
        BaseEngineRegistry.Instance.UnregisterEngine(engine);
    }
});

describe('BaseEngineRegistry.FindCachedEntity', () => {
    it("reads a BaseEngine's configs without copying them", async () => {
        const engine = new CacheDonorEngine();
        await engine.Declare([PRODUCT_TYPES]);
        register(engine);
        const configsRead = vi.spyOn(BaseEngine.prototype, 'Configs', 'get');

        const matches = BaseEngineRegistry.Instance.FindCachedEntity('Product Types');

        expect(matches).toHaveLength(1);
        expect(configsRead).not.toHaveBeenCalled();
        expect(matches[0].config).toBe(engine.ReadonlyConfigs[0]);
        expect(matches[0].records).toBe(engine.ProductTypes);
    });

    it('reads an engine that does not extend BaseEngine through Configs', () => {
        const engine = register(new DuckTypedDonor());

        const matches = BaseEngineRegistry.Instance.FindCachedEntity('product types');

        expect(matches).toHaveLength(1);
        expect(matches[0].config).toBe(engine.Configs[0]);
        expect(matches[0].records).toBe(engine.ProductTypes);
    });
});

describe('BaseEngine.ReadonlyConfigs', () => {
    it('is the engine\'s own array, while Configs stays a copy for every other caller', async () => {
        const engine = new CacheDonorEngine();
        await engine.Declare([PRODUCT_TYPES]);

        expect(engine.ReadonlyConfigs).toBe(engine.ReadonlyConfigs);
        const copy = engine.Configs;
        expect(copy).not.toBe(engine.ReadonlyConfigs);
        expect(copy[0].EntityName).toBe('Product Types');

        copy[0].Filter = "Name = 'Changed'";
        expect(engine.ReadonlyConfigs[0].Filter).not.toBe("Name = 'Changed'");
    });
});

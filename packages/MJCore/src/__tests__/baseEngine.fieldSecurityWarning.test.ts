/**
 * A server-side engine loads as the system user, so its cache holds every column of the entities
 * it loads. When one of those entities has field-level security (its own flag, or an IS-A
 * ancestor's), the engine says so once at load time: whatever hands engine data to a person must
 * project it for that person first. The warning changes nothing about the load.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { EntityInfo } from '../generic/entityInfo';
import { IMetadataProvider, ProviderType } from '../generic/interfaces';
import type { UserInfo } from '../generic/securityInfo';

const SECURED_ID = 'e-secured';
const CHILD_ID = 'e-secured-child';
const PLAIN_ID = 'e-plain';

function entityRow(id: string, name: string, parentId: string | null, enableFLS: boolean): Record<string, unknown> {
    return {
        ID: id, Name: name, ParentID: parentId, SchemaName: 'dbo', BaseTable: name, BaseView: `vw${name}`,
        EnableFieldLevelSecurity: enableFLS,
        Fields: [{ ID: `${id}-id`, EntityID: id, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 }],
    };
}

function fakeProvider(providerType: ProviderType): IMetadataProvider {
    const shape = {
        ProviderType: providerType,
        Entities: [] as EntityInfo[],
        EntityByName(name: string): EntityInfo | undefined {
            return shape.Entities.find(e => e.Name.toLowerCase() === name.toLowerCase());
        },
        EntityByID(id: string): EntityInfo | undefined {
            return shape.Entities.find(e => e.ID === id);
        },
    };
    const typed = shape as unknown as IMetadataProvider;
    shape.Entities = [
        new EntityInfo(entityRow(SECURED_ID, 'Secured', null, true), typed),
        new EntityInfo(entityRow(CHILD_ID, 'SecuredChild', SECURED_ID, false), typed),
        new EntityInfo(entityRow(PLAIN_ID, 'Plain', null, false), typed),
    ];
    return typed;
}

/** Declares configs through `LoadConfigs()` with every data load stubbed out. */
abstract class WarningEngineBase extends BaseEngine<WarningEngineBase> {
    constructor(private readonly testProvider: IMetadataProvider) {
        super();
    }
    public async Config(): Promise<void> { /* configs are declared through Declare() */ }
    public override get ProviderToUse(): IMetadataProvider {
        return this.testProvider;
    }
    public async Declare(entityNames: string[]): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = entityNames.map(n => ({ Type: 'entity', EntityName: n, PropertyName: n }));
        await this.LoadConfigs(configs, {} as UserInfo);
    }
    protected override CheckPermissionsOrSkipAll(configs: BaseEnginePropertyConfig[]): BaseEnginePropertyConfig[] {
        return configs;
    }
    protected override async LoadMultipleEntityConfigs(): Promise<void> { /* no data */ }
    protected override async LoadSingleDatasetConfig(): Promise<void> { /* no data */ }
    protected override RegisterCacheChangeCallbacks(): void { /* no provider */ }
}
class ServerWarningEngine extends WarningEngineBase {}
class ClientWarningEngine extends WarningEngineBase {}

function fieldSecurityLines(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.map(c => String(c[0])).filter(m => m.includes('field-level security'));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('BaseEngine field-level security warning', () => {
    it('warns once per engine and entity on a server, including for an IS-A child of a secured parent', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const engine = new ServerWarningEngine(fakeProvider(ProviderType.Database));
        await engine.Declare(['Secured', 'SecuredChild', 'Plain']);
        await engine.Declare(['Secured', 'SecuredChild', 'Plain']);

        const lines = fieldSecurityLines(log);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain("ServerWarningEngine: 'Secured'");
        expect(lines[1]).toContain("ServerWarningEngine: 'SecuredChild'");
        expect(lines[0]).toContain('loaded as the system user');
    });

    it('stays quiet on a client, where the server has already projected the data', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        await new ClientWarningEngine(fakeProvider(ProviderType.Network)).Declare(['Secured']);
        expect(fieldSecurityLines(log)).toHaveLength(0);
    });
});

/**
 * `IntrospectSchemaOptions.OnObject` — the streaming seam in both base connectors.
 *
 * Both base `IntrospectSchema` implementations accumulate: every object, with every field, is held
 * in `result.Objects` until the whole catalog has been built, and only then handed back. On a large
 * source that is the run's peak — 888 objects / ~97k field descriptors held at once, measured at
 * ~2 GB within 27 s of a 4,748 MB ceiling. A caller that can persist one object at a time has no
 * use for the accumulated array, so it can now take each object as it is built instead.
 *
 * Pinned here:
 *  - with a handler, every object reaches it, NOTHING is retained, and the result says it streamed;
 *  - without one, behaviour is what it was (accumulate and return) — the seam is inert until a
 *    caller opts in, which is what keeps every connector override in other repos working;
 *  - the handler is awaited, so a caller that persists inside it never has more than the objects
 *    in flight resident;
 *  - the REST base accepts the options at all (it used to declare no third parameter, so anything
 *    a caller passed was silently dropped).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ConnectionTestResult,
} from '../BaseIntegrationConnector';
import { BaseRESTIntegrationConnector } from '../BaseRESTIntegrationConnector';
import type { SourceObjectInfo } from '../types';

const CI = { ID: 'ci-1', IntegrationID: 'int-1', Configuration: null } as unknown as MJCompanyIntegrationEntity;
const USER = {} as UserInfo;

/** Live-describe shape: DiscoverObjects + DiscoverFields, the base implementation's inputs. */
class DescribeConnector extends BaseIntegrationConnector {
    public ObjectNames = ['Alpha', 'Bravo', 'Charlie'];

    public get IntegrationName(): string { return 'Test'; }
    public async TestConnection(): Promise<ConnectionTestResult> { return { Success: true, Message: 'ok' }; }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> { return { Records: [], HasMore: false }; }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> {
        return this.ObjectNames.map(Name => ({ Name, Label: `${Name} label`, SupportsIncrementalSync: false, SupportsWrite: false }));
    }
    public async DiscoverFields(_ci: MJCompanyIntegrationEntity, objectName: string): Promise<ExternalFieldSchema[]> {
        return [
            { Name: 'Id', Label: 'Id', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true, IsPrimaryKey: true },
            { Name: `${objectName}_note`, Label: 'note', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        ];
    }
}

/** Cache-driven shape: the REST base re-reads the persisted catalog, so the engine is faked. */
class CatalogConnector extends BaseRESTIntegrationConnector {
    public get IntegrationName(): string { return 'Test'; }
}

function installCatalog(objectNames: string[]): void {
    const objects = objectNames.map((Name, i) => ({ ID: `obj-${i}`, Name, DisplayName: Name, Description: null, Status: 'Active' }));
    const fields = objects.map(o => ({
        ID: `${o.ID}-f`, IntegrationObjectID: o.ID, Name: 'Id', DisplayName: 'Id', Type: 'nvarchar', Length: 50,
        IsPrimaryKey: true, IsUniqueKey: true, IsRequired: true, AllowsNull: false, IsReadOnly: true,
        Status: 'Active', Sequence: 1, RelatedIntegrationObjectID: null,
    }));
    vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
        GetActiveIntegrationObjects: () => objects,
        IntegrationObjectFields: fields,
        GetIntegrationObjectFields: (id: string) => fields.filter(f => f.IntegrationObjectID === id),
    } as unknown as IntegrationEngineBase);
}

describe('IntrospectSchema OnObject — base connector (live describe)', () => {
    beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => undefined); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('hands every object to the handler and retains none of them', async () => {
        const seen: SourceObjectInfo[] = [];
        const result = await new DescribeConnector().IntrospectSchema(CI, USER, {
            OnObject: async (obj) => { seen.push(obj); },
        });

        expect(seen.map(o => o.ExternalName).sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
        // The object the handler got is the full build, not a stub.
        const bravo = seen.find(o => o.ExternalName === 'Bravo');
        expect(bravo?.ExternalLabel).toBe('Bravo label');
        expect(bravo?.Fields.map(f => f.Name)).toEqual(['Id', 'Bravo_note']);
        expect(bravo?.PrimaryKeyFields).toEqual(['Id']);
        // Released, not accumulated: that is the entire point of the seam.
        expect(result.Objects).toEqual([]);
        expect(result.Streamed).toBe(true);
    });

    it('is inert without a handler: accumulates and returns, exactly as before', async () => {
        const result = await new DescribeConnector().IntrospectSchema(CI, USER);

        expect(result.Objects.map(o => o.ExternalName).sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(result.Streamed).toBeFalsy();
    });

    it('awaits the handler, so a persisting caller bounds what is resident', async () => {
        // A handler that does real work (a persist) must finish before the object counts as done;
        // otherwise every object would be built and parked in un-awaited promises — the same peak.
        let inHandler = 0;
        let maxInHandler = 0;
        let finished = 0;
        await new DescribeConnector().IntrospectSchema(CI, USER, {
            OnObject: async () => {
                inHandler++;
                maxInHandler = Math.max(maxInHandler, inHandler);
                await new Promise(r => setTimeout(r, 5));
                inHandler--;
                finished++;
            },
        });
        expect(finished).toBe(3);
        expect(inHandler).toBe(0);
        expect(maxInHandler).toBeGreaterThan(0);
    });
});

describe('IntrospectSchema OnObject — REST base (cache-driven)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('accepts the options and streams the persisted catalog object by object', async () => {
        installCatalog(['Invoice', 'Customer']);
        const order: string[] = [];
        const result = await new CatalogConnector().IntrospectSchema(CI, USER, {
            OnObject: async (obj) => {
                order.push(`start:${obj.ExternalName}`);
                await new Promise(r => setTimeout(r, 1));
                order.push(`end:${obj.ExternalName}`);
            },
        });

        // Serial and awaited: one object is fully handled before the next is built.
        expect(order).toEqual(['start:Invoice', 'end:Invoice', 'start:Customer', 'end:Customer']);
        expect(result.Objects).toEqual([]);
        expect(result.Streamed).toBe(true);
        expect(result.IsAuthoritative).toBe(false);
    });

    it('is inert without a handler', async () => {
        installCatalog(['Invoice', 'Customer']);
        const result = await new CatalogConnector().IntrospectSchema(CI, USER);

        expect(result.Objects.map(o => o.ExternalName)).toEqual(['Invoice', 'Customer']);
        expect(result.Streamed).toBeFalsy();
    });
});

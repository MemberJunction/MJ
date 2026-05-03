/**
 * Unit tests for AgentDataPreloader's lazy-mode surface.
 *
 * Eager preload is exercised by integration tests against a real provider —
 * here we cover the deterministic, adapter-injectable parts of the lazy API:
 * tool synthesis (RunView + RunQuery), tool-name sanitisation, URI stability,
 * adapter registration, per-run cache lifecycle, singleton invariance.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    AgentDataPreloader,
    RunViewRunQueryLazyAdapter,
    type LazyDataSourceAdapter,
    type LazyDataSourceToolDescriptor,
} from '../AgentDataPreloader';
import type { MJAIAgentDataSourceEntity } from '@memberjunction/core-entities';

function fakeRunViewSource(over: Partial<MJAIAgentDataSourceEntity> = {}): MJAIAgentDataSourceEntity {
    return {
        ID: '11111111-1111-1111-1111-111111111111',
        AgentID: '22222222-2222-2222-2222-222222222222',
        Name: 'ALL_ENTITIES',
        Description: 'Complete list of MJ entities',
        SourceType: 'RunView',
        EntityName: 'MJ: Entities',
        ExtraFilter: null,
        OrderBy: 'Name ASC',
        FieldsToRetrieve: '["Name","Description"]',
        ResultType: 'simple',
        QueryName: null,
        CategoryPath: null,
        Parameters: null,
        MaxRows: 1000,
        ExecutionOrder: 0,
        Status: 'Active',
        CachePolicy: 'PerAgent',
        CacheTimeoutSeconds: 900,
        DestinationType: 'Data',
        DestinationPath: null,
        ...over,
    } as unknown as MJAIAgentDataSourceEntity;
}

function fakeRunQuerySource(over: Partial<MJAIAgentDataSourceEntity> = {}): MJAIAgentDataSourceEntity {
    return {
        ID: '33333333-3333-3333-3333-333333333333',
        AgentID: '22222222-2222-2222-2222-222222222222',
        Name: 'TOP_DONORS_QUERY',
        Description: null,
        SourceType: 'RunQuery',
        EntityName: null,
        ExtraFilter: null,
        OrderBy: null,
        FieldsToRetrieve: null,
        ResultType: null,
        QueryName: 'Top Donors By Year',
        CategoryPath: 'Reports/Fundraising',
        Parameters: '{"Year":2025}',
        MaxRows: 100,
        ExecutionOrder: 0,
        Status: 'Active',
        CachePolicy: 'None',
        CacheTimeoutSeconds: null,
        DestinationType: 'Data',
        DestinationPath: null,
        ...over,
    } as unknown as MJAIAgentDataSourceEntity;
}

class FakeAdapter implements LazyDataSourceAdapter {
    public claimedSources: string[] = [];
    constructor(private readonly tools: LazyDataSourceToolDescriptor[]) {}
    canHandle(s: MJAIAgentDataSourceEntity): boolean {
        this.claimedSources.push(s.Name);
        return true;
    }
    synthesizeTools(): LazyDataSourceToolDescriptor[] {
        return this.tools;
    }
}

function fakeDescriptor(over: Partial<LazyDataSourceToolDescriptor> = {}): LazyDataSourceToolDescriptor {
    return {
        name: 'query_test',
        description: 'test',
        parameters: { type: 'object', properties: {} },
        uri: 'lazyds://agent-1/source-1',
        sourceRef: {
            dataSourceId: 'source-1',
            sourceType: 'RunView',
            entityName: 'TestEntity',
            queryName: null,
        },
        ...over,
    };
}

describe('RunViewRunQueryLazyAdapter', () => {
    const adapter = new RunViewRunQueryLazyAdapter();

    describe('canHandle', () => {
        it('claims RunView sources', () => {
            expect(adapter.canHandle(fakeRunViewSource())).toBe(true);
        });
        it('claims RunQuery sources', () => {
            expect(adapter.canHandle(fakeRunQuerySource())).toBe(true);
        });
        it('rejects unknown source types', () => {
            const odd = fakeRunViewSource({ SourceType: 'Custom' as MJAIAgentDataSourceEntity['SourceType'] });
            expect(adapter.canHandle(odd)).toBe(false);
        });
    });

    describe('synthesizeTools', () => {
        it('produces exactly one tool descriptor per RunView source', () => {
            const tools = adapter.synthesizeTools(fakeRunViewSource());
            expect(tools).toHaveLength(1);
        });

        it('sanitises tool name to lowercase + underscores', () => {
            const tools = adapter.synthesizeTools(fakeRunViewSource({ Name: 'All Entities (Live!)' }));
            expect(tools[0].name).toMatch(/^query_[a-z0-9_]+$/);
            expect(tools[0].name).not.toContain(' ');
            expect(tools[0].name).not.toContain('!');
        });

        it('uses source description verbatim when present', () => {
            const tools = adapter.synthesizeTools(fakeRunViewSource({ Description: 'My custom description' }));
            expect(tools[0].description).toBe('My custom description');
        });

        it('falls back to entity-name-based description when source has no description', () => {
            const tools = adapter.synthesizeTools(
                fakeRunViewSource({ Description: null, EntityName: 'MJ: Queries' }),
            );
            expect(tools[0].description).toContain("'MJ: Queries'");
            expect(tools[0].description).toMatch(/lazily/i);
        });

        it('emits parameters schema with extraFilter + maxRows for RunView', () => {
            const tools = adapter.synthesizeTools(fakeRunViewSource());
            const params = tools[0].parameters;
            expect(params.type).toBe('object');
            expect(params.properties).toHaveProperty('extraFilter');
            expect(params.properties).toHaveProperty('maxRows');
            expect(params.properties).not.toHaveProperty('parameters');
        });

        it('emits parameters schema WITH "parameters" property for RunQuery', () => {
            const tools = adapter.synthesizeTools(fakeRunQuerySource());
            const props = tools[0].parameters.properties;
            expect(props).toHaveProperty('parameters');
            expect(props).toHaveProperty('extraFilter');
        });

        it('builds stable cacheable URI from agent + source ID', () => {
            const t1 = adapter.synthesizeTools(fakeRunViewSource())[0];
            const t2 = adapter.synthesizeTools(fakeRunViewSource())[0];
            expect(t1.uri).toBe(t2.uri);
            expect(t1.uri).toMatch(/^lazyds:\/\//);
            expect(t1.uri).toContain('22222222-2222-2222-2222-222222222222'); // agent id
            expect(t1.uri).toContain('11111111-1111-1111-1111-111111111111'); // source id
        });

        it('attaches a sourceRef the loader can dispatch on', () => {
            const t = adapter.synthesizeTools(fakeRunViewSource())[0];
            expect(t.sourceRef.dataSourceId).toBe('11111111-1111-1111-1111-111111111111');
            expect(t.sourceRef.sourceType).toBe('RunView');
            expect(t.sourceRef.entityName).toBe('MJ: Entities');
            expect(t.sourceRef.queryName).toBeNull();
        });

        it('caps tool name at 64 chars', () => {
            const longName = 'A'.repeat(200);
            const t = adapter.synthesizeTools(fakeRunViewSource({ Name: longName }))[0];
            expect(t.name.length).toBeLessThanOrEqual(64);
        });
    });
});

describe('AgentDataPreloader (lazy mode)', () => {
    beforeEach(() => {
        AgentDataPreloader.Instance.ClearAllLazyState();
    });

    describe('singleton identity', () => {
        it('returns the same instance every time', () => {
            const a = AgentDataPreloader.Instance;
            const b = AgentDataPreloader.Instance;
            expect(a).toBe(b);
        });
    });

    describe('per-run cache', () => {
        it('returns undefined for runs with no state', () => {
            expect(AgentDataPreloader.Instance.GetLazyRunState('nonexistent')).toBeUndefined();
        });

        it('ClearLazyRunCache is a no-op for runs with no state', () => {
            AgentDataPreloader.Instance.ClearLazyRunCache('nonexistent');
            expect(AgentDataPreloader.Instance.GetLazyRunState('nonexistent')).toBeUndefined();
        });

        it('ClearAllLazyState wipes all per-run state', () => {
            AgentDataPreloader.Instance.ClearAllLazyState();
            expect(AgentDataPreloader.Instance.GetLazyRunState('any')).toBeUndefined();
        });
    });

    describe('adapter registration', () => {
        it('exposes RegisterLazyAdapter as a callable API', () => {
            const adapter = new FakeAdapter([fakeDescriptor()]);
            expect(() => AgentDataPreloader.Instance.RegisterLazyAdapter(adapter)).not.toThrow();
        });
    });
});

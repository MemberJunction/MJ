import { describe, it, expect } from 'vitest';
import {
    ResolveClientTools,
    ClientToolMetadataFromDefinition,
    ResolveAppClientToolMetadata,
    IClientToolSource,
    ClientToolDefinitionLike,
} from '../client-tool-resolver';
import { ClientToolMetadata } from '../agent-types';

const tool = (name: string, extra: Partial<ClientToolMetadata> = {}): ClientToolMetadata => ({
    Name: name,
    Description: `desc:${name}`,
    InputSchema: { type: 'object' },
    ...extra,
});

describe('ResolveClientTools', () => {
    it('returns empty when no tiers supplied', () => {
        expect(ResolveClientTools({ agentId: 'a' })).toEqual([]);
    });

    it('merges all four tiers, deduping by Name', () => {
        const result = ResolveClientTools({
            agentId: 'a',
            overrideTools: [tool('Nav')],
            sessionTools: [tool('Save')],
            appTools: [tool('Export')],
            staticTools: [tool('Help')],
        });
        expect(result.map(t => t.Name).sort()).toEqual(['Export', 'Help', 'Nav', 'Save']);
    });

    it('honors precedence override > session > app > static (first-match-wins)', () => {
        const result = ResolveClientTools({
            agentId: 'a',
            overrideTools: [tool('X', { Description: 'override' })],
            sessionTools: [tool('X', { Description: 'session' })],
            appTools: [tool('X', { Description: 'app' })],
            staticTools: [tool('X', { Description: 'static' })],
        });
        expect(result).toHaveLength(1);
        expect(result[0].Description).toBe('override');
    });

    it('session beats app beats static when no override', () => {
        expect(
            ResolveClientTools({
                agentId: 'a',
                sessionTools: [tool('X', { Description: 'session' })],
                appTools: [tool('X', { Description: 'app' })],
                staticTools: [tool('X', { Description: 'static' })],
            })[0].Description,
        ).toBe('session');

        expect(
            ResolveClientTools({
                agentId: 'a',
                appTools: [tool('X', { Description: 'app' })],
                staticTools: [tool('X', { Description: 'static' })],
            })[0].Description,
        ).toBe('app');
    });

    it('uses the injected IClientToolSource for the static tier when staticTools omitted', () => {
        const source: IClientToolSource = {
            GetStaticTools: (id) => (id === 'a' ? [tool('FromSource')] : []),
        };
        const result = ResolveClientTools({ agentId: 'a', source });
        expect(result.map(t => t.Name)).toEqual(['FromSource']);
    });

    it('prefers explicit staticTools over the source', () => {
        const source: IClientToolSource = { GetStaticTools: () => [tool('FromSource')] };
        const result = ResolveClientTools({ agentId: 'a', source, staticTools: [tool('Explicit')] });
        expect(result.map(t => t.Name)).toEqual(['Explicit']);
    });

    it('ignores nameless/falsy tool entries defensively', () => {
        const result = ResolveClientTools({
            agentId: 'a',
            sessionTools: [tool('Good'), { Name: '', Description: '', InputSchema: {} }],
        });
        expect(result.map(t => t.Name)).toEqual(['Good']);
    });
});

const definition = (over: Partial<ClientToolDefinitionLike> = {}): ClientToolDefinitionLike => ({
    ID: 'AAAAAAAA-0000-0000-0000-000000000001',
    Name: 'Export',
    Description: 'Export the current view',
    InputSchemaJSON: JSON.stringify({ type: 'object', properties: { format: { type: 'string' } } }),
    OutputSchemaJSON: null,
    Category: null,
    DefaultTimeoutMs: null,
    ...over,
});

describe('ClientToolMetadataFromDefinition', () => {
    it('parses the schema columns and normalizes empty optionals to undefined', () => {
        const meta = ClientToolMetadataFromDefinition(definition({ Category: 'data', DefaultTimeoutMs: 5000, OutputSchemaJSON: '{"type":"string"}' }));
        expect(meta).toEqual({
            Name: 'Export',
            Description: 'Export the current view',
            InputSchema: { type: 'object', properties: { format: { type: 'string' } } },
            OutputSchema: { type: 'string' },
            Category: 'data',
            DefaultTimeoutMs: 5000,
        });
        expect(ClientToolMetadataFromDefinition(definition()).Category).toBeUndefined();
        expect(ClientToolMetadataFromDefinition(definition()).DefaultTimeoutMs).toBeUndefined();
    });

    it('is tolerant: blank, malformed and non-object schema columns yield an empty InputSchema, never a throw', () => {
        expect(ClientToolMetadataFromDefinition(definition({ InputSchemaJSON: null })).InputSchema).toEqual({});
        expect(ClientToolMetadataFromDefinition(definition({ InputSchemaJSON: '{not json' })).InputSchema).toEqual({});
        expect(ClientToolMetadataFromDefinition(definition({ InputSchemaJSON: '[1,2]' })).InputSchema).toEqual({});
        expect(ClientToolMetadataFromDefinition(definition({ OutputSchemaJSON: '"text"' })).OutputSchema).toBeUndefined();
    });
});

describe('ResolveAppClientToolMetadata', () => {
    const catalog = [
        definition({ ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Export' }),
        definition({ ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Share' }),
        definition({ ID: 'AAAAAAAA-0000-0000-0000-000000000003', Name: 'Print' }),
    ];

    it('resolves by ID (case-insensitively) and by Name', () => {
        const result = ResolveAppClientToolMetadata(
            [{ ClientToolDefinitionID: 'aaaaaaaa-0000-0000-0000-000000000002' }, { Name: ' print ' }],
            catalog,
        );
        expect(result.map(t => t.Name)).toEqual(['Share', 'Print']);
    });

    it('prefers the ID when both are supplied', () => {
        const result = ResolveAppClientToolMetadata(
            [{ ClientToolDefinitionID: 'AAAAAAAA-0000-0000-0000-000000000003', Name: 'Export' }],
            catalog,
        );
        expect(result.map(t => t.Name)).toEqual(['Print']);
    });

    it('skips (and reports) a stale reference without dropping the others', () => {
        const unresolved: unknown[] = [];
        const result = ResolveAppClientToolMetadata(
            [{ Name: 'Gone' }, { Name: 'Export' }, {}],
            catalog,
            (ref) => unresolved.push(ref),
        );
        expect(result.map(t => t.Name)).toEqual(['Export']);
        expect(unresolved).toEqual([{ Name: 'Gone' }, {}]);
    });

    it('orders by Priority ascending (lower = higher priority), absent last, ties by declaration order', () => {
        const result = ResolveAppClientToolMetadata(
            [{ Name: 'Export' }, { Name: 'Share', Priority: 5 }, { Name: 'Print', Priority: 1 }],
            catalog,
        );
        expect(result.map(t => t.Name)).toEqual(['Print', 'Share', 'Export']);
    });

    it('returns an empty list for absent references', () => {
        expect(ResolveAppClientToolMetadata(null, catalog)).toEqual([]);
        expect(ResolveAppClientToolMetadata(undefined, catalog)).toEqual([]);
    });

    it('feeds the app tier of ResolveClientTools, between session and static', () => {
        const app = ResolveAppClientToolMetadata([{ Name: 'Export' }], catalog);
        const resolved = ResolveClientTools({
            agentId: 'a',
            appTools: app,
            staticTools: [tool('Export', { Description: 'static' })],
        });
        expect(resolved[0].Description).toBe('Export the current view');
    });
});

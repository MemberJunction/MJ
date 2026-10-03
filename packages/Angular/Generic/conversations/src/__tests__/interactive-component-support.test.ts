import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ParseInteractiveComponentConfig } from '../lib/components/realtime/interactive-component/interactive-component-config';
import { DEFAULT_INTERACTIVE_COMPONENT_CONFIG } from '../lib/components/realtime/interactive-component/interactive-component-types';
import { SummarizeDataState, ToBoundedJson } from '../lib/components/realtime/interactive-component/component-data-state';
import { ParseComponentSpecContent } from '../lib/components/realtime/interactive-component/component-spec-content';
import { ComponentArtifactError } from '../lib/components/realtime/interactive-component/interactive-component-types';
import { MakeArtifact, MakeSpec } from './helpers/interactive-component-fixtures';
import { ComponentInstanceEngine, InstanceLimitError } from '../lib/components/realtime/interactive-component/component-instance-engine';

describe('ParseInteractiveComponentConfig', () => {
    it('uses the defaults when nothing is configured', () => {
        expect(ParseInteractiveComponentConfig(undefined)).toEqual({ Config: DEFAULT_INTERACTIVE_COMPONENT_CONFIG, Problems: [] });
        expect(ParseInteractiveComponentConfig({})).toEqual({ Config: DEFAULT_INTERACTIVE_COMPONENT_CONFIG, Problems: [] });
    });

    it('reads every member', () => {
        const { Config, Problems } = ParseInteractiveComponentConfig({
            autoOpenDelegatedComponents: true,
            swapToNewerVersions: false,
            maxInstances: 2,
            maxStateRows: 10,
            maxStateChars: 1000,
            maxExposure: 'state', // not this module's: ignored, not a problem
        });
        expect(Config).toEqual({ AutoOpenDelegatedComponents: true, SwapToNewerVersions: false, MaxInstances: 2, MaxStateRows: 10, MaxStateChars: 1000 });
        expect(Problems).toEqual([]);
    });

    it('falls back per member and says what was wrong', () => {
        const { Config, Problems } = ParseInteractiveComponentConfig({
            autoOpenDelegatedComponents: 'yes',
            maxInstances: 99,
            maxStateRows: 1.5,
            maxStateChars: 10,
            swapToNewerVersions: false,
        });
        expect(Config).toEqual({ ...DEFAULT_INTERACTIVE_COMPONENT_CONFIG, SwapToNewerVersions: false });
        expect(Problems).toHaveLength(4);
        expect(Problems[0]).toContain('autoOpenDelegatedComponents');
        expect(Problems[1]).toContain('maxInstances');
    });

    it('a non-object config is the defaults', () => {
        expect(ParseInteractiveComponentConfig([] as never).Config).toEqual(DEFAULT_INTERACTIVE_COMPONENT_CONFIG);
    });
});

describe('SummarizeDataState', () => {
    const limits = { MaxRows: 3, MaxChars: 6000 };

    it('is null when the component has no data state', () => {
        expect(SummarizeDataState(undefined, limits)).toBeNull();
        expect(SummarizeDataState(null, limits)).toBeNull();
    });

    it('keeps the counts and columns, only the first rows, and says how many were left out', () => {
        const rows = Array.from({ length: 10 }, (_, i) => ({ id: i, region: `R${i}` }));
        const summary = SummarizeDataState({ title: 'Revenue', tables: [{ name: 'sales', columns: [{ name: 'id' }, 'region'], rows }] }, limits);
        expect(summary).toEqual({
            title: 'Revenue',
            tables: [{ name: 'sales', rowCount: 10, columns: ['id', 'region'], rows: rows.slice(0, 3), rowsOmitted: 7 }],
        });
    });

    it('carries the component-level state (tab, search, drill path, custom)', () => {
        const summary = SummarizeDataState({ activeTab: 'Detail', searchText: 'emea', drillPath: ['All', 'EMEA'], custom: { sort: 'desc' } }, limits);
        expect(summary).toEqual({ activeTab: 'Detail', searchText: 'emea', drillPath: ['All', 'EMEA'], custom: { sort: 'desc' } });
    });

    it('halves the rows until the summary fits the character budget', () => {
        const rows = Array.from({ length: 40 }, (_, i) => ({ id: i, note: 'x'.repeat(100) }));
        const summary = SummarizeDataState({ tables: [{ name: 't', rows, columns: ['id', 'note'] }] }, { MaxRows: 40, MaxChars: 1500 });
        const json = JSON.stringify(summary);
        expect(json.length).toBeLessThanOrEqual(1500);
        expect(json).toContain('"rowCount":40');
    });

    it('reports truncation when even the counts do not fit', () => {
        const tables = Array.from({ length: 30 }, (_, i) => ({ name: `table-${i}-${'x'.repeat(40)}`, columns: Array.from({ length: 40 }, (_c, c) => `col${c}`), rows: [] }));
        expect(SummarizeDataState({ tables }, { MaxRows: 5, MaxChars: 500 })).toMatchObject({ truncated: true });
    });

    it('survives hostile values: cycles, functions, dates, bigints, class instances', () => {
        const cyclic: Record<string, unknown> = { name: 'loop' };
        cyclic['self'] = cyclic;
        const summary = SummarizeDataState(
            { custom: { cyclic, fn: () => 1, when: new Date('2026-01-02T03:04:05Z'), big: BigInt(5), nan: Number.NaN, long: 'y'.repeat(500) } },
            limits
        );
        const custom = (summary as { custom: Record<string, unknown> }).custom;
        expect(custom['cyclic']).toEqual({ name: 'loop', self: '[circular]' });
        expect(custom['fn']).toBe('[omitted]');
        expect(custom['when']).toBe('2026-01-02T03:04:05.000Z');
        expect(custom['big']).toBe('5');
        expect(custom['nan']).toBeNull();
        expect(String(custom['long'])).toContain('(500 chars)');
        expect(() => JSON.stringify(summary)).not.toThrow();
    });
});

describe('ToBoundedJson', () => {
    it('bounds depth and breadth', () => {
        const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
        expect(JSON.stringify(ToBoundedJson(deep))).toContain('[too deep]');
        expect((ToBoundedJson(Array.from({ length: 100 }, (_, i) => i)) as unknown[]).length).toBe(31);
    });
    it('maps undefined to null', () => {
        expect(ToBoundedJson(undefined)).toBeNull();
    });
});

describe('ParseComponentSpecContent', () => {
    it('parses a renderable spec', () => {
        expect(ParseComponentSpecContent(JSON.stringify(MakeSpec()), '"Rev"').name).toBe('RevenueDashboard');
    });
    it('accepts a registry component (namespace instead of code)', () => {
        const spec = ParseComponentSpecContent(JSON.stringify({ name: 'Grid', namespace: 'Common/Grids', location: 'registry' }), '"Grid"');
        expect(spec.name).toBe('Grid');
    });
    const failure = (content: string | null, label = '"X"'): ComponentArtifactError => {
        try {
            ParseComponentSpecContent(content, label);
        } catch (error) {
            return error as ComponentArtifactError;
        }
        throw new Error('expected a failure');
    };
    it('refuses missing content as unreadable', () => {
        expect(failure(null).Code).toBe('unreadable');
        expect(failure('   ').Code).toBe('unreadable');
    });
    it('refuses JSON that is not a component, and a spec with no code, as not_a_component', () => {
        expect(failure('{"hello":1}').Code).toBe('not_a_component');
        expect(failure('[1,2]').Code).toBe('not_a_component');
        expect(failure('not json at all').Code).toBe('not_a_component');
        const noCode = failure(JSON.stringify({ name: 'X', code: '  ' }));
        expect(noCode.Code).toBe('not_a_component');
        expect(noCode.message).toContain('no executable code');
    });
    it('names the artifact in the message', () => {
        expect(failure('{}', '"Q3 report"').message).toContain('"Q3 report"');
    });
});

describe('ComponentInstanceEngine', () => {
    const a = MakeArtifact('A1', 'V1', 1);
    const b = MakeArtifact('B1', 'V9', 1, MakeSpec({ name: 'Other', title: 'Pipeline' }));

    it('opens an instance, makes it active, and derives its contract', () => {
        const engine = new ComponentInstanceEngine(4);
        const changes: string[] = [];
        engine.Changed$.subscribe((c) => changes.push(`${c.Kind}:${c.InstanceID}`));
        const record = engine.Add(a, { year: 2026 });
        expect(record.InstanceID).toBe('c1');
        expect(engine.ActiveID).toBe('c1');
        expect(record.Inputs).toEqual({ year: 2026 });
        expect(changes).toEqual(['added:c1', 'active:c1']);
    });

    it('enforces the instance cap', () => {
        const engine = new ComponentInstanceEngine(1);
        engine.Add(a, {});
        expect(() => engine.Add(b, {})).toThrow(InstanceLimitError);
        expect(() => engine.Add(b, {})).toThrow(/At most 1 component is open/);
        engine.SetMaxInstances(2);
        expect(() => engine.Add(b, {})).not.toThrow();
    });

    it('ids are never reused after a close', () => {
        const engine = new ComponentInstanceEngine(4);
        engine.Add(a, {});
        engine.Remove('c1');
        expect(engine.Add(b, {}).InstanceID).toBe('c2');
    });

    it('closing the active instance activates the most recently opened remaining one; closing the last leaves none', () => {
        const engine = new ComponentInstanceEngine(4);
        engine.Add(a, {});
        engine.Add(b, {});
        engine.SetActive('c1');
        engine.Remove('c1');
        expect(engine.ActiveID).toBe('c2');
        engine.Remove('c2');
        expect(engine.ActiveID).toBeNull();
        expect(engine.Remove('c2')).toBe(false);
    });

    it('swapping a version KEEPS the instance id, inputs and position, re-derives the contract, and drops the handle and last event', () => {
        const engine = new ComponentInstanceEngine(4);
        engine.Add(a, { year: 1 });
        engine.Add(b, {});
        const before = engine.Get('c1');
        const handle = { IsReady: true } as never;
        engine.AttachHandle('c1', handle);
        engine.RecordEvent('c1', 'rowSelected', { id: 1 });
        const newer = MakeArtifact('A1', 'V2', 2, MakeSpec({ methods: { standardMethodsSupported: { refresh: true }, customMethods: [] } }));
        expect(engine.SwapVersion('c1', newer)).toBe(true);
        const after = engine.Get('c1');
        expect(after).toBe(before);
        expect(after?.InstanceID).toBe('c1');
        expect(after?.Artifact.VersionID).toBe('V2');
        expect(after?.Inputs).toEqual({ year: 1 });
        expect(after?.Contract.Verbs.map((v) => v.Verb.Name)).toEqual(['refresh']);
        expect(after?.Handle).toBeNull();
        expect(after?.LastEvent).toBeNull();
        expect(engine.Instances.map((r) => r.InstanceID)).toEqual(['c1', 'c2']);
        expect(engine.SwapVersion('nope', newer)).toBe(false);
    });

    it('finds an instance by artifact, case-insensitively', () => {
        const engine = new ComponentInstanceEngine(4);
        engine.Add(MakeArtifact('Abc-1', 'V1', 1), {});
        expect(engine.FindByArtifact('abc-1')?.InstanceID).toBe('c1');
        expect(engine.FindByArtifact('zzz')).toBeUndefined();
    });

    it('event sequence numbers are strictly increasing so identical consecutive events still differ', () => {
        const engine = new ComponentInstanceEngine(4);
        engine.Add(a, {});
        engine.RecordEvent('c1', 'x', 1);
        const first = engine.Get('c1')?.LastEvent?.Seq ?? 0;
        engine.RecordEvent('c1', 'x', 1);
        expect(engine.Get('c1')?.LastEvent?.Seq).toBeGreaterThan(first);
        expect(engine.RecordEvent('nope', 'x', 1)).toBe(false);
    });

    it('Dispose completes the change stream', () => {
        const engine = new ComponentInstanceEngine(4);
        let completed = false;
        engine.Changed$.subscribe({ complete: () => (completed = true) });
        engine.Dispose();
        expect(completed).toBe(true);
    });
});

describe('framework-free files stay framework-free', () => {
    const directory = join(__dirname, '..', 'lib', 'components', 'realtime', 'interactive-component');
    const pure = [
        'interactive-component-types.ts',
        'interactive-component-config.ts',
        'component-contract.ts',
        'component-data-state.ts',
        'component-instance-engine.ts',
        'component-spec-content.ts',
    ];

    it('the pure files exist where this test expects them', () => {
        const present = readdirSync(directory);
        for (const file of pure) {
            expect(present).toContain(file);
        }
    });

    it.each(pure)('%s imports nothing from Angular, the DOM runtime or a rendering package', (file) => {
        const source = readFileSync(join(directory, file), 'utf8');
        const imports = [...source.matchAll(/^import[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
        const forbidden = imports.filter((m) => m.startsWith('@angular') || m.startsWith('@memberjunction/ng-') || m.includes('react'));
        expect(forbidden).toEqual([]);
    });
});

import { describe, it, expect } from 'vitest';
import { PayloadManager } from '../PayloadManager';
import { BuildNestedValue, FormatPayloadPath, ParsePathKey, ResolvePayloadPath } from '../payload-path-keys';

interface Component {
    name: string;
    code: string;
}

interface Spec {
    code: string;
    meta: { title: string; owner?: string; subtitle?: string };
    dependencies: Component[];
}

function makeSpec(): Spec {
    return {
        code: 'root',
        meta: { title: 'T1', owner: 'ana' },
        dependencies: [
            { name: 'A', code: 'a' },
            { name: 'B', code: 'b' },
            { name: 'C', code: 'c' }
        ]
    };
}

const quiet = { analyzeChanges: false, generateDiff: false };

describe('payload path keys: parsing and resolving', () => {
    it('parses dot, bracket and dot-bracket forms into the same segments', () => {
        expect(ParsePathKey('dependencies[2].code')).toEqual(['dependencies', 2, 'code']);
        expect(ParsePathKey('dependencies.[2].code')).toEqual(['dependencies', 2, 'code']);
        expect(ParsePathKey('meta.title')).toEqual(['meta', 'title']);
    });

    it('rejects malformed keys', () => {
        expect(ParsePathKey('a[b]')).toBeNull();
        expect(ParsePathKey('a[1')).toBeNull();
    });

    it('turns a bare number into an index only where it lands on an array', () => {
        const resolved = ResolvePayloadPath(makeSpec(), ['dependencies', '2', 'code']);
        expect(resolved).toEqual({ Segments: ['dependencies', 2, 'code'], Exists: true });
    });

    it('explains why a path cannot be written', () => {
        const spec = makeSpec();
        expect(ResolvePayloadPath(spec, ['dependencies', 7, 'code']).Error).toContain('out of range');
        expect(ResolvePayloadPath(spec, ['code', 'x']).Error).toContain('is a string');
        expect(ResolvePayloadPath(spec, ['meta', 0]).Error).toContain('not an array');
        expect(ResolvePayloadPath(spec, ['missing', 0]).Error).toContain('does not exist');
    });

    it('accepts the index one past the end only as the last step (an append)', () => {
        const spec = makeSpec();
        expect(ResolvePayloadPath(spec, ['dependencies', 3])).toEqual({ Segments: ['dependencies', 3], Exists: false });
        expect(ResolvePayloadPath(spec, ['dependencies', 3, 'code']).Error).toContain('out of range');
    });

    it('builds sparse nested values and formats paths', () => {
        const nested = BuildNestedValue(['dependencies', 2, 'code'], 'X') as { dependencies: Array<{ code: string } | undefined> };
        expect(nested.dependencies).toHaveLength(3);
        expect(nested.dependencies[2]).toEqual({ code: 'X' });
        expect(0 in nested.dependencies).toBe(false);
        expect(FormatPayloadPath(['dependencies', 2, 'code'])).toBe('dependencies[2].code');
    });
});

describe('ApplyAgentChangeRequest with path keys', () => {
    const pm = new PayloadManager();

    it('updates one array element field without touching the others or adding a literal key', () => {
        const { result, blockedOperations } = pm.ApplyAgentChangeRequest(makeSpec(), { updateElements: { 'dependencies[2].code': 'X' } }, quiet);
        expect(result.dependencies.map(d => d.code)).toEqual(['a', 'b', 'X']);
        expect(result.dependencies[2].name).toBe('C');
        expect(Object.keys(result)).toEqual(['code', 'meta', 'dependencies']);
        expect(blockedOperations).toEqual([]);
    });

    it('treats dependencies.[2].code and dependencies.2.code the same as dependencies[2].code', () => {
        for (const key of ['dependencies.[2].code', 'dependencies.2.code']) {
            const { result } = pm.ApplyAgentChangeRequest(makeSpec(), { updateElements: { [key]: 'X' } }, quiet);
            expect(result.dependencies[2].code).toBe('X');
            expect(key in result).toBe(false);
        }
    });

    it('updates a nested object field and keeps its siblings', () => {
        const { result } = pm.ApplyAgentChangeRequest(makeSpec(), { updateElements: { 'meta.title': 'T2' } }, quiet);
        expect(result.meta).toEqual({ title: 'T2', owner: 'ana' });
    });

    it('refuses an out-of-range index instead of appending or writing a literal key', () => {
        const { result, blockedOperations, warnings } = pm.ApplyAgentChangeRequest(makeSpec(), { updateElements: { 'dependencies[7].code': 'X' } }, quiet);
        expect(result).toEqual(makeSpec());
        expect(blockedOperations).toHaveLength(1);
        expect(blockedOperations?.[0]).toMatchObject({ path: 'dependencies[7].code', operation: 'update' });
        expect(warnings.some(w => w.includes('out of range'))).toBe(true);
    });

    it('refuses a path key with a prototype segment and leaves Object.prototype untouched', () => {
        for (const key of ['meta.__proto__.polluted', 'dependencies[0].constructor.prototype.polluted']) {
            const { result, blockedOperations } = pm.ApplyAgentChangeRequest(makeSpec(), { updateElements: { [key]: 'yes' } }, quiet);
            expect(blockedOperations?.[0]).toMatchObject({ path: key, operation: 'update' });
            expect(blockedOperations?.[0].reason).toContain('is not a data key');
            expect(result).toEqual(makeSpec());
        }
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('refuses a path that steps through a string', () => {
        const { result, blockedOperations } = pm.ApplyAgentChangeRequest(makeSpec(), { updateElements: { 'code.inner': 'X' } }, quiet);
        expect(result.code).toBe('root');
        expect(blockedOperations?.[0].reason).toContain('is a string');
    });

    it('keeps a key literal when the payload already has a property with that exact name', () => {
        const payload = { 'a.b': 1, a: { b: 2 } };
        const { result } = pm.ApplyAgentChangeRequest(payload, { updateElements: { 'a.b': 9 } }, quiet);
        expect(result).toEqual({ 'a.b': 9, a: { b: 2 } });
    });

    it('replaces exactly the addressed value, not its top-level property', () => {
        const { result } = pm.ApplyAgentChangeRequest(makeSpec(), { replaceElements: { 'dependencies[1]': { name: 'B2', code: 'b2' } } }, quiet);
        expect(result.dependencies.map(d => d.name)).toEqual(['A', 'B2', 'C']);
        const object = pm.ApplyAgentChangeRequest(makeSpec(), { replaceElements: { 'meta': { title: 'only' } } }, quiet);
        expect(object.result.meta).toEqual({ title: 'only' });
    });

    it('replaces into a missing parent by creating it', () => {
        const { result } = pm.ApplyAgentChangeRequest<Record<string, unknown>>({ a: 1 }, { replaceElements: { 'x.y': 2 } }, quiet);
        expect(result).toEqual({ a: 1, x: { y: 2 } });
    });

    it('removes an array element or a nested field by path', () => {
        const element = pm.ApplyAgentChangeRequest(makeSpec(), { removeElements: { 'dependencies[0]': '__DELETE__' } }, quiet);
        expect(element.result.dependencies.map(d => d.name)).toEqual(['B', 'C']);
        const field = pm.ApplyAgentChangeRequest(makeSpec(), { removeElements: { 'meta.owner': '__DELETE__' } }, quiet);
        expect(field.result.meta).toEqual({ title: 'T1' });
    });

    it('adds a new nested field from newElements, and treats an existing path as an update', () => {
        const added = pm.ApplyAgentChangeRequest(makeSpec(), { newElements: { 'meta.subtitle': 'S' } }, quiet);
        expect(added.result.meta.subtitle).toBe('S');
        const existing = pm.ApplyAgentChangeRequest(makeSpec(), { newElements: { 'dependencies[0].code': 'X' } }, quiet);
        expect(existing.result.dependencies.map(d => d.code)).toEqual(['X', 'b', 'c']);
        expect(existing.warnings.some(w => w.includes('treated as update'))).toBe(true);
    });

    it('merges path keys with nested entries in the same bucket and leaves the caller request unchanged', () => {
        const request = { updateElements: { meta: { owner: 'bo' }, 'meta.title': 'T2', 'dependencies[1].code': 'Y' } };
        const before = JSON.stringify(request);
        const { result } = pm.ApplyAgentChangeRequest<Spec>(makeSpec(), request as unknown as { updateElements: Partial<Spec> }, quiet);
        expect(result.meta).toEqual({ title: 'T2', owner: 'bo' });
        expect(result.dependencies[1].code).toBe('Y');
        expect(JSON.stringify(request)).toBe(before);
    });
});

describe('ApplyAgentChangeRequest permissions inside arrays', () => {
    const pm = new PayloadManager();
    const writeCode = { updateElements: { 'dependencies[2].code': 'X' } };
    const writeCodeNested = { updateElements: { dependencies: [undefined, undefined, { code: 'X' }] } } as unknown as { updateElements: Partial<Spec> };

    it.each([['dependencies.*.code'], ['dependencies[*].code'], ['dependencies.**']])(
        'lets %s write one element field, by path key or nested form',
        (pattern) => {
            for (const request of [writeCode, writeCodeNested]) {
                const { result, blockedOperations } = pm.ApplyAgentChangeRequest(makeSpec(), request, { ...quiet, allowedPaths: [pattern] });
                expect(result.dependencies.map(d => d.code)).toEqual(['a', 'b', 'X']);
                expect(blockedOperations).toEqual([]);
            }
        }
    );

    it('reports the full element path when a field is blocked', () => {
        const { result, blockedOperations } = pm.ApplyAgentChangeRequest(
            makeSpec(), { updateElements: { 'dependencies[0].name': 'Z' } }, { ...quiet, allowedPaths: ['dependencies.*.code'] }
        );
        expect(result.dependencies[0].name).toBe('A');
        expect(blockedOperations?.map(b => b.path)).toEqual(['dependencies.0.name']);
    });

    it('still lets update permission on the array itself delete or replace elements', () => {
        const deleted = pm.ApplyAgentChangeRequest(makeSpec(), { removeElements: { 'dependencies[1]': '__DELETE__' } }, { ...quiet, allowedPaths: ['dependencies'] });
        expect(deleted.result.dependencies.map(d => d.name)).toEqual(['A', 'C']);
    });

    it('keeps an element whose delete is refused, unchanged', () => {
        const { result, blockedOperations } = pm.ApplyAgentChangeRequest(
            makeSpec(), { removeElements: { 'dependencies[1]': '__DELETE__' } }, { ...quiet, allowedPaths: ['dependencies.*.code'] }
        );
        expect(result.dependencies).toEqual(makeSpec().dependencies);
        expect(blockedOperations?.[0]).toMatchObject({ path: 'dependencies.1', operation: 'delete' });
    });

    it('lets a leaf permission write inside an object without update permission on the object', () => {
        const { result, blockedOperations } = pm.ApplyAgentChangeRequest(
            makeSpec(), { updateElements: { meta: { title: 'T2' } } }, { ...quiet, allowedPaths: ['meta.title'] }
        );
        expect(result.meta.title).toBe('T2');
        expect(blockedOperations).toEqual([]);
    });

    it('does not let an updateElements __DELETE__ remove a key that is not allowed', () => {
        const { result, blockedOperations } = pm.ApplyAgentChangeRequest(
            makeSpec(), { updateElements: { meta: { owner: '__DELETE__' } } } as unknown as { updateElements: Partial<Spec> }, { ...quiet, allowedPaths: ['meta.title'] }
        );
        expect(result.meta.owner).toBe('ana');
        expect(blockedOperations?.some(b => b.path === 'meta.owner')).toBe(true);
    });

    it('checks a replaceElements path key against allowedPaths', () => {
        const { result, blockedOperations } = pm.ApplyAgentChangeRequest(
            makeSpec(), { replaceElements: { 'dependencies[0].name': 'Z' } }, { ...quiet, allowedPaths: ['dependencies.*.code'] }
        );
        expect(result.dependencies[0].name).toBe('A');
        expect(blockedOperations?.[0]).toMatchObject({ path: 'dependencies.0.name', operation: 'update' });
    });
});

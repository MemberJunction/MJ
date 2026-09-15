import { describe, it, expect } from 'vitest';
import {
    parseExternalizePath,
    findSubPropertyExternalizations,
    getAtPath,
    externalizeSubProperties,
} from '../lib/json-subproperty-externalization.js';

describe('parseExternalizePath', () => {
    it('splits a dotted config field into its root field and property path', () => {
        expect(parseExternalizePath('Configuration.ReplayScript')).toEqual({
            field: 'Configuration',
            path: ['ReplayScript'],
        });
    });

    it('yields an empty path for a whole-field config, so existing behavior is unchanged', () => {
        expect(parseExternalizePath('TemplateText')).toEqual({ field: 'TemplateText', path: [] });
    });

    it('supports nesting deeper than one level', () => {
        expect(parseExternalizePath('Configuration.replay.script')).toEqual({
            field: 'Configuration',
            path: ['replay', 'script'],
        });
    });
});

describe('findSubPropertyExternalizations', () => {
    const config = [
        { field: 'TemplateText', pattern: '@file:templates/{Name}.md' },
        { field: 'Configuration.ReplayScript', pattern: '@file:scripts/{Name}.json' },
        { field: 'Configuration.PendingReplayScript', pattern: '@file:scripts/{Name}.pending.json' },
        { field: 'Other.Thing', pattern: '@file:other/{Name}.json' },
    ];

    it('returns only the sub-property configs rooted at the given field', () => {
        const found = findSubPropertyExternalizations('Configuration', config);
        expect(found).toEqual([
            { path: ['ReplayScript'], pattern: '@file:scripts/{Name}.json' },
            { path: ['PendingReplayScript'], pattern: '@file:scripts/{Name}.pending.json' },
        ]);
    });

    it('ignores whole-field configs — those stay on the existing code path', () => {
        expect(findSubPropertyExternalizations('TemplateText', config)).toEqual([]);
    });

    it('returns nothing when the field has no sub-property config', () => {
        expect(findSubPropertyExternalizations('Name', config)).toEqual([]);
    });

    // The legacy string-array form (["TemplateText"]) can only name whole fields.
    it('tolerates the simple string-array config form', () => {
        expect(findSubPropertyExternalizations('Configuration', ['TemplateText'])).toEqual([]);
    });
});

describe('getAtPath', () => {
    const value = { maxSteps: 35, computerUse: { elementGrounding: true }, ReplayScript: { steps: [1] } };

    it('reads a leaf', () => {
        expect(getAtPath(value, ['ReplayScript'])).toEqual({ steps: [1] });
    });

    it('reads a nested leaf', () => {
        expect(getAtPath(value, ['computerUse', 'elementGrounding'])).toBe(true);
    });

    it('returns undefined for an absent leaf rather than throwing', () => {
        expect(getAtPath(value, ['NoSuchKey'])).toBeUndefined();
        expect(getAtPath(value, ['computerUse', 'nope', 'deeper'])).toBeUndefined();
    });
});

describe('externalizeSubProperties', () => {
    const configs = [{ path: ['ReplayScript'], pattern: '@file:scripts/{Name}.json' }];

    /** Stands in for FieldExternalizer — records what it was handed, returns the reference. */
    function fakeExternalizer(ref = '@file:scripts/T001.json') {
        const calls: Array<{ value: unknown; pattern: string; existingRef?: string }> = [];
        return {
            calls,
            fn: async (value: unknown, pattern: string, existingRef?: string) => {
                calls.push({ value, pattern, existingRef });
                return ref;
            },
        };
    }

    it('replaces the sub-property with the reference the externalizer returned', async () => {
        const ext = fakeExternalizer();
        const result = await externalizeSubProperties(
            { maxSteps: 35, ReplayScript: { steps: [1, 2] } },
            configs,
            ext.fn
        );
        expect(result).toEqual({ maxSteps: 35, ReplayScript: '@file:scripts/T001.json' });
    });

    it('hands the externalizer the sub-property value, not the whole field', async () => {
        const ext = fakeExternalizer();
        await externalizeSubProperties({ maxSteps: 35, ReplayScript: { steps: [1, 2] } }, configs, ext.fn);
        expect(ext.calls).toHaveLength(1);
        expect(ext.calls[0].value).toEqual({ steps: [1, 2] });
    });

    it('leaves every sibling property untouched', async () => {
        const ext = fakeExternalizer();
        const result = (await externalizeSubProperties(
            { maxSteps: 35, computerUse: { elementGrounding: true }, ReplayScript: { steps: [] } },
            configs,
            ext.fn
        )) as Record<string, unknown>;
        expect(result.maxSteps).toBe(35);
        expect(result.computerUse).toEqual({ elementGrounding: true });
    });

    // The agreed behavior for the ~130 tests that have never recorded a script:
    // no file, no key, and the file stays byte-identical.
    it('leaves the value alone when the sub-property is absent', async () => {
        const ext = fakeExternalizer();
        const input = { maxSteps: 35 };
        const result = await externalizeSubProperties(input, configs, ext.fn);
        expect(result).toEqual({ maxSteps: 35 });
        expect('ReplayScript' in (result as object)).toBe(false);
        expect(ext.calls).toHaveLength(0);
    });

    it('does not externalize a null sub-property', async () => {
        const ext = fakeExternalizer();
        const result = await externalizeSubProperties({ ReplayScript: null }, configs, ext.fn);
        expect(ext.calls).toHaveLength(0);
        expect(result).toEqual({ ReplayScript: null });
    });

    it('parses a JSON-string field value and returns an object', async () => {
        const ext = fakeExternalizer();
        const result = await externalizeSubProperties(
            JSON.stringify({ maxSteps: 35, ReplayScript: { steps: [1] } }),
            configs,
            ext.fn
        );
        expect(result).toEqual({ maxSteps: 35, ReplayScript: '@file:scripts/T001.json' });
    });

    // Path preservation is what keeps a hand-organized scripts/ tree stable across
    // pulls; the externalizer only honors it if we pass the existing reference through.
    it('passes the existing reference through so the externalizer can preserve its path', async () => {
        const ext = fakeExternalizer();
        await externalizeSubProperties(
            { ReplayScript: { steps: [1] } },
            configs,
            ext.fn,
            { ReplayScript: '@file:scripts/hand-placed/T001.json' }
        );
        expect(ext.calls[0].existingRef).toBe('@file:scripts/hand-placed/T001.json');
    });

    it('returns the value untouched when no sub-property configs apply', async () => {
        const ext = fakeExternalizer();
        const input = { maxSteps: 35, ReplayScript: { steps: [1] } };
        expect(await externalizeSubProperties(input, [], ext.fn)).toBe(input);
        expect(ext.calls).toHaveLength(0);
    });

    it('leaves an unparseable string value alone rather than throwing', async () => {
        const ext = fakeExternalizer();
        expect(await externalizeSubProperties('not json at all', configs, ext.fn)).toBe('not json at all');
        expect(ext.calls).toHaveLength(0);
    });
});

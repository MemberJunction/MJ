import { describe, it, expect } from 'vitest';
import {
    mergeSettings,
    readManagedMeta,
    getAtPath,
    setAtPath,
    isPlainObject,
    SettingsMergeError,
} from '../../lib/claude-pack/SettingsMerger.js';

/** Build a pack baseline with a configurable __mj_managed.keys list. */
function pack(extras: Record<string, unknown>, keys: string[], version = '5.1.0'): Record<string, unknown> {
    return {
        $schema: 'https://json.schemastore.org/claude-code-settings.json',
        __mj_managed: { version, mjMajor: '5', keys },
        ...extras,
    };
}

describe('mergeSettings', () => {
    it('produces the pack baseline when user file is empty {}', () => {
        const p = pack(
            { permissions: { allow: ['Bash(npm install)'] }, env: { MJ_CLAUDE_PACK: '5.1.0' } },
            ['permissions.allow', 'env.MJ_CLAUDE_PACK']
        );
        const { Result, Changed } = mergeSettings({ Existing: {}, Pack: p });
        expect(Result.permissions).toEqual({ allow: ['Bash(npm install)'] });
        expect(Result.env).toEqual({ MJ_CLAUDE_PACK: '5.1.0' });
        expect((Result.__mj_managed as { version: string }).version).toBe('5.1.0');
        expect(Changed).toBe(true);
    });

    it('unions arrays with user entries first, then pack entries, deduped', () => {
        const p = pack(
            {
                permissions: {
                    allow: ['Bash(npm install)', 'Bash(git status)'],
                },
            },
            ['permissions.allow']
        );
        const existing = {
            permissions: {
                allow: ['Bash(my-custom)', 'Bash(git status)'],
            },
        };
        const { Result } = mergeSettings({ Existing: existing, Pack: p });
        expect(Result.permissions).toEqual({
            allow: ['Bash(my-custom)', 'Bash(git status)', 'Bash(npm install)'],
        });
    });

    it('recursively merges objects, taking pack values for clashes and preserving user-only keys', () => {
        const p = pack(
            { env: { MJ_CLAUDE_PACK: '5.1.0' } },
            ['env.MJ_CLAUDE_PACK']
        );
        const existing = {
            env: {
                MJ_CLAUDE_PACK: 'old-value',
                USER_VAR: 'kept',
            },
        };
        const { Result } = mergeSettings({ Existing: existing, Pack: p });
        // env.MJ_CLAUDE_PACK is a leaf primitive — pack wins.
        // USER_VAR is outside the managed path 'env.MJ_CLAUDE_PACK' so survives.
        expect(Result.env).toEqual({ MJ_CLAUDE_PACK: '5.1.0', USER_VAR: 'kept' });
    });

    it('preserves user keys outside all managed paths', () => {
        const p = pack(
            { permissions: { allow: ['Bash(npm install)'] } },
            ['permissions.allow']
        );
        const existing = {
            customField: 'user-owned',
            permissions: {
                allow: ['Bash(my-custom)'],
                deny: ['Bash(rm -rf /)'],
            },
        };
        const { Result } = mergeSettings({ Existing: existing, Pack: p });
        expect(Result.customField).toBe('user-owned');
        // permissions.deny is user-owned because it's not in __mj_managed.keys
        expect((Result.permissions as { deny: string[] }).deny).toEqual(['Bash(rm -rf /)']);
    });

    it('replaces __mj_managed wholesale so version bumps refresh the stamp', () => {
        const old = pack({}, ['permissions.allow'], '5.0.0');
        const fresh = pack({}, ['permissions.allow'], '5.2.0');
        const { Result } = mergeSettings({ Existing: old, Pack: fresh });
        expect((Result.__mj_managed as { version: string }).version).toBe('5.2.0');
    });

    it('type mismatch (user string vs pack array) falls back to pack value', () => {
        const p = pack(
            { permissions: { allow: ['Bash(npm install)'] } },
            ['permissions.allow']
        );
        const existing = { permissions: { allow: 'not-an-array' } };
        const { Result } = mergeSettings({ Existing: existing, Pack: p });
        expect(Result.permissions).toEqual({ allow: ['Bash(npm install)'] });
    });

    it('creates missing intermediate objects when setting a deep managed path', () => {
        const p = pack(
            { env: { MJ_CLAUDE_PACK: '5.1.0' } },
            ['env.MJ_CLAUDE_PACK']
        );
        // user has no env at all
        const { Result } = mergeSettings({ Existing: {}, Pack: p });
        expect(Result.env).toEqual({ MJ_CLAUDE_PACK: '5.1.0' });
    });

    it('Changed=false when the merge is a no-op', () => {
        const p = pack(
            { permissions: { allow: ['Bash(npm install)'] }, env: { MJ_CLAUDE_PACK: '5.1.0' } },
            ['permissions.allow', 'env.MJ_CLAUDE_PACK']
        );
        // Existing is byte-equivalent to pack already
        const existing = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
        const { Changed } = mergeSettings({ Existing: existing, Pack: p });
        expect(Changed).toBe(false);
    });

    it('throws when pack has no __mj_managed block', () => {
        const p = { permissions: { allow: [] } };
        expect(() => mergeSettings({ Existing: {}, Pack: p })).toThrow(SettingsMergeError);
    });

    it('throws when pack __mj_managed.keys is missing or wrong type', () => {
        const p = { __mj_managed: { version: '5.1.0' } };
        expect(() => mergeSettings({ Existing: {}, Pack: p })).toThrow(SettingsMergeError);
    });

    it('object merge: array elements containing objects are deduped by structural equality', () => {
        const p = pack(
            {
                hooks: {
                    OnStart: [{ matcher: '*', command: 'echo hi' }],
                },
            },
            ['hooks.OnStart']
        );
        const existing = {
            hooks: {
                OnStart: [{ matcher: '*', command: 'echo hi' }, { matcher: 'user-only', command: 'x' }],
            },
        };
        const { Result } = mergeSettings({ Existing: existing, Pack: p });
        const out = (Result.hooks as { OnStart: unknown[] }).OnStart;
        // Existing has 2 entries, pack has 1 (duplicate of the first existing entry) — deduped to 2 total
        expect(out).toHaveLength(2);
    });

    it('object merge: keys with order differences are deduped via stable encoding', () => {
        const p = pack(
            { hooks: { OnStart: [{ a: 1, b: 2 }] } },
            ['hooks.OnStart']
        );
        const existing = {
            hooks: { OnStart: [{ b: 2, a: 1 }] }, // same shape, different key order
        };
        const { Result } = mergeSettings({ Existing: existing, Pack: p });
        expect((Result.hooks as { OnStart: unknown[] }).OnStart).toHaveLength(1);
    });
});

describe('readManagedMeta', () => {
    it('parses a valid block', () => {
        const meta = readManagedMeta({
            __mj_managed: { version: '5.1.0', mjMajor: '5', keys: ['permissions.allow'] },
        });
        expect(meta).toEqual({ version: '5.1.0', mjMajor: '5', keys: ['permissions.allow'] });
    });

    it('returns null when the block is absent', () => {
        expect(readManagedMeta({})).toBeNull();
    });

    it('returns null when keys is not an array of strings', () => {
        expect(readManagedMeta({ __mj_managed: { version: '5', keys: [1, 2] } })).toBeNull();
    });

    it('returns null when version is missing', () => {
        expect(readManagedMeta({ __mj_managed: { keys: [] } })).toBeNull();
    });
});

describe('getAtPath / setAtPath', () => {
    it('returns the value at a dotted path', () => {
        const obj = { a: { b: { c: 42 } } };
        expect(getAtPath(obj, 'a.b.c')).toBe(42);
    });

    it('returns undefined for a missing path', () => {
        expect(getAtPath({ a: 1 }, 'b.c')).toBeUndefined();
    });

    it('sets a value at a deep path, creating intermediate objects', () => {
        const obj: Record<string, unknown> = {};
        setAtPath(obj, 'a.b.c', 'x');
        expect(obj).toEqual({ a: { b: { c: 'x' } } });
    });

    it('overwrites non-object intermediate values', () => {
        const obj: Record<string, unknown> = { a: 'string-here' };
        setAtPath(obj, 'a.b', 'x');
        expect(obj).toEqual({ a: { b: 'x' } });
    });
});

describe('isPlainObject', () => {
    it.each([
        [null, false],
        [undefined, false],
        ['string', false],
        [42, false],
        [[], false],
        [[1, 2], false],
        [{}, true],
        [{ a: 1 }, true],
    ])('isPlainObject(%s) === %s', (input, expected) => {
        expect(isPlainObject(input)).toBe(expected);
    });
});

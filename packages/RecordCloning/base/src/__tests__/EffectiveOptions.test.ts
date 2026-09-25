import { describe, it, expect } from 'vitest';
import { ResolveEffectiveCloneOptions, NormalizeClonePresets } from '../EffectiveOptions';

describe('ResolveEffectiveCloneOptions', () => {
    const none = { CanFireHooks: false, CanOverrideScope: false };
    const override = { CanFireHooks: false, CanOverrideScope: true };

    it('uses the entity configuration as the defaults', () => {
        const { Options, Warnings } = ResolveEffectiveCloneOptions(
            { MaxDepth: 2, MaxRecords: 50, SoftLinks: 'include', Subtypes: 'exclude', Hooks: { EntityActions: 'suppress' } },
            {},
            none
        );
        expect(Options).toMatchObject({ MaxDepth: 2, MaxRecords: 50, SoftLinks: 'include', Subtypes: 'exclude', Hierarchy: 'subtree', EntityActions: 'suppress' });
        expect(Warnings).toEqual([]);
    });

    it('falls back to built-in defaults for an entity with no configuration', () => {
        const { Options } = ResolveEffectiveCloneOptions(null, undefined, none);
        expect(Options).toEqual({
            MaxDepth: 3, MaxRecords: 500, Subtypes: 'include', Hierarchy: 'subtree',
            SoftLinks: 'skip', Embeddings: 'copy', EntityActions: 'fire', AIActions: 'suppress',
        });
    });

    it('lets anyone narrow scope when UserEditable allows it', () => {
        const { Options, Warnings } = ResolveEffectiveCloneOptions(
            { MaxDepth: 3, MaxRecords: 500, Subtypes: 'include', Hierarchy: 'subtree', UserEditable: 'scope' },
            { MaxDepth: 1, MaxRecords: 10, Subtypes: 'exclude', Hierarchy: 'node' },
            none
        );
        expect(Options).toMatchObject({ MaxDepth: 1, MaxRecords: 10, Subtypes: 'exclude', Hierarchy: 'node' });
        expect(Warnings).toEqual([]);
    });

    it('ignores widening without Override Scope, even with UserEditable all', () => {
        const { Options, Warnings, Overrides } = ResolveEffectiveCloneOptions(
            { MaxDepth: 2, MaxRecords: 500, SoftLinks: 'skip' },
            { MaxDepth: 6, MaxRecords: 5000, SoftLinks: 'include' },
            none
        );
        expect(Options).toMatchObject({ MaxDepth: 2, MaxRecords: 500, SoftLinks: 'skip' });
        expect(Warnings.map((w) => [w.Code, w.Field])).toEqual([
            ['SCOPE_OVERRIDE_FORBIDDEN', 'MaxDepth'],
            ['SCOPE_OVERRIDE_FORBIDDEN', 'MaxRecords'],
            ['SCOPE_OVERRIDE_FORBIDDEN', 'SoftLinks'],
        ]);
        expect(Overrides).toEqual([]);
    });

    it('applies widening for an Override Scope holder and records it', () => {
        const { Options, Warnings, Overrides } = ResolveEffectiveCloneOptions(
            { MaxDepth: 2, SoftLinks: 'skip', UserEditable: 'none' },
            { MaxDepth: 6, SoftLinks: 'include' },
            override
        );
        expect(Options).toMatchObject({ MaxDepth: 6, SoftLinks: 'include' });
        expect(Warnings).toEqual([]);
        expect(Overrides).toEqual(['MaxDepth', 'SoftLinks']);
    });

    it("keeps the configured scope for narrowing when UserEditable is 'none' or 'fields'", () => {
        for (const editable of ['none', 'fields'] as const) {
            const { Options, Warnings } = ResolveEffectiveCloneOptions(
                { MaxDepth: 2, SoftLinks: 'include', UserEditable: editable },
                { MaxDepth: 1, SoftLinks: 'skip' },
                none
            );
            expect(Options).toMatchObject({ MaxDepth: 2, SoftLinks: 'include' });
            expect(Warnings.map((w) => [w.Code, w.Field])).toEqual([
                ['OPTION_OVERRIDE_IGNORED', 'MaxDepth'],
                ['OPTION_OVERRIDE_IGNORED', 'SoftLinks'],
            ]);
        }
    });

    it('lets an Override Scope holder narrow even when UserEditable is none', () => {
        const { Options, Warnings } = ResolveEffectiveCloneOptions({ MaxDepth: 3, UserEditable: 'none' }, { MaxDepth: 1 }, override);
        expect(Options.MaxDepth).toBe(1);
        expect(Warnings).toEqual([]);
    });

    it('fires Entity Actions and keeps AI Actions off by default, with no authorization needed', () => {
        const { Options, Warnings } = ResolveEffectiveCloneOptions(null, {}, none);
        expect(Options).toMatchObject({ EntityActions: 'fire', AIActions: 'suppress' });
        expect(Warnings).toEqual([]);
    });

    it('follows the configured hooks without any authorization', () => {
        const { Options, Warnings } = ResolveEffectiveCloneOptions({ Hooks: { EntityActions: 'suppress', AIActions: 'fire' } }, {}, none);
        expect(Options).toMatchObject({ EntityActions: 'suppress', AIActions: 'fire' });
        expect(Warnings).toEqual([]);
    });

    it('ignores a request to change hooks, either way, without Fire Hooks', () => {
        const suppress = ResolveEffectiveCloneOptions(null, { EntityActions: 'suppress', AIActions: 'fire' }, none);
        expect(suppress.Options).toMatchObject({ EntityActions: 'fire', AIActions: 'suppress' });
        expect(suppress.Warnings.map((w) => [w.Code, w.Field])).toEqual([['HOOKS_FORBIDDEN', 'EntityActions'], ['HOOKS_FORBIDDEN', 'AIActions']]);
    });

    it('applies a hooks change for a Fire Hooks holder and records it as an override', () => {
        const granted = ResolveEffectiveCloneOptions(null, { EntityActions: 'suppress' }, { CanFireHooks: true, CanOverrideScope: false });
        expect(granted.Options.EntityActions).toBe('suppress');
        expect(granted.Warnings).toEqual([]);
        expect(granted.Overrides).toEqual(['EntityActions']);
    });
});

describe('NormalizeClonePresets', () => {
    it('reads the documented array shape', () => {
        expect(NormalizeClonePresets([{ Key: 'shallow', Label: 'Shallow', Options: { MaxDepth: 1 } }])).toEqual([
            { Key: 'shallow', Label: 'Shallow', Description: undefined, Options: { MaxDepth: 1 }, Relationships: undefined },
        ]);
    });

    it('accepts the legacy keyed-object shape', () => {
        const presets = NormalizeClonePresets({ 'deep-prompts': { Description: 'd', Relationships: { 'MJ: AI Prompts': { Policy: 'Deep' } } } });
        expect(presets).toEqual([
            { Key: 'deep-prompts', Label: 'deep-prompts', Description: 'd', Options: undefined, Relationships: { 'MJ: AI Prompts': { Policy: 'Deep' } } },
        ]);
    });

    it('returns no presets for anything else', () => {
        expect(NormalizeClonePresets(undefined)).toEqual([]);
        expect(NormalizeClonePresets('nope')).toEqual([]);
        expect(NormalizeClonePresets([null, 3, {}])).toEqual([]);
    });
});

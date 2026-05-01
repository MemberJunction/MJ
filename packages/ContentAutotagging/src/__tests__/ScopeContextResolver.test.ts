import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted state — what the fake TagEngine returns for GetTagByID + GetScopesForTag.
const { TAGS, SCOPES_BY_TAG } = vi.hoisted(() => ({
    TAGS: new Map<string, { ID: string; IsGlobal: boolean }>(),
    SCOPES_BY_TAG: new Map<string, Array<{ ScopeEntityID: string; ScopeRecordID: string }>>(),
}));

vi.mock('@memberjunction/tag-engine', () => ({
    TagEngine: {
        Instance: {
            GetTagByID: (id: string) => TAGS.get(id),
        },
    },
}));

vi.mock('@memberjunction/tag-engine-base', () => ({
    TagEngineBase: {
        Instance: {
            GetScopesForTag: (id: string) => SCOPES_BY_TAG.get(id) ?? [],
        },
    },
}));

import { ScopeContextResolver } from '../Engine/generic/ScopeContextResolver';
import type { MJContentSourceEntity } from '@memberjunction/core-entities';
import type { TagScopeContext } from '@memberjunction/tag-engine-base';

function makeSource(tagRootID: string | null): MJContentSourceEntity {
    return {
        ConfigurationObject: { TagRootID: tagRootID },
    } as unknown as MJContentSourceEntity;
}

describe('ScopeContextResolver', () => {
    beforeEach(() => {
        TAGS.clear();
        SCOPES_BY_TAG.clear();
    });

    describe('deriveScopeContext', () => {
        it('returns null when TagRootID is missing', () => {
            const ctx = ScopeContextResolver.deriveScopeContext(makeSource(null));
            expect(ctx).toBeNull();
        });

        it('returns null when root tag is global', () => {
            TAGS.set('root', { ID: 'root', IsGlobal: true });
            const ctx = ScopeContextResolver.deriveScopeContext(makeSource('root'));
            expect(ctx).toBeNull();
        });

        it('returns null when non-global root has no TagScope rows', () => {
            TAGS.set('root', { ID: 'root', IsGlobal: false });
            const ctx = ScopeContextResolver.deriveScopeContext(makeSource('root'));
            expect(ctx).toBeNull();
        });

        it('builds context from non-global root TagScope rows', () => {
            TAGS.set('root', { ID: 'root', IsGlobal: false });
            SCOPES_BY_TAG.set('root', [
                { ScopeEntityID: 'e1', ScopeRecordID: 'r1' },
                { ScopeEntityID: 'e1', ScopeRecordID: 'r2' },
            ]);
            const ctx = ScopeContextResolver.deriveScopeContext(makeSource('root'));
            expect(ctx).not.toBeNull();
            expect(ctx!.scopes).toHaveLength(2);
            expect(ctx!.scopes[0]).toEqual({ entityId: 'e1', recordId: 'r1' });
        });
    });

    describe('union', () => {
        const a: TagScopeContext = { scopes: [{ entityId: 'e1', recordId: 'r1' }] };
        const b: TagScopeContext = { scopes: [{ entityId: 'e1', recordId: 'r2' }] };

        it('returns null when both inputs null', () => {
            expect(ScopeContextResolver.union(null, null)).toBeNull();
        });

        it('returns the non-null input when one is null', () => {
            expect(ScopeContextResolver.union(a, null)).toBe(a);
            expect(ScopeContextResolver.union(null, b)).toBe(b);
        });

        it('merges and deduplicates by (entityId, recordId)', () => {
            const merged = ScopeContextResolver.union(a, b);
            expect(merged?.scopes).toHaveLength(2);
        });

        it('deduplicates identical entries', () => {
            const merged = ScopeContextResolver.union(a, a);
            expect(merged?.scopes).toHaveLength(1);
        });
    });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        public static Provider = {
            EntityByName: (name: string) => ({ ID: `entity-${name.toLowerCase().replace(/\s+/g, '-')}` }),
        };
    },
}));

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class<T> {
        public constructor() {}
        public static getInstance<T>(this: new () => T): T {
            const ctor = this as unknown as { _inst?: T };
            if (!ctor._inst) ctor._inst = new (this as unknown as new () => T)();
            return ctor._inst as T;
        }
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTagEntity: class {},
}));

import { TagScopeFilterBuilder } from '../TagScopeFilterBuilder';
import type { TagScopeContext } from '../TagScopeContext';
import type { MJTagEntity } from '@memberjunction/core-entities';

describe('TagScopeFilterBuilder', () => {
    const builder = TagScopeFilterBuilder.Instance;

    describe('buildVisibilityFilter', () => {
        it('returns Active-only when context omitted', () => {
            expect(builder.buildVisibilityFilter()).toBe(`Status='Active'`);
            expect(builder.buildVisibilityFilter(null)).toBe(`Status='Active'`);
        });

        it('returns Active+IsGlobal when globalOnly is true', () => {
            const ctx: TagScopeContext = { scopes: [], globalOnly: true };
            expect(builder.buildVisibilityFilter(ctx)).toBe(`Status='Active' AND IsGlobal=1`);
        });

        it('builds OR-of-IsGlobal-or-scope-subquery for normal context', () => {
            const ctx: TagScopeContext = {
                scopes: [{ entityName: 'Companies', recordId: 'rec-1' }],
            };
            const sql = builder.buildVisibilityFilter(ctx);
            expect(sql).toContain(`Status='Active'`);
            expect(sql).toContain(`IsGlobal=1`);
            expect(sql).toContain(`SELECT TagID FROM __mj.vwTagScopes`);
            expect(sql).toContain(`ScopeEntityID='entity-companies'`);
            expect(sql).toContain(`ScopeRecordID='rec-1'`);
        });

        it('falls back to global-only when no scope entries resolve', () => {
            const ctx: TagScopeContext = {
                scopes: [{ recordId: 'rec-1' }], // no entity → can't resolve
            };
            expect(builder.buildVisibilityFilter(ctx)).toBe(`Status='Active' AND IsGlobal=1`);
        });

        it('escapes single quotes in record IDs', () => {
            const ctx: TagScopeContext = {
                scopes: [{ entityName: 'Companies', recordId: `it's me` }],
            };
            const sql = builder.buildVisibilityFilter(ctx);
            expect(sql).toContain(`ScopeRecordID='it''s me'`);
        });
    });

    describe('buildInMemoryFilter', () => {
        const tag = (id: string, status: 'Active' | 'Merged', isGlobal: boolean): MJTagEntity =>
            ({ ID: id, Status: status, IsGlobal: isGlobal } as unknown as MJTagEntity);

        it('returns Status==Active filter when no context', () => {
            const filter = builder.buildInMemoryFilter();
            expect(filter(tag('a', 'Active', false))).toBe(true);
            expect(filter(tag('b', 'Merged', true))).toBe(false);
        });

        it('limits to global tags when globalOnly is true', () => {
            const ctx: TagScopeContext = { scopes: [], globalOnly: true };
            const filter = builder.buildInMemoryFilter(ctx);
            expect(filter(tag('a', 'Active', true))).toBe(true);
            expect(filter(tag('b', 'Active', false))).toBe(false);
        });

        it('matches global OR scope-row tags when context supplied', () => {
            const ctx: TagScopeContext = {
                scopes: [{ entityName: 'Companies', recordId: 'rec-1' }],
            };
            const scopes = new Map<string, Array<{ ScopeEntityID: string; ScopeRecordID: string }>>();
            scopes.set('a', [{ ScopeEntityID: 'entity-companies', ScopeRecordID: 'rec-1' }]);
            const filter = builder.buildInMemoryFilter(ctx, scopes);

            expect(filter(tag('a', 'Active', false))).toBe(true);  // scoped match
            expect(filter(tag('b', 'Active', true))).toBe(true);   // global
            expect(filter(tag('c', 'Active', false))).toBe(false); // unscoped non-global
            expect(filter(tag('d', 'Merged', true))).toBe(false);  // inactive
        });
    });

    describe('validateChildScope', () => {
        it('passes when parent is global', () => {
            const result = builder.validateChildScope(
                { Name: 'Parent', IsGlobal: true } as unknown as MJTagEntity,
                [{ entityName: 'Companies', recordId: 'r1' }],
                []
            );
            expect(result.ok).toBe(true);
        });

        it('rejects empty child scope when parent is non-global', () => {
            const result = builder.validateChildScope(
                { Name: 'Parent', IsGlobal: false } as unknown as MJTagEntity,
                [],
                [{ ScopeEntityID: 'e1', ScopeRecordID: 'r1' }]
            );
            expect(result.ok).toBe(false);
        });

        it('rejects child scope outside parent scope', () => {
            const result = builder.validateChildScope(
                { Name: 'Parent', IsGlobal: false } as unknown as MJTagEntity,
                [{ entityName: 'Companies', recordId: 'r2' }],
                [{ ScopeEntityID: 'entity-companies', ScopeRecordID: 'r1' }]
            );
            expect(result.ok).toBe(false);
        });

        it('passes when child scope is a subset', () => {
            const result = builder.validateChildScope(
                { Name: 'Parent', IsGlobal: false } as unknown as MJTagEntity,
                [{ entityName: 'Companies', recordId: 'r1' }],
                [
                    { ScopeEntityID: 'entity-companies', ScopeRecordID: 'r1' },
                    { ScopeEntityID: 'entity-companies', ScopeRecordID: 'r2' },
                ]
            );
            expect(result.ok).toBe(true);
        });
    });
});

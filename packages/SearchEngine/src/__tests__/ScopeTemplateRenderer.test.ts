import { describe, it, expect } from 'vitest';
import { RenderScopeTemplate, RenderScopeJsonTemplate } from '../generic/ScopeTemplateRenderer';
import { SearchContext } from '../generic/search.types';

describe('ScopeTemplateRenderer', () => {
    describe('RenderScopeTemplate', () => {
        it('returns empty string for null/undefined template', () => {
            expect(RenderScopeTemplate(null, undefined)).toBe('');
            expect(RenderScopeTemplate(undefined, undefined)).toBe('');
            expect(RenderScopeTemplate('', undefined)).toBe('');
        });

        it('returns input unchanged when no templating syntax present (fast path)', () => {
            expect(RenderScopeTemplate('just a plain filter string', undefined)).toBe('just a plain filter string');
            expect(RenderScopeTemplate("Status='Active'", undefined)).toBe("Status='Active'");
        });

        it('interpolates PrimaryScopeRecordID from SearchContext', () => {
            const ctx: SearchContext = { PrimaryScopeRecordID: 'tenant-abc' };
            const result = RenderScopeTemplate("OrganizationID='{{ context.PrimaryScopeRecordID }}'", ctx);
            expect(result).toBe("OrganizationID='tenant-abc'");
        });

        it('interpolates SecondaryScopes values (flat primitive per ai-core-plus)', () => {
            const ctx: SearchContext = {
                PrimaryScopeRecordID: 'tenant-a',
                SecondaryScopes: { dept: 'support', contact: 'c-1' },
            };
            const result = RenderScopeTemplate(
                "Dept='{{ context.SecondaryScopes.dept }}' AND Contact='{{ context.SecondaryScopes.contact }}'",
                ctx
            );
            expect(result).toBe("Dept='support' AND Contact='c-1'");
        });

        it('leaves unknown variables as empty (default Nunjucks behavior)', () => {
            const ctx: SearchContext = { PrimaryScopeRecordID: 'tenant-a' };
            const result = RenderScopeTemplate("Foo='{{ doesnotexist }}'", ctx);
            expect(result).toBe("Foo=''");
        });

        it('supports json filter', () => {
            const ctx: SearchContext = { PrimaryScopeRecordID: 'tenant-a' };
            const extraData = { ids: ['a', 'b', 'c'] };
            const result = RenderScopeTemplate('IDs in {{ ids | jsoninline }}', ctx, extraData);
            expect(result).toBe('IDs in ["a","b","c"]');
        });

        it('returns raw template on render failure (defensive — no throw)', () => {
            // Deliberately malformed template → should not throw, returns input
            const result = RenderScopeTemplate('{{ unterminated', undefined);
            expect(result).toBe('{{ unterminated');
        });
    });

    describe('RenderScopeJsonTemplate', () => {
        it('returns undefined for null/undefined/empty', () => {
            expect(RenderScopeJsonTemplate(null, undefined)).toBeUndefined();
            expect(RenderScopeJsonTemplate('', undefined)).toBeUndefined();
        });

        it('parses valid JSON output', () => {
            const ctx: SearchContext = { PrimaryScopeRecordID: 'tenant-a' };
            const result = RenderScopeJsonTemplate(
                '{ "orgId": "{{ context.PrimaryScopeRecordID }}", "active": true }',
                ctx
            );
            expect(result).toEqual({ orgId: 'tenant-a', active: true });
        });

        it('returns raw string when rendered output is not JSON', () => {
            const result = RenderScopeJsonTemplate('not json just text', undefined);
            expect(result).toBe('not json just text');
        });
    });
});

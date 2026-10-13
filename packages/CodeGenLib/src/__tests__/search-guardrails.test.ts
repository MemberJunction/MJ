/**
 * Unit tests for the CodeGen smart-field-identification guardrails. These
 * cover the pure heuristics and pipeline functions that sit between the LLM
 * response and the SQL UPDATEs that flip search flags on entities/fields.
 *
 * The integration in `manage-metadata.ts` (`normalizeSearchFlagsInPlace`,
 * `applyEntitySearchConfig`) wires these helpers to live database state and
 * is exercised at a higher level. These tests target the guardrails
 * themselves so regressions in the heuristics fail loudly.
 */
import { describe, it, expect } from 'vitest';
import {
    ApplySearchableFieldsCap,
    DefaultPredicateFor,
    EntityLevelEnableBlockedReason,
    IsDetailOrLineItemEntity,
    IsIdentifierFieldName,
    IsLikelyLogOrAuditEntityName,
    IsNameLikeFieldName,
    IsNarrativeFieldName,
    MAX_SEARCHABLE_FIELDS_PER_ENTITY,
    NormalizePredicate,
    NormalizeSmartFieldResultShape,
} from '../Database/search-guardrails';

describe('isNarrativeFieldName', () => {
    it('matches exact narrative names case-insensitively', () => {
        for (const name of ['Comments', 'comment', 'Notes', 'note', 'Description', 'Bio', 'Body', 'Memo', 'Summary', 'Content', 'Remarks', 'Details']) {
            expect(IsNarrativeFieldName(name)).toBe(true);
        }
    });

    it('matches narrative-suffix variants', () => {
        expect(IsNarrativeFieldName('ReleaseNotes')).toBe(true);
        expect(IsNarrativeFieldName('EndpointDescription')).toBe(true);
        expect(IsNarrativeFieldName('BodyText')).toBe(false); // suffix is "Text" not narrative
        expect(IsNarrativeFieldName('UserNote')).toBe(true);
        expect(IsNarrativeFieldName('AdminRemark')).toBe(true);
    });

    it('does not match non-narrative names', () => {
        expect(IsNarrativeFieldName('Name')).toBe(false);
        expect(IsNarrativeFieldName('Email')).toBe(false);
        expect(IsNarrativeFieldName('OrderNumber')).toBe(false);
        expect(IsNarrativeFieldName('FirstName')).toBe(false);
    });

    it('handles empty/undefined safely', () => {
        expect(IsNarrativeFieldName('')).toBe(false);
        // @ts-expect-error testing defensive nullable handling
        expect(IsNarrativeFieldName(undefined)).toBe(false);
    });
});

describe('isIdentifierFieldName', () => {
    it('matches identifier-shaped names', () => {
        for (const name of ['Email', 'SKU', 'OrderNumber', 'AccountNumber', 'MemberID', 'InvoiceNumber', 'ZipCode', 'PostalCode', 'Phone', 'PhoneNumber', 'SSN', 'ISBN', 'ProductCode']) {
            expect(IsIdentifierFieldName(name)).toBe(true);
        }
    });

    it('does not match bare ID (PK)', () => {
        expect(IsIdentifierFieldName('ID')).toBe(false);
        expect(IsIdentifierFieldName('id')).toBe(false);
    });

    it('does not match name-like fields', () => {
        expect(IsIdentifierFieldName('Name')).toBe(false);
        expect(IsIdentifierFieldName('FirstName')).toBe(false);
        expect(IsIdentifierFieldName('Title')).toBe(false);
    });
});

describe('isNameLikeFieldName', () => {
    it('matches name-like fields', () => {
        for (const name of ['Name', 'Title', 'FirstName', 'LastName', 'MiddleName', 'DisplayName', 'FullName', 'Label']) {
            expect(IsNameLikeFieldName(name)).toBe(true);
        }
    });

    it('does not match identifiers', () => {
        expect(IsNameLikeFieldName('Email')).toBe(false);
        expect(IsNameLikeFieldName('OrderNumber')).toBe(false);
    });
});

describe('isDetailOrLineItemEntity', () => {
    it('matches detail/line-item-shaped entity names', () => {
        for (const name of [
            'Order Lines', 'Order Detail', 'Order Details', 'AI Agent Run Steps',
            'Sync Mappings', 'Workflow Steps', 'Action Params', 'Cart Items',
        ]) {
            expect(IsDetailOrLineItemEntity(name)).toBe(true);
        }
    });

    it('does not match unrelated names with similar substrings', () => {
        expect(IsDetailOrLineItemEntity('Customers')).toBe(false);
        expect(IsDetailOrLineItemEntity('Members')).toBe(false);
        expect(IsDetailOrLineItemEntity('Products')).toBe(false);
    });
});

describe('defaultPredicateFor', () => {
    it('returns Exact for identifiers', () => {
        expect(DefaultPredicateFor('Email')).toBe('Exact');
        expect(DefaultPredicateFor('OrderNumber')).toBe('Exact');
        expect(DefaultPredicateFor('SKU')).toBe('Exact');
    });

    it('returns BeginsWith for name-like fields and unknown shapes', () => {
        expect(DefaultPredicateFor('FirstName')).toBe('BeginsWith');
        expect(DefaultPredicateFor('Name')).toBe('BeginsWith');
        expect(DefaultPredicateFor('SomeOtherField')).toBe('BeginsWith');
    });
});

describe('normalizePredicate', () => {
    it('rewrites Contains to default when field is not in FTS', () => {
        const out = NormalizePredicate({
            fieldName: 'Comments',
            proposed: 'Contains',
            isInFullTextSearchFields: false,
            entityFullTextSearchEnabled: false,
        });
        expect(out.predicate).toBe('BeginsWith');
        expect(out.rewritten).toBe(true);
    });

    it('rewrites Contains to Exact for identifier-shaped fields', () => {
        const out = NormalizePredicate({
            fieldName: 'Email',
            proposed: 'Contains',
            isInFullTextSearchFields: false,
            entityFullTextSearchEnabled: false,
        });
        expect(out.predicate).toBe('Exact');
        expect(out.rewritten).toBe(true);
    });

    it('keeps Contains when field is in FTS list AND entity has FTS enabled', () => {
        const out = NormalizePredicate({
            fieldName: 'Bio',
            proposed: 'Contains',
            isInFullTextSearchFields: true,
            entityFullTextSearchEnabled: true,
        });
        expect(out.predicate).toBe('Contains');
        expect(out.rewritten).toBe(false);
    });

    it('rewrites Contains when field is in FTS list but entity does NOT have FTS enabled', () => {
        const out = NormalizePredicate({
            fieldName: 'Bio',
            proposed: 'Contains',
            isInFullTextSearchFields: true,
            entityFullTextSearchEnabled: false,
        });
        expect(out.predicate).toBe('BeginsWith');
        expect(out.rewritten).toBe(true);
    });

    it('passes through Exact, BeginsWith, EndsWith unchanged', () => {
        for (const p of ['Exact', 'BeginsWith', 'EndsWith'] as const) {
            const out = NormalizePredicate({
                fieldName: 'Name',
                proposed: p,
                isInFullTextSearchFields: false,
                entityFullTextSearchEnabled: false,
            });
            expect(out.predicate).toBe(p);
            expect(out.rewritten).toBe(false);
        }
    });

    it('falls back to default when no proposal provided', () => {
        const out = NormalizePredicate({
            fieldName: 'Email',
            proposed: undefined,
            isInFullTextSearchFields: false,
            entityFullTextSearchEnabled: false,
        });
        expect(out.predicate).toBe('Exact');
        expect(out.rewritten).toBe(false);
    });
});

describe('applySearchableFieldsCap', () => {
    it('returns input unchanged when under cap', () => {
        const input = ['FirstName', 'LastName', 'Email'];
        const out = ApplySearchableFieldsCap(input);
        expect(out.accepted).toEqual(input);
        expect(out.dropped).toEqual([]);
    });

    it('caps to MAX, preferring name-like and identifier fields', () => {
        const input = ['City', 'Comments', 'FirstName', 'LastName', 'Email', 'Phone', 'JobTitle'];
        const out = ApplySearchableFieldsCap(input);
        expect(out.accepted).toHaveLength(MAX_SEARCHABLE_FIELDS_PER_ENTITY);
        // Name-like fields should be in the accepted list
        expect(out.accepted).toContain('FirstName');
        expect(out.accepted).toContain('LastName');
        // Lower-rank generic strings should be in the dropped list
        expect(out.dropped).toContain('City');
        expect(out.dropped).toContain('Comments');
    });

    it('preserves stable order within rank tiers', () => {
        // All same rank (none name-like, none identifier-shaped) — order preserved
        const input = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
        const out = ApplySearchableFieldsCap(input);
        expect(out.accepted).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(out.dropped).toEqual(['Delta']);
    });
});

describe('normalizeSmartFieldResultShape', () => {
    it('forces searchableFields/Predicates to empty when allowUserSearch=false', () => {
        const out = NormalizeSmartFieldResultShape({
            allowUserSearch: false,
            searchableFields: ['Name', 'Email'],
            searchPredicates: [
                { field: 'Name', predicate: 'BeginsWith' },
                { field: 'Email', predicate: 'Exact' },
            ],
        });
        expect(out.searchableFields).toEqual([]);
        expect(out.searchPredicates).toEqual([]);
    });

    it('forces allowUserSearch=false when searchableFields is empty', () => {
        const out = NormalizeSmartFieldResultShape({
            allowUserSearch: true,
            searchableFields: [],
            searchPredicates: [],
        });
        expect(out.allowUserSearch).toBe(false);
    });

    it('deduplicates searchableFields while preserving order', () => {
        const out = NormalizeSmartFieldResultShape({
            allowUserSearch: true,
            searchableFields: ['Name', 'Email', 'Name', 'Phone', 'Email'],
            searchPredicates: [],
        });
        expect(out.searchableFields).toEqual(['Name', 'Email', 'Phone']);
    });

    it('passes through coherent results unchanged', () => {
        const input = {
            allowUserSearch: true,
            searchableFields: ['Name'],
            searchPredicates: [{ field: 'Name', predicate: 'BeginsWith' as const }],
            confidence: 'high' as const,
        };
        const out = NormalizeSmartFieldResultShape(input);
        expect(out.searchableFields).toEqual(['Name']);
        expect(out.searchPredicates).toEqual(input.searchPredicates);
        expect(out.allowUserSearch).toBe(true);
    });
});

describe('isLikelyLogOrAuditEntityName', () => {
    it('matches log/audit/run shapes', () => {
        expect(IsLikelyLogOrAuditEntityName('Audit Logs')).toBe(true);
        expect(IsLikelyLogOrAuditEntityName('AI Agent Runs')).toBe(true);
        expect(IsLikelyLogOrAuditEntityName('Record Changes')).toBe(true);
        expect(IsLikelyLogOrAuditEntityName('Action Execution Logs')).toBe(true);
    });

    it('does not match Test Runs (intentional carve-out)', () => {
        expect(IsLikelyLogOrAuditEntityName('Test Runs')).toBe(false);
    });

    it('does not match unrelated entities', () => {
        expect(IsLikelyLogOrAuditEntityName('Customers')).toBe(false);
        expect(IsLikelyLogOrAuditEntityName('Products')).toBe(false);
    });
});

describe('entityLevelEnableBlockedReason', () => {
    it('blocks when confidence is medium', () => {
        const reason = EntityLevelEnableBlockedReason({
            entityName: 'Customers',
            confidence: 'medium',
            acceptedSearchableFieldsCount: 2,
        });
        expect(reason).toMatch(/confidence/);
    });

    it('blocks when no searchable fields survived', () => {
        const reason = EntityLevelEnableBlockedReason({
            entityName: 'Customers',
            confidence: 'high',
            acceptedSearchableFieldsCount: 0,
        });
        expect(reason).toMatch(/no searchable fields/);
    });

    it('blocks log/audit-shaped entities', () => {
        const reason = EntityLevelEnableBlockedReason({
            entityName: 'AI Agent Runs',
            confidence: 'high',
            acceptedSearchableFieldsCount: 1,
        });
        expect(reason).toMatch(/log\/audit/);
    });

    it('blocks detail/line-item-shaped entities', () => {
        const reason = EntityLevelEnableBlockedReason({
            entityName: 'Order Lines',
            confidence: 'high',
            acceptedSearchableFieldsCount: 1,
        });
        expect(reason).toMatch(/detail\/line-item/);
    });

    it('returns null when all conditions pass', () => {
        const reason = EntityLevelEnableBlockedReason({
            entityName: 'Customers',
            confidence: 'high',
            acceptedSearchableFieldsCount: 2,
        });
        expect(reason).toBeNull();
    });
});

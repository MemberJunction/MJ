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
    applySearchableFieldsCap,
    defaultPredicateFor,
    entityLevelEnableBlockedReason,
    isDetailOrLineItemEntity,
    isIdentifierFieldName,
    isLikelyLogOrAuditEntityName,
    isNameLikeFieldName,
    isNarrativeFieldName,
    MAX_SEARCHABLE_FIELDS_PER_ENTITY,
    normalizePredicate,
    normalizeSmartFieldResultShape,
} from '../Database/search-guardrails';

describe('isNarrativeFieldName', () => {
    it('matches exact narrative names case-insensitively', () => {
        for (const name of ['Comments', 'comment', 'Notes', 'note', 'Description', 'Bio', 'Body', 'Memo', 'Summary', 'Content', 'Remarks', 'Details']) {
            expect(isNarrativeFieldName(name)).toBe(true);
        }
    });

    it('matches narrative-suffix variants', () => {
        expect(isNarrativeFieldName('ReleaseNotes')).toBe(true);
        expect(isNarrativeFieldName('EndpointDescription')).toBe(true);
        expect(isNarrativeFieldName('BodyText')).toBe(false); // suffix is "Text" not narrative
        expect(isNarrativeFieldName('UserNote')).toBe(true);
        expect(isNarrativeFieldName('AdminRemark')).toBe(true);
    });

    it('does not match non-narrative names', () => {
        expect(isNarrativeFieldName('Name')).toBe(false);
        expect(isNarrativeFieldName('Email')).toBe(false);
        expect(isNarrativeFieldName('OrderNumber')).toBe(false);
        expect(isNarrativeFieldName('FirstName')).toBe(false);
    });

    it('handles empty/undefined safely', () => {
        expect(isNarrativeFieldName('')).toBe(false);
        // @ts-expect-error testing defensive nullable handling
        expect(isNarrativeFieldName(undefined)).toBe(false);
    });
});

describe('isIdentifierFieldName', () => {
    it('matches identifier-shaped names', () => {
        for (const name of ['Email', 'SKU', 'OrderNumber', 'AccountNumber', 'MemberID', 'InvoiceNumber', 'ZipCode', 'PostalCode', 'Phone', 'PhoneNumber', 'SSN', 'ISBN', 'ProductCode']) {
            expect(isIdentifierFieldName(name)).toBe(true);
        }
    });

    it('does not match bare ID (PK)', () => {
        expect(isIdentifierFieldName('ID')).toBe(false);
        expect(isIdentifierFieldName('id')).toBe(false);
    });

    it('does not match name-like fields', () => {
        expect(isIdentifierFieldName('Name')).toBe(false);
        expect(isIdentifierFieldName('FirstName')).toBe(false);
        expect(isIdentifierFieldName('Title')).toBe(false);
    });
});

describe('isNameLikeFieldName', () => {
    it('matches name-like fields', () => {
        for (const name of ['Name', 'Title', 'FirstName', 'LastName', 'MiddleName', 'DisplayName', 'FullName', 'Label']) {
            expect(isNameLikeFieldName(name)).toBe(true);
        }
    });

    it('does not match identifiers', () => {
        expect(isNameLikeFieldName('Email')).toBe(false);
        expect(isNameLikeFieldName('OrderNumber')).toBe(false);
    });
});

describe('isDetailOrLineItemEntity', () => {
    it('matches detail/line-item-shaped entity names', () => {
        for (const name of [
            'Order Lines', 'Order Detail', 'Order Details', 'AI Agent Run Steps',
            'Sync Mappings', 'Workflow Steps', 'Action Params', 'Cart Items',
        ]) {
            expect(isDetailOrLineItemEntity(name)).toBe(true);
        }
    });

    it('does not match unrelated names with similar substrings', () => {
        expect(isDetailOrLineItemEntity('Customers')).toBe(false);
        expect(isDetailOrLineItemEntity('Members')).toBe(false);
        expect(isDetailOrLineItemEntity('Products')).toBe(false);
    });
});

describe('defaultPredicateFor', () => {
    it('returns Exact for identifiers', () => {
        expect(defaultPredicateFor('Email')).toBe('Exact');
        expect(defaultPredicateFor('OrderNumber')).toBe('Exact');
        expect(defaultPredicateFor('SKU')).toBe('Exact');
    });

    it('returns BeginsWith for name-like fields and unknown shapes', () => {
        expect(defaultPredicateFor('FirstName')).toBe('BeginsWith');
        expect(defaultPredicateFor('Name')).toBe('BeginsWith');
        expect(defaultPredicateFor('SomeOtherField')).toBe('BeginsWith');
    });
});

describe('normalizePredicate', () => {
    it('rewrites Contains to default when field is not in FTS', () => {
        const out = normalizePredicate({
            fieldName: 'Comments',
            proposed: 'Contains',
            isInFullTextSearchFields: false,
            entityFullTextSearchEnabled: false,
        });
        expect(out.predicate).toBe('BeginsWith');
        expect(out.rewritten).toBe(true);
    });

    it('rewrites Contains to Exact for identifier-shaped fields', () => {
        const out = normalizePredicate({
            fieldName: 'Email',
            proposed: 'Contains',
            isInFullTextSearchFields: false,
            entityFullTextSearchEnabled: false,
        });
        expect(out.predicate).toBe('Exact');
        expect(out.rewritten).toBe(true);
    });

    it('keeps Contains when field is in FTS list AND entity has FTS enabled', () => {
        const out = normalizePredicate({
            fieldName: 'Bio',
            proposed: 'Contains',
            isInFullTextSearchFields: true,
            entityFullTextSearchEnabled: true,
        });
        expect(out.predicate).toBe('Contains');
        expect(out.rewritten).toBe(false);
    });

    it('rewrites Contains when field is in FTS list but entity does NOT have FTS enabled', () => {
        const out = normalizePredicate({
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
            const out = normalizePredicate({
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
        const out = normalizePredicate({
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
        const out = applySearchableFieldsCap(input);
        expect(out.accepted).toEqual(input);
        expect(out.dropped).toEqual([]);
    });

    it('caps to MAX, preferring name-like and identifier fields', () => {
        const input = ['City', 'Comments', 'FirstName', 'LastName', 'Email', 'Phone', 'JobTitle'];
        const out = applySearchableFieldsCap(input);
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
        const out = applySearchableFieldsCap(input);
        expect(out.accepted).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(out.dropped).toEqual(['Delta']);
    });
});

describe('normalizeSmartFieldResultShape', () => {
    it('forces searchableFields/Predicates to empty when allowUserSearch=false', () => {
        const out = normalizeSmartFieldResultShape({
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
        const out = normalizeSmartFieldResultShape({
            allowUserSearch: true,
            searchableFields: [],
            searchPredicates: [],
        });
        expect(out.allowUserSearch).toBe(false);
    });

    it('deduplicates searchableFields while preserving order', () => {
        const out = normalizeSmartFieldResultShape({
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
        const out = normalizeSmartFieldResultShape(input);
        expect(out.searchableFields).toEqual(['Name']);
        expect(out.searchPredicates).toEqual(input.searchPredicates);
        expect(out.allowUserSearch).toBe(true);
    });
});

describe('isLikelyLogOrAuditEntityName', () => {
    it('matches log/audit/run shapes', () => {
        expect(isLikelyLogOrAuditEntityName('Audit Logs')).toBe(true);
        expect(isLikelyLogOrAuditEntityName('AI Agent Runs')).toBe(true);
        expect(isLikelyLogOrAuditEntityName('Record Changes')).toBe(true);
        expect(isLikelyLogOrAuditEntityName('Action Execution Logs')).toBe(true);
    });

    it('does not match Test Runs (intentional carve-out)', () => {
        expect(isLikelyLogOrAuditEntityName('Test Runs')).toBe(false);
    });

    it('does not match unrelated entities', () => {
        expect(isLikelyLogOrAuditEntityName('Customers')).toBe(false);
        expect(isLikelyLogOrAuditEntityName('Products')).toBe(false);
    });
});

describe('entityLevelEnableBlockedReason', () => {
    it('blocks when confidence is medium', () => {
        const reason = entityLevelEnableBlockedReason({
            entityName: 'Customers',
            confidence: 'medium',
            acceptedSearchableFieldsCount: 2,
        });
        expect(reason).toMatch(/confidence/);
    });

    it('blocks when no searchable fields survived', () => {
        const reason = entityLevelEnableBlockedReason({
            entityName: 'Customers',
            confidence: 'high',
            acceptedSearchableFieldsCount: 0,
        });
        expect(reason).toMatch(/no searchable fields/);
    });

    it('blocks log/audit-shaped entities', () => {
        const reason = entityLevelEnableBlockedReason({
            entityName: 'AI Agent Runs',
            confidence: 'high',
            acceptedSearchableFieldsCount: 1,
        });
        expect(reason).toMatch(/log\/audit/);
    });

    it('blocks detail/line-item-shaped entities', () => {
        const reason = entityLevelEnableBlockedReason({
            entityName: 'Order Lines',
            confidence: 'high',
            acceptedSearchableFieldsCount: 1,
        });
        expect(reason).toMatch(/detail\/line-item/);
    });

    it('returns null when all conditions pass', () => {
        const reason = entityLevelEnableBlockedReason({
            entityName: 'Customers',
            confidence: 'high',
            acceptedSearchableFieldsCount: 2,
        });
        expect(reason).toBeNull();
    });
});

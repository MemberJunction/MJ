/**
 * Unit tests for the entity display-name opacity heuristic.
 *
 * This decides which entity names are worth an LLM call — names the
 * deterministic `createDisplayName()` conversion cannot make readable. It is a
 * cost filter, so the asymmetry matters: a false positive wastes one call whose
 * answer is probably the mechanical name anyway, while a false negative silently
 * leaves an unreadable name in place. The tests below encode that bias.
 */

import { describe, it, expect } from 'vitest';
import { assessDisplayNameOpacity, isLikelyOpaqueEntityName } from '../Misc/display-name-heuristics';

describe('assessDisplayNameOpacity - names the heuristic already handles', () => {
    it.each([
        'Accounts',
        'CustomerOrders',
        'customer_orders',
        'UserAccounts',
        'InvoiceLineItems',
        'ProductCategories'
    ])('treats %s as clean, so it never reaches the model', (name) => {
        const result = assessDisplayNameOpacity(name);
        expect(result.isOpaque).toBe(false);
        expect(result.reason).toBe('clean');
    });

    it('does not flag well-known short words', () => {
        // These are real words at 3 characters; flagging them would burn calls
        // on names that are already perfectly readable.
        expect(isLikelyOpaqueEntityName('AuditLog')).toBe(false);
        expect(isLikelyOpaqueEntityName('JobRun')).toBe(false);
        expect(isLikelyOpaqueEntityName('ApiKey')).toBe(false);
        expect(isLikelyOpaqueEntityName('TagMap')).toBe(false);
    });

    it('does not flag a schema prefix as an abbreviation', () => {
        // "CRM:" survives the punctuation strip as "CRM", which has no vowel —
        // it must not be what triggers the verdict.
        const result = assessDisplayNameOpacity('Accounts');
        expect(result.isOpaque).toBe(false);
    });
});

describe('assessDisplayNameOpacity - names only vocabulary can fix', () => {
    it('flags a vowel-less token as a near-certain abbreviation', () => {
        const result = assessDisplayNameOpacity('MBR_XREF');
        expect(result.isOpaque).toBe(true);
        expect(result.reason).toBe('no-vowel-token');
        expect(result.offendingToken).toBeDefined();
    });

    it('flags the canonical opaque legacy name', () => {
        const result = assessDisplayNameOpacity('ACCT_STAT_CD');
        expect(result.isOpaque).toBe(true);
        // The mechanical pass spaces it correctly and still leaves it unreadable,
        // which is exactly the case this feature exists for.
        expect(result.mechanicalDisplayName).toMatch(/Acct/i);
    });

    it('flags a digit embedded in an alphabetic token', () => {
        // The mechanical pass splits a leading digit into its own token
        // ("Addr2Line" -> "Addr 2 Line"), so this rule only fires where the
        // digit stays welded to letters, as in an identifier-style token.
        const result = assessDisplayNameOpacity('SHA256Hash');
        expect(result.isOpaque).toBe(true);
        expect(result.reason).toBe('digit-in-token');
        expect(result.offendingToken).toBe('SHA256');
    });

    it('flags short tokens that are not common words', () => {
        const result = assessDisplayNameOpacity('QtyAdjustments');
        expect(result.isOpaque).toBe(true);
        expect(result.reason).toBe('short-unknown-token');
        expect(result.offendingToken).toBe('Qty');
    });

    it.each(['TXN_HDR', 'DEPT_MGR', 'CFG_VAL', 'ORG_DTL'])(
        'flags %s',
        (name) => {
            expect(isLikelyOpaqueEntityName(name)).toBe(true);
        }
    );
});

describe('assessDisplayNameOpacity - edge cases', () => {
    it('handles an empty name without throwing', () => {
        const result = assessDisplayNameOpacity('');
        expect(result.isOpaque).toBe(false);
        expect(result.mechanicalDisplayName).toBe('');
    });

    it('handles a null-ish name defensively', () => {
        // The column is NOT NULL, but this runs over raw driver rows.
        expect(() => assessDisplayNameOpacity(undefined as unknown as string)).not.toThrow();
        expect(() => assessDisplayNameOpacity(null as unknown as string)).not.toThrow();
    });

    it('ignores purely numeric tokens, which carry no vocabulary to expand', () => {
        const result = assessDisplayNameOpacity('Revenue 2024 Summaries');
        expect(result.reason).not.toBe('no-vowel-token');
    });

    it('does NOT catch four-letter abbreviations standing alone (known limitation)', () => {
        // "Addr 2 Line" is left alone: "Addr" is four characters and contains a
        // vowel, so no rule fires. Extending the short-token rule to length 4
        // would flag Item/Type/Rate/Line and burn calls across most schemas.
        // This is the deliberate cost/coverage trade-off — `alwaysGenerate: true`
        // is the escape hatch for a thorough backfill.
        expect(isLikelyOpaqueEntityName('Addr2Line')).toBe(false);
        expect(isLikelyOpaqueEntityName('DeptRosters')).toBe(false);
    });

    it('always reports the mechanical name it judged', () => {
        // The caller logs this, so a reviewer can see what the model was asked
        // to improve on rather than only the verdict.
        const result = assessDisplayNameOpacity('CustomerOrders');
        expect(result.mechanicalDisplayName).toBe('Customer Orders');
    });
});

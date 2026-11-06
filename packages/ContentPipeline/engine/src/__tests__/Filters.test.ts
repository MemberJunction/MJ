import { describe, expect, it } from 'vitest';
import { WhereAnyOf, WhereEqual } from '../Filters.js';

describe('filters built from values', () => {
    it('quotes and escapes values rather than interpolating them', () => {
        expect(WhereEqual({ URL: "https://x.test/it's" })).toBe("URL='https://x.test/it''s'");
    });

    it('renders null as IS NULL', () => {
        expect(WhereEqual({ ContentItemID: 'I1', DeleteStatus: null })).toBe("ContentItemID='I1' AND DeleteStatus IS NULL");
    });

    it('turns a list into the repo-standard OR of equalities', () => {
        expect(WhereAnyOf('ItemID', ['A', "B'"])).toBe("(ItemID='A') OR (ItemID='B''')");
    });

    it('matches nothing for an empty list, rather than everything', () => {
        expect(WhereAnyOf('ID', [])).toBe('1=0');
    });
});

/**
 * A bracket-quoted identifier must double any `]` it contains, or the name ends early and the
 * rest of it is read as SQL.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '../sqlServerDialect.js';

const ss = new SQLServerDialect();

describe('SQLServerDialect.QuoteIdentifier', () => {
    it('doubles an embedded closing bracket', () => {
        expect(ss.QuoteIdentifier('a]b')).toBe('[a]]b]');
        expect(ss.QuoteIdentifier('x] ; DROP TABLE t --')).toBe('[x]] ; DROP TABLE t --]');
    });

    it('leaves ordinary names as they are', () => {
        expect(ss.QuoteIdentifier('Order Details')).toBe('[Order Details]');
    });

    it('escapes both parts of a schema-qualified name', () => {
        expect(ss.QuoteSchema('my]schema', 'my]view')).toBe('[my]]schema].[my]]view]');
    });
});

/**
 * IdentifierMatches: how a caller's spelling of a column name resolves to an entity field.
 * The RunView aggregate screen resolves column references with it.
 */

import { describe, it, expect } from 'vitest';
import { IdentifierMatches } from '../identifierReferences';

describe('IdentifierMatches', () => {
    it('matches a name regardless of ASCII case and surrounding spaces', () => {
        expect(IdentifierMatches('bankaccount', 'BankAccount')).toBe(true);
        expect(IdentifierMatches(' BANKACCOUNT ', 'BankAccount')).toBe(true);
        expect(IdentifierMatches('BankAccounts', 'BankAccount')).toBe(false);
        expect(IdentifierMatches('', 'BankAccount')).toBe(false);
    });

    it('matches a non-ASCII name written in another case', () => {
        expect(IdentifierMatches('SALÁRIO', 'Salário')).toBe(true);
        expect(IdentifierMatches('ΜΙΣΘΌΣ', 'Μισθός')).toBe(true);
    });

    it('does not equate a look-alike letter with the ASCII letter it lower-cases to', () => {
        expect(IdentifierMatches('BanKAccount', 'BankAccount')).toBe(false); // KELVIN SIGN
        expect(IdentifierMatches('STRAẞE', 'Straße')).toBe(false); // CAPITAL SHARP S
        expect(IdentifierMatches('Årea', 'Årea')).toBe(false); // ANGSTROM SIGN
    });

    it('does not equate two lower-case letters that share one upper-case form', () => {
        expect(IdentifierMatches('Μισθόσ', 'Μισθός')).toBe(false); // σ in place of the final ς
        expect(IdentifierMatches('Doseµg', 'Doseμg')).toBe(false); // MICRO SIGN in place of μ
        expect(IdentifierMatches('Сᲄавка', 'Ставка')).toBe(false); // TALL TE in place of т
    });

    it('treats regex metacharacters in a name literally', () => {
        expect(IdentifierMatches('Salary%', 'Salary%')).toBe(true);
        expect(IdentifierMatches('a.c', 'abc')).toBe(false);
        expect(IdentifierMatches('Base Salary', 'Base Salary')).toBe(true);
    });
});

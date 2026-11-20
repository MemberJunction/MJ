import { describe, it, expect } from 'vitest';
import { SelectSuiteTestsByName } from '../utils/select-suite-tests';

const TESTS = [
    { ID: 'A1', Name: 'T001 - Login Smoke' },
    { ID: 'B2', Name: 'T002 - Data Explorer Open Record' },
    { ID: 'C3', Name: 'T003 - Navigation Tab Management' },
];

describe('SelectSuiteTestsByName', () => {
    it('returns the IDs of the named tests in the order given', () => {
        const result = SelectSuiteTestsByName(TESTS, ['T003 - Navigation Tab Management', 'T001 - Login Smoke']);
        expect(result.Ids).toEqual(['C3', 'A1']);
        expect(result.Missing).toEqual([]);
    });

    it('ignores spaces around a name and empty entries', () => {
        const result = SelectSuiteTestsByName(TESTS, ['  T002 - Data Explorer Open Record ', '', ' ']);
        expect(result.Ids).toEqual(['B2']);
        expect(result.Missing).toEqual([]);
    });

    it('lists each name that no test has', () => {
        const result = SelectSuiteTestsByName(TESTS, ['T001 - Login Smoke', 'T999 - Nope', 't001 - login smoke']);
        expect(result.Ids).toEqual(['A1']);
        expect(result.Missing).toEqual(['T999 - Nope', 't001 - login smoke']);
    });
});

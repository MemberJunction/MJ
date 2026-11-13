/**
 * @fileoverview Pick suite tests by name
 * @module @memberjunction/testing-cli
 */

/** The IDs of the named tests, and the names no test has. */
export interface SelectedSuiteTests {
    Ids: string[];
    Missing: string[];
}

/**
 * Find the tests with the given names. A name matches exactly, after the spaces around it are removed.
 * Empty names are ignored. The IDs come back in the order of `names`.
 */
export function SelectSuiteTestsByName(tests: ReadonlyArray<{ ID: string; Name: string }>, names: ReadonlyArray<string>): SelectedSuiteTests {
    const result: SelectedSuiteTests = { Ids: [], Missing: [] };
    for (const raw of names) {
        const name = raw.trim();
        if (!name) {
            continue;
        }
        const test = tests.find(t => t.Name === name);
        if (test) {
            result.Ids.push(test.ID);
        } else {
            result.Missing.push(name);
        }
    }
    return result;
}

/**
 * DOM-Assert Oracle — a deterministic oracle over the interactive
 * elements recorded at the run's final step (element grounding).
 *
 * Asserts a recorded postcondition without an LLM: "the end-state contains at
 * least N elements matching role/name". E.g. `{ role: 'button', name: 'Save' }`
 * confirms a Save button is present; `{ role: 'row', minCount: 5 }` confirms a
 * grid rendered at least 5 rows. Pure over `actualOutput.interactiveElements`
 * (no live browser at evaluation time).
 *
 * Config:
 * - `role: string`  — required element role (case-insensitive), optional.
 * - `name: string`  — substring the accessible name must contain (case-insensitive), optional.
 * - `minCount: number` — minimum number of matching elements (default 1).
 *
 * Requires element grounding to have been enabled for the run; when the
 * recorded set is absent it returns a clear "no recorded elements" failure
 * rather than a false pass.
 */

import { IOracle, OracleInput, OracleResult } from '@memberjunction/testing-engine';
import type { OracleConfig } from '@memberjunction/testing-engine';

interface RecordedElement { role: string; name: string; selector: string; }

export class DomAssertOracle implements IOracle {
    readonly type = 'dom-assert';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        const actual = input.actualOutput as Record<string, unknown> | undefined;
        const raw = actual?.interactiveElements;
        const elements: RecordedElement[] = Array.isArray(raw) ? raw as RecordedElement[] : [];

        const role = typeof config.role === 'string' ? config.role.trim().toLowerCase() : undefined;
        const name = typeof config.name === 'string' ? config.name.trim().toLowerCase() : undefined;
        const minCount = typeof config.minCount === 'number' && config.minCount > 0 ? config.minCount : 1;

        if (!role && !name) {
            return { oracleType: this.type, passed: false, score: 0, message: 'dom-assert requires at least one of: role, name' };
        }
        if (elements.length === 0) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: 'No recorded interactive elements — enable elementGrounding on this test for dom-assert to have data',
            };
        }

        const matches = elements.filter(e =>
            (!role || (e.role ?? '').trim().toLowerCase() === role) &&
            (!name || (e.name ?? '').trim().toLowerCase().includes(name))
        );

        const target = `${role ? `role="${role}"` : ''}${role && name ? ' ' : ''}${name ? `name~="${name}"` : ''}`;
        if (matches.length >= minCount) {
            return {
                oracleType: this.type,
                passed: true,
                score: 1.0,
                message: `Found ${matches.length} element(s) matching ${target} (need ${minCount})`,
                details: { matched: matches.length, minCount, target },
            };
        }
        return {
            oracleType: this.type,
            passed: false,
            score: 0,
            message: `Found ${matches.length} element(s) matching ${target}, need ${minCount}`,
            details: { matched: matches.length, minCount, target },
        };
    }
}

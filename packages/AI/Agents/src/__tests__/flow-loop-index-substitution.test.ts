/**
 * Loop output-mapping index substitution (issue #3171 sweep).
 *
 * `AfterLoopIteration` rewrites `[index]` in a loop's `actionOutputMapping` to
 * the concrete iteration number before applying the mapping. The #3171 sweep
 * converted that to a replacement function.
 *
 * Unlike the other converted sites this one carries NO live `$` risk: the
 * substituted value is `iterationResult.index`, typed `number`, so nothing that
 * `String.prototype.replace` treats as a metacharacter can reach the replacement
 * slot. The conversion was defensive — keeping the shape uniform — and a
 * `$`-property test here would be vacuous. What these tests pin instead is the
 * substitution behaviour itself, which had no coverage at all.
 *
 * They also record a REAL, separate gap on the same line: `indexVar` is
 * interpolated into `new RegExp` unescaped, and it is author-supplied via the
 * agent spec's `indexVariable`. A name containing a regex metacharacter builds a
 * pattern that means something else. That is the same defect class the sweep
 * fixed in PostgreSQLDataProvider with `escapeRegExp`, left unfixed here;
 * recorded so the gap is visible rather than assumed handled.
 */
import { describe, it, expect } from 'vitest';
import { FlowAgentType } from '../agent-types/flow-agent-type';

type Iteration = Parameters<FlowAgentType['AfterLoopIteration']>[0];

describe('FlowAgentType.AfterLoopIteration — [index] substitution', () => {
    const agentType = new FlowAgentType();

    /**
     * Drives the real method. The mapping writes the action's `out` param to a
     * payload path containing `[index]`; the substituted path becomes the key
     * structure of the returned change, so the result shows what came out.
     */
    const mapped = (index: number, indexVariable: string | undefined, mappingPath: string): unknown => {
        const iteration = {
            actionResults: [{ Params: [{ Name: 'out', Type: 'Output', Value: 'v' }] }],
            currentPayload: {},
            itemVariable: 'item',
            item: {},
            index,
            loopContext: {
                actionOutputMapping: JSON.stringify({ out: mappingPath }),
                indexVariable,
                itemVariable: 'item',
            },
        } as unknown as Iteration;

        return agentType.AfterLoopIteration(iteration);
    };

    it('substitutes the default [index] variable with the iteration number', () => {
        expect(mapped(0, undefined, 'rows[index].value')).toEqual({ 'rows[0]': { value: 'v' } });
        expect(mapped(7, undefined, 'rows[index].value')).toEqual({ 'rows[7]': { value: 'v' } });
    });

    it('substitutes a custom index variable name', () => {
        expect(mapped(3, 'i', 'rows[i].value')).toEqual({ 'rows[3]': { value: 'v' } });
    });

    it('replaces every occurrence of the index variable', () => {
        expect(mapped(2, undefined, 'a[index].b[index]')).toEqual({ 'a[2]': { 'b[2]': 'v' } });
    });

    it('leaves a mapping with no index variable untouched', () => {
        expect(mapped(5, undefined, 'rows.value')).toEqual({ rows: { value: 'v' } });
    });

    /**
     * Characterisation, NOT an endorsement: `indexVar` reaches `new RegExp`
     * unescaped, so `.` behaves as "any character" rather than a literal dot and
     * an unrelated path segment is rewritten. Pinned so that escaping it later
     * shows up here as a deliberate change rather than a silent one.
     */
    it('records that a metacharacter index-variable name is NOT escaped', () => {
        // indexVariable 'a.b' builds /\[a.b\]/, whose '.' matches the 'x' of 'axb',
        // so 'rows[axb]' is wrongly treated as the index slot.
        expect(mapped(1, 'a.b', 'rows[axb].value')).toEqual({ 'rows[1]': { value: 'v' } });
    });
});

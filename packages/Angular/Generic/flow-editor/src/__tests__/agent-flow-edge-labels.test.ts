/**
 * Edge labels on the agent flow canvas.
 *
 * An edge label answers exactly one question — **when is this path taken?** The rules below all
 * follow from that, and each of them replaces a behaviour that made a real graph unreadable: full
 * rationale prose rendered at any length, "Default" captioned on every unconditional arrow, and
 * exclusive precedence shown nowhere at all.
 */
import { describe, expect, it } from 'vitest';
import { AgentFlowTransformerService } from '../lib/agent-editor/agent-flow-transformer.service';
import type { MJAIAgentStepPathEntity } from '@memberjunction/core-entities';

/** A path row with only the fields the label logic reads. */
function path(over: Partial<MJAIAgentStepPathEntity> & { ID: string }): MJAIAgentStepPathEntity {
    return {
        OriginStepID: 'origin',
        DestinationStepID: 'dest',
        Condition: null,
        Description: null,
        Priority: 0,
        ...over,
    } as unknown as MJAIAgentStepPathEntity;
}

/** Reaches the private visual builder; it is the unit under test and has no public seam. */
function visualsFor(
    target: MJAIAgentStepPathEntity,
    siblings: MJAIAgentStepPathEntity[] = [target],
): { label?: string; labelDetail?: string; labelIcon?: string } {
    const svc = new AgentFlowTransformerService() as unknown as {
        buildPathVisuals(
            p: MJAIAgentStepPathEntity,
            hasCondition: boolean,
            isOnlyPath: boolean,
            hasAmbiguousAlways: boolean,
            rank: { position: number; total: number } | null,
        ): { label?: string; labelDetail?: string; labelIcon?: string };
        rankWithinGroup(
            p: MJAIAgentStepPathEntity,
            s: MJAIAgentStepPathEntity[],
        ): { position: number; total: number };
    };

    const hasCondition = !!target.Condition?.trim();
    const conditional = siblings.filter((s) => s.Condition && s.Condition.trim().length > 0);
    const unconditional = siblings.filter((s) => !s.Condition || !s.Condition.trim());
    const rank = hasCondition && conditional.length > 1 ? svc.rankWithinGroup(target, conditional) : null;

    return svc.buildPathVisuals(
        target,
        hasCondition,
        siblings.length === 1,
        !hasCondition && unconditional.length > 1,
        rank,
    );
}

describe('conditional edges show the RULE', () => {
    it('labels with the condition, not the author rationale', () => {
        const v = visualsFor(path({
            ID: 'p', Condition: 'payload.brandOK === true',
            Description: 'The winning branch when the draft passed. Higher priority so it is chosen when both conditions could be read as true.',
        }));

        // The description is prose of arbitrary length; rendering it always is what buried the
        // canvas under overlapping pills.
        expect(v.label).toContain('payload.brandOK === true');
        expect(v.label).not.toContain('winning branch');
    });

    it('keeps the full condition AND the rationale one hover away', () => {
        const v = visualsFor(path({
            ID: 'p', Condition: 'payload.brandOK === true', Description: 'Why this exists.',
        }));

        // Truncating a label is only safe if the whole thing is recoverable.
        expect(v.labelDetail).toContain('payload.brandOK === true');
        expect(v.labelDetail).toContain('Why this exists.');
    });

    it('truncates a long condition on a word boundary', () => {
        const long = 'payload.someVeryLongPropertyName === "a rather long literal value here"';
        const v = visualsFor(path({ ID: 'p', Condition: long }));

        expect(v.label!.length).toBeLessThanOrEqual(34);
        expect(v.label).toMatch(/…$/);
        expect(v.labelDetail).toContain(long);   // nothing is lost
    });
});

describe('unconditional edges say nothing', () => {
    it('emits no label for an ordinary path', () => {
        const v = visualsFor(path({ ID: 'p', Description: 'Feeds the records into the loop.' }));

        // A plain line already means "then". "Default" on every arrow is a caption on a diagram
        // saying "arrow" — and it was the bulk of the clutter, because most edges are unconditional.
        expect(v.label).toBeUndefined();
    });

    it('still carries the rationale on hover', () => {
        const v = visualsFor(path({ ID: 'p', Description: 'Feeds the records into the loop.' }));
        expect(v.labelDetail).toBe('Feeds the records into the loop.');
    });

    it('DOES label duplicate defaults, because that is a defect', () => {
        const a = path({ ID: 'a' });
        const b = path({ ID: 'b' });
        const v = visualsFor(a, [a, b]);

        // The one unconditional case worth shouting about: only the highest-priority one runs, and
        // the author needs to see that without hovering anything.
        expect(v.label).toBe('Duplicate default');
        expect(v.labelIcon).toBe('fa-triangle-exclamation');
    });
});

describe('exclusive precedence is visible', () => {
    it('ranks conditional siblings by priority, then sequence', () => {
        const win = path({ ID: 'win', Condition: 'a', Priority: 200 });
        const lose = path({ ID: 'lose', Condition: 'b', Priority: 100 });

        expect(visualsFor(win, [win, lose]).label).toMatch(/^1\/2 /);
        expect(visualsFor(lose, [win, lose]).label).toMatch(/^2\/2 /);
    });

    it('breaks a priority tie by ascending path ID, NOT by declaration order', () => {
        // Declared high-ID-first on purpose. `Priority` defaults to 0, so a tie is the COMMON case,
        // and this is exactly where a badge that sorted by array order would quietly disagree with
        // the engine — the compiler assigns TaskDependency.Sequence by ascending path ID, and a
        // path row has no Sequence column of its own to sort on.
        const zulu = path({ ID: 'zulu', Condition: 'a', Priority: 100 });
        const alpha = path({ ID: 'alpha', Condition: 'b', Priority: 100 });

        expect(visualsFor(alpha, [zulu, alpha]).label).toMatch(/^1\/2 /);
        expect(visualsFor(zulu, [zulu, alpha]).label).toMatch(/^2\/2 /);
    });

    it('explains the ordering on hover', () => {
        const win = path({ ID: 'win', Condition: 'a', Priority: 200 });
        const lose = path({ ID: 'lose', Condition: 'b', Priority: 100 });

        expect(visualsFor(win, [win, lose]).labelDetail).toContain('Checked 1st of 2');
    });

    it('omits the rank when a condition has no competing sibling', () => {
        // A lone conditional edge has no precedence to explain, and "1/1" would be noise.
        const v = visualsFor(path({ ID: 'p', Condition: 'payload.ok === true' }));
        expect(v.label).not.toMatch(/^\d\/\d /);
    });
});

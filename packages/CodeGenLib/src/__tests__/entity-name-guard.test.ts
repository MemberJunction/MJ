import { describe, it, expect, vi } from 'vitest';
import { AdvancedGeneration, isPlausibleEntityName } from '../Misc/advanced_generation';

/**
 * The AI entity-name path must never hand a non-name to the INSERT.
 *
 * Observed on a live runtime schema update: the model answered the entity-name prompt with `-1`.
 * The name became `-1`, the INSERT failed, the failure was swallowed, and eleven of twenty-seven
 * tables were simply absent while the step reported success. These tests pin the two guards that
 * now stand between the prompt and the INSERT.
 */

type Runner = (params: unknown) => Promise<unknown>;

function stub(ag: AdvancedGeneration, runner: Runner): void {
    const open = ag as unknown as {
        _promptRunner: { ExecutePrompt: Runner };
        featureEnabled: (name: string) => boolean;
        getPromptEntity: (name: string) => Promise<unknown>;
    };
    open._promptRunner = { ExecutePrompt: runner };
    open.featureEnabled = () => true;
    open.getPromptEntity = async () => ({ Name: 'CodeGen: Entity Name Generation' });
}

const USER = { ID: 'u' } as never;

describe('isPlausibleEntityName', () => {
    it.each([
        ['Attendees', true],
        ['Event Sessions', true],
        ['MJ: Company Integration Objects', true],
        ['Sessions__pheedloop', true],
        ['-1', false],
        ['0', false],
        ['', false],
        ['   ', false],
        ['A', false],
        ['X1', false],
        ['null', false],
        ['NULL', false],
        ['undefined', false],
        ['N/A', false],
        ['entityName', false],
        ['!!!', false]
    ])('%j → %s', (candidate, plausible) => {
        expect(isPlausibleEntityName(candidate)).toBe(plausible);
    });

    it('rejects non-strings and names wider than the column', () => {
        expect(isPlausibleEntityName(-1)).toBe(false);
        expect(isPlausibleEntityName(null)).toBe(false);
        expect(isPlausibleEntityName(undefined)).toBe(false);
        expect(isPlausibleEntityName({ entityName: 'Attendees' })).toBe(false);
        expect(isPlausibleEntityName('A'.repeat(256))).toBe(false);
        expect(isPlausibleEntityName('A'.repeat(255))).toBe(true);
    });
});

describe('AdvancedGeneration.generateEntityName', () => {
    it('returns the model answer when it is a name', async () => {
        const ag = new AdvancedGeneration();
        stub(ag, async () => ({ success: true, result: { entityName: 'Attendees', tableName: 'attendee' } }));
        await expect(ag.generateEntityName('attendee', USER)).resolves.toEqual({
            entityName: 'Attendees',
            tableName: 'attendee'
        });
    });

    it('returns null — the fallback signal — when the model answers with "-1"', async () => {
        const ag = new AdvancedGeneration();
        stub(ag, async () => ({ success: true, result: { entityName: '-1', tableName: 'attendee' } }));
        await expect(ag.generateEntityName('attendee', USER)).resolves.toBeNull();
    });

    it('returns null when the answer has no name at all', async () => {
        const ag = new AdvancedGeneration();
        stub(ag, async () => ({ success: true, result: { tableName: 'attendee' } }));
        await expect(ag.generateEntityName('attendee', USER)).resolves.toBeNull();
    });

    it('still returns null on a failed prompt', async () => {
        const ag = new AdvancedGeneration();
        const runner = vi.fn(async () => ({ success: false, errorMessage: 'provider down' }));
        stub(ag, runner);
        await expect(ag.generateEntityName('attendee', USER)).resolves.toBeNull();
        expect(runner).toHaveBeenCalledTimes(1);
    });
});

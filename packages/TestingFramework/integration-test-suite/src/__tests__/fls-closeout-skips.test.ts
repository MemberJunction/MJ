/**
 * A close-out check whose fixture is missing must be reported as SKIPPED. Returning early would be
 * scored as a pass, and the run would claim coverage it did not have (REST off, an older seed).
 */
import { describe, it, expect } from 'vitest';
import { IsCheckSkip } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { FlsCloseoutChecks } from '../checks/fls-closeout.checks';
import { FlsCloseoutPendingChecks } from '../checks/fls-closeout-pending.checks';
import { FlsCloseoutClientChecks } from '../checks/fls-closeout-client.checks';

/** A context with no FLS fixture provisioned: what a run against an unseeded database sees. */
const unseeded = {} as IntegrationCheckContext;

async function outcomeOf(check: NamedCheck): Promise<'passed' | 'skipped' | 'failed'> {
    try {
        await check.Fn(unseeded);
        return 'passed';
    } catch (e) {
        return IsCheckSkip(e) ? 'skipped' : 'failed';
    }
}

describe('FLS close-out bundles without their fixture', () => {
    const bundles: Array<[string, NamedCheck[]]> = [
        ['fls-closeout', FlsCloseoutChecks],
        ['fls-closeout-pending', FlsCloseoutPendingChecks],
        ['fls-closeout-client', FlsCloseoutClientChecks],
    ];
    for (const [name, checks] of bundles) {
        it(`${name}: every check reports SKIPPED, none passes`, async () => {
            const outcomes = await Promise.all(checks.map(async (c) => [c.Id, await outcomeOf(c)] as const));
            expect(outcomes.filter(([, o]) => o !== 'skipped')).toEqual([]);
        });
    }
});

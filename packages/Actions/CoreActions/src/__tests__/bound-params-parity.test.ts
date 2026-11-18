/**
 * Find Best Action and Find Candidate Actions hide an agent run's bound parameters with their own copy of the rule
 * (`BaseFindActionsAction.visibleParams`, kept inline so the action module does not load the agent runtime). This runs
 * identical inputs through that copy and through `@memberjunction/ai-agents`' `UnboundParams(params,
 * BindingsForAction(bound, actionID))`, and requires the same answer, so the two cannot drift apart silently.
 */
import { describe, it, expect } from 'vitest';
import type { BoundActionParams } from '@memberjunction/ai-core-plus';
import type { MJActionParamEntity } from '@memberjunction/core-entities';
import { BindingsForAction, UnboundParams } from '@memberjunction/ai-agents';
import { FindBestActionAction } from '../custom/ai/find-best-action.action';

const ACTION_ID = 'AAAAAAAA-1111-4111-8111-111111111111';
const OTHER_ACTION_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

function definition(name: string): MJActionParamEntity {
    return { Name: name } as MJActionParamEntity;
}

const DEFINITIONS: MJActionParamEntity[] = [definition('SpaceID'), definition('Query'), definition(' MaxResults '), definition('TenantID')];

const CASES: Array<[string, BoundActionParams | undefined]> = [
    ['no bindings', undefined],
    ['an empty binding map', {}],
    ['bindings for another action only', { [OTHER_ACTION_ID]: { SpaceID: 'space-1' } }],
    ['a binding in the same case', { [ACTION_ID]: { SpaceID: 'space-1' } }],
    ['a binding keyed by the action ID in lower case', { [ACTION_ID.toLowerCase()]: { tenantid: 'tenant-1' } }],
    ['names that differ in case and surrounding spaces', { [ACTION_ID]: { ' spaceid ': 'space-1', MAXRESULTS: 5 } }],
    ['an empty binding object for the action', { [ACTION_ID]: {} }],
    ['a binding to null', { [ACTION_ID]: { Query: null } }],
    ['a binding for a parameter the action does not have', { [ACTION_ID]: { Unknown: 'x' } }],
];

type VisibleParams = {
    visibleParams(definitions: MJActionParamEntity[], bound: BoundActionParams | undefined, actionID: string): MJActionParamEntity[];
};

describe('bound parameter hiding: Find Best Action agrees with the agent runtime', () => {
    const findActions = new FindBestActionAction() as unknown as VisibleParams;

    it.each(CASES)('%s', (_label, bound) => {
        const inline = findActions.visibleParams(DEFINITIONS, bound, ACTION_ID).map((p) => p.Name);
        const runtime = UnboundParams(DEFINITIONS, BindingsForAction(bound, ACTION_ID)).map((p) => p.Name);
        expect(inline).toEqual(runtime);
    });
});

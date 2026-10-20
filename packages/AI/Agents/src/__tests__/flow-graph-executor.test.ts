/**
 * `FormatFlowValidationErrors` — the validator's refusals of a compiled workflow, in its author's words.
 *
 * A compiled graph's tempIds are step IDs, so every ID in a message becomes that step's name. The
 * rename is one pass: a name written in is never searched again, so a step whose name happens to
 * contain another step's ID keeps its name.
 */
import { describe, it, expect, vi } from 'vitest';
import { TaskNode, type TaskGraphSpec } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: {} } }));

import { FormatFlowValidationErrors } from '../agent-types/flow-graph-executor';

const TRIAGE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const BILLING_ID = 'aaaaaaaa-0000-4000-8000-000000000002';

const spec = (billingName: string): TaskGraphSpec => ({
    workflowName: 'Support triage',
    tasks: [
        TaskNode.Agent({ tempId: TRIAGE_ID, name: 'Triage', description: '', dependsOn: [] }, { agentName: 'Triage Agent' }),
        TaskNode.Agent({ tempId: BILLING_ID, name: billingName, description: '', dependsOn: [TRIAGE_ID] }, { agentName: 'Billing Agent' }),
    ],
});

describe('FormatFlowValidationErrors', () => {
    it('names every step the message names by ID', () => {
        const text = FormatFlowValidationErrors(
            [{ Code: 'IncompleteFork', Message: `Exclusive group "${TRIAGE_ID}" has no path to "${BILLING_ID}".` }],
            spec('Billing'),
        );
        expect(text).toBe('[IncompleteFork] Exclusive group "Triage" has no path to "Billing".');
    });

    it('leaves a step name alone that contains another step\'s ID', () => {
        const text = FormatFlowValidationErrors(
            [{ Code: 'InvalidCondition', Message: `Task "${BILLING_ID}" reads "${TRIAGE_ID}".` }],
            spec(`Billing (after ${TRIAGE_ID})`),
        );
        expect(text).toBe(`[InvalidCondition] Task "Billing (after ${TRIAGE_ID})" reads "Triage".`);
    });

    it('matches an ID in either case', () => {
        const text = FormatFlowValidationErrors([{ Code: 'CycleDetected', Message: `Loop at ${TRIAGE_ID.toUpperCase()}.` }], spec('Billing'));
        expect(text).toBe('[CycleDetected] Loop at Triage.');
    });
});

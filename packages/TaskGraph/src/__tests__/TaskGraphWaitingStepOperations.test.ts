import { describe, expect, it } from 'vitest';
import type { WaitingStepRow } from '../waiting-steps';
import { ProviderHumanStepRefusal } from '../operations/TaskGraphWaitingStepOperations';

function step(stepType: string, human?: Record<string, unknown>): WaitingStepRow {
    return { StepType: stepType, Configuration: human ? JSON.stringify({ human }) : null };
}

describe('ProviderHumanStepRefusal', () => {
    it('refuses a Human step raised by a plugged-in provider', () => {
        expect(ProviderHumanStepRefusal(step('Human', { provider: 'BizAppsTasks' }))).toMatch(/another app/);
    });

    it('lets External steps and inbox Human steps through to the ordinary gate', () => {
        expect(ProviderHumanStepRefusal(step('External'))).toBeNull();
        expect(ProviderHumanStepRefusal(step('Human'))).toBeNull();
        expect(ProviderHumanStepRefusal(step('Human', { provider: 'AgentRequest' }))).toBeNull();
    });
});

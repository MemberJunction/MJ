import { describe, it, expect } from 'vitest';
import { ActionExecutionLogParams } from '../lib/custom/Actions/action-execution-log-params';

/**
 * The Action Execution Log form's parameter list must show a run's outputs. ActionEngine writes the
 * as-called inputs to `Params` and the final merged set (inputs + outputs) to `ResultParams`, so the
 * form reads `ResultParams` once the run has ended and `Params` while it is still running.
 */
describe('ActionExecutionLogParams.DisplayJSON', () => {
    const inputs = JSON.stringify([{ Name: 'RecordProcessID', Type: 'Input', Value: 'rp-1' }]);
    const merged = JSON.stringify([
        { Name: 'RecordProcessID', Type: 'Input', Value: 'rp-1' },
        { Name: 'Processed', Type: 'Output', Value: 1 },
    ]);

    it('shows the merged inputs + outputs of an ended run', () => {
        expect(ActionExecutionLogParams.DisplayJSON({ Params: inputs, ResultParams: merged })).toBe(merged);
    });

    it('shows the as-called inputs while the run has no result yet', () => {
        expect(ActionExecutionLogParams.DisplayJSON({ Params: inputs, ResultParams: null })).toBe(inputs);
        expect(ActionExecutionLogParams.DisplayJSON({ Params: inputs, ResultParams: '' })).toBe(inputs);
    });

    it('returns null when neither column holds anything', () => {
        expect(ActionExecutionLogParams.DisplayJSON({ Params: null, ResultParams: null })).toBeNull();
    });
});

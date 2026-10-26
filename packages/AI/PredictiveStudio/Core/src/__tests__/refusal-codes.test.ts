import { describe, it, expect } from 'vitest';
import { PredictiveStudioRefusalCodes } from '../refusal-codes';

describe('PredictiveStudioRefusalCodes.IsRefusal', () => {
  it('accepts every refusal code', () => {
    for (const code of PredictiveStudioRefusalCodes.All) expect(PredictiveStudioRefusalCodes.IsRefusal(code)).toBe(true);
    expect(PredictiveStudioRefusalCodes.IsRefusal('INVALID_EVALUATION_SETTING')).toBe(true);
  });

  it('rejects generic result codes, unknown codes and a missing code', () => {
    for (const code of ['EXECUTION_ERROR', 'FORBIDDEN', 'SUCCESS', 'read_cap_exceeded', '']) expect(PredictiveStudioRefusalCodes.IsRefusal(code)).toBe(false);
    expect(PredictiveStudioRefusalCodes.IsRefusal(undefined)).toBe(false);
  });
});

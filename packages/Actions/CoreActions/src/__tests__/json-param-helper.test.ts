import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @memberjunction/actions-base to provide the RunActionParams type
// without pulling in the full MJ framework.
// ---------------------------------------------------------------------------
vi.mock('@memberjunction/actions-base', () => {
  return {};
});

// ---------------------------------------------------------------------------
// Import the class under test
// ---------------------------------------------------------------------------
import { JSONParamHelper } from '../custom/utilities/json-param-helper';

/**
 * Helper to build a minimal RunActionParams-compatible object for testing.
 */
function makeParams(params: Array<{ Name: string; Value?: unknown; Type?: string }>) {
  return {
    Params: params.map((p) => ({
      Name: p.Name,
      Value: p.Value !== undefined ? p.Value : undefined,
      Type: p.Type || 'Input',
    })),
  };
}

// =====================================================================
// JSONParamHelper.getJSONParam
// =====================================================================
describe('JSONParamHelper.getJSONParam', () => {
  it('should return the object value when the object parameter is present', () => {
    const params = makeParams([{ Name: 'Requirements', Value: { minLength: 8 } }]);
    const result = JSONParamHelper.getJSONParam(params as never, 'Requirements');
    expect(result).toEqual({ minLength: 8 });
  });

  it('should parse and return the string parameter when object param is absent', () => {
    const params = makeParams([
      { Name: 'RequirementsString', Value: '{"minLength": 12}' },
    ]);
    const result = JSONParamHelper.getJSONParam(params as never, 'Requirements');
    expect(result).toEqual({ minLength: 12 });
  });

  it('should prefer the object parameter over the string parameter', () => {
    const params = makeParams([
      { Name: 'Requirements', Value: { fromObject: true } },
      { Name: 'RequirementsString', Value: '{"fromString": true}' },
    ]);
    const result = JSONParamHelper.getJSONParam(params as never, 'Requirements');
    expect(result).toEqual({ fromObject: true });
  });

  it('should return undefined when neither parameter exists', () => {
    const params = makeParams([{ Name: 'SomethingElse', Value: 'irrelevant' }]);
    const result = JSONParamHelper.getJSONParam(params as never, 'Requirements');
    expect(result).toBeUndefined();
  });

  it('should throw an error when string parameter contains invalid JSON', () => {
    const params = makeParams([
      { Name: 'RequirementsString', Value: 'not valid json' },
    ]);
    expect(() => JSONParamHelper.getJSONParam(params as never, 'Requirements')).toThrow(
      /Failed to parse/
    );
  });

  it('should be case-insensitive on parameter name matching', () => {
    const params = makeParams([{ Name: '  requirements  ', Value: { ok: true } }]);
    const result = JSONParamHelper.getJSONParam(params as never, 'Requirements');
    expect(result).toEqual({ ok: true });
  });

  it('should return numeric zero as a valid value (not skip it)', () => {
    const params = makeParams([{ Name: 'Count', Value: 0 }]);
    const result = JSONParamHelper.getJSONParam(params as never, 'Count');
    expect(result).toBe(0);
  });

  it('should return false as a valid value (not skip it)', () => {
    const params = makeParams([{ Name: 'Flag', Value: false }]);
    const result = JSONParamHelper.getJSONParam(params as never, 'Flag');
    expect(result).toBe(false);
  });

  it('should skip null values and fall through to string param', () => {
    const params = makeParams([
      { Name: 'Data', Value: null },
      { Name: 'DataString', Value: '{"fallback": true}' },
    ]);
    const result = JSONParamHelper.getJSONParam(params as never, 'Data');
    expect(result).toEqual({ fallback: true });
  });
});

// =====================================================================
// JSONParamHelper.hasJSONParam
// =====================================================================
describe('JSONParamHelper.hasJSONParam', () => {
  it('should return true when the object parameter exists', () => {
    const params = makeParams([{ Name: 'Config', Value: {} }]);
    expect(JSONParamHelper.hasJSONParam(params as never, 'Config')).toBe(true);
  });

  it('should return true when the string parameter exists', () => {
    const params = makeParams([{ Name: 'ConfigString', Value: '{}' }]);
    expect(JSONParamHelper.hasJSONParam(params as never, 'Config')).toBe(true);
  });

  it('should return false when neither parameter exists', () => {
    const params = makeParams([]);
    expect(JSONParamHelper.hasJSONParam(params as never, 'Config')).toBe(false);
  });

  it('should return false when parameter value is null', () => {
    const params = makeParams([{ Name: 'Config', Value: null }]);
    expect(JSONParamHelper.hasJSONParam(params as never, 'Config')).toBe(false);
  });

  it('should return false when parameter value is undefined', () => {
    const params = makeParams([{ Name: 'Config', Value: undefined }]);
    expect(JSONParamHelper.hasJSONParam(params as never, 'Config')).toBe(false);
  });
});

// =====================================================================
// JSONParamHelper.getRequiredJSONParam
// =====================================================================
describe('JSONParamHelper.getRequiredJSONParam', () => {
  it('should return the value when parameter exists', () => {
    const params = makeParams([{ Name: 'Schema', Value: { type: 'object' } }]);
    const result = JSONParamHelper.getRequiredJSONParam(params as never, 'Schema');
    expect(result).toEqual({ type: 'object' });
  });

  it('should throw an error when parameter is missing', () => {
    const params = makeParams([]);
    expect(() => JSONParamHelper.getRequiredJSONParam(params as never, 'Schema')).toThrow(
      /Schema parameter is required/
    );
  });

  it('should throw a helpful error message describing both param formats', () => {
    const params = makeParams([]);
    expect(() => JSONParamHelper.getRequiredJSONParam(params as never, 'MyParam')).toThrow(
      /MyParam object or MyParamString/
    );
  });
});

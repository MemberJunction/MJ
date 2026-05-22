import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Shared param-extraction helpers for the Phase 1 list Actions. Mirrors
 * the patterns the older list actions inline individually — extracted here
 * so the new actions stay small.
 */

export function getStringParam(params: RunActionParams, name: string): string | undefined {
  const param = params.Params.find((p) => p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input');
  return param?.Value != null ? String(param.Value) : undefined;
}

export function getBooleanParam(
  params: RunActionParams,
  name: string,
  defaultValue: boolean,
): boolean {
  const param = params.Params.find((p) => p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input');
  if (param?.Value == null) return defaultValue;
  const v = String(param.Value).toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

export function getJsonParam<T>(params: RunActionParams, name: string): T | undefined {
  const raw = getStringParam(params, name);
  if (raw == null || raw.trim().length === 0) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function addOutputParam(params: RunActionParams, name: string, value: unknown): void {
  params.Params.push({ Name: name, Type: 'Output', Value: value });
}

export function missingParam(name: string): ActionResultSimple {
  return {
    Success: false,
    ResultCode: 'MISSING_PARAMETER',
    Message: `'${name}' is required`,
  };
}

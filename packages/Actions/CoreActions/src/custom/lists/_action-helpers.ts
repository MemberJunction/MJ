import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Shared param-extraction helpers for the Phase 1 list Actions. Mirrors
 * the patterns the older list actions inline individually — extracted here
 * so the new actions stay small.
 */

export function GetStringParam(params: RunActionParams, name: string): string | undefined {
  const param = params.Params.find((p) => p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Input');
  return param?.Value != null ? String(param.Value) : undefined;
}

/** @deprecated Use {@link GetStringParam}. */
export function getStringParam(params: RunActionParams, name: string): string | undefined {
  return GetStringParam(params, name);
}

export function GetBooleanParam(
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

/** @deprecated Use {@link GetBooleanParam}. */
export function getBooleanParam(
  params: RunActionParams,
  name: string,
  defaultValue: boolean,
): boolean {
  return GetBooleanParam(params, name, defaultValue);
}

export function GetJsonParam<T>(params: RunActionParams, name: string): T | undefined {
  const raw = GetStringParam(params, name);
  if (raw == null || raw.trim().length === 0) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** @deprecated Use {@link GetJsonParam}. */
export function getJsonParam<T>(params: RunActionParams, name: string): T | undefined {
  return GetJsonParam(params, name);
}

export function AddOutputParam(params: RunActionParams, name: string, value: unknown): void {
  params.Params.push({ Name: name, Type: 'Output', Value: value });
}

/** @deprecated Use {@link AddOutputParam}. */
export function addOutputParam(params: RunActionParams, name: string, value: unknown): void {
  return AddOutputParam(params, name, value);
}

export function MissingParam(name: string): ActionResultSimple {
  return {
    Success: false,
    ResultCode: 'MISSING_PARAMETER',
    Message: `'${name}' is required`,
  };
}

/** @deprecated Use {@link MissingParam}. */
export function missingParam(name: string): ActionResultSimple {
  return MissingParam(name);
}

/**
 * Checks a caller-supplied record id before it is written as `ListDetail.RecordID`, which holds
 * the compact `CompositeKey` segment: the raw value for a single-column key, `F1|v1||F2|v2` for a
 * composite one (#4221). A bare value is kept for a single-column key; for a composite key a value
 * with no `|` cannot name the record, so it is refused.
 *
 * @param primaryKeyCount - the number of primary key fields of the list's entity
 * @returns an error message, or `null` when the id can be written as given
 */
export function ListRecordIDError(primaryKeyCount: number, recordId: string): string | null {
  if (recordId.trim().length === 0) {
    return 'Record ID is empty';
  }
  if (primaryKeyCount > 1 && !recordId.includes('|')) {
    return `Record ID '${recordId}' is a single value, but the list's entity has a ${primaryKeyCount}-field primary key; pass the compact key segment (Field1|value1||Field2|value2)`;
  }
  return null;
}

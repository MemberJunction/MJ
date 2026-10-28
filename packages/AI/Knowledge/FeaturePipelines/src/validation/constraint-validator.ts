/**
 * @fileoverview Runtime value constraint validation for feature pipeline outputs.
 * Enforces Layer 2 validation and handles OnViolation policies (fail, null, coerce-to-other).
 * @module @memberjunction/feature-pipelines
 */

import { GetValueAtPath } from '@memberjunction/global';
import type { ValueConstraint, ResolvedConstraint, ViolationPolicy } from '../spec/value-constraint.js';

export interface OutputValidationResult {
  valid: boolean;
  value: unknown;
  violationMessage?: string;
  violationPolicyApplied?: ViolationPolicy;
  coerced?: boolean;
}

export interface ValidationOptions {
  resolved?: ResolvedConstraint | null;
  targetFieldTSType?: string;
}

/**
 * Validates a single computed output value against its constraint and applies the declared violation policy.
 * A lookup value must match one of the constraint's loaded rows (`options.resolved.AllowedValues`), case-insensitively,
 * and is returned in the row's own form; without loaded rows only a non-empty identifier is required.
 */
export function ValidateOutputValue(
  rawValue: unknown,
  constraint: ValueConstraint,
  options?: ValidationOptions
): OutputValidationResult {
  const policy: ViolationPolicy = constraint.OnViolation ?? 'fail';

  if (rawValue === null || rawValue === undefined) {
    return { valid: true, value: rawValue };
  }

  switch (constraint.Type) {
    case 'enum':
      return validateEnum(rawValue, constraint, policy, options);

    case 'numeric':
      return validateNumeric(rawValue, constraint, policy, options);

    case 'money':
      return validateMoney(rawValue, constraint, policy, options);

    case 'boolean':
      return validateBoolean(rawValue, constraint, policy, options);

    case 'date':
      return validateDate(rawValue, constraint, policy);

    case 'freetext':
      return validateFreetext(rawValue, constraint, policy);

    case 'lookup':
      return validateLookup(rawValue, policy, options);

    default:
      return { valid: true, value: rawValue };
  }
}

/** @deprecated Use {@link ValidateOutputValue}. */
export function validateOutputValue(
  rawValue: unknown,
  constraint: ValueConstraint,
  options?: ValidationOptions
): OutputValidationResult {
  return ValidateOutputValue(rawValue, constraint, options);
}

/**
 * Validates each item of an array output at the constraint's `ItemRef` (one property of the item, e.g.
 * `$.JobFunctionID`) and writes each item's canonical value back onto it. `fail`: any invalid item fails the output,
 * naming every invalid value. `null`: an invalid item is dropped. `coerce-to-other`: an item replaced with a value is
 * kept with it, one that can only be replaced with null is dropped. Without an `ItemRef`, or for a non-array value,
 * this is {@link ValidateOutputValue}.
 */
export function ValidateOutputItems(rawValue: unknown, constraint: ValueConstraint, options?: ValidationOptions): OutputValidationResult {
  const itemRef = (constraint.Type === 'enum' || constraint.Type === 'lookup') ? constraint.ItemRef : undefined;
  if (!itemRef || !Array.isArray(rawValue)) {
    return ValidateOutputValue(rawValue, constraint, options);
  }
  const path = itemRef.replace(/^\$\.?/, '');
  const kept: unknown[] = [];
  const invalid: string[] = [];
  let changed = false;
  for (const item of rawValue) {
    const v = GetValueAtPath(item, path);
    const r = ValidateOutputValue(v, constraint, options);
    if (!r.valid || (r.violationPolicyApplied !== undefined && (r.value === null || r.value === undefined))) {
      invalid.push(v === null || v === undefined ? '(missing)' : String(v));
      continue;
    }
    changed ||= r.value !== v;
    kept.push(item !== null && typeof item === 'object' && !Array.isArray(item) ? { ...item, [path]: r.value } : r.value);
  }
  if (invalid.length === 0) {
    return { valid: true, value: kept, coerced: changed };
  }
  const message = `Items not allowed at ${itemRef}: ${invalid.join(', ')}.`;
  const policy = constraint.OnViolation || 'fail';
  return policy === 'fail'
    ? { valid: false, value: rawValue, violationMessage: message, violationPolicyApplied: 'fail' }
    : { valid: true, value: kept, violationMessage: message, violationPolicyApplied: policy, coerced: true };
}

/** A lookup output: a non-empty string or number that, when the constraint's rows are loaded, matches one of them. */
function validateLookup(rawValue: unknown, policy: ViolationPolicy, options?: ValidationOptions): OutputValidationResult {
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
    return applyPolicy(rawValue, policy, 'Lookup output must be a string or number identifier.');
  }
  const str = String(rawValue).trim();
  if (str.length === 0) {
    return applyPolicy(rawValue, policy, 'Lookup output must be a non-empty string identifier or name.');
  }
  const allowed = options?.resolved?.AllowedValues;
  if (allowed && allowed.length > 0) {
    const wanted = str.toLowerCase();
    const match = allowed.find((v) => v.toLowerCase() === wanted);
    if (match === undefined) {
      const what = `${options?.resolved?.RelatedEntityName || 'record'} ${options?.resolved?.LookupMatchField || ''}`.trim();
      return applyPolicy(rawValue, policy, `Value '${str}' does not match an existing ${what}.`);
    }
    return { valid: true, value: match, coerced: match !== rawValue };
  }
  return { valid: true, value: str };
}

function applyPolicy(
  rawValue: unknown,
  policy: ViolationPolicy,
  violationMessage: string,
  coercedValue: unknown = null
): OutputValidationResult {
  if (policy === 'fail') {
    return {
      valid: false,
      value: rawValue,
      violationMessage,
      violationPolicyApplied: 'fail',
    };
  }

  if (policy === 'null') {
    return {
      valid: true,
      value: null,
      violationMessage,
      violationPolicyApplied: 'null',
      coerced: true,
    };
  }

  if (policy === 'coerce-to-other') {
    return {
      valid: true,
      value: coercedValue ?? null,
      violationMessage,
      violationPolicyApplied: 'coerce-to-other',
      coerced: true,
    };
  }

  return {
    valid: false,
    value: rawValue,
    violationMessage,
    violationPolicyApplied: policy,
  };
}

function validateEnum(
  rawValue: unknown,
  constraint: ValueConstraint & { Type: 'enum' },
  policy: ViolationPolicy,
  options?: ValidationOptions
): OutputValidationResult {
  const allowed = options?.resolved?.AllowedValues ?? constraint.Values ?? [];
  if (allowed.length === 0) {
    const msg = `Enum constraint has no allowed values configured.`;
    return applyPolicy(rawValue, policy, msg, 'Other');
  }
  const strVal = String(rawValue).trim();

  // Find exact or case-insensitive match in allowed values
  const match = allowed.find(v => v.toLowerCase() === strVal.toLowerCase());
  if (match !== undefined) {
    return {
      valid: true,
      value: match, // Use exact casing from allowed set
      coerced: match !== rawValue,
    };
  }

  const allowedList = allowed.length > 0 ? allowed.join(', ') : 'none configured';
  const msg = `Value '${strVal}' is not in the allowed vocabulary: [${allowedList}].`;
  return applyPolicy(rawValue, policy, msg, 'Other');
}

function validateNumeric(
  rawValue: unknown,
  constraint: ValueConstraint & { Type: 'numeric' },
  policy: ViolationPolicy,
  options?: ValidationOptions
): OutputValidationResult {
  let numVal: number;

  if (typeof rawValue === 'number' && !isNaN(rawValue)) {
    numVal = rawValue;
  } else if (typeof rawValue === 'string') {
    // A numeric constraint rejects a string the model wrapped in quotes rather than coercing it silently,
    // unless the target field's own TSType says numeric (then it coerces).
    const targetIsNumeric = options?.targetFieldTSType?.toLowerCase() === 'number';
    if (!targetIsNumeric) {
      return applyPolicy(
        rawValue,
        policy,
        `Numeric constraint rejected quoted string value '${rawValue}'. Target column is not typed numeric.`
      );
    }
    const parsed = Number(rawValue.trim());
    if (isNaN(parsed)) {
      return applyPolicy(rawValue, policy, `String value '${rawValue}' cannot be parsed as a number.`);
    }
    if (!Number.isFinite(parsed)) {
      return applyPolicy(rawValue, policy, `String value '${rawValue}' cannot be parsed as a finite number.`);
    }
    numVal = parsed;
  } else {
    return applyPolicy(rawValue, policy, `Expected numeric value, received ${typeof rawValue}.`);
  }

  if (constraint.Integer && !Number.isInteger(numVal)) {
    return applyPolicy(numVal, policy, `Numeric value ${numVal} must be an integer.`);
  }

  if (constraint.Min !== undefined && numVal < constraint.Min) {
    return applyPolicy(numVal, policy, `Numeric value ${numVal} is less than minimum allowed (${constraint.Min}).`);
  }

  if (constraint.Max !== undefined && numVal > constraint.Max) {
    return applyPolicy(numVal, policy, `Numeric value ${numVal} is greater than maximum allowed (${constraint.Max}).`);
  }

  return {
    valid: true,
    value: numVal,
    coerced: typeof rawValue !== 'number',
  };
}

function validateMoney(
  rawValue: unknown,
  constraint: ValueConstraint & { Type: 'money' },
  policy: ViolationPolicy,
  options?: ValidationOptions
): OutputValidationResult {
  return validateNumeric(
    rawValue,
    { ...constraint, Type: 'numeric' },
    policy,
    options
  );
}

function validateBoolean(
  rawValue: unknown,
  constraint: ValueConstraint & { Type: 'boolean' },
  policy: ViolationPolicy,
  options?: ValidationOptions
): OutputValidationResult {
  if (typeof rawValue === 'boolean') {
    return { valid: true, value: rawValue };
  }

  const targetIsBoolean = options?.targetFieldTSType?.toLowerCase() === 'boolean';
  if (targetIsBoolean && typeof rawValue === 'string') {
    const lower = rawValue.trim().toLowerCase();
    if (lower === 'true' || lower === '1') {
      return { valid: true, value: true, coerced: true };
    }
    if (lower === 'false' || lower === '0') {
      return { valid: true, value: false, coerced: true };
    }
  }

  if (targetIsBoolean && typeof rawValue === 'number') {
    if (rawValue === 1) return { valid: true, value: true, coerced: true };
    if (rawValue === 0) return { valid: true, value: false, coerced: true };
  }

  return applyPolicy(rawValue, policy, `Expected boolean value, received '${String(rawValue)}'.`);
}

function validateDate(
  rawValue: unknown,
  constraint: ValueConstraint & { Type: 'date' },
  policy: ViolationPolicy
): OutputValidationResult {
  let dateObj: Date;

  if (rawValue instanceof Date) {
    dateObj = rawValue;
  } else if (typeof rawValue === 'string') {
    const parsed = Date.parse(rawValue);
    if (isNaN(parsed)) {
      return applyPolicy(rawValue, policy, `Value '${rawValue}' is not a valid date string.`);
    }
    dateObj = new Date(parsed);
  } else {
    return applyPolicy(rawValue, policy, `Expected date value, received ${typeof rawValue}.`);
  }

  const iso = dateObj.toISOString();

  if (constraint.Min) {
    const minDate = Date.parse(constraint.Min);
    if (!isNaN(minDate) && dateObj.getTime() < minDate) {
      return applyPolicy(rawValue, policy, `Date '${iso}' is before minimum allowed (${constraint.Min}).`);
    }
  }

  if (constraint.Max) {
    const maxDate = Date.parse(constraint.Max);
    if (!isNaN(maxDate) && dateObj.getTime() > maxDate) {
      return applyPolicy(rawValue, policy, `Date '${iso}' is after maximum allowed (${constraint.Max}).`);
    }
  }

  return {
    valid: true,
    value: typeof rawValue === 'string' ? rawValue : iso,
  };
}

function validateFreetext(
  rawValue: unknown,
  constraint: ValueConstraint & { Type: 'freetext' },
  policy: ViolationPolicy
): OutputValidationResult {
  const strVal = String(rawValue);

  if (constraint.MaxLength !== undefined && strVal.length > constraint.MaxLength) {
    return applyPolicy(
      rawValue,
      policy,
      `Text length (${strVal.length}) exceeds maximum allowed length of ${constraint.MaxLength}.`
    );
  }

  return { valid: true, value: strVal };
}

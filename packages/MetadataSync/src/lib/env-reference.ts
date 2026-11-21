/**
 * @fileoverview Parsing and checks for `@env:` references in metadata files.
 * @module env-reference
 */

import { METADATA_KEYWORDS } from '../constants/metadata-keywords';
import { MIN_MASKED_VALUE_LENGTH } from './env-display';

/** Matches `@env:VARIABLE`, with an optional `?optional` modifier. */
export const ENV_REFERENCE_PATTERN = /^@env:([^?]+)(\?optional)?$/;

/** A parsed `@env:` reference. */
export interface EnvReference {
  /** Name of the environment variable. */
  VariableName: string;
  /** True when the reference ends with `?optional`. */
  Optional: boolean;
}

/**
 * Parses an `@env:` reference.
 * @returns The parsed reference, or null when the value is not a valid `@env:` reference
 */
export function ParseEnvReference(value: unknown): EnvReference | null {
  if (typeof value !== 'string' || !value.startsWith(METADATA_KEYWORDS.ENV)) {
    return null;
  }
  const match = value.match(ENV_REFERENCE_PATTERN);
  if (!match) {
    return null;
  }
  return { VariableName: match[1], Optional: match[2] !== undefined };
}

/** True when an environment value is `true` or `1`, ignoring case and surrounding spaces. */
export function IsEnvFlagTrue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

/** Thrown when an `@env:VAR?optional` reference names a variable that is not set. */
export class OptionalEnvMissingError extends Error {
  public readonly VariableName: string;

  constructor(variableName: string) {
    super(`Optional environment variable not set: ${variableName}`);
    this.name = 'OptionalEnvMissingError';
    this.VariableName = variableName;
  }
}

/** Thrown when a non-optional `@env:` reference names a variable that is not set. Holds names only. */
export class EnvVariableNotSetError extends Error {
  public readonly VariableName: string;
  /**
   * The field that uses the reference, such as `fields.Description`, `primaryKey.ID` or
   * `collections.Lines[0].fields.Name` for a composition child, when known.
   */
  public readonly Field: string | undefined;
  /** The entity of the record that holds the field, when it is not the record push reports. */
  public readonly EntityName: string | undefined;

  constructor(variableName: string, field?: string, entityName?: string) {
    super(`Environment variable not found: ${variableName}`);
    this.name = 'EnvVariableNotSetError';
    this.VariableName = variableName;
    this.Field = field;
    this.EntityName = entityName;
  }

  /** The same error for the given field (and entity, when given). */
  ForField(field: string, entityName?: string): EnvVariableNotSetError {
    return new EnvVariableNotSetError(this.VariableName, field, entityName ?? this.EntityName);
  }

  /** The same error inside a composition path, such as `collections.Lines[0]`; an entity already named is kept. */
  Within(compositionPath: string, entityName: string | undefined): EnvVariableNotSetError {
    const field = this.Field ? `${compositionPath}.${this.Field}` : compositionPath;
    return new EnvVariableNotSetError(this.VariableName, field, this.EntityName ?? entityName);
  }
}

/** The warning push gives when it leaves out a field whose optional variable is not set. */
export function OptionalEnvSkipMessage(entityName: string, fieldName: string, variableName: string): string {
  return `${entityName}.${fieldName} was not pushed: optional variable ${variableName} is not set`;
}

/** How a kept `@env:` reference compares with the database value. */
export type EnvReferenceCheck = 'Match' | 'Drift' | 'Unset';

/** An `@env:` reference that pull writes back in place of the database value. */
export interface KeptEnvReference {
  /** The reference exactly as the existing file has it. */
  Reference: string;
  VariableName: string;
  Check: EnvReferenceCheck;
}

/**
 * Decides whether pull keeps an existing `@env:` reference instead of the database value.
 * The result never contains the variable's value.
 * @returns The reference to keep, or null when the existing value is not a valid `@env:` reference
 */
export function KeepEnvReference(
  existingValue: unknown,
  databaseValue: unknown,
  env: NodeJS.ProcessEnv = process.env
): KeptEnvReference | null {
  if (typeof existingValue !== 'string') {
    return null;
  }
  const reference = ParseEnvReference(existingValue);
  if (!reference) {
    return null;
  }
  const envValue = env[reference.VariableName];
  let check: EnvReferenceCheck = 'Unset';
  if (envValue !== undefined) {
    check = comparable(envValue) === comparable(databaseValue) ? 'Match' : 'Drift';
  }
  return { Reference: existingValue, VariableName: reference.VariableName, Check: check };
}

function comparable(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value).trim();
}

/** A JSON value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object or array. */
export type JsonContainer = JsonValue[] | { [key: string]: JsonValue };

/** True for a plain object or an array. */
export function IsJsonContainer(value: unknown): value is JsonContainer {
  if (Array.isArray(value)) {
    return true;
  }
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

/** True when an object or array holds a valid `@env:` string at any depth. */
export function HasNestedEnvReference(value: unknown): boolean {
  return IsJsonContainer(value) && containsEnvLeaf(value);
}

function containsEnvLeaf(value: unknown): boolean {
  if (typeof value === 'string') {
    return ParseEnvReference(value) !== null;
  }
  if (Array.isArray(value)) {
    return value.some(containsEnvLeaf);
  }
  if (IsJsonContainer(value)) {
    return Object.values(value).some(containsEnvLeaf);
  }
  return false;
}

/** One `@env:` reference inside a JSON field that pull keeps. Never holds a value. */
export interface KeptNestedEnvReference {
  /** Path inside the field: `auth.apiKey`, `items[2].token`, `["x.y"]`. */
  Path: string;
  /** The reference exactly as the existing file has it. */
  Reference: string;
  VariableName: string;
  Check: EnvReferenceCheck;
}

/** What pull writes for a JSON field that holds `@env:` references. */
export interface NestedEnvKeepResult {
  /** The database JSON with each kept reference put back, or the file value when `KeptFileValue` is true. */
  Value: JsonValue;
  Kept: KeptNestedEnvReference[];
  /**
   * True when the file value is kept as is: the database value is not a JSON object or array, or the
   * merged database JSON still held a referenced variable's trimmed value of 6 or more characters.
   */
  KeptFileValue: boolean;
  /**
   * Names of the variables whose value the merged database JSON still held, sorted. Not empty only
   * when `KeptFileValue` is true for this reason.
   */
  LeftValueVariables: string[];
}

/**
 * Keeps `@env:` references inside a JSON field. The database value decides the structure and every
 * other leaf. A reference is put back only at a path that also exists in the database value; arrays
 * match by index. When the merged JSON would still hold the value (6 or more characters) of a variable
 * that the existing value references, the existing value is kept as is.
 * @returns null when the existing value is not an object or array, or holds no valid `@env:` string
 */
export function KeepNestedEnvReferences(
  existingValue: unknown,
  databaseValue: unknown,
  env: NodeJS.ProcessEnv = process.env
): NestedEnvKeepResult | null {
  if (!IsJsonContainer(existingValue) || !containsEnvLeaf(existingValue)) {
    return null;
  }
  const parsed = parseJsonContainer(databaseValue);
  if (parsed === null) {
    return { Value: structuredClone(existingValue), Kept: [], KeptFileValue: true, LeftValueVariables: [] };
  }
  const value: JsonContainer = structuredClone(parsed);
  const kept: KeptNestedEnvReference[] = [];
  putBackReferences(existingValue, value, '', kept, env);
  const leftValueVariables = findLeftValueVariables(existingValue, value, env);
  if (leftValueVariables.length > 0) {
    return {
      Value: structuredClone(existingValue),
      Kept: [],
      KeptFileValue: true,
      LeftValueVariables: leftValueVariables,
    };
  }
  return { Value: value, Kept: kept, KeptFileValue: false, LeftValueVariables: [] };
}

/** Sorted names of the referenced variables whose value is still in the merged JSON. */
function findLeftValueVariables(existing: JsonContainer, merged: JsonContainer, env: NodeJS.ProcessEnv): string[] {
  const mergedText = JSON.stringify(merged);
  return [...collectEnvVariableNames(existing, new Set<string>())]
    .filter((name) => holdsEnvValue(mergedText, env[name]))
    .sort();
}

function collectEnvVariableNames(value: JsonValue, names: Set<string>): Set<string> {
  if (typeof value === 'string') {
    const reference = ParseEnvReference(value);
    if (reference) {
      names.add(reference.VariableName);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectEnvVariableNames(item, names));
  } else if (IsJsonContainer(value)) {
    Object.values(value).forEach((item) => collectEnvVariableNames(item, names));
  }
  return names;
}

/** Most JSON-escape levels the left-over check looks for (a JSON string inside a JSON string, and so on). */
const MAX_ESCAPE_LEVELS = 4;

/** True when the text holds the trimmed value, plain or JSON-escaped one or more times. */
function holdsEnvValue(text: string, envValue: string | undefined): boolean {
  const trimmed = envValue?.trim();
  if (!trimmed || trimmed.length < MIN_MASKED_VALUE_LENGTH) {
    return false;
  }
  let form = trimmed;
  for (let level = 0; level <= MAX_ESCAPE_LEVELS; level++) {
    if (text.includes(form)) {
      return true;
    }
    const escaped = JSON.stringify(form).slice(1, -1);
    if (escaped === form) {
      return false;
    }
    form = escaped;
  }
  return false;
}

function parseJsonContainer(value: unknown): JsonContainer | null {
  if (IsJsonContainer(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return IsJsonContainer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function putBackReferences(
  existing: JsonContainer,
  target: JsonContainer,
  path: string,
  kept: KeptNestedEnvReference[],
  env: NodeJS.ProcessEnv
): void {
  if (Array.isArray(existing)) {
    if (!Array.isArray(target)) {
      return;
    }
    const count = Math.min(existing.length, target.length);
    for (let i = 0; i < count; i++) {
      const reference = keepLeaf(existing[i], target[i], `${path}[${i}]`, kept, env);
      if (reference !== null) {
        target[i] = reference;
      }
    }
    return;
  }
  if (Array.isArray(target)) {
    return;
  }
  for (const [key, item] of Object.entries(existing)) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      continue;
    }
    const reference = keepLeaf(item, target[key], appendKey(path, key), kept, env);
    if (reference !== null) {
      target[key] = reference;
    }
  }
}

/** The reference to put at this path, or null. Walks into nested objects and arrays. */
function keepLeaf(
  existingItem: JsonValue,
  targetItem: JsonValue,
  path: string,
  kept: KeptNestedEnvReference[],
  env: NodeJS.ProcessEnv
): string | null {
  if (typeof existingItem === 'string') {
    const comparable = IsJsonContainer(targetItem) ? JSON.stringify(targetItem) : targetItem;
    const result = KeepEnvReference(existingItem, comparable, env);
    if (!result) {
      return null;
    }
    kept.push({ Path: path, Reference: result.Reference, VariableName: result.VariableName, Check: result.Check });
    return result.Reference;
  }
  if (IsJsonContainer(existingItem) && IsJsonContainer(targetItem)) {
    putBackReferences(existingItem, targetItem, path, kept, env);
  }
  return null;
}

function appendKey(path: string, key: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return path ? `${path}.${key}` : key;
  }
  return `${path}[${JSON.stringify(key)}]`;
}

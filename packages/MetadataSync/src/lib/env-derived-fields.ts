/**
 * @fileoverview Finds the values of the `@env:` references in an existing record file, so pull can
 * leave out a read-only field whose database value holds one of them (for example a key path that
 * the database builds from an env-sourced primary key).
 * @module env-derived-fields
 */
import type { EntityInfo } from '@memberjunction/core';
import type { RecordData } from './sync-engine';
import { MIN_MASKED_VALUE_LENGTH } from './env-display';
import { ParseEnvReference } from './env-reference';

/** A UUID text, in any case. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The value of one `@env:` reference in a record file. Never print `Value`. */
export interface EnvSourcedValue {
  VariableName: string;
  Value: string;
  /** True for a UUID value, which is compared without case. */
  IgnoreCase: boolean;
}

/**
 * The values of the set variables that the record file uses in `primaryKey` and anywhere in
 * `fields`. A non-UUID value shorter than 6 characters is left out, as in masking.
 */
export function EnvSourcedValuesOf(
  existing: RecordData | undefined,
  entityInfo: EntityInfo | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): EnvSourcedValue[] {
  if (!existing) {
    return [];
  }
  const values: EnvSourcedValue[] = [];
  for (const [keyName, keyValue] of Object.entries(existing.primaryKey ?? {})) {
    const isUuid = entityInfo?.Fields.find((f) => f.Name.toLowerCase() === keyName.toLowerCase())?.IsUniqueIdentifier === true;
    addValue(values, keyValue, isUuid, env);
  }
  for (const reference of envReferencesIn(existing.fields)) {
    addValue(values, reference, false, env);
  }
  return values;
}

/** The first env-sourced value that the database value holds, or undefined. */
export function FindEnvSourcedValue(databaseValue: unknown, values: ReadonlyArray<EnvSourcedValue>): EnvSourcedValue | undefined {
  if (values.length === 0 || databaseValue === null || databaseValue === undefined) {
    return undefined;
  }
  const text = typeof databaseValue === 'string' ? databaseValue : JSON.stringify(databaseValue);
  const lowerText = text.toLowerCase();
  return values.find((value) => (value.IgnoreCase ? lowerText.includes(value.Value.toLowerCase()) : text.includes(value.Value)));
}

function addValue(values: EnvSourcedValue[], reference: unknown, isUuid: boolean, env: NodeJS.ProcessEnv): void {
  const parsed = ParseEnvReference(reference);
  const value = parsed ? env[parsed.VariableName]?.trim() : undefined;
  if (!parsed || !value || (!isUuid && value.length < MIN_MASKED_VALUE_LENGTH)) {
    return;
  }
  values.push({ VariableName: parsed.VariableName, Value: value, IgnoreCase: isUuid || UUID_PATTERN.test(value) });
}

/** Every string in the value, at any depth, that is an `@env:` reference. */
function envReferencesIn(value: unknown): string[] {
  if (typeof value === 'string') {
    return ParseEnvReference(value) ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(envReferencesIn);
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(envReferencesIn);
  }
  return [];
}

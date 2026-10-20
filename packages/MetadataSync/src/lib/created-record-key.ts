/**
 * @fileoverview The primary key that push and watch write to the file of a record they created.
 * An env-sourced key field keeps the file's reference when the database kept the resolved value.
 * @module created-record-key
 */
import type { BaseEntity, EntityFieldInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { METADATA_KEYWORDS } from '../constants/metadata-keywords';
import type { EnvDisplayMask } from './env-display';
import { ParseEnvReference } from './env-reference';

/** One key field of a created record. */
export interface CreatedKeyField {
  /** The key field name, spelled as the entity spells it. */
  Name: string;
  /** The value to write to the file: the file's reference, or the saved value. */
  FileValue: unknown;
  /** The value the database saved. */
  SavedValue: unknown;
  /** True when the database kept the value the record had before the save. */
  KeptBySave: boolean;
}

/** A key field's value, found by exact name, or else by name without regard to case. */
export function KeyFieldValue(key: Record<string, unknown> | undefined, fieldName: string): unknown {
  if (!key) {
    return undefined;
  }
  if (fieldName in key) {
    return key[fieldName];
  }
  const lowerName = fieldName.toLowerCase();
  const match = Object.keys(key).find((name) => name.toLowerCase() === lowerName);
  return match === undefined ? undefined : key[match];
}

/** True for a file value that push resolves to another record's or a variable's value. */
export function IsKeyReference(value: unknown): value is string {
  return typeof value === 'string'
    && (ParseEnvReference(value) !== null || value.startsWith(METADATA_KEYWORDS.PARENT) || value.startsWith(METADATA_KEYWORDS.OWNER));
}

/**
 * True when a key field holds the same value. UUID keys match without regard to case; other string
 * keys match trimmed, as a fixed-width key is padded.
 */
export function SameKeyValue(keyField: EntityFieldInfo, saved: unknown, beforeSave: unknown): boolean {
  if (typeof saved === 'string' && typeof beforeSave === 'string') {
    return keyField.IsUniqueIdentifier ? UUIDsEqual(saved, beforeSave) : saved.trim() === beforeSave.trim();
  }
  return String(saved) === String(beforeSave);
}

/**
 * The key fields to write for a created record. The file value is read from `fileKey`, else from
 * `fileFields`, without regard to case. An env-sourced key field keeps that file value when it is a
 * reference and the database kept the value the field had before the save.
 */
export function CreatedRecordKeyFields(
  keyFields: readonly EntityFieldInfo[],
  entity: BaseEntity,
  keyBeforeSave: ReadonlyMap<string, unknown>,
  fileKey: Record<string, unknown> | undefined,
  fileFields: Record<string, unknown> | undefined,
  envMask: EnvDisplayMask
): CreatedKeyField[] {
  return keyFields.map((pk) => {
    const savedValue = entity.Get(pk.Name);
    const keptBySave = SameKeyValue(pk, savedValue, keyBeforeSave.get(pk.Name));
    const fileValue = KeyFieldValue(fileKey, pk.Name) ?? KeyFieldValue(fileFields, pk.Name);
    const keepReference = keptBySave && envMask.IsEnvField(pk.Name)
      && (IsKeyReference(fileValue) || (typeof fileValue === 'string' && fileValue.startsWith(METADATA_KEYWORDS.LOOKUP)));
    return { Name: pk.Name, FileValue: keepReference ? fileValue : savedValue, SavedValue: savedValue, KeptBySave: keptBySave };
  });
}

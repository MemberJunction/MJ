/**
 * @fileoverview Finds existing file records by a database primary key. An `@env:` key value is
 * replaced by its variable (trimmed) for the match, and UUID key fields are compared without case.
 * @module existing-record-index
 */
import type { EntityInfo } from '@memberjunction/core';
import type { RecordData } from './sync-engine';
import { CreatePrimaryKeyLookup, PrimaryKeyValues } from './record-primary-key';
import { ParseEnvReference } from './env-reference';

/** A primaryKey field whose `@env:` variable is not set. Never holds a value. */
export interface UnsetKeyVariable {
  VariableName: string;
  Field: string;
  /** File that holds the record, when known. */
  FilePath?: string;
}

/** One existing file record. */
export interface ExistingRecordEntry {
  Record: RecordData;
  /** File that holds the record, when known. */
  FilePath?: string;
  /** True when the file holds an array of records. */
  InArray?: boolean;
}

/** Thrown when a primaryKey `@env:` variable is not set, so pull cannot match the record. */
export class UnsetPrimaryKeyVariableError extends Error {
  public readonly Variables: ReadonlyArray<UnsetKeyVariable>;
  /** Entity whose key uses the variables. */
  public readonly EntityName: string;
  /** Entity the user pulls, when it differs from `EntityName`. */
  public readonly PulledEntityName?: string;

  constructor(entityName: string, variables: ReadonlyArray<UnsetKeyVariable>, pulledEntityName?: string) {
    const details = variables
      .map((v) => `${v.FilePath ? `${v.FilePath}: ` : ''}primaryKey field ${v.Field} uses @env:${v.VariableName}, which is not set`)
      .join('; ');
    const pulled = pulledEntityName && pulledEntityName !== entityName ? pulledEntityName : undefined;
    super(pulled ? `${details}. Set it to pull ${pulled}; the key belongs to ${entityName}.` : `${details}. Set it to pull ${entityName}.`);
    this.name = 'UnsetPrimaryKeyVariableError';
    this.Variables = variables;
    this.EntityName = entityName;
    this.PulledEntityName = pulled;
  }

  /** The same error with `filePath` on each variable that names no file, and the entity the user pulls. */
  InRecordFile(filePath: string | undefined, pulledEntityName: string): UnsetPrimaryKeyVariableError {
    const variables = this.Variables.map((v) => ({ ...v, FilePath: v.FilePath ?? filePath }));
    return new UnsetPrimaryKeyVariableError(this.EntityName, variables, pulledEntityName);
  }
}

function uuidKeyFields(entityInfo: EntityInfo | null | undefined): Set<string> {
  return new Set((entityInfo?.PrimaryKeys ?? []).filter((pk) => pk.IsUniqueIdentifier).map((pk) => pk.Name));
}

/** Existing file records, found by the database primary key. The first record wins for a repeated key. */
export class ExistingRecordIndex {
  private readonly byKey = new Map<string, ExistingRecordEntry>();
  private readonly unsetVariables: UnsetKeyVariable[] = [];
  private duplicates = 0;

  private constructor(
    private readonly uuidFields: ReadonlySet<string>,
    private readonly env: NodeJS.ProcessEnv
  ) {}

  /** Indexes the entries. Records without a primaryKey, or with an unset key variable, are not indexed. */
  static Build(
    entries: ReadonlyArray<ExistingRecordEntry>,
    entityInfo: EntityInfo | null | undefined,
    env: NodeJS.ProcessEnv = process.env
  ): ExistingRecordIndex {
    const index = new ExistingRecordIndex(uuidKeyFields(entityInfo), env);
    for (const entry of entries) {
      index.add(entry);
    }
    return index;
  }

  /** The lookup string of a record as the file writes it, for `FileWriteBatch` array updates. */
  static FileLookupOf(record: RecordData): string {
    return CreatePrimaryKeyLookup(record.primaryKey);
  }

  /** Key variables that are not set. The records that use them are not indexed. */
  get UnsetKeyVariables(): ReadonlyArray<UnsetKeyVariable> {
    return this.unsetVariables;
  }

  /** Number of records whose key repeats an earlier record's key. */
  get DuplicateCount(): number {
    return this.duplicates;
  }

  /** @throws UnsetPrimaryKeyVariableError when any key variable is not set */
  ThrowIfUnsetKeyVariables(entityName: string): void {
    if (this.unsetVariables.length > 0) {
      throw new UnsetPrimaryKeyVariableError(entityName, this.unsetVariables);
    }
  }

  /** The existing entry whose resolved key equals the database key, or undefined. */
  Find(databaseKey: PrimaryKeyValues): ExistingRecordEntry | undefined {
    return this.byKey.get(this.MatchKey(databaseKey));
  }

  /** The match string of a database key. */
  MatchKey(databaseKey: PrimaryKeyValues): string {
    const normalized: Record<string, string> = {};
    for (const [field, value] of Object.entries(databaseKey)) {
      normalized[field] = this.normalize(field, String(value));
    }
    return CreatePrimaryKeyLookup(normalized);
  }

  /** The match string of a file record's key, or null when the key is empty or a key variable is not set. */
  KeyOf(record: RecordData): string | null {
    const primaryKey = record.primaryKey;
    if (!primaryKey || Object.keys(primaryKey).length === 0) {
      return null;
    }
    const normalized: Record<string, string> = {};
    for (const [field, value] of Object.entries(primaryKey)) {
      const resolved = this.resolve(value);
      if (resolved === null) {
        return null;
      }
      normalized[field] = this.normalize(field, resolved);
    }
    return CreatePrimaryKeyLookup(normalized);
  }

  private add(entry: ExistingRecordEntry): void {
    const primaryKey = entry.Record?.primaryKey;
    if (!primaryKey || Object.keys(primaryKey).length === 0) {
      return;
    }
    let hasUnset = false;
    for (const [field, value] of Object.entries(primaryKey)) {
      const reference = ParseEnvReference(value);
      if (reference && this.env[reference.VariableName] === undefined) {
        this.unsetVariables.push({ VariableName: reference.VariableName, Field: field, FilePath: entry.FilePath });
        hasUnset = true;
      }
    }
    if (hasUnset) {
      return;
    }
    const key = this.KeyOf(entry.Record);
    if (key === null) {
      return;
    }
    if (this.byKey.has(key)) {
      this.duplicates++;
      return;
    }
    this.byKey.set(key, entry);
  }

  /** A file key value as text: the variable (trimmed) for `@env:`, the value otherwise; null when unusable. */
  private resolve(value: unknown): string | null {
    const reference = ParseEnvReference(value);
    if (reference) {
      const envValue = this.env[reference.VariableName];
      return envValue === undefined ? null : envValue.trim();
    }
    if (value === null || value === undefined) {
      return null;
    }
    return String(value);
  }

  /** Trimmed, as a fixed-width key is padded; UUID fields lowercased. */
  private normalize(field: string, value: string): string {
    const trimmed = value.trim();
    return this.uuidFields.has(field) ? trimmed.toLowerCase() : trimmed;
  }
}

/**
 * The primary key pull writes: the file's `@env:` value for each field whose variable (trimmed)
 * equals the database value, with UUID fields compared without case; the database value otherwise.
 */
export function KeepPrimaryKeyEnvReferences(
  fileKey: Record<string, unknown> | undefined,
  databaseKey: Record<string, unknown>,
  entityInfo: EntityInfo | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  if (!fileKey) {
    return databaseKey;
  }
  const uuidFields = uuidKeyFields(entityInfo);
  const result: Record<string, unknown> = { ...databaseKey };
  for (const [field, databaseValue] of Object.entries(databaseKey)) {
    const fileValue = fileKey[field];
    const reference = ParseEnvReference(fileValue);
    const envValue = reference ? env[reference.VariableName] : undefined;
    if (envValue === undefined || databaseValue === null || databaseValue === undefined) {
      continue;
    }
    const fromEnv = envValue.trim();
    const fromDatabase = String(databaseValue).trim();
    const equal = uuidFields.has(field) ? fromEnv.toLowerCase() === fromDatabase.toLowerCase() : fromEnv === fromDatabase;
    if (equal) {
      result[field] = fileValue;
    }
  }
  return result;
}

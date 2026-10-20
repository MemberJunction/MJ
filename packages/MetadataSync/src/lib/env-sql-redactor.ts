/**
 * @fileoverview Leaves the values of env-sourced fields out of the push SQL log.
 *
 * SQL Server saves set each parameter with one line: `SET @<CodeName>_<12 hex>[_n] = <literal>`.
 * For a registered field, that line is replaced with a comment. The variable is then NULL in the
 * recorded statement, so a replayed update keeps the target's value. A primary key cannot be left
 * out; it gives a warning. After the run, the written log is searched for the values of the
 * resolved variables. All messages name variables, never values.
 * @module env-sql-redactor
 */
import fs from 'fs';
import type { BaseEntity } from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { EnvDisplayMask } from './env-display';
import type { SyncEngine } from './sync-engine';

interface RedactedField {
  EntityName: string;
  FieldName: string;
  Sources: string;
  Pattern: RegExp;
  Matched: boolean;
}

interface RedactedPrimaryKey {
  Field: string;
  Variables: Set<string>;
}

/** Registrations made without a save-call hash, which match any 12-hex suffix. */
const ANY_SUFFIX = '';

/** The 12-hex save-call hash of a variable suffix in a statement (`_<hash>` or `_<hash>_<n>`). */
const SAVE_CALL_SUFFIX = /_([0-9a-fA-F]{12})(?![0-9a-fA-F])/g;

/** Replaces registered SET lines and gives names-only warnings for one push. */
export class EnvSqlRedactor {
  private readonly variables: ReadonlySet<string>;
  private readonly env: NodeJS.ProcessEnv;
  /** Registrations by save-call hash; `ANY_SUFFIX` holds those registered without a hash. */
  private readonly fieldsByHash = new Map<string, Map<string, RedactedField>>();
  private readonly primaryKeys = new Map<string, RedactedPrimaryKey>();
  private transformFailed = false;

  /** `variables` is read when `Warnings` runs, so a set that grows during the run can be passed. */
  constructor(variables: ReadonlySet<string>, env: NodeJS.ProcessEnv = process.env) {
    this.variables = variables;
    this.env = env;
  }

  /**
   * Registers a field whose value is in a save statement. With `saveCallHash` (the 12-hex
   * `GenericDatabaseProvider.SaveCallVariableHash` of the record), only the SET line of that save
   * call is replaced. Without it, the SET line of any save call with the same code name and literal
   * is replaced. A null or undefined value is not registered, because no SET line is written for it.
   * A registration stays for the whole push.
   */
  Register(
    entityName: string,
    fieldName: string,
    codeName: string,
    value: unknown,
    variableNames: ReadonlySet<string>,
    saveCallHash?: string
  ): void {
    const literals = sqlLiteralsOf(value);
    if (literals.length === 0) {
      return;
    }
    const hash = saveCallHash?.toLowerCase() ?? ANY_SUFFIX;
    const fields = this.fieldsForHash(hash);
    const key = [entityName, fieldName, codeName, ...literals].join('\u0000');
    if (fields.has(key)) {
      return;
    }
    fields.set(key, {
      EntityName: entityName,
      FieldName: fieldName,
      Sources: sourcesOf(variableNames),
      Pattern: setLinePattern(codeName, hash, literals),
      Matched: false,
    });
  }

  /** Registers an env-sourced primary key field. Its value stays in the log, so it gives a warning. */
  RegisterPrimaryKey(entityName: string, fieldName: string, variableNames: ReadonlySet<string>): void {
    const field = `${entityName}.${fieldName}`;
    const existing = this.primaryKeys.get(field);
    if (existing) {
      variableNames.forEach((name) => existing.Variables.add(name));
    } else {
      this.primaryKeys.set(field, { Field: field, Variables: new Set(variableNames) });
    }
  }

  /**
   * Registers the env-sourced fields that the save statement of `entity` holds. Each field is
   * registered at the IS-A level whose table holds it, with that level's save-call hash. A level's
   * statement holds every field when `fullRow` (a create or alwaysPush) or when its entity has no
   * generated update procedure (the full save SQL is logged); else only the changed fields.
   * Key fields give a warning. `envFields` keys are matched without regard to case. Call it right
   * before the save, so the hash uses the key values the provider hashes.
   */
  RegisterEntityFields(
    entity: BaseEntity,
    envFields: ReadonlyMap<string, ReadonlySet<string>> | undefined,
    fullRow: boolean
  ): void {
    if (!envFields || envFields.size === 0) {
      return;
    }
    const keyNames = new Set(entity.EntityInfo.PrimaryKeys.map((pk) => pk.Name));
    for (const [key, variables] of envFields) {
      const fieldName = entity.GetFieldByName(key)?.Name ?? key;
      if (keyNames.has(fieldName)) {
        this.RegisterPrimaryKey(entity.EntityInfo.Name, fieldName, variables);
        continue;
      }
      const level = owningLevel(entity, fieldName);
      const field = level.GetFieldByName(fieldName);
      const levelInfo = level.EntityInfo;
      const holdsField = fullRow || !levelInfo.spUpdateGenerated || fieldName in level.GetChangesSinceLastSave();
      if (field && holdsField) {
        const keyValues = level.PrimaryKey?.KeyValuePairs?.map((pair) => pair.Value) ?? [];
        const saveCallHash = GenericDatabaseProvider.SaveCallVariableHash(levelInfo.SchemaName, levelInfo.BaseTable, keyValues);
        this.Register(levelInfo.Name, fieldName, field.EntityFieldInfo.CodeName, level.Get(fieldName), variables, saveCallHash);
      }
    }
  }

  /**
   * The `SqlLoggingOptions.TransformStatement` function. It can run many times on the same text and
   * on text that is never written. It only marks fields as matched and never throws; on an
   * unexpected error it returns a comment in place of the statement.
   */
  readonly Transform = (sql: string): string => {
    try {
      return this.replaceSetLines(sql);
    } catch {
      this.transformFailed = true;
      return '-- Statement not logged: env values could not be left out';
    }
  };

  /** Names-only warnings for the SQL log at `sqlLogPath`. Reads the written log; never throws. */
  Warnings(sqlLogPath: string): string[] {
    const failure = this.transformFailed
      ? [`SQL log ${sqlLogPath}: env values could not be left out of a statement. Check the log before you share it.`]
      : [];
    return [
      ...failure,
      ...this.unmatchedFieldWarnings(sqlLogPath),
      ...this.primaryKeyWarnings(sqlLogPath),
      ...this.variableValueWarnings(sqlLogPath),
    ];
  }

  private fieldsForHash(hash: string): Map<string, RedactedField> {
    let fields = this.fieldsByHash.get(hash);
    if (!fields) {
      fields = new Map();
      this.fieldsByHash.set(hash, fields);
    }
    return fields;
  }

  /** The registrations that can match the statement: those of each suffix in it, and those without a hash. */
  private candidateFields(sql: string): RedactedField[] {
    const hashes = new Set<string>([ANY_SUFFIX]);
    for (const match of sql.matchAll(SAVE_CALL_SUFFIX)) {
      hashes.add(match[1].toLowerCase());
    }
    const candidates: RedactedField[] = [];
    for (const hash of hashes) {
      this.fieldsByHash.get(hash)?.forEach((field) => candidates.push(field));
    }
    return candidates;
  }

  private replaceSetLines(sql: string): string {
    if (this.fieldsByHash.size === 0) {
      return sql;
    }
    let result = sql;
    for (const field of this.candidateFields(sql)) {
      const comment = `-- ${field.EntityName}.${field.FieldName}: not recorded, value comes from ${field.Sources}`;
      const next = result.replace(field.Pattern, (_line: string, indent: string) => `${indent}${comment}`);
      if (next !== result) {
        field.Matched = true;
        result = next;
      }
    }
    return result;
  }

  private unmatchedFieldWarnings(sqlLogPath: string): string[] {
    return [...this.fieldsByHash.values()]
      .flatMap((fields) => [...fields.values()])
      .filter((field) => !field.Matched)
      .map(
        (field) =>
          `SQL log ${sqlLogPath}: the line for ${field.EntityName}.${field.FieldName} (from ${field.Sources}) was not found, so its value may be in the log. Check the log before you share it.`
      );
  }

  private primaryKeyWarnings(sqlLogPath: string): string[] {
    return [...this.primaryKeys.values()].map(
      (key) => `SQL log ${sqlLogPath}: ${key.Field} is a primary key from ${sourcesOf(key.Variables)}. The log holds its value. Check the log before you share it.`
    );
  }

  /**
   * For each resolved variable other than a key variable: a warning when its value is in the
   * written log, or when it is not set now and so cannot be checked.
   */
  private variableValueWarnings(sqlLogPath: string): string[] {
    const logText = readLog(sqlLogPath);
    if (logText === null) {
      return [`SQL log ${sqlLogPath}: the log could not be read to check for env values. Check the log before you share it.`];
    }
    const keyVariables = new Set<string>();
    this.primaryKeys.forEach((key) => key.Variables.forEach((name) => keyVariables.add(name)));
    const warnings: string[] = [];
    for (const name of [...this.variables].filter((variable) => !keyVariables.has(variable)).sort()) {
      if (this.env[name] === undefined) {
        warnings.push(`SQL log ${sqlLogPath}: @env:${name} is not set now, so the log could not be checked for its value. Check the log before you share it.`);
      } else if (valueIsInText(name, logText, this.env)) {
        warnings.push(`SQL log ${sqlLogPath}: the value of @env:${name} appears in the log. Check the log before you share it.`);
      }
    }
    return warnings;
  }
}

/** The IS-A level of `entity` whose table holds the field: walks up while a parent holds it. */
function owningLevel(entity: BaseEntity, fieldName: string): BaseEntity {
  let level = entity;
  while (level.ISAParent && level.EntityInfo.ParentEntityFieldNames?.has(fieldName)) {
    level = level.ISAParent;
  }
  return level;
}

/** The log text, or null when the file cannot be read. */
function readLog(sqlLogPath: string): string | null {
  try {
    return fs.readFileSync(sqlLogPath, 'utf8');
  } catch {
    return null;
  }
}

/** True when the variable's value is in the text, found with the same forms and length rule as `EnvDisplayMask.MaskText`. */
function valueIsInText(name: string, text: string, env: NodeJS.ProcessEnv): boolean {
  return EnvDisplayMask.ForVariables([name], env).MaskText(text) !== text;
}

/** `@env:A` or `@env:A, @env:B`, sorted. */
function sourcesOf(variableNames: ReadonlySet<string>): string {
  return [...variableNames].sort().map((name) => `@env:${name}`).join(', ');
}

/** The literal forms SQL Server writes for a value in a SET line. Empty when none can be matched. */
function sqlLiteralsOf(value: unknown): string[] {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? [] : [`'${value.toISOString()}'`];
  }
  if (typeof value === 'boolean') {
    return [value ? '1' : '0'];
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return [String(value)];
  }
  if (value !== null && typeof value === 'object') {
    return quotedLiterals(JSON.stringify(value));
  }
  if (typeof value !== 'string') {
    return [];
  }
  return [...quotedLiterals(value), ...stringValueLiterals(value)];
}

/** The number or bit literal forms of a string value that holds a number or a boolean. */
function stringValueLiterals(value: string): string[] {
  const trimmed = value.trim();
  const literals: string[] = [];
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    literals.push(trimmed);
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true') {
    literals.push('1');
  } else if (lower === 'false') {
    literals.push('0');
  }
  return literals;
}

function quotedLiterals(text: string): string[] {
  const escaped = text.replace(/'/g, "''");
  return [`N'${escaped}'`, `'${escaped}'`];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One whole `SET @<codeName>_<suffix>[_n] = <literal>` line; group 1 is the indent. The suffix is
 * the given hash, or any 12 hex when the hash is `ANY_SUFFIX`.
 */
function setLinePattern(codeName: string, hash: string, literals: string[]): RegExp {
  const alternatives = literals.map(escapeRegExp).join('|');
  const suffix = hash === ANY_SUFFIX ? '[0-9a-fA-F]{12}' : escapeRegExp(hash);
  return new RegExp(`^([ \\t]*)SET @${escapeRegExp(codeName)}_${suffix}(?:_\\d+)? = (?:${alternatives})[ \\t]*$`, 'gm');
}

/** The sync engine members an `EnvSqlLog` uses. */
type EnvSqlLogEngine = Pick<SyncEngine, 'BeforeLookupCreateSave' | 'ResolvedEnvVariables'>;

/**
 * The redactor of one open SQL log, with the `SyncEngine.BeforeLookupCreateSave` hook that registers
 * each record a `?create` lookup creates (with the full row, because a create writes every field).
 */
export class EnvSqlLog {
  public readonly Redactor: EnvSqlRedactor;
  private readonly engine: EnvSqlLogEngine;
  private readonly hook: NonNullable<SyncEngine['BeforeLookupCreateSave']>;

  /** Creates the redactor over the engine's resolved variables and sets the engine's hook. */
  constructor(engine: EnvSqlLogEngine) {
    this.engine = engine;
    this.Redactor = new EnvSqlRedactor(engine.ResolvedEnvVariables);
    this.hook = (created, envFields) => this.Redactor.RegisterEntityFields(created, envFields, true);
    engine.BeforeLookupCreateSave = this.hook;
  }

  /** Clears the engine's hook when it is still this log's hook. */
  Close(): void {
    if (this.engine.BeforeLookupCreateSave === this.hook) {
      this.engine.BeforeLookupCreateSave = null;
    }
  }
}

/**
 * Adds a field that was left out because its `?optional` variable is not set. The SQL log then
 * leaves the field's SET line out by name, as for an env-sourced field: a full-row save would
 * otherwise write the field's database value.
 */
export function AddSkippedOptionalEnvField(
  envFields: Map<string, Set<string>> | undefined,
  fieldName: string,
  variableName: string
): void {
  if (!envFields) {
    return;
  }
  const variables = envFields.get(fieldName) ?? new Set<string>();
  variables.add(variableName);
  envFields.set(fieldName, variables);
}

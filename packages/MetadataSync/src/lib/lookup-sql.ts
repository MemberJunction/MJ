/**
 * @fileoverview Writes `@lookup` values into the push SQL log as subqueries on the natural key
 * (#5626, #3619).
 *
 * A lookup resolves at push time to this database's ID. When the push is captured as a migration,
 * that literal ID matches nothing on a database whose row has another ID (one CodeGen created, or
 * one created before a baseline shipped), so an update is a silent no-op and an insert fails on a
 * foreign key. For a primary-key or foreign-key field whose value came from a `@lookup`, the logged
 * `SET @<Field>_<hash> = '<id>'` line is replaced with `SET @<Field>_<hash> = (SELECT …)` on the
 * lookup's criteria. Nested lookups nest. The subquery names the real schema; the logger's schema
 * placeholder rewrite runs after `TransformStatement` and turns it into a placeholder.
 *
 * Only SQL Server save statements have SET lines, so a PostgreSQL log keeps literal IDs.
 * @module lookup-sql
 */
import type { BaseEntity, EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { GetDialect, IsDateSQLType, IsUuidSQLType } from '@memberjunction/sql-dialect';
import { IsALevels, OwningLevel, SaveCallHashesIn, SetLinePattern, SqlLiteralsOf } from './sql-set-line';
import type { SyncEngine } from './sync-engine';

/** One `Field=Value` pair of a `@lookup`. A nested `@lookup` value keeps its own source. */
export interface LookupSqlCriterion {
  FieldName: string;
  /** The resolved value as text, or the source of a nested `@lookup`. */
  Value: string | LookupSqlSource;
}

/** What a `@lookup` matched on, kept so the SQL log can match on it too. */
export interface LookupSqlSource {
  /** The `@lookup:` text as written. */
  Expression: string;
  EntityName: string;
  Criteria: LookupSqlCriterion[];
  /** True when a criterion value (or a nested lookup's) came from `@env:`. */
  EnvSourced: boolean;
}

/** A built subquery (`Sql`), or why none could be built (`Problem`). Exactly one is set. */
export interface LookupSubquery {
  Sql?: string;
  Problem?: string;
}

/** Looks up entity metadata by name. */
export type EntityInfoLookup = (entityName: string) => EntityInfo | null | undefined;

/**
 * Builds `(SELECT [PK] FROM [schema].[BaseTable] WHERE …)` for a lookup source. Each criterion is
 * matched with `=` on the entity's own table. A string criterion compares both sides lower-cased,
 * as the push lookup does, so the replay finds the same row whatever the column's collation (a
 * case-sensitive SQL Server column, or PostgreSQL once converted). `null` matches `IS NULL`. A criterion must be a column of the entity's
 * own table: a virtual field or one an IS-A parent holds has no column there.
 */
export class LookupSubqueryBuilder {
  private readonly entityInfo: EntityInfoLookup;

  constructor(entityInfo: EntityInfoLookup) {
    this.entityInfo = entityInfo;
  }

  Build(source: LookupSqlSource): LookupSubquery {
    if (source.EnvSourced) {
      return { Problem: 'its @lookup criteria use an @env value, which the log never holds' };
    }
    const info = this.entityInfo(source.EntityName);
    if (!info) {
      return { Problem: `entity '${source.EntityName}' was not found` };
    }
    if (info.PrimaryKeys.length !== 1) {
      return { Problem: `'${source.EntityName}' does not have a single-column primary key` };
    }
    if (source.Criteria.length === 0) {
      return { Problem: 'the @lookup has no criteria' };
    }
    const conditions: string[] = [];
    for (const criterion of source.Criteria) {
      const condition = this.condition(info, criterion);
      if (condition.Problem !== undefined) {
        return condition;
      }
      conditions.push(condition.Sql);
    }
    const key = info.FirstPrimaryKey.Name; // first-pk-ok: a single-column key was checked above; a lookup yields one value
    return { Sql: `(SELECT [${key}] FROM [${info.SchemaName}].[${info.BaseTable}] WHERE ${conditions.join(' AND ')})` };
  }

  private condition(info: EntityInfo, criterion: LookupSqlCriterion): LookupSubquery {
    const wanted = criterion.FieldName.trim().toLowerCase();
    const field = info.Fields.find((candidate) => candidate.Name.toLowerCase() === wanted);
    if (!field) {
      return { Problem: `'${info.Name}' has no field '${criterion.FieldName}'` };
    }
    if (field.IsVirtual || info.ParentEntityFieldNames?.has(field.Name)) {
      return { Problem: `${info.Name}.${field.Name} is not a column of table ${info.BaseTable}` };
    }
    if (typeof criterion.Value !== 'string') {
      const nested = this.Build(criterion.Value);
      return nested.Problem !== undefined ? nested : { Sql: `[${field.Name}] = ${nested.Sql}` };
    }
    if (criterion.Value.trim().toLowerCase() === 'null') {
      return { Sql: `[${field.Name}] IS NULL` };
    }
    const literal = criterionLiteral(field, criterion.Value);
    if (literal === null) {
      return { Problem: `the value of ${info.Name}.${field.Name} cannot be written as a ${field.Type} literal` };
    }
    return { Sql: criterionComparison(field, `[${field.Name}]`, literal) };
  }
}

/** The SQL Server dialect: the log holds SQL Server statements, and the converter carries them to PostgreSQL. */
const LOG_DIALECT = GetDialect('sqlserver');

/**
 * `column = literal`, lower-casing both sides for a string field, as `SyncEngine`'s push lookup
 * does. A uuid or date field is compared as is: PostgreSQL has no `lower(uuid)`, and one failing
 * statement aborts the whole replay.
 */
function criterionComparison(field: EntityFieldInfo, column: string, literal: string): string {
  const isString = field.NeedsQuotes && !IsUuidSQLType(field.Type) && !IsDateSQLType(field.Type);
  return isString ? `${LOG_DIALECT.LowerCase(column)} = ${LOG_DIALECT.LowerCase(literal)}` : `${column} = ${literal}`;
}

/** The SQL Server literal for a criterion value, or null when the value does not fit the field type. */
function criterionLiteral(field: EntityFieldInfo, value: string): string | null {
  const escaped = value.replace(/'/g, "''");
  if (!field.NeedsQuotes) {
    const type = field.Type.trim().toLowerCase();
    const lower = value.trim().toLowerCase();
    if (type === 'bit' || type === 'boolean') {
      if (lower === 'true' || lower === '1') {
        return '1';
      }
      if (lower === 'false' || lower === '0') {
        return '0';
      }
      return null;
    }
    return /^-?\d+(\.\d+)?$/.test(value.trim()) ? value.trim() : null;
  }
  if (IsUuidSQLType(field.Type) || IsDateSQLType(field.Type)) {
    return `'${escaped}'`;
  }
  return `N'${escaped}'`;
}

interface LookupSetLine {
  Pattern: RegExp;
  Subquery: string;
}

/**
 * Replaces the logged SET lines of lookup-sourced fields with subqueries, for one push. Registrations
 * are keyed by the save-call hash of the record (`GenericDatabaseProvider.SaveCallVariableHash`), so
 * only the SET line of that record's save is rewritten. A registration stays for the whole push.
 */
export class LookupSqlRewriter {
  private readonly builder: LookupSubqueryBuilder;
  private readonly linesByHash = new Map<string, Map<string, LookupSetLine>>();
  private readonly warnings = new Set<string>();

  constructor(builder: LookupSubqueryBuilder) {
    this.builder = builder;
  }

  /**
   * Registers one field of one save call. `value` is the resolved ID the statement holds. Returns
   * false (and keeps a warning) when no subquery can be built, so the log keeps the literal ID.
   */
  Register(entityName: string, fieldName: string, codeName: string, value: unknown, lookup: LookupSqlSource, saveCallHash: string): boolean {
    const literals = SqlLiteralsOf(value);
    if (literals.length === 0) {
      return false;
    }
    const subquery = this.builder.Build(lookup);
    if (subquery.Problem !== undefined || subquery.Sql === undefined) {
      this.warnings.add(
        `SQL log: ${entityName}.${fieldName} is written with this database's ID because ${subquery.Problem} (${lookup.Expression}). A database where that row has another ID will not match it.`
      );
      return false;
    }
    const hash = saveCallHash.toLowerCase();
    let lines = this.linesByHash.get(hash);
    if (!lines) {
      lines = new Map();
      this.linesByHash.set(hash, lines);
    }
    const key = [codeName, ...literals].join('\u0000');
    // Case-insensitive: SQL Server returns upper-case UUIDs where a lookup can return either case
    lines.set(key, { Pattern: SetLinePattern(codeName, hash, literals, 'gmi'), Subquery: subquery.Sql });
    return true;
  }

  /**
   * Registers each lookup-sourced field of the save statement of `entity`. A primary key is
   * registered at every IS-A level, because each level's save sets it; another field at the level
   * whose table holds it. Call it right before the save, so the hash uses the key values the
   * provider hashes. `lookups` keys are matched without regard to case.
   */
  RegisterEntityLookups(entity: BaseEntity, lookups: ReadonlyMap<string, LookupSqlSource> | undefined): void {
    if (!lookups || lookups.size === 0) {
      return;
    }
    const keyNames = new Set(entity.EntityInfo.PrimaryKeys.map((pk) => pk.Name));
    for (const [key, lookup] of lookups) {
      const fieldName = entity.GetFieldByName(key)?.Name;
      if (!fieldName) {
        continue;
      }
      const levels = keyNames.has(fieldName) ? IsALevels(entity) : [OwningLevel(entity, fieldName)];
      for (const level of levels) {
        this.registerLevelField(level, fieldName, lookup);
      }
    }
  }

  /**
   * Registers the primary key of a record that a `@lookup:…?create` made, keyed by the lookup that
   * made it, and keeps a warning: where no row matches, the replay passes a NULL ID, so the
   * `IF NOT EXISTS` guard inserts the row with an ID that database generates.
   */
  RegisterLookupCreate(created: BaseEntity, lookup: LookupSqlSource): void {
    if (created.EntityInfo.PrimaryKeys.length !== 1) {
      return;
    }
    // Criteria that were lookups themselves are foreign keys the create sets: they nest too
    const nested = new Map<string, LookupSqlSource>();
    for (const criterion of lookup.Criteria) {
      if (typeof criterion.Value !== 'string') {
        nested.set(criterion.FieldName, criterion.Value);
      }
    }
    this.RegisterEntityLookups(created, nested);
    const keyName = created.EntityInfo.FirstPrimaryKey.Name; // first-pk-ok: a single-column key was checked above
    let registered = false;
    for (const level of IsALevels(created)) {
      registered = this.registerLevelField(level, keyName, lookup) || registered;
    }
    if (registered) {
      this.warnings.add(
        `SQL log: the ${created.EntityInfo.Name} row that ${lookup.Expression} created is logged keyed by that lookup. On a database with no matching row the replay passes a NULL ID, so the IF NOT EXISTS guard inserts the row with an ID that database generates.`
      );
    }
  }

  /**
   * The `SqlLoggingOptions.TransformStatement` function. It can run many times on the same text and
   * on text that is never written. On an unexpected error it returns the text unchanged, so the log
   * keeps the literal IDs, and keeps a warning.
   */
  readonly Transform = (sql: string): string => {
    try {
      return this.replaceSetLines(sql);
    } catch {
      this.warnings.add('SQL log: a statement kept its literal lookup IDs because the rewrite to subqueries failed.');
      return sql;
    }
  };

  /** The warnings of this run, each once. */
  Warnings(): string[] {
    return [...this.warnings];
  }

  private registerLevelField(level: BaseEntity, fieldName: string, lookup: LookupSqlSource): boolean {
    const field = level.GetFieldByName(fieldName);
    if (!field) {
      return false;
    }
    const levelInfo = level.EntityInfo;
    const keyValues = level.PrimaryKey?.KeyValuePairs?.map((pair) => pair.Value) ?? [];
    const saveCallHash = GenericDatabaseProvider.SaveCallVariableHash(levelInfo.SchemaName, levelInfo.BaseTable, keyValues);
    return this.Register(levelInfo.Name, fieldName, field.EntityFieldInfo.CodeName, level.Get(fieldName), lookup, saveCallHash);
  }

  private replaceSetLines(sql: string): string {
    if (this.linesByHash.size === 0) {
      return sql;
    }
    let result = sql;
    for (const hash of SaveCallHashesIn(sql)) {
      for (const line of this.linesByHash.get(hash)?.values() ?? []) {
        result = result.replace(line.Pattern, (_line: string, indent: string, variable: string) => `${indent}SET ${variable} = ${line.Subquery}`);
      }
    }
    return result;
  }
}

/** The sync engine members a `LookupSqlLog` uses. */
type LookupSqlLogEngine = Pick<SyncEngine, 'BeforeLookupCreateSaveSource' | 'GetEntityInfo'>;

/**
 * The lookup rewriter of one open SQL log, with the `SyncEngine.BeforeLookupCreateSaveSource` hook
 * that registers each record a `?create` lookup makes.
 */
export class LookupSqlLog {
  public readonly Rewriter: LookupSqlRewriter;
  private readonly engine: LookupSqlLogEngine;
  private readonly hook: NonNullable<SyncEngine['BeforeLookupCreateSaveSource']>;

  constructor(engine: LookupSqlLogEngine) {
    this.engine = engine;
    this.Rewriter = new LookupSqlRewriter(new LookupSubqueryBuilder((name) => engine.GetEntityInfo(name)));
    this.hook = (created, lookup) => this.Rewriter.RegisterLookupCreate(created, lookup);
    engine.BeforeLookupCreateSaveSource = this.hook;
  }

  /** Clears the engine's hook when it is still this log's hook. */
  Close(): void {
    if (this.engine.BeforeLookupCreateSaveSource === this.hook) {
      this.engine.BeforeLookupCreateSaveSource = null;
    }
  }
}

/** One `TransformStatement` that runs each transform in turn. */
export function ComposeStatementTransforms(...transforms: Array<(sql: string) => string>): (sql: string) => string {
  return (sql: string) => transforms.reduce((text, transform) => transform(text), sql);
}

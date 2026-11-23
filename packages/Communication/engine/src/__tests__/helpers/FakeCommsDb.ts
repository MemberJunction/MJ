import { randomUUID } from 'node:crypto';
import { BaseEntity, BaseEntityResult, IMetadataProvider, IRunViewProvider, RunViewParams, RunViewResult } from '@memberjunction/core';

/**
 * In-memory stand-in for the MemberJunction data layer, shaped like the real one:
 *
 * - `RunView` never throws. A failed read comes back as `{ Success: false, ErrorMessage }`.
 * - `Save()` / `Delete()` return booleans and report through `LatestResult.CompleteMessage`.
 * - Every `RunView` hands out NEW entity objects built from the stored row, so an unsaved
 *   in-memory mutation is never visible to another reader (exactly like the database).
 * - The CHECK / UNIQUE constraints of the Communications V2 schema
 *   (`migrations/v6/V202611231029__v6.3.x__Communications_V2_Schema.sql`) are enforced on save.
 * - `uniqueidentifier` columns read back upper-case, the way SQL Server returns them.
 * - String comparison in filters is case-insensitive (`SQL_Latin1_General_CP1_CI_AS`).
 *
 * Every path has a failure mode: {@link FakeCommsDb.FailRunView}, {@link FakeCommsDb.FailSave},
 * {@link FakeCommsDb.FailDelete} and {@link FakeCommsDb.OnceBeforeSave} (to stage a concurrent writer).
 */

export type FakeFieldValue = string | number | boolean | Date | null;
export type FakeRow = Record<string, FakeFieldValue>;

export interface FailureOptions<TSubject> {
  /** Error text reported through `ErrorMessage` / `LatestResult.CompleteMessage`. */
  Message?: string;
  /** How many matching operations fail before the rule expires. Default: unlimited. */
  Times?: number;
  /** Restrict the failure to matching operations. Default: every operation on the entity. */
  When?: (subject: TSubject) => boolean;
}

export interface SaveAttempt {
  EntityName: string;
  Row: FakeRow;
  IsNew: boolean;
  Accepted: boolean;
  Message: string;
}

interface FailureRule<TSubject> {
  EntityName: string;
  Message: string;
  Remaining: number;
  When?: (subject: TSubject) => boolean;
}

type EntityControls = Pick<BaseEntity, 'Save' | 'Delete' | 'GetAll' | 'LatestResult'>;
type ConstraintCheck = (row: FakeRow, others: FakeRow[]) => string | null;
type RowPredicate = (row: FakeRow, now: Date) => boolean;

const CONTROL_MEMBERS = new Set(['Save', 'Delete', 'GetAll', 'LatestResult']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Columns whose names look like keys but are nvarchar in the schema, so they keep their casing. */
const NVARCHAR_KEY_COLUMNS = new Set(['RecordID', 'ProviderMessageID', 'ProviderEventID']);

// ---------------------------------------------------------------------------
// ExtraFilter evaluation (the subset of T-SQL the Communications engine emits)
// ---------------------------------------------------------------------------

interface FilterToken {
  Kind: 'string' | 'number' | 'word' | 'symbol';
  Text: string;
}

type FilterLiteral = string | number | 'NOW';

function tokenizeFilter(filter: string): FilterToken[] {
  const tokens: FilterToken[] = [];
  const pattern = /\s*(?:('(?:[^']|'')*')|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(<=|>=|<>|!=|[=<>(),]))/y;
  let position = 0;
  while (position < filter.length) {
    if (filter.slice(position).trim().length === 0) break;
    pattern.lastIndex = position;
    const match = pattern.exec(filter);
    if (!match) {
      throw new Error(`FakeCommsDb cannot tokenize ExtraFilter at ${position}: ${filter}`);
    }
    position = pattern.lastIndex;
    if (match[1] !== undefined) {
      tokens.push({ Kind: 'string', Text: match[1].slice(1, -1).replace(/''/g, "'") });
    } else if (match[2] !== undefined) {
      tokens.push({ Kind: 'number', Text: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ Kind: 'word', Text: match[3] });
    } else {
      tokens.push({ Kind: 'symbol', Text: match[4] });
    }
  }
  return tokens;
}

function compareValues(actual: FakeFieldValue | undefined, literal: FilterLiteral, now: Date): number | null {
  if (actual === null || actual === undefined) return null;
  if (actual instanceof Date) {
    const other = literal === 'NOW' ? now : new Date(literal);
    return Math.sign(actual.getTime() - other.getTime());
  }
  if (typeof actual === 'boolean') {
    return Math.sign((actual ? 1 : 0) - Number(literal));
  }
  if (typeof actual === 'number') {
    return Math.sign(actual - Number(literal));
  }
  const left = actual.toLowerCase();
  const right = String(literal).toLowerCase();
  return left === right ? 0 : left < right ? -1 : 1;
}

function comparisonHolds(operator: string, ordering: number | null): boolean {
  if (ordering === null) return false; // NULL never satisfies a comparison
  switch (operator) {
    case '=':
      return ordering === 0;
    case '<>':
    case '!=':
      return ordering !== 0;
    case '<':
      return ordering < 0;
    case '<=':
      return ordering <= 0;
    case '>':
      return ordering > 0;
    case '>=':
      return ordering >= 0;
    default:
      throw new Error(`FakeCommsDb does not support operator '${operator}'`);
  }
}

class FilterParser {
  private index = 0;

  constructor(
    private readonly tokens: FilterToken[],
    private readonly source: string,
  ) {}

  public Parse(): RowPredicate {
    const predicate = this.parseOr();
    if (this.index < this.tokens.length) {
      throw this.fail(`unexpected '${this.tokens[this.index].Text}'`);
    }
    return predicate;
  }

  private parseOr(): RowPredicate {
    const branches = [this.parseAnd()];
    while (this.acceptWord('OR')) {
      branches.push(this.parseAnd());
    }
    return (row, now) => branches.some((branch) => branch(row, now));
  }

  private parseAnd(): RowPredicate {
    const branches = [this.parseTerm()];
    while (this.acceptWord('AND')) {
      branches.push(this.parseTerm());
    }
    return (row, now) => branches.every((branch) => branch(row, now));
  }

  private parseTerm(): RowPredicate {
    if (this.acceptSymbol('(')) {
      const inner = this.parseOr();
      this.expectSymbol(')');
      return inner;
    }
    const field = this.next();
    if (field.Kind !== 'word') {
      throw this.fail(`expected a column name, found '${field.Text}'`);
    }
    if (this.acceptWord('IS')) {
      const negated = this.acceptWord('NOT');
      this.expectWord('NULL');
      return (row) => (row[field.Text] === null || row[field.Text] === undefined) !== negated;
    }
    if (this.acceptWord('IN')) {
      return this.parseInList(field.Text);
    }
    const operator = this.next();
    if (operator.Kind !== 'symbol') {
      throw this.fail(`expected an operator after '${field.Text}'`);
    }
    const literal = this.parseLiteral();
    return (row, now) => comparisonHolds(operator.Text, compareValues(row[field.Text], literal, now));
  }

  private parseInList(field: string): RowPredicate {
    this.expectSymbol('(');
    const literals: FilterLiteral[] = [this.parseLiteral()];
    while (this.acceptSymbol(',')) {
      literals.push(this.parseLiteral());
    }
    this.expectSymbol(')');
    return (row, now) => literals.some((literal) => compareValues(row[field], literal, now) === 0);
  }

  private parseLiteral(): FilterLiteral {
    const token = this.next();
    if (token.Kind === 'string') return token.Text;
    if (token.Kind === 'number') return Number(token.Text);
    if (token.Kind === 'word' && token.Text.toUpperCase() === 'GETUTCDATE') {
      this.expectSymbol('(');
      this.expectSymbol(')');
      return 'NOW';
    }
    throw this.fail(`expected a literal, found '${token.Text}'`);
  }

  private next(): FilterToken {
    const token = this.tokens[this.index];
    if (!token) throw this.fail('unexpected end of filter');
    this.index++;
    return token;
  }

  private acceptWord(word: string): boolean {
    const token = this.tokens[this.index];
    if (token?.Kind === 'word' && token.Text.toUpperCase() === word) {
      this.index++;
      return true;
    }
    return false;
  }

  private acceptSymbol(symbol: string): boolean {
    const token = this.tokens[this.index];
    if (token?.Kind === 'symbol' && token.Text === symbol) {
      this.index++;
      return true;
    }
    return false;
  }

  private expectWord(word: string): void {
    if (!this.acceptWord(word)) throw this.fail(`expected ${word}`);
  }

  private expectSymbol(symbol: string): void {
    if (!this.acceptSymbol(symbol)) throw this.fail(`expected '${symbol}'`);
  }

  private fail(reason: string): Error {
    return new Error(`FakeCommsDb cannot parse ExtraFilter (${reason}): ${this.source}`);
  }
}

/** Compiles an `ExtraFilter` into a row predicate. Unknown syntax throws rather than matching everything. */
export function CompileExtraFilter(filter: string | undefined): RowPredicate {
  if (!filter || !filter.trim()) return () => true;
  return new FilterParser(tokenizeFilter(filter), filter).Parse();
}

// ---------------------------------------------------------------------------
// Schema constraints
// ---------------------------------------------------------------------------

/** Narrows an entity member to a storable column value; `undefined` means "not a column". */
function toFieldValue(value: unknown): FakeFieldValue | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return null;
  return undefined;
}

/** The engine only ever passes plain-string filters; a PlatformSQL object is not supported by the fake. */
function plainSQL(value: RunViewParams['ExtraFilter'], what: string): string | undefined {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return undefined;
  throw new Error(`FakeCommsDb only supports a plain string ${what}`);
}

function isBlank(value: FakeFieldValue | undefined): boolean {
  return value === null || value === undefined;
}

function sameText(a: FakeFieldValue | undefined, b: FakeFieldValue | undefined): boolean {
  return !isBlank(a) && !isBlank(b) && String(a).toLowerCase() === String(b).toLowerCase();
}

function requireOneOf(row: FakeRow, field: string, allowed: string[], constraint: string): string | null {
  const value = row[field];
  if (isBlank(value) || !allowed.includes(String(value))) {
    return `The INSERT statement conflicted with the CHECK constraint "${constraint}" (${field}='${String(value)}').`;
  }
  return null;
}

function requirePrincipalPair(row: FakeRow, constraint: string): string | null {
  if (isBlank(row.EntityID) !== isBlank(row.RecordID)) {
    return `The INSERT statement conflicted with the CHECK constraint "${constraint}".`;
  }
  return null;
}

function requireUnique(row: FakeRow, others: FakeRow[], fields: string[], constraint: string): string | null {
  if (fields.some((field) => isBlank(row[field]))) return null; // filtered unique index: NULLs are exempt
  const clash = others.some((other) => fields.every((field) => sameText(other[field], row[field])));
  return clash ? `Cannot insert duplicate key row in object with unique index '${constraint}'.` : null;
}

function firstViolation(checks: Array<string | null>): string | null {
  return checks.find((check) => check !== null) ?? null;
}

const SUPPRESSION_REASONS = ['User Unsubscribe', 'Hard Bounce', 'Spam Complaint', 'Invalid Address', 'Admin Block', 'Policy'];
const SUPPRESSION_SOURCES = ['One-Click Header', 'Preference Center', 'Provider Webhook', 'Admin', 'API', 'Policy', 'Import'];
const LOG_STATUSES = ['Pending', 'In-Progress', 'Complete', 'Failed'];

function checkSuppression(row: FakeRow): string | null {
  const prefix = 'The INSERT statement conflicted with the CHECK constraint';
  return firstViolation([
    isBlank(row.CommunicationEndpointID) && isBlank(row.EntityID) ? `${prefix} "CK_CommunicationSuppression_Target".` : null,
    requirePrincipalPair(row, 'CK_CommunicationSuppression_PrincipalPair'),
    requireOneOf(row, 'Reason', SUPPRESSION_REASONS, 'CK_CommunicationSuppression_Reason'),
    requireOneOf(row, 'Source', SUPPRESSION_SOURCES, 'CK_CommunicationSuppression_Source'),
    requireOneOf(row, 'Status', ['Active', 'Revoked', 'Expired'], 'CK_CommunicationSuppression_Status'),
    (row.Status === 'Revoked') === isBlank(row.RevokedAt) ? `${prefix} "CK_CommunicationSuppression_Revocation".` : null,
    row.Reason === 'Policy' && isBlank(row.CommunicationSuppressionPolicyID) ? `${prefix} "CK_CommunicationSuppression_PolicyLink".` : null,
  ]);
}

function checkLog(row: FakeRow, others: FakeRow[]): string | null {
  return firstViolation([
    isBlank(row.CommunicationProviderID) || isBlank(row.CommunicationProviderMessageTypeID)
      ? 'Cannot insert the value NULL into a NOT NULL column of CommunicationLog.'
      : null,
    requireOneOf(row, 'Status', LOG_STATUSES, 'CK_CommunicationLog_Status'),
    requireOneOf(row, 'Direction', ['Sending', 'Receiving'], 'CK_CommunicationLog_Direction'),
    isBlank(row.MessageClass) ? null : requireOneOf(row, 'MessageClass', ['Transactional', 'Operational', 'Marketing'], 'CK_CommunicationLog_MessageClass'),
    requirePrincipalPair(row, 'CK_CommunicationLog_PrincipalPair'),
    requireUnique(row, others, ['CommunicationRunID', 'CommunicationEndpointID'], 'UX_CommunicationLog_Run_Endpoint'),
    requireUnique(row, others, ['UnsubscribeToken'], 'UX_CommunicationLog_UnsubscribeToken'),
    requireUnique(row, others, ['TrackingToken'], 'UX_CommunicationLog_TrackingToken'),
  ]);
}

function checkEndpoint(row: FakeRow, others: FakeRow[]): string | null {
  const prefix = 'The INSERT statement conflicted with the CHECK constraint';
  return firstViolation([
    requireOneOf(row, 'Status', ['Active', 'Soft Bouncing', 'Hard Bounced', 'Complained', 'Invalid', 'Erased'], 'CK_CommunicationEndpoint_Status'),
    typeof row.SoftBounceCount === 'number' && row.SoftBounceCount < 0 ? `${prefix} "CK_CommunicationEndpoint_SoftBounceCount".` : null,
    (row.Status === 'Erased') !== isBlank(row.NormalizedValue) ? `${prefix} "CK_CommunicationEndpoint_Erased".` : null,
    requireUnique(row, others, ['BaseMessageTypeID', 'ValueHash'], 'UQ_CommunicationEndpoint_ValueHash'),
  ]);
}

function checkRun(row: FakeRow): string | null {
  return firstViolation([
    isBlank(row.UserID) ? 'Cannot insert the value NULL into column UserID of CommunicationRun.' : null,
    requireOneOf(row, 'Status', LOG_STATUSES, 'CK_CommunicationRun_Status'),
  ]);
}

const CONSTRAINTS: Record<string, ConstraintCheck> = {
  'MJ: Communication Suppressions': checkSuppression,
  'MJ: Communication Logs': checkLog,
  'MJ: Communication Endpoints': checkEndpoint,
  'MJ: Communication Runs': checkRun,
};

// ---------------------------------------------------------------------------
// The fake database
// ---------------------------------------------------------------------------

export class FakeCommsDb {
  /** Every `RunView` issued, in order, for asserting what was (and was not) queried. */
  public readonly RunViewCalls: RunViewParams[] = [];
  /** Every `Save()` attempted, including the ones a constraint or injected failure rejected. */
  public readonly SaveAttempts: SaveAttempt[] = [];

  private readonly tables = new Map<string, FakeRow[]>();
  private readonly runViewFailures: Array<FailureRule<RunViewParams>> = [];
  private readonly saveFailures: Array<FailureRule<FakeRow>> = [];
  private readonly deleteFailures: Array<FailureRule<FakeRow>> = [];
  private readonly beforeSaveHooks: Array<{ EntityName: string; Hook: (row: FakeRow) => void }> = [];

  /** The object the engine sees as `CommunicationEngineBase.Instance.ProviderToUse`. */
  public get Provider(): IMetadataProvider {
    const runViewSide: Pick<IRunViewProvider, 'RunView'> = {
      RunView: <T>(params: RunViewParams) => Promise.resolve(this.runView<T>(params)),
    };
    const metadataSide: Pick<IMetadataProvider, 'GetEntityObject'> = Object.assign(runViewSide, {
      GetEntityObject: <T extends BaseEntity>(entityName: string) => Promise.resolve(this.materialize<T>(entityName, {}, true)),
    });
    return metadataSide as IMetadataProvider;
  }

  /**
   * Inserts a row directly, as pre-existing data. Seeded rows go through the same constraints
   * as saved ones, so a test cannot stage data the real database would have refused.
   */
  public Seed(entityName: string, row: FakeRow): FakeRow {
    const stored = this.normalizeForStorage({ ID: randomUUID(), ...row });
    const violation = CONSTRAINTS[entityName]?.(stored, this.table(entityName)) ?? null;
    if (violation) {
      throw new Error(`FakeCommsDb.Seed('${entityName}') rejected by the schema: ${violation}`);
    }
    this.table(entityName).push(stored);
    return { ...stored };
  }

  /** Current stored rows (copies) for an entity. */
  public Rows(entityName: string): FakeRow[] {
    return this.table(entityName).map((row) => ({ ...row }));
  }

  /** Makes matching `RunView` calls return `{ Success: false }` — it never throws, like the real one. */
  public FailRunView(entityName: string, options: FailureOptions<RunViewParams> = {}): void {
    this.runViewFailures.push({
      EntityName: entityName,
      Message: options.Message ?? 'Simulated RunView failure: connection lost',
      Remaining: options.Times ?? Number.POSITIVE_INFINITY,
      When: options.When,
    });
  }

  /** Makes matching `Save()` calls return `false` with `LatestResult.CompleteMessage` set. */
  public FailSave(entityName: string, options: FailureOptions<FakeRow> = {}): void {
    this.saveFailures.push({
      EntityName: entityName,
      Message: options.Message ?? 'Simulated Save failure: deadlock victim',
      Remaining: options.Times ?? Number.POSITIVE_INFINITY,
      When: options.When,
    });
  }

  /** Makes matching `Delete()` calls return `false` with `LatestResult.CompleteMessage` set. */
  public FailDelete(entityName: string, options: FailureOptions<FakeRow> = {}): void {
    this.deleteFailures.push({
      EntityName: entityName,
      Message: options.Message ?? 'Simulated Delete failure',
      Remaining: options.Times ?? Number.POSITIVE_INFINITY,
      When: options.When,
    });
  }

  /**
   * Runs `hook` once, immediately before the next `Save()` on `entityName` is checked. Use it to
   * seed a competing row so the save loses a race to the real unique index.
   */
  public OnceBeforeSave(entityName: string, hook: (row: FakeRow) => void): void {
    this.beforeSaveHooks.push({ EntityName: entityName, Hook: hook });
  }

  private table(entityName: string): FakeRow[] {
    let rows = this.tables.get(entityName);
    if (!rows) {
      rows = [];
      this.tables.set(entityName, rows);
    }
    return rows;
  }

  private takeFailure<TSubject>(rules: Array<FailureRule<TSubject>>, entityName: string, subject: TSubject): string | null {
    const rule = rules.find((candidate) => candidate.EntityName === entityName && candidate.Remaining > 0 && (candidate.When?.(subject) ?? true));
    if (!rule) return null;
    rule.Remaining--;
    return rule.Message;
  }

  private runView<T>(params: RunViewParams): RunViewResult<T> {
    this.RunViewCalls.push(params);
    const entityName = params.EntityName ?? '';
    const failure = this.takeFailure(this.runViewFailures, entityName, params);
    if (failure) {
      return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: failure };
    }

    const filter = CompileExtraFilter(plainSQL(params.ExtraFilter, 'ExtraFilter'));
    const matches = this.table(entityName).filter((row) => filter(row, new Date()));
    const ordered = this.applyOrderBy(matches, plainSQL(params.OrderBy, 'OrderBy'));
    const limited = params.MaxRows && params.MaxRows > 0 ? ordered.slice(0, params.MaxRows) : ordered;
    const results =
      params.ResultType === 'entity_object'
        ? limited.map((row) => this.materialize<BaseEntity>(entityName, row, false))
        : limited.map((row) => this.project(row, params.Fields));
    return {
      Success: true,
      Results: results as T[],
      RowCount: results.length,
      TotalRowCount: matches.length,
      ExecutionTime: 0,
      ErrorMessage: '',
    };
  }

  private applyOrderBy(rows: FakeRow[], orderBy: string | undefined): FakeRow[] {
    if (!orderBy || !orderBy.trim()) return rows;
    const [field, direction] = orderBy.trim().split(/\s+/);
    const sign = direction?.toUpperCase() === 'DESC' ? -1 : 1;
    return [...rows].sort((a, b) => sign * (compareValues(a[field], this.asLiteral(b[field]), new Date()) ?? 0));
  }

  private asLiteral(value: FakeFieldValue | undefined): FilterLiteral {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') return value;
    return String(value ?? '');
  }

  private project(row: FakeRow, fields: string[] | undefined): FakeRow {
    if (!fields || fields.length === 0) return { ...row };
    const projected: FakeRow = {};
    for (const field of fields) {
      projected[field] = row[field] ?? null;
    }
    return projected;
  }

  private normalizeForStorage(row: FakeRow): FakeRow {
    const stored: FakeRow = {};
    for (const [key, value] of Object.entries(row)) {
      const isUniqueIdentifier =
        typeof value === 'string' && UUID_PATTERN.test(value) && !NVARCHAR_KEY_COLUMNS.has(key) && (key.endsWith('ID') || key.endsWith('Token'));
      stored[key] = isUniqueIdentifier ? value.toUpperCase() : (value ?? null);
    }
    return stored;
  }

  private snapshot(entity: EntityControls): FakeRow {
    const row: FakeRow = {};
    for (const key of Object.keys(entity)) {
      if (CONTROL_MEMBERS.has(key)) continue;
      const value = toFieldValue(Reflect.get(entity, key));
      if (value !== undefined) {
        row[key] = value;
      }
    }
    return row;
  }

  private result(type: BaseEntityResult['Type'], success: boolean, message: string): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Type = type;
    result.Success = success;
    result.Message = message;
    return result;
  }

  private materialize<T extends BaseEntity>(entityName: string, row: FakeRow, isNew: boolean): T {
    let exists = !isNew;
    let latest: BaseEntityResult | null = null;
    const initial: FakeRow = isNew ? { ID: randomUUID().toUpperCase(), ...row } : { ...row };

    const controls: EntityControls = {
      Save: async () => {
        const outcome = this.saveEntity(entityName, this.snapshot(entity), !exists);
        latest = this.result(exists ? 'update' : 'create', outcome.Stored !== null, outcome.Message);
        if (outcome.Stored === null) return false;
        exists = true;
        Object.assign(entity, outcome.Stored); // a real Save() reloads the row as the database stored it
        return true;
      },
      Delete: async () => {
        const failure = this.takeFailure(this.deleteFailures, entityName, this.snapshot(entity));
        latest = this.result('delete', failure === null, failure ?? '');
        if (failure !== null) return false;
        const rows = this.table(entityName);
        const index = rows.findIndex((stored) => sameText(stored.ID, this.snapshot(entity).ID));
        if (index >= 0) rows.splice(index, 1);
        exists = false;
        return true;
      },
      GetAll: () => this.snapshot(entity),
      get LatestResult() {
        return latest;
      },
    };
    const entity: EntityControls = Object.assign(controls, initial);
    return entity as T;
  }

  private saveEntity(entityName: string, row: FakeRow, isNew: boolean): { Stored: FakeRow | null; Message: string } {
    const hookIndex = this.beforeSaveHooks.findIndex((hook) => hook.EntityName === entityName);
    if (hookIndex >= 0) {
      const [hook] = this.beforeSaveHooks.splice(hookIndex, 1);
      hook.Hook({ ...row });
    }

    const stored = this.normalizeForStorage(row);
    const rows = this.table(entityName);
    const others = rows.filter((other) => !sameText(other.ID, stored.ID));
    const message = this.takeFailure(this.saveFailures, entityName, stored) ?? CONSTRAINTS[entityName]?.(stored, others) ?? null;
    this.SaveAttempts.push({
      EntityName: entityName,
      Row: { ...stored },
      IsNew: isNew,
      Accepted: message === null,
      Message: message ?? '',
    });
    if (message !== null) {
      return { Stored: null, Message: message };
    }

    const index = rows.findIndex((other) => sameText(other.ID, stored.ID));
    if (index >= 0) {
      rows[index] = stored;
    } else {
      rows.push(stored);
    }
    return { Stored: { ...stored }, Message: '' };
  }
}

/**
 * Translates a contained subset of SQL-WHERE syntax into a MongoDB filter
 * document, so callers can use MJ's ordinary `ExtraFilter` against a Mongo-backed
 * entity without learning Mongo query syntax.
 *
 * Supported:
 *   - comparisons: =, !=, <>, >, <, >=, <=
 *   - IN (...) / NOT IN (...)
 *   - IS NULL / IS NOT NULL
 *   - LIKE 'pattern'  (% -> .*, _ -> ., anchored; case-insensitive by default, configurable)
 *   - AND / OR with parentheses (AND binds tighter than OR)
 *   - values: numbers, single-quoted strings, NULL, TRUE/FALSE
 *   - dotted field paths (e.g. address.city) for nested documents
 *
 * Anything outside this subset throws — callers should fall back to a native
 * Mongo query (RunNativeQuery) for advanced predicates. This is the "contained
 * filter-AST translator" called for in the External Data Sources design.
 */

import { ObjectId } from 'mongodb';

type MongoFilter = Record<string, unknown>;
type Primitive = string | number | boolean | null;

/** Options controlling SQL-WHERE → Mongo translation. */
export interface MongoFilterOptions {
  /**
   * When true (default), `LIKE` becomes a case-insensitive regex (`$options: 'i'`), matching SQL
   * Server's default collation — MJ's most common backend. When false, `LIKE` is case-sensitive
   * (PostgreSQL-style). Configurable per data source via `ConnectionConfig.caseInsensitiveLike`.
   */
  caseInsensitiveLike?: boolean;
}

type Token =
  | { kind: 'ident'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: string }
  | { kind: 'kw'; value: string } // AND OR IN IS NOT NULL LIKE TRUE FALSE
  | { kind: 'lparen' | 'rparen' | 'comma' };

const KEYWORDS = new Set(['AND', 'OR', 'IN', 'IS', 'NOT', 'NULL', 'LIKE', 'TRUE', 'FALSE']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdentPart = (c: string) => /[A-Za-z0-9_.]/.test(c);

  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }

    if (c === '(') { tokens.push({ kind: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ kind: 'rparen' }); i++; continue; }
    if (c === ',') { tokens.push({ kind: 'comma' }); i++; continue; }

    // multi/!single-char operators
    if (c === '!' && input[i + 1] === '=') { tokens.push({ kind: 'op', value: '!=' }); i += 2; continue; }
    if (c === '<' && input[i + 1] === '>') { tokens.push({ kind: 'op', value: '!=' }); i += 2; continue; }
    if (c === '>' && input[i + 1] === '=') { tokens.push({ kind: 'op', value: '>=' }); i += 2; continue; }
    if (c === '<' && input[i + 1] === '=') { tokens.push({ kind: 'op', value: '<=' }); i += 2; continue; }
    if (c === '=' || c === '>' || c === '<') { tokens.push({ kind: 'op', value: c }); i++; continue; }

    // single-quoted string (SQL escaping: '' -> ')
    if (c === "'") {
      let s = ''; i++;
      while (i < input.length) {
        if (input[i] === "'" && input[i + 1] === "'") { s += "'"; i += 2; continue; }
        if (input[i] === "'") { i++; break; }
        s += input[i++];
      }
      tokens.push({ kind: 'string', value: s });
      continue;
    }

    // number
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let n = c; i++;
      while (i < input.length && /[0-9.]/.test(input[i])) n += input[i++];
      const num = Number(n);
      // Fail loud on a malformed numeric literal (e.g. `1.2.3`, `1.`, stray `.`). Number("1.2.3") is NaN,
      // which would otherwise become {$eq: NaN} and silently match ZERO documents — a confusing wrong result.
      if (!Number.isFinite(num)) {
        throw new Error(`Invalid numeric literal '${n}' in filter.`);
      }
      tokens.push({ kind: 'number', value: num });
      continue;
    }

    // identifier or keyword
    if (isIdentStart(c)) {
      let id = c; i++;
      while (i < input.length && isIdentPart(input[i])) id += input[i++];
      const upper = id.toUpperCase();
      tokens.push(KEYWORDS.has(upper) ? { kind: 'kw', value: upper } : { kind: 'ident', value: id });
      continue;
    }

    throw new Error(`Unexpected character '${c}' at position ${i} in filter.`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[], private readonly caseInsensitiveLike: boolean) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private next(): Token | undefined { return this.tokens[this.pos++]; }
  private expect<K extends Token['kind']>(kind: K): Extract<Token, { kind: K }> {
    const t = this.next();
    if (!t || t.kind !== kind) throw new Error(`Expected ${kind} in filter but got ${t ? JSON.stringify(t) : 'end of input'}.`);
    return t as Extract<Token, { kind: K }>;
  }
  private isKw(v: string): boolean { const t = this.peek(); return !!t && t.kind === 'kw' && t.value === v; }

  parse(): MongoFilter {
    const f = this.parseOr();
    if (this.pos !== this.tokens.length) throw new Error('Unexpected trailing tokens in filter.');
    return f;
  }

  private parseOr(): MongoFilter {
    const parts = [this.parseAnd()];
    while (this.isKw('OR')) { this.next(); parts.push(this.parseAnd()); }
    return parts.length === 1 ? parts[0] : { $or: parts };
  }

  private parseAnd(): MongoFilter {
    const parts = [this.parsePrimary()];
    while (this.isKw('AND')) { this.next(); parts.push(this.parsePrimary()); }
    return parts.length === 1 ? parts[0] : { $and: parts };
  }

  private parsePrimary(): MongoFilter {
    if (this.peek()?.kind === 'lparen') {
      this.next();
      const inner = this.parseOr();
      this.expect('rparen');
      return inner;
    }
    return this.parsePredicate();
  }

  private parsePredicate(): MongoFilter {
    const field = this.expect('ident').value as string;
    const t = this.peek();

    if (t?.kind === 'op') {
      this.next();
      const value = this.parseValue();
      return MongoFilterTranslator.Comparison(field, t.value, value);
    }
    if (this.isKw('IN')) { this.next(); return { [field]: { $in: this.parseValueList().map(v => MongoFilterTranslator.CoerceTemporal(MongoFilterTranslator.CoerceObjectId(field, v))) } }; }
    if (this.isKw('NOT')) { this.next(); if (!this.isKw('IN')) throw new Error("Expected IN after NOT."); this.next(); return { [field]: { $nin: this.parseValueList().map(v => MongoFilterTranslator.CoerceTemporal(MongoFilterTranslator.CoerceObjectId(field, v))) } }; }
    if (this.isKw('IS')) {
      this.next();
      const negated = this.isKw('NOT');
      if (negated) this.next();
      if (!this.isKw('NULL')) throw new Error('Expected NULL after IS [NOT].');
      this.next();
      return { [field]: negated ? { $ne: null } : { $eq: null } };
    }
    if (this.isKw('LIKE')) {
      this.next();
      const pat = this.expect('string').value as string;
      const regex: MongoFilter = { $regex: MongoFilterTranslator.LikeToRegex(pat) };
      if (this.caseInsensitiveLike) regex.$options = 'i';
      return { [field]: regex };
    }

    throw new Error(`Unsupported predicate for field '${field}' in filter.`);
  }

  private parseValue(): Primitive {
    const t = this.next();
    if (!t) throw new Error('Expected a value in filter.');
    if (t.kind === 'string') return t.value;
    if (t.kind === 'number') return t.value;
    if (t.kind === 'kw' && t.value === 'NULL') return null;
    if (t.kind === 'kw' && t.value === 'TRUE') return true;
    if (t.kind === 'kw' && t.value === 'FALSE') return false;
    throw new Error(`Expected a value in filter but got ${JSON.stringify(t)}.`);
  }

  private parseValueList(): Primitive[] {
    this.expect('lparen');
    const values: Primitive[] = [this.parseValue()];
    while (this.peek()?.kind === 'comma') { this.next(); values.push(this.parseValue()); }
    this.expect('rparen');
    return values;
  }
}

export class MongoFilterTranslator {
  /** Translate a SQL-WHERE-subset string into a Mongo filter document. Empty -> {}. */
  public static Translate(sql: string | undefined, options?: MongoFilterOptions): MongoFilter {
    if (!sql || !sql.trim()) return {};
    return new Parser(tokenize(sql), options?.caseInsensitiveLike ?? true).parse();
  }

  public static Comparison(field: string, op: string, value: Primitive): MongoFilter {
    const v = MongoFilterTranslator.CoerceTemporal(MongoFilterTranslator.CoerceObjectId(field, value));
    switch (op) {
      case '=': return { [field]: { $eq: v } };
      case '!=': return { [field]: { $ne: v } };
      case '>': return { [field]: { $gt: v } };
      case '<': return { [field]: { $lt: v } };
      case '>=': return { [field]: { $gte: v } };
      case '<=': return { [field]: { $lte: v } };
      default: throw new Error(`Unsupported operator '${op}' in filter.`);
    }
  }

  /**
   * Coerce a value for MongoDB when the target field is `_id`. Mongo's default `_id` is a 12-byte
   * `ObjectId`, but MJ carries key/filter values as strings — so `{_id: "507f..."}` matches nothing.
   * When the field is `_id` and the value is a 24-char hex string, wrap it as an `ObjectId`. All other
   * fields and non-ObjectId `_id` shapes (e.g. a string `_id`) pass through unchanged. Shared by the
   * driver's `LoadSingle` and this translator's comparison / IN paths so the behavior is uniform.
   */
  public static CoerceObjectId(field: string, value: unknown): unknown {
    if (field === '_id' && typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
      return new ObjectId(value);
    }
    return value;
  }

  /**
   * Coerce an ISO-8601 date-time string literal to a `Date` so range/equality comparisons match Mongo's
   * native `Date`-typed fields (BSON compares across types by a fixed order, so a string never matches a
   * `Date`). Without this, an incremental-sync watermark predicate like `updatedAt >= '2026-03-01T…Z'`
   * silently matches ZERO documents. Only strict ISO-8601 date-times (with a `T` time component) are
   * coerced — a plain `'2026-03-01'` or any non-temporal string passes through unchanged, so callers who
   * genuinely store ISO-looking strings are unaffected. Applied to comparison + IN values (alongside
   * {@link CoerceObjectId}); an already-coerced ObjectId / non-string passes through.
   */
  public static CoerceTemporal(value: unknown): unknown {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d;
      }
    }
    return value;
  }

  /** Convert a SQL LIKE pattern to an anchored, regex-escaped pattern (% -> .*, _ -> .). */
  public static LikeToRegex(pattern: string): string {
    let out = '^';
    let prevWildcard = false; // collapse consecutive `%` so `%%%…` -> a single `.*`
    for (const ch of pattern) {
      if (ch === '%') {
        // A run of `%` is equivalent to one `.*`. Emitting `.*.*.*…` produces catastrophic regex
        // backtracking (ReDoS) against a non-matching input — MongoDB's $regex runs on a backtracking
        // engine, so a crafted `LIKE '%%%…%X'` could pin a server thread. Coalesce the run.
        if (!prevWildcard) out += '.*';
        prevWildcard = true;
        continue;
      }
      prevWildcard = false;
      if (ch === '_') out += '.';
      else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return out + '$';
  }
}

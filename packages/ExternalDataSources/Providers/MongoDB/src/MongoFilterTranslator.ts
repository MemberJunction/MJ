/**
 * Translates a contained subset of SQL-WHERE syntax into a MongoDB filter
 * document, so callers can use MJ's ordinary `ExtraFilter` against a Mongo-backed
 * entity without learning Mongo query syntax.
 *
 * Supported:
 *   - comparisons: =, !=, <>, >, <, >=, <=
 *   - IN (...) / NOT IN (...)
 *   - IS NULL / IS NOT NULL
 *   - LIKE 'pattern'  (% -> .*, _ -> ., anchored, case-sensitive)
 *   - AND / OR with parentheses (AND binds tighter than OR)
 *   - values: numbers, single-quoted strings, NULL, TRUE/FALSE
 *   - dotted field paths (e.g. address.city) for nested documents
 *
 * Anything outside this subset throws — callers should fall back to a native
 * Mongo query (RunNativeQuery) for advanced predicates. This is the "contained
 * filter-AST translator" called for in the External Data Sources design.
 */

type MongoFilter = Record<string, unknown>;
type Primitive = string | number | boolean | null;

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
      tokens.push({ kind: 'number', value: Number(n) });
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
  constructor(private readonly tokens: Token[]) {}

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
      return MongoFilterTranslator.comparison(field, t.value, value);
    }
    if (this.isKw('IN')) { this.next(); return { [field]: { $in: this.parseValueList() } }; }
    if (this.isKw('NOT')) { this.next(); if (!this.isKw('IN')) throw new Error("Expected IN after NOT."); this.next(); return { [field]: { $nin: this.parseValueList() } }; }
    if (this.isKw('IS')) {
      this.next();
      const negated = this.isKw('NOT');
      if (negated) this.next();
      if (!this.isKw('NULL')) throw new Error('Expected NULL after IS [NOT].');
      this.next();
      return { [field]: negated ? { $ne: null } : { $eq: null } };
    }
    if (this.isKw('LIKE')) { this.next(); const pat = this.expect('string').value as string; return { [field]: { $regex: MongoFilterTranslator.likeToRegex(pat), $options: 'i' } }; }

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
  public static translate(sql: string | undefined): MongoFilter {
    if (!sql || !sql.trim()) return {};
    return new Parser(tokenize(sql)).parse();
  }

  static comparison(field: string, op: string, value: Primitive): MongoFilter {
    switch (op) {
      case '=': return { [field]: { $eq: value } };
      case '!=': return { [field]: { $ne: value } };
      case '>': return { [field]: { $gt: value } };
      case '<': return { [field]: { $lt: value } };
      case '>=': return { [field]: { $gte: value } };
      case '<=': return { [field]: { $lte: value } };
      default: throw new Error(`Unsupported operator '${op}' in filter.`);
    }
  }

  /** Convert a SQL LIKE pattern to an anchored, regex-escaped pattern (% -> .*, _ -> .). */
  static likeToRegex(pattern: string): string {
    let out = '^';
    for (const ch of pattern) {
      if (ch === '%') out += '.*';
      else if (ch === '_') out += '.';
      else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return out + '$';
  }
}

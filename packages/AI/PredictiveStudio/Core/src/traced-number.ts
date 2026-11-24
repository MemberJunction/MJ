/**
 * @module traced-number
 *
 * A number a report or a trust line renders, with where it was read: the stored row (entity and record ID) and the JSON
 * path inside that row's JSON column. A test or a gate re-reads the row, walks the same path and compares the stored
 * value with the rendered one, so a rendered number that was derived, rounded into a different figure or made up is
 * caught. Browser-safe, no runtime dependencies beyond the shared JSON readers.
 *
 * Path grammar: `$` followed by any number of segments, each `.key` (an identifier: a letter, `_` or `$`, then letters,
 * digits, `_` or `$`), `["key"]` (any key, written as a JSON string) or `[index]` (a non-negative integer without
 * leading zeros). Nothing else is a path.
 */
import { JsonParse, type JsonValue } from './json-value';

/** Where a rendered number was read: the stored row and the JSON path inside its JSON column. */
export interface TracedNumberSource {
  /** The entity of the stored row (e.g. `MJ: ML Training Runs`). */
  readonly EntityName: string;
  /** The stored row's ID. */
  readonly RecordID: string;
  /** The JSON path of the number inside the row's JSON column (see the module's path grammar). */
  readonly Path: string;
}

/** A rendered number: its stored value, the exact token rendered for it, and where it was read. */
export interface TracedNumber {
  /** The stored value. */
  readonly Value: number;
  /** The exact token that appears in the rendered output (e.g. `0.864`, `0.0200`, `45.0%`, `1,205`). */
  readonly Text: string;
  /** The stored row and path the value was read from. */
  readonly Source: TracedNumberSource;
}

/** One step of a parsed path: an object key or an array index. */
type PathSegment = { readonly Kind: 'key'; readonly Key: string } | { readonly Kind: 'index'; readonly Index: number };

/** Reading a number at a stored JSON path, and re-reading it. */
export class TracedNumbers {
  /** An identifier segment's key: a letter, `_` or `$`, then letters, digits, `_` or `$`. */
  private static readonly identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*/;
  /** An index segment's digits: `0`, or a non-zero digit followed by digits. */
  private static readonly indexPattern = /^(0|[1-9][0-9]*)\]/;

  /**
   * The number stored at `path` in `json`, rendered by `format`; null when the JSON does not parse, the path is
   * malformed, a segment is missing, or the leaf is not a finite number.
   *
   * @param entityName the stored row's entity
   * @param recordId the stored row's ID
   * @param json the row's JSON column as stored
   * @param path the JSON path of the number (see the module's path grammar)
   * @param format renders the stored value as the token the output shows
   */
  public static FromStoredPath(entityName: string, recordId: string, json: string, path: string, format: (value: number) => string): TracedNumber | null {
    const value = TracedNumbers.readPath(json, path);
    if (value === null) return null;
    return { Value: value, Text: format(value), Source: { EntityName: entityName, RecordID: recordId, Path: path } };
  }

  /**
   * The number stored at `n.Source.Path` in `json` (the row's JSON column, read again); null when it cannot be read.
   * It never reads `n.Value`, so a rendered number that differs from the stored one does not recompute to itself.
   */
  public static Recompute(n: TracedNumber, json: string): number | null {
    return TracedNumbers.readPath(json, n.Source.Path);
  }

  /** The finite number at `path` in `json`; null when the JSON, the path or the leaf is not one. */
  private static readPath(json: string, path: string): number | null {
    const segments = TracedNumbers.tokenize(path);
    if (segments === null) return null;
    const parsed = JsonParse.ParseJsonText(json, 'TracedNumber JSON');
    if (parsed.Ok === false) return null;
    let current: JsonValue = parsed.Value;
    for (const segment of segments) {
      const next = TracedNumbers.step(current, segment);
      if (next === undefined) return null;
      current = next;
    }
    return typeof current === 'number' && Number.isFinite(current) ? current : null;
  }

  /** The value one segment below `value`; undefined when the segment is missing (an own key only, never a prototype member). */
  private static step(value: JsonValue, segment: PathSegment): JsonValue | undefined {
    if (segment.Kind === 'index') {
      return Array.isArray(value) && segment.Index < value.length ? value[segment.Index] : undefined;
    }
    if (!JsonParse.IsJsonObject(value) || !Object.prototype.hasOwnProperty.call(value, segment.Key)) return undefined;
    return value[segment.Key];
  }

  /** The segments of a path; null for anything outside the grammar. Never throws. */
  private static tokenize(path: string): PathSegment[] | null {
    if (!path.startsWith('$')) return null;
    const segments: PathSegment[] = [];
    let rest = path.slice(1);
    while (rest.length > 0) {
      const read = rest.startsWith('.') ? TracedNumbers.readIdentifier(rest.slice(1))
        : rest.startsWith('["') ? TracedNumbers.readQuotedKey(rest.slice(1))
        : rest.startsWith('[') ? TracedNumbers.readIndex(rest.slice(1))
        : null;
      if (read === null) return null;
      segments.push(read.Segment);
      rest = read.Rest;
    }
    return segments;
  }

  /** `key…` after a `.`: the identifier and what follows it. */
  private static readIdentifier(text: string): { readonly Segment: PathSegment; readonly Rest: string } | null {
    const match = TracedNumbers.identifierPattern.exec(text);
    if (match === null) return null;
    return { Segment: { Kind: 'key', Key: match[0] }, Rest: text.slice(match[0].length) };
  }

  /** `"key"]…` after a `[`: the JSON-string key (escapes honoured) and what follows the `]`. */
  private static readQuotedKey(text: string): { readonly Segment: PathSegment; readonly Rest: string } | null {
    let i = 1;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length || text[i + 1] !== ']') return null;
    const literal = JsonParse.ParseJsonText(text.slice(0, i + 1), 'TracedNumber path key');
    if (literal.Ok === false || typeof literal.Value !== 'string') return null;
    return { Segment: { Kind: 'key', Key: literal.Value }, Rest: text.slice(i + 2) };
  }

  /** `index]…` after a `[`: the non-negative integer and what follows the `]`. */
  private static readIndex(text: string): { readonly Segment: PathSegment; readonly Rest: string } | null {
    const match = TracedNumbers.indexPattern.exec(text);
    if (match === null) return null;
    const index = Number(match[1]);
    if (!Number.isSafeInteger(index)) return null;
    return { Segment: { Kind: 'index', Index: index }, Rest: text.slice(match[0].length) };
  }
}

/**
 * @module json-value
 *
 * Typed JSON values and the small helpers the persisted-shape parsers share. Browser-safe, no runtime dependencies.
 * Every Predictive Studio JSON column is parsed into a {@link JsonValue} first and then narrowed with these helpers,
 * so no parser ever casts.
 */

/** Any JSON value, as `JSON.parse` produces it. */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
/** A JSON object. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** The typed value, or every problem found (each a full sentence naming the column or field). */
export type ParseResult<T> = { readonly Ok: true; readonly Value: T } | { readonly Ok: false; readonly Errors: readonly string[] };

/**
 * The typed readers every persisted-shape parser shares: the ParseResult factories, the JSON-text parser and the
 * field readers that narrow a JsonObject without casting. Static members on one owner class so callers write
 * JsonParse.JsonString(o, key).
 */
export class JsonParse {
  /** A successful parse carrying its typed value. */
  public static ParseOk<T>(value: T): ParseResult<T> {
    return { Ok: true, Value: value };
  }

  /** A failed parse carrying every problem found (each a full sentence). */
  public static ParseFail<T>(...errors: string[]): ParseResult<T> {
    return { Ok: false, Errors: errors };
  }

  /** Parse a JSON column. A blank or malformed text is a failure naming the column. */
  public static ParseJsonText(text: string | null | undefined, column: string): ParseResult<JsonValue> {
    if (text === null || text === undefined || text.trim().length === 0) {
      return JsonParse.ParseFail(`${column} is empty; it must hold JSON`);
    }
    try {
      const value: JsonValue = JSON.parse(text);
      return JsonParse.ParseOk(value);
    } catch (e) {
      return JsonParse.ParseFail(`${column} is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  /** True for a JSON object (not an array, not null). */
  public static IsJsonObject(v: JsonValue | undefined): v is JsonObject {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  /** A non-blank string property, else null. */
  public static JsonString(o: JsonObject, key: string): string | null {
    const v = o[key];
    return typeof v === 'string' && v.trim().length > 0 ? v : null;
  }

  /** A finite number property, else null. */
  public static JsonNumber(o: JsonObject, key: string): number | null {
    const v = o[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  /** An integer property, else null. */
  public static JsonInteger(o: JsonObject, key: string): number | null {
    const v = JsonParse.JsonNumber(o, key);
    return v !== null && Number.isInteger(v) ? v : null;
  }

  /** A boolean property, else null. */
  public static JsonBoolean(o: JsonObject, key: string): boolean | null {
    const v = o[key];
    return typeof v === 'boolean' ? v : null;
  }

  /** An array of strings, else null (any non-string element fails the whole array). */
  public static JsonStringArray(o: JsonObject, key: string): string[] | null {
    const v = o[key];
    if (!Array.isArray(v)) return null;
    const out: string[] = [];
    for (const x of v) {
      if (typeof x !== 'string') return null;
      out.push(x);
    }
    return out;
  }

  /** An array of integers, else null. */
  public static JsonIntegerArray(o: JsonObject, key: string): number[] | null {
    const v = o[key];
    if (!Array.isArray(v)) return null;
    const out: number[] = [];
    for (const x of v) {
      if (typeof x !== 'number' || !Number.isInteger(x)) return null;
      out.push(x);
    }
    return out;
  }

  /** A nested object, else null. */
  public static JsonObjectField(o: JsonObject, key: string): JsonObject | null {
    const v = o[key];
    return JsonParse.IsJsonObject(v) ? v : null;
  }

  /** A nested array, else null. */
  public static JsonArrayField(o: JsonObject, key: string): JsonValue[] | null {
    const v = o[key];
    return Array.isArray(v) ? v : null;
  }
}

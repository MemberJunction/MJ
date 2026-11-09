/**
 * @fileoverview Start line numbers of the objects in a JSON text, keyed by the parsed objects.
 * @module json-record-lines
 */

/** The start line of one JSON value, and the positions of its members or items. */
interface JsonNodePosition {
  Line: number;
  Members: Map<string, JsonNodePosition> | null;
  Items: JsonNodePosition[] | null;
}

/** Reads the positions of the values in a valid JSON text. */
class JsonPositionScanner {
  private offset = 0;
  private line = 1;

  constructor(private readonly text: string) {}

  public ScanDocument(): JsonNodePosition {
    this.skipWhitespace();
    return this.scanValue();
  }

  private scanValue(): JsonNodePosition {
    const line = this.line;
    const char = this.text[this.offset];
    if (char === '{') {
      return { Line: line, Members: this.scanObject(), Items: null };
    }
    if (char === '[') {
      return { Line: line, Members: null, Items: this.scanArray() };
    }
    if (char === '"') {
      this.scanString();
    } else {
      this.scanLiteral();
    }
    return { Line: line, Members: null, Items: null };
  }

  private scanObject(): Map<string, JsonNodePosition> {
    const members = new Map<string, JsonNodePosition>();
    this.offset++;
    this.skipWhitespace();
    while (this.offset < this.text.length && this.text[this.offset] !== '}') {
      const key = this.scanString();
      this.skipWhitespace();
      this.offset++; // ':'
      this.skipWhitespace();
      members.set(key, this.scanValue());
      this.skipWhitespace();
      if (this.text[this.offset] === ',') {
        this.offset++;
        this.skipWhitespace();
      }
    }
    this.offset++;
    return members;
  }

  private scanArray(): JsonNodePosition[] {
    const items: JsonNodePosition[] = [];
    this.offset++;
    this.skipWhitespace();
    while (this.offset < this.text.length && this.text[this.offset] !== ']') {
      items.push(this.scanValue());
      this.skipWhitespace();
      if (this.text[this.offset] === ',') {
        this.offset++;
        this.skipWhitespace();
      }
    }
    this.offset++;
    return items;
  }

  /** Reads a string token and returns its decoded text. */
  private scanString(): string {
    const start = this.offset;
    this.offset++;
    while (this.offset < this.text.length && this.text[this.offset] !== '"') {
      this.offset += this.text[this.offset] === '\\' ? 2 : 1;
    }
    this.offset++;
    const decoded: unknown = JSON.parse(this.text.slice(start, this.offset));
    return typeof decoded === 'string' ? decoded : '';
  }

  /** Reads a number, true, false or null. */
  private scanLiteral(): void {
    while (this.offset < this.text.length && !/[\s,\]}]/.test(this.text[this.offset])) {
      this.offset++;
    }
  }

  private skipWhitespace(): void {
    while (this.offset < this.text.length) {
      const char = this.text[this.offset];
      if (char === '\n') {
        this.line++;
      } else if (char !== ' ' && char !== '\t' && char !== '\r') {
        return;
      }
      this.offset++;
    }
  }
}

function mapStartLines(value: unknown, position: JsonNodePosition, lines: WeakMap<object, number>): void {
  if (Array.isArray(value)) {
    lines.set(value, position.Line);
    value.forEach((item, index) => {
      const itemPosition = position.Items?.[index];
      if (itemPosition) {
        mapStartLines(item, itemPosition, lines);
      }
    });
  } else if (value !== null && typeof value === 'object') {
    lines.set(value, position.Line);
    for (const [key, member] of Object.entries(value)) {
      const memberPosition = position.Members?.get(key);
      if (memberPosition) {
        mapStartLines(member, memberPosition, lines);
      }
    }
  }
}

/**
 * Maps each object and array in `parsed` to the 1-based line of its opening bracket in `text`.
 * `parsed` must be `JSON.parse(text)`. For a repeated key, the last one is used, as in `JSON.parse`.
 */
export function MapJsonStartLines(text: string, parsed: unknown): WeakMap<object, number> {
  const lines = new WeakMap<object, number>();
  mapStartLines(parsed, new JsonPositionScanner(text).ScanDocument(), lines);
  return lines;
}

/**
 * The start line of the record at a push record path (`Entity[1]/Child Entity[0]`) in a record
 * file's text: the top-level item, then `relatedEntities` items. Undefined when the text is not
 * valid JSON, when it uses `@include` (push numbers records after the include is applied, so a raw
 * position can point to another record), or when the path does not lead to a record.
 */
export function RecordStartLine(text: string, recordPath: string): number | undefined {
  if (text.includes('"@include')) {
    return undefined;
  }
  const content = text.replace(/^﻿/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  const lines = MapJsonStartLines(content, parsed);
  let current: unknown = undefined;
  let first = true;
  for (const [, entityName, indexText] of recordPath.matchAll(/(.+?)\[(\d+)\](?:\/|$)/g)) {
    const index = Number(indexText);
    if (first) {
      current = Array.isArray(parsed) ? parsed[index] : index === 0 ? parsed : undefined;
      first = false;
    } else {
      current = relatedItem(current, entityName, index);
    }
  }
  return current !== null && typeof current === 'object' ? lines.get(current) : undefined;
}

function relatedItem(record: unknown, entityName: string, index: number): unknown {
  if (record === null || typeof record !== 'object' || !('relatedEntities' in record)) {
    return undefined;
  }
  const related = record.relatedEntities;
  if (related === null || typeof related !== 'object') {
    return undefined;
  }
  const items: unknown = Reflect.get(related, entityName);
  return Array.isArray(items) ? items[index] : undefined;
}

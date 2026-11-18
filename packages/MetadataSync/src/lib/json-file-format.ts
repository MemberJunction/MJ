import fs from 'fs-extra';

/** The text conventions of a JSON file that a rewrite keeps. */
export interface JsonFileFormat {
  /** The file ends with a newline. */
  TrailingNewline: boolean;
  /** Non-ASCII characters are written as `\uXXXX` escapes instead of literal characters. */
  EscapeNonAscii: boolean;
  /** Escapes use uppercase hex digits. */
  UppercaseHex: boolean;
}

/** The format sync uses for a file it creates: no trailing newline, literal characters. */
export const DEFAULT_JSON_FILE_FORMAT: JsonFileFormat = { TrailingNewline: false, EscapeNonAscii: false, UppercaseHex: false };

/** A `\uXXXX` escape that is not itself an escaped backslash followed by `u`. */
const UNICODE_ESCAPE = /(?<!\\)(?:\\\\)*\\u([0-9a-fA-F]{4})/g;
const NON_ASCII = /[\u007f-￿]/;
const NON_ASCII_GLOBAL = /[\u007f-￿]/g;
const FIRST_NON_ASCII_CODE = 0x7f;

/**
 * Reads the format of JSON text. Non-ASCII escapes count only when the text has no literal
 * non-ASCII characters, so a file that mixes both is written with literal characters.
 */
export function DetectJsonFileFormat(text: string): JsonFileFormat {
  const nonAsciiEscapes = [...text.matchAll(UNICODE_ESCAPE)]
    .map((m) => m[1])
    .filter((hex) => parseInt(hex, 16) >= FIRST_NON_ASCII_CODE);
  const escapeNonAscii = nonAsciiEscapes.length > 0 && !NON_ASCII.test(text);
  return {
    TrailingNewline: text.endsWith('\n'),
    EscapeNonAscii: escapeNonAscii,
    UppercaseHex: escapeNonAscii && /[A-F]/.test(nonAsciiEscapes[0]),
  };
}

/** Applies a format to JSON text produced by `JSON.stringify`. */
export function ApplyJsonFileFormat(json: string, format: JsonFileFormat): string {
  let text = json;
  if (format.EscapeNonAscii) {
    text = text.replace(NON_ASCII_GLOBAL, (c) => {
      const hex = c.charCodeAt(0).toString(16).padStart(4, '0');
      return `\\u${format.UppercaseHex ? hex.toUpperCase() : hex}`;
    });
  }
  return format.TrailingNewline && !text.endsWith('\n') ? `${text}\n` : text;
}

/** Returns the format of an existing file, or the default format when the file does not exist. */
export async function ReadJsonFileFormat(filePath: string): Promise<JsonFileFormat> {
  if (!(await fs.pathExists(filePath))) {
    return DEFAULT_JSON_FILE_FORMAT;
  }
  return DetectJsonFileFormat(await fs.readFile(filePath, 'utf8'));
}

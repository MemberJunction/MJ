import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CausalCopy } from '@memberjunction/predictive-studio-core';

/** One user-facing string of a source file. */
export interface UserFacingLine {
  Line: number;
  Text: string;
}

/** The S9.3 causal-copy scan the G0.6 gate body runs. */
export class CausalCopyScan {
  // The phrase list is Core's: one list for the product's own scan test and this gate.
  public static readonly Patterns: readonly RegExp[] = CausalCopy.Patterns.map((p) => p.Pattern);

  /** The file that defines the list; its labels are the forbidden phrases themselves. */
  private static readonly listFile = 'causal-copy.ts';

  /** Linear character scanner extracting string literals from a single TS/JS source line, ignoring `//` comments. */
  private static extractStringLiterals(line: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '/' && line[i + 1] === '/') break;
      if (ch !== "'" && ch !== '"' && ch !== '`') continue;
      const quote = ch;
      let buf = '';
      for (i += 1; i < line.length; i++) {
        const c = line[i]!;
        if (c === '\\' && i + 1 < line.length) {
          buf += c + line[i + 1]!;
          i += 1;
          continue;
        }
        if (c === quote) {
          out.push(buf);
          break;
        }
        buf += c;
      }
    }
    return out;
  }

  /** String literals (TS/JS) or text (HTML/Markdown) of one file, with line numbers. */
  public static UserFacingText(file: string, source: string): UserFacingLine[] {
    const out: UserFacingLine[] = [];
    source.split('\n').forEach((raw, i) => {
      if (/\.(ts|js)$/.test(file)) {
        for (const text of CausalCopyScan.extractStringLiterals(raw)) {
          out.push({ Line: i + 1, Text: text });
        }
      } else {
        out.push({ Line: i + 1, Text: raw });
      }
    });
    return out;
  }

  /** `<file>:<line>: <text>` for every user-facing string that matches a pattern. */
  public static Scan(files: readonly string[]): string[] {
    const hits: string[] = [];
    for (const file of files) {
      if (path.basename(file) === CausalCopyScan.listFile) continue;
      for (const { Line, Text } of CausalCopyScan.UserFacingText(file, readFileSync(file, 'utf8'))) {
        if (CausalCopyScan.Patterns.some((re) => re.test(Text))) hits.push(`${file}:${Line}: ${Text.trim()}`);
      }
    }
    return hits;
  }
}

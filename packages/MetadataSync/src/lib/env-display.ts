/**
 * @fileoverview Display text for values that come from `@env:`. Push prints these in place of
 * the values in diffs, change reports, save-failure dumps and error text.
 * @module env-display
 */

/** Shown for the old database value of an env-sourced field. */
export const ENV_HIDDEN_VALUE = '<hidden>';

/**
 * Values shorter than this are not searched for in free text, so short values do not match unrelated text.
 * Display masking, the pull left-over check and the copied-value check all use it.
 */
export const MIN_MASKED_VALUE_LENGTH = 6;

/** `<from @env:A>`, or `<from @env:A, @env:B>` for a field that uses more than one variable. */
export function EnvSourceLabel(variableNames: Iterable<string>): string {
  const names = [...new Set(variableNames)].sort();
  return `<from ${names.map((name) => `@env:${name}`).join(', ')}>`;
}

/**
 * The thrown value as an Error whose message and stack hold no variable value. A value that is not
 * an Error is wrapped in a new Error with the masked text. Only `message` and `stack` are masked;
 * `cause` and other properties are left as they are.
 */
export function MaskedError(thrown: unknown, mask: EnvDisplayMask): Error {
  if (!(thrown instanceof Error)) {
    const text = typeof thrown === 'object' && thrown !== null ? JSON.stringify(thrown) : String(thrown);
    return new Error(mask.MaskText(text));
  }
  thrown.message = mask.MaskText(thrown.message);
  if (thrown.stack) {
    thrown.stack = mask.MaskText(thrown.stack);
  }
  return thrown;
}

/** Masks the env-sourced fields of one record in printed text. */
export class EnvDisplayMask {
  private readonly fields: ReadonlyMap<string, ReadonlySet<string>>;
  private readonly env: NodeJS.ProcessEnv;
  /** Variables searched for by MaskText that belong to no field. */
  private textVariables: ReadonlySet<string> = new Set();

  constructor(fields?: ReadonlyMap<string, ReadonlySet<string>>, env: NodeJS.ProcessEnv = process.env) {
    this.fields = fields ?? new Map();
    this.env = env;
  }

  /** A mask for free text only: MaskText searches for these variables, and no field is env-sourced. */
  static ForVariables(variableNames: Iterable<string>, env: NodeJS.ProcessEnv = process.env): EnvDisplayMask {
    const mask = new EnvDisplayMask(undefined, env);
    mask.textVariables = new Set(variableNames);
    return mask;
  }

  /** True when the record has no env-sourced field. */
  get IsEmpty(): boolean {
    return this.fields.size === 0;
  }

  /** True when the field is env-sourced. The name matches exactly, or else without regard to case. */
  IsEnvField(fieldName: string): boolean {
    return this.variablesFor(fieldName) !== undefined;
  }

  /** The old value to print: `<hidden>` for an env-sourced field, else the formatted value. */
  OldValue(fieldName: string, formatted: string): string {
    return this.IsEnvField(fieldName) ? ENV_HIDDEN_VALUE : formatted;
  }

  /** The new value to print: `<from @env:VAR>` for an env-sourced field, else the formatted value. */
  NewValue(fieldName: string, formatted: string): string {
    const variables = this.variablesFor(fieldName);
    return variables ? EnvSourceLabel(variables) : formatted;
  }

  /**
   * Replaces each value of this record's variables in free text with its label, without regard to case.
   * A variable is searched for only when its trimmed value is at least `MIN_MASKED_VALUE_LENGTH` long.
   * Matches the value as is, trimmed, with doubled single quotes, JSON-escaped once, and JSON-escaped
   * with doubled single quotes. Every match is found in the original text; matches that overlap become
   * one label that names all their variables, so no part of any value is left.
   */
  MaskText(text: string): string {
    const ranges = mergeRanges(this.findMatches(text));
    let result = '';
    let position = 0;
    for (const range of ranges) {
      result += text.slice(position, range.Start) + EnvSourceLabel(range.Names);
      position = range.End;
    }
    return result + text.slice(position);
  }

  /** Every match of every form in the text, overlapping matches included. */
  private findMatches(text: string): MaskRange[] {
    const matches: MaskRange[] = [];
    for (const { Form, Name } of this.maskForms()) {
      const pattern = new RegExp(escapeRegExp(Form), 'gi');
      for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
        matches.push({ Start: match.index, End: match.index + Form.length, Names: [Name] });
        pattern.lastIndex = match.index + 1;
      }
    }
    return matches;
  }

  /** The variables of a field, found by exact name, or else by name without regard to case. */
  private variablesFor(fieldName: string): ReadonlySet<string> | undefined {
    const exact = this.fields.get(fieldName);
    if (exact) {
      return exact;
    }
    const lowerName = fieldName.toLowerCase();
    for (const [name, variables] of this.fields) {
      if (name.toLowerCase() === lowerName) {
        return variables;
      }
    }
    return undefined;
  }

  /** Every searched form of every set variable. */
  private maskForms(): MaskForm[] {
    const forms: MaskForm[] = [];
    for (const name of this.variableNames()) {
      const value = this.env[name];
      if (value === undefined || value.trim().length < MIN_MASKED_VALUE_LENGTH) {
        continue;
      }
      const jsonForm = JSON.stringify(value).slice(1, -1);
      const variants = new Set([value, value.trim(), value.replace(/'/g, "''"), jsonForm, jsonForm.replace(/'/g, "''")]);
      variants.forEach((form) => forms.push({ Form: form, Name: name }));
    }
    return forms;
  }

  private variableNames(): Set<string> {
    const variables = new Set<string>(this.textVariables);
    for (const names of this.fields.values()) {
      names.forEach((name) => variables.add(name));
    }
    return variables;
  }
}

/** One text form of a variable value. */
interface MaskForm {
  Form: string;
  Name: string;
}

/** A part of the text that holds a value, with the variables whose values it holds. */
interface MaskRange {
  Start: number;
  End: number;
  Names: string[];
}

/**
 * Sorts the ranges and joins the ones that overlap. A range inside another adds no name, so a value
 * that is part of a longer value is labeled by the longer one.
 */
function mergeRanges(ranges: MaskRange[]): MaskRange[] {
  const sorted = [...ranges].sort((a, b) => a.Start - b.Start || b.End - a.End);
  const merged: MaskRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.End <= last.End) {
      continue;
    }
    if (last && range.Start < last.End) {
      last.End = range.End;
      last.Names.push(...range.Names);
    } else {
      merged.push({ Start: range.Start, End: range.End, Names: [...range.Names] });
    }
  }
  return merged;
}

/** Escapes the characters that have a meaning in a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

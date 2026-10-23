/**
 * @fileoverview The readable-status-values standard.
 *
 * A CHECK-constrained value list is what people see: CodeGen turns it into the field's dropdown,
 * its `EntityFieldValue` rows and its generated TypeScript union, and it shows up as-is in views,
 * queries and reports. MJ writes those values for people (`'Opted In'`, `'Not Specified'`), and
 * CodeGen already gives code a safe union for them. AI tools tend to write machine-style values
 * (`'OptedIn'`, `'NOT_SPECIFIED'`) instead, which then leak into every screen.
 *
 * @module @memberjunction/standards
 */

import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';
import { HasMarkerNear } from '../lib/markers.js';
import { FindMigrations, StripSqlComments } from '../lib/migrations.js';

/** The reviewed-exception marker, on the value's line or the line above it. */
export const READABLE_VALUES_MARKER = 'mj-standards-allow: status-value';

/** How many lines a `CHECK (` is followed for, to reach the end of its value list. */
const CHECK_LOOKAHEAD = 15;

/** Two or more capitalized words run together: `OptedIn`, `NotSpecified`, `InProgress`. */
const RUN_TOGETHER = /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/;

/** Words joined by underscores in any case: `OPTED_IN`, `opted_in`. */
const SNAKE = /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/;

/** A value as people would read it: `OptedIn` becomes `Opted In`, `NOT_SPECIFIED` becomes `Not Specified`. */
export function ReadableForm(value: string): string {
    if (SNAKE.test(value)) {
        return value
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }
    return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/** Is `value` written for a machine rather than a person? */
export function IsMachineStyle(value: string): boolean {
    return RUN_TOGETHER.test(value) || SNAKE.test(value);
}

/** One value found in a CHECK list. */
export interface CheckListValue {
    /** 1-based line the value is on. */
    Line: number;
    Value: string;
}

/**
 * Every quoted value inside a `CHECK (… IN (…))` list in `code` (comment-stripped lines).
 * A `CHECK` without an `IN` list (a range, a pattern) yields nothing.
 */
export function FindCheckListValues(code: readonly string[]): CheckListValue[] {
    const found: CheckListValue[] = [];
    for (let i = 0; i < code.length; i++) {
        const start = code[i].search(/\bCHECK\s*\(/i);
        if (start < 0) continue;
        found.push(...valuesInCheck(code, i, start));
    }
    return found;
}

/**
 * The quoted values inside `IN (…)` groups of the one CHECK expression that starts at
 * `code[line]`, column `column`. Reading stops when the CHECK's own parentheses close, so a later
 * statement's `IN (…)` is never mistaken for this constraint's list.
 */
function valuesInCheck(code: readonly string[], line: number, column: number): CheckListValue[] {
    const values: CheckListValue[] = [];
    let depth = 0;
    let opened = false;
    let listDepth = -1;
    for (let j = line; j < Math.min(code.length, line + CHECK_LOOKAHEAD); j++) {
        const text = code[j];
        for (let k = j === line ? column : 0; k < text.length; k++) {
            const ch = text[k];
            if (ch === "'") {
                const end = closingQuote(text, k);
                if (listDepth >= 0 && depth === listDepth) values.push({ Line: j + 1, Value: text.slice(k + 1, end).replace(/''/g, "'") });
                k = end;
            } else if (ch === '(') {
                depth++;
                opened = true;
                if (listDepth < 0 && /\bIN\s*$/i.test(text.slice(0, k))) listDepth = depth;
            } else if (ch === ')') {
                if (depth === listDepth) listDepth = -1;
                depth--;
                if (opened && depth === 0) return values;
            }
        }
    }
    return values;
}

/** Index of the quote that closes the string opened at `open`, treating `''` as an escaped quote. */
function closingQuote(text: string, open: number): number {
    for (let k = open + 1; k < text.length; k++) {
        if (text[k] !== "'") continue;
        if (text[k + 1] === "'") {
            k++;
            continue;
        }
        return k;
    }
    return text.length;
}

/** Find machine-style CHECK list values in the hand-written part of every migration since the cutoff. */
function run(context: CheckContext): CheckResult {
    const fromVersion = String(context.Options['FromVersion'] ?? '');
    const allowed = new Set((context.Options['AllowedValues'] as string[] | undefined) ?? []);
    const { Migrations, Notes } = FindMigrations(context.RepoRoot, context.Roots, fromVersion);
    const violations: Violation[] = [];
    for (const migration of Migrations) {
        const handWritten = migration.Lines.slice(0, migration.HandWrittenLineCount);
        for (const { Line, Value } of FindCheckListValues(StripSqlComments(handWritten))) {
            if (!IsMachineStyle(Value) || allowed.has(Value)) continue;
            if (HasMarkerNear(migration.Lines, Line, READABLE_VALUES_MARKER)) continue;
            violations.push({
                File: migration.File,
                Line,
                Message: `'${Value}' is written for a machine. Use '${ReadableForm(Value)}'; CodeGen gives code a typed union for it either way.`,
            });
        }
    }
    return { Violations: violations, Notes: [...Notes, `${Migrations.length} migration(s) at or after ${fromVersion || '(no cutoff)'} read.`] };
}

/** The registered standard. */
export const ReadableStatusValuesCheck: StandardCheck = {
    Id: 'readable-status-values',
    Title: 'Write CHECK-constrained values for people, with spaces',
    Since: '6.2.0',
    DefaultSeverity: 'warn',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/guides/SCHEMA_AND_CODE_AUTHORING_GUIDE.md#value-lists-are-written-for-people',
    Description:
        "Flags run-together ('OptedIn') and snake_case ('OPTED_IN') values in CHECK (… IN (…)) lists in the hand-written " +
        'part of every versioned migration at or after the FromVersion option. These values become dropdowns, ' +
        "EntityFieldValue rows and report text; write them as people read them ('Opted In'). Proper names that are " +
        `run together by design go in the AllowedValues option, or take "${READABLE_VALUES_MARKER}" on the line.`,
    DefaultRoots: ['migrations'],
    DefaultOptions: { FromVersion: '202610210000', AllowedValues: [] },
    Run: run,
};

/**
 * @fileoverview The migration-string-collation standard.
 *
 * Every string column in MJ's baseline pins `COLLATE SQL_Latin1_General_CP1_CI_AS`. A column added
 * later without a `COLLATE` clause follows the database default instead, so on a database created
 * case-sensitive its unique constraints accept "Coach" and "coach" as two values and its lookups
 * stop matching the baseline columns beside it (MJ#6111). This check asks new string columns to
 * say their collation, so a migration behaves the same on every install.
 *
 * @module @memberjunction/standards
 */

import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';
import { HasMarkerNear } from '../lib/markers.js';
import { FindMigrations, IsCodeGenStatement, StripSqlComments } from '../lib/migrations.js';

/** The reviewed-exception marker, on the column's line or the line above it. */
export const STRING_COLLATION_MARKER = 'mj-standards-allow: collation';

/*
 * A table name is one or more dot-separated parts, each `[bracketed]`, `"quoted"` or bare. A bare
 * part cannot contain `.`, `"`, `[`, `(` or whitespace, so each character of a name belongs to exactly
 * one part and the patterns below cannot backtrack over the same text in more than one way.
 */

/** `CREATE TABLE <name> (` — the name is captured so a `#temp` table can be skipped. */
const CREATE_TABLE = /\bCREATE\s+TABLE\s+((?:\[[^\]]+\]|"[^"]+"|[^\s(."[]+)(?:\s*\.\s*(?:\[[^\]]+\]|"[^"]+"|[^\s(."[]+))*)\s*\(/gi;

/** `ALTER TABLE <name> ADD` — `ADD CONSTRAINT …` items are filtered out per item, not here. */
const ALTER_TABLE_ADD = /\bALTER\s+TABLE\s+((?:\[[^\]]+\]|"[^"]+"|[^\s(."[]+)(?:\s*\.\s*(?:\[[^\]]+\]|"[^"]+"|[^\s(."[]+))*)\s+ADD\b/gi;

/** A column definition whose type is a character type: `<name> [N][VAR]CHAR…`, bracketed or not. */
const STRING_COLUMN = /^\s*(\[[^\]]+\]|"[^"]+"|[A-Za-z_@#$][\w@#$]*)\s+\[?(N?VARCHAR|N?CHAR)\]?(?![\w])/i;

/** Statement keywords that end an `ALTER TABLE … ADD` written without a semicolon. */
const STATEMENT_START = /^(?:GO|CREATE|ALTER|DROP|EXEC|EXECUTE|INSERT|UPDATE|DELETE|DECLARE|IF|BEGIN|END|PRINT|SELECT|MERGE|RETURN|SET\s+(?:XACT_ABORT|NOCOUNT|ANSI_|QUOTED_))\b/i;

/** A temporary table (`#t`, `##t`) is session-local and inherits tempdb's collation by design. */
function isTempTable(name: string): boolean {
    return /^\[?#/.test(name.trim());
}

/** One string column without a `COLLATE` clause. */
export interface UncollatedColumn {
    /** 1-based line of the column definition. */
    Line: number;
    /** The column name as written. */
    Column: string;
    /** The character type as written (`NVARCHAR`, `CHAR`, …). */
    Type: string;
}

/** Offsets of each line start, so a character offset maps back to a 1-based line number. */
function lineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    return starts;
}

function lineAt(starts: readonly number[], offset: number): number {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
    }
    return lo + 1;
}

/**
 * Top-level comma-separated items from `text[start]` until the depth drops below zero (the closing
 * parenthesis of a `CREATE TABLE`) or, when `stopAtStatement` is set, until a `;` or a new statement
 * at depth zero (the end of an `ALTER TABLE … ADD`). String literals and bracketed names are opaque.
 */
function splitItems(text: string, start: number, stopAtStatement: boolean): Array<{ Start: number; Text: string }> {
    const items: Array<{ Start: number; Text: string }> = [];
    let depth = 0;
    let itemStart = start;
    let i = start;
    const push = (end: number): void => {
        items.push({ Start: itemStart, Text: text.slice(itemStart, end) });
    };
    while (i < text.length) {
        const ch = text[i];
        if (ch === "'") {
            const close = text.indexOf("'", i + 1);
            if (close === -1) break;
            i = close + 1; // a doubled '' re-opens here, which pairs the same way
            continue;
        }
        if (ch === '[') {
            const close = text.indexOf(']', i + 1);
            if (close === -1) break;
            i = close + 1;
            continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') {
            if (depth === 0) {
                push(i);
                return items;
            }
            depth--;
        } else if (depth === 0 && ch === ',') {
            push(i);
            itemStart = i + 1;
        } else if (stopAtStatement && depth === 0) {
            if (ch === ';') {
                push(i);
                return items;
            }
            if (ch === '\n' && STATEMENT_START.test(text.slice(i + 1).trimStart())) {
                push(i);
                return items;
            }
        }
        i++;
    }
    push(i);
    return items;
}

/** The string columns in one item list that carry no `COLLATE`. */
function uncollated(items: ReadonlyArray<{ Start: number; Text: string }>, starts: readonly number[]): UncollatedColumn[] {
    const found: UncollatedColumn[] = [];
    for (const item of items) {
        const m = STRING_COLUMN.exec(item.Text);
        if (!m) continue;
        if (/\bCOLLATE\b/i.test(item.Text)) continue;
        const lead = item.Text.search(/\S/);
        found.push({ Line: lineAt(starts, item.Start + Math.max(lead, 0)), Column: m[1], Type: m[2].toUpperCase() });
    }
    return found;
}

/**
 * Every `NVARCHAR`/`VARCHAR`/`NCHAR`/`CHAR` column defined in a `CREATE TABLE` or `ALTER TABLE … ADD`
 * in `code` (comment-stripped lines) without a `COLLATE` clause. Temporary tables are skipped, and a
 * table variable (`DECLARE @t TABLE (…)`) never matches, since it is not a `CREATE TABLE`.
 */
export function FindUncollatedStringColumns(code: readonly string[]): UncollatedColumn[] {
    const text = code.join('\n');
    const starts = lineStarts(text);
    const found: UncollatedColumn[] = [];
    for (const m of text.matchAll(CREATE_TABLE)) {
        if (isTempTable(m[1])) continue;
        found.push(...uncollated(splitItems(text, (m.index ?? 0) + m[0].length, false), starts));
    }
    for (const m of text.matchAll(ALTER_TABLE_ADD)) {
        if (isTempTable(m[1])) continue;
        found.push(...uncollated(splitItems(text, (m.index ?? 0) + m[0].length, true), starts));
    }
    return found.sort((a, b) => a.Line - b.Line);
}

/** Find uncollated string columns in the hand-written part of every migration since the cutoff. */
function run(context: CheckContext): CheckResult {
    const fromVersion = String(context.Options['FromVersion'] ?? '');
    const collation = String(context.Options['Collation'] ?? 'SQL_Latin1_General_CP1_CI_AS');
    const { Migrations, Notes } = FindMigrations(context.RepoRoot, context.Roots, fromVersion);
    const violations: Violation[] = [];
    for (const migration of Migrations) {
        const handWritten = migration.Lines.slice(0, migration.HandWrittenLineCount);
        for (const column of FindUncollatedStringColumns(StripSqlComments(handWritten))) {
            if (HasMarkerNear(migration.Lines, column.Line, STRING_COLLATION_MARKER)) continue;
            if (IsCodeGenStatement(migration.Lines, column.Line)) continue;
            violations.push({
                File: migration.File,
                Line: column.Line,
                Message:
                    `${column.Type} column ${column.Column} has no COLLATE clause, so it follows the database default. ` +
                    `Write \`${column.Column} ${column.Type}(…) COLLATE ${collation}\`, as the baseline's string columns do.`,
            });
        }
    }
    return { Violations: violations, Notes: [...Notes, `${Migrations.length} migration(s) at or after ${fromVersion || '(no cutoff)'} read.`] };
}

/** The registered standard. */
export const MigrationStringCollationCheck: StandardCheck = {
    Id: 'migration-string-collation',
    Title: 'Declare the collation of every new string column',
    Since: '6.2.0',
    DefaultSeverity: 'error',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/migrations/CLAUDE.md#critical-migration-content-rules',
    Description:
        'Flags NVARCHAR / VARCHAR / NCHAR / CHAR columns defined in CREATE TABLE or ALTER TABLE … ADD without a COLLATE ' +
        'clause, in the hand-written part of every versioned migration at or after the FromVersion option. Without one, ' +
        'the column follows the database default, so a case-sensitive database treats it differently from every ' +
        'baseline column. Temporary tables and table variables are not read. The expected collation is the Collation ' +
        `option (default SQL_Latin1_General_CP1_CI_AS). Reviewed exception: "${STRING_COLLATION_MARKER}" on the line or the one above.`,
    DefaultRoots: ['migrations'],
    DefaultOptions: { FromVersion: '202611031700', Collation: 'SQL_Latin1_General_CP1_CI_AS' },
    Run: run,
};

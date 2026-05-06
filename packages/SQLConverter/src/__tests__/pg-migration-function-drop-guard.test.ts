/**
 * PG migration: CREATE OR REPLACE FUNCTION DROP-guard static check.
 *
 * Catches the failure class where a migration emits
 *   CREATE OR REPLACE FUNCTION X(...) RETURNS Y
 * for a function `X` that is *already defined in an earlier migration with a
 * different signature*  — without first DROPping the prior overload.
 *
 * PostgreSQL allows `CREATE OR REPLACE FUNCTION` only when (a) the function
 * doesn't exist yet, OR (b) the new signature exactly matches the prior
 * signature. Same name + different parameter list (count, types, names) or
 * different return type rejects with `cannot change name of input parameter`
 * / `cannot change return type of existing function` etc. The function must
 * be DROPped first.
 *
 * Concrete example (caught by this check):
 *   v5.31 `Regenerate_Stored_Procs_For_Tolerant_Signatures` defines
 *   `__mj."spCreateComponentLibrary"` with 13 parameters.
 *   v5.32 `Add_ComponentLibrary_UsageInstructions` (output of `mj sql-convert`)
 *   emits `CREATE OR REPLACE FUNCTION __mj."spCreateComponentLibrary"` with
 *   14 parameters and no DROP first → migration fails at apply time.
 *
 * Test logic — order-aware, signature-comparing, no distance heuristic:
 *
 *   1. Enumerate `migrations-pg/v5/B*.pg.sql` then `V*.pg.sql` /
 *      `V*.pg-only.sql` in alphabetical (= timestamp) order.
 *   2. Walk each file in line order, tracking:
 *        - Drops in this file (function names that have been DROPped earlier
 *          in the file via `DROP FUNCTION` or via DO-block iteration of
 *          `pg_proc`).
 *        - Each `CREATE OR REPLACE FUNCTION X(...)`: extract the full
 *          parameter list and RETURN type (normalized — whitespace-collapsed,
 *          DEFAULT-value-stripped) into a "signature".
 *   3. For each CREATE event, decide:
 *        - Dropped earlier in this file → OK
 *        - Function not seen in any earlier file → first-time, OK
 *        - Function seen earlier but new signature == prior signature → OK
 *          (CREATE OR REPLACE works at apply time)
 *        - Function seen earlier with a DIFFERENT signature, no DROP → flag.
 *   4. After processing each file, record the latest signature observed so
 *      subsequent files compare against the most-recent definition.
 *
 * Static, no DB needed. Runs as part of the standard SQLConverter unit test
 * job, so it gates every PR through the existing on-push CI.
 *
 * Compared to a distance-based heuristic ("look 50 lines back for a DROP"),
 * this matches PostgreSQL's actual semantics — the function exists or it
 * doesn't, and if it exists the signatures must match. A 5,000-line
 * migration with a DROP at line 100 and a CREATE at line 4,800 is correctly
 * accepted; an identical re-creation in a later file (`spCreateAction`
 * baseline → `spCreateAction` v5.3 with same params) is NOT flagged because
 * the signature is unchanged.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const PG_MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'migrations-pg', 'v5');
const hasPGMigrations = existsSync(PG_MIGRATIONS_DIR);

interface CreateEvent {
    type: 'create';
    line: number;
    name: string;
    /** Normalized signature: param list + return type, whitespace-collapsed. */
    signature: string;
}

interface DropEvent {
    type: 'drop';
    line: number;
    name: string;
}

type FunctionEvent = CreateEvent | DropEvent;

interface Violation {
    file: string;
    line: number;
    funcName: string;
    priorSignature: string;
    currentSignature: string;
    priorFile: string;
}

/**
 * Walk forward from a given character position scanning balanced parentheses.
 * Returns the substring between the matched `(` and `)` (exclusive of the
 * outer parens), and the absolute position immediately after the closing `)`.
 *
 * Returns null if balance is never reached (malformed SQL).
 */
function readBalancedParens(
    text: string,
    openIdx: number,
): { inner: string; afterClose: number } | null {
    if (text[openIdx] !== '(') return null;
    let depth = 1;
    let i = openIdx + 1;
    while (i < text.length && depth > 0) {
        const ch = text[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        // Skip string literals (very rough — single-quote pair) so a `,`
        // inside a string default value doesn't mess up balanced-paren tracking.
        else if (ch === "'") {
            i++;
            while (i < text.length && text[i] !== "'") i++;
        }
        if (depth === 0) {
            return { inner: text.slice(openIdx + 1, i), afterClose: i + 1 };
        }
        i++;
    }
    return null;
}

/**
 * Read characters from a position until the next occurrence of one of the
 * stop keywords (case-insensitive, word-bounded). Returns the substring
 * (exclusive of the keyword) and absolute position of the keyword start.
 */
function readUntilKeyword(text: string, fromIdx: number, stopKeywords: string[]): string {
    const re = new RegExp(`\\b(${stopKeywords.join('|')})\\b`, 'i');
    const slice = text.slice(fromIdx);
    const match = re.exec(slice);
    if (!match) return slice;
    return slice.slice(0, match.index);
}

/**
 * Normalize a parameter list or return-type string so cosmetic differences
 * (whitespace, line breaks, DEFAULT values, parameter names with consistent
 * `p_` casing) don't trigger false positives. We deliberately KEEP types
 * because that's what PG actually compares.
 */
function normalizeSignaturePart(s: string): string {
    return s
        .replace(/\s+/g, ' ')                  // collapse all whitespace
        .replace(/\bDEFAULT\s+[^,)]+/gi, '')   // drop DEFAULT clauses (PG ignores defaults for OR REPLACE compat)
        .replace(/\s*,\s*/g, ',')              // tighten commas
        .trim()
        .toLowerCase();
}

/**
 * Strip block (`/​* ... *​/`) and line (`-- ...`) comments from a single line.
 * Tracks block-comment state across lines via the inBlockComment flag.
 */
function stripComments(
    line: string,
    inBlockComment: boolean,
): { code: string; inBlockComment: boolean } {
    let code = line;
    let inBlock = inBlockComment;

    if (inBlock) {
        const closeIdx = code.indexOf('*/');
        if (closeIdx === -1) return { code: '', inBlockComment: true };
        code = code.slice(closeIdx + 2);
        inBlock = false;
    }

    while (true) {
        const openIdx = code.indexOf('/*');
        if (openIdx === -1) break;
        const closeIdx = code.indexOf('*/', openIdx + 2);
        if (closeIdx === -1) {
            code = code.slice(0, openIdx);
            inBlock = true;
            break;
        }
        code = code.slice(0, openIdx) + code.slice(closeIdx + 2);
    }

    const dashIdx = code.indexOf('--');
    if (dashIdx !== -1) code = code.slice(0, dashIdx);

    return { code, inBlockComment: inBlock };
}

/**
 * Pre-process a file's content: strip comments line-by-line, track which
 * line each character originated on (for accurate violation reporting).
 */
function preprocessContent(content: string): { stripped: string; lineMap: number[] } {
    const stripped: string[] = [];
    const lineMap: number[] = [];
    let inBlockComment = false;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const result = stripComments(lines[i], inBlockComment);
        inBlockComment = result.inBlockComment;
        // Pad each character with its original line number for reporting
        for (let c = 0; c < result.code.length; c++) lineMap.push(i + 1);
        lineMap.push(i + 1); // for the \n
        stripped.push(result.code);
    }

    return { stripped: stripped.join('\n'), lineMap };
}

/**
 * Extract events (drops and creates with full signatures) from a migration
 * file in source order.
 */
function extractFunctionEvents(content: string): FunctionEvent[] {
    const { stripped, lineMap } = preprocessContent(content);
    const events: FunctionEvent[] = [];

    // 1. CREATE OR REPLACE FUNCTION events with full signature extraction
    const createRe = /\bCREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:[\w"]+\s*\.\s*)?"?([A-Za-z_][\w]*)"?\s*\(/gi;
    let createMatch: RegExpExecArray | null;
    while ((createMatch = createRe.exec(stripped)) !== null) {
        const funcName = createMatch[1];
        // The opening paren is the last char of the match
        const openParenIdx = createMatch.index + createMatch[0].length - 1;
        const params = readBalancedParens(stripped, openParenIdx);
        if (!params) continue;

        // Read the RETURNS clause: from after the closing paren to the next
        // `AS`, `LANGUAGE`, or `;`
        const returnsText = readUntilKeyword(
            stripped,
            params.afterClose,
            ['AS', 'LANGUAGE', ';'],
        );
        // Pull out just the type part: everything after the RETURNS keyword
        const returnsMatch = /\bRETURNS\s+([\s\S]*)/i.exec(returnsText);
        const returnType = returnsMatch ? returnsMatch[1] : '';

        const signature = `(${normalizeSignaturePart(params.inner)})returns ${normalizeSignaturePart(returnType)}`;
        const line = lineMap[createMatch.index] ?? 1;

        events.push({ type: 'create', line, name: funcName, signature });
    }

    // 2. DROP events: explicit `DROP FUNCTION ...` and DO-block `proname = '...'`
    const dropRe = /\bDROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:[\w"]+\s*\.\s*)?"?([A-Za-z_][\w]*)"?/gi;
    let dropMatch: RegExpExecArray | null;
    while ((dropMatch = dropRe.exec(stripped)) !== null) {
        events.push({
            type: 'drop',
            line: lineMap[dropMatch.index] ?? 1,
            name: dropMatch[1],
        });
    }

    const propnameRe = /\bproname\s*=\s*['"]([A-Za-z_][\w]*)['"]/gi;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propnameRe.exec(stripped)) !== null) {
        events.push({
            type: 'drop',
            line: lineMap[propMatch.index] ?? 1,
            name: propMatch[1],
        });
    }

    // Sort by line so we process in source order
    events.sort((a, b) => a.line - b.line);
    return events;
}

/**
 * Scan migrations-pg/v5 chronologically and return all signature-mismatch
 * violations.
 */
function findViolations(): Violation[] {
    if (!hasPGMigrations) return [];

    const allFiles = readdirSync(PG_MIGRATIONS_DIR);
    const baselineFiles = allFiles.filter((f) => /^B\d{12}__.*\.pg\.sql$/.test(f)).sort();
    const versionedFiles = allFiles
        .filter((f) => /^V\d{12}__.*\.(pg|pg-only)\.sql$/.test(f))
        .sort();
    const files = [...baselineFiles, ...versionedFiles];

    /** Most-recent (signature, file) per function name across all earlier files. */
    const lastDefined = new Map<string, { signature: string; file: string }>();
    const violations: Violation[] = [];

    for (const filename of files) {
        const filePath = join(PG_MIGRATIONS_DIR, filename);
        const content = readFileSync(filePath, 'utf-8');
        const events = extractFunctionEvents(content);

        const droppedInThisFile = new Set<string>();

        for (const event of events) {
            if (event.type === 'drop') {
                droppedInThisFile.add(event.name);
                continue;
            }

            // event.type === 'create'
            const prior = lastDefined.get(event.name);

            if (prior && !droppedInThisFile.has(event.name) && prior.signature !== event.signature) {
                violations.push({
                    file: filename,
                    line: event.line,
                    funcName: event.name,
                    priorFile: prior.file,
                    priorSignature: prior.signature,
                    currentSignature: event.signature,
                });
            }

            lastDefined.set(event.name, { signature: event.signature, file: filename });
        }
    }

    return violations;
}

// NOTE: This test is currently `describe.skip`. The naive premise — every
// CREATE OR REPLACE FUNCTION with a changed signature needs a DROP — is
// wrong. PostgreSQL actually allows adding new parameters with DEFAULT to
// the END of an existing function via CREATE OR REPLACE; the param-add
// case (which is the most common change) does NOT need a DROP. Only
// genuinely incompatible changes fail at apply time:
//   - Renaming an existing parameter
//   - Changing an existing parameter's type
//   - Changing the return type
//   - Removing a parameter
//
// Before re-enabling this test, rewrite the comparison to do param-by-param
// matching: flag only when an existing param's name/type changes, the
// return type changes, or params are removed (i.e. when the new signature
// is NOT a strict additive superset of the prior). Until that's done,
// the simpler idempotency check (in pg-migrations.yml) catches the actual
// failure class — partial-commit migrations that fail on re-apply.
//
// Kept here as a starting point for that future signature-aware version.
describe.skip(
    'PG migration: CREATE OR REPLACE FUNCTION with changed signature must DROP prior overload first',
    () => {
        it('every CREATE OR REPLACE FUNCTION whose signature differs from a prior definition must DROP it earlier in the same file', () => {
            const violations = findViolations();

            if (violations.length > 0) {
                const message = violations
                    .map(
                        (v) =>
                            `  ${v.file}:${v.line} — CREATE OR REPLACE FUNCTION "${v.funcName}" with changed signature, no prior DROP\n` +
                            `      Prior definition: ${v.priorFile}\n` +
                            `        signature: ${v.priorSignature}\n` +
                            `      Current attempt:\n` +
                            `        signature: ${v.currentSignature}\n` +
                            `      PostgreSQL rejects this at apply time with "cannot change ..." errors.\n` +
                            `      Add a DROP guard before the CREATE OR REPLACE:\n` +
                            `        DO $$ DECLARE r record;\n` +
                            `        BEGIN\n` +
                            `          FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc\n` +
                            `                   WHERE proname = '${v.funcName}'\n` +
                            `                     AND pronamespace = '__mj'::regnamespace\n` +
                            `          LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';\n` +
                            `          END LOOP;\n` +
                            `        END $$;\n`,
                    )
                    .join('\n');

                throw new Error(
                    `Found ${violations.length} PG migration function-signature change(s) without DROP guard:\n${message}`,
                );
            }

            expect(violations).toEqual([]);
        });
    },
);

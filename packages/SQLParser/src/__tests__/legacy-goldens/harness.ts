/**
 * Shared helpers for the legacy golden snapshots.
 *
 * A golden records the exact output of public sql-parser methods over the corpus. It is written
 * once from the unchanged code (`vitest run -u` on these files only) and compared on every later
 * run with `toMatchFileSnapshot`. Two forms exist:
 *
 * - **Hash goldens** (`<set>/<Group>.sha256.json`): one file per method group, mapping each corpus
 *   entry Id to the SHA-256 of the canonical JSON of `{ <method>: <output>, … }` for that entry.
 *   Used for the frozen methods, whose output must never change, and for reviewed methods whose
 *   full output would be too large to keep in git (LexSQL). On a mismatch the test prints every
 *   changed, added or removed entry Id together with its full actual output, so a failure is
 *   diagnosable without the old JSON.
 * - **Readable goldens** (`<set>/<Method>.json`): one line per entry, `"<Id>": <compact JSON>`, so
 *   a review diff shows exactly which entries changed. Used for the reviewed methods. To keep the
 *   shipped set small, a string of 64+ characters is written relative to the entry's own SQL:
 *   `{"$slice":[start,end]}` when it is an exact slice of the input, or
 *   `{"$patch":{"keep":[prefixLength,suffixLength],"text":"…"}}` when it shares a prefix and suffix
 *   with the input of 64+ characters in total (the output is input[0,prefix) + text +
 *   input[length-suffix, length)). A value that stops being an exact slice therefore shows up in
 *   the diff as text, which is exactly the change reviewers need to see.
 *
 * Canonical JSON rules (deterministic and complete):
 * - object keys are sorted; array order is kept;
 * - `undefined` becomes `{"$undefined": true}`, so a missing value and an undefined one differ;
 * - a `Map` becomes `{"$map": [[key, value], …]}` in insertion order, a `Set` `{"$set": […]}`;
 * - `NaN` / `Infinity` become `{"$number": "NaN"}` etc.; a bigint becomes `{"$bigint": "…"}`;
 * - functions are dropped; a repeated reference on the current path becomes `"$cycle"`;
 * - a method that throws records `{"$throws": "<message>"}` for that entry.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { LoadShippedCorpus, SyntheticCorpus } from '../corpus/index.js';
import type { CorpusEntry } from '../corpus/index.js';

/** A JSON value as written to a golden file. */
export type GoldenJSON = string | number | boolean | null | GoldenJSON[] | { [key: string]: GoldenJSON };

/** One method of a hash-golden group: its name in the output and how to run it for an entry. */
export interface GoldenMethod {
    Name: string;
    Run: (entry: CorpusEntry) => unknown;
}

const SQL_SERVER = new SQLServerDialect();
const POSTGRESQL = new PostgreSQLDialect();
const HERE = dirname(fileURLToPath(import.meta.url));
/** Shortest string the readable form writes as a slice of, or patch against, the input. */
const MIN_RELATIVE_LENGTH = 64;

/** The parser dialect for an entry. Only SQL Server and PostgreSQL entries reach the goldens. */
export function DialectFor(entry: CorpusEntry): SQLParserDialect {
    return entry.Dialect === 'postgresql' ? POSTGRESQL : SQL_SERVER;
}

function isGoldenDialect(entry: CorpusEntry): boolean {
    return entry.Dialect === 'sqlserver' || entry.Dialect === 'postgresql';
}

/** The two golden sets: synthetic (never changes) and shipped (changes when a shipped file does). */
export interface GoldenSet {
    Name: 'synthetic' | 'shipped';
    Entries: CorpusEntry[];
}

/** The SQL Server and PostgreSQL entries of each corpus, split so a shipped-file edit stays local. */
export function GoldenSets(): GoldenSet[] {
    return [
        { Name: 'synthetic', Entries: SyntheticCorpus.filter(isGoldenDialect) },
        { Name: 'shipped', Entries: LoadShippedCorpus().filter(isGoldenDialect) },
    ];
}

// ─── Canonical JSON ─────────────────────────────────────────────────────────

function normalizeNumber(value: number): GoldenJSON {
    return Number.isFinite(value) ? value : { $number: String(value) };
}

function normalizeObject(value: object, path: Set<object>): GoldenJSON {
    if (path.has(value)) return '$cycle';
    path.add(value);
    try {
        if (value instanceof Map) {
            return { $map: [...value.entries()].map(([k, v]) => [Normalize(k, path), Normalize(v, path)]) };
        }
        if (value instanceof Set) return { $set: [...value].map(v => Normalize(v, path)) };
        if (Array.isArray(value)) return value.map(v => Normalize(v, path));
        const out: { [key: string]: GoldenJSON } = {};
        for (const key of Object.keys(value).sort()) {
            const field: unknown = Reflect.get(value, key);
            if (typeof field === 'function') continue;
            out[key] = Normalize(field, path);
        }
        return out;
    } finally {
        path.delete(value);
    }
}

/** Converts any method output into a deterministic JSON value (rules in the file header). */
export function Normalize(value: unknown, path: Set<object> = new Set()): GoldenJSON {
    if (value === undefined) return { $undefined: true };
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return normalizeNumber(value);
    if (typeof value === 'bigint') return { $bigint: value.toString() };
    if (typeof value === 'function' || typeof value === 'symbol') return { $unserializable: typeof value };
    return normalizeObject(value, path);
}

/** Runs `fn`, normalising its result, or records the message it threw. */
export function Capture(fn: () => unknown): GoldenJSON {
    try {
        return Normalize(fn());
    } catch (error: unknown) {
        return { $throws: error instanceof Error ? error.message : String(error) };
    }
}

// ─── Hash goldens ───────────────────────────────────────────────────────────

/** The canonical output of every method of a group for one entry, keyed by method name. */
export function GroupOutput(entry: CorpusEntry, methods: GoldenMethod[]): GoldenJSON {
    const out: { [method: string]: GoldenJSON } = {};
    for (const method of methods) out[method.Name] = Capture(() => method.Run(entry));
    return out;
}

function sha256(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

function readStoredHashes(file: string): Map<string, string> {
    if (!existsSync(file)) return new Map();
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const stored = new Map<string, string>();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [id, hash] of Object.entries(parsed)) if (typeof hash === 'string') stored.set(id, hash);
    }
    return stored;
}

/** One line per entry whose hash differs from the stored file, with its full actual output. */
function describeMismatches(stored: Map<string, string>, hashes: Map<string, string>, outputs: Map<string, GoldenJSON>): string[] {
    const lines: string[] = [];
    for (const [id, hash] of hashes) {
        const before = stored.get(id);
        if (before === hash) continue;
        const label = before === undefined ? 'NEW ENTRY' : 'CHANGED';
        lines.push(`--- ${label} ${id}\n${JSON.stringify(outputs.get(id), null, 2)}`);
    }
    for (const id of stored.keys()) if (!hashes.has(id)) lines.push(`--- REMOVED ENTRY ${id}`);
    return lines;
}

function hashFileText(hashes: Map<string, string>): string {
    const lines = [...hashes].map(([id, hash]) => `  ${JSON.stringify(id)}: ${JSON.stringify(hash)}`);
    return `{\n${lines.join(',\n')}\n}\n`;
}

/**
 * Compares (or, under `-u`, writes) the hash golden of one method group over one set. Before the
 * snapshot comparison, prints each changed, added or removed entry with its full actual output.
 */
export async function ExpectHashGolden(set: GoldenSet, group: string, methods: GoldenMethod[]): Promise<void> {
    const relativePath = `./__snapshots__/legacy/${set.Name}/${group}.sha256.json`;
    const outputs = new Map<string, GoldenJSON>();
    const hashes = new Map<string, string>();
    for (const entry of set.Entries) {
        const output = GroupOutput(entry, methods);
        outputs.set(entry.Id, output);
        hashes.set(entry.Id, sha256(JSON.stringify(output)));
    }
    const stored = readStoredHashes(resolve(HERE, relativePath));
    const mismatches = stored.size === 0 ? [] : describeMismatches(stored, hashes, outputs);
    if (mismatches.length > 0) {
        console.error(`Legacy golden ${set.Name}/${group}: ${mismatches.length} entr(ies) differ from the stored hashes.\n${mismatches.join('\n')}`);
    }
    await expect(hashFileText(hashes)).toMatchFileSnapshot(relativePath);
}

// ─── Readable goldens ───────────────────────────────────────────────────────

function commonPrefixLength(a: string, b: string): number {
    const limit = Math.min(a.length, b.length);
    let i = 0;
    while (i < limit && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    return i;
}

function commonSuffixLength(a: string, b: string, prefix: number): number {
    const limit = Math.min(a.length, b.length) - prefix;
    let i = 0;
    while (i < limit && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++;
    return i;
}

/** A long string written relative to the entry's SQL (slice or patch), or as itself. */
function relativeString(value: string, sql: string): GoldenJSON {
    if (value.length < MIN_RELATIVE_LENGTH) return value;
    const start = sql.indexOf(value);
    if (start >= 0) return { $slice: [start, start + value.length] };
    const prefix = commonPrefixLength(value, sql);
    const suffix = commonSuffixLength(value, sql, prefix);
    if (prefix + suffix < MIN_RELATIVE_LENGTH) return value;
    return { $patch: { keep: [prefix, suffix], text: value.slice(prefix, value.length - suffix) } };
}

/** Rewrites every long string in a canonical value relative to the entry's SQL. */
export function RelativeToInput(value: GoldenJSON, sql: string): GoldenJSON {
    if (typeof value === 'string') return relativeString(value, sql);
    if (Array.isArray(value)) return value.map(v => RelativeToInput(v, sql));
    if (value !== null && typeof value === 'object') {
        const out: { [key: string]: GoldenJSON } = {};
        for (const key of Object.keys(value)) out[key] = RelativeToInput(value[key], sql);
        return out;
    }
    return value;
}

/** Compares (or, under `-u`, writes) the readable golden of one method over one set. */
export async function ExpectGolden(set: GoldenSet, method: string, run: (entry: CorpusEntry) => unknown): Promise<void> {
    const lines = set.Entries.map(entry => {
        const value = RelativeToInput(Capture(() => run(entry)), entry.SQL);
        return `  ${JSON.stringify(entry.Id)}: ${JSON.stringify(value)}`;
    });
    await expect(`{\n${lines.join(',\n')}\n}\n`).toMatchFileSnapshot(`./__snapshots__/legacy/${set.Name}/${method}.json`);
}

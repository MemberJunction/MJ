/**
 * Primary Key Compliance Tests
 *
 * Scans the MemberJunction source tree for code that assumes an entity's primary key is a single
 * column named `ID`. MJ supports primary keys with **any column name(s) and type(s)** — `ID`,
 * `individual_id`, or a composite `(OrderID, LineNo)` — and every MJ core entity happens to use
 * `ID`, so this class of bug is invisible in the core product and surfaces only on customer
 * entities mapped from external schemas: `Load()` rejects the invented field name with
 * "Primary key ID not found in entity ...", or a composite key is silently truncated to its
 * first column. Issue #4179 (search result click-through) was one instance; the sweep that
 * followed found the same shape in ~60 files.
 *
 * Modelled on `MultiProviderCompliance.test.ts` / `UUIDCompliance.test.ts` in MJGlobal. All four gates are strict.
 * See `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID".
 *
 * ## Gates
 *
 * 1. **Literal `ID` key construction — strict.** `{ FieldName: 'ID', ... }`,
 *    `LoadFromSingleKeyValuePair('ID', ...)`, `FromKeyValuePair('ID', ...)`.
 *    Fix: a literal MJ core entity → `CompositeKey.FromID(x)`; a variable entity →
 *    `CompositeKey.FromURLSegment(entityInfo, recordId)`. Marker: `// pk-literal-ok: <reason>`.
 *
 * 2. **Index access — strict.** `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
 *    Fix: `FirstPrimaryKey` — same semantics, but a named accessor gate 3 can see.
 *
 * 3. **Single-key assumption — strict, annotated.** `FirstPrimaryKey` and `CompositeKey.FromID(`
 *    assume one key column (and, for `FromID`, that it is called `ID`). They are legitimate where MJ
 *    is single-column *by design* — foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared
 *    keys, the bare-value URL shorthand, and literal MJ core entities — and wrong when used to build
 *    a load key or filter for an arbitrary entity (a composite key is silently truncated to its
 *    first column). Every remaining use must therefore either be self-evidently on a core entity or
 *    say why it is single-column:
 *      - `CompositeKey.FromID(x)` is exempt when a `'MJ: …'` entity literal appears on the same line
 *        or within the FROM_ID_LITERAL_WINDOW lines above it (the `GetEntityObject('MJ: …')` /
 *        `OpenEntityRecord('MJ: …', …)` that names the core entity).
 *      - Anything else carries `// first-pk-ok: <reason>` on the same line. The reason is required.
 *    Fix for the defect case: `CompositeKey.FromURLSegment(entityInfo, id)`,
 *    `CompositeKey.FromEntityRecord(entityInfo, row)`, `key.ToWhereClause()`, or iterate
 *    `entity.PrimaryKeys`; guard genuinely single-column code with `PrimaryKeys.length === 1`.
 *
 * 4. **Hardcoded `ID` predicate on a variable entity — strict.** An `ExtraFilter` of
 *    `ID = ...` / `ID IN (...)`, or `Fields: ['ID']`, within ±8 lines of an `EntityName:` whose
 *    value is a variable rather than a string literal or an ALL_CAPS constant.
 *    Fix: `${entityInfo.FirstPrimaryKey.Name} IN (...)` for single-column keys,
 *    `CompositeKey.FromURLSegment(entityInfo, id).ToWhereClause()` per record for composite.
 *    Marker: `// pk-filter-ok: <reason>`.
 *
 * Lines that are comments, imports, or carry the gate's marker are exempt. Test code, generated
 * code, `dist/`, and the test-tooling packages (`TestingFramework`, `UnitTesting`) are not scanned.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// This suite lives in .github/guards (NOT in a package) so it runs uncached, outside
// turbo's per-package cache key. See .github/guards/vitest.config.mts for why.
const SCAN_ROOT = path.resolve(__dirname, '..', '..', 'packages');

/** Gate 1 — a key constructed with a literal `ID` field name. */
const LITERAL_ID_KEY_PATTERNS = [
    /FieldName:\s*['"]ID['"]/,
    /LoadFromSingleKeyValuePair\(\s*['"]ID['"]/,
    /FromKeyValuePair\(\s*['"]ID['"]/,
];
const LITERAL_ID_MARKER = /\/\/\s*pk-literal-ok\b/i;

/** Gate 2 — positional access to the first primary key. */
const INDEX_ACCESS_PATTERNS = [
    /\bPrimaryKeys\[0\]/,
    /\bPrimaryKeys\.at\(\s*0\s*\)/,
];

/** Gate 3 — single-key assumptions: `FirstPrimaryKey` anywhere, `CompositeKey.FromID(` off a core-entity literal. */
const FIRST_PK_PATTERN = /\bFirstPrimaryKey\b/;
const FROM_ID_PATTERN = /\bCompositeKey\.FromID\(/;
/** `// first-pk-ok: <reason>` — the reason is mandatory. Also exempts the `FirstPrimaryKey` accessor's own `PrimaryKeys[0]` (gate 2). */
const SINGLE_KEY_MARKER = /\/\/\s*first-pk-ok:\s*\S/i;
/** A `'MJ: …'` entity-name literal; `FromID` on the same line or within the window above it is on a core entity by construction. */
const CORE_ENTITY_LITERAL = /['"`]MJ: [^'"`]+['"`]/;
const FROM_ID_LITERAL_WINDOW = 8;

/** Gate 4 — a hardcoded `ID` predicate or field list ... */
const ID_PREDICATE_PATTERNS = [
    /ExtraFilter:\s*[`'"]\s*\(?\s*ID\s*(=|IN\s*\()/,
    /Fields:\s*\[\s*['"]ID['"]\s*\]/,
];
/** ... near an `EntityName:` whose value is an expression, not a string literal. */
const ENTITY_NAME_EXPRESSION = /EntityName:\s*([A-Za-z_$][\w$]*(?:[.?!]+[A-Za-z_$][\w$]*)*)\s*(?:,|\}|$)/;
/** An ALL_CAPS identifier (or `Class.ALL_CAPS`) is a named literal, not a variable entity. */
const CONSTANT_IDENTIFIER = /^[A-Z][A-Z0-9_]*$/;
const ID_PREDICATE_MARKER = /\/\/\s*pk-filter-ok\b/i;
const ID_PREDICATE_WINDOW = 8;

/** Path patterns to skip. Normalized to forward slashes first (see UUIDCompliance.test.ts). */
const EXCLUDE_PATH_PATTERNS = [
    /node_modules/,
    /\/dist\//,
    /\/generated\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /__tests__\//,
    /\.d\.ts$/,
    /\/scripts\//,
    /\/rigs\//,
    /\/TestingFramework\//,   // integration checks — test infrastructure exercising MJ core entities
    /\/UnitTesting\//,        // test doubles (mock-entity.ts is a fixed ID-keyed fake by design)
];

interface Violation {
    packageKey: string;
    file: string;
    line: number;
    content: string;
}

function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

function shouldScanFile(filePath: string): boolean {
    if (!filePath.endsWith('.ts')) return false;
    const normalized = normalizePath(filePath);
    return !EXCLUDE_PATH_PATTERNS.some(p => p.test(normalized));
}

function findTsFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (['node_modules', 'dist', '.git', 'generated', '__tests__'].includes(entry.name)) continue;
            results.push(...findTsFiles(fullPath));
        } else if (shouldScanFile(fullPath)) {
            results.push(fullPath);
        }
    }
    return results;
}

/** The nearest ancestor directory holding a package.json, relative to packages/ — e.g. `Angular/Explorer/explorer-core`. */
function getPackageKey(filePath: string): string {
    let dir = path.dirname(filePath);
    while (dir.length > SCAN_ROOT.length) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return normalizePath(path.relative(SCAN_ROOT, dir));
        }
        dir = path.dirname(dir);
    }
    return normalizePath(path.relative(SCAN_ROOT, path.dirname(filePath)));
}

function isCommentOrImport(trimmed: string): boolean {
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('import ');
}

interface ScanResult {
    literalIdKeys: Violation[];
    indexAccess: Violation[];
    singleKey: Violation[];
    idPredicates: Violation[];
}

function scanFile(filePath: string): ScanResult {
    const out: ScanResult = { literalIdKeys: [], indexAccess: [], singleKey: [], idPredicates: [] };
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const packageKey = getPackageKey(filePath);
    const file = normalizePath(path.relative(SCAN_ROOT, filePath));
    const violation = (i: number): Violation => ({ packageKey, file, line: i + 1, content: lines[i].trim().substring(0, 160) });

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isCommentOrImport(line.trim())) continue;

        if (!LITERAL_ID_MARKER.test(line) && LITERAL_ID_KEY_PATTERNS.some(p => p.test(line))) {
            out.literalIdKeys.push(violation(i));
        }
        if (!SINGLE_KEY_MARKER.test(line) && INDEX_ACCESS_PATTERNS.some(p => p.test(line))) {
            out.indexAccess.push(violation(i)); // marker exempts the FirstPrimaryKey accessor's own body
        }
        if (!SINGLE_KEY_MARKER.test(line)) {
            if (FIRST_PK_PATTERN.test(line)) {
                out.singleKey.push(violation(i));
            } else if (FROM_ID_PATTERN.test(line) && !hasCoreEntityLiteralNearby(lines, i)) {
                out.singleKey.push(violation(i));
            }
        }
        if (!ID_PREDICATE_MARKER.test(line) && ID_PREDICATE_PATTERNS.some(p => p.test(line)) && hasVariableEntityNameNearby(lines, i)) {
            out.idPredicates.push(violation(i));
        }
    }
    return out;
}

/** True when a `'MJ: …'` entity literal is on this line or within FROM_ID_LITERAL_WINDOW lines above it. */
function hasCoreEntityLiteralNearby(lines: string[], index: number): boolean {
    const from = Math.max(0, index - FROM_ID_LITERAL_WINDOW);
    for (let j = index; j >= from; j--) {
        if (CORE_ENTITY_LITERAL.test(lines[j])) return true;
    }
    return false;
}

/** True when an `EntityName:` within the window names a variable (not a literal or an ALL_CAPS constant). */
function hasVariableEntityNameNearby(lines: string[], index: number): boolean {
    const from = Math.max(0, index - ID_PREDICATE_WINDOW);
    const to = Math.min(lines.length - 1, index + ID_PREDICATE_WINDOW);
    for (let j = from; j <= to; j++) {
        const trimmed = lines[j].trim();
        if (isCommentOrImport(trimmed)) continue;
        const match = ENTITY_NAME_EXPRESSION.exec(lines[j]);
        if (!match) continue;
        const lastSegment = match[1].split(/[.?!]+/).pop() ?? '';
        if (!CONSTANT_IDENTIFIER.test(lastSegment)) return true;
    }
    return false;
}

function report(violations: Violation[], max = 60): string {
    const shown = violations.slice(0, max).map(v => `  ${v.file}:${v.line}: ${v.content}`).join('\n');
    const more = violations.length > max ? `\n  ... and ${violations.length - max} more` : '';
    return shown + more;
}

function scanAll(): ScanResult {
    const all: ScanResult = { literalIdKeys: [], indexAccess: [], singleKey: [], idPredicates: [] };
    for (const file of findTsFiles(SCAN_ROOT)) {
        const r = scanFile(file);
        all.literalIdKeys.push(...r.literalIdKeys);
        all.indexAccess.push(...r.indexAccess);
        all.singleKey.push(...r.singleKey);
        all.idPredicates.push(...r.idPredicates);
    }
    return all;
}

const RESULTS = scanAll();

describe('Primary Key Compliance', () => {
    it('gate 1: never constructs a key with a literal `ID` field name', () => {
        const v = RESULTS.literalIdKeys;
        if (v.length === 0) return;
        expect.fail(
            `Found ${v.length} key(s) built with a hardcoded 'ID' field name:\n${report(v)}\n\n` +
            `MJ primary keys can have any column name(s); Load() rejects a field that is not one of the\n` +
            `entity's primary keys ("Primary key ID not found in entity ...").\n\n` +
            `How to fix:\n` +
            `  1. Literal MJ core entity ('MJ: AI Agents', ...): CompositeKey.FromID(value)\n` +
            `  2. Entity is a variable (entityName, entityInfo, event.EntityName):\n` +
            `       CompositeKey.FromURLSegment(md.EntityByName(entityName), recordId)\n` +
            `     — reads a bare value (mapped onto the entity's first PK) or a "F1|v1||F2|v2" segment.\n` +
            `  3. Key from a data row: CompositeKey.FromEntityRecord(entityInfo, row)\n` +
            `  4. Genuinely fixed-schema code: append  // pk-literal-ok: <reason>  on the line.`
        );
    });

    it('gate 2: never indexes PrimaryKeys[0] — use FirstPrimaryKey', () => {
        const v = RESULTS.indexAccess;
        if (v.length === 0) return;
        expect.fail(
            `Found ${v.length} PrimaryKeys[0] access(es):\n${report(v)}\n\n` +
            `Replace with entity.FirstPrimaryKey (identical semantics, null-safe with ?., and a named\n` +
            `accessor gate 3 can see). If the code must handle composite keys, iterate PrimaryKeys or\n` +
            `use CompositeKey.FromEntityRecord / FromURLSegment instead.`
        );
    });

    it('gate 3: every single-key assumption (FirstPrimaryKey / CompositeKey.FromID) is on a core entity or annotated', () => {
        const v = RESULTS.singleKey;
        if (v.length === 0) return;
        expect.fail(
            `Found ${v.length} unexplained single-key assumption(s):\n${report(v)}\n\n` +
            `FirstPrimaryKey and CompositeKey.FromID assume one key column (FromID: one column named ID).\n` +
            `They are correct only where MJ is single-column BY DESIGN: foreign-key targets, keyset ORDER BY /\n` +
            `AfterKey, IS-A shared keys, the bare-value URL shorthand, and MJ core entities.\n\n` +
            `How to fix:\n` +
            `  1. Building a key or filter for an ARBITRARY entity: CompositeKey.FromURLSegment(entityInfo, id),\n` +
            `     CompositeKey.FromEntityRecord(entityInfo, row), key.ToWhereClause(), or iterate entity.PrimaryKeys.\n` +
            `     Guard code that is genuinely single-column with entity.PrimaryKeys.length === 1.\n` +
            `  2. FromID on a core entity: keep the 'MJ: …' literal on the same line or within ${FROM_ID_LITERAL_WINDOW}\n` +
            `     lines above (the GetEntityObject / OpenEntityRecord call) and no annotation is needed.\n` +
            `  3. Legitimately single-column: append  // first-pk-ok: <reason>  on the line. The reason is required.`
        );
    });

    it('gate 4: never hardcodes an `ID` predicate or field list against a variable entity', () => {
        const v = RESULTS.idPredicates;
        if (v.length === 0) return;
        expect.fail(
            `Found ${v.length} hardcoded 'ID' filter(s)/field list(s) on a variable entity:\n${report(v)}\n\n` +
            `The entity in these RunView calls is not a literal, so its key column can have any name.\n\n` +
            `How to fix:\n` +
            `  1. Single-column keys: \`\${entityInfo.FirstPrimaryKey.Name} IN (...)\` and\n` +
            `     Fields: [entityInfo.FirstPrimaryKey.Name]\n` +
            `  2. Composite keys: one CompositeKey.FromURLSegment(entityInfo, id).ToWhereClause() per record,\n` +
            `     Fields: entityInfo.PrimaryKeys.map(pk => pk.Name)\n` +
            `  3. Callers provably pass MJ core entities only: append  // pk-filter-ok: <reason>  on the line.`
        );
    });
});

/**
 * Field-Security Egress Compliance (source guard)
 *
 * Scans the code that hands entity values to someone outside the server process (GraphQL
 * resolvers, REST handlers, the MCP and A2A servers, and actions) for the calls that turn an
 * entity object into plain values:
 *   - `.GetAll(`
 *   - `.GetDataObject(`
 *   - `.GetDataObjectJSON(`
 *   - `JSON.stringify(<entity>)` (heuristic, below)
 *
 * An entity object built for a restricted user never holds a value that user is denied, so most
 * of these calls are safe. They are flagged anyway because the object's width depends on WHO it
 * was built for: an object loaded as the system user, taken from an engine cache, or created
 * with no user carries every column, and serializing it to a caller leaks what field-level
 * security denies them. Each flagged line must therefore say why it is safe, or route its values
 * through `ProjectEntityValuesForUser` / `ProjectEntityValueRowsForUser` from `@memberjunction/core`.
 *
 * See guides/FIELD_LEVEL_SECURITY_GUIDE.md, "Building on field-level security".
 *
 * ## Allow comments
 *
 * A flagged line passes when it, or the line immediately above it, carries
 * `// fls-guard: <reason>`. Keep the reason short and specific, for example:
 *   - `// fls-guard: projected by ProjectEntityValuesForUser below`
 *   - `// fls-guard: loaded as the caller; width follows its user`
 *   - `// fls-guard: system-user-only resolver`
 * A marker with no reason does not count.
 *
 * ## The JSON.stringify heuristic
 *
 * Types are not available to a text scan, so `JSON.stringify(x)` is flagged only when its first
 * argument is a plain identifier or member path (no call, index or literal) whose LAST segment is
 * named like an entity object: `entity`, `record`, `entityObject`, `fooEntity`, `fooRecord`,
 * `fooEntityObject` (any case). `JSON.stringify(result.EntityUpdateDates)` or
 * `JSON.stringify(rows)` are not flagged. This misses entities held under other names; it is a
 * reminder that runs on every PR, not a proof.
 *
 * ## Scope
 *
 * `MJServer/src/resolvers`, `MJServer/src/rest`, `AI/MCPServer/src`, `AI/A2AServer/src`, and every
 * `src/` folder under `Actions/`. Tests, generated code, `dist/` and `.d.ts` files are skipped, as are
 * pure comment lines and imports.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PACKAGES_ROOT = path.resolve(__dirname, '..', '..', '..'); // packages/

/** Folders scanned, relative to packages/. `Actions` is walked for every nested `src/`. */
const SCAN_DIRS = [
    'MJServer/src/resolvers',
    'MJServer/src/rest',
    'AI/MCPServer/src',
    'AI/A2AServer/src',
    'Actions',
];

/** Calls that produce an entity's field values as plain data. */
const ACCESSOR_PATTERN = /\.(GetAll|GetDataObject|GetDataObjectJSON)\s*\(/;

/** `JSON.stringify(<path>)` where the last path segment is named like an entity object. */
const STRINGIFY_ENTITY_PATTERN =
    /JSON\.stringify\(\s*(?:[A-Za-z_$][\w$]*\??\.)*(?:entity|record|entityObject|[A-Za-z_$][\w$]*(?:Entity|Record|EntityObject))\s*[,)]/i;

/** The allow marker, with a non-empty reason after it. */
const ALLOW_COMMENT = /\/\/\s*fls-guard:\s*\S/;

const EXCLUDE_PATH_PATTERNS = [
    /node_modules/,
    /\/dist\//,
    /\/generated\//,
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /__tests__/,
    /\.d\.ts$/,
];

interface Violation {
    file: string;
    line: number;
    content: string;
}

function shouldScanFile(filePath: string): boolean {
    if (!filePath.endsWith('.ts')) return false;
    if (EXCLUDE_PATH_PATTERNS.some(p => p.test(filePath))) return false;
    // Under Actions, only package source counts: skip scripts, fixtures and the like.
    const relative = path.relative(PACKAGES_ROOT, filePath).split(path.sep).join('/');
    return !relative.startsWith('Actions/') || relative.includes('/src/');
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

/** True when `line` serializes an entity in a way this guard flags. Exported shape for the self-test. */
function lineSerializesEntity(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
    if (trimmed.startsWith('import ')) return false;
    return ACCESSOR_PATTERN.test(line) || STRINGIFY_ENTITY_PATTERN.test(line);
}

/** True when line `index` of `lines`, or the line above it, carries the allow marker. */
function isAllowed(lines: string[], index: number): boolean {
    return ALLOW_COMMENT.test(lines[index]) || (index > 0 && ALLOW_COMMENT.test(lines[index - 1]));
}

function scanLines(lines: string[], file: string): Violation[] {
    const violations: Violation[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lineSerializesEntity(lines[i]) && !isAllowed(lines, i)) {
            violations.push({ file, line: i + 1, content: lines[i].trim().substring(0, 160) });
        }
    }
    return violations;
}

function scanFile(filePath: string): Violation[] {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    return scanLines(lines, path.relative(PACKAGES_ROOT, filePath));
}

describe('Field-Security Egress Compliance', () => {
    describe('the heuristic', () => {
        it('flags the entity accessors', () => {
            expect(lineSerializesEntity('return entity.GetAll();')).toBe(true);
            expect(lineSerializesEntity('const v = await record.GetDataObject({')).toBe(true);
            expect(lineSerializesEntity('res.json(await e.GetDataObjectJSON())')).toBe(true);
        });

        it('flags JSON.stringify of something named like an entity', () => {
            expect(lineSerializesEntity('JSON.stringify(entity)')).toBe(true);
            expect(lineSerializesEntity('JSON.stringify(this.entityObject, null, 2)')).toBe(true);
            expect(lineSerializesEntity('JSON.stringify(userRecord)')).toBe(true);
            expect(lineSerializesEntity('JSON.stringify(params.fileEntity)')).toBe(true);
        });

        it('does not flag plain data, comments or imports', () => {
            expect(lineSerializesEntity('JSON.stringify(result.EntityUpdateDates)')).toBe(false);
            expect(lineSerializesEntity('JSON.stringify(rows)')).toBe(false);
            expect(lineSerializesEntity('JSON.stringify(entities[i])')).toBe(false);
            expect(lineSerializesEntity(' * Uses entity.GetAll() for scalar fields')).toBe(false);
            expect(lineSerializesEntity('// entity.GetAll() is projected below')).toBe(false);
        });

        it('accepts an allow comment with a reason on the line or the line above', () => {
            expect(scanLines(['x = e.GetAll(); // fls-guard: system user only'], 'f')).toHaveLength(0);
            expect(scanLines(['// fls-guard: projected below', 'x = e.GetAll();'], 'f')).toHaveLength(0);
            expect(scanLines(['x = e.GetAll(); // fls-guard:'], 'f')).toHaveLength(1);
            expect(scanLines(['// fls-guard: two lines up', '', 'x = e.GetAll();'], 'f')).toHaveLength(1);
        });
    });

    it('every entity serialization in a transport or action is projected or explains why it is safe', () => {
        const files = SCAN_DIRS.flatMap(dir => findTsFiles(path.join(PACKAGES_ROOT, dir)));
        expect(files.length).toBeGreaterThan(0);
        const violations = files.flatMap(scanFile);
        if (violations.length === 0) return;

        const report = violations.map(v => `  ${v.file}:${v.line}: ${v.content}`).join('\n');
        expect.fail(
            `Found ${violations.length} entity serialization(s) with no field-security note:\n${report}\n\n` +
            `An entity object loaded as the system user, taken from an engine cache, or created with no\n` +
            `user holds every column, and serializing it to a caller leaks the fields they are denied.\n\n` +
            `How to fix:\n` +
            `  1. Route the values through ProjectEntityValuesForUser / ProjectEntityValueRowsForUser\n` +
            `     (@memberjunction/core) for the principal who receives them, then mark the line.\n` +
            `  2. If the object was built for that same principal (its width follows its user), or the path\n` +
            `     is system-user-only, say so: \`// fls-guard: <reason>\` on the line or the line above.\n\n` +
            `See guides/FIELD_LEVEL_SECURITY_GUIDE.md, "Building on field-level security".`
        );
    });
});

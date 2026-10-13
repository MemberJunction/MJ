/**
 * Repo guard: no new callers of the deprecated GetUserRowLevelSecurityWhereClause.
 *
 * That method is ROLE RLS ONLY — it honors the role-RLS exemption and silently
 * omits API-key row filters, so any enforcement point calling it directly is
 * fail-open for filtered API-key sessions. Every enforcement point must call
 * GetEffectiveRowFilterWhereClause instead, which composes all filter layers.
 *
 * The ONLY allowed occurrences are in entityInfo.ts: the definition itself and
 * the wrapper call inside GetEffectiveRowFilterWhereClause.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const FORBIDDEN_CALL = 'GetUserRowLevelSecurityWhereClause(';

// Only these package src trees can plausibly reach RLS clause construction —
// keeping the scan targeted keeps the test fast (< 1s).
const SCANNED_PACKAGES = [
    'MJCore',
    'GenericDatabaseProvider',
    'MJServer',
    'SearchEngine',
    'SQLServerDataProvider',
    'PostgreSQLDataProvider',
    'MJCoreEntitiesServer',
    'APIKeys',
];

const EXCLUDED_DIR_NAMES = new Set(['__tests__', 'node_modules', 'dist', 'TestingFramework']);

const thisDir = path.dirname(fileURLToPath(import.meta.url));
// __tests__ → src → MJCore → packages
const packagesRoot = path.resolve(thisDir, '..', '..', '..');
const allowedFile = path.join(packagesRoot, 'MJCore', 'src', 'generic', 'entityInfo.ts');

function collectTypeScriptFiles(dir: string, out: string[]): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return; // directory disappeared or unreadable — nothing to scan
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!EXCLUDED_DIR_NAMES.has(entry.name)) {
                collectTypeScriptFiles(full, out);
            }
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            out.push(full);
        }
    }
}

describe('Repo guard: GetUserRowLevelSecurityWhereClause callers', () => {
    it('sanity: the packages root and the allowed definition file exist', () => {
        expect(fs.existsSync(allowedFile)).toBe(true);
        // Guard the guard: the allowed file must actually contain the token,
        // otherwise a rename would make this test pass vacuously forever.
        const content = fs.readFileSync(allowedFile, 'utf-8');
        expect(content).toContain(FORBIDDEN_CALL);
    });

    it('no source file outside entityInfo.ts references GetUserRowLevelSecurityWhereClause(', () => {
        const files: string[] = [];
        for (const pkg of SCANNED_PACKAGES) {
            const srcDir = path.join(packagesRoot, pkg, 'src');
            collectTypeScriptFiles(srcDir, files);
        }
        expect(files.length).toBeGreaterThan(0);

        const offenders = files.filter(f => {
            if (path.resolve(f) === path.resolve(allowedFile)) {
                return false;
            }
            const content = fs.readFileSync(f, 'utf-8');
            return content.includes(FORBIDDEN_CALL);
        });

        expect(offenders, `Callers of the deprecated role-only RLS method found — use GetEffectiveRowFilterWhereClause instead: ${offenders.join(', ')}`).toEqual([]);
    });
});

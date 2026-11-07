/**
 * Guard for #3427: hand-written resolvers run SQL through the request's provider
 * (`provider.ExecuteSQL` / `RunQuery`), which works on SQL Server and PostgreSQL. A resolver that
 * opens an mssql `Request` or imports the mssql driver fails on every PostgreSQL install.
 * Generated resolvers (`src/generated/`) are out of scope. The allowlist is empty on purpose.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const RESOLVERS_DIR = resolve(__dirname, '../resolvers');
const ALLOWLIST: ReadonlySet<string> = new Set<string>();

const FORBIDDEN: ReadonlyArray<{ label: string; pattern: RegExp }> = [
    { label: 'new sql.Request(', pattern: /new\s+sql\.Request\s*\(/ },
    { label: 'new mssql.Request(', pattern: /new\s+mssql\.Request\s*\(/ },
    { label: "an import of 'mssql'", pattern: /^\s*import\s[^;]*from\s+['"]mssql['"]/m },
];

function resolverFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (name === 'generated') continue;
            out.push(...resolverFiles(full));
        } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
            out.push(full);
        }
    }
    return out;
}

describe('resolvers do not use the mssql driver directly', () => {
    it('finds resolver files to scan', () => {
        expect(resolverFiles(RESOLVERS_DIR).length).toBeGreaterThan(0);
    });

    it('no hand-written resolver opens an mssql Request or imports mssql', () => {
        const offenders: string[] = [];
        for (const file of resolverFiles(RESOLVERS_DIR)) {
            const rel = relative(RESOLVERS_DIR, file);
            if (ALLOWLIST.has(rel)) continue;
            const src = readFileSync(file, 'utf8');
            for (const { label, pattern } of FORBIDDEN) {
                if (pattern.test(src)) offenders.push(`${rel}: ${label}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

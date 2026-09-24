import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED = new Set([
    '@memberjunction/core', '@memberjunction/core-entities', '@memberjunction/global', '@memberjunction/work-queue-core',
]);

const NODE_BUILTINS = 'assert|buffer|child_process|cluster|crypto|dns|events|fs|http|https|net|os|path|process|readline|stream|tls|url|util|worker_threads|zlib';
const SERVER_ONLY = '@memberjunction/sql-dialect|@memberjunction/work-queue-engine|@memberjunction/work-queue-aws';
/** Matches `from '…'`, side-effect `import '…'`, `require('…')` and `export … from '…'`, single- or double-quoted. */
const FORBIDDEN_IMPORT = new RegExp(
    `(?:from\\s*|import\\s*|require\\(\\s*)['"](?:node:[^'"]+|(?:${NODE_BUILTINS})(?:/[^'"]*)?|(?:${SERVER_ONLY})(?:/[^'"]*)?)['"]`,
);

function SourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            return entry === '__tests__' ? [] : SourceFiles(full);
        }
        return full.endsWith('.ts') ? [full] : [];
    });
}

describe('work-queue-base dependency guard', () => {
    it('declares only browser-safe MemberJunction dependencies', () => {
        const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as {
            dependencies?: Record<string, string>;
        };
        for (const name of Object.keys(pkg.dependencies ?? {})) {
            expect(ALLOWED.has(name), `unexpected dependency ${name}`).toBe(true);
        }
    });

    it('imports nothing server-only (node builtins, sql-dialect, the engine, drivers)', () => {
        const offenders: string[] = [];
        for (const file of SourceFiles(fileURLToPath(new URL('../', import.meta.url)))) {
            if (FORBIDDEN_IMPORT.test(readFileSync(file, 'utf8'))) {
                offenders.push(file);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('recognises every import form', () => {
        const forbidden = [
            `import { readFileSync } from 'node:fs';`, `import fs from "fs";`, `import 'node:crypto';`,
            `const os = require('os');`, `import { SQLDialect } from "@memberjunction/sql-dialect";`,
            `import '@memberjunction/work-queue-engine';`, `export * from '@memberjunction/work-queue-aws';`,
        ];
        for (const line of forbidden) {
            expect(FORBIDDEN_IMPORT.test(line), line).toBe(true);
        }
        expect(FORBIDDEN_IMPORT.test(`import { UserInfo } from '@memberjunction/core';`)).toBe(false);
        expect(FORBIDDEN_IMPORT.test(`import { x } from './paths';`)).toBe(false);
    });
});

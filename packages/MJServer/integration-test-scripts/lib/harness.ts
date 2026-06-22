/**
 * harness.ts — shared infrastructure for the live RunView-caching integration scripts.
 *
 * Provides:
 *  - LoadEnv(): loads the repo-root .env (no hardcoded secrets anywhere in the suite)
 *  - LoadDbConfig(): resolves DB connection settings from mj.config.cjs + env, the same
 *    way packages/AI/Vectors/Dupe/scripts/run-dupe-detection.ts does
 *  - LoadClientConfig(): resolves the MJAPI GraphQL URL + system API key from env
 *  - TestRunner: a tiny sequential test runner with a pass/fail summary table
 *  - Assert helpers tailored to result-shape verification (the core concern of these tests)
 *  - InstrumentedLocalStorageProvider: wraps any ILocalStorageProvider with call counters
 *    so tests can prove cache reads/writes actually happened (or didn't)
 *
 * This file is NOT part of the MJServer build (tsconfig includes ./src only) — it is
 * executed directly via tsx from the repo root. See ../README.md.
 */
import dotenv from 'dotenv';
import path from 'path';
import type { ILocalStorageProvider } from '@memberjunction/core';

// ────────────────────────────────────────────────────────────────────────────
// Environment / configuration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Loads the repo-root .env into process.env. Must be called from a process whose
 * cwd is the repository root (documented usage for all scripts in this suite).
 */
export function LoadEnv(): void {
    dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
}

export interface DbConfig {
    Host: string;
    Port: number;
    User: string;
    Password: string;
    Database: string;
    Schema: string;
}

/**
 * Resolves database settings from mj.config.cjs (databaseSettings) with .env
 * fallbacks — the same resolution order used by the existing script harnesses.
 * Throws with a clear message when required settings are missing.
 */
export async function LoadDbConfig(): Promise<DbConfig> {
    // Dynamic import is required here: cosmiconfig is ESM-only and this script runs
    // under tsx's CJS interop. Same pattern as run-dupe-detection.ts.
    const { cosmiconfig } = await import('cosmiconfig');
    const explorer = cosmiconfig('mj');
    const configResult = await explorer.search();
    const config = configResult?.config ?? {};
    const dbSettings = config.databaseSettings ?? {};

    const host = dbSettings.host || process.env.DB_HOST;
    const user = dbSettings.user || process.env.DB_USERNAME;
    const password = dbSettings.password || process.env.DB_PASSWORD;
    const database = dbSettings.database || process.env.DB_DATABASE;
    if (!host || !user || !password || !database) {
        throw new Error(
            'Missing DB settings. Provide them via mj.config.cjs databaseSettings or .env ' +
            '(DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE). Run from the repo root.'
        );
    }
    return {
        Host: host,
        Port: Number(dbSettings.port ?? process.env.DB_PORT ?? 1433),
        User: user,
        Password: password,
        Database: database,
        Schema: config.mjCoreSchema || dbSettings.mjCoreSchema || '__mj'
    };
}

export interface ClientConfig {
    Url: string;
    MJAPIKey: string;
}

/**
 * Resolves the MJAPI GraphQL endpoint and system API key from env:
 *  - MJAPI_URL overrides everything; otherwise http://localhost:{GRAPHQL_PORT}{GRAPHQL_ROOT_PATH}
 *  - MJ_API_KEY is the system API key MJServer accepts via the x-mj-api-key header
 */
export function LoadClientConfig(): ClientConfig {
    const apiKey = process.env.MJ_API_KEY;
    if (!apiKey) {
        throw new Error('MJ_API_KEY is not set in the environment — required for client-side tests.');
    }
    const port = process.env.GRAPHQL_PORT ?? '4000';
    const rootPath = process.env.GRAPHQL_ROOT_PATH ?? '/';
    const url = process.env.MJAPI_URL ?? `http://localhost:${port}${rootPath.startsWith('/') ? rootPath : `/${rootPath}`}`;
    return { Url: url, MJAPIKey: apiKey };
}

// ────────────────────────────────────────────────────────────────────────────
// Test runner
// ────────────────────────────────────────────────────────────────────────────

interface TestCase {
    Name: string;
    Fn: () => Promise<void>;
}

interface TestOutcome {
    Name: string;
    Passed: boolean;
    DurationMs: number;
    Error?: string;
}

/**
 * Minimal sequential test runner. Tests run in registration order (several tests
 * intentionally depend on cache state built up by earlier ones — order matters and
 * is part of what's being tested). Returns the number of failures from Run().
 */
export class TestRunner {
    private tests: TestCase[] = [];

    constructor(public readonly SuiteName: string) {}

    public Test(name: string, fn: () => Promise<void>): void {
        this.tests.push({ Name: name, Fn: fn });
    }

    public async Run(): Promise<number> {
        console.log(`\n══════ ${this.SuiteName} — ${this.tests.length} tests ══════\n`);
        const outcomes: TestOutcome[] = [];
        for (const test of this.tests) {
            const start = Date.now();
            try {
                await test.Fn();
                outcomes.push({ Name: test.Name, Passed: true, DurationMs: Date.now() - start });
                console.log(`  ✓ ${test.Name} (${Date.now() - start}ms)`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                outcomes.push({ Name: test.Name, Passed: false, DurationMs: Date.now() - start, Error: message });
                console.log(`  ✗ ${test.Name} (${Date.now() - start}ms)`);
                console.log(`      ${message}`);
            }
        }
        const failed = outcomes.filter(o => !o.Passed);
        console.log(`\n────── ${this.SuiteName}: ${outcomes.length - failed.length}/${outcomes.length} passed ──────`);
        if (failed.length > 0) {
            console.log('\nFailures:');
            for (const f of failed) {
                console.log(`  ✗ ${f.Name}\n      ${f.Error}`);
            }
        }
        return failed.length;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Assertions
// ────────────────────────────────────────────────────────────────────────────

export function Assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

export function AssertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

/** Sorted, lowercased key list of a result row — the canonical "shape" of a row. */
export function RowKeys(row: Record<string, unknown>): string[] {
    return Object.keys(row).map(k => k.toLowerCase()).sort();
}

/**
 * Asserts a row has EXACTLY the expected keys (case-insensitive, order-insensitive).
 * This is the core assertion of the suite: cache hit and cache miss must produce
 * identical shapes for identical requests.
 */
export function AssertRowShape(row: Record<string, unknown>, expectedKeys: string[], message: string): void {
    const actual = RowKeys(row);
    const expected = [...expectedKeys.map(k => k.toLowerCase())].sort();
    if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
        throw new Error(`${message} — expected keys [${expected.join(', ')}], got [${actual.join(', ')}]`);
    }
}

export function AssertKeysInclude(row: Record<string, unknown>, keys: string[], message: string): void {
    const actual = new Set(RowKeys(row));
    const missing = keys.filter(k => !actual.has(k.toLowerCase()));
    if (missing.length > 0) {
        throw new Error(`${message} — missing keys [${missing.join(', ')}]; present: [${[...actual].join(', ')}]`);
    }
}

export function AssertKeysExclude(row: Record<string, unknown>, keys: string[], message: string): void {
    const actual = new Set(RowKeys(row));
    const present = keys.filter(k => actual.has(k.toLowerCase()));
    if (present.length > 0) {
        throw new Error(`${message} — keys [${present.join(', ')}] should NOT be present`);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Instrumented storage provider
// ────────────────────────────────────────────────────────────────────────────

/**
 * Wraps any ILocalStorageProvider with call counters so tests can prove cache
 * behavior from the outside: a cache WRITE shows up as SetItemCount++, a cache
 * READ as GetItemCount/GetItemsCount++, and "served without touching storage"
 * (e.g. a dedup/linger hit) as no counter movement at all.
 */
export class InstrumentedLocalStorageProvider implements ILocalStorageProvider {
    public GetItemCount = 0;
    public GetItemsCount = 0;
    public SetItemCount = 0;
    public RemoveCount = 0;
    private perCategory = new Map<string, { Gets: number; Sets: number }>();

    constructor(private readonly inner: ILocalStorageProvider) {}

    public ResetCounts(): void {
        this.GetItemCount = 0;
        this.GetItemsCount = 0;
        this.SetItemCount = 0;
        this.RemoveCount = 0;
        this.perCategory.clear();
    }

    /**
     * Per-category counters — IMPORTANT for assertions: LocalCacheManager also
     * persists its registry index asynchronously (a different category), so tests
     * about RunView cache traffic must scope to the 'RunViewCache' category rather
     * than the global counters.
     */
    public GetCount(category: string): number {
        return this.perCategory.get(category)?.Gets ?? 0;
    }

    public SetCount(category: string): number {
        return this.perCategory.get(category)?.Sets ?? 0;
    }

    private bump(category: string | undefined, kind: 'Gets' | 'Sets'): void {
        const key = category ?? 'default';
        const entry = this.perCategory.get(key) ?? { Gets: 0, Sets: 0 };
        entry[kind]++;
        this.perCategory.set(key, entry);
    }

    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        this.GetItemCount++;
        this.bump(category, 'Gets');
        return this.inner.GetItem<T>(key, category);
    }

    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        this.GetItemsCount++;
        this.bump(category, 'Gets');
        return this.inner.GetItems<T>(keys, category);
    }

    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        this.SetItemCount++;
        this.bump(category, 'Sets');
        return this.inner.SetItem<T>(key, value, category);
    }

    public async Remove(key: string, category?: string): Promise<void> {
        this.RemoveCount++;
        return this.inner.Remove(key, category);
    }

    public async ClearCategory(category: string): Promise<void> {
        if (this.inner.ClearCategory) {
            return this.inner.ClearCategory(category);
        }
    }

    public async GetCategoryKeys(category: string): Promise<string[]> {
        if (this.inner.GetCategoryKeys) {
            return this.inner.GetCategoryKeys(category);
        }
        return [];
    }
}

/**
 * Returns an always-true ExtraFilter that is textually unique per tag — every tag
 * yields a distinct cache fingerprint (Filter is part of the fingerprint) while
 * matching the same rows. This lets each test start from a guaranteed-cold cache
 * entry without mutating any data.
 */
export function UniqueFilter(column: string, tag: string): string {
    return `${column} <> 'zzz-cache-test-${tag}'`;
}

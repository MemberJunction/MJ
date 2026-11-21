/**
 * MJAPI database affinity, enforced instead of remembered (guides/INTEGRATION_TESTING_QUICKSTART.md, "CI parallel
 * sharding"): a server-transport bundle whose checks authenticate wire identities through the live MJAPI must run on
 * the worker that shares MJAPI's database. On a server shard (a cloned database) those identities read MJAPI's
 * database, not the shard's, so the bundle's gated reads see the wrong rows and its teardown deletes against the wrong
 * database (audit M5b-2, IT185).
 *
 * The bundles that reach MJAPI are found from the check sources themselves: a checks file that builds a GraphQL
 * provider on a minted or system key (`BuildSystemKeyProvider`, `BuildUserKeyProviderWithRetry`, `MintIdentities`).
 * Each bundle it registers (the `<bundle>` of `Id: '<bundle>.<step>'`) must resolve to the `client` worker group.
 *
 * @module @memberjunction/integration-test-suite
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ResolveTestTransport } from '@memberjunction/testing-engine';

function repoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'mj.config.cjs'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error(`could not locate the repo root from ${process.cwd()}`);
}

const ROOT = repoRoot();
const META_DIR = path.join(ROOT, 'metadata-optional/integration-test/tests/integration');
const CHECKS_DIR = path.join(ROOT, 'packages/TestingFramework/integration-test-suite/src/checks');
const WIRE_CALL = /\b(BuildSystemKeyProvider|BuildUserKeyProviderWithRetry|MintIdentities)\s*\(/;

/**
 * Server bundles that share a checks file with a wire caller but never open a wire themselves. The scan is per file,
 * so each one is named here with the reason it is safe.
 */
const NOT_WIRE_BUNDLES: ReadonlyMap<string, string> = new Map([
    ['docs-slides-sheets-library', 'its file also holds the client companion IT171, whose fixture is the only wire caller'],
]);

/** One IT record as it ships in metadata. */
type TestRecord = {
    fields?: {
        Name?: string;
        Configuration?: { transport?: string; checks?: Array<{ type?: string }>; requiresSharedServerDatabase?: boolean };
    };
    primaryKey?: { ID?: string };
};

/** The bundle names whose checks open a wire connection through MJAPI. */
function wireBundles(): Set<string> {
    const bundles = new Set<string>();
    for (const file of fs.readdirSync(CHECKS_DIR).filter((f) => f.endsWith('.checks.ts'))) {
        const source = fs.readFileSync(path.join(CHECKS_DIR, file), 'utf-8');
        if (!WIRE_CALL.test(source)) continue;
        for (const m of source.matchAll(/\bId:\s*'([a-z0-9-]+)\.[^']+'/g)) {
            if (!NOT_WIRE_BUNDLES.has(m[1])) bundles.add(m[1]);
        }
    }
    return bundles;
}

function testRecords(): TestRecord[] {
    const records: TestRecord[] = [];
    for (const file of fs.readdirSync(META_DIR).filter((f) => f.endsWith('.json'))) {
        const parsed = JSON.parse(fs.readFileSync(path.join(META_DIR, file), 'utf-8')) as TestRecord | TestRecord[];
        records.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    }
    return records;
}

describe('MJAPI database affinity', () => {
    it('every bundle that authenticates through the live MJAPI runs on the worker sharing its database', () => {
        const wire = wireBundles();
        expect(wire.has('ps-prediction-serving')).toBe(true);
        const misrouted: string[] = [];
        for (const rec of testRecords()) {
            const config = rec.fields?.Configuration;
            const name = rec.fields?.Name;
            if (!config || !name || !rec.primaryKey?.ID) continue;
            if (!(config.checks ?? []).some((c) => c.type !== undefined && wire.has(c.type))) continue;
            const group = ResolveTestTransport({ ID: rec.primaryKey.ID, Name: name, Configuration: JSON.stringify(config) });
            if (group !== 'client') misrouted.push(name);
        }
        expect(misrouted).toEqual([]);
    });
});

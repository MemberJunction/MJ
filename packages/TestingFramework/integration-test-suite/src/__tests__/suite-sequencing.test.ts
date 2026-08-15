/**
 * The deterministic suite's ordering invariant, enforced instead of remembered.
 *
 * **Issue #3251:** every server-transport bundle must be sequenced BEFORE every client-transport
 * bundle. The client transport stands up a GraphQL client against the running server; interleaving
 * the two makes a client bundle's failure ambiguous — did the client seam break, or did a
 * server-transport bundle earlier in the run leave state behind that the client then tripped over?
 * Running all server bundles first means a client failure is a client failure.
 *
 * **Why a test rather than a convention.** The rule was already violated once: IT71 landed at
 * sequence 34, tied with the first client-transport bundle, and nobody noticed until a program
 * wrap-up went looking. A convention that has been broken once will be broken again, and this one is
 * checkable from metadata in a few lines — there is no reason for it to depend on someone
 * remembering.
 *
 * Reads the same two metadata sources the suite is actually built from, so a passing test here means
 * the shipped membership is ordered, not that a parallel copy of it is.
 *
 * @module @memberjunction/integration-test-suite
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
const SUITE_FILE = path.join(ROOT, 'metadata-optional/integration-test/test-suites/.integration-suite.json');

const DETERMINISTIC_SUITE = 'Integration Tests — Deterministic';

type Transport = 'server' | 'client';

type SuiteMember = {
    Name: string;
    Sequence: number;
    Transport: Transport | null;
};

/** Transport per test name, read from the IT records themselves. */
function transportByTestName(): Map<string, Transport | null> {
    const map = new Map<string, Transport | null>();
    for (const file of fs.readdirSync(META_DIR).filter((f) => f.endsWith('.json'))) {
        const parsed: unknown = JSON.parse(fs.readFileSync(path.join(META_DIR, file), 'utf-8'));
        const records = Array.isArray(parsed) ? parsed : [parsed];
        for (const rec of records as Array<{ fields?: { Name?: string; Configuration?: { transport?: string } } }>) {
            const name = rec.fields?.Name;
            if (!name) continue;
            const t = rec.fields?.Configuration?.transport;
            map.set(name, t === 'server' || t === 'client' ? t : null);
        }
    }
    return map;
}

/** The deterministic suite's membership, joined to each test's transport. */
function deterministicMembers(): SuiteMember[] {
    const parsed: unknown = JSON.parse(fs.readFileSync(SUITE_FILE, 'utf-8'));
    const suites = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{
        fields?: { Name?: string };
        relatedEntities?: { 'MJ: Test Suite Tests'?: Array<{ fields?: { TestID?: string; Sequence?: number } }> };
    }>;
    const suite = suites.find((s) => s.fields?.Name === DETERMINISTIC_SUITE);
    if (!suite) throw new Error(`suite "${DETERMINISTIC_SUITE}" not found in ${SUITE_FILE}`);

    const transports = transportByTestName();
    return (suite.relatedEntities?.['MJ: Test Suite Tests'] ?? []).map((m) => {
        // `@lookup:MJ: Tests.Name=IT71 - Task Graph Orchestration` — the name is what follows Name=.
        const lookup = m.fields?.TestID ?? '';
        const name = lookup.includes('Name=') ? lookup.slice(lookup.indexOf('Name=') + 'Name='.length) : lookup;
        return { Name: name, Sequence: m.fields?.Sequence ?? -1, Transport: transports.get(name) ?? null };
    });
}

describe('deterministic suite sequencing (#3251)', () => {
    const members = deterministicMembers();

    it('has members at all — a passing ordering check over an empty set proves nothing', () => {
        expect(members.length).toBeGreaterThan(20);
    });

    it('declares a transport for every member', () => {
        // A member with no transport cannot be placed on either side of the boundary, so it would
        // silently slip past the ordering assertion below rather than failing it.
        const missing = members.filter((m) => m.Transport === null).map((m) => m.Name);
        expect(missing, `members with no Configuration.transport: ${missing.join(', ') || 'none'}`).toEqual([]);
    });

    it('sequences EVERY server-transport bundle before EVERY client-transport one', () => {
        const serverMax = Math.max(...members.filter((m) => m.Transport === 'server').map((m) => m.Sequence));
        const offenders = members
            .filter((m) => m.Transport === 'client' && m.Sequence <= serverMax)
            .map((m) => `${m.Name} (client, seq ${m.Sequence} <= server max ${serverMax})`);

        expect(
            offenders,
            `client-transport bundles sequenced at or before a server-transport bundle — see #3251:\n  ${offenders.join('\n  ')}`,
        ).toEqual([]);
    });

    it('gives every member a real sequence', () => {
        // -1 is the sentinel for a membership row that omitted Sequence entirely; it would sort to
        // the front and run a bundle before everything, which is never what was meant.
        const unsequenced = members.filter((m) => m.Sequence < 0).map((m) => m.Name);
        expect(unsequenced, `members missing Sequence: ${unsequenced.join(', ') || 'none'}`).toEqual([]);
    });
});

/** Every integration-test bundle file, with the IT number parsed from its filename and its Name. */
function bundleFiles(): Array<{ file: string; num: string; name: string | null }> {
    return fs
        .readdirSync(META_DIR)
        .filter((f) => /^\.IT\d+/.test(f) && f.endsWith('.json'))
        .map((file) => {
            const num = (file.match(/^\.(IT\d+)/) as RegExpMatchArray)[1];
            const parsed: unknown = JSON.parse(fs.readFileSync(path.join(META_DIR, file), 'utf-8'));
            const rec = (Array.isArray(parsed) ? parsed[0] : parsed) as { fields?: { Name?: string } };
            return { file, num, name: rec.fields?.Name ?? null };
        });
}

describe('integration-test bundle numbering', () => {
    const bundles = bundleFiles();

    it('finds the bundle files at all — an empty scan would make every check below vacuous', () => {
        expect(bundles.length).toBeGreaterThan(50);
    });

    it('assigns every IT number to exactly one bundle', () => {
        // A new bundle numbered against a stale view of `next` collides with one already merged
        // (IT73/IT74/IT75 did exactly this). A shared number makes "IT74 failed" ambiguous and bakes
        // the collision into every seeded environment — the next free number is the only safe choice.
        const byNum = new Map<string, string[]>();
        for (const b of bundles) {
            byNum.set(b.num, [...(byNum.get(b.num) ?? []), b.file]);
        }
        const dupes = [...byNum.entries()]
            .filter(([, files]) => files.length > 1)
            .map(([num, files]) => `${num}: ${files.join(', ')}`);
        expect(dupes, `duplicate IT numbers:\n  ${dupes.join('\n  ')}`).toEqual([]);
    });

    it('names each bundle with the IT number from its filename', () => {
        // The Name's `ITnn` prefix is what suite membership @lookup targets and what shows in test
        // output; a filename/Name mismatch is a rename left half-done.
        const mismatched = bundles
            .filter((b) => b.name !== null && !b.name.startsWith(`${b.num} `))
            .map((b) => `${b.file} → Name "${b.name ?? ''}"`);
        expect(mismatched, `filename/Name IT-number mismatch:\n  ${mismatched.join('\n  ')}`).toEqual([]);
    });
});

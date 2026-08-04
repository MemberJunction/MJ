import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseRange, rangesIntersect, pickRange } from '../check-explorer-external-deps.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-explorer-external-deps.mjs');

// ---------------------------------------------------------------------------
// Range machinery (pure functions)
// ---------------------------------------------------------------------------

describe('parseRange', () => {
    it('classifies exact, caret, tilde, latest, and unknown forms', () => {
        expect(parseRange('1.2.3').kind).toBe('exact');
        expect(parseRange('^1.2.3').kind).toBe('caret');
        expect(parseRange('~1.2.3').kind).toBe('tilde');
        expect(parseRange('latest').kind).toBe('any');
        expect(parseRange('*').kind).toBe('any');
        expect(parseRange('>=1.0.0 <2').kind).toBe('unknown');
        expect(parseRange('1.2.3-beta.1').kind).toBe('unknown');
    });

    it('caps caret ranges at the next major (next minor/patch for 0.x)', () => {
        expect(parseRange('^7.8.5').hi).toEqual([8, 0, 0]);
        expect(parseRange('^0.4.3').hi).toEqual([0, 5, 0]);
        expect(parseRange('^0.0.7').hi).toEqual([0, 0, 8]);
    });

    it('caps tilde ranges at the next minor', () => {
        expect(parseRange('~7.8.2').hi).toEqual([7, 9, 0]);
    });
});

describe('rangesIntersect', () => {
    const overlap = (a, b) => rangesIntersect(parseRange(a), parseRange(b));

    it('same-major carets intersect; cross-major carets do not', () => {
        expect(overlap('^7.8.5', '^7.9.0')).toBe(true);
        expect(overlap('^3.0.0', '^4.1.0')).toBe(false); // the real date-fns conflict
    });

    it('exact pins intersect only ranges that contain them', () => {
        expect(overlap('21.1.3', '^21.0.0')).toBe(true);
        expect(overlap('21.1.3', '^20.0.0')).toBe(false);
        expect(overlap('21.1.3', '21.1.3')).toBe(true);
    });

    it('tilde intersects a caret when their intervals overlap', () => {
        expect(overlap('~7.8.2', '^7.8.5')).toBe(true); // 7.8.5..7.9.0 nonempty
        expect(overlap('~7.8.2', '^7.9.0')).toBe(false);
    });

    it('latest and unknown ranges intersect everything (fail-open)', () => {
        expect(overlap('latest', '^6.5.4')).toBe(true);
        expect(overlap('>=1 <2', '^9.0.0')).toBe(true);
    });
});

describe('pickRange', () => {
    const edge = (range) => ({ owner: 'x', field: 'dependencies', range, optional: false });

    it('prefers a concrete range over latest', () => {
        const result = pickRange([edge('^6.5.4'), edge('latest')]);
        expect(result.range).toBe('^6.5.4');
        expect(result.latestOnly).toBe(false);
        expect(result.conflicts).toEqual([]);
    });

    it('picks the highest lower bound among intersecting ranges', () => {
        expect(pickRange([edge('^7.8.5'), edge('^7.9.0')]).range).toBe('^7.9.0');
    });

    it('reports disjoint owner ranges as conflicts but still picks the highest', () => {
        const result = pickRange([edge('^3.0.0'), edge('^4.1.0')]);
        expect(result.range).toBe('^4.1.0');
        expect(result.conflicts).toEqual(['^3.0.0']);
    });

    it('falls back to latest only when no owner declares a concrete range', () => {
        const result = pickRange([edge('latest')]);
        expect(result.range).toBe('latest');
        expect(result.latestOnly).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// End-to-end against a fixture workspace
// ---------------------------------------------------------------------------

let root;

function put(relPath, contents) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2) + '\n', 'utf8');
}

function run(...extraArgs) {
    const r = spawnSync('node', [SCRIPT, '--root', root, '--app', 'packages/App', ...extraArgs], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/**
 * App -> liba -> libb. External runtime deps the app does not declare:
 *   extdep   (liba ^1.2.3, libb ^1.5.0 — pick ^1.5.0)
 *   otherext (libb ~2.0.1)
 *   peerx    (libb non-optional peer ^3.0.0)
 * optpeer is an optional peer — informational only. devonly is a devDependency
 * of liba — never walked.
 */
function writeFixture() {
    put('packages/App/package.json', {
        name: 'app',
        dependencies: { '@memberjunction/liba': '1.0.0', declared: '^9.0.0' },
    });
    put('packages/LibA/package.json', {
        name: '@memberjunction/liba',
        dependencies: { '@memberjunction/libb': '1.0.0', extdep: '^1.2.3', declared: '^9.1.0' },
        devDependencies: { devonly: '^1.0.0' },
    });
    put('packages/LibB/package.json', {
        name: '@memberjunction/libb',
        dependencies: { extdep: '^1.5.0', otherext: '~2.0.1' },
        peerDependencies: { peerx: '^3.0.0', optpeer: '^2.0.0' },
        peerDependenciesMeta: { optpeer: { optional: true } },
    });
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'explorer-deps-'));
    writeFixture();
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('check mode', () => {
    it('fails listing each undeclared external, ignoring optional peers and devDependencies', () => {
        const { code, err } = run();
        expect(code).toBe(1);
        expect(err).toContain('missing: extdep');
        expect(err).toContain('missing: otherext');
        expect(err).toContain('missing: peerx');
        expect(err).not.toContain('optpeer');
        expect(err).not.toContain('devonly');
        expect(err).not.toContain('declared'); // already declared with an intersecting range
    });

    it('fails on a declared range that intersects no owner range', () => {
        const app = JSON.parse(readFileSync(join(root, 'packages/App/package.json'), 'utf8'));
        app.dependencies = { ...app.dependencies, extdep: '^0.9.0', otherext: '~2.0.1', peerx: '^3.0.0' };
        put('packages/App/package.json', app);
        const { code, err } = run();
        expect(code).toBe(1);
        expect(err).toContain('incompatible: extdep@^0.9.0');
    });

    it('exits 2 when the closure references an MJ package missing from the workspace', () => {
        const libb = JSON.parse(readFileSync(join(root, 'packages/LibB/package.json'), 'utf8'));
        libb.dependencies['@memberjunction/ghost'] = '1.0.0';
        put('packages/LibB/package.json', libb);
        const { code, err } = run();
        expect(code).toBe(2);
        expect(err).toContain('@memberjunction/ghost');
    });
});

describe('write mode', () => {
    it('adds the missing declarations with picked ranges, after which check passes', () => {
        expect(run('--write').code).toBe(0);
        const app = JSON.parse(readFileSync(join(root, 'packages/App/package.json'), 'utf8'));
        expect(app.dependencies.extdep).toBe('^1.5.0'); // highest lower bound wins
        expect(app.dependencies.otherext).toBe('~2.0.1');
        expect(app.dependencies.peerx).toBe('^3.0.0');
        expect(app.dependencies.optpeer).toBeUndefined();
        expect(Object.keys(app.dependencies)).toEqual([...Object.keys(app.dependencies)].sort());
        expect(run().code).toBe(0);
    });
});

describe('list mode', () => {
    it('prints each required external with its picked range and owners', () => {
        const { code, out } = run('--list');
        expect(code).toBe(0);
        expect(out).toContain('extdep\t^1.5.0\t@memberjunction/liba,@memberjunction/libb');
        expect(out).toContain('optpeer\t(optional-peer only — not declared)');
    });
});

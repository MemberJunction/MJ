import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// documented-line.mjs resolves the line ONCE at import time, so a value per
// test needs a fresh module registry. A child process is the honest way to get
// one — query-string cache busting would not reach the nested import that
// license-line.mjs makes.
const MODULE = fileURLToPath(new URL('./documented-line.mjs', import.meta.url));

/** Import the module under `DOCS_VERSION=<line>` and return its exports. */
function load(line) {
    const env = { ...process.env };
    if (line === undefined) delete env.DOCS_VERSION;
    else env.DOCS_VERSION = line;
    const src = `import * as m from ${JSON.stringify(MODULE)};
        process.stdout.write(JSON.stringify({
            documentedLine: m.documentedLine,
            documentedMajor: m.documentedMajor,
            documentedLineId: m.documentedLineId,
        }));`;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', src], { env, encoding: 'utf8' }));
}

/** The message a rejected DOCS_VERSION produces, or null if it was accepted. */
function loadError(line) {
    try {
        load(line);
        return null;
    } catch (err) {
        return String(err.stderr ?? err.message);
    }
}

test('a bare major keeps the shape it always had', () => {
    assert.deepEqual(load('v6'), { documentedLine: 'v6.x', documentedMajor: 6, documentedLineId: '6' });
    assert.deepEqual(load('v5'), { documentedLine: 'v5.x', documentedMajor: 5, documentedLineId: '5' });
});

test('a dotted LTS line resolves instead of throwing', () => {
    // The regression this module exists for: the old guard was /^v\d+$/, so a
    // dotted DOCS_VERSION threw, and one failing matrix entry took the whole
    // docs deploy down (deploy needs build) the day lts/6.1 was cut.
    assert.deepEqual(load('v6.1'), { documentedLine: 'v6.1.x', documentedMajor: 6, documentedLineId: '6.1' });
});

test('the major is an integer, not the line read as a float', () => {
    // Number('6.1') === 6.1 would break every `>= N` era comparison downstream.
    const line = load('v6.1');
    assert.equal(line.documentedMajor, 6);
    assert.ok(Number.isInteger(line.documentedMajor));
});

test('6.1 and 6.10 stay distinct', () => {
    // Number('6.1') and Number('6.10') are the same float. The id is a string
    // precisely so these two lines can never collapse into one another.
    assert.equal(load('v6.1').documentedLineId, '6.1');
    assert.equal(load('v6.10').documentedLineId, '6.10');
    assert.notEqual(load('v6.1').documentedLineId, load('v6.10').documentedLineId);
    assert.equal(load('v6.10').documentedMajor, 6);
});

test('malformed line ids are rejected, not coerced', () => {
    for (const bad of ['6.1', 'v', 'vx', 'v6.1.2', 'v6.', 'v-1', 'latest']) {
        assert.match(loadError(bad) ?? '', /Documented line must look like/, `expected "${bad}" to be rejected`);
    }
});

test('with no DOCS_VERSION the line comes from the checked-out core version', () => {
    // Local previews have no env. The fallback yields a bare major even on an
    // lts/6.1 checkout — documented behavior, not an oversight.
    const line = load(undefined);
    assert.match(line.documentedLine, /^v\d+\.x$/);
    assert.ok(Number.isInteger(line.documentedMajor));
    assert.equal(line.documentedLineId, String(line.documentedMajor));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Same one-process-per-case rule as documented-line.test.mjs: license-line.mjs
// resolves everything at import time from a DOCS_VERSION read one module deeper.
const MODULE = fileURLToPath(new URL('./license-line.mjs', import.meta.url));

/** Import the module under `DOCS_VERSION=<line>` and return its exports. */
function load(line) {
    const src = `import * as m from ${JSON.stringify(MODULE)};
        process.stdout.write(JSON.stringify({
            isBusl: m.isBusl,
            licenseName: m.licenseName,
            licenseShort: m.licenseShort,
            sourceModel: m.sourceModel,
            licenseUrl: m.licenseUrl,
        }));`;
    const env = { ...process.env, DOCS_VERSION: line };
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', src], { env, encoding: 'utf8' }));
}

test('the 5.x line is ISC and links at its own branch', () => {
    const v5 = load('v5');
    assert.equal(v5.isBusl, false);
    assert.equal(v5.licenseName, 'ISC License');
    assert.equal(v5.licenseShort, 'ISC');
    assert.equal(v5.sourceModel, 'Open Source');
    // Never main: that LICENSE now carries the BUSL, so linking there would
    // hand an ISC user the wrong license.
    assert.equal(v5.licenseUrl, 'https://github.com/MemberJunction/MJ/blob/lts/5/LICENSE');
});

test('a dotted BUSL line is still BUSL', () => {
    // The era test is `documentedMajor >= 6`. Before the split it compared the
    // float 6.1, which happened to work here and broke elsewhere.
    for (const line of ['v6', 'v6.1', 'v6.10']) {
        const l = load(line);
        assert.equal(l.isBusl, true, line);
        assert.equal(l.licenseName, 'Business Source License 1.1', line);
        assert.equal(l.licenseShort, 'BUSL 1.1', line);
        assert.equal(l.sourceModel, 'Source Available', line);
        assert.equal(l.licenseUrl, 'https://github.com/MemberJunction/MJ/blob/main/LICENSE', line);
    }
});

test('a dotted pre-BUSL line links at lts/<line>, not lts/<major>', () => {
    // The conflation regression: `blob/lts/${documentedMajor}` on a dotted line
    // produced lts/5 — a real branch, but the wrong one — and for 5.10 vs 5.1
    // it produced the same URL for two different lines.
    assert.equal(load('v5.1').licenseUrl, 'https://github.com/MemberJunction/MJ/blob/lts/5.1/LICENSE');
    assert.equal(load('v5.10').licenseUrl, 'https://github.com/MemberJunction/MJ/blob/lts/5.10/LICENSE');
    assert.notEqual(load('v5.1').licenseUrl, load('v5.10').licenseUrl);
});

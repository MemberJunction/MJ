/**
 * Tests for the cred-free ↔ cred-live diff protocol (`diffVerdicts`).
 *
 * Pins the four contract guarantees:
 *  1. Identical verdict sets → matched === comparable (N/N) and the summary string is exact.
 *  2. A pass/fail disagreement → exactly one mismatch with a clear `why` ("pass differs").
 *  3. A rowcount disagreement on a SHARED key → a mismatch (and the `why` names the key).
 *  4. Cells present on only one side land in credFreeOnly / credLiveOnly and do NOT inflate `comparable`.
 *
 * Run: `node --test diff/credfree-credlive-diff.test.mjs`  (from the workshop dir)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffVerdicts } from './credfree-credlive-diff.mjs';

// ── 1. identical sets → full match ────────────────────────────────────────────────────────────────
test('identical verdict sets → matched === comparable (N/N) with exact summary', () => {
    const cells = [
        { cellId: 'T2.discover', pass: true, rowcounts: { contacts: 42, companies: 7 } },
        { cellId: 'forward.full', pass: true, rowcounts: { contacts: 42 } },
        { cellId: 'idempotency', pass: true },
    ];
    // distinct array instances with the same content
    const res = diffVerdicts(cells, cells.map((c) => ({ ...c, rowcounts: c.rowcounts ? { ...c.rowcounts } : undefined })));

    assert.equal(res.comparable, 3);
    assert.equal(res.matched, 3);
    assert.equal(res.matched, res.comparable);
    assert.equal(res.mismatches.length, 0);
    assert.deepEqual(res.credFreeOnly, []);
    assert.deepEqual(res.credLiveOnly, []);
    assert.equal(res.summary, 'cred-free matched cred-live on 3/3 comparable cells');
});

// ── 2. pass/fail disagreement → exactly one mismatch ──────────────────────────────────────────────
test('a pass/fail disagreement → exactly one mismatch with a clear why', () => {
    const credFree = [
        { cellId: 'T2.discover', pass: true },
        { cellId: 'forward.full', pass: true }, // cred-free claimed pass...
    ];
    const credLive = [
        { cellId: 'T2.discover', pass: true },
        { cellId: 'forward.full', pass: false }, // ...cred-live (ground truth) says fail
    ];
    const res = diffVerdicts(credFree, credLive);

    assert.equal(res.comparable, 2);
    assert.equal(res.matched, 1);
    assert.equal(res.mismatches.length, 1);

    const m = res.mismatches[0];
    assert.equal(m.cellId, 'forward.full');
    assert.match(m.why, /pass differs/);
    assert.match(m.why, /cred-free=true/);
    assert.match(m.why, /cred-live=false/);
    assert.equal(m.credFree.pass, true);
    assert.equal(m.credLive.pass, false);

    assert.equal(res.summary, 'cred-free matched cred-live on 1/2 comparable cells');
});

// ── 3. rowcount disagreement on a shared key → mismatch ───────────────────────────────────────────
test('a rowcount disagreement on a shared key → a mismatch naming the key', () => {
    const credFree = [
        { cellId: 'forward.full', pass: true, rowcounts: { contacts: 42, deals: 5 } },
    ];
    const credLive = [
        { cellId: 'forward.full', pass: true, rowcounts: { contacts: 99, deals: 5 } }, // contacts differs
    ];
    const res = diffVerdicts(credFree, credLive);

    assert.equal(res.comparable, 1);
    assert.equal(res.matched, 0);
    assert.equal(res.mismatches.length, 1);

    const m = res.mismatches[0];
    assert.equal(m.cellId, 'forward.full');
    assert.match(m.why, /rowcount differs on key contacts/);
    assert.match(m.why, /cred-free=42/);
    assert.match(m.why, /cred-live=99/);

    assert.equal(res.summary, 'cred-free matched cred-live on 0/1 comparable cells');
});

test('rowcounts only contradict on SHARED keys — a key on one side only does not mismatch', () => {
    const credFree = [
        { cellId: 'forward.full', pass: true, rowcounts: { contacts: 42 } },
    ];
    const credLive = [
        // cred-live observed an extra stream; the shared key (contacts) still agrees → match
        { cellId: 'forward.full', pass: true, rowcounts: { contacts: 42, companies: 7 } },
    ];
    const res = diffVerdicts(credFree, credLive);

    assert.equal(res.comparable, 1);
    assert.equal(res.matched, 1);
    assert.equal(res.mismatches.length, 0);
});

test('rowcounts not compared when one side omits them entirely (pass equality wins)', () => {
    const credFree = [{ cellId: 'forward.full', pass: true, rowcounts: { contacts: 42 } }];
    const credLive = [{ cellId: 'forward.full', pass: true }]; // no rowcounts on cred-live
    const res = diffVerdicts(credFree, credLive);

    assert.equal(res.comparable, 1);
    assert.equal(res.matched, 1);
    assert.equal(res.mismatches.length, 0);
});

// ── 4. one-sided cells → credFreeOnly / credLiveOnly, NOT comparable ──────────────────────────────
test('cells on only one side go in credFreeOnly/credLiveOnly and do NOT inflate comparable', () => {
    const credFree = [
        { cellId: 'shared', pass: true },
        { cellId: 'free-only-A', pass: true },
        { cellId: 'free-only-B', pass: false },
    ];
    const credLive = [
        { cellId: 'shared', pass: true },
        { cellId: 'live-only-X', pass: true },
    ];
    const res = diffVerdicts(credFree, credLive);

    // only 'shared' is comparable
    assert.equal(res.comparable, 1);
    assert.equal(res.matched, 1);
    assert.equal(res.mismatches.length, 0);

    assert.deepEqual(res.credFreeOnly.sort(), ['free-only-A', 'free-only-B']);
    assert.deepEqual(res.credLiveOnly, ['live-only-X']);

    assert.equal(res.summary, 'cred-free matched cred-live on 1/1 comparable cells');
});

// ── edge cases ────────────────────────────────────────────────────────────────────────────────────
test('both empty → 0/0 comparable, vacuously matched, no mismatches', () => {
    const res = diffVerdicts([], []);
    assert.equal(res.comparable, 0);
    assert.equal(res.matched, 0);
    assert.equal(res.mismatches.length, 0);
    assert.deepEqual(res.credFreeOnly, []);
    assert.deepEqual(res.credLiveOnly, []);
    assert.equal(res.summary, 'cred-free matched cred-live on 0/0 comparable cells');
});

test('non-array / malformed inputs do not throw (defensive)', () => {
    const res = diffVerdicts(undefined, null);
    assert.equal(res.comparable, 0);
    assert.equal(res.matched, 0);
    assert.deepEqual(res.credFreeOnly, []);
    assert.deepEqual(res.credLiveOnly, []);
});

test('cells without a valid cellId are skipped and never participate', () => {
    const credFree = [
        { cellId: 'good', pass: true },
        { pass: true }, // no cellId
        { cellId: '', pass: true }, // empty cellId
        null, // not an object
    ];
    const credLive = [{ cellId: 'good', pass: true }];
    const res = diffVerdicts(credFree, credLive);

    assert.equal(res.comparable, 1);
    assert.equal(res.matched, 1);
    assert.deepEqual(res.credFreeOnly, []);
    assert.deepEqual(res.credLiveOnly, []);
});

/**
 * Tests for the worktree-isolation symlink gate.
 *
 * Pins:
 *  1. A symlink whose resolved target is OUTSIDE the worktree root is flagged (clobber risk).
 *  2. A symlink whose target is INSIDE the worktree root passes.
 *  3. A target using `../` that ESCAPES the worktree is flagged AFTER path normalization (not by naive
 *     prefix string matching).
 *  4. A sibling dir sharing the root's prefix (/wt-sibling vs /wt) is NOT treated as inside.
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/env/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSymlinksRepoint, runIsolationAssert } from './isolation-assert.mjs';

const WT = '/Users/dev/worktrees/orcid';

// ── assertSymlinksRepoint ─────────────────────────────────────────────────────────────────────────
test('flags a symlink whose target is outside the worktree root (points back into main repo)', () => {
    const v = assertSymlinksRepoint(WT, [
        { path: `${WT}/node_modules/@memberjunction/core`, target: '/Users/dev/MJ-main/packages/MJCore/dist' },
    ]);
    assert.equal(v.length, 1);
    assert.equal(v[0].target, '/Users/dev/MJ-main/packages/MJCore/dist');
});

test('does NOT flag a symlink whose target is inside the worktree root', () => {
    const v = assertSymlinksRepoint(WT, [
        { path: `${WT}/node_modules/@memberjunction/core`, target: `${WT}/packages/MJCore/dist` },
    ]);
    assert.equal(v.length, 0);
});

test('flags a `../` target that escapes the worktree after normalization', () => {
    // node_modules/@memberjunction/core → ../../../../MJ-main/packages/MJCore resolves OUTSIDE the worktree.
    const v = assertSymlinksRepoint(WT, [
        {
            path: `${WT}/node_modules/@memberjunction/core`,
            target: `${WT}/node_modules/@memberjunction/../../../MJ-main/packages/MJCore`,
        },
    ]);
    assert.equal(v.length, 1);
});

test('does NOT flag a `../` target that stays inside the worktree after normalization', () => {
    // ...resolves back to ${WT}/packages/MJCore — still inside.
    const v = assertSymlinksRepoint(WT, [
        {
            path: `${WT}/node_modules/@memberjunction/core`,
            target: `${WT}/node_modules/@memberjunction/../../packages/MJCore`,
        },
    ]);
    assert.equal(v.length, 0);
});

test('does NOT treat a sibling dir sharing the root prefix as inside the worktree', () => {
    const v = assertSymlinksRepoint('/Users/dev/wt', [
        { path: '/Users/dev/wt/node_modules/@memberjunction/core', target: '/Users/dev/wt-sibling/packages/MJCore' },
    ]);
    assert.equal(v.length, 1);
});

test('the worktree root itself counts as inside', () => {
    const v = assertSymlinksRepoint(WT, [{ path: `${WT}/x`, target: WT }]);
    assert.equal(v.length, 0);
});

test('checks each link independently (mixed inside/outside)', () => {
    const v = assertSymlinksRepoint(WT, [
        { path: `${WT}/node_modules/@memberjunction/core`, target: `${WT}/packages/MJCore/dist` },
        { path: `${WT}/node_modules/@memberjunction/global`, target: '/Users/dev/MJ-main/packages/MJGlobal/dist' },
    ]);
    assert.equal(v.length, 1);
    assert.equal(v[0].path, `${WT}/node_modules/@memberjunction/global`);
});

// ── runIsolationAssert (verdict wrapper) ──────────────────────────────────────────────────────────
test('runIsolationAssert returns ok:true on a fully-contained link set', () => {
    const verdict = runIsolationAssert(WT, [
        { path: `${WT}/node_modules/@memberjunction/core`, target: `${WT}/packages/MJCore/dist` },
    ]);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.violations.length, 0);
});

test('runIsolationAssert returns ok:false with the violations on an escaping link set', () => {
    const verdict = runIsolationAssert(WT, [
        { path: `${WT}/node_modules/@memberjunction/core`, target: '/Users/dev/MJ-main/packages/MJCore/dist' },
    ]);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.violations.length, 1);
});

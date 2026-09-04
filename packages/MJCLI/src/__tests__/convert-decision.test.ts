import { describe, it, expect } from 'vitest';
import { decideConvertWrite, buildConversionFailureArtifact, decideLegacyConvertExit } from '../commands/migrate/convert.js';
import { CONVERSION_GAP_MARKERS } from '@memberjunction/sql-converter';

/**
 * The exact shape `decideConvertWrite` consumes — derived from its own parameter type so the
 * fixture tracks the (strongly-typed) signature and can never drift from it. Never hand-retype
 * `status`/`mode` as `string` here: that would silently re-widen what the signature narrows and
 * let an invalid literal into a test fixture (CLAUDE.md rule 2 — no lazy `unknown`/weak typing).
 */
type DecisionInput = Parameters<typeof decideConvertWrite>[0];
const res = (over: Partial<DecisionInput>): DecisionInput => ({
  status: 'converted',
  unhandled: [],
  ...over,
});

describe('decideConvertWrite (issue #3252 Phase 4)', () => {
  it('a clean converted file is not a gap, writes .pg.sql, does not halt', () => {
    expect(decideConvertWrite(res({}), false)).toEqual({ isGap: false, writeAsNeedsHand: false, haltBake: false });
  });

  it('a needs-hand file is a gap and writes .needs-hand', () => {
    const d = decideConvertWrite(res({ status: 'needs-hand-authoring' }), false);
    expect(d.isGap).toBe(true);
    expect(d.writeAsNeedsHand).toBe(true);
  });

  it('non-bake: a converted file with unhandled statements stays a discoverable .pg.sql (existing behavior)', () => {
    const d = decideConvertWrite(res({ unhandled: [{ kind: 'X', snippet: 's' }] }), false);
    expect(d.isGap).toBe(true);
    expect(d.writeAsNeedsHand).toBe(false); // still .pg.sql in non-bake mode
    expect(d.haltBake).toBe(false);
  });

  it('bake: a gap-no-bake result forces .needs-hand and HALTS the batch (design #4 + halt-at-first-gap)', () => {
    const d = decideConvertWrite(res({ mode: 'gap-no-bake' }), true);
    expect(d.isGap).toBe(true);
    expect(d.writeAsNeedsHand).toBe(true);
    expect(d.haltBake).toBe(true);
  });

  it('bake: a gap-no-bake with a clean status (unhandled-only) is STILL forced to .needs-hand and halts', () => {
    // MAJOR-2 guard: status 'converted' + mode gap-no-bake must not escape as a discoverable
    // .pg.sql nor let the run fall through to exit 0.
    const d = decideConvertWrite(res({ status: 'converted', mode: 'gap-no-bake', unhandled: [] }), true);
    expect(d.writeAsNeedsHand).toBe(true);
    expect(d.haltBake).toBe(true);
    expect(d.isGap).toBe(true);
  });

  it('bake: a clean baked file is not a gap and does not halt', () => {
    const d = decideConvertWrite(res({ mode: 'baked' }), true);
    expect(d.isGap).toBe(false);
    expect(d.haltBake).toBe(false);
  });

  it('bake: a baseline exempted to `baked` despite needs-hand status must NOT halt the batch', () => {
    // IncrementalBaker deliberately returns { status: 'needs-hand-authoring', mode: 'baked' } for a
    // baseline whose PRE-SEEDED metadata made the CodeGen capture complete even though the file
    // carries hand-authored utility gaps (IncrementalBaker.ts baseline path). The working DB WAS
    // advanced past this migration, so subsequent migrations can still bake — the batch must NOT
    // halt here. It is still written `.needs-hand` and reported as a gap for a human to finish.
    const d = decideConvertWrite(res({ status: 'needs-hand-authoring', mode: 'baked' }), true);
    expect(d.writeAsNeedsHand).toBe(true); // the hand-authored gaps still need a human
    expect(d.isGap).toBe(true); // still surfaced in the gap report
    expect(d.haltBake).toBe(false); // but the bake batch continues — mode 'baked' == DB advanced
  });
});

describe('decideLegacyConvertExit (issue #3857)', () => {
  const exit = (over: Partial<Parameters<typeof decideLegacyConvertExit>[0]>) =>
    decideLegacyConvertExit({ errorCount: 0, gapCount: 0, gapFileCount: 0, allowGaps: false, ...over });

  it('a clean run passes', () => {
    expect(exit({})).toEqual({ fail: false, message: null });
  });

  it('gaps without --allow-gaps FAIL the run (the #3857 regression)', () => {
    // Before the fix this exact state — a "-- Could not parse" marker in the written output,
    // zero caught errors — printed `1 OK, 0 errors` and exited 0.
    const d = exit({ gapCount: 1, gapFileCount: 1 });
    expect(d.fail).toBe(true);
    expect(d.message).toContain('1 conversion gap(s) in 1 file(s)');
    expect(d.message).toContain('--allow-gaps'); // the message says what to do about it
    expect(d.message).toContain(CONVERSION_GAP_MARKERS[0]); // …and what a gap looks like
  });

  it('gaps WITH --allow-gaps pass — the flag finally means something on the legacy path', () => {
    expect(exit({ gapCount: 3, gapFileCount: 2, allowGaps: true })).toEqual({ fail: false, message: null });
  });

  it('errors fail regardless of --allow-gaps', () => {
    const d = exit({ errorCount: 2, allowGaps: true });
    expect(d.fail).toBe(true);
    expect(d.message).toContain('errors in 2 file(s)');
    // --allow-gaps accepts gaps, never caught conversion errors, so no gap advice is offered.
    expect(d.message).not.toContain('--allow-gaps');
  });

  it('errors and gaps together are both named in one message', () => {
    const d = exit({ errorCount: 1, gapCount: 4, gapFileCount: 2 });
    expect(d.fail).toBe(true);
    expect(d.message).toContain('errors in 1 file(s)');
    expect(d.message).toContain('4 conversion gap(s) in 2 file(s)');
  });

  it('--allow-gaps does not suppress a concurrent error', () => {
    const d = exit({ errorCount: 1, gapCount: 4, gapFileCount: 2, allowGaps: true });
    expect(d.fail).toBe(true);
    expect(d.message).toContain('errors in 1 file(s)');
    expect(d.message).not.toContain('conversion gap(s)'); // accepted, so not a stated reason
  });
});

describe('buildConversionFailureArtifact (issue #3252 code review — Spec 3)', () => {
  it('preserves the transpiled body under a failure banner when a bake apply/capture carried one', () => {
    const body = buildConversionFailureArtifact(
      'V9__Heartbeat.sql',
      'cannot drop dependent view vwApplicationSettings',
      'ALTER TABLE __mj."AIAgentRun" ADD COLUMN "LastHeartbeatAt" TIMESTAMPTZ NULL;',
    );
    expect(body).toContain('CONVERSION FAILED (working-DB apply/capture) for V9__Heartbeat.sql');
    expect(body).toContain('cannot drop dependent view vwApplicationSettings'); // underlying cause kept
    expect(body).toContain('ALTER TABLE __mj."AIAgentRun" ADD COLUMN "LastHeartbeatAt"'); // DDL preserved
    expect(body).toContain('PRESERVED for hand-finishing');
  });

  it('falls back to the plain hand-author stub when there is no transpiled body to preserve', () => {
    const body = buildConversionFailureArtifact('V9__Heartbeat.sql', 'no transpiler configured', '');
    expect(body).toContain('CONVERSION FAILED for V9__Heartbeat.sql');
    expect(body).toContain('no transpiler configured');
    expect(body).toContain('Hand-author the PostgreSQL form');
    expect(body).not.toContain('PRESERVED'); // nothing to preserve → the bare stub, no banner
  });

  it('treats a whitespace-only body as absent (stub, not an empty preserved block)', () => {
    const body = buildConversionFailureArtifact('V9__Heartbeat.sql', 'boom', '   \n  ');
    expect(body).not.toContain('PRESERVED');
    expect(body).toContain('Hand-author the PostgreSQL form');
  });
});

// Compile-time guards (issue #3252 code review — Standards 2): the decision input must be
// STRONGLY typed, not `string`, so an invalid status/mode cannot compile and slip past the
// write/halt policy. These `@ts-expect-error`s FAIL to compile (TS2578 "unused directive") if the
// signature ever re-widens `status`/`mode` back to `string` — turning the regression into a build
// break rather than a silent hole. Valid literals below must continue to type-check cleanly.
() => {
  // @ts-expect-error — an unknown baker mode is not assignable to BakedMigrationResult['mode'].
  res({ mode: 'not-a-real-mode' });
  // @ts-expect-error — an unknown status is not assignable to MigrationConversionResult['status'].
  res({ status: 'not-a-real-status' });
  // Valid values still type-check (no @ts-expect-error): these must NOT error.
  res({ status: 'needs-hand-authoring', mode: 'gap-no-bake' });
  res({ status: 'reseed-or-regen-only', mode: 'baked' });
};

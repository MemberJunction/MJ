import { describe, it, expect } from 'vitest';
import { decideConvertWrite } from '../commands/migrate/convert.js';

/** Minimal per-file conversion shape the decision consumes. */
const res = (over: Partial<{ status: string; unhandled: unknown[]; mode?: string }>) => ({
  status: 'converted',
  unhandled: [] as unknown[],
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
});

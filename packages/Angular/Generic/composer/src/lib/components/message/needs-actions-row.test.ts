import { describe, it, expect } from 'vitest';
import { NeedsActionsRow, ActionsRowGeometry } from './message-input-box.component';

/**
 * The composer's buttons float in its bottom-right corner. NeedsActionsRow decides when the text would reach
 * them, so the editor adds a strip below the text for the buttons (the ChatGPT pattern). Geometry mirrors the
 * real composer: 7px paddings, 100px min height, 24px lines, a 47px button band.
 */
const base: ActionsRowGeometry = { PadTop: 7, PadBottom: 7, MinHeight: 100, TextHeight: 24, ButtonZone: 47, RowOn: false };
const lines = (n: number): number => n * 24;

describe('NeedsActionsRow', () => {
  it('keeps the buttons inline for a single line', () => {
    expect(NeedsActionsRow({ ...base, TextHeight: lines(1) })).toBe(false);
  });

  it('keeps them inline while the text ends above the button band', () => {
    // 7 + 24 + 7 = 38px of text area in a 100px box: band starts at 53px
    expect(NeedsActionsRow({ ...base, TextHeight: lines(1) + 21 })).toBe(false); // ends at 52
  });

  it('adds the strip once the text would run into the button band', () => {
    expect(NeedsActionsRow({ ...base, TextHeight: lines(2) + 1 })).toBe(true); // ends at 56
  });

  it('adds the strip whenever the text grows past the minimum height (last line sits at the bottom)', () => {
    expect(NeedsActionsRow({ ...base, TextHeight: lines(6) })).toBe(true);
  });

  it('stays on once on: the strip itself never flips the answer back off', () => {
    const tall = { ...base, TextHeight: lines(6) };
    expect(NeedsActionsRow(tall)).toBe(true);
    expect(NeedsActionsRow({ ...tall, RowOn: true })).toBe(true);
  });

  it('turns back off when the text shrinks to one line again', () => {
    expect(NeedsActionsRow({ ...base, TextHeight: lines(1), RowOn: true })).toBe(false);
  });
});

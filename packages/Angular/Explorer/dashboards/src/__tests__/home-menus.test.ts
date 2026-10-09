/**
 * Tests for the placement and keyboard helpers of Home's menus (`Home/home-menus.ts`): where a
 * fixed-position menu opens next to its trigger, and which menu row the arrow, Home and End keys focus.
 */
import { describe, it, expect } from 'vitest';
import { NextMenuFocusIndex, PlaceMenu } from '../Home/home-menus';

describe('PlaceMenu', () => {
  const viewport = { Width: 1000, Height: 800 };
  it('right-aligns the menu with the trigger, under it', () => {
    expect(PlaceMenu({ Left: 700, Right: 724, Top: 100, Bottom: 124 }, 220, 0, 'right', viewport)).toEqual({ Left: 504, Top: 128, MaxHeight: 664 });
  });
  it('left-aligns when right alignment would pass the left edge', () => {
    expect(PlaceMenu({ Left: 20, Right: 44, Top: 100, Bottom: 124 }, 220, 0, 'right', viewport)).toEqual({ Left: 20, Top: 128, MaxHeight: 664 });
  });
  it('keeps the menu inside the right edge', () => {
    expect(PlaceMenu({ Left: 900, Right: 990, Top: 100, Bottom: 124 }, 300, 0, 'left', viewport)).toEqual({ Left: 692, Top: 128, MaxHeight: 664 });
  });
  it('opens above the trigger when it does not fit below', () => {
    expect(PlaceMenu({ Left: 100, Right: 124, Top: 700, Bottom: 724 }, 220, 200, 'right', viewport)).toEqual({ Left: 100, Top: 496, MaxHeight: 688 });
  });
  it('keeps a measured menu that fits below under the trigger', () => {
    expect(PlaceMenu({ Left: 700, Right: 724, Top: 400, Bottom: 424 }, 220, 200, 'right', viewport)).toEqual({ Left: 504, Top: 428, MaxHeight: 364 });
  });
  it('opens below the trigger when the menu fits neither below nor above', () => {
    expect(PlaceMenu({ Left: 100, Right: 124, Top: 300, Bottom: 324 }, 220, 600, 'right', viewport)).toEqual({ Left: 100, Top: 328, MaxHeight: 464 });
  });
});

describe('PlaceMenu: MaxHeight', () => {
  const viewport = { Width: 1000, Height: 800 };
  it('limits a menu that opens below to the room under the trigger: viewport height − 8 − top (600 − 8 − 204 = 388)', () => {
    // A 430px menu under a trigger that ends at 200px fits neither below nor above a 600px viewport
    expect(PlaceMenu({ Left: 100, Right: 220, Top: 168, Bottom: 200 }, 300, 430, 'right', { Width: 1000, Height: 600 })).toEqual({
      Left: 100,
      Top: 204,
      MaxHeight: 388,
    });
  });
  it('gives a menu that opens above the room over the trigger: trigger top − 4 − 8 (520 − 4 − 8 = 508)', () => {
    expect(PlaceMenu({ Left: 500, Right: 600, Top: 520, Bottom: 552 }, 300, 400, 'left', viewport)).toEqual({
      Left: 500,
      Top: 116,
      MaxHeight: 508,
    });
  });
  it('never limits a menu to less than 120px, below or above the trigger', () => {
    // 800 − 8 − 768 = 24px of room below
    expect(PlaceMenu({ Left: 100, Right: 124, Top: 740, Bottom: 764 }, 220, 0, 'right', viewport).MaxHeight).toBe(120);
    // 100 − 4 − 8 = 88px of room above an 80px menu
    expect(PlaceMenu({ Left: 100, Right: 124, Top: 100, Bottom: 124 }, 220, 80, 'right', { Width: 1000, Height: 160 })).toEqual({
      Left: 100,
      Top: 16,
      MaxHeight: 120,
    });
  });
});

describe('NextMenuFocusIndex', () => {
  it('moves from the filter box to the first or last row', () => {
    expect(NextMenuFocusIndex('ArrowDown', -1, 4)).toBe(0);
    expect(NextMenuFocusIndex('ArrowUp', -1, 4)).toBe(3);
  });
  it('wraps between rows, and Home/End act only on a row', () => {
    expect(NextMenuFocusIndex('ArrowDown', 3, 4)).toBe(0);
    expect(NextMenuFocusIndex('ArrowUp', 0, 4)).toBe(3);
    expect(NextMenuFocusIndex('End', 1, 4)).toBe(3);
    expect(NextMenuFocusIndex('Home', -1, 4)).toBeNull();
    expect(NextMenuFocusIndex('a', 1, 4)).toBeNull();
    expect(NextMenuFocusIndex('ArrowDown', 0, 0)).toBeNull();
  });
  it('steps to the next or previous row, and jumps to the first row on Home', () => {
    expect(NextMenuFocusIndex('ArrowDown', 1, 4)).toBe(2);
    expect(NextMenuFocusIndex('ArrowUp', 2, 4)).toBe(1);
    expect(NextMenuFocusIndex('Home', 2, 4)).toBe(0);
  });
  it('leaves End to the filter box', () => {
    expect(NextMenuFocusIndex('End', -1, 4)).toBeNull();
  });
});

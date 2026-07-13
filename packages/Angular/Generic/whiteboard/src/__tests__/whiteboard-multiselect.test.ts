/**
 * MULTI-SELECT — the standard object-drawing-program selection behaviors on the engine:
 *  - marquee hit-selection geometry (ItemsIntersecting: overlap semantics, highlight
 *    exclusion, active-page scoping);
 *  - shift-click toggle semantics (ToggleSelect) and marquee replacement (SelectMany),
 *    including the primary-selection (SelectedID) bookkeeping and SelectionChanged$
 *    notifications;
 *  - group move as ONE undo step (MoveSelectedBy) and delete-selection as ONE undo
 *    step (RemoveSelected);
 *  - selection volatility: cleared on page switch, never persisted in ToJSON /
 *    restored by LoadFromJSON.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  WhiteboardInkItem,
  WhiteboardItem,
  WhiteboardSelectionChangedEventArgs,
  WhiteboardState
} from '../lib/whiteboard-state';

describe('WhiteboardState multi-select', () => {
  let state: WhiteboardState;
  let a: WhiteboardItem;
  let b: WhiteboardItem;
  let c: WhiteboardItem;

  beforeEach(() => {
    state = new WhiteboardState();
    a = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a' }, 'user')!;
    b = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 300, Y: 0, W: 100, H: 60, Label: 'b' }, 'user')!;
    c = state.AddItem({ Kind: 'text', X: 600, Y: 0, Text: 'c' }, 'user')!;
  });

  describe('ItemsIntersecting — marquee hit geometry', () => {
    it('returns items fully inside the rectangle', () => {
      const hits = state.ItemsIntersecting({ X: -10, Y: -10, W: 200, H: 200 });
      expect(hits.map((i) => i.ID)).toEqual([a.ID]);
    });

    it('returns items PARTIALLY overlapping the rectangle (intersection, not containment)', () => {
      // sticky a spans X 0..172 (default width) — a marquee starting at X 150 clips it
      const hits = state.ItemsIntersecting({ X: 150, Y: 0, W: 300, H: 100 });
      expect(hits.map((i) => i.ID)).toEqual(expect.arrayContaining([a.ID, b.ID]));
      expect(hits.map((i) => i.ID)).not.toContain(c.ID);
    });

    it('returns nothing for an empty region and does NOT count edge-touching items', () => {
      expect(state.ItemsIntersecting({ X: 2000, Y: 2000, W: 50, H: 50 })).toEqual([]);
      // shape b starts at X=300 — a marquee ENDING exactly at 300 only touches its edge
      const touching = state.ItemsIntersecting({ X: 250, Y: 0, W: 50, H: 60 });
      expect(touching.map((i) => i.ID)).not.toContain(b.ID);
    });

    it('excludes transient highlight regions (pointing chrome is never selectable)', () => {
      state.Highlight(0, 0, 500, 500, 'look here', 'agent');
      const hits = state.ItemsIntersecting({ X: -10, Y: -10, W: 1000, H: 200 });
      expect(hits.every((i) => i.Kind !== 'highlight')).toBe(true);
      expect(hits.map((i) => i.ID)).toEqual(expect.arrayContaining([a.ID, b.ID, c.ID]));
    });

    it('includes ink strokes via their padded point bounds', () => {
      const ink = state.AddItem(
        { Kind: 'ink', Points: [{ X: 1000, Y: 1000 }, { X: 1050, Y: 1040 }], Color: '#fbbf24', StrokeWidth: 4 }, 'user'
      ) as WhiteboardInkItem;
      const hits = state.ItemsIntersecting({ X: 990, Y: 990, W: 100, H: 100 });
      expect(hits.map((i) => i.ID)).toEqual([ink.ID]);
    });

    it('only sees the ACTIVE page', () => {
      state.AddPage('Two');
      expect(state.ItemsIntersecting({ X: -100, Y: -100, W: 5000, H: 5000 })).toEqual([]);
      state.SwitchPage('Page 1');
      expect(state.ItemsIntersecting({ X: -100, Y: -100, W: 5000, H: 5000 })).toHaveLength(3);
    });
  });

  describe('ToggleSelect — shift-click semantics', () => {
    it('adds an unselected item to the selection without clearing it', () => {
      state.Select(a.ID);
      state.ToggleSelect(b.ID);
      expect(state.SelectedIDs).toEqual([a.ID, b.ID]);
      expect(state.SelectedID).toBe(b.ID); // newest member is the primary selection
    });

    it('removes an already-selected item, keeping the rest', () => {
      state.SelectMany([a.ID, b.ID, c.ID]);
      state.ToggleSelect(b.ID);
      expect(state.SelectedIDs).toEqual([a.ID, c.ID]);
      expect(state.SelectedID).toBe(c.ID);
    });

    it('toggling the last member empties the selection', () => {
      state.Select(a.ID);
      state.ToggleSelect(a.ID);
      expect(state.SelectedIDs).toEqual([]);
      expect(state.SelectedID).toBeNull();
    });

    it('is a no-op for unknown IDs', () => {
      state.Select(a.ID);
      state.ToggleSelect('no-such-id');
      expect(state.SelectedIDs).toEqual([a.ID]);
    });

    it('fires SelectionChanged$ with the full multi-selection payload', () => {
      const events: WhiteboardSelectionChangedEventArgs[] = [];
      state.SelectionChanged$.subscribe((e) => events.push(e));
      state.Select(a.ID);
      state.ToggleSelect(b.ID);
      expect(events).toHaveLength(2);
      expect(events[1]).toEqual({ SelectedID: b.ID, PreviousID: a.ID, SelectedIDs: [a.ID, b.ID] });
    });
  });

  describe('SelectMany — marquee replacement', () => {
    it('replaces the selection wholesale, preserving order (last = primary)', () => {
      state.Select(c.ID);
      state.SelectMany([a.ID, b.ID]);
      expect(state.SelectedIDs).toEqual([a.ID, b.ID]);
      expect(state.SelectedID).toBe(b.ID);
      expect(state.IsItemSelected(a.ID)).toBe(true);
      expect(state.IsItemSelected(c.ID)).toBe(false);
    });

    it('drops unknown IDs and collapses duplicates to their first occurrence', () => {
      state.SelectMany([a.ID, 'ghost', b.ID, a.ID]);
      expect(state.SelectedIDs).toEqual([a.ID, b.ID]);
    });

    it('an empty / fully-unknown list clears the selection', () => {
      state.SelectMany([a.ID, b.ID]);
      state.SelectMany(['ghost-1', 'ghost-2']);
      expect(state.SelectedIDs).toEqual([]);
      expect(state.SelectedID).toBeNull();
    });

    it('does not fire SelectionChanged$ when the selection is unchanged', () => {
      state.SelectMany([a.ID, b.ID]);
      const events: WhiteboardSelectionChangedEventArgs[] = [];
      state.SelectionChanged$.subscribe((e) => events.push(e));
      state.SelectMany([a.ID, b.ID]);
      expect(events).toHaveLength(0);
    });

    it('Select(id) collapses a multi-selection to a single item', () => {
      state.SelectMany([a.ID, b.ID, c.ID]);
      state.Select(b.ID);
      expect(state.SelectedIDs).toEqual([b.ID]);
    });
  });

  describe('MoveSelectedBy — group drag as ONE undo step', () => {
    it('moves every selected item by the same delta', () => {
      state.SelectMany([a.ID, b.ID]);
      expect(state.MoveSelectedBy(40, 25, 'user')).toBe(2);
      expect(state.ItemBounds(state.GetItem(a.ID)!)).toMatchObject({ X: 40, Y: 25 });
      expect(state.ItemBounds(state.GetItem(b.ID)!)).toMatchObject({ X: 340, Y: 25 });
      // unselected item untouched
      expect(state.ItemBounds(state.GetItem(c.ID)!).X).toBe(600);
    });

    it('a SINGLE Undo reverts the whole group move', () => {
      state.SelectMany([a.ID, b.ID, c.ID]);
      state.MoveSelectedBy(100, 100, 'user');
      expect(state.Undo()).toBe(true);
      expect(state.ItemBounds(state.GetItem(a.ID)!)).toMatchObject({ X: 0, Y: 0 });
      expect(state.ItemBounds(state.GetItem(b.ID)!)).toMatchObject({ X: 300, Y: 0 });
      expect(state.ItemBounds(state.GetItem(c.ID)!)).toMatchObject({ X: 600, Y: 0 });
      // and nothing earlier was swallowed into that snapshot: redo restores the move
      expect(state.Redo()).toBe(true);
      expect(state.ItemBounds(state.GetItem(a.ID)!)).toMatchObject({ X: 100, Y: 100 });
    });

    it('translates ink strokes point-by-point like a normal move', () => {
      const ink = state.AddItem(
        { Kind: 'ink', Points: [{ X: 10, Y: 10 }, { X: 20, Y: 30 }], Color: '#fbbf24', StrokeWidth: 4 }, 'user'
      ) as WhiteboardInkItem;
      state.SelectMany([ink.ID]);
      state.MoveSelectedBy(5, 5, 'user');
      expect((state.GetItem(ink.ID) as WhiteboardInkItem).Points).toEqual([{ X: 15, Y: 15 }, { X: 25, Y: 35 }]);
    });

    it('returns 0 (and pushes no undo state) for an empty selection or a zero delta', () => {
      expect(state.MoveSelectedBy(10, 10, 'user')).toBe(0);
      state.SelectMany([a.ID]);
      expect(state.MoveSelectedBy(0, 0, 'user')).toBe(0);
    });
  });

  describe('RemoveSelected — Delete key on a multi-selection', () => {
    it('removes every selected item and empties the selection', () => {
      state.SelectMany([a.ID, c.ID]);
      expect(state.RemoveSelected('user')).toBe(2);
      expect(state.GetItem(a.ID)).toBeUndefined();
      expect(state.GetItem(c.ID)).toBeUndefined();
      expect(state.GetItem(b.ID)).toBeTruthy();
      expect(state.SelectedIDs).toEqual([]);
    });

    it('a SINGLE Undo restores the whole group', () => {
      state.SelectMany([a.ID, b.ID, c.ID]);
      state.RemoveSelected('user');
      expect(state.ElementCount).toBe(0);
      expect(state.Undo()).toBe(true);
      expect(state.ElementCount).toBe(3);
      expect(state.GetItem(a.ID)).toBeTruthy();
      expect(state.GetItem(b.ID)).toBeTruthy();
      expect(state.GetItem(c.ID)).toBeTruthy();
    });

    it('still works for a single selection (the existing delete path)', () => {
      state.Select(b.ID);
      expect(state.RemoveSelected('user')).toBe(1);
      expect(state.GetItem(b.ID)).toBeUndefined();
      expect(state.ElementCount).toBe(2);
    });

    it('a per-item ItemRemoving$ veto keeps just that member', () => {
      state.ItemRemoving$.subscribe((e) => {
        if (e.Item.ID === b.ID) {
          e.Cancel = true;
        }
      });
      state.SelectMany([a.ID, b.ID]);
      expect(state.RemoveSelected('user')).toBe(1);
      expect(state.GetItem(a.ID)).toBeUndefined();
      expect(state.GetItem(b.ID)).toBeTruthy();
    });
  });

  describe('selection volatility (UI state, never persisted)', () => {
    it('clears on page switch', () => {
      state.SelectMany([a.ID, b.ID]);
      state.AddPage('Two');
      expect(state.SelectedIDs).toEqual([]);
      state.SwitchPage('Page 1');
      expect(state.SelectedIDs).toEqual([]);
    });

    it('drops removed members implicitly (single RemoveItem)', () => {
      state.SelectMany([a.ID, b.ID]);
      state.RemoveItem(a.ID, 'user');
      expect(state.SelectedIDs).toEqual([b.ID]);
      expect(state.SelectedID).toBe(b.ID);
    });

    it('never lands in the persisted JSON, and LoadFromJSON clears it', () => {
      state.SelectMany([a.ID, b.ID]);
      const json = state.ToJSON();
      expect(json).not.toContain('selected');
      expect(json).not.toContain('Selected');
      const restored = WhiteboardState.FromJSON(json);
      expect(restored.SelectedIDs).toEqual([]);
      expect(state.LoadFromJSON(json)).toBe(true);
      expect(state.SelectedIDs).toEqual([]);
    });

    it('undo of a mutation drops selection members that no longer exist', () => {
      const d = state.AddItem({ Kind: 'sticky', X: 50, Y: 50, Text: 'd' }, 'user')!;
      state.SelectMany([a.ID, d.ID]);
      state.Undo(); // un-adds d
      expect(state.GetItem(d.ID)).toBeUndefined();
      expect(state.SelectedIDs).toEqual([a.ID]);
    });
  });
});

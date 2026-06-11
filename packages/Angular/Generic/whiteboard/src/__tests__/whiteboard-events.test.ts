/**
 * Tests for the engine-level BEFORE / AFTER mutation event surface:
 * ItemAdding$ / ItemAdded$, ItemUpdating$ / ItemUpdated$, ItemRemoving$ / ItemRemoved$,
 * including cancellation semantics (no mutation, no journal, no Changed$, no undo
 * snapshot) and the agent-tool round-trip's canceled-operation failure payload.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  WhiteboardChange,
  WhiteboardItemAddedEventArgs,
  WhiteboardItemAddingEventArgs,
  WhiteboardItemRemovedEventArgs,
  WhiteboardItemRemovingEventArgs,
  WhiteboardItemUpdatedEventArgs,
  WhiteboardItemUpdatingEventArgs,
  WhiteboardState,
  WhiteboardStickyItem
} from '../lib/whiteboard-state';
import { ApplyWhiteboardAgentTool, WHITEBOARD_TOOL_NAMES, WhiteboardToolResult } from '../lib/whiteboard-tools';

describe('WhiteboardState before/after events', () => {
  let state: WhiteboardState;
  let changes: WhiteboardChange[];

  beforeEach(() => {
    state = new WhiteboardState();
    changes = [];
    state.Changed$.subscribe((c) => changes.push(c));
  });

  describe('ItemAdding$ / ItemAdded$', () => {
    it('should fire ItemAdding before and ItemAdded after a successful add', () => {
      const adding: WhiteboardItemAddingEventArgs[] = [];
      const added: WhiteboardItemAddedEventArgs[] = [];
      state.ItemAdding$.subscribe((e) => adding.push(e));
      state.ItemAdded$.subscribe((e) => added.push(e));

      const item = state.AddItem({ Kind: 'sticky', X: 1, Y: 2, Text: 'hi' }, 'user');

      expect(adding).toHaveLength(1);
      expect(adding[0].Input.Kind).toBe('sticky');
      expect(adding[0].Author).toBe('user');
      expect(added).toHaveLength(1);
      expect(added[0].Item).toBe(item);
      expect(added[0].Item.ID).toBe('sticky-1');
      expect(added[0].Author).toBe('user');
    });

    it('should abort the add when a handler cancels — null result, no state change', () => {
      state.ItemAdding$.subscribe((e) => { e.Cancel = true; });
      const added: WhiteboardItemAddedEventArgs[] = [];
      state.ItemAdded$.subscribe((e) => added.push(e));

      const item = state.AddItem({ Kind: 'sticky', X: 1, Y: 2, Text: 'no' }, 'agent');

      expect(item).toBeNull();
      expect(state.Items).toHaveLength(0);
      expect(added).toHaveLength(0);
      expect(changes).toHaveLength(0); // no journal / Changed$ emission
      expect(state.CanUndo).toBe(false); // no undo snapshot was pushed
      expect(state.CurrentSeq).toBe(0);
    });

    it('should let a handler rewrite the input before the engine stamps it', () => {
      state.ItemAdding$.subscribe((e) => {
        if (e.Input.Kind === 'sticky') {
          e.Input.Text = 'rewritten';
        }
      });
      const item = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'original' }, 'user') as WhiteboardStickyItem;
      expect(item.Text).toBe('rewritten');
    });

    it('should fire the pair for Highlight and DuplicateItem (both add through AddItem)', () => {
      const adding: WhiteboardItemAddingEventArgs[] = [];
      state.ItemAdding$.subscribe((e) => adding.push(e));

      const region = state.Highlight(0, 0, 10, 10, 'look', 'agent');
      expect(region?.Kind).toBe('highlight');
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'dup me' }, 'user');
      const copy = state.DuplicateItem(sticky!.ID, 'user');
      expect(copy).not.toBeNull();
      expect(adding).toHaveLength(3); // highlight + sticky + duplicate
    });

    it('should return null from Highlight and DuplicateItem when the add is canceled', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'keep' }, 'user');
      state.ItemAdding$.subscribe((e) => { e.Cancel = true; });
      expect(state.Highlight(0, 0, 5, 5, undefined, 'agent')).toBeNull();
      expect(state.DuplicateItem(sticky!.ID, 'user')).toBeNull();
      expect(state.Items).toHaveLength(1);
    });
  });

  describe('ItemUpdating$ / ItemUpdated$', () => {
    let stickyId: string;

    beforeEach(() => {
      stickyId = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'base' }, 'user')!.ID;
    });

    it('should fire the pair with Operation "update" around UpdateItem', () => {
      const updating: WhiteboardItemUpdatingEventArgs[] = [];
      const updated: WhiteboardItemUpdatedEventArgs[] = [];
      state.ItemUpdating$.subscribe((e) => updating.push(e));
      state.ItemUpdated$.subscribe((e) => updated.push(e));

      expect(state.UpdateItem(stickyId, { Text: 'next' }, 'agent')).toBe(true);

      expect(updating).toHaveLength(1);
      expect(updating[0].Operation).toBe('update');
      expect(updating[0].Patch).toEqual({ Text: 'next' });
      expect(updated).toHaveLength(1);
      expect(updated[0].Operation).toBe('update');
      expect((updated[0].Item as WhiteboardStickyItem).Text).toBe('next');
    });

    it('should veto UpdateItem when canceled — false result, item untouched', () => {
      state.ItemUpdating$.subscribe((e) => { e.Cancel = true; });
      const before = changes.length;
      expect(state.UpdateItem(stickyId, { Text: 'denied' }, 'agent')).toBe(false);
      expect((state.GetItem(stickyId) as WhiteboardStickyItem).Text).toBe('base');
      expect(changes).toHaveLength(before);
    });

    it('should let a handler adjust the patch before it applies', () => {
      state.ItemUpdating$.subscribe((e) => {
        if (e.Operation === 'update' && e.Patch) {
          e.Patch.Text = 'moderated';
        }
      });
      state.UpdateItem(stickyId, { Text: 'raw' }, 'agent');
      expect((state.GetItem(stickyId) as WhiteboardStickyItem).Text).toBe('moderated');
    });

    it('should fire the pair with Operation "move" and the requested Position around MoveItem', () => {
      const updating: WhiteboardItemUpdatingEventArgs[] = [];
      const updated: WhiteboardItemUpdatedEventArgs[] = [];
      state.ItemUpdating$.subscribe((e) => updating.push(e));
      state.ItemUpdated$.subscribe((e) => updated.push(e));

      expect(state.MoveItem(stickyId, 50, 60, 'user')).toBe(true);

      expect(updating).toHaveLength(1);
      expect(updating[0].Operation).toBe('move');
      expect(updating[0].Position).toEqual({ X: 50, Y: 60 });
      expect(updated[0].Operation).toBe('move');
    });

    it('should veto MoveItem when canceled', () => {
      state.ItemUpdating$.subscribe((e) => { e.Cancel = true; });
      expect(state.MoveItem(stickyId, 99, 99, 'user')).toBe(false);
      const item = state.GetItem(stickyId) as WhiteboardStickyItem;
      expect(item.X).toBe(0);
      expect(item.Y).toBe(0);
    });

    it('should fire the pair with Operation "reorder" around BringToFront / SendToBack', () => {
      const ops: string[] = [];
      state.ItemUpdating$.subscribe((e) => ops.push(`before:${e.Operation}`));
      state.ItemUpdated$.subscribe((e) => ops.push(`after:${e.Operation}`));

      expect(state.BringToFront(stickyId, 'user')).toBe(true);
      expect(state.SendToBack(stickyId, 'user')).toBe(true);
      expect(ops).toEqual(['before:reorder', 'after:reorder', 'before:reorder', 'after:reorder']);
    });

    it('should veto reorders when canceled', () => {
      const origZ = state.GetItem(stickyId)!.Z;
      state.ItemUpdating$.subscribe((e) => { e.Cancel = true; });
      expect(state.BringToFront(stickyId, 'user')).toBe(false);
      expect(state.SendToBack(stickyId, 'user')).toBe(false);
      expect(state.GetItem(stickyId)!.Z).toBe(origZ);
    });
  });

  describe('ItemRemoving$ / ItemRemoved$', () => {
    it('should fire the pair around RemoveItem', () => {
      const id = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'bye' }, 'user')!.ID;
      const removing: WhiteboardItemRemovingEventArgs[] = [];
      const removed: WhiteboardItemRemovedEventArgs[] = [];
      state.ItemRemoving$.subscribe((e) => removing.push(e));
      state.ItemRemoved$.subscribe((e) => removed.push(e));

      expect(state.RemoveItem(id, 'user')).toBe(true);

      expect(removing).toHaveLength(1);
      expect(removing[0].Item.ID).toBe(id);
      expect(removed).toHaveLength(1);
      expect(removed[0].Item.ID).toBe(id);
      expect(state.GetItem(id)).toBeUndefined();
    });

    it('should veto RemoveItem when canceled — item stays on the board', () => {
      const id = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'stay' }, 'user')!.ID;
      const before = changes.length;
      state.ItemRemoving$.subscribe((e) => { e.Cancel = true; });
      expect(state.RemoveItem(id, 'user')).toBe(false);
      expect(state.GetItem(id)).toBeDefined();
      expect(changes).toHaveLength(before);
    });
  });

  describe('agent tool round-trip under cancellation', () => {
    function parse(json: string): WhiteboardToolResult {
      return JSON.parse(json) as WhiteboardToolResult;
    }

    it('should return a canceled failure from add tools when ItemAdding is vetoed', () => {
      state.ItemAdding$.subscribe((e) => { e.Cancel = true; });
      const result = parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, JSON.stringify({ text: 'hello' })));
      expect(result.success).toBe(false);
      expect(result.error).toContain('canceled');
      expect(state.Items).toHaveLength(0);
    });

    it('should return a canceled failure from mutate tools when ItemUpdating / ItemRemoving are vetoed', () => {
      const id = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'base' }, 'agent')!.ID;
      state.ItemUpdating$.subscribe((e) => { e.Cancel = true; });
      state.ItemRemoving$.subscribe((e) => { e.Cancel = true; });

      const moved = parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.MoveItem, JSON.stringify({ itemId: id, x: 9, y: 9 })));
      expect(moved.success).toBe(false);
      expect(moved.error).toContain('canceled');

      const removedResult = parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.RemoveItem, JSON.stringify({ itemId: id })));
      expect(removedResult.success).toBe(false);
      expect(removedResult.error).toContain('canceled');
      expect(state.GetItem(id)).toBeDefined();
    });
  });
});

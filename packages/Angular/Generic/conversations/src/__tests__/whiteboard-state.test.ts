import { describe, it, expect, beforeEach } from 'vitest';
import {
  WhiteboardChange, WhiteboardConnectorItem, WhiteboardInkItem, WhiteboardShapeItem,
  WhiteboardState, WhiteboardStickyItem, WhiteboardTextItem
} from '../lib/components/realtime/whiteboard/whiteboard-state';
import {
  ApplyWhiteboardAgentTool, WHITEBOARD_TOOL_DEFINITIONS, WHITEBOARD_TOOL_NAMES, WhiteboardToolResult
} from '../lib/components/realtime/whiteboard/whiteboard-tools';

function parseResult(json: string): WhiteboardToolResult {
  return JSON.parse(json) as WhiteboardToolResult;
}

describe('WhiteboardState', () => {
  let state: WhiteboardState;
  let changes: WhiteboardChange[];

  beforeEach(() => {
    state = new WhiteboardState();
    changes = [];
    state.Changed$.subscribe((c) => changes.push(c));
  });

  describe('AddItem / UpdateItem / MoveItem / RemoveItem', () => {
    it('should add an item with engine-stamped ID, Z and Author', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 10, Y: 20, Text: 'hello' }, 'user');
      expect(sticky.ID).toBe('sticky-1');
      expect(sticky.Z).toBe(1);
      expect(sticky.Author).toBe('user');
      expect(state.Items).toHaveLength(1);
      expect(state.GetItem('sticky-1')).toBe(sticky);
    });

    it('should keep Items in ascending Z (render) order', () => {
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a' }, 'user');
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'b' }, 'agent');
      const ids = state.Items.map((i) => i.ID);
      expect(ids).toEqual(['sticky-1', 'text-2']);
    });

    it('should update an item via patch and reject unknown ids', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'old' }, 'user');
      expect(state.UpdateItem(sticky.ID, { Text: 'new' }, 'user')).toBe(true);
      expect((state.GetItem(sticky.ID) as WhiteboardStickyItem).Text).toBe('new');
      expect(state.UpdateItem('nope', { Text: 'x' }, 'user')).toBe(false);
    });

    it('should move positioned items to absolute coordinates', () => {
      const shape = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 10, Y: 10, W: 100, H: 60, Label: 'Box' }, 'user');
      expect(state.MoveItem(shape.ID, 200, 300, 'user')).toBe(true);
      const moved = state.GetItem(shape.ID) as WhiteboardShapeItem;
      expect(moved.X).toBe(200);
      expect(moved.Y).toBe(300);
    });

    it('should translate every point when moving an ink stroke', () => {
      const ink = state.AddItem({
        Kind: 'ink',
        Points: [{ X: 10, Y: 10 }, { X: 20, Y: 30 }],
        Color: '#cbd5e1',
        StrokeWidth: 4
      }, 'user');
      // ink bounds are padded by stroke width; move so bounds origin lands at (50, 50)
      state.MoveItem(ink.ID, 50, 50, 'user');
      const moved = state.GetItem(ink.ID) as WhiteboardInkItem;
      const bounds = state.ItemBounds(moved);
      expect(Math.round(bounds.X)).toBe(50);
      expect(Math.round(bounds.Y)).toBe(50);
      // relative geometry preserved
      expect(moved.Points[1].X - moved.Points[0].X).toBe(10);
      expect(moved.Points[1].Y - moved.Points[0].Y).toBe(20);
    });

    it('should remove an item and clear its selection', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'x' }, 'user');
      state.Select(sticky.ID);
      expect(state.RemoveItem(sticky.ID, 'user')).toBe(true);
      expect(state.GetItem(sticky.ID)).toBeUndefined();
      expect(state.SelectedID).toBeNull();
      expect(state.RemoveItem(sticky.ID, 'user')).toBe(false);
    });

    it('should freeze connector endpoints to absolute points when an anchor item is removed', () => {
      const a = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 100, H: 50, Label: 'A' }, 'user');
      const b = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 200, Y: 200, W: 100, H: 50, Label: 'B' }, 'user');
      const conn = state.AddItem({ Kind: 'connector', FromItemID: a.ID, ToItemID: b.ID }, 'agent') as WhiteboardConnectorItem;
      state.RemoveItem(a.ID, 'user');
      const after = state.GetItem(conn.ID) as WhiteboardConnectorItem;
      expect(after.FromItemID).toBeNull();
      expect(after.FromPoint).toEqual({ X: 50, Y: 25 }); // A's last center
      expect(after.ToItemID).toBe(b.ID); // untouched endpoint stays anchored
      expect(state.ResolveEndpoint(after, 'from')).toEqual({ X: 50, Y: 25 });
    });
  });

  describe('author flagging on Changed$', () => {
    it('should stamp every change with op, item id, author and a summary fragment', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'note from sage' }, 'agent');
      expect(changes).toHaveLength(1);
      expect(changes[0].Op).toBe('add');
      expect(changes[0].ItemID).toBe(sticky.ID);
      expect(changes[0].Author).toBe('agent');
      expect(changes[0].SummaryFragment).toContain('sticky note');
      expect(changes[0].Seq).toBe(1);
    });

    it('should report user-authored mutations distinctly from agent ones', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'mine' }, 'user');
      state.MoveItem(sticky.ID, 50, 50, 'agent');
      expect(changes.map((c) => c.Author)).toEqual(['user', 'agent']);
    });
  });

  describe('undo / redo', () => {
    it('should undo and redo a single mutation', () => {
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'hi' }, 'user');
      expect(state.CanUndo).toBe(true);
      expect(state.Undo()).toBe(true);
      expect(state.Items).toHaveLength(0);
      expect(state.CanRedo).toBe(true);
      expect(state.Redo()).toBe(true);
      expect(state.Items).toHaveLength(1);
      expect((state.Items[0]).ID).toBe('text-1');
    });

    it('should treat a RunBatch as one undo step', () => {
      state.RunBatch(() => {
        state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a' }, 'agent');
        state.AddItem({ Kind: 'connector', FromPoint: { X: 0, Y: 0 }, ToPoint: { X: 10, Y: 10 } }, 'agent');
      });
      expect(state.Items).toHaveLength(2);
      state.Undo();
      expect(state.Items).toHaveLength(0);
    });

    it('should clear the redo branch on a new mutation', () => {
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'one' }, 'user');
      state.Undo();
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'two' }, 'user');
      expect(state.CanRedo).toBe(false);
    });

    it('should emit a replace change for undo/redo', () => {
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'x' }, 'user');
      changes = [];
      state.Undo();
      expect(changes[0].Op).toBe('replace');
    });

    it('should return false when nothing to undo/redo', () => {
      expect(state.Undo()).toBe(false);
      expect(state.Redo()).toBe(false);
    });
  });

  describe('scene delta coalescing (BuildSceneDelta)', () => {
    it('should coalesce multiple moves of one item into a single moved entry at the final position', () => {
      const shape = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 100, H: 50, Label: 'Box' }, 'user');
      const token = state.CurrentSeq;
      state.MoveItem(shape.ID, 100, 100, 'user');
      state.MoveItem(shape.ID, 200, 150, 'user');
      state.MoveItem(shape.ID, 430, 298, 'user');
      const delta = state.BuildSceneDelta(token);
      expect(delta.op).toBe('scene-delta');
      expect(delta.moved).toEqual([{ id: shape.ID, x: 430, y: 298 }]);
      expect(delta.added).toHaveLength(0);
      expect(delta.updated).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.reset).toBeUndefined();
    });

    it('should coalesce add + moves into one added entry with the current state', () => {
      const token = state.CurrentSeq;
      const sticky = state.AddItem({ Kind: 'sticky', X: 10, Y: 10, Text: 'note' }, 'user');
      state.MoveItem(sticky.ID, 300, 90, 'user');
      const delta = state.BuildSceneDelta(token);
      expect(delta.added).toHaveLength(1);
      expect(delta.added[0]).toMatchObject({ id: sticky.ID, type: 'sticky', author: 'user', x: 300, y: 90, text: 'note' });
      expect(delta.moved).toHaveLength(0);
    });

    it('should drop add + remove entirely (net nothing)', () => {
      const token = state.CurrentSeq;
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'oops' }, 'user');
      state.RemoveItem(sticky.ID, 'user');
      const delta = state.BuildSceneDelta(token);
      expect(delta.added).toHaveLength(0);
      expect(delta.removed).toHaveLength(0);
      expect(delta.moved).toHaveLength(0);
    });

    it('should fold update + move into one updated entry', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'v1' }, 'user');
      const token = state.CurrentSeq;
      state.UpdateItem(sticky.ID, { Text: 'v2' }, 'user');
      state.MoveItem(sticky.ID, 80, 90, 'user');
      const delta = state.BuildSceneDelta(token);
      expect(delta.updated).toHaveLength(1);
      expect(delta.updated[0]).toMatchObject({ id: sticky.ID, text: 'v2', x: 80, y: 90 });
      expect(delta.moved).toHaveLength(0);
    });

    it('should list removals of pre-existing items', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'old' }, 'user');
      const token = state.CurrentSeq;
      state.RemoveItem(sticky.ID, 'user');
      const delta = state.BuildSceneDelta(token);
      expect(delta.removed).toEqual([sticky.ID]);
    });

    it('should fall back to reset (replace-current-state) when the window contains an undo', () => {
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a' }, 'user');
      const token = state.CurrentSeq;
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'b' }, 'user');
      state.Undo();
      const delta = state.BuildSceneDelta(token);
      expect(delta.reset).toBe(true);
      expect(delta.items).toBeDefined();
      expect(delta.items).toHaveLength(1);
      expect(delta.summary).toContain('snapshot');
    });

    it('should include a human summary with counts', () => {
      const token = state.CurrentSeq;
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'one' }, 'user');
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'two' }, 'agent');
      const delta = state.BuildSceneDelta(token);
      expect(delta.summary).toContain('2 added');
      expect(delta.summary).toContain('user 1 · agent 1');
    });
  });

  describe('BuildSceneSummary', () => {
    it('should count elements by author and kind (highlights excluded from totals)', () => {
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a' }, 'user');
      state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 100, H: 50, Label: 'b' }, 'user');
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'c' }, 'agent');
      state.Highlight(0, 0, 100, 100, undefined, 'agent');
      const summary = state.BuildSceneSummary();
      expect(summary.counts.total).toBe(3);
      expect(summary.counts.user).toBe(2);
      expect(summary.counts.agent).toBe(1);
      expect(summary.counts.byKind['sticky']).toBe(1);
      expect(summary.counts.byKind['highlight']).toBe(1);
      expect(summary.items).toHaveLength(4); // items list still includes the highlight
    });
  });

  describe('ToJSON / FromJSON round-trip', () => {
    it('should round-trip items, counts and id continuity', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 12, Y: 34, Text: 'persist me', Tint: 'amber', Rotation: -1 }, 'user');
      const shape = state.AddItem({ Kind: 'shape', Shape: 'diamond', X: 50, Y: 60, W: 120, H: 70, Label: 'Track', Sub: 'sub' }, 'agent');
      state.AddItem({ Kind: 'connector', FromItemID: sticky.ID, ToItemID: shape.ID }, 'agent');
      state.AddItem({ Kind: 'ink', Points: [{ X: 1, Y: 2 }, { X: 3, Y: 4 }], Color: '#fbbf24', StrokeWidth: 7 }, 'user');

      const json = state.ToJSON();
      const restored = WhiteboardState.FromJSON(json);

      expect(restored.Items).toEqual(state.Items);
      expect(restored.ElementCount).toBe(state.ElementCount);
      expect(restored.CountByAuthor('agent')).toBe(2);
      expect(restored.CurrentSeq).toBe(state.CurrentSeq);

      // id counter continuity — no collisions after rehydrate
      const fresh = restored.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'new' }, 'user');
      expect(state.GetItem(fresh.ID)).toBeUndefined();
      expect(restored.Items.map((i) => i.ID).filter((id) => id === fresh.ID)).toHaveLength(1);
    });

    it('should force reset deltas for stale tokens after rehydration', () => {
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'x' }, 'user');
      const restored = WhiteboardState.FromJSON(state.ToJSON());
      const delta = restored.BuildSceneDelta(0);
      expect(delta.reset).toBe(true);
      expect(delta.items).toHaveLength(1);
    });

    it('should throw on malformed payloads', () => {
      expect(() => WhiteboardState.FromJSON('{"nope":true}')).toThrow();
      expect(() => WhiteboardState.FromJSON('not json')).toThrow();
    });
  });
});

describe('ApplyWhiteboardAgentTool', () => {
  let state: WhiteboardState;

  beforeEach(() => {
    state = new WhiteboardState();
  });

  it('should reject invalid JSON args and non-object args', () => {
    expect(parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, '{{nope')).success).toBe(false);
    expect(parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, '[1,2]')).success).toBe(false);
  });

  it('should reject unknown tools', () => {
    const result = parseResult(ApplyWhiteboardAgentTool(state, 'Whiteboard.Nope', '{}'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown whiteboard tool');
  });

  describe('Whiteboard_AddNote', () => {
    it('should add an agent-authored sticky at the given position', () => {
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote,
        JSON.stringify({ text: 'segment by engagement score', x: 706, y: 84 })));
      expect(result.success).toBe(true);
      const item = state.GetItem(result.itemId as string) as WhiteboardStickyItem;
      expect(item.Kind).toBe('sticky');
      expect(item.Author).toBe('agent');
      expect(item.X).toBe(706);
      expect(item.Text).toBe('segment by engagement score');
    });

    it('should auto-place when coordinates are omitted and fail without text', () => {
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, '{"text":"hi"}'));
      expect(ok.success).toBe(true);
      const bad = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, '{}'));
      expect(bad.success).toBe(false);
      expect(bad.error).toContain('text');
    });

    it('should apply a curated fontSize and reject off-step sizes', () => {
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote,
        JSON.stringify({ text: 'big idea', fontSize: 18 })));
      expect(ok.success).toBe(true);
      expect((state.GetItem(ok.itemId as string) as WhiteboardStickyItem).FontSize).toBe(18);

      const bad = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote,
        JSON.stringify({ text: 'x', fontSize: 13 })));
      expect(bad.success).toBe(false);
      expect(bad.error).toContain('fontSize');
    });
  });

  describe('Whiteboard_AddShape', () => {
    it('should add a labeled shape with defaults and validate the shape kind', () => {
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddShape,
        JSON.stringify({ label: 'Email sequence', sub: '5 touches · drip', x: 420, y: 118 })));
      expect(ok.success).toBe(true);
      const item = state.GetItem(ok.itemId as string) as WhiteboardShapeItem;
      expect(item.Shape).toBe('rect');
      expect(item.W).toBe(172);
      expect(item.Sub).toBe('5 touches · drip');

      const bad = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddShape,
        JSON.stringify({ label: 'x', shape: 'triangle' })));
      expect(bad.success).toBe(false);
      expect(bad.error).toContain('shape');
    });
  });

  describe('Whiteboard_AddText', () => {
    it('should add an agent text label and fail without text', () => {
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddText,
        JSON.stringify({ text: '= nurture track', x: 622, y: 128 })));
      expect(ok.success).toBe(true);
      expect(state.GetItem(ok.itemId as string)?.Kind).toBe('text');
      const bad = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddText, '{}'));
      expect(bad.success).toBe(false);
    });

    it('should apply optional style args and reject bad values', () => {
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddText,
        JSON.stringify({ text: 'headline', fontSize: 24, fontFamily: 'mono', bold: true })));
      expect(ok.success).toBe(true);
      const item = state.GetItem(ok.itemId as string) as WhiteboardTextItem;
      expect(item.FontSize).toBe(24);
      expect(item.FontFamily).toBe('mono');
      expect(item.FontWeight).toBe(700);

      const badSize = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddText,
        JSON.stringify({ text: 'x', fontSize: 99 })));
      expect(badSize.success).toBe(false);
      expect(badSize.error).toContain('fontSize');

      const badFamily = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddText,
        JSON.stringify({ text: 'x', fontFamily: 'comic-sans' })));
      expect(badFamily.success).toBe(false);
      expect(badFamily.error).toContain('fontFamily');

      const badBold = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddText,
        JSON.stringify({ text: 'x', bold: 'yes' })));
      expect(badBold.success).toBe(false);
      expect(badBold.error).toContain('bold');
    });
  });

  describe('Whiteboard_DrawConnector', () => {
    it('should connect two existing items by id', () => {
      const a = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 100, H: 50, Label: 'Email' }, 'user');
      const b = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 200, W: 100, H: 50, Label: 'Webinar' }, 'user');
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.DrawConnector,
        JSON.stringify({ fromId: a.ID, toId: b.ID })));
      expect(result.success).toBe(true);
      const conn = state.GetItem(result.itemId as string) as WhiteboardConnectorItem;
      expect(conn.Author).toBe('agent');
      expect(conn.FromItemID).toBe(a.ID);
      expect(conn.ToItemID).toBe(b.ID);
    });

    it('should support absolute point endpoints', () => {
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.DrawConnector,
        JSON.stringify({ fromX: 10, fromY: 20, toX: 100, toY: 200 })));
      expect(result.success).toBe(true);
      const conn = state.GetItem(result.itemId as string) as WhiteboardConnectorItem;
      expect(conn.FromPoint).toEqual({ X: 10, Y: 20 });
      expect(conn.ToPoint).toEqual({ X: 100, Y: 200 });
    });

    it('should fail on unknown ids or missing endpoints', () => {
      const missing = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.DrawConnector, '{"fromX":1,"fromY":2}'));
      expect(missing.success).toBe(false);
      const unknown = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.DrawConnector,
        JSON.stringify({ fromId: 'shape-99', toId: 'shape-98' })));
      expect(unknown.success).toBe(false);
      expect(unknown.error).toContain('shape-99');
    });
  });

  describe('Whiteboard_Highlight', () => {
    it('should highlight around existing items (union bounds + padding)', () => {
      const a = state.AddItem({ Kind: 'sticky', X: 182, Y: 92, Text: 'a' }, 'user');
      const b = state.AddItem({ Kind: 'sticky', X: 178, Y: 238, Text: 'b' }, 'user');
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.Highlight,
        JSON.stringify({ itemIds: [a.ID, b.ID] })));
      expect(result.success).toBe(true);
      const hl = state.GetItem(result.itemId as string);
      expect(hl?.Kind).toBe('highlight');
      if (hl?.Kind === 'highlight') {
        expect(hl.X).toBe(178 - 18);
        expect(hl.Y).toBe(92 - 18);
        expect(hl.Author).toBe('agent');
      }
    });

    it('should accept an explicit region and reject missing geometry / unknown ids', () => {
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.Highlight,
        JSON.stringify({ x: 156, y: 62, w: 240, h: 310, label: 'look here' })));
      expect(ok.success).toBe(true);
      const none = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.Highlight, '{}'));
      expect(none.success).toBe(false);
      const unknown = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.Highlight,
        JSON.stringify({ itemIds: ['nope-1'] })));
      expect(unknown.success).toBe(false);
    });
  });

  describe('Whiteboard_MoveItem', () => {
    it('should move an item as the agent and validate args', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'm' }, 'user');
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.MoveItem,
        JSON.stringify({ itemId: sticky.ID, x: 430, y: 298 })));
      expect(ok.success).toBe(true);
      expect((state.GetItem(sticky.ID) as WhiteboardStickyItem).X).toBe(430);

      const missing = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.MoveItem, '{"itemId":"x"}'));
      expect(missing.success).toBe(false);
      const unknown = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.MoveItem,
        '{"itemId":"sticky-99","x":1,"y":2}'));
      expect(unknown.success).toBe(false);
    });
  });

  describe('Whiteboard_RemoveItem', () => {
    it('should remove an item and report unknown ids', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'r' }, 'user');
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.RemoveItem,
        JSON.stringify({ itemId: sticky.ID })));
      expect(ok.success).toBe(true);
      expect(state.GetItem(sticky.ID)).toBeUndefined();
      const unknown = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.RemoveItem, '{"itemId":"gone"}'));
      expect(unknown.success).toBe(false);
    });
  });

  describe('Whiteboard_StyleItem', () => {
    it('should restyle a text label (size / family / bold / color) as one agent-authored update', () => {
      const text = state.AddItem({ Kind: 'text', X: 10, Y: 20, Text: 'label' }, 'user');
      const authors: string[] = [];
      const ops: string[] = [];
      state.Changed$.subscribe((c) => { authors.push(c.Author); ops.push(c.Op); });

      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem,
        JSON.stringify({ itemId: text.ID, fontSize: 32, fontFamily: 'serif', bold: true, color: '#fbbf24' })));
      expect(ok.success).toBe(true);
      expect(ok.itemId).toBe(text.ID);

      const styled = state.GetItem(text.ID) as WhiteboardTextItem;
      expect(styled.FontSize).toBe(32);
      expect(styled.FontFamily).toBe('serif');
      expect(styled.FontWeight).toBe(700);
      expect(styled.Color).toBe('#fbbf24');

      // ONE agent-authored update change, ONE undo step reverts the whole restyle
      expect(ops).toEqual(['update']);
      expect(authors).toEqual(['agent']);
      state.Undo();
      const reverted = state.GetItem(text.ID) as WhiteboardTextItem;
      expect(reverted.FontSize).toBeUndefined();
      expect(reverted.Color).toBeUndefined();
    });

    it('should restyle a sticky note font but reject color on stickies', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'note' }, 'user');
      const ok = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem,
        JSON.stringify({ itemId: sticky.ID, fontSize: 14, bold: false })));
      expect(ok.success).toBe(true);
      const styled = state.GetItem(sticky.ID) as WhiteboardStickyItem;
      expect(styled.FontSize).toBe(14);
      expect(styled.FontWeight).toBe(400);

      const badColor = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem,
        JSON.stringify({ itemId: sticky.ID, color: '#fbbf24' })));
      expect(badColor.success).toBe(false);
      expect(badColor.error).toContain('color');
    });

    it('should reject missing/unknown ids, non-text kinds, empty patches and bad values', () => {
      const shape = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 100, H: 50, Label: 'Box' }, 'user');
      const text = state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 't' }, 'user');

      const noId = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem, '{"fontSize":18}'));
      expect(noId.success).toBe(false);
      expect(noId.error).toContain('itemId');

      const unknown = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem,
        '{"itemId":"text-99","bold":true}'));
      expect(unknown.success).toBe(false);
      expect(unknown.error).toContain('text-99');

      const wrongKind = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem,
        JSON.stringify({ itemId: shape.ID, bold: true })));
      expect(wrongKind.success).toBe(false);
      expect(wrongKind.error).toContain('shape');

      const empty = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem,
        JSON.stringify({ itemId: text.ID })));
      expect(empty.success).toBe(false);
      expect(empty.error).toContain('at least one');

      const badSize = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem,
        JSON.stringify({ itemId: text.ID, fontSize: 11 })));
      expect(badSize.success).toBe(false);

      const badColor = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.StyleItem,
        JSON.stringify({ itemId: text.ID, color: 'tomato' })));
      expect(badColor.success).toBe(false);
      expect(badColor.error).toContain('hex');

      // nothing mutated by any of the failures
      expect((state.GetItem(text.ID) as WhiteboardTextItem).FontSize).toBeUndefined();
    });
  });

  describe('agent tool batching + flagging', () => {
    it('should run each tool call as one undo batch with agent-authored changes', () => {
      const authors: string[] = [];
      state.Changed$.subscribe((c) => authors.push(c.Author));
      ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, '{"text":"n"}');
      expect(authors).toEqual(['agent']);
      expect(state.Items).toHaveLength(1);
      state.Undo();
      expect(state.Items).toHaveLength(0);
    });
  });
});

describe('WHITEBOARD_TOOL_DEFINITIONS', () => {
  it('should describe all eight channel tools with parameter schemas', () => {
    expect(WHITEBOARD_TOOL_DEFINITIONS).toHaveLength(8);
    const names = WHITEBOARD_TOOL_DEFINITIONS.map((d) => d.Name);
    expect(names).toEqual(Object.values(WHITEBOARD_TOOL_NAMES));
    for (const def of WHITEBOARD_TOOL_DEFINITIONS) {
      expect(def.Description.length).toBeGreaterThan(10);
      expect(def.ParametersSchema['type']).toBe('object');
      expect(def.ParametersSchema['properties']).toBeTruthy();
    }
  });
});

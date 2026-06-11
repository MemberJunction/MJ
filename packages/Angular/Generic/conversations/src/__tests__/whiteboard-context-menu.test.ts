import { describe, it, expect, beforeEach } from 'vitest';
import {
  WhiteboardChange, WhiteboardHtmlItem, WhiteboardInkItem, WhiteboardItem, WhiteboardState, WhiteboardStickyItem
} from '../lib/components/realtime/whiteboard/whiteboard-state';
import {
  BuildWhiteboardContextMenu, WhiteboardContextMenuActionID
} from '../lib/components/realtime/whiteboard/whiteboard-context-menu';

/**
 * RIGHT-CLICK CONTEXT MENU — the pure menu-model builder (action set per item kind /
 * empty canvas) and the engine additions backing it: DuplicateItem (deep clone, fresh
 * identity, +16/+16 offset, journaled add) and BringToFront / SendToBack (Z max+1 /
 * min−1 following the engine's existing Z handling).
 */

function ids(item: WhiteboardItem | null): WhiteboardContextMenuActionID[] {
  return BuildWhiteboardContextMenu(item).map((a) => a.ID);
}

function makeItem(state: WhiteboardState, kind: WhiteboardItem['Kind']): WhiteboardItem {
  switch (kind) {
    case 'sticky': return state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'note' }, 'user');
    case 'shape': return state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 100, H: 60, Label: 'box' }, 'user');
    case 'text': return state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'label' }, 'user');
    case 'image': return state.AddItem({ Kind: 'image', X: 0, Y: 0, Name: 'pic.png' }, 'user');
    case 'ink': return state.AddItem({ Kind: 'ink', Points: [{ X: 0, Y: 0 }, { X: 10, Y: 5 }], Color: '#fbbf24', StrokeWidth: 4 }, 'user');
    case 'connector': return state.AddItem({ Kind: 'connector', FromPoint: { X: 0, Y: 0 }, ToPoint: { X: 50, Y: 50 } }, 'user');
    case 'highlight': return state.AddItem({ Kind: 'highlight', X: 0, Y: 0, W: 80, H: 40 }, 'user');
    case 'markdown': return state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: '## hi' }, 'user');
    case 'html': return state.AddItem({ Kind: 'html', X: 0, Y: 0, W: 360, H: 240, Html: '<p>w</p>', Title: 'W' }, 'user');
  }
}

describe('BuildWhiteboardContextMenu — model per target', () => {
  let state: WhiteboardState;

  beforeEach(() => {
    state = new WhiteboardState();
  });

  it('empty canvas → the "add … here" actions only', () => {
    expect(ids(null)).toEqual(['add-sticky', 'add-text', 'add-markdown', 'add-html']);
  });

  it('highlight → Delete only (transient pointing chrome)', () => {
    expect(ids(makeItem(state, 'highlight'))).toEqual(['delete']);
  });

  it('sticky / text → full set incl. Edit and Restyle…', () => {
    const expected: WhiteboardContextMenuActionID[] =
      ['edit', 'restyle', 'duplicate', 'bring-front', 'send-back', 'delete'];
    expect(ids(makeItem(state, 'sticky'))).toEqual(expected);
    expect(ids(makeItem(state, 'text'))).toEqual(expected);
  });

  it('shape / markdown / html → Edit but no Restyle…', () => {
    const expected: WhiteboardContextMenuActionID[] =
      ['edit', 'duplicate', 'bring-front', 'send-back', 'delete'];
    expect(ids(makeItem(state, 'shape'))).toEqual(expected);
    expect(ids(makeItem(state, 'markdown'))).toEqual(expected);
    expect(ids(makeItem(state, 'html'))).toEqual(expected);
  });

  it('image / ink → no Edit (no dblclick path), but Duplicate and z-order', () => {
    const expected: WhiteboardContextMenuActionID[] =
      ['duplicate', 'bring-front', 'send-back', 'delete'];
    expect(ids(makeItem(state, 'image'))).toEqual(expected);
    expect(ids(makeItem(state, 'ink'))).toEqual(expected);
  });

  it('connector → no Edit, no Restyle, no Duplicate — z-order + Delete only', () => {
    expect(ids(makeItem(state, 'connector'))).toEqual(['bring-front', 'send-back', 'delete']);
  });

  it('marks Delete as danger and separates the z-order / delete groups', () => {
    const menu = BuildWhiteboardContextMenu(makeItem(state, 'sticky'));
    const del = menu.find((a) => a.ID === 'delete')!;
    expect(del.Danger).toBe(true);
    expect(del.SeparatorBefore).toBe(true);
    expect(menu.find((a) => a.ID === 'bring-front')!.SeparatorBefore).toBe(true);
    // every action carries render chrome
    for (const action of menu) {
      expect(action.Label.length).toBeGreaterThan(0);
      expect(action.Icon).toContain('fa-');
    }
  });
});

describe('WhiteboardState.DuplicateItem', () => {
  let state: WhiteboardState;
  let changes: WhiteboardChange[];

  beforeEach(() => {
    state = new WhiteboardState();
    changes = [];
    state.Changed$.subscribe((c) => changes.push(c));
  });

  it('deep-clones a sticky with fresh identity, +16/+16 offset and the caller author', () => {
    const source = state.AddItem(
      { Kind: 'sticky', X: 100, Y: 50, Text: 'original', Tint: 'amber-light', Rotation: 0.8, FontSize: 18 }, 'agent'
    ) as WhiteboardStickyItem;
    const copy = state.DuplicateItem(source.ID, 'user') as WhiteboardStickyItem;

    expect(copy).toBeTruthy();
    expect(copy.ID).not.toBe(source.ID);
    expect(copy.Author).toBe('user'); // author = the duplicating actor, not the source's
    expect(copy).toMatchObject({ X: 116, Y: 66, Text: 'original', Tint: 'amber-light', Rotation: 0.8, FontSize: 18 });
    expect(copy.Z).toBeGreaterThan(source.Z);
    expect(state.ElementCount).toBe(2);
  });

  it('clones ink point-by-point (every point +16/+16) and the clone is independent', () => {
    const source = state.AddItem(
      { Kind: 'ink', Points: [{ X: 0, Y: 0 }, { X: 10, Y: 20 }], Color: '#4ade80', StrokeWidth: 7 }, 'user'
    ) as WhiteboardInkItem;
    const copy = state.DuplicateItem(source.ID, 'user') as WhiteboardInkItem;

    expect(copy.Points).toEqual([{ X: 16, Y: 16 }, { X: 26, Y: 36 }]);
    expect(copy.Color).toBe('#4ade80');
    expect(copy.StrokeWidth).toBe(7);
    // DEEP clone: mutating the copy's points must not touch the source
    copy.Points[0].X = 999;
    expect((state.GetItem(source.ID) as WhiteboardInkItem).Points[0].X).toBe(0);
  });

  it('deep-clones html widgets (source string independent of the original)', () => {
    const source = state.AddItem({ Kind: 'html', X: 0, Y: 0, W: 360, H: 240, Html: '<p>v1</p>', Title: 'W' }, 'agent');
    const copy = state.DuplicateItem(source.ID, 'user') as WhiteboardHtmlItem;
    expect(copy).toMatchObject({ X: 16, Y: 16, W: 360, H: 240, Html: '<p>v1</p>', Title: 'W' });
    state.UpdateItem(copy.ID, { Html: '<p>v2</p>' }, 'user');
    expect((state.GetItem(source.ID) as WhiteboardHtmlItem).Html).toBe('<p>v1</p>');
  });

  it('refuses connectors and highlights (returns null, no mutation, no journal entry)', () => {
    const conn = makeItem(state, 'connector');
    const hl = makeItem(state, 'highlight');
    const before = changes.length;
    expect(state.DuplicateItem(conn.ID, 'user')).toBeNull();
    expect(state.DuplicateItem(hl.ID, 'user')).toBeNull();
    expect(state.DuplicateItem('no-such-id', 'user')).toBeNull();
    expect(changes.length).toBe(before);
  });

  it('journals as a normal add — one undo step removes only the clone', () => {
    const source = makeItem(state, 'sticky');
    const copy = state.DuplicateItem(source.ID, 'user')!;
    expect(changes[changes.length - 1]).toMatchObject({ Op: 'add', ItemID: copy.ID, Author: 'user' });
    state.Undo();
    expect(state.GetItem(copy.ID)).toBeUndefined();
    expect(state.GetItem(source.ID)).toBeTruthy();
  });
});

describe('WhiteboardState.BringToFront / SendToBack', () => {
  let state: WhiteboardState;
  let a: WhiteboardItem;
  let b: WhiteboardItem;
  let c: WhiteboardItem;

  beforeEach(() => {
    state = new WhiteboardState();
    a = makeItem(state, 'sticky');
    b = makeItem(state, 'shape');
    c = makeItem(state, 'text');
  });

  it('BringToFront raises above every other item (Z = max + 1 via the engine z-counter)', () => {
    expect(state.BringToFront(a.ID, 'user')).toBe(true);
    const items = state.Items; // render order = ascending Z
    expect(items[items.length - 1].ID).toBe(a.ID);
    expect(a.Z).toBeGreaterThan(Math.max(b.Z, c.Z));
  });

  it('SendToBack drops below every other item (Z = min − 1)', () => {
    expect(state.SendToBack(c.ID, 'user')).toBe(true);
    expect(state.Items[0].ID).toBe(c.ID);
    expect(c.Z).toBeLessThan(Math.min(a.Z, b.Z));
  });

  it('round-trips: front then back then front again stays consistent', () => {
    state.BringToFront(a.ID, 'user');
    state.SendToBack(a.ID, 'user');
    expect(state.Items[0].ID).toBe(a.ID);
    state.BringToFront(a.ID, 'user');
    expect(state.Items[state.Items.length - 1].ID).toBe(a.ID);
  });

  it('journals as updates, supports undo, and rejects unknown ids', () => {
    const changes: WhiteboardChange[] = [];
    state.Changed$.subscribe((ch) => changes.push(ch));
    const origZ = a.Z;

    state.BringToFront(a.ID, 'user');
    expect(changes[changes.length - 1]).toMatchObject({ Op: 'update', ItemID: a.ID, Author: 'user' });
    expect(changes[changes.length - 1].SummaryFragment).toContain('front');

    state.Undo();
    expect((state.GetItem(a.ID) as WhiteboardItem).Z).toBe(origZ);

    expect(state.BringToFront('no-such-id', 'user')).toBe(false);
    expect(state.SendToBack('no-such-id', 'user')).toBe(false);
  });

  it('z-order changes flow into the perception feed as coalesced updates', () => {
    const token = state.CurrentSeq;
    state.BringToFront(a.ID, 'user');
    const delta = state.BuildSceneDelta(token);
    expect(delta.updated.map((u) => u.id)).toContain(a.ID);
  });

  it('persists the new render order through a ToJSON round-trip', () => {
    state.SendToBack(c.ID, 'user');
    const restored = WhiteboardState.FromJSON(state.ToJSON());
    expect(restored.Items.map((i) => i.ID)).toEqual(state.Items.map((i) => i.ID));
    expect(restored.Items[0].ID).toBe(c.ID);
  });
});

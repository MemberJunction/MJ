import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Recompute-trigger coverage for the board's PRECOMPUTED RENDER BUCKETS
 * (the riskiest precompute in PR #2841).
 *
 * `recomputeRenderBuckets()` partitions `State.Items` (one Array.from + sort
 * in render/Z order) into four template-bound buckets:
 *   - _boxItems       → sticky | shape | text | image | markdown | html
 *   - _inkItems       → ink
 *   - _connectorItems → connector
 *   - _highlightItems → highlight
 *
 * The whole correctness contract rests on "the buckets are refreshed on every
 * `State.Changed$` emission, which the engine fires for every membership / order
 * change AND page switch". These tests verify:
 *   (1) each Kind lands in the right bucket,
 *   (2) render (Z/insertion) order is preserved within a bucket,
 *   (3) the buckets refresh on add / update / remove and on page switch
 *       (i.e. on Changed$), and exactly match what a naive filter over
 *       `State.Items` would have produced (the "old getter" baseline).
 *
 * We use the REAL WhiteboardState engine (it is pure TS and the canonical way
 * the existing whiteboard-state.test.ts exercises it). Only Angular's decorator
 * surface and the heavy sibling UI imports are stubbed so the component class can
 * be `new`'d in a node unit test.
 */

vi.mock('@angular/core', () => ({
  Component: () => (t: Function) => t,
  Directive: () => (t: Function) => t,
  Injectable: () => (t: Function) => t,
  Pipe: () => (t: Function) => t,
  NgModule: () => (t: Function) => t,
  Input: () => () => {},
  Output: () => () => {},
  ViewChild: () => () => {},
  HostListener: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ChangeDetectionStrategy: { OnPush: 1 },
  ElementRef: class {},
  inject: () => ({ detectChanges() {}, markForCheck() {} }),
}));
vi.mock('@angular/common', () => ({ CommonModule: class {} }));
vi.mock('@memberjunction/ng-markdown', () => ({ MarkdownModule: class {} }));
vi.mock('@memberjunction/ng-code-editor', () => ({ CodeEditorModule: class {} }));
vi.mock('../lib/whiteboard-srcdoc.pipe', () => ({ WhiteboardWidgetSrcdocPipe: class {} }));
vi.mock('../lib/whiteboard-pages.component', () => ({ RealtimeWhiteboardPagesComponent: class {} }));

// The board attaches a single window 'message' listener when an HTML widget
// exists (the widget input bridge). The whiteboard vitest env is 'node' (no
// window) — provide a no-op stub so syncWidgetMessageListener() doesn't throw.
// This is test-plumbing only; the bridge behavior itself is covered elsewhere.
const windowStub = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
(globalThis as unknown as { window: typeof windowStub }).window = windowStub;

import { RealtimeWhiteboardBoardComponent } from '../lib/whiteboard-board.component';
import { WhiteboardItem, WhiteboardState } from '../lib/whiteboard-state';

type Board = RealtimeWhiteboardBoardComponent;

function makeBoard(state: WhiteboardState): Board {
  const board = new RealtimeWhiteboardBoardComponent();
  board.State = state;
  return board;
}

/** The "old getter" baseline — what the pre-precompute template getters computed. */
const BOX_KINDS = new Set<WhiteboardItem['Kind']>(['sticky', 'shape', 'text', 'image', 'markdown', 'html']);
function baselineBox(state: WhiteboardState): WhiteboardItem[] {
  return state.Items.filter((i) => BOX_KINDS.has(i.Kind));
}
function baselineByKind(state: WhiteboardState, kind: WhiteboardItem['Kind']): WhiteboardItem[] {
  return state.Items.filter((i) => i.Kind === kind);
}

function ids(items: { ID: string }[]): string[] {
  return items.map((i) => i.ID);
}

describe('RealtimeWhiteboardBoardComponent — render-bucket precompute', () => {
  let state: WhiteboardState;
  let board: Board;

  beforeEach(() => {
    state = new WhiteboardState();
    board = makeBoard(state);
  });

  describe('partitioning (each Kind → the right bucket)', () => {
    beforeEach(() => {
      // One of every kind, interleaved, so partitioning can't accidentally
      // "pass" by coincidental ordering.
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 's' }, 'user');
      state.AddItem({ Kind: 'ink', Points: [{ X: 0, Y: 0 }, { X: 5, Y: 5 }], Color: '#000', StrokeWidth: 2 }, 'user');
      state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 40, H: 40, Label: 'sh' }, 'user');
      state.AddItem({ Kind: 'highlight', X: 0, Y: 0, W: 10, H: 10 }, 'agent');
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 't' }, 'user');
      state.AddItem({ Kind: 'connector', FromPoint: { X: 0, Y: 0 }, ToPoint: { X: 9, Y: 9 } }, 'agent');
      state.AddItem({ Kind: 'image', X: 0, Y: 0, Name: 'img.png' }, 'user');
      state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 200, Markdown: '# md' }, 'user');
      state.AddItem({ Kind: 'html', X: 0, Y: 0, W: 200, H: 120, Html: '<b>w</b>' }, 'agent');
      board.ngOnInit();
    });

    it('routes every box kind (sticky/shape/text/image/markdown/html) into BoxItems', () => {
      const kinds = board.BoxItems.map((i) => i.Kind).sort();
      expect(kinds).toEqual(['html', 'image', 'markdown', 'shape', 'sticky', 'text']);
    });

    it('routes ink/connector/highlight into their own buckets and NOWHERE else', () => {
      expect(board.InkItems.map((i) => i.Kind)).toEqual(['ink']);
      expect(board.ConnectorItems.map((i) => i.Kind)).toEqual(['connector']);
      expect(board.HighlightItems.map((i) => i.Kind)).toEqual(['highlight']);
      // mutually exclusive: no overlap between buckets
      const all = [...board.BoxItems, ...board.InkItems, ...board.ConnectorItems, ...board.HighlightItems];
      expect(new Set(ids(all)).size).toBe(all.length);
      // and every item is accounted for exactly once
      expect(all.length).toBe(state.Items.length);
    });

    it('matches the old getter baseline exactly for all four buckets', () => {
      expect(ids(board.BoxItems)).toEqual(ids(baselineBox(state)));
      expect(ids(board.InkItems)).toEqual(ids(baselineByKind(state, 'ink')));
      expect(ids(board.ConnectorItems)).toEqual(ids(baselineByKind(state, 'connector')));
      expect(ids(board.HighlightItems)).toEqual(ids(baselineByKind(state, 'highlight')));
    });
  });

  describe('order preservation within a bucket (render / Z order)', () => {
    it('keeps box items in the same relative order as State.Items', () => {
      // intersperse non-box kinds between box kinds; the box bucket must keep
      // the box items' RELATIVE order from State.Items.
      const a = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a' }, 'user');
      state.AddItem({ Kind: 'ink', Points: [{ X: 0, Y: 0 }, { X: 1, Y: 1 }], Color: '#000', StrokeWidth: 1 }, 'user');
      const b = state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'b' }, 'user');
      state.AddItem({ Kind: 'highlight', X: 0, Y: 0, W: 1, H: 1 }, 'agent');
      const c = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 5, H: 5, Label: 'c' }, 'user');
      board.ngOnInit();

      expect(ids(board.BoxItems)).toEqual([a.ID, b.ID, c.ID]);
      // and that this is precisely the Z/insertion order
      expect(ids(board.BoxItems)).toEqual(ids(baselineBox(state)));
    });
  });

  describe('refresh on Changed$ (add / update / remove)', () => {
    it('starts empty, then reflects an add WITHOUT another ngOnInit', () => {
      board.ngOnInit();
      expect(board.BoxItems).toHaveLength(0);

      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'new' }, 'user');
      // ngOnInit subscribed to Changed$, so the add must have refreshed the bucket
      expect(ids(board.BoxItems)).toEqual(ids(baselineBox(state)));
      expect(board.BoxItems).toHaveLength(1);
    });

    it('reflects a remove (item leaves the bucket on Changed$)', () => {
      const s1 = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'one' }, 'user');
      const s2 = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'two' }, 'user');
      board.ngOnInit();
      expect(ids(board.BoxItems)).toEqual([s1.ID, s2.ID]);

      state.RemoveItem(s1.ID, 'user');
      expect(ids(board.BoxItems)).toEqual([s2.ID]);
      expect(ids(board.BoxItems)).toEqual(ids(baselineBox(state)));
    });

    it('a new connector lands in ConnectorItems, not BoxItems', () => {
      const a = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 50, H: 50, Label: 'A' }, 'user');
      const b = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 200, Y: 0, W: 50, H: 50, Label: 'B' }, 'user');
      board.ngOnInit();
      expect(board.ConnectorItems).toHaveLength(0);

      const conn = state.AddItem({ Kind: 'connector', FromItemID: a.ID, ToItemID: b.ID }, 'agent');
      expect(ids(board.ConnectorItems)).toEqual([conn!.ID]);
      // the two shapes stayed in the box bucket; the connector did NOT leak in
      expect(ids(board.BoxItems)).toEqual([a.ID, b.ID]);
    });

    it('does NOT mutate the previously-returned bucket array in place — each recompute yields a fresh array', () => {
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a' }, 'user');
      board.ngOnInit();
      const firstBox = board.BoxItems;
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'b' }, 'user');
      const secondBox = board.BoxItems;
      // recomputeRenderBuckets assigns a brand-new array — so a captured reference
      // is a stable snapshot (it does NOT silently grow under the consumer).
      expect(secondBox).not.toBe(firstBox);
      expect(firstBox).toHaveLength(1);
      expect(secondBox).toHaveLength(2);
    });
  });

  describe('refresh on page switch (Changed$ fires for page changes)', () => {
    it('buckets reflect only the ACTIVE page after a SwitchPage', () => {
      // page 1: a sticky
      const p1Sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'page1' }, 'user');
      board.ngOnInit();
      expect(ids(board.BoxItems)).toEqual([p1Sticky.ID]);

      // add a second page, switch to it, add a shape there
      const page2 = state.AddPage('Page 2', 'user');
      expect(page2).not.toBeNull();
      const switched = state.SwitchPage(page2!.ID, 'user');
      expect(switched).toBe(true);

      // after the switch, the precomputed buckets must show page 2 (empty box bucket so far)
      expect(ids(board.BoxItems)).toEqual(ids(baselineBox(state)));
      expect(board.BoxItems).toHaveLength(0);

      const p2Shape = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 10, H: 10, Label: 'p2' }, 'user');
      expect(ids(board.BoxItems)).toEqual([p2Shape.ID]);

      // switch back — page 1's sticky reappears, page 2's shape is gone from the buckets
      expect(state.SwitchPage(state.Pages[0].ID, 'user')).toBe(true);
      expect(ids(board.BoxItems)).toEqual([p1Sticky.ID]);
    });
  });

  describe('initial recompute happens in ngOnInit even with pre-existing items', () => {
    it('buckets are populated immediately after ngOnInit (no Changed$ needed)', () => {
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'pre' }, 'user');
      state.AddItem({ Kind: 'ink', Points: [{ X: 0, Y: 0 }, { X: 2, Y: 2 }], Color: '#000', StrokeWidth: 1 }, 'user');
      // before ngOnInit, the buckets are still the empty defaults
      expect(board.BoxItems).toHaveLength(0);
      board.ngOnInit();
      expect(board.BoxItems).toHaveLength(1);
      expect(board.InkItems).toHaveLength(1);
    });
  });
});

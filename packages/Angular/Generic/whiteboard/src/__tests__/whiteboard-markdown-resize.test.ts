import { describe, it, expect, vi } from 'vitest';

/**
 * Markdown panel resize, driven through the board's REAL gesture handlers
 * (OnHandlePointerDown → OnWindowPointerMove → OnWindowPointerUp) against the real
 * WhiteboardState. A markdown panel's `H` is a max-height cap on its body, so:
 *  - a side handle (e / w) only changes the width — an uncapped panel stays uncapped;
 *  - a top / bottom handle moves the cap, starting from the body height on screen
 *    (not ItemBounds' line-count estimate), and never below WHITEBOARD_DEFAULTS.MarkdownMinH.
 *
 * Angular's decorators and the heavy sibling UI imports are stubbed so the component
 * class can be `new`'d in a node unit test (same harness as whiteboard-board-buckets).
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

const windowStub = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
(globalThis as unknown as { window: typeof windowStub }).window = windowStub;

import { RealtimeWhiteboardBoardComponent } from '../lib/whiteboard-board.component';
import { WHITEBOARD_DEFAULTS, WhiteboardMarkdownItem, WhiteboardState } from '../lib/whiteboard-state';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Three long paragraphs: three source lines, so the line-count estimate is ~101px. */
const LONG_MD = ['a '.repeat(200), 'b '.repeat(200), 'c '.repeat(200)].join('\n');

function makeBoard(): { board: RealtimeWhiteboardBoardComponent; state: WhiteboardState } {
  const state = new WhiteboardState();
  const board = new RealtimeWhiteboardBoardComponent();
  board.State = state;
  // identity viewport: one client px is one board px
  board.Zoom = 1;
  board.PanX = 0;
  board.PanY = 0;
  return { board, state };
}

/**
 * A handle element inside a rendered markdown card whose body computes to `bodyH`px
 * (what the browser reports as the body's height, in the same box model as max-height).
 */
function handleIn(bodyH: number | null): unknown {
  const body = bodyH == null ? null : {
    ownerDocument: { defaultView: { getComputedStyle: () => ({ height: `${bodyH}px` }) } }
  };
  const card = { querySelector: (sel: string) => (sel === '.md-card__body' ? body : null) };
  return { closest: (sel: string) => (sel === '.md-card' ? card : null) };
}

/** Drag `handle` of `item` by (dx, dy) board px; returns the cap the body showed mid-drag. */
function drag(
  board: RealtimeWhiteboardBoardComponent, state: WhiteboardState, id: string,
  handle: Handle, dx: number, dy: number, bodyH: number | null
): { downCap: number | null; midCap: number | null } {
  const item = () => state.GetItem(id) as WhiteboardMarkdownItem;
  const ev = (x: number, y: number) =>
    ({ button: 0, clientX: x, clientY: y, stopPropagation() {}, currentTarget: handleIn(bodyH) }) as unknown as PointerEvent;
  board.OnHandlePointerDown(ev(500, 500), item(), handle);
  const downCap = board.MarkdownMaxHeight(item());
  board.OnWindowPointerMove(ev(500 + dx, 500 + dy));
  const midCap = board.MarkdownMaxHeight(item());
  board.OnWindowPointerUp();
  return { downCap, midCap };
}

describe('markdown panel resize — uncapped panels (no H)', () => {
  it('widening from a side handle keeps the panel uncapped (no guessed H is written)', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: LONG_MD }, 'agent');
    const { downCap, midCap } = drag(board, state, md.ID, 'e', 120, 0, 300);
    const after = state.GetItem(md.ID) as WhiteboardMarkdownItem;
    expect(after.W).toBe(400);
    expect(after.H).toBeUndefined();
    // the body never snaps to a cap while the side handle is held
    expect(downCap).toBeNull();
    expect(midCap).toBeNull();
  });

  it('narrowing from the left handle keeps the panel uncapped too', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 100, Y: 0, W: 280, Markdown: LONG_MD }, 'agent');
    drag(board, state, md.ID, 'w', 80, 0, 300);
    const after = state.GetItem(md.ID) as WhiteboardMarkdownItem;
    expect(after.X).toBe(180);
    expect(after.W).toBe(200);
    expect(after.H).toBeUndefined();
  });

  it('the bottom handle starts from the rendered body height, not the line-count estimate', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: LONG_MD }, 'agent');
    const { downCap, midCap } = drag(board, state, md.ID, 's', 0, 50, 300);
    // pressing the handle does not move the bottom edge: the cap equals what's on screen
    expect(downCap).toBe(300);
    expect(midCap).toBe(350);
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).H).toBe(350);
  });

  it('a corner handle commits both the width and the cap', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: LONG_MD }, 'agent');
    drag(board, state, md.ID, 'se', 20, -40, 300);
    const after = state.GetItem(md.ID) as WhiteboardMarkdownItem;
    expect(after.W).toBe(300);
    expect(after.H).toBe(260);
  });
});

describe('markdown panel resize — capped panels', () => {
  it('dragging the bottom handle taller reveals clipped text, and undo restores the cap', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 120, Markdown: LONG_MD }, 'agent');
    drag(board, state, md.ID, 's', 0, 280, 120);
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).H).toBe(400);
    state.Undo();
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).H).toBe(120);
  });

  it('a side handle leaves an existing cap exactly as it was', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 120, Markdown: LONG_MD }, 'agent');
    const { midCap } = drag(board, state, md.ID, 'e', 60, 0, 120);
    expect(midCap).toBe(120);
    const after = state.GetItem(md.ID) as WhiteboardMarkdownItem;
    expect(after.W).toBe(340);
    expect(after.H).toBe(120);
  });

  it('cannot be dragged shorter than MarkdownMinH (no blank sliver), live or committed', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 300, Markdown: LONG_MD }, 'agent');
    const { midCap } = drag(board, state, md.ID, 's', 0, -290, 300);
    expect(midCap).toBe(WHITEBOARD_DEFAULTS.MarkdownMinH);
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).H).toBe(WHITEBOARD_DEFAULTS.MarkdownMinH);
  });

  it('the top handle clamps at MarkdownMinH without the bottom edge moving', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 100, W: 280, H: 300, Markdown: LONG_MD }, 'agent');
    drag(board, state, md.ID, 'n', 0, 290, 300);
    const after = state.GetItem(md.ID) as WhiteboardMarkdownItem;
    expect(after.H).toBe(WHITEBOARD_DEFAULTS.MarkdownMinH);
    expect(after.Y + after.H!).toBe(400);
  });

  it('falls back to the bounds height when the rendered body is not available', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 200, Markdown: LONG_MD }, 'agent');
    drag(board, state, md.ID, 's', 0, 40, null);
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).H).toBe(240);
  });
});

describe('markdown panel resize — press and release without dragging', () => {
  it('a no-move click on the bottom handle keeps a cap taller than the content', () => {
    const { board, state } = makeBoard();
    // capped at 400, but the text only fills 80px of it
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 400, Markdown: 'short answer' }, 'agent');
    drag(board, state, md.ID, 's', 0, 0, 80);
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).H).toBe(400);
  });

  it('a no-move click on the top handle leaves an uncapped panel uncapped', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, Markdown: LONG_MD }, 'agent');
    drag(board, state, md.ID, 'n', 0, 0, 300);
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).H).toBeUndefined();
  });

  it('a no-move click records no undo step', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 400, Markdown: 'short answer' }, 'agent');
    drag(board, state, md.ID, 'se', 0, 0, 80);
    // the only undo step is the add, so undoing removes the panel
    state.Undo();
    expect(state.GetItem(md.ID)).toBeUndefined();
  });
});

describe('markdown panel resize — gestures that never moved the cap', () => {
  it('a 1px jitter on the bottom handle keeps a cap taller than the content', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 400, Markdown: 'short answer' }, 'agent');
    // a real mouse or trackpad click often delivers one pixel of travel before pointerup
    drag(board, state, md.ID, 's', 0, 1, 80);
    expect((state.GetItem(md.ID) as WhiteboardMarkdownItem).H).toBe(400);
  });

  it('a jitter under the click threshold records no undo step', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 400, Markdown: 'short answer' }, 'agent');
    drag(board, state, md.ID, 'se', 2, 2, 80);
    state.Undo();
    expect(state.GetItem(md.ID)).toBeUndefined();
  });

  it('a corner handle dragged only sideways widens the panel and keeps its cap', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 0, Y: 0, W: 280, H: 400, Markdown: 'short answer' }, 'agent');
    drag(board, state, md.ID, 'se', 100, 0, 80);
    const after = state.GetItem(md.ID) as WhiteboardMarkdownItem;
    expect(after.W).toBe(380);
    expect(after.H).toBe(400);
  });

  it('a corner handle dragged only sideways leaves an uncapped panel uncapped', () => {
    const { board, state } = makeBoard();
    const md = state.AddItem({ Kind: 'markdown', X: 100, Y: 0, W: 280, Markdown: LONG_MD }, 'agent');
    drag(board, state, md.ID, 'sw', -60, 0, 300);
    const after = state.GetItem(md.ID) as WhiteboardMarkdownItem;
    expect(after.X).toBe(40);
    expect(after.W).toBe(340);
    expect(after.H).toBeUndefined();
  });
});

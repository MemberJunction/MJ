import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeWhiteboardBoardComponent } from './whiteboard-board.component';
import { WhiteboardState } from './whiteboard-state';
import { WhiteboardWidgetSubmitEvent } from './whiteboard-widget-bridge';
import { WhiteboardWidgetCommandMessage } from './whiteboard-widget-protocol';
import { WhiteboardWidgetCommandOutcome } from './whiteboard-widget-broker';
import { WhiteboardWidgetActionsChangedEventArgs } from './whiteboard-tools';

/**
 * DOM spec for the board's side of the two-way widget protocol (PLAN §7.2, D6): commands
 * reach the RIGHT frame window, replies from any other window are ignored, frames are
 * tracked as they mount and unmount, `PinMount` keeps a frame without moving the view,
 * `RevealItem` pans only for an off-screen item, and the host-side gate on `agent` tags.
 *
 * The frames' scripts never run here (jsdom, no `runScripts`); each test plays the helper
 * by dispatching window `message` events whose `source` is the frame's real contentWindow.
 */
describe('RealtimeWhiteboardBoardComponent — widget protocol (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<RealtimeWhiteboardBoardComponent>>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A board with two HTML widgets side by side (html-1, html-2). */
  const boardWithWidgets = (): { state: WhiteboardState; fix: Fix } => {
    const state = new WhiteboardState();
    state.AddItem({ Kind: 'html', X: 40, Y: 40, W: 300, H: 200, Html: '<p>one</p>', Title: 'One' }, 'agent');
    state.AddItem({ Kind: 'html', X: 400, Y: 40, W: 300, H: 200, Html: '<p>two</p>', Title: 'Planet quiz' }, 'agent');
    const fix = renderComponentFixture(RealtimeWhiteboardBoardComponent, { inputs: { State: state } });
    fix.detectChanges();
    return { state, fix };
  };

  const frameWindow = (fix: Fix, itemId: string): Window => {
    const frame = fix.nativeElement.querySelector(`iframe.html-card__frame[data-item-id="${itemId}"]`) as HTMLIFrameElement | null;
    if (!frame?.contentWindow) {
      throw new Error(`no mounted frame for ${itemId}`);
    }
    return frame.contentWindow;
  };

  /** Record every command posted to a frame window. */
  const spyPosts = (win: Window): WhiteboardWidgetCommandMessage[] => {
    const posts: WhiteboardWidgetCommandMessage[] = [];
    vi.spyOn(win, 'postMessage').mockImplementation((message: WhiteboardWidgetCommandMessage) => {
      posts.push(message);
    });
    return posts;
  };

  /** Play the helper: post a message to the host window "from" a frame window. */
  const fromFrame = (source: Window, data: object): void => {
    window.dispatchEvent(new MessageEvent('message', { data, source }));
  };

  const ready = (source: Window, doc = 'doc-1'): void =>
    fromFrame(source, { __mjWhiteboardReady: true, doc, actions: [{ name: 'next' }], hasState: false });

  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };

  /** Give the canvas a real size (jsdom lays out nothing, so it measures 0×0 otherwise). */
  const sizeCanvas = (fix: Fix, w = 800, h = 600): void => {
    const canvas = fix.nativeElement.querySelector('.board-canvas') ?? fix.nativeElement.firstElementChild;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: w });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: h });
  };

  it('posts a command to the addressed widget frame, after hello and the restore', async () => {
    const { fix } = boardWithWidgets();
    const one = spyPosts(frameWindow(fix, 'html-1'));
    const twoWin = frameWindow(fix, 'html-2');
    const two = spyPosts(twoWin);

    const pending = fix.componentInstance.SendWidgetCommand({ ItemID: 'html-2', Op: 'inspect', Args: {} });
    await flush();
    expect(two.map((m) => m.op)).toEqual(['hello']);

    ready(twoWin);
    await flush();
    expect(two.map((m) => m.op)).toEqual(['hello', 'restoreState', 'inspect']);
    expect(one).toEqual([]);

    const inspect = two[2];
    fromFrame(twoWin, { __mjWhiteboardReply: true, id: inspect.id, ok: true, result: { outline: 'h2 "Q1"' } });
    const outcome: WhiteboardWidgetCommandOutcome = await pending;
    expect(outcome).toEqual({ Ok: true, Result: { outline: 'h2 "Q1"' } });
    fix.destroy();
  });

  it('ignores a reply coming from the wrong window', async () => {
    const { fix } = boardWithWidgets();
    const oneWin = frameWindow(fix, 'html-1');
    const twoWin = frameWindow(fix, 'html-2');
    spyPosts(oneWin);
    const two = spyPosts(twoWin);
    ready(oneWin);
    ready(twoWin);

    let settled: WhiteboardWidgetCommandOutcome | null = null;
    void fix.componentInstance.SendWidgetCommand({ ItemID: 'html-2', Op: 'call', Args: { action: 'next', payload: null } })
      .then((o) => (settled = o));
    await flush();
    const call = two.find((m) => m.op === 'call')!;

    fromFrame(oneWin, { __mjWhiteboardReply: true, id: call.id, ok: true, result: { result: 'forged' } });
    await flush();
    expect(settled).toBeNull();

    fromFrame(twoWin, { __mjWhiteboardReply: true, id: call.id, ok: true, result: { result: 1 } });
    await flush();
    expect(settled).toEqual({ Ok: true, Result: { result: 1 } });
    fix.destroy();
  });

  it('reports actions from a ready widget as a class event with its title', () => {
    const { fix } = boardWithWidgets();
    const seen: WhiteboardWidgetActionsChangedEventArgs[] = [];
    fix.componentInstance.WidgetActionsChanged.subscribe((e) => seen.push(e));
    const twoWin = frameWindow(fix, 'html-2');
    spyPosts(twoWin);
    ready(twoWin);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(WhiteboardWidgetActionsChangedEventArgs);
    expect(seen[0].ItemID).toBe('html-2');
    expect(seen[0].Title).toBe('Planet quiz');
    expect(seen[0].Actions).toEqual([{ Name: 'next' }]);
    expect(fix.componentInstance.GetWidgetActions('html-2')).toEqual([{ Name: 'next' }]);
    fix.destroy();
  });

  it('tracks unmounts: removing the widget fails its in-flight command', async () => {
    const { state, fix } = boardWithWidgets();
    const twoWin = frameWindow(fix, 'html-2');
    spyPosts(twoWin);
    ready(twoWin);
    const pending = fix.componentInstance.SendWidgetCommand({ ItemID: 'html-2', Op: 'inspect', Args: {} });
    await flush();

    state.RemoveItem('html-2', 'user');
    fix.detectChanges();
    const outcome = await pending;
    expect(outcome.Ok).toBe(false);
    expect(outcome.Ok === false && outcome.Code).toBe('widget_unmounted');
    fix.destroy();
  });

  it('notices a frame that unmounted through a LOCAL re-render, so the next command never targets the dead window (E2E S2 regression)', async () => {
    const { fix } = boardWithWidgets();
    sizeCanvas(fix);
    const board = fix.componentInstance;
    const oldWin = frameWindow(fix, 'html-2');
    const oldPosts = spyPosts(oldWin);
    ready(oldWin);

    // Pan html-2 off-screen and re-render through the board's OWN change detector (PinMount's
    // refresh), the path that skips the board's ngAfterViewChecked — as a pan does in the app.
    board.PanX = -5000;
    board.PanY = -5000;
    board.PinMount('html-1');
    await flush();
    await flush();
    expect(fix.nativeElement.querySelector('iframe.html-card__frame[data-item-id="html-2"]')).toBeNull();

    const pending = board.SendWidgetCommand({ ItemID: 'html-2', Op: 'inspect', Args: {} });
    await flush();
    await flush();
    expect(oldPosts.map((m) => m.op)).not.toContain('inspect');

    const newWin = frameWindow(fix, 'html-2'); // the pin re-mounted it, without moving the view
    expect(newWin).not.toBe(oldWin);
    expect([board.PanX, board.PanY]).toEqual([-5000, -5000]);
    const newPosts = spyPosts(newWin);
    ready(newWin, 'doc-2');
    await flush();
    const inspect = newPosts.find((m) => m.op === 'inspect');
    expect(inspect).toBeDefined();
    fromFrame(newWin, { __mjWhiteboardReply: true, id: inspect!.id, ok: true, result: { outline: 'ok' } });
    const outcome = await pending;
    expect(outcome.Ok).toBe(true);
    board.UnpinMount('html-1');
    fix.destroy();
  });

  it('a content change on a widget fails its in-flight command as reloaded', async () => {
    const { state, fix } = boardWithWidgets();
    const twoWin = frameWindow(fix, 'html-2');
    spyPosts(twoWin);
    ready(twoWin);
    const pending = fix.componentInstance.SendWidgetCommand({ ItemID: 'html-2', Op: 'inspect', Args: {} });
    await flush();
    state.UpdateItem('html-2', { Html: '<p>new</p>' }, 'agent');
    const outcome = await pending;
    expect(outcome.Ok === false && outcome.Code).toBe('widget_reloaded');
    fix.destroy();
  });

  it('validates the target: not_html, and widget_not_found naming Whiteboard_SwitchPage for another page', async () => {
    const { state, fix } = boardWithWidgets();
    const note = state.AddItem({ Kind: 'sticky', X: 0, Y: 600, Text: 'hi' }, 'user')!;
    const notHtml = await fix.componentInstance.SendWidgetCommand({ ItemID: note.ID, Op: 'inspect', Args: {} });
    expect(notHtml.Ok === false && notHtml.Code).toBe('not_html');

    state.AddPage('Second', 'user');
    fix.detectChanges();
    const elsewhere = await fix.componentInstance.SendWidgetCommand({ ItemID: 'html-2', Op: 'inspect', Args: {} });
    expect(elsewhere.Ok === false && elsewhere.Code).toBe('widget_not_found');
    expect(elsewhere.Ok === false && elsewhere.Error).toContain('Whiteboard_SwitchPage');
    expect(elsewhere.Ok === false && elsewhere.Error).toContain('Page 1');

    const nowhere = await fix.componentInstance.SendWidgetCommand({ ItemID: 'html-99', Op: 'inspect', Args: {} });
    expect(nowhere.Ok === false && nowhere.Code).toBe('widget_not_found');
    expect(nowhere.Ok === false && nowhere.Error).not.toContain('Whiteboard_SwitchPage');
    fix.destroy();
  });

  describe('viewport', () => {
    /** A board whose only widget sits far off-screen. */
    const offscreenBoard = (): { state: WhiteboardState; fix: Fix } => {
      const state = new WhiteboardState();
      state.AddItem({ Kind: 'html', X: 6000, Y: 6000, W: 300, H: 200, Html: '<p>far</p>', Title: 'Far' }, 'agent');
      const fix = renderComponentFixture(RealtimeWhiteboardBoardComponent, {
        inputs: { State: state },
        setup: (board) => {
          board.PanX = 0;
          board.PanY = 0;
          board.Zoom = 1;
        }
      });
      sizeCanvas(fix);
      // zoneless: a size change is invisible to CD until the view is marked dirty
      fix.componentRef.changeDetectorRef.markForCheck();
      fix.detectChanges();
      return { state, fix };
    };
    const hasFrame = (fix: Fix): boolean => !!fix.nativeElement.querySelector('iframe.html-card__frame');

    it('an off-screen widget renders no frame until pinned, and pinning never pans', () => {
      const { fix } = offscreenBoard();
      expect(hasFrame(fix)).toBe(false);

      fix.componentInstance.PinMount('html-1');
      fix.detectChanges();
      expect(hasFrame(fix)).toBe(true);
      expect(fix.componentInstance.PanX).toBe(0);
      expect(fix.componentInstance.PanY).toBe(0);

      fix.componentInstance.PinMount('html-1');
      fix.componentInstance.UnpinMount('html-1');
      fix.detectChanges();
      expect(hasFrame(fix)).toBe(true); // refcounted: one pin left

      fix.componentInstance.UnpinMount('html-1');
      fix.detectChanges();
      expect(hasFrame(fix)).toBe(false);
      fix.destroy();
    });

    it('RevealItem centers an off-screen item', () => {
      const { fix } = offscreenBoard();
      fix.componentInstance.RevealItem('html-1');
      // item center (6150, 6100) lands at the canvas center (400, 300) at zoom 1
      expect(fix.componentInstance.PanX).toBe(400 - 6150);
      expect(fix.componentInstance.PanY).toBe(300 - 6100);
      fix.destroy();
    });

    it('RevealItem leaves the view alone when the item is already near it', () => {
      const { state, fix } = offscreenBoard();
      const near = state.AddItem({ Kind: 'html', X: 100, Y: 100, W: 200, H: 120, Html: '<p>near</p>' }, 'agent')!;
      fix.componentInstance.RevealItem(near.ID);
      expect(fix.componentInstance.PanX).toBe(0);
      expect(fix.componentInstance.PanY).toBe(0);
      fix.destroy();
    });
  });

  describe('Author host gate', () => {
    const submits = (fix: Fix): WhiteboardWidgetSubmitEvent[] => {
      const seen: WhiteboardWidgetSubmitEvent[] = [];
      fix.componentInstance.WidgetSubmitted.subscribe((e) => seen.push(e));
      return seen;
    };

    it('downgrades an agent tag to user when no agent command is running', () => {
      const { fix } = boardWithWidgets();
      const seen = submits(fix);
      fromFrame(frameWindow(fix, 'html-2'), { __mjWhiteboardSubmit: true, data: { a: 1 }, by: 'agent' });
      expect(seen).toHaveLength(1);
      expect(seen[0].Author).toBe('user');
      fix.destroy();
    });

    it('keeps the agent tag while an agent command for that widget runs', async () => {
      const { fix } = boardWithWidgets();
      const twoWin = frameWindow(fix, 'html-2');
      spyPosts(twoWin);
      ready(twoWin);
      const seen = submits(fix);
      void fix.componentInstance.SendWidgetCommand({ ItemID: 'html-2', Op: 'operate', Args: { steps: [] }, ByAgent: true });
      await flush();
      fromFrame(twoWin, { __mjWhiteboardSubmit: true, data: { a: 1 }, by: 'agent' });
      expect(seen[0].Author).toBe('agent');
      fix.destroy();
    });
  });
});

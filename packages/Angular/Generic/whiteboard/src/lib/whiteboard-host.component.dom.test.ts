import { describe, it, expect } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeWhiteboardHostComponent } from './whiteboard-host.component';
import { WhiteboardState } from './whiteboard-state';
import { WhiteboardTool, WhiteboardToolRoster } from './whiteboard-tool-roster';

/**
 * DOM spec for <mj-realtime-whiteboard-host> — the FIRST host-level spec in the package,
 * and it exists for one reason: `ToolRoster` is a single fact the host reads in three
 * places, and two of those three (the `document:keydown` tool-key gate and the
 * setter clamp) live on the host itself, over pure helpers that are unit-tested
 * but never wired end to end. This renders the real host — header, board and toolbar
 * together — and drives the roster through every door a user has: the toolbar button,
 * the single-letter shortcut, and the canvas right-click "add ... here" action.
 *
 * The keyboard cases focus the host element first rather than setting
 * `EnableGlobalShortcuts`, because the focus scope (#4121, WCAG 2.1.4) is the shipped
 * path and the opt-out is discouraged; every key case carries a positive control so a
 * dead listener cannot pass as "correctly gated".
 */
describe('RealtimeWhiteboardHostComponent (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<RealtimeWhiteboardHostComponent>>;

  /** The six-tool roster LXP will set: the eleven minus shapes, markdown, widget, image, connector. */
  const LXP_ROSTER: WhiteboardToolRoster = ['select', 'pan', 'pen', 'sticky', 'text', 'eraser'];

  const render = (roster: WhiteboardToolRoster = null, state: WhiteboardState = new WhiteboardState()): Fix =>
    renderComponentFixture(RealtimeWhiteboardHostComponent, {
      inputs: roster === null ? { State: state } : { State: state, ToolRoster: roster },
    });

  /** Toolbar buttons: the tool palette PLUS the undo and redo buttons, which share `.tool`. */
  const toolButtons = (f: Fix) => Array.from(f.nativeElement.querySelectorAll('button.tool')) as HTMLButtonElement[];
  const toolTitles = (f: Fix) => toolButtons(f).map((b) => b.getAttribute('title'));

  /** Focus the host so the #4121-scoped `document:keydown` handler is live. */
  const focusHost = (f: Fix): void => (f.nativeElement as HTMLElement).focus();

  const pressKey = (f: Fix, key: string): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    f.detectChanges();
  };

  /** A primary-button pointerdown on the canvas — the board's item-PLACEMENT path. */
  const canvasClick = (f: Fix): void => {
    const canvas = f.nativeElement.querySelector('.board-canvas');
    if (!canvas) throw new Error('canvasClick(): no .board-canvas');
    canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 120, clientY: 90 }));
    f.detectChanges();
  };

  const rightClick = (f: Fix, selector: string): void => {
    const el = f.nativeElement.querySelector(selector);
    if (!el) throw new Error(`rightClick(): no element matched "${selector}"`);
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    f.detectChanges();
  };

  const menuLabels = (f: Fix) =>
    Array.from(f.nativeElement.querySelectorAll('.wb-context-menu__item')).map((b) =>
      (b as HTMLElement).textContent?.trim(),
    );

  // ── 1. the control: no roster reproduces today's chrome ────────────────────────────

  it('renders today toolbar and default tool when no roster is supplied', () => {
    const f = render();
    // eleven tools plus undo and redo
    expect(toolButtons(f).length).toBe(13);
    expect(f.componentInstance.Tool).toBe('select');
  });

  // ── 2. the roster narrows the toolbar THROUGH the host ─────────────────────────────

  it('narrows the toolbar to the roster, in Tools order (not roster order)', () => {
    const f = render(['eraser', 'select', 'text', 'pen', 'pan', 'sticky']); // deliberately scrambled
    expect(toolTitles(f)).toEqual([
      'Select / move',
      'Pan',
      'Pen',
      'Sticky note',
      'Text',
      'Eraser',
      'Undo',
      'Redo',
    ]);
  });

  // ── 3. a hidden tool's keyboard shortcut is a no-op ────────────────────────────────

  it('ignores the shortcut of a tool outside the roster, and still honors one inside it', () => {
    const f = render(LXP_ROSTER);
    focusHost(f);

    pressKey(f, 'w'); // html widget — not in the roster
    expect(f.componentInstance.Tool).toBe('select');
    pressKey(f, 'm'); // markdown — not in the roster
    expect(f.componentInstance.Tool).toBe('select');

    // positive control in the same test: the listener IS live, the keys above were gated
    pressKey(f, 'p');
    expect(f.componentInstance.Tool).toBe('pen');
  });

  it('leaves every shortcut live when there is no roster', () => {
    const f = render();
    focusHost(f);
    pressKey(f, 'w');
    expect(f.componentInstance.Tool).toBe('html');
  });

  // ── 4. the setter clamp ────────────────────────────────────────────────────────────

  it('clamps the active tool to the roster first entry when a roster arrives that excludes it', () => {
    const f = render();
    focusHost(f);
    pressKey(f, 'w');
    expect(f.componentInstance.Tool).toBe('html');

    f.componentRef.setInput('ToolRoster', ['pan', 'pen']);
    f.detectChanges();
    // the roster's FIRST entry, not 'select' — a roster without 'select' is legal
    expect(f.componentInstance.Tool).toBe('pan');
  });

  it('never widens on clamp: dropping the roster leaves the active tool where it was', () => {
    const f = render(['pan', 'pen']);
    expect(f.componentInstance.Tool).toBe('pan'); // clamped on the first change

    f.componentRef.setInput('ToolRoster', null);
    f.detectChanges();
    expect(f.componentInstance.Tool).toBe('pan');
    expect(toolButtons(f).length).toBe(13); // the palette is whole again
  });

  it('clamps when a host assigns ToolRoster DIRECTLY, not through an Angular binding', () => {
    // The realtime channel wires this host by creating it dynamically and assigning
    // `instance.ToolRoster = ...`. Angular fires NO ngOnChanges for a plain property
    // assignment, so a clamp implemented there never runs on the path real consumers
    // use — verified failing in the browser before the clamp moved into the setter.
    // `setup` runs after construction but BEFORE the first change detection, which is
    // exactly when BindSurface assigns its inputs.
    const f = renderComponentFixture(RealtimeWhiteboardHostComponent, {
      inputs: { State: new WhiteboardState() },
      setup: (instance) => {
        expect(instance.Tool).toBe('select');
        instance.ToolRoster = ['pan', 'pen'];
      },
    });

    expect(f.componentInstance.Tool).toBe('pan');
    expect(toolTitles(f)).toEqual(['Pan', 'Pen', 'Undo', 'Redo']);
  });

  it('ignores a disallowed WRITE rather than clamping: Escape stays put under a roster without select', () => {
    // Escape assigns 'select'. Under ['pen','eraser'] that is disallowed, and the right answer
    // is to stay on pen, NOT to bounce to the roster fallback.
    const f = renderComponentFixture(RealtimeWhiteboardHostComponent, {
      inputs: { State: new WhiteboardState() },
      setup: (instance) => { instance.ToolRoster = ['pen', 'eraser']; },
    });
    expect(f.componentInstance.Tool).toBe('pen'); // clamped on mount: select is not on the roster

    (f.nativeElement as HTMLElement).focus();
    pressKey(f, 'Escape');

    expect(f.componentInstance.Tool).toBe('pen');
  });

  it('enforces the roster on a direct Tool write, in either assignment order', () => {
    // roster first, then a disallowed tool: the WRITE is ignored (nothing to clamp)
    const rosterFirst = renderComponentFixture(RealtimeWhiteboardHostComponent, {
      inputs: { State: new WhiteboardState() },
      setup: (instance) => {
        instance.ToolRoster = ['pan', 'pen'];
        instance.Tool = 'html'; // disallowed: must be ignored, not applied
      },
    });
    expect(rosterFirst.componentInstance.Tool).toBe('pan');

    // tool first, then a roster that excludes it: the HELD tool is clamped. Both orders land
    // on an allowed tool, which is the whole point of enforcing on the Tool setter.
    const toolFirst = renderComponentFixture(RealtimeWhiteboardHostComponent, {
      inputs: { State: new WhiteboardState() },
      setup: (instance) => {
        instance.Tool = 'html';
        instance.ToolRoster = ['pan', 'pen'];
      },
    });
    expect(toolFirst.componentInstance.Tool).toBe('pan');
  });

  it('falls back to select when a roster arrives that leaves no known tool at all', () => {
    // The regression: `w` then an empty roster left `html` held, so the board kept placing
    // widgets with no toolbar to see the tool and no key able to change it.
    const state = new WhiteboardState();
    const f = renderComponentFixture(RealtimeWhiteboardHostComponent, { inputs: { State: state } });
    (f.nativeElement as HTMLElement).focus();
    pressKey(f, 'w');
    expect(f.componentInstance.Tool).toBe('html');

    f.componentRef.setInput('ToolRoster', []);
    f.detectChanges();

    expect(f.componentInstance.Tool).toBe('select');
    // and `select` really is inert: a canvas click starts a marquee, it does not place
    canvasClick(f);
    expect(state.ElementCount).toBe(0);
  });

  it('re-binding EQUAL roster content leaves the active tool alone', () => {
    // A consumer binding a freshly-built array literal re-fires the setter every change
    // detection pass. Re-clamping there would fight the user for the active tool, so equal
    // CONTENT — not merely an equal reference — has to be a no-op.
    const f = renderComponentFixture(RealtimeWhiteboardHostComponent, {
      inputs: { State: new WhiteboardState() },
      setup: (instance) => {
        instance.ToolRoster = ['pan', 'pen'];
        instance.Tool = 'pen';
      },
    });
    expect(f.componentInstance.Tool).toBe('pen');

    f.componentRef.setInput('ToolRoster', ['pan', 'pen']); // equal content, NEW array
    f.detectChanges();

    expect(f.componentInstance.Tool).toBe('pen');
  });

  it('re-clamps when the same array is mutated in place to drop the held tool', () => {
    // The footgun an identity compare left open: same reference, different contents. The host
    // keeps a frozen COPY and compares by content, so the mutation is seen on the next bind.
    const roster: WhiteboardTool[] = ['pan', 'pen', 'html'];
    const f = renderComponentFixture(RealtimeWhiteboardHostComponent, {
      inputs: { State: new WhiteboardState() },
      setup: (instance) => {
        instance.ToolRoster = roster;
        instance.Tool = 'html';
      },
    });
    expect(f.componentInstance.Tool).toBe('html');

    roster.splice(2, 1); // drop 'html' from the consumer's own array — same reference
    f.componentRef.setInput('ToolRoster', roster);
    f.detectChanges();

    expect(f.componentInstance.Tool).toBe('pan');
    // the host's own roster is a copy, so the splice could not have reached it directly
    expect(f.componentInstance.ToolRoster).toEqual(['pan', 'pen']);
  });

  it('treats a non-array (a STATIC attribute) as no roster', () => {
    // `ToolRoster="select,pan"` — a plausible slip for the binding — sets a STRING, and a
    // string reaches the roster helpers as an accidental substring matcher: `.includes` is
    // String's, so it silently answered "allowed" for any tool name appearing anywhere in the
    // text and rendered a garbage palette. Worse, a string that does NOT contain the held
    // tool's name reaches the clamp, where `.filter` does not exist on String and the render
    // throws outright. Both are the same slip; both now read as "no roster".
    const substringMatch = render();
    substringMatch.componentRef.setInput('ToolRoster', 'select,pan');
    substringMatch.detectChanges();
    expect(substringMatch.componentInstance.ToolRoster).toBeNull();
    expect(toolTitles(substringMatch).length).toBe(13); // full palette, plus undo and redo

    const wouldThrow = render();
    expect(() => {
      wouldThrow.componentRef.setInput('ToolRoster', 'pen,pan'); // no 'select' → hits the clamp
      wouldThrow.detectChanges();
    }).not.toThrow();
    expect(wouldThrow.componentInstance.Tool).toBe('select');
    expect(toolTitles(wouldThrow).length).toBe(13);
  });

  // ── 5. the right-click door on the canvas ──────────────────────────────────────────

  it('offers every add action plus New page on the canvas menu when there is no roster', () => {
    const f = render();
    rightClick(f, '.board-canvas');
    expect(menuLabels(f)).toEqual([
      'Add sticky note here',
      'Add text here',
      'Add markdown panel here',
      'Add widget here',
      'New page',
    ]);
  });

  it('offers only the roster add actions on the canvas menu (the #845 hole)', () => {
    const f = render(LXP_ROSTER);
    rightClick(f, '.board-canvas');
    expect(menuLabels(f)).toEqual(['Add sticky note here', 'Add text here', 'New page']);
  });

  it('renders no separator above New page when the roster leaves no add actions', () => {
    const f = render([]);
    rightClick(f, '.board-canvas');
    expect(menuLabels(f)).toEqual(['New page']);
    expect(f.nativeElement.querySelectorAll('.wb-context-menu__sep').length).toBe(0);
  });

  // ── 6. item menus are deliberately untouched by the roster ─────────────────────────

  it('leaves the item menu Edit and Delete actions in place under a narrow roster', () => {
    const state = new WhiteboardState();
    state.AddItem({ Kind: 'sticky', X: 10, Y: 20, Text: 'hello' }, 'user');
    const f = render(LXP_ROSTER, state);

    rightClick(f, '.bi.sticky');
    const labels = menuLabels(f);
    // authoring controls are the NEXT input (ShowAuthoringControls), not tool selection
    expect(labels).toContain('Edit');
    expect(labels).toContain('Delete');
  });

  // ── 7. ReadOnly: the OTHER axis ────────────────────────────────────────────────────
  //
  // The roster narrows WHICH tools are offered; ReadOnly decides WHETHER anything mutates.
  // The board already guards its own entry points, so what is tested here is the chrome only
  // the host owns: the toolbar, the keyboard handler and the canvas menu. Every negative
  // carries its positive control, so a listener that died for an unrelated reason cannot pass
  // as "correctly gated".

  describe('ReadOnly', () => {
    const renderRO = (
      readOnly: boolean,
      state: WhiteboardState = new WhiteboardState(),
      tool?: WhiteboardTool,
    ): Fix =>
      renderComponentFixture(RealtimeWhiteboardHostComponent, {
        inputs: { State: state, ReadOnly: readOnly },
        // `setup` runs before the first change-detection pass. A plain post-render write would
        // trip dev-mode NG0100 on the board's [Tool] binding — a test artifact, not a product
        // bug, and the same reason the roster cases above use `setup`.
        setup: tool ? (instance) => { instance.Tool = tool; } : undefined,
      });

    it('renders no toolbar at all (matching WhiteboardSnapshotComponent), but keeps the zoom cluster', () => {
      expect(toolButtons(renderRO(true)).length).toBe(0);
      // positive control: the same host renders the full palette plus undo/redo when writable
      expect(toolButtons(renderRO(false)).length).toBe(13);
      // navigation is not mutation — zoom survives
      expect(renderRO(true).nativeElement.querySelector('mj-realtime-whiteboard-zoom')).toBeTruthy();
    });

    it('ignores tool keys', () => {
      const ro = renderRO(true);
      (ro.nativeElement as HTMLElement).focus();
      pressKey(ro, 'p');
      expect(ro.componentInstance.Tool).toBe('select');

      const rw = renderRO(false);
      (rw.nativeElement as HTMLElement).focus();
      pressKey(rw, 'p');
      expect(rw.componentInstance.Tool).toBe('pen');
    });

    it('ignores Delete on a selection', () => {
      const withSticky = (): WhiteboardState => {
        const st = new WhiteboardState();
        const item = st.AddItem({ Kind: 'sticky', X: 10, Y: 20, Text: 'hello' }, 'user');
        st.Select(item.ID);
        return st;
      };

      const roState = withSticky();
      const ro = renderRO(true, roState);
      (ro.nativeElement as HTMLElement).focus();
      pressKey(ro, 'Delete');
      expect(roState.ElementCount).toBe(1);

      const rwState = withSticky();
      const rw = renderRO(false, rwState);
      (rw.nativeElement as HTMLElement).focus();
      pressKey(rw, 'Delete');
      expect(rwState.ElementCount).toBe(0);
    });

    it('opens no context menu on the canvas', () => {
      const ro = renderRO(true);
      rightClick(ro, '.board-canvas');
      expect(menuLabels(ro)).toEqual([]);

      expect(menuLabels(render())).toEqual([]); // control: nothing shown before the right-click
      const rw = renderRO(false);
      rightClick(rw, '.board-canvas');
      expect(menuLabels(rw).length).toBeGreaterThan(0);
    });

    it('places nothing on a canvas click, even holding a placing tool', () => {
      // ReadOnly deliberately does NOT reset Tool — the board ignores edits regardless, so
      // there is nothing for the host to reset and one less piece of state to restore.
      const roState = new WhiteboardState();
      canvasClick(renderRO(true, roState, 'sticky'));
      expect(roState.ElementCount).toBe(0);

      const rwState = new WhiteboardState();
      canvasClick(renderRO(false, rwState, 'sticky'));
      expect(rwState.ElementCount).toBe(1);
    });
  });
});

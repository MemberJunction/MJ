import { describe, it, expect } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeWhiteboardHostComponent } from './whiteboard-host.component';
import { WhiteboardState } from './whiteboard-state';
import { WhiteboardToolRoster } from './whiteboard-tool-roster';

/**
 * DOM spec for <mj-realtime-whiteboard-host> — the FIRST host-level spec in the package,
 * and it exists for one reason: `ToolRoster` is a single fact the host reads in three
 * places, and two of those three (the `document:keydown` tool-key gate and the
 * `ngOnChanges` clamp) live on the host itself, over pure helpers that are unit-tested
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

  // ── 4. the ngOnChanges clamp ───────────────────────────────────────────────────────

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
});

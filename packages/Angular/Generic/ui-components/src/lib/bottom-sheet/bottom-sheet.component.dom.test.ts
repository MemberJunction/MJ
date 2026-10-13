import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, text, attr, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { MJBottomSheetComponent } from './bottom-sheet.component';

/**
 * DOM spec for <mj-bottom-sheet> — the canonical mobile overlay surface (scrim + panel).
 * The open/close lifecycle is rAF/transition-driven and non-deterministic under jsdom, so
 * rather than toggling `Visible` and racing animation frames we drive the component's public
 * render state (`IsRendered`, `IsOpen`, `IsSettled`) directly via the `setup` hook and assert
 * the template contract that state produces. Covers: the `@if (IsRendered)` gate, the
 * `role="dialog"`/`aria-modal` modality baseline, the `[attr.aria-label]` accessible-name
 * fallback (AriaLabel → Title → none), the `mj-bottom-sheet-scrim--open` / `mj-bottom-sheet--open`
 * / `mj-bottom-sheet--settled` transition classes, and the `VisibleChange` + `Closed` outputs
 * emitted on dismissal.
 */
describe('MJBottomSheetComponent (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<MJBottomSheetComponent>>;

  /** Render already-open by default so the `@if (IsRendered)` body exists; callers tune state. */
  const render = (
    inputs: Record<string, unknown> = {},
    setup: (c: MJBottomSheetComponent) => void = (c) => { c.IsRendered = true; },
  ): Fix => renderComponentFixture(MJBottomSheetComponent, { inputs, setup });

  it('renders nothing while IsRendered is false', () => {
    const f = render({}, () => { /* leave IsRendered at its false default */ });
    expect(query(f, '.mj-bottom-sheet')).toBeNull();
    expect(query(f, '.mj-bottom-sheet-scrim')).toBeNull();
  });

  it('renders a modal dialog once rendered', () => {
    const f = render();
    const sheet = query(f, '.mj-bottom-sheet');
    expect(sheet).not.toBeNull();
    expect(attr(f, '.mj-bottom-sheet', 'role')).toBe('dialog');
    expect(attr(f, '.mj-bottom-sheet', 'aria-modal')).toBe('true');
  });

  it('renders the Title in the header and as the accessible name', () => {
    const f = render({ Title: 'Open Records' });
    expect(text(f, '.mj-bottom-sheet-header')).toBe('Open Records');
    expect(attr(f, '.mj-bottom-sheet', 'aria-label')).toBe('Open Records');
  });

  it('honors AriaLabel over Title for the accessible name', () => {
    const f = render({ Title: 'Open Records', AriaLabel: 'Open records overlay' });
    // header still shows the visible Title...
    expect(text(f, '.mj-bottom-sheet-header')).toBe('Open Records');
    // ...but the accessible name is the override
    expect(attr(f, '.mj-bottom-sheet', 'aria-label')).toBe('Open records overlay');
  });

  it('omits the header and aria-label when neither Title nor AriaLabel is set', () => {
    const f = render();
    expect(query(f, '.mj-bottom-sheet-header')).toBeNull();
    expect(attr(f, '.mj-bottom-sheet', 'aria-label')).toBeNull();
  });

  it('applies the open + settled transition classes when open and settled', () => {
    const f = render({}, (c) => { c.IsRendered = true; c.IsOpen = true; c.IsSettled = true; });
    expect(hasClass(f, '.mj-bottom-sheet-scrim', 'mj-bottom-sheet-scrim--open')).toBe(true);
    expect(hasClass(f, '.mj-bottom-sheet', 'mj-bottom-sheet--open')).toBe(true);
    expect(hasClass(f, '.mj-bottom-sheet', 'mj-bottom-sheet--settled')).toBe(true);
  });

  it('withholds the transition classes while rendered but not yet open', () => {
    const f = render();
    expect(hasClass(f, '.mj-bottom-sheet-scrim', 'mj-bottom-sheet-scrim--open')).toBe(false);
    expect(hasClass(f, '.mj-bottom-sheet', 'mj-bottom-sheet--open')).toBe(false);
    expect(hasClass(f, '.mj-bottom-sheet', 'mj-bottom-sheet--settled')).toBe(false);
  });

  it('emits VisibleChange(false) when the scrim is clicked to dismiss an open sheet', () => {
    const f = render({}, (c) => { c.IsRendered = true; c.IsOpen = true; });
    const visibleChanges = capture(f.componentInstance.VisibleChange);
    click(f, '.mj-bottom-sheet-scrim');
    expect(visibleChanges).toEqual([false]);
  });

  it('emits Closed after the exit transition settles', () => {
    vi.useFakeTimers();
    try {
      const f = render({}, (c) => { c.IsRendered = true; c.IsOpen = true; });
      const closed = capture(f.componentInstance.Closed);
      click(f, '.mj-bottom-sheet-scrim'); // Close() → close() schedules the settle fallback
      vi.advanceTimersByTime(300);        // fallback fires finishClose() under reduced motion
      expect(closed.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

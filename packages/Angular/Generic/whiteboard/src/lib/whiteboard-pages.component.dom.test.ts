import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeWhiteboardPagesComponent } from './whiteboard-pages.component';
import { WhiteboardState } from './whiteboard-state';

/**
 * DOM spec for <mj-realtime-whiteboard-pages> — the OneNote-style page strip. This is a
 * data-bound component, but its data source (WhiteboardState) is a plain Angular-free
 * engine we can `new` directly — no metadata provider / RunView needed. Covers: a chip
 * per page via @for, the [class.active] on the active page, the agent-authorship garnish,
 * the @if(CanDelete) close-affordance gating (hidden on the lone page), the @if(!ReadOnly)
 * add button, the ChipContextMenu @Output, and that clicking a chip / add button mutates
 * the engine.
 */
describe('RealtimeWhiteboardPagesComponent (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<RealtimeWhiteboardPagesComponent>>;
  const chips = (f: Fix) => Array.from(f.nativeElement.querySelectorAll('.wb-page-chip')) as HTMLButtonElement[];

  const renderWith = (state: WhiteboardState, readOnly = false): Fix =>
    renderComponentFixture(RealtimeWhiteboardPagesComponent, { inputs: { State: state, ReadOnly: readOnly } });

  it('renders one chip per page in the engine', () => {
    const state = new WhiteboardState();
    state.AddPage('Second');
    const f = renderWith(state);
    expect(chips(f).length).toBe(2);
  });

  it('marks the active page chip with .active (and only one chip is active)', () => {
    const state = new WhiteboardState();
    state.AddPage('Second'); // AddPage switches to the new page, so it is active
    const f = renderWith(state);
    const active = chips(f).filter((c) => c.classList.contains('active'));
    expect(active.length).toBe(1);
    expect(active[0].querySelector('.wb-page-chip__name')?.textContent?.trim()).toBe('Second');
  });

  it('does NOT render the delete affordance when there is only one page', () => {
    const state = new WhiteboardState();
    const f = renderWith(state);
    expect(f.nativeElement.querySelector('.wb-page-chip__close')).toBeNull();
  });

  it('renders a delete affordance on chips once there is more than one page', () => {
    const state = new WhiteboardState();
    state.AddPage('Second');
    const f = renderWith(state);
    expect(f.nativeElement.querySelectorAll('.wb-page-chip__close').length).toBe(2);
  });

  it('adds the agent garnish only to agent-authored page chips', () => {
    const state = new WhiteboardState();
    state.AddPage('Agent Page', 'agent');
    const f = renderWith(state);
    const agentChips = chips(f).filter((c) => c.classList.contains('wb-page-chip--agent'));
    expect(agentChips.length).toBe(1);
    expect(agentChips[0].querySelector('.wb-page-chip__agent-dot')).not.toBeNull();
  });

  it('renders the add (+) button when not read-only', () => {
    const f = renderWith(new WhiteboardState(), false);
    expect(f.nativeElement.querySelector('.wb-page-add')).not.toBeNull();
  });

  it('hides the add (+) button and delete affordances in read-only mode', () => {
    const state = new WhiteboardState();
    state.AddPage('Second');
    const f = renderWith(state, true);
    expect(f.nativeElement.querySelector('.wb-page-add')).toBeNull();
    expect(f.nativeElement.querySelector('.wb-page-chip__close')).toBeNull();
  });

  it('switches the active page in the engine when an inactive chip is clicked', () => {
    const state = new WhiteboardState();
    const firstId = state.Pages[0].ID;
    state.AddPage('Second'); // now "Second" is active, first is inactive
    const f = renderWith(state);
    // click the first (inactive) chip
    const firstChip = chips(f).find((c) => c.querySelector('.wb-page-chip__name')?.textContent?.trim() === 'Page 1')!;
    firstChip.click();
    expect(state.ActivePageID).toBe(firstId);
  });

  it('adds a page to the engine when the + button is clicked', () => {
    const state = new WhiteboardState();
    const before = state.Pages.length;
    const f = renderWith(state);
    (f.nativeElement.querySelector('.wb-page-add') as HTMLButtonElement).click();
    expect(state.Pages.length).toBe(before + 1);
  });

  it('emits ChipContextMenu (and suppresses the native menu) on right-click', () => {
    const state = new WhiteboardState();
    const spy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardPagesComponent, {
      inputs: { State: state, ReadOnly: false },
      setup: (c) => c.ChipContextMenu.subscribe(spy),
    });
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    chips(f)[0].dispatchEvent(evt);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('does NOT emit ChipContextMenu in read-only mode', () => {
    const state = new WhiteboardState();
    const spy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardPagesComponent, {
      inputs: { State: state, ReadOnly: true },
      setup: (c) => c.ChipContextMenu.subscribe(spy),
    });
    chips(f)[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(spy).not.toHaveBeenCalled();
  });
});

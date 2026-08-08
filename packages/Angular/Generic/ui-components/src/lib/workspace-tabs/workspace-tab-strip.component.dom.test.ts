import { describe, it, expect } from 'vitest';
import { renderComponentFixture, queryAll, attr, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { MJWorkspaceTabStripComponent } from './workspace-tab-strip.component';
import { MJWorkspaceTab } from './workspace-tabs.types';

/**
 * DOM spec for <mj-workspace-tab-strip> — the dumb, presentation-over-store draft tab strip.
 * It renders the tabs it is handed and emits intent; there is no data provider, so it renders
 * purely from the `Tabs` input. Covers: the `@for` tab-per-item render, the
 * `mj-tabs__tab--active` / `--rejected` / `--complete` status classes, the `aria-selected` state,
 * the `aria-label` accessible name that folds in rejected/unsaved state, the dirty dot, the
 * `@if (ShowNewTab)` new-tab affordance, and the `TabSelected` / `TabClosed` / `NewTabRequested`
 * outputs. (Drag-reorder / `TabReordered` is CDK-pointer-driven and out of scope for a jsdom DOM
 * spec — its emit logic is unit-covered via `onDrop`.)
 */
describe('MJWorkspaceTabStripComponent (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<MJWorkspaceTabStripComponent>>;

  const tab = (over: Partial<MJWorkspaceTab>): MJWorkspaceTab =>
    ({ Id: 'a', Label: 'Alpha', Status: 'draft', State: null, ...over });

  const render = (
    inputs: Record<string, unknown>,
    setup?: (c: MJWorkspaceTabStripComponent) => void,
  ): Fix => renderComponentFixture(MJWorkspaceTabStripComponent, { inputs, setup });

  const tabs = (f: Fix) => queryAll(f, '.mj-tabs__tab') as HTMLElement[];

  it('renders one tab per item in Tabs', () => {
    const f = render({ Tabs: [tab({ Id: 'a' }), tab({ Id: 'b', Label: 'Beta' })] });
    expect(tabs(f).length).toBe(2);
  });

  it('marks the active tab with --active and aria-selected, and only that one', () => {
    const f = render({ Tabs: [tab({ Id: 'a' }), tab({ Id: 'b', Label: 'Beta' })], ActiveId: 'b' });
    const active = tabs(f).filter((t) => t.classList.contains('mj-tabs__tab--active'));
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('aria-selected')).toBe('true');
    // the inactive tab reports aria-selected=false
    const inactive = tabs(f).find((t) => !t.classList.contains('mj-tabs__tab--active'))!;
    expect(inactive.getAttribute('aria-selected')).toBe('false');
  });

  it('applies the rejected and complete status classes from tab.Status', () => {
    const f = render({ Tabs: [tab({ Id: 'r', Status: 'rejected' }), tab({ Id: 'c', Status: 'complete' })] });
    const [rejected, complete] = tabs(f);
    expect(rejected.classList.contains('mj-tabs__tab--rejected')).toBe(true);
    expect(complete.classList.contains('mj-tabs__tab--complete')).toBe(true);
  });

  it('folds rejected + unsaved state into the tab accessible name', () => {
    const f = render({ Tabs: [tab({ Label: 'Alpha', Status: 'rejected', Dirty: true })] });
    expect(tabs(f)[0].getAttribute('aria-label')).toBe('Alpha (rejected) (unsaved changes)');
  });

  it('renders the dirty dot only for tabs with unsaved changes', () => {
    const f = render({ Tabs: [tab({ Id: 'a', Dirty: true }), tab({ Id: 'b', Label: 'Beta' })] });
    expect(queryAll(f, '.mj-tabs__dirty').length).toBe(1);
  });

  it('emits TabSelected with the tab id when a tab body is clicked', () => {
    const f = render({ Tabs: [tab({ Id: 'a' }), tab({ Id: 'b', Label: 'Beta' })] });
    const selected = capture(f.componentInstance.TabSelected);
    tabs(f)[1].click();
    expect(selected).toEqual(['b']);
  });

  it('emits TabClosed (and not TabSelected) when a tab close button is clicked', () => {
    const f = render({ Tabs: [tab({ Id: 'a' })] });
    const closed = capture(f.componentInstance.TabClosed);
    const selected = capture(f.componentInstance.TabSelected);
    click(f, '.mj-tabs__close');
    expect(closed).toEqual(['a']);
    expect(selected).toEqual([]); // stopPropagation keeps the row click from firing
  });

  it('shows the new-tab button by default and emits NewTabRequested on click', () => {
    const f = render({ Tabs: [tab({ Id: 'a' })], NewTabLabel: 'New draft' });
    const requested = capture(f.componentInstance.NewTabRequested);
    expect(attr(f, '.mj-tabs__new', 'aria-label')).toBe('New draft');
    click(f, '.mj-tabs__new');
    expect(requested.length).toBe(1);
  });

  it('hides the new-tab button when ShowNewTab is false', () => {
    const f = render({ Tabs: [tab({ Id: 'a' })], ShowNewTab: false });
    expect(queryAll(f, '.mj-tabs__new').length).toBe(0);
  });
});

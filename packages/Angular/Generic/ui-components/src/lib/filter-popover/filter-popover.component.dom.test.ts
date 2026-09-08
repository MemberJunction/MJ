import { describe, it, expect, afterEach } from 'vitest';
import { renderComponentFixture, renderTemplate, query, capture, overlayQuery, overlayText, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { MJFilterPopoverComponent } from './filter-popover.component';

/**
 * DOM coverage for <mj-filter-popover> — the trigger-button + popover-panel filter container
 * (used ~35×). On desktop (matchMedia stub → not mobile) the panel renders in a CDK connected-overlay,
 * so panel assertions use the overlay-query helpers. Covers the trigger label + active-count badge +
 * aria-expanded, open/close via the trigger, projected panel content, and the ClearAll affordance.
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJFilterPopoverComponent, { imports: [MJFilterPopoverComponent], inputs });
const trigger = (f: ReturnType<typeof render>) => query(f, '.mj-filter-popover-trigger') as HTMLElement;

afterEach(() => clearOverlayContainers());

describe('MJFilterPopoverComponent (DOM)', () => {
  it('renders the trigger with its label, collapsed and unbadged by default', () => {
    const f = render({ Label: 'Filters' });
    expect(query(f, '.mj-filter-popover-label')?.textContent?.trim()).toBe('Filters');
    expect(trigger(f).getAttribute('aria-expanded')).toBe('false');
    expect(query(f, '.mj-filter-popover-badge')).toBeNull();
  });

  it('shows the active-count badge when ActiveCount > 0', () => {
    const f = render({ ActiveCount: 4 });
    expect(query(f, '.mj-filter-popover-badge')?.textContent?.trim()).toBe('4');
  });

  it('opens the popover panel on trigger click', () => {
    const f = render({ Label: 'Filters' });
    trigger(f).click();
    f.detectChanges();
    expect(trigger(f).getAttribute('aria-expanded')).toBe('true');
    expect(overlayQuery('.mj-filter-popover-panel[role="dialog"]')).not.toBeNull();
  });

  it('closes the popover on a second trigger click', () => {
    const f = render();
    trigger(f).click();
    f.detectChanges();
    trigger(f).click();
    f.detectChanges();
    expect(trigger(f).getAttribute('aria-expanded')).toBe('false');
    expect(overlayQuery('.mj-filter-popover-panel')).toBeNull();
  });

  it('shows the Clear-all button only when ActiveCount > 0 AND ShowClearAll, and emits on click', () => {
    const f = render({ ActiveCount: 2, ShowClearAll: true });
    trigger(f).click();
    f.detectChanges();
    const clear = overlayQuery('.mj-filter-popover-clear') as HTMLElement;
    expect(clear).not.toBeNull();
    const cleared = capture(f.componentInstance.ClearAllRequested);
    clear.click();
    expect(cleared.length).toBe(1);
  });

  it('omits the Clear-all button when ShowClearAll is false', () => {
    const f = render({ ActiveCount: 2, ShowClearAll: false });
    trigger(f).click();
    f.detectChanges();
    expect(overlayQuery('.mj-filter-popover-clear')).toBeNull();
  });

  it('projects its content into the panel', async () => {
    const f = await renderTemplate(
      `<mj-filter-popover Label="Filters"><div class="my-filters">custom grid</div></mj-filter-popover>`,
      { imports: [MJFilterPopoverComponent] },
    );
    (query(f, '.mj-filter-popover-trigger') as HTMLElement).click();
    f.detectChanges();
    expect(overlayText('.my-filters')).toBe('custom grid');
  });
});

import { describe, it, expect } from 'vitest';
import { RenderComponentFixture, Query, QueryAll, Attr, Click, Capture } from '@memberjunction/ng-test-utils';
import { DashboardAddToMenuComponent } from './dashboard-add-to-menu.component';

const render = (inputs: Record<string, unknown> = {}) =>
  RenderComponentFixture(DashboardAddToMenuComponent, {
    declarations: [DashboardAddToMenuComponent],
    inputs: { IsHomeTab: false, IsPinned: false, ...inputs },
  });

describe('DashboardAddToMenuComponent (DOM)', () => {
  it('is closed until the trigger is clicked', () => {
    const f = render();
    expect(Query(f, '.atm-menu')).toBeNull();
    Click(f, '.atm-trigger');
    f.detectChanges();
    expect(Query(f, '.atm-menu')).not.toBeNull();
  });

  it('shows Added on items that are already placed', () => {
    const f = render({ IsHomeTab: true, IsPinned: true });
    Click(f, '.atm-trigger');
    f.detectChanges();
    expect(QueryAll(f, '.atm-added').length).toBe(2);
  });

  it('emits the intent for each item and closes', () => {
    const f = render();
    const tabs = Capture(f.componentInstance.ToggleHomeTab);
    const pins = Capture(f.componentInstance.PinToHome);
    const shares = Capture(f.componentInstance.Share);
    Click(f, '.atm-trigger'); f.detectChanges(); Click(f, '.atm-home-tab'); f.detectChanges();
    Click(f, '.atm-trigger'); f.detectChanges(); Click(f, '.atm-pin'); f.detectChanges();
    Click(f, '.atm-trigger'); f.detectChanges(); Click(f, '.atm-share'); f.detectChanges();
    expect(tabs.length).toBe(1); expect(pins.length).toBe(1); expect(shares.length).toBe(1);
    expect(Query(f, '.atm-menu')).toBeNull();
  });

  it('reports the open state on the trigger', () => {
    const f = render();
    expect(Attr(f, '.atm-trigger', 'aria-expanded')).toBe('false');
    Click(f, '.atm-trigger');
    f.detectChanges();
    expect(Attr(f, '.atm-trigger', 'aria-expanded')).toBe('true');
  });

  it('shows a plus instead of Added on items that are not placed', () => {
    const f = render({ IsHomeTab: true, IsPinned: false });
    Click(f, '.atm-trigger');
    f.detectChanges();
    expect(Query(f, '.atm-home-tab .atm-added')).not.toBeNull();
    expect(Query(f, '.atm-pin .atm-added')).toBeNull();
    expect(Query(f, '.atm-pin .atm-plus')).not.toBeNull();
  });

  it('leaves out Share when the user cannot share the dashboard', () => {
    const f = render({ CanShare: false });
    Click(f, '.atm-trigger');
    f.detectChanges();
    expect(Query(f, '.atm-home-tab')).not.toBeNull();
    expect(Query(f, '.atm-share')).toBeNull();
    expect(Query(f, '.atm-sep')).toBeNull();
  });

  it('closes on a click outside the menu', () => {
    const f = render();
    Click(f, '.atm-trigger');
    f.detectChanges();
    document.body.click();
    f.detectChanges();
    expect(Query(f, '.atm-menu')).toBeNull();
  });

  it('stays open on a click inside the menu that is not an item', () => {
    const f = render();
    Click(f, '.atm-trigger');
    f.detectChanges();
    Click(f, '.atm-label');
    f.detectChanges();
    expect(Query(f, '.atm-menu')).not.toBeNull();
  });

  it('closes on Escape', () => {
    const f = render();
    Click(f, '.atm-trigger');
    f.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    f.detectChanges();
    expect(Query(f, '.atm-menu')).toBeNull();
  });

  it('toggles closed when the trigger is clicked again', () => {
    const f = render();
    Click(f, '.atm-trigger');
    f.detectChanges();
    Click(f, '.atm-trigger');
    f.detectChanges();
    expect(Query(f, '.atm-menu')).toBeNull();
  });
});

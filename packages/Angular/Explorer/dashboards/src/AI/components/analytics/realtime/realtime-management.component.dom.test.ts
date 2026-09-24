import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { MJRefreshButtonComponent, MJTabNavComponent } from '@memberjunction/ng-ui-components';
import { RealtimeManagementComponent } from './realtime-management.component';

/**
 * DOM coverage for <app-realtime-management> — the Realtime Management surface. Its seven sub-tabs
 * render through `mj-tab-nav` (not hand-rolled buttons), the refresh action is `mj-refresh-button`,
 * and each tab's empty table shows an `mj-empty-state`. Choosing a tab switches the view and persists
 * the choice through `UserInfoEngine` (spied here). `mj-empty-state` / `mj-loading` are stubbed.
 */

async function render(): Promise<ComponentFixture<RealtimeManagementComponent>> {
  TestBed.configureTestingModule({
    declarations: [RealtimeManagementComponent],
    imports: [StubLoadingComponent, StubEmptyStateComponent, MJTabNavComponent, MJRefreshButtonComponent],
  });
  const fixture = TestBed.createComponent(RealtimeManagementComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: [] }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('RealtimeManagementComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('renders the seven sub-tabs through mj-tab-nav with Live Sessions selected', async () => {
    installProvider({ runViewResults: [] });
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined as never);
    const fixture = await render();
    expect(queryAll(fixture, 'button.subtab').length).toBe(0);
    const tabs = queryAll(fixture, 'mj-tab-nav [role="tab"]');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'Live Sessions', 'Bridge Providers', 'Agent Identities', 'Channels', 'Co-Agents', 'Session History', 'Metrics',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(query(fixture, '.subtab-bar mj-refresh-button')).not.toBeNull();
  });

  it('switches the view and persists the choice when a tab is chosen', async () => {
    installProvider({ runViewResults: [] });
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined as never);
    const save = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined as never);
    const fixture = await render();
    const providersTab = queryAll(fixture, 'mj-tab-nav [role="tab"]').find((t) => t.textContent?.includes('Bridge Providers')) as HTMLElement;
    providersTab.click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.ActiveSubTab).toBe('providers');
    expect(save).toHaveBeenCalled();
    const emptyTitles = queryAll(fixture, '.data-table .stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toContain('No bridge providers registered');
  });

  it('ignores an unknown tab key', async () => {
    installProvider({ runViewResults: [] });
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined as never);
    const fixture = await render();
    fixture.componentInstance.OnSubTabChange('not-a-tab');
    expect(fixture.componentInstance.ActiveSubTab).toBe('live-sessions');
  });
});

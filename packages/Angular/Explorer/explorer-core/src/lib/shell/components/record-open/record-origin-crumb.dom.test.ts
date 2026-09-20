import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { NavigationService } from '@memberjunction/ng-shared';
import { Metadata } from '@memberjunction/core';
import { RecordOriginCrumbComponent } from './record-origin-crumb.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for the pane-level origin crumb — the first element inside a
 * record's golden-layout pane. Clickable when the origin has a return target;
 * a passive "From X" label when it only has provenance; nothing at all when
 * there is no origin.
 */

function render(origin: Record<string, unknown> | null) {
  const nav = {
    ReturnToRecordSource: vi.fn().mockResolvedValue(undefined),
    SwitchToAppHome: vi.fn().mockResolvedValue(undefined)
  };
  const fixture = renderComponentFixture(RecordOriginCrumbComponent, {
    imports: [RecordOriginCrumbComponent],
    providers: [{ provide: NavigationService, useValue: nav }],
    autoDetect: true
  });
  fixture.componentRef.setInput('Origin', origin);
  fixture.detectChanges();
  return { fixture, nav };
}

describe('RecordOriginCrumbComponent (DOM)', () => {
  it('renders App and Page as SEPARATE links for a nav-page origin', () => {
    const { fixture } = render({
      sourceAppId: 'app-1', sourceAppName: 'Data Explorer',
      sourceNavLabel: 'MJ: Action Params', sourceNavItemName: 'Data', sourceTabId: 't-1'
    });
    const segs = fixture.nativeElement.querySelectorAll('.crumb-seg');
    expect(segs.length).toBe(2);
    expect(segs[0].textContent?.trim()).toBe('Data Explorer');
    expect(segs[1].textContent?.trim()).toBe('MJ: Action Params');
  });

  it('page segment restores the full origin; app segment goes to the app LANDING', () => {
    const origin = {
      sourceAppId: 'app-1', sourceAppName: 'Data Explorer',
      sourceNavLabel: 'MJ: Action Params', sourceTabId: 't-1'
    };
    const { fixture, nav } = render(origin);
    const segs = fixture.nativeElement.querySelectorAll('.crumb-seg');
    (segs[1] as HTMLElement).click();
    expect(nav.ReturnToRecordSource).toHaveBeenCalledWith(origin);
    (segs[0] as HTMLElement).click();
    expect(nav.SwitchToAppHome).toHaveBeenCalledWith('app-1');
  });

  it('renders the label as a single link for overlay origins (sourceLabel wins)', () => {
    const { fixture } = render({
      sourceAppId: 'app-chat', sourceAppName: 'Chat',
      sourceNavLabel: 'Conversations', sourceLabel: 'Conversation', sourceTabId: 't-9'
    });
    const segs = fixture.nativeElement.querySelectorAll('.crumb-seg');
    expect(segs.length).toBe(1);
    expect(segs[0].textContent?.trim()).toBe('Conversation');
  });

  it('renders a passive From-label when the origin has no return target', () => {
    const { fixture } = render({ sourceLabel: 'Agent' });
    expect(query(fixture, '.crumb-seg')).toBeNull();
    expect(query(fixture, '.origin-static')?.textContent?.trim()).toBe('From Agent');
  });

  it('renders nothing without an origin', () => {
    const { fixture } = render(null);
    expect(query(fixture, '.crumb-seg')).toBeNull();
    expect(query(fixture, '.origin-static')).toBeNull();
  });

  it('renders entity DisplayName instead of raw PKEY when opened from another record', () => {
    // Provide metadata for entity lookup
    const prevProvider = (globalThis as Record<string, unknown>)['__mock_provider'];
    (Metadata as { Provider: unknown }).Provider = {
      Entities: [
        {
          Name: 'MJ_BizApps_Orders: Order Headers',
          DisplayName: 'Order Headers',
          FirstPrimaryKey: { Name: 'ID' }
        }
      ],
      GetCachedRecordNameOnlyIfCached: () => undefined
    };

    try {
      const { fixture } = render({
        sourceAppId: 'app-orders',
        sourceAppName: 'Orders',
        sourceRecordEntity: 'MJ_BizApps_Orders: Order Headers',
        sourceRecordId: 'EFEF4E06-A42B-536B-AD2F-0D09F82E8CBD',
        sourceLabel: 'MJ_BizApps_Orders: Order Headers - EFEF4E06-A42B-536B-AD2F-0D09F82E8CBD'
      });
      const segs = fixture.nativeElement.querySelectorAll('.crumb-seg');
      expect(segs.length).toBe(1);
      // It should NOT show the raw entity or PKEY, but the friendly DisplayName!
      expect(segs[0].textContent?.trim()).toBe('Order Headers');
    } finally {
      (Metadata as { Provider: unknown }).Provider = prevProvider;
    }
  });

  it('renders cached record name when available in metadata cache', () => {
    const prevProvider = (globalThis as Record<string, unknown>)['__mock_provider'];
    (Metadata as { Provider: unknown }).Provider = {
      Entities: [
        {
          Name: 'MJ_BizApps_Orders: Order Headers',
          DisplayName: 'Order Headers',
          FirstPrimaryKey: { Name: 'ID' }
        }
      ],
      GetCachedRecordNameOnlyIfCached: () => 'ORD-00042'
    };

    try {
      const { fixture } = render({
        sourceAppId: 'app-orders',
        sourceAppName: 'Orders',
        sourceRecordEntity: 'MJ_BizApps_Orders: Order Headers',
        sourceRecordId: 'EFEF4E06-A42B-536B-AD2F-0D09F82E8CBD',
        sourceLabel: 'MJ_BizApps_Orders: Order Headers - EFEF4E06-A42B-536B-AD2F-0D09F82E8CBD'
      });
      const segs = fixture.nativeElement.querySelectorAll('.crumb-seg');
      expect(segs.length).toBe(1);
      expect(segs[0].textContent?.trim()).toBe('ORD-00042');
    } finally {
      (Metadata as { Provider: unknown }).Provider = prevProvider;
    }
  });
});

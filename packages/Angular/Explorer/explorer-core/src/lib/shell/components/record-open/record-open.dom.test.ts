import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { RecordsHubPillComponent } from './records-hub-pill.component';

/**
 * DOM coverage for the records-style Records pill — the persistent,
 * count-badged nav affordance for open record tabs. Records themselves are
 * native Golden Layout tabs; the pill is the global entry point (resume the
 * last-viewed record from anywhere). WorkspaceStateManager is stubbed with a
 * Configuration BehaviorSubject — the pill is a thin controller over it.
 */

interface StubTab {
  id: string;
  applicationId: string;
  title: string;
  resourceRecordId: string;
  isPinned: boolean;
  sequence: number;
  lastAccessedAt: string;
  configuration: Record<string, unknown>;
}

function recordTab(id: string, title: string, sequence = 0, lastAccessedAt = ''): StubTab {
  return {
    id, title, sequence, lastAccessedAt,
    applicationId: 'app-1',
    resourceRecordId: `rid-${id}`,
    isPinned: false,
    configuration: { resourceType: 'Records', Entity: 'Widgets' }
  };
}

function navTab(id: string, title: string): StubTab {
  return {
    id, title,
    applicationId: 'app-1',
    resourceRecordId: '',
    isPinned: false,
    sequence: 0,
    lastAccessedAt: '',
    configuration: { resourceType: 'Dashboards' }
  };
}

/** A record promoted to the main workspace layout ("Move to Workspace") */
function dockedRecordTab(id: string, title: string, sequence = 0, lastAccessedAt = ''): StubTab {
  const tab = recordTab(id, title, sequence, lastAccessedAt);
  tab.configuration['recordDockedToWorkspace'] = true;
  return tab;
}

interface StubConfig {
  tabs: StubTab[];
  activeTabId: string | null;
}

function workspaceStub(tabs: StubTab[], activeTabId: string | null) {
  const config$ = new BehaviorSubject<StubConfig>({ tabs, activeTabId });
  return {
    stub: {
      Configuration: config$,
      GetConfiguration: () => config$.value,
      SetActiveTab: vi.fn(),
      CloseTab: vi.fn()
    },
    config$
  };
}

describe('RecordsHubPillComponent (DOM)', () => {
  function render(tabs: StubTab[], activeTabId: string | null) {
    const ws = workspaceStub(tabs, activeTabId);
    const fixture = renderComponentFixture(RecordsHubPillComponent, {
      imports: [RecordsHubPillComponent],
      providers: [{ provide: WorkspaceStateManager, useValue: ws.stub }],
      autoDetect: true
    });
    return { fixture, ws };
  }

  it('renders nothing when no records are open', () => {
    const { fixture } = render([navTab('t1', 'Dashboard')], 't1');
    expect(query(fixture, '.records-pill')).toBeNull();
  });

  it('shows the count badge and active state while viewing a record', () => {
    const { fixture } = render([recordTab('t2', 'Widget A', 0), recordTab('t3', 'Widget B', 1)], 't2');
    expect(query(fixture, '.records-pill-count')?.textContent?.trim()).toBe('2');
    expect(query(fixture, '.records-pill')?.classList.contains('active')).toBe(true);
  });

  it('resumes the LAST-VIEWED record when clicked from a nav page', () => {
    const tabs = [navTab('t1', 'Dashboard'), recordTab('t2', 'Widget A', 0), recordTab('t3', 'Widget B', 1)];
    const { fixture, ws } = render(tabs, 't3');
    // Simulate navigating away: t3 was viewed, then the nav page activates
    ws.config$.next({ tabs, activeTabId: 't1' });
    fixture.detectChanges();
    expect(query(fixture, '.records-pill')?.classList.contains('active')).toBe(false);
    (query(fixture, '.records-pill') as HTMLElement).click();
    expect(ws.stub.SetActiveTab).toHaveBeenCalledWith('t3');
  });

  it('falls back to the most recently accessed record when the resume target was closed', () => {
    const t2 = recordTab('t2', 'Widget A', 0, '2026-07-27T10:00:00Z');
    const t3 = recordTab('t3', 'Widget B', 1, '2026-07-27T12:00:00Z');
    const nav = navTab('t1', 'Dashboard');
    const { fixture, ws } = render([nav, t2, t3], 't1');
    (query(fixture, '.records-pill') as HTMLElement).click();
    expect(ws.stub.SetActiveTab).toHaveBeenCalledWith('t3'); // newest lastAccessedAt
  });

  describe('docked records (Move to Workspace)', () => {
    it('excludes docked records from the badge count', () => {
      const { fixture } = render(
        [recordTab('t2', 'Widget A', 0), dockedRecordTab('t3', 'Widget B', 1)], 't2');
      expect(query(fixture, '.records-pill-count')?.textContent?.trim()).toBe('1');
    });

    it('renders nothing when the only open record is docked', () => {
      const { fixture } = render(
        [navTab('t1', 'Dashboard'), dockedRecordTab('t2', 'Widget A')], 't1');
      expect(query(fixture, '.records-pill')).toBeNull();
    });

    it('never resumes to a docked record, even when it is the most recent', () => {
      const region = recordTab('t2', 'Widget A', 0, '2026-07-27T10:00:00Z');
      const dockedNewest = dockedRecordTab('t3', 'Widget B', 1, '2026-07-27T12:00:00Z');
      const { fixture, ws } = render([navTab('t1', 'Dashboard'), region, dockedNewest], 't1');
      (query(fixture, '.records-pill') as HTMLElement).click();
      expect(ws.stub.SetActiveTab).toHaveBeenCalledWith('t2');
    });

    it('is not lit while a DOCKED record is the active tab (main layout is the surface)', () => {
      const { fixture } = render(
        [recordTab('t2', 'Widget A', 0), dockedRecordTab('t3', 'Widget B', 1)], 't3');
      expect(query(fixture, '.records-pill')?.classList.contains('active')).toBe(false);
    });
  });
});

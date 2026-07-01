import { describe, it, expect } from 'vitest';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { ArchiveRunViewerComponent } from './archive-run-viewer.component';

/**
 * DOM spec for <mj-archive-run-viewer>.
 *
 * This is a self-loading container: ngOnInit fires loadRunData() which uses a bare
 * `new RunView()` against the global provider. We cover three things: the initial loading
 * branch, the settled empty branch, and — via `useFakeGlobalProvider` feeding canned rows +
 * a forced detectChanges() — the loaded run list + metrics (the "data path" block below).
 * The pure formatting/status helpers are asserted directly. The drawer (per-run detail)
 * remains out of scope. See guides/ANGULAR_TESTING_GUIDE.md §6.
 */
describe('ArchiveRunViewerComponent (DOM)', () => {
  it('shows the loading indicator on initial render', () => {
    const f = renderComponentFixture(ArchiveRunViewerComponent, {
      imports: [SharedGenericModule, MJEmptyStateComponent],
      declarations: [ArchiveRunViewerComponent],
    });
    // IsLoading starts true; loadRunData is async so the loading branch renders first.
    expect(f.componentInstance.IsLoading).toBe(true);
    expect(query(f, '.run-viewer-loading')).not.toBeNull();
    expect(query(f, '.metrics-row')).toBeNull();
  });

  it('shows the empty state after the (empty) load settles with no runs', async () => {
    const f = renderComponentFixture(ArchiveRunViewerComponent, {
      imports: [SharedGenericModule, MJEmptyStateComponent],
      declarations: [ArchiveRunViewerComponent],
      autoDetect: true,
    });
    await f.whenStable();
    // The provider-less load settles to an empty list; force the loaded state so the
    // assertion does not depend on the async RunView timing.
    f.componentInstance.IsLoading = false;
    f.componentRef.changeDetectorRef.markForCheck();
    await f.whenStable();

    expect(f.componentInstance.IsLoading).toBe(false);
    // The not-loading branch is rendered: metric cards + the empty-state placeholder.
    expect(query(f, '.metrics-row')).not.toBeNull();
    expect(query(f, '.run-empty')).not.toBeNull();
    expect(queryAll(f, '.run-card').length).toBe(0);
    expect(query(f, '.archive-drawer')).not.toBeNull();
    expect(query(f, '.archive-drawer')!.classList.contains('open')).toBe(false);
  });

  // Drives the REAL load: ngOnInit -> loadRunData() -> fetchRuns() (a bare `new RunView()` on the
  // global provider) -> mapRunRecord(). useFakeGlobalProvider feeds that RunView canned rows; a
  // forced detectChanges() after the load re-renders the OnPush @for (which a markForCheck +
  // whenStable alone did not — see the loading/empty tests above). (Guide §6.)
  describe('data path (loaded via the global provider)', () => {
    const installProvider = useFakeGlobalProvider();

    const RUNS = [
      {
        ID: 'run1',
        ArchiveConfiguration: 'Nightly',
        StartedAt: '2026-01-02T00:00:00Z',
        CompletedAt: '2026-01-02T00:01:00Z',
        Status: 'Success',
        ArchivedRecords: 10,
        FailedRecords: 0,
        SkippedRecords: 0,
        TotalBytesArchived: 2048,
      },
      {
        ID: 'run2',
        ArchiveConfiguration: 'Weekly',
        StartedAt: '2026-01-01T00:00:00Z',
        CompletedAt: null,
        Status: 'Running',
        ArchivedRecords: 5,
        FailedRecords: 1,
        SkippedRecords: 0,
        TotalBytesArchived: 1024,
      },
    ];

    async function renderLoaded(rows: unknown[]) {
      installProvider({ runViewResults: rows });
      const f = renderComponentFixture(ArchiveRunViewerComponent, {
        imports: [SharedGenericModule, MJEmptyStateComponent],
        declarations: [ArchiveRunViewerComponent],
      });
      await new Promise((r) => setTimeout(r, 0)); // let loadRunData's RunView settle
      f.detectChanges();
      return f;
    }

    it('renders one run card per loaded run and the total-runs metric', async () => {
      const f = await renderLoaded(RUNS);
      expect(f.componentInstance.IsLoading).toBe(false);
      expect(queryAll(f, '.run-card').length).toBe(2);
      // first metric card is "Total Runs"
      expect(text(f, '.metric-value')).toBe('2');
    });

    it('renders the empty placeholder (no run cards) when the load returns nothing', async () => {
      const f = await renderLoaded([]);
      expect(query(f, '.run-empty')).not.toBeNull();
      expect(queryAll(f, '.run-card').length).toBe(0);
    });
  });

  // --- Pure helpers (exercised via a rendered instance; the component injects
  //     ChangeDetectorRef, so it must be created through TestBed, not `new`). ---
  describe('formatting helpers', () => {
    const instance = (): ArchiveRunViewerComponent =>
      renderComponentFixture(ArchiveRunViewerComponent, {
        imports: [SharedGenericModule, MJEmptyStateComponent],
        declarations: [ArchiveRunViewerComponent],
      }).componentInstance;

    it('FormatBytes renders human-readable sizes', () => {
      const c = instance();
      expect(c.FormatBytes(0)).toBe('0 B');
      expect(c.FormatBytes(2048)).toBe('2.0 KB');
    });

    it('FormatDuration renders minutes and seconds', () => {
      const c = instance();
      expect(c.FormatDuration(45)).toBe('45s');
      expect(c.FormatDuration(60)).toBe('1m');
      expect(c.FormatDuration(90)).toBe('1m 30s');
    });

    it('GetStatusClass maps statuses to css classes', () => {
      const c = instance();
      expect(c.GetStatusClass('Success')).toBe('status-badge-success');
      expect(c.GetStatusClass('failed')).toBe('status-badge-error');
      expect(c.GetStatusClass('Running')).toBe('status-badge-info');
      expect(c.GetStatusClass('whatever')).toBe('status-badge-default');
    });
  });
});

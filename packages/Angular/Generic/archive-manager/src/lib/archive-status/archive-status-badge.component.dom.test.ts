import { describe, it, expect } from 'vitest';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, attr, capture, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { ArchiveStatusBadgeComponent, ArchiveVersionInfo } from './archive-status-badge.component';

/**
 * DOM spec for <mj-archive-status-badge>. The component's data load is driven by
 * EntityName/RecordID setters that call `new RunView()` (global provider, not threadable
 * here), so we don't exercise the load path. Instead we set the resolved display state
 * BEFORE the first detectChanges (zoneless §5) and assert the template's @if gating,
 * bound attributes, and the (click) -> @Output wiring.
 */
describe('ArchiveStatusBadgeComponent (DOM)', () => {
  it('renders nothing when there are no archived fields', () => {
    const f = renderComponentFixture(ArchiveStatusBadgeComponent, {
      declarations: [ArchiveStatusBadgeComponent],
    });
    expect(query(f, '.badge')).toBeNull();
  });

  it('renders the archived badge when HasArchivedFields is true', () => {
    const f = renderComponentFixture(ArchiveStatusBadgeComponent, {
      declarations: [ArchiveStatusBadgeComponent],
      setup: (c) => {
        c.HasArchivedFields = true;
        c.TooltipText = '3 fields archived on 1/1/2026';
      },
    });

    const badge = query(f, '.badge');
    expect(badge).not.toBeNull();
    expect(attr(f, '.badge', 'title')).toBe('3 fields archived on 1/1/2026');
    expect(attr(f, '.badge', 'aria-label')).toBe('Archived: 3 fields archived on 1/1/2026');
    expect(attr(f, '.badge', 'role')).toBe('button');
  });

  it('emits RestoreRequested with the latest version when the badge is clicked', () => {
    const version: ArchiveVersionInfo = {
      DetailID: 'd1',
      EntityName: 'Users',
      RecordID: 'r1',
      FieldCount: 0,
      ArchivedAt: new Date('2026-01-01T00:00:00Z'),
      Bytes: 1024,
    };
    const f = renderComponentFixture(ArchiveStatusBadgeComponent, {
      declarations: [ArchiveStatusBadgeComponent],
      setup: (c) => {
        c.HasArchivedFields = true;
        // latestVersion is private; OnBadgeClick reads it. Drive emission through the
        // public handler with the private field seeded via the setup callback.
        (c as unknown as { latestVersion: ArchiveVersionInfo }).latestVersion = version;
      },
    });

    const emitted = capture(f.componentInstance.RestoreRequested);
    (query(f, '.badge') as HTMLElement).click();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].DetailID).toBe('d1');
    expect(emitted[0].Bytes).toBe(1024);
  });

  it('does not emit when clicked with no latest version available', () => {
    const f = renderComponentFixture(ArchiveStatusBadgeComponent, {
      declarations: [ArchiveStatusBadgeComponent],
      setup: (c) => {
        c.HasArchivedFields = true;
      },
    });

    const emitted = capture(f.componentInstance.RestoreRequested);
    (query(f, '.badge') as HTMLElement).click();

    expect(emitted).toHaveLength(0);
  });

  // Exercises the REAL load path: setting EntityName + RecordID triggers loadArchiveStatus() ->
  // fetchArchiveDetails() (a bare `new RunView()` on the global provider) -> processArchiveResults().
  // useFakeGlobalProvider feeds that RunView canned rows so the count/tooltip/emit wiring is tested
  // end-to-end, not by seeding resolved state. (See guides/ANGULAR_TESTING_GUIDE.md §6.)
  describe('data path (loaded via the global provider)', () => {
    const installProvider = useFakeGlobalProvider();

    const DETAILS = [
      { ID: 'd1', Entity: 'Users', RecordID: 'r1', BytesArchived: 1024, __mj_CreatedAt: '2026-01-01T00:00:00Z' },
      { ID: 'd2', Entity: 'Users', RecordID: 'r1', BytesArchived: 512, __mj_CreatedAt: '2025-12-01T00:00:00Z' },
    ];

    async function renderLoaded(rows: unknown[]) {
      installProvider({ runViewResults: rows });
      const f = renderComponentFixture(ArchiveStatusBadgeComponent, {
        imports: [SharedGenericModule], // the IsLoading branch renders <mj-loading>
        declarations: [ArchiveStatusBadgeComponent],
        inputs: { EntityName: 'Users', RecordID: 'r1' },
      });
      await new Promise((r) => setTimeout(r, 0)); // let loadArchiveStatus' RunView settle
      f.detectChanges();
      return f;
    }

    it('renders the badge with a count-based tooltip from loaded archive details', async () => {
      const f = await renderLoaded(DETAILS);
      expect(query(f, '.badge')).not.toBeNull();
      expect(attr(f, '.badge', 'title')).toContain('2 fields archived');
    });

    it('emits RestoreRequested carrying the latest loaded detail when clicked', async () => {
      const f = await renderLoaded(DETAILS);
      const emitted = capture(f.componentInstance.RestoreRequested);
      (query(f, '.badge') as HTMLElement).click();
      expect(emitted).toHaveLength(1);
      expect(emitted[0].DetailID).toBe('d1'); // Results[0] is "latest"
      expect(emitted[0].Bytes).toBe(1024);
    });

    it('renders no badge when the load returns no archive details', async () => {
      const f = await renderLoaded([]);
      expect(query(f, '.badge')).toBeNull();
    });
  });
});

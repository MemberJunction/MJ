import { describe, it, expect } from 'vitest';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { ArchiveRestoreDialogComponent, ArchiveVersion } from './archive-restore-dialog.component';

/**
 * DOM spec for <mj-archive-restore-dialog>. The Visible setter triggers a load via
 * `new RunView()`, but loadVersions() returns early when EntityName/RecordID are empty,
 * so leaving them unset keeps Status='idle' and we can assert the rendered (non-loading)
 * surface deterministically. We seed Versions/SelectedVersion via setup BEFORE the first
 * detectChanges (zoneless §5).
 */
function makeVersion(id: string): ArchiveVersion {
  return {
    ID: id,
    ArchivedAt: new Date('2026-01-01T00:00:00Z'),
    FieldCount: 2,
    Bytes: 2048,
    StoragePath: '/archives/' + id,
    ArchivedData: '{"a":1}',
  };
}

describe('ArchiveRestoreDialogComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    const f = renderComponentFixture(ArchiveRestoreDialogComponent, {
      imports: [SharedGenericModule, MJEmptyStateComponent],
      declarations: [ArchiveRestoreDialogComponent],
    });
    expect(query(f, '.restore-dialog')).toBeNull();
  });

  it('shows the empty state when visible with no versions', () => {
    const f = renderComponentFixture(ArchiveRestoreDialogComponent, {
      imports: [SharedGenericModule, MJEmptyStateComponent],
      declarations: [ArchiveRestoreDialogComponent],
      inputs: { Visible: true },
    });
    expect(query(f, '.restore-dialog')).not.toBeNull();
    expect(query(f, '.restore-empty')).not.toBeNull();
    expect(queryAll(f, '.timeline-node').length).toBe(0);
  });

  it('renders a timeline node per version and a preview for the selected one', () => {
    const versions = [makeVersion('v1'), makeVersion('v2')];
    const f = renderComponentFixture(ArchiveRestoreDialogComponent, {
      imports: [SharedGenericModule, MJEmptyStateComponent],
      declarations: [ArchiveRestoreDialogComponent],
      inputs: { Visible: true },
      setup: (c) => {
        c.Versions = versions;
        c.SelectedVersion = versions[0];
        c.PreviewJson = '{\n  "a": 1\n}';
      },
    });

    expect(queryAll(f, '.timeline-node').length).toBe(2);
    expect(query(f, '.timeline-node.active')).not.toBeNull();
    expect(text(f, '.preview-json')).toContain('"a": 1');
  });

  it('disables the Restore button when no version is selected', () => {
    const f = renderComponentFixture(ArchiveRestoreDialogComponent, {
      imports: [SharedGenericModule, MJEmptyStateComponent],
      declarations: [ArchiveRestoreDialogComponent],
      inputs: { Visible: true },
      setup: (c) => {
        c.Versions = [makeVersion('v1')];
        c.SelectedVersion = null;
      },
    });

    const btn = query(f, '.btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables the Restore button once a version is selected', () => {
    const versions = [makeVersion('v1')];
    const f = renderComponentFixture(ArchiveRestoreDialogComponent, {
      imports: [SharedGenericModule, MJEmptyStateComponent],
      declarations: [ArchiveRestoreDialogComponent],
      inputs: { Visible: true },
      setup: (c) => {
        c.Versions = versions;
        c.SelectedVersion = versions[0];
      },
    });

    const btn = query(f, '.btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('emits VisibleChange(false) when the close button is clicked', () => {
    const f = renderComponentFixture(ArchiveRestoreDialogComponent, {
      imports: [SharedGenericModule, MJEmptyStateComponent],
      declarations: [ArchiveRestoreDialogComponent],
      inputs: { Visible: true },
    });

    const emitted = capture(f.componentInstance.VisibleChange);
    (query(f, '.restore-close-btn') as HTMLElement).click();

    expect(emitted).toEqual([false]);
  });

  // Drives the REAL load: opening the dialog (Visible=true) with EntityName/RecordID set calls
  // loadVersions() -> fetchVersionRecords() (a bare `new RunView()` on the global provider) ->
  // mapVersionRecords(), then auto-selects the newest. useFakeGlobalProvider feeds canned version
  // rows so the timeline + auto-select wiring is tested end-to-end. (Guide §6.)
  describe('data path (loaded via the global provider)', () => {
    const installProvider = useFakeGlobalProvider();

    const VERSIONS = [
      { ID: 'v1', BytesArchived: 2048, StoragePath: '/archives/v1', __mj_CreatedAt: '2026-01-02T00:00:00Z' },
      { ID: 'v2', BytesArchived: 1024, StoragePath: '/archives/v2', __mj_CreatedAt: '2026-01-01T00:00:00Z' },
    ];

    async function renderOpened(rows: unknown[]) {
      installProvider({ runViewResults: rows });
      const f = renderComponentFixture(ArchiveRestoreDialogComponent, {
        imports: [SharedGenericModule, MJEmptyStateComponent],
        declarations: [ArchiveRestoreDialogComponent],
        inputs: { EntityName: 'Users', RecordID: 'r1', Visible: true },
      });
      await new Promise((r) => setTimeout(r, 0)); // let loadVersions' RunView settle
      f.detectChanges();
      return f;
    }

    it('renders one timeline node per loaded version and auto-selects the newest', async () => {
      const f = await renderOpened(VERSIONS);
      const nodes = queryAll(f, '.timeline-node');
      expect(nodes.length).toBe(2);
      expect(nodes[0].classList.contains('active')).toBe(true); // first (newest) auto-selected
    });

    it('renders the empty state when the load returns no versions', async () => {
      const f = await renderOpened([]);
      expect(query(f, '.restore-empty')).not.toBeNull();
      expect(queryAll(f, '.timeline-node').length).toBe(0);
    });
  });
});

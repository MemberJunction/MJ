/**
 * Tests for record-changes package:
 * - RecordChangesComponent utility methods (pure functions)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular
vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  Directive: () => (target: Function) => target,
  Injectable: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ChangeDetectionStrategy: { OnPush: 1 },
  ViewEncapsulation: { None: 2 },
  OnInit: class {},
  NgZone: class { run(fn: Function) { return fn(); } },
}));

vi.mock('@memberjunction/ng-base-types', () => {
  class MockBaseAngularComponent {
    Provider: unknown = null;
    get ProviderToUse() { return this.Provider; }
  }
  return { BaseAngularComponent: MockBaseAngularComponent };
});

vi.mock('@angular/platform-browser', () => ({
  DomSanitizer: class {
    bypassSecurityTrustHtml(html: string) { return html; }
  },
}));

vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  CompositeKey: class {},
  EntityFieldInfo: class {},
  EntityFieldTSType: { Boolean: 'boolean', Date: 'Date', Number: 'number', String: 'string' },
  Metadata: class {},
  RunView: class {
    RunView = vi.fn().mockResolvedValue({ Success: true, Results: [] });
  },
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJRecordChangeEntity: class {},
}));

vi.mock('@memberjunction/ng-notifications', () => ({
  MJNotificationService: class {
    CreateSimpleNotification = vi.fn();
  },
}));

vi.mock('diff', () => ({
  diffChars: vi.fn(() => []),
  diffWords: vi.fn(() => []),
}));

describe('RecordChangesComponent utility methods', () => {
  let component: InstanceType<typeof import('../ng-record-changes.component').RecordChangesComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../ng-record-changes.component');
    const { ChangeDetectorRef } = await import('@angular/core');
    const { MJNotificationService } = await import('@memberjunction/ng-notifications');
    const { DomSanitizer } = await import('@angular/platform-browser');
    const { NgZone } = await import('@angular/core');
    component = new mod.RecordChangesComponent(
      { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as InstanceType<typeof ChangeDetectorRef>,
      { run: (fn: () => void) => fn() } as unknown as InstanceType<typeof NgZone>,
      {} as InstanceType<typeof MJNotificationService>,
      { bypassSecurityTrustHtml: (v: string) => v } as unknown as InstanceType<typeof DomSanitizer>,
    );
  });

  describe('getChangeTypeCardClass', () => {
    it('should return correct class for Create', () => {
      expect(component.getChangeTypeCardClass('Create')).toBe('type-create');
    });

    it('should return correct class for Update', () => {
      expect(component.getChangeTypeCardClass('Update')).toBe('type-update');
    });

    it('should return correct class for Delete', () => {
      expect(component.getChangeTypeCardClass('Delete')).toBe('type-delete');
    });

    it('should return type-update for unknown type', () => {
      expect(component.getChangeTypeCardClass('Other')).toBe('type-update');
    });
  });

  describe('getChangeTypeBadgeText', () => {
    it('should return Created for Create', () => {
      expect(component.getChangeTypeBadgeText('Create')).toBe('Created');
    });

    it('should return Update for Update', () => {
      expect(component.getChangeTypeBadgeText('Update')).toBe('Update');
    });

    it('should return Deleted for Delete', () => {
      expect(component.getChangeTypeBadgeText('Delete')).toBe('Deleted');
    });
  });

  describe('getSourceClass', () => {
    it('should return source-internal for Internal', () => {
      expect(component.getSourceClass('Internal')).toBe('source-internal');
    });

    it('should return source-external for External', () => {
      expect(component.getSourceClass('External')).toBe('source-external');
    });
  });

  describe('getStatusClass', () => {
    it('should return status-complete for Complete', () => {
      expect(component.getStatusClass('Complete')).toBe('status-complete');
    });

    it('should return status-pending for Pending', () => {
      expect(component.getStatusClass('Pending')).toBe('status-pending');
    });

    it('should return status-error for Error', () => {
      expect(component.getStatusClass('Error')).toBe('status-error');
    });

    it('should return status-unknown for unknown status', () => {
      expect(component.getStatusClass('Other')).toBe('status-unknown');
    });
  });

  describe('getLabelStatusClass', () => {
    it('should return correct classes for Active/Archived/Restored', () => {
      expect(component.getLabelStatusClass('Active')).toBe('label-status-active');
      expect(component.getLabelStatusClass('Archived')).toBe('label-status-archived');
      expect(component.getLabelStatusClass('Restored')).toBe('label-status-restored');
      expect(component.getLabelStatusClass('Unknown')).toBe('');
    });
  });

  describe('getUserInitials', () => {
    it('should extract initials from email', () => {
      expect(component.getUserInitials('amith@bluecypress.io')).toBe('AM');
    });

    it('should extract initials from name', () => {
      expect(component.getUserInitials('John Doe')).toBe('JD');
    });

    it('should handle single word', () => {
      expect(component.getUserInitials('admin')).toBe('AD');
    });

    it('should handle null', () => {
      expect(component.getUserInitials(null)).toBe('?');
    });
  });

  describe('getUserDisplayName', () => {
    it('should extract local part from email', () => {
      expect(component.getUserDisplayName('amith@bluecypress.io')).toBe('amith');
    });

    it('should return name as-is', () => {
      expect(component.getUserDisplayName('John Doe')).toBe('John Doe');
    });

    it('should return Unknown for null', () => {
      expect(component.getUserDisplayName(null)).toBe('Unknown');
    });
  });

  describe('Conditional pill filters', () => {
    it('starts in "All" mode (no conditional pills selected)', () => {
      component.viewData = [];
      expect(component.IsAllSelected).toBe(true);
    });

    it('TogglePill toggles a pill on then off', () => {
      component.viewData = [];
      component.ChipSelections = { Update: false };
      component.TogglePill('Update');
      expect(component.ChipSelections['Update']).toBe(true);
      component.TogglePill('Update');
      expect(component.ChipSelections['Update']).toBe(false);
    });

    it('SelectAllPill clears every conditional selection', () => {
      component.viewData = [];
      component.ChipSelections = { Update: true, Create: true };
      component.SelectAllPill();
      expect(component.ChipSelections['Update']).toBe(false);
      expect(component.ChipSelections['Create']).toBe(false);
      expect(component.IsAllSelected).toBe(true);
    });
  });

  describe('formatRelativeTime', () => {
    it('should return "Just now" for very recent dates', () => {
      const now = new Date();
      expect(component.formatRelativeTime(now)).toBe('Just now');
    });

    it('should return minutes for recent dates', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(component.formatRelativeTime(fiveMinutesAgo)).toBe('5 mins ago');
    });

    it('should return hours for older dates', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      expect(component.formatRelativeTime(threeHoursAgo)).toBe('3 hours ago');
    });

    it('should return days for dates within a week', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(component.formatRelativeTime(twoDaysAgo)).toBe('2 days ago');
    });

    it('should return formatted date for older dates', () => {
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = component.formatRelativeTime(oldDate);
      expect(result).not.toContain('ago');
    });
  });

  describe('formatFullDateTime', () => {
    it('should format date with all parts', () => {
      const date = new Date('2025-03-15T14:30:00Z');
      const result = component.formatFullDateTime(date);
      expect(result).toContain('2025');
      expect(result).toContain('15');
    });
  });

  describe('formatTime', () => {
    it('should format time in 12-hour format', () => {
      const date = new Date('2025-03-15T14:30:00');
      const result = component.formatTime(date);
      expect(result).toContain('2:30');
      expect(result).toContain('PM');
    });
  });

  describe('toggleExpansion', () => {
    it('should add ID to expanded set', () => {
      component.toggleExpansion('change-1');
      expect(component.expandedItems.has('change-1')).toBe(true);
    });

    it('should remove ID from expanded set on second toggle', () => {
      component.toggleExpansion('change-1');
      component.toggleExpansion('change-1');
      expect(component.expandedItems.has('change-1')).toBe(false);
    });
  });

  describe('ClearFilters', () => {
    it('should reset all filter state', () => {
      component.searchTerm = 'test';
      component.ChipSelections = { Update: true, Restore: true };
      component.viewData = [];

      component.ClearFilters();

      expect(component.searchTerm).toBe('');
      expect(component.ChipSelections['Update']).toBe(false);
      expect(component.ChipSelections['Restore']).toBe(false);
      expect(component.IsAllSelected).toBe(true);
    });
  });

  describe('getChangeSummary', () => {
    it('should return "Record created" for Create type', () => {
      const change = { Type: 'Create', ChangesJSON: '{}', ChangesDescription: '' };
      expect(component.getChangeSummary(change as never)).toBe('Record created');
    });

    it('should return "Record deleted" for Delete type', () => {
      const change = { Type: 'Delete', ChangesJSON: '{}', ChangesDescription: '' };
      expect(component.getChangeSummary(change as never)).toBe('Record deleted');
    });
  });

  // PR #2841 precompute: viewDataById is rebuilt on each data load so the lineage
  // chip's source lookup is an O(1) NormalizeUUID-keyed Map read instead of an
  // O(N) scan per CD pass. These tests pin the rebuild trigger + the case-variant
  // (SQL upper vs Postgres lower) UUID resolution that NormalizeUUID guarantees.
  describe('viewDataById / getRestoredFromSourceChange (lineage lookup precompute)', () => {
    type Change = { ID: string; RestoredFromID?: string | null; Source?: string };

    /** Call the private rebuild — the real component invokes it inside LoadRecordChanges. */
    function rebuild(): void {
      (component as unknown as { rebuildViewDataIndex: () => void }).rebuildViewDataIndex();
    }

    function setData(rows: Change[]): void {
      component.viewData = rows as never;
      rebuild();
    }

    it('resolves a restore row to its source change (O(1) Map read)', () => {
      const source: Change = { ID: 'AAAAAAAA-1111-2222-3333-444444444444' };
      const restore: Change = { ID: 'BBBBBBBB-0000-0000-0000-000000000000', RestoredFromID: source.ID };
      setData([source, restore]);

      expect(component.getRestoredFromSourceChange(restore as never)).toBe(source as never);
    });

    it('returns null when this row is NOT a restore (no RestoredFromID)', () => {
      const plain: Change = { ID: 'CCCCCCCC-1111-2222-3333-444444444444' };
      setData([plain]);
      expect(component.getRestoredFromSourceChange(plain as never)).toBeNull();
    });

    it('returns null when the source change is not in the loaded history (pruned)', () => {
      const restore: Change = { ID: 'DDDDDDDD-0000-0000-0000-000000000000', RestoredFromID: 'EEEEEEEE-9999-9999-9999-999999999999' };
      setData([restore]); // the referenced source row is absent
      expect(component.getRestoredFromSourceChange(restore as never)).toBeNull();
    });

    it('resolves across UUID case variance (SQL upper RestoredFromID → Postgres lower stored ID)', () => {
      // Source stored lowercase (Postgres style); restore references it uppercase (SQL style).
      const source: Change = { ID: 'ff112233-aabb-ccdd-eeff-001122334455' };
      const restore: Change = { ID: 'AB000000-0000-0000-0000-000000000001', RestoredFromID: 'FF112233-AABB-CCDD-EEFF-001122334455' };
      setData([source, restore]);

      // Without NormalizeUUID keying this would miss; with it, the case difference is erased.
      expect(component.getRestoredFromSourceChange(restore as never)).toBe(source as never);
    });

    it('rebuilds the index on each data load — a stale source from a prior load does not leak', () => {
      const oldSource: Change = { ID: '11111111-1111-1111-1111-111111111111' };
      const restore: Change = { ID: '22222222-2222-2222-2222-222222222222', RestoredFromID: oldSource.ID };
      setData([oldSource, restore]);
      expect(component.getRestoredFromSourceChange(restore as never)).toBe(oldSource as never);

      // New load WITHOUT the old source row — the rebuilt index must forget it.
      setData([restore]);
      expect(component.getRestoredFromSourceChange(restore as never)).toBeNull();
    });

    it('last-writer-wins on duplicate IDs in the loaded set (Map semantics)', () => {
      const first: Change = { ID: 'DEAD0000-0000-0000-0000-000000000000', Source: 'A' };
      const second: Change = { ID: 'dead0000-0000-0000-0000-000000000000', Source: 'B' };
      const restore: Change = { ID: '99999999-9999-9999-9999-999999999999', RestoredFromID: 'DEAD0000-0000-0000-0000-000000000000' };
      setData([first, second, restore]);
      // both normalize to the same key — the later insertion wins
      expect(component.getRestoredFromSourceChange(restore as never)).toBe(second as never);
    });
  });
});

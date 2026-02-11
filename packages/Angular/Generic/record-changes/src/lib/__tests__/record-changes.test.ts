/**
 * Tests for record-changes package:
 * - RecordChangesComponent utility methods (pure functions)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular
vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  Injectable: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ChangeDetectionStrategy: { OnPush: 1 },
  ViewEncapsulation: { None: 2 },
  OnInit: class {},
}));

vi.mock('@angular/platform-browser', () => ({
  DomSanitizer: class {
    bypassSecurityTrustHtml(html: string) { return html; }
  },
}));

vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  CompositeKey: class {},
  EntityFieldInfo: class {},
  EntityFieldTSType: { Boolean: 'boolean' },
  Metadata: class {},
  RunView: class {
    RunView = vi.fn().mockResolvedValue({ Success: true, Results: [] });
  },
}));

vi.mock('@memberjunction/core-entities', () => ({
  RecordChangeEntity: class {},
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

  describe('getChangeTypeClass', () => {
    it('should return correct class for Create', () => {
      expect(component.getChangeTypeClass('Create')).toBe('change-create');
    });

    it('should return correct class for Update', () => {
      expect(component.getChangeTypeClass('Update')).toBe('change-update');
    });

    it('should return correct class for Delete', () => {
      expect(component.getChangeTypeClass('Delete')).toBe('change-delete');
    });

    it('should return change-unknown for unknown type', () => {
      expect(component.getChangeTypeClass('Other')).toBe('change-unknown');
    });
  });

  describe('getChangeTypeIcon', () => {
    it('should return fa-plus for Create', () => {
      expect(component.getChangeTypeIcon('Create')).toBe('fa-solid fa-plus');
    });

    it('should return fa-edit for Update', () => {
      expect(component.getChangeTypeIcon('Update')).toBe('fa-solid fa-edit');
    });

    it('should return fa-trash for Delete', () => {
      expect(component.getChangeTypeIcon('Delete')).toBe('fa-solid fa-trash');
    });

    it('should return fa-question for unknown', () => {
      expect(component.getChangeTypeIcon('Unknown')).toBe('fa-solid fa-question');
    });
  });

  describe('getChangeTypeBadgeClass', () => {
    it('should return badge-create for Create', () => {
      expect(component.getChangeTypeBadgeClass('Create')).toBe('badge-create');
    });

    it('should return badge-update for Update', () => {
      expect(component.getChangeTypeBadgeClass('Update')).toBe('badge-update');
    });

    it('should return badge-delete for Delete', () => {
      expect(component.getChangeTypeBadgeClass('Delete')).toBe('badge-delete');
    });

    it('should return badge-unknown for unknown', () => {
      expect(component.getChangeTypeBadgeClass('Other')).toBe('badge-unknown');
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
      // Should be a formatted date string
      expect(result).not.toContain('ago');
    });
  });

  describe('formatFullDateTime', () => {
    it('should format date with all parts', () => {
      const date = new Date('2025-03-15T14:30:00Z');
      const result = component.formatFullDateTime(date);
      // Should include month, day, year, hour, minute
      expect(result).toContain('2025');
      expect(result).toContain('15');
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
      component.selectedType = 'Update';
      component.selectedSource = 'Internal';
      component.viewData = [];

      component.ClearFilters();

      expect(component.searchTerm).toBe('');
      expect(component.selectedType).toBe('');
      expect(component.selectedSource).toBe('');
    });
  });

  describe('getChangeSummary', () => {
    it('should return "Record was created" for Create type', () => {
      const change = { Type: 'Create', ChangesJSON: '{}', ChangesDescription: '' };
      expect(component.getChangeSummary(change as never)).toBe('Record was created');
    });

    it('should return "Record was deleted" for Delete type', () => {
      const change = { Type: 'Delete', ChangesJSON: '{}', ChangesDescription: '' };
      expect(component.getChangeSummary(change as never)).toBe('Record was deleted');
    });
  });
});

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
  NgZone: class { run(fn: Function) { return fn(); } },
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
  EntityFieldTSType: { Boolean: 'boolean', Date: 'Date', Number: 'number', String: 'string' },
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

  describe('SetTypeFilter', () => {
    it('should set type filter', () => {
      component.viewData = [];
      component.SetTypeFilter('Update');
      expect(component.selectedType).toBe('Update');
    });

    it('should toggle off when same filter clicked', () => {
      component.viewData = [];
      component.SetTypeFilter('Update');
      component.SetTypeFilter('Update');
      expect(component.selectedType).toBe('');
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
    it('should return "Record created" for Create type', () => {
      const change = { Type: 'Create', ChangesJSON: '{}', ChangesDescription: '' };
      expect(component.getChangeSummary(change as never)).toBe('Record created');
    });

    it('should return "Record deleted" for Delete type', () => {
      const change = { Type: 'Delete', ChangesJSON: '{}', ChangesDescription: '' };
      expect(component.getChangeSummary(change as never)).toBe('Record deleted');
    });
  });
});

/**
 * Tests for form-toolbar package:
 * - FormToolbarComponent property logic
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  ContentChild: () => () => {},
  ElementRef: class {},
  OnInit: class {},
  EventEmitter: class { emit() {} },
}));

vi.mock('@angular/router', () => ({
  Router: class { navigate = vi.fn(); },
}));

vi.mock('@memberjunction/ng-base-forms', () => ({
  BaseFormComponent: class {
    record = {
      PrimaryKey: { ToString: () => 'pk-1', ToConcatenatedString: () => 'pk-1' },
      EntityInfo: { ID: 'e-1', Name: 'TestEntity', NameField: { Name: 'Name' }, CascadeDeletes: false },
      Get: vi.fn(() => 'RecordName'),
      IsSaved: true,
      LatestResult: null,
    };
    SaveRecord = vi.fn().mockResolvedValue(true);
    GetRecordDependencies = vi.fn().mockResolvedValue([]);
    GetListsCanAddTo = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock('@memberjunction/ng-shared', () => ({
  EventCodes: { PushStatusUpdates: 'PushStatusUpdates', CloseCurrentTab: 'CloseCurrentTab' },
  SharedService: {
    Instance: {
      CreateSimpleNotification: vi.fn(),
      InvokeManualResize: vi.fn(),
    }
  },
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  CompositeKey: class {},
  BaseEntity: class {},
  LogError: vi.fn(),
  RunView: class {
    RunView = vi.fn().mockResolvedValue({ Success: true, Results: [] });
  },
  RecordDependency: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  ListEntity: class {},
  ListDetailEntity: class {},
  ListDetailEntityExtended: class {
    static BuildRecordID = vi.fn(() => 'record-id');
    NewRecord = vi.fn();
    Save = vi.fn().mockResolvedValue(true);
  },
}));

vi.mock('@memberjunction/global', () => ({
  MJEvent: class {},
  MJEventType: { ComponentEvent: 'ComponentEvent' },
  MJGlobal: {
    Instance: {
      RaiseEvent: vi.fn(),
      GetEventListener: vi.fn(() => ({ subscribe: vi.fn() })),
    }
  },
}));

vi.mock('@memberjunction/ng-list-management', () => ({
  ListManagementDialogConfig: class {},
  ListManagementResult: class {},
}));

describe('FormToolbarComponent', () => {
  let component: InstanceType<typeof import('../lib/form-toolbar').FormToolbarComponent>;

  beforeEach(async () => {
    const mod = await import('../lib/form-toolbar');
    const { Router } = await import('@angular/router');
    component = new mod.FormToolbarComponent(new Router() as never);
  });

  describe('CurrentlyDisabled', () => {
    it('should return false when both Disabled and _currentlyDisabled are false', () => {
      component.Disabled = false;
      component._currentlyDisabled = false;
      expect(component.CurrentlyDisabled).toBe(false);
    });

    it('should return false when Disabled is false', () => {
      component.Disabled = false;
      component._currentlyDisabled = true;
      expect(component.CurrentlyDisabled).toBe(false);
    });

    it('should return true only when both are true', () => {
      component.Disabled = true;
      component._currentlyDisabled = true;
      expect(component.CurrentlyDisabled).toBe(true);
    });
  });

  describe('ShowSkipChat', () => {
    it('should toggle skip chat dialog visibility', () => {
      expect(component._skipChatDialogVisible).toBe(false);
      component.ShowSkipChat();
      expect(component._skipChatDialogVisible).toBe(true);
      component.ShowSkipChat();
      expect(component._skipChatDialogVisible).toBe(false);
    });
  });

  describe('toggleDeleteDialog', () => {
    it('should set delete dialog visibility', () => {
      component.toggleDeleteDialog(true);
      expect(component._deleteDialogVisible).toBe(true);
      component.toggleDeleteDialog(false);
      expect(component._deleteDialogVisible).toBe(false);
    });
  });

  describe('default input values', () => {
    it('should have ShowSkipChatButton true by default', () => {
      expect(component.ShowSkipChatButton).toBe(true);
    });

    it('should have Disabled false by default', () => {
      expect(component.Disabled).toBe(false);
    });

    it('should use enhanced list dialog by default', () => {
      expect(component.useEnhancedListDialog).toBe(true);
    });
  });

  describe('onEnhancedListDialogCancel', () => {
    it('should hide dialog and clear config', () => {
      component.showEnhancedListDialog = true;
      component.listManagementConfig = {} as never;

      component.onEnhancedListDialogCancel();

      expect(component.showEnhancedListDialog).toBe(false);
      expect(component.listManagementConfig).toBeNull();
    });
  });
});

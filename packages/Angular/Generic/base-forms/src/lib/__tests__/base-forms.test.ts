/**
 * Tests for base-forms package:
 * - BaseFormSectionInfo
 * - FormState interfaces and defaults
 * - FormStateService (state management logic)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular
vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
  Component: () => (target: Function) => target,
  Directive: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ViewChild: () => () => {},
  ContentChild: () => () => {},
  ContentChildren: () => () => {},
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ChangeDetectionStrategy: { OnPush: 1 },
  ElementRef: class {},
  Injector: class {},
  ViewContainerRef: class {},
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: class {
    CurrentUser = { ID: 'user-123' };
  },
  BaseEntity: class {},
  RunView: class {},
  CompositeKey: class {},
  EntityField: class {},
  EntityFieldInfo: class {},
  EntityInfo: class {},
  LogError: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    Instance: {
      UserSettings: [],
      GetSetting: vi.fn(),
      SetSetting: vi.fn(),
      SetSettingDebounced: vi.fn(),
    }
  },
}));

vi.mock('rxjs', async () => {
  const actual = await vi.importActual<typeof import('rxjs')>('rxjs');
  return actual;
});

// ======================= BaseFormSectionInfo =======================
describe('BaseFormSectionInfo', () => {
  let BaseFormSectionInfo: typeof import('../base-form-section-info').BaseFormSectionInfo;

  beforeEach(async () => {
    const mod = await import('../base-form-section-info');
    BaseFormSectionInfo = mod.BaseFormSectionInfo;
  });

  it('should create with required parameters', () => {
    const info = new BaseFormSectionInfo('details', 'Details');
    expect(info.sectionKey).toBe('details');
    expect(info.sectionName).toBe('Details');
    expect(info.isExpanded).toBe(false);
    expect(info.rowCount).toBeUndefined();
    expect(info.metadata).toBeUndefined();
  });

  it('should create with all parameters', () => {
    const info = new BaseFormSectionInfo('related', 'Related Records', true, 42, { custom: true });
    expect(info.sectionKey).toBe('related');
    expect(info.sectionName).toBe('Related Records');
    expect(info.isExpanded).toBe(true);
    expect(info.rowCount).toBe(42);
    expect(info.metadata).toEqual({ custom: true });
  });

  it('should default isExpanded to false', () => {
    const info = new BaseFormSectionInfo('section', 'Section');
    expect(info.isExpanded).toBe(false);
  });
});

// ======================= FormState defaults =======================
describe('FormState defaults', () => {
  it('should have expected default values', async () => {
    const { DEFAULT_FORM_STATE, DEFAULT_SECTION_STATE } = await import('../form-state.interface');

    expect(DEFAULT_FORM_STATE.sections).toEqual({});
    expect(DEFAULT_FORM_STATE.showEmptyFields).toBe(false);
    expect(DEFAULT_FORM_STATE.widthMode).toBe('centered');
    expect(DEFAULT_FORM_STATE.sectionOrder).toBeUndefined();

    expect(DEFAULT_SECTION_STATE.isExpanded).toBe(true);
  });
});

// ======================= FormStateService =======================
describe('FormStateService', () => {
  let service: InstanceType<typeof import('../form-state.service').FormStateService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../form-state.service');
    service = new mod.FormStateService();
  });

  describe('getCurrentState', () => {
    it('should return default state for unknown entity', () => {
      const state = service.getCurrentState('TestEntity');
      expect(state.sections).toEqual({});
      expect(state.showEmptyFields).toBe(false);
      expect(state.widthMode).toBe('centered');
    });
  });

  describe('getSectionState', () => {
    it('should return default section state for unknown section', () => {
      const sectionState = service.getSectionState('TestEntity', 'details');
      expect(sectionState.isExpanded).toBe(true);
    });
  });

  describe('isSectionExpanded', () => {
    it('should return default when no persisted state', () => {
      expect(service.isSectionExpanded('TestEntity', 'details')).toBe(true);
    });

    it('should respect custom default when no persisted state', () => {
      expect(service.isSectionExpanded('TestEntity', 'details', false)).toBe(false);
    });

    it('should return persisted value when state exists', () => {
      service.setSectionExpanded('TestEntity', 'details', false);
      expect(service.isSectionExpanded('TestEntity', 'details')).toBe(false);
    });
  });

  describe('setSectionExpanded', () => {
    it('should update section expanded state', () => {
      service.setSectionExpanded('TestEntity', 'details', false);
      expect(service.isSectionExpanded('TestEntity', 'details')).toBe(false);

      service.setSectionExpanded('TestEntity', 'details', true);
      expect(service.isSectionExpanded('TestEntity', 'details')).toBe(true);
    });
  });

  describe('toggleSection', () => {
    it('should toggle section expanded state', () => {
      // Default is expanded (true)
      expect(service.isSectionExpanded('TestEntity', 'sec1')).toBe(true);

      service.toggleSection('TestEntity', 'sec1');
      expect(service.isSectionExpanded('TestEntity', 'sec1')).toBe(false);

      service.toggleSection('TestEntity', 'sec1');
      expect(service.isSectionExpanded('TestEntity', 'sec1')).toBe(true);
    });
  });

  describe('widthMode', () => {
    it('should default to centered', () => {
      expect(service.getWidthMode('TestEntity')).toBe('centered');
    });

    it('should set width mode', () => {
      service.setWidthMode('TestEntity', 'full-width');
      expect(service.getWidthMode('TestEntity')).toBe('full-width');
    });

    it('should toggle width mode', () => {
      service.toggleWidthMode('TestEntity');
      expect(service.getWidthMode('TestEntity')).toBe('full-width');

      service.toggleWidthMode('TestEntity');
      expect(service.getWidthMode('TestEntity')).toBe('centered');
    });
  });

  describe('showEmptyFields', () => {
    it('should default to false', () => {
      expect(service.getShowEmptyFields('TestEntity')).toBe(false);
    });

    it('should set showEmptyFields', () => {
      service.setShowEmptyFields('TestEntity', true);
      expect(service.getShowEmptyFields('TestEntity')).toBe(true);
    });
  });

  describe('expandAllSections / collapseAllSections', () => {
    it('should expand all sections', () => {
      const keys = ['sec1', 'sec2', 'sec3'];
      // Collapse some first
      service.setSectionExpanded('TestEntity', 'sec1', false);
      service.setSectionExpanded('TestEntity', 'sec2', false);

      service.expandAllSections('TestEntity', keys);
      keys.forEach(key => {
        expect(service.isSectionExpanded('TestEntity', key)).toBe(true);
      });
    });

    it('should collapse all sections', () => {
      const keys = ['sec1', 'sec2', 'sec3'];
      service.collapseAllSections('TestEntity', keys);
      keys.forEach(key => {
        expect(service.isSectionExpanded('TestEntity', key)).toBe(false);
      });
    });
  });

  describe('sectionOrder', () => {
    it('should return undefined by default', () => {
      expect(service.getSectionOrder('TestEntity')).toBeUndefined();
    });

    it('should set custom section order', () => {
      const order = ['sec3', 'sec1', 'sec2'];
      service.setSectionOrder('TestEntity', order);
      expect(service.getSectionOrder('TestEntity')).toEqual(order);
    });

    it('should detect custom section order', () => {
      expect(service.hasCustomSectionOrder('TestEntity')).toBe(false);

      service.setSectionOrder('TestEntity', ['sec1', 'sec2']);
      expect(service.hasCustomSectionOrder('TestEntity')).toBe(true);
    });

    it('should reset section order', () => {
      service.setSectionOrder('TestEntity', ['sec1', 'sec2']);
      service.resetSectionOrder('TestEntity');
      expect(service.getSectionOrder('TestEntity')).toBeUndefined();
    });
  });

  describe('getExpandedCount', () => {
    it('should count expanded sections', () => {
      const keys = ['sec1', 'sec2', 'sec3'];
      // Default is all expanded
      expect(service.getExpandedCount('TestEntity', keys)).toBe(3);

      service.setSectionExpanded('TestEntity', 'sec1', false);
      expect(service.getExpandedCount('TestEntity', keys)).toBe(2);
    });
  });

  describe('resetToDefaults', () => {
    it('should reset all state for entity', () => {
      service.setSectionExpanded('TestEntity', 'sec1', false);
      service.setWidthMode('TestEntity', 'full-width');
      service.setShowEmptyFields('TestEntity', true);

      service.resetToDefaults('TestEntity');

      expect(service.getCurrentState('TestEntity').sections).toEqual({});
      expect(service.getWidthMode('TestEntity')).toBe('centered');
      expect(service.getShowEmptyFields('TestEntity')).toBe(false);
    });
  });

  describe('getState$ (observable)', () => {
    it('should emit state changes', async () => {
      const states: Array<{ widthMode: string }> = [];
      const sub = service.getState$('TestEntity').subscribe(s => states.push(s));

      // Initial state emission
      expect(states.length).toBeGreaterThanOrEqual(1);
      expect(states[0].widthMode).toBe('centered');

      service.setWidthMode('TestEntity', 'full-width');
      expect(states[states.length - 1].widthMode).toBe('full-width');

      sub.unsubscribe();
    });
  });
});

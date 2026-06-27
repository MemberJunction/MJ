/**
 * Tests for EntityFormConfig presets and the pure resolution helpers used by
 * MjRecordFormContainerComponent to bridge per-instance config onto the
 * toolbar + section visibility (the no-regeneration mechanism).
 */
import { describe, it, expect } from 'vitest';
import {
  SectionVisibilityRules,
  TAB_FORM_CONFIG,
  DIALOG_FORM_CONFIG,
  SLIDEIN_FORM_CONFIG,
  ResolveFormShowToolbar,
  ResolveFormToolbarConfig,
  IsFormSectionHidden,
} from '../types/entity-form-config';
import { DEFAULT_TOOLBAR_CONFIG } from '../types/toolbar-config';

describe('EntityFormConfig presets', () => {
  it('tab preset keeps the toolbar and related entities', () => {
    expect(TAB_FORM_CONFIG.Toolbar).toBeUndefined();
    expect(TAB_FORM_CONFIG.ShowRelatedEntities).toBe(true);
    expect(TAB_FORM_CONFIG.EnableRecordLinks).toBe(true);
    expect(TAB_FORM_CONFIG.WidthMode).toBe('centered');
  });

  it('dialog preset hides the toolbar, related entities, and links', () => {
    expect(DIALOG_FORM_CONFIG.Toolbar).toBeNull();
    expect(DIALOG_FORM_CONFIG.ShowRelatedEntities).toBe(false);
    expect(DIALOG_FORM_CONFIG.EnableRecordLinks).toBe(false);
    expect(DIALOG_FORM_CONFIG.WidthMode).toBe('centered');
  });

  it('slide-in preset matches the dialog preset but is full-width', () => {
    expect(SLIDEIN_FORM_CONFIG.Toolbar).toBeNull();
    expect(SLIDEIN_FORM_CONFIG.ShowRelatedEntities).toBe(false);
    expect(SLIDEIN_FORM_CONFIG.WidthMode).toBe('full-width');
  });

  it('presets are distinct objects (no shared mutation)', () => {
    expect(DIALOG_FORM_CONFIG).not.toBe(SLIDEIN_FORM_CONFIG);
    expect(TAB_FORM_CONFIG).not.toBe(DIALOG_FORM_CONFIG);
  });
});

describe('ResolveFormShowToolbar', () => {
  it('shows toolbar when no config', () => {
    expect(ResolveFormShowToolbar(null)).toBe(true);
    expect(ResolveFormShowToolbar(undefined)).toBe(true);
  });

  it('shows toolbar when Toolbar is undefined (tab default)', () => {
    expect(ResolveFormShowToolbar({ })).toBe(true);
    expect(ResolveFormShowToolbar(TAB_FORM_CONFIG)).toBe(true);
  });

  it('hides toolbar only when explicitly null', () => {
    expect(ResolveFormShowToolbar(DIALOG_FORM_CONFIG)).toBe(false);
    expect(ResolveFormShowToolbar({ Toolbar: null })).toBe(false);
  });

  it('shows toolbar when a partial override is supplied', () => {
    expect(ResolveFormShowToolbar({ Toolbar: { ShowDeleteButton: false } })).toBe(true);
  });
});

describe('ResolveFormToolbarConfig', () => {
  it('returns base unchanged when no override', () => {
    expect(ResolveFormToolbarConfig(DEFAULT_TOOLBAR_CONFIG, null)).toBe(DEFAULT_TOOLBAR_CONFIG);
    expect(ResolveFormToolbarConfig(DEFAULT_TOOLBAR_CONFIG, { Toolbar: null })).toBe(DEFAULT_TOOLBAR_CONFIG);
  });

  it('merges a partial override over the base', () => {
    const merged = ResolveFormToolbarConfig(DEFAULT_TOOLBAR_CONFIG, { Toolbar: { ShowDeleteButton: false } });
    expect(merged.ShowDeleteButton).toBe(false);
    // untouched keys retain base values
    expect(merged.ShowEditButton).toBe(DEFAULT_TOOLBAR_CONFIG.ShowEditButton);
    // base object not mutated
    expect(DEFAULT_TOOLBAR_CONFIG.ShowDeleteButton).toBe(true);
  });
});

describe('IsFormSectionHidden', () => {
  // IsFormSectionHidden operates on the structural SectionVisibilityRules shape
  // (which matches the camelCase FormContext that panels receive at runtime).
  const related = 'related-entity';

  it('hides nothing when no config', () => {
    expect(IsFormSectionHidden(null, 'details', undefined)).toBe(false);
  });

  it('hides related-entity panels when showRelatedEntities is false', () => {
    const cfg: SectionVisibilityRules = { showRelatedEntities: false };
    expect(IsFormSectionHidden(cfg, 'orders', related)).toBe(true);
    expect(IsFormSectionHidden(cfg, 'details', 'default')).toBe(false);
  });

  it('honors hiddenSectionKeys', () => {
    const cfg: SectionVisibilityRules = { hiddenSectionKeys: ['systemMetadata'] };
    expect(IsFormSectionHidden(cfg, 'systemMetadata', 'default')).toBe(true);
    expect(IsFormSectionHidden(cfg, 'details', 'default')).toBe(false);
  });

  it('honors visibleSectionKeys allow-list (and it wins over hidden)', () => {
    const cfg: SectionVisibilityRules = { visibleSectionKeys: ['details'], hiddenSectionKeys: ['details'] };
    expect(IsFormSectionHidden(cfg, 'details', 'default')).toBe(false);
    expect(IsFormSectionHidden(cfg, 'other', 'default')).toBe(true);
  });

  it('allow-list still hides related panels not on the list', () => {
    const cfg: SectionVisibilityRules = { visibleSectionKeys: ['details'] };
    expect(IsFormSectionHidden(cfg, 'orders', related)).toBe(true);
  });
});

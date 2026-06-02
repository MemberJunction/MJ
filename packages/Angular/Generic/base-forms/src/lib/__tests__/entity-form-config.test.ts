/**
 * Tests for EntityFormConfig presets and the pure resolution helpers used by
 * MjRecordFormContainerComponent to bridge per-instance config onto the
 * toolbar + section visibility (the no-regeneration mechanism).
 */
import { describe, it, expect } from 'vitest';
import {
  EntityFormConfig,
  TAB_FORM_CONFIG,
  DIALOG_FORM_CONFIG,
  SLIDEIN_FORM_CONFIG,
  resolveFormShowToolbar,
  resolveFormToolbarConfig,
  isFormSectionHidden,
} from '../types/entity-form-config';
import { DEFAULT_TOOLBAR_CONFIG } from '../types/toolbar-config';

describe('EntityFormConfig presets', () => {
  it('tab preset keeps the toolbar and related entities', () => {
    expect(TAB_FORM_CONFIG.toolbar).toBeUndefined();
    expect(TAB_FORM_CONFIG.showRelatedEntities).toBe(true);
    expect(TAB_FORM_CONFIG.enableRecordLinks).toBe(true);
    expect(TAB_FORM_CONFIG.widthMode).toBe('centered');
  });

  it('dialog preset hides the toolbar, related entities, and links', () => {
    expect(DIALOG_FORM_CONFIG.toolbar).toBeNull();
    expect(DIALOG_FORM_CONFIG.showRelatedEntities).toBe(false);
    expect(DIALOG_FORM_CONFIG.enableRecordLinks).toBe(false);
    expect(DIALOG_FORM_CONFIG.widthMode).toBe('centered');
  });

  it('slide-in preset matches the dialog preset but is full-width', () => {
    expect(SLIDEIN_FORM_CONFIG.toolbar).toBeNull();
    expect(SLIDEIN_FORM_CONFIG.showRelatedEntities).toBe(false);
    expect(SLIDEIN_FORM_CONFIG.widthMode).toBe('full-width');
  });

  it('presets are distinct objects (no shared mutation)', () => {
    expect(DIALOG_FORM_CONFIG).not.toBe(SLIDEIN_FORM_CONFIG);
    expect(TAB_FORM_CONFIG).not.toBe(DIALOG_FORM_CONFIG);
  });
});

describe('resolveFormShowToolbar', () => {
  it('shows toolbar when no config', () => {
    expect(resolveFormShowToolbar(null)).toBe(true);
    expect(resolveFormShowToolbar(undefined)).toBe(true);
  });

  it('shows toolbar when toolbar is undefined (tab default)', () => {
    expect(resolveFormShowToolbar({ })).toBe(true);
    expect(resolveFormShowToolbar(TAB_FORM_CONFIG)).toBe(true);
  });

  it('hides toolbar only when explicitly null', () => {
    expect(resolveFormShowToolbar(DIALOG_FORM_CONFIG)).toBe(false);
    expect(resolveFormShowToolbar({ toolbar: null })).toBe(false);
  });

  it('shows toolbar when a partial override is supplied', () => {
    expect(resolveFormShowToolbar({ toolbar: { ShowDeleteButton: false } })).toBe(true);
  });
});

describe('resolveFormToolbarConfig', () => {
  it('returns base unchanged when no override', () => {
    expect(resolveFormToolbarConfig(DEFAULT_TOOLBAR_CONFIG, null)).toBe(DEFAULT_TOOLBAR_CONFIG);
    expect(resolveFormToolbarConfig(DEFAULT_TOOLBAR_CONFIG, { toolbar: null })).toBe(DEFAULT_TOOLBAR_CONFIG);
  });

  it('merges a partial override over the base', () => {
    const merged = resolveFormToolbarConfig(DEFAULT_TOOLBAR_CONFIG, { toolbar: { ShowDeleteButton: false } });
    expect(merged.ShowDeleteButton).toBe(false);
    // untouched keys retain base values
    expect(merged.ShowEditButton).toBe(DEFAULT_TOOLBAR_CONFIG.ShowEditButton);
    // base object not mutated
    expect(DEFAULT_TOOLBAR_CONFIG.ShowDeleteButton).toBe(true);
  });
});

describe('isFormSectionHidden', () => {
  const related = 'related-entity';

  it('hides nothing when no config', () => {
    expect(isFormSectionHidden(null, 'details', undefined)).toBe(false);
  });

  it('hides related-entity panels when showRelatedEntities is false', () => {
    const cfg: EntityFormConfig = { showRelatedEntities: false };
    expect(isFormSectionHidden(cfg, 'orders', related)).toBe(true);
    expect(isFormSectionHidden(cfg, 'details', 'default')).toBe(false);
  });

  it('honors hiddenSectionKeys', () => {
    const cfg: EntityFormConfig = { hiddenSectionKeys: ['systemMetadata'] };
    expect(isFormSectionHidden(cfg, 'systemMetadata', 'default')).toBe(true);
    expect(isFormSectionHidden(cfg, 'details', 'default')).toBe(false);
  });

  it('honors visibleSectionKeys allow-list (and it wins over hidden)', () => {
    const cfg: EntityFormConfig = { visibleSectionKeys: ['details'], hiddenSectionKeys: ['details'] };
    expect(isFormSectionHidden(cfg, 'details', 'default')).toBe(false);
    expect(isFormSectionHidden(cfg, 'other', 'default')).toBe(true);
  });

  it('allow-list still hides related panels not on the list', () => {
    const cfg: EntityFormConfig = { visibleSectionKeys: ['details'] };
    expect(isFormSectionHidden(cfg, 'orders', related)).toBe(true);
  });
});

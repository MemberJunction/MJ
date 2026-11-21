/**
 * The record tab's form mode (MJ#4755) lives in its `form` query param — the
 * URL is the source of truth. EntityRecordResource is a thin caller of these
 * decisions: seed the mode from the tab's params, follow later param changes
 * through the host's guarded switch, and write strip switches back.
 */
// ng-shared ships partial-compiled Angular classes — load the JIT compiler
// first (same convention as the other component-importing suites here).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { FormModeFromQueryParams, FormModeQueryParams, IsRecordTabOwner, ReconcileFormMode } from '../record-form-mode';

describe('FormModeFromQueryParams (initial mode)', () => {
  it('is standard for form=standard, so a deep link mounts the standard form directly', () => {
    expect(FormModeFromQueryParams({ form: 'standard' })).toBe('standard');
  });

  it('is default without the param', () => {
    expect(FormModeFromQueryParams({})).toBe('default');
    expect(FormModeFromQueryParams({ form: 'custom' })).toBe('default');
  });
});

describe('FormModeQueryParams (strip write-back)', () => {
  it('writes form=standard for the standard form', () => {
    expect(FormModeQueryParams('standard')).toEqual({ form: 'standard' });
  });

  it('removes the param (null) for the default form', () => {
    expect(FormModeQueryParams('default')).toEqual({ form: null });
  });
});

describe('ReconcileFormMode (later param changes)', () => {
  const switcher = (accepts: boolean) => ({ SwitchFormMode: vi.fn(() => accepts) });

  it('switches the mounted form to standard when form=standard arrives', () => {
    const s = switcher(true);
    const result = ReconcileFormMode({ form: 'standard' }, 'default', s);
    expect(s.SwitchFormMode).toHaveBeenCalledWith('standard');
    expect(result).toEqual({ Mode: 'standard', WriteBack: null });
  });

  it('switches back to default when the param disappears (URL is the source of truth)', () => {
    const s = switcher(true);
    expect(ReconcileFormMode({}, 'standard', s)).toEqual({ Mode: 'default', WriteBack: null });
    expect(s.SwitchFormMode).toHaveBeenCalledWith('default');
  });

  it('a refused switch (unsaved work) keeps the live mode and writes it back so the URL tells the truth', () => {
    const s = switcher(false);
    expect(ReconcileFormMode({}, 'standard', s)).toEqual({ Mode: 'standard', WriteBack: { form: 'standard' } });
    expect(ReconcileFormMode({ form: 'standard' }, 'default', switcher(false))).toEqual({ Mode: 'default', WriteBack: { form: null } });
  });

  it('does nothing when the params already match the live mode', () => {
    const s = switcher(true);
    expect(ReconcileFormMode({ form: 'standard' }, 'standard', s)).toEqual({ Mode: 'standard', WriteBack: null });
    expect(s.SwitchFormMode).not.toHaveBeenCalled();
  });

  it('before the form is mounted, just adopts the requested mode (the input binding carries it)', () => {
    expect(ReconcileFormMode({ form: 'standard' }, 'default', null)).toEqual({ Mode: 'standard', WriteBack: null });
  });
});

// A cached (detached) record component stays subscribed to the tab id it was
// born on. When that tab is reused for another record, `form` deliveries for
// the NEW record must not switch — or warn about — the cached one.
describe('IsRecordTabOwner', () => {
  const own = { Entity: 'Caliber: Assessments', RecordId: 'ID|A' };

  it('owns the tab while the tab hosts this record', () => {
    expect(IsRecordTabOwner({ Entity: 'Caliber: Assessments', RecordId: 'ID|A' }, own)).toBe(true);
  });

  it('tolerates entity casing and whitespace like the rest of the tab identity checks', () => {
    expect(IsRecordTabOwner({ Entity: ' caliber: assessments ', RecordId: 'ID|A' }, own)).toBe(true);
  });

  it('compares record ids case-insensitively (a save rewrites the id to the server casing)', () => {
    // ResourceRecordSaved rewrites Data.ResourceRecordID from PrimaryKey.ToURLSegment();
    // a tab opened from a lowercase-UUID link keeps its original casing.
    expect(IsRecordTabOwner({ Entity: 'Caliber: Assessments', RecordId: 'ID|a1b2c3d4-e5f6' }, { Entity: 'Caliber: Assessments', RecordId: 'ID|A1B2C3D4-E5F6' })).toBe(true);
    expect(IsRecordTabOwner({ Entity: 'Caliber: Assessments', RecordId: ' ID|A ' }, own)).toBe(true);
  });

  it('does not own a tab reused for another record of the same entity', () => {
    expect(IsRecordTabOwner({ Entity: 'Caliber: Assessments', RecordId: 'ID|B' }, own)).toBe(false);
  });

  it('does not own a tab reused for another entity', () => {
    expect(IsRecordTabOwner({ Entity: 'MJ: Roles', RecordId: 'ID|A' }, own)).toBe(false);
  });

  it('does not own a closed tab', () => {
    expect(IsRecordTabOwner(null, own)).toBe(false);
  });

  it('a new-record tab (empty id) owns its own tab', () => {
    expect(IsRecordTabOwner({ Entity: 'Caliber: Assessments', RecordId: '' }, { Entity: 'Caliber: Assessments', RecordId: '' })).toBe(true);
  });
});

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
import { FormModeFromQueryParams, FormModeQueryParams, ReconcileFormMode } from '../record-form-mode';

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

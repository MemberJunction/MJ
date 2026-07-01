import { describe, it, expect, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { MJActionResultCodeEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text, capture, click } from '@memberjunction/ng-test-utils';
import { ActionResultCodeDialogComponent, type ActionResultCodeDialogResult } from './action-result-code-dialog.component';

/**
 * A minimal mutable stand-in for MJActionResultCodeEntity. The component only ever
 * reads/writes the three scalar fields below (loadResultCodeValues / OnSave), so a
 * plain object with those properties exercises the component honestly without
 * needing a configured metadata provider. Cast at the single input seam only.
 */
function makeResultCode(init: Partial<Pick<MJActionResultCodeEntity, 'ResultCode' | 'Description' | 'IsSuccess'>> = {}): MJActionResultCodeEntity {
  const stub: Pick<MJActionResultCodeEntity, 'ResultCode' | 'Description' | 'IsSuccess'> = {
    ResultCode: init.ResultCode ?? '',
    Description: init.Description ?? '',
    IsSuccess: init.IsSuccess ?? false,
  };
  return stub as MJActionResultCodeEntity;
}

const baseImports = [CommonModule, FormsModule];
const baseDeclarations = [ActionResultCodeDialogComponent];

describe('ActionResultCodeDialogComponent (DOM)', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders nothing when IsOpen is false', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: false },
    });
    expect(query(fixture, '.dialog-backdrop')).toBeNull();
  });

  it('renders the dialog when IsOpen is true', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true },
    });
    expect(query(fixture, '.dialog-backdrop')).not.toBeNull();
    expect(query(fixture, '.dialog-container')).not.toBeNull();
  });

  it('shows "Add" in the title when IsNew is true', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, IsNew: true },
    });
    expect(text(fixture, '.dialog-title')).toContain('Add');
  });

  it('shows "Edit" in the title when IsNew is false', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, IsNew: false },
    });
    expect(text(fixture, '.dialog-title')).toContain('Edit');
  });

  it('hides the save button when EditMode is false', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: false },
    });
    expect(query(fixture, '.btn-primary')).toBeNull();
  });

  it('shows the save button when EditMode is true', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, ResultCode: makeResultCode({ ResultCode: 'OK' }) },
    });
    expect(query(fixture, '.btn-primary')).not.toBeNull();
  });

  it('disables the save button when Code is empty (CanSave=false)', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, ResultCode: makeResultCode({ ResultCode: '' }) },
    });
    const btn = query(fixture, '.btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables the save button when Code is non-empty (CanSave=true)', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, ResultCode: makeResultCode({ ResultCode: 'SUCCESS' }) },
    });
    const btn = query(fixture, '.btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('emits Close with Save=false when Cancel is clicked', () => {
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, ResultCode: makeResultCode({ ResultCode: 'OK' }) },
    });
    const emitted = capture<ActionResultCodeDialogResult>(fixture.componentInstance.Close);
    click(fixture, '.btn-outline');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].Save).toBe(false);
  });

  it('emits Close with Save=true and the updated entity when Save is clicked', () => {
    const rc = makeResultCode({ ResultCode: 'SUCCESS', Description: 'all good', IsSuccess: true });
    const fixture = renderComponentFixture(ActionResultCodeDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, ResultCode: rc },
    });
    const emitted = capture<ActionResultCodeDialogResult>(fixture.componentInstance.Close);
    click(fixture, '.btn-primary');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].Save).toBe(true);
    expect(emitted[0].ResultCode.ResultCode).toBe('SUCCESS');
  });
});

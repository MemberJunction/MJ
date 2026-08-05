import { describe, it, expect, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { MJActionParamEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text, capture, click } from '@memberjunction/ng-test-utils';
import { ActionParamDialogComponent, type ActionParamDialogResult } from './action-param-dialog.component';

/**
 * Minimal mutable stand-in for MJActionParamEntity. The component only reads/writes
 * the scalar fields below (loadParamValues / OnSave), so a plain object exercises it
 * honestly without a configured metadata provider. Cast at the single input seam only.
 */
type ParamFields = Pick<MJActionParamEntity, 'Name' | 'Type' | 'ValueType' | 'Description' | 'DefaultValue' | 'IsRequired' | 'IsArray'>;
function makeParam(init: Partial<ParamFields> = {}): MJActionParamEntity {
  const stub: ParamFields = {
    Name: init.Name ?? 'myParam',
    Type: init.Type ?? 'Input',
    ValueType: init.ValueType ?? 'Scalar',
    Description: init.Description ?? '',
    DefaultValue: init.DefaultValue ?? '',
    IsRequired: init.IsRequired ?? false,
    IsArray: init.IsArray ?? false,
  };
  return stub as MJActionParamEntity;
}

const baseImports = [CommonModule, FormsModule];
const baseDeclarations = [ActionParamDialogComponent];

describe('ActionParamDialogComponent (DOM)', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders nothing when IsOpen is false', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: false },
    });
    expect(query(fixture, '.dialog-backdrop')).toBeNull();
  });

  it('shows the "Add Parameter" title when IsNew is true', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, IsNew: true, Param: makeParam() },
    });
    expect(text(fixture, '.dialog-title')).toContain('Add Parameter');
  });

  it('shows the "Edit Parameter" title when EditMode is true and not new', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, IsNew: false, EditMode: true, Param: makeParam() },
    });
    expect(text(fixture, '.dialog-title')).toContain('Edit Parameter');
  });

  it('shows the "Parameter Details" title in read-only mode', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, IsNew: false, EditMode: false, Param: makeParam() },
    });
    expect(text(fixture, '.dialog-title')).toContain('Parameter Details');
  });

  it('renders editable inputs/selects when EditMode is true', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, Param: makeParam({ Name: 'foo' }) },
    });
    expect(query(fixture, 'input.form-input')).not.toBeNull();
    expect(queryAll(fixture, 'select.form-select')).toHaveLength(2);
  });

  it('renders read-only values (no inputs) when EditMode is false', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: false, Param: makeParam({ Name: 'foo' }) },
    });
    expect(query(fixture, 'input.form-input')).toBeNull();
    expect(query(fixture, 'select.form-select')).toBeNull();
    expect(text(fixture, '.readonly-value')).toContain('foo');
  });

  it('renders the type badge with the GetTypeClass-derived class in read-only mode', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: false, Param: makeParam({ Type: 'Output' }) },
    });
    const badge = query(fixture, '.type-badge');
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains('type-output')).toBe(true);
  });

  it('shows Cancel + Save buttons in edit mode', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, Param: makeParam() },
    });
    expect(query(fixture, '.btn-outline')).not.toBeNull();
    expect(query(fixture, '.btn-primary')).not.toBeNull();
  });

  it('shows only a Close button in read-only mode', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: false, Param: makeParam() },
    });
    expect(query(fixture, '.btn-outline')).toBeNull();
    expect(text(fixture, '.btn-primary')).toContain('Close');
  });

  it('emits Close with Save=true and updated entity when Save is clicked', () => {
    const p = makeParam({ Name: 'foo', Type: 'Both', IsRequired: true });
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, Param: p },
    });
    const emitted = capture<ActionParamDialogResult>(fixture.componentInstance.Close);
    click(fixture, '.btn-primary');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].Save).toBe(true);
    expect(emitted[0].Param.Name).toBe('foo');
  });

  it('emits Close with Save=false when Cancel is clicked in edit mode', () => {
    const fixture = renderComponentFixture(ActionParamDialogComponent, {
      imports: baseImports,
      declarations: baseDeclarations,
      inputs: { IsOpen: true, EditMode: true, Param: makeParam() },
    });
    const emitted = capture<ActionParamDialogResult>(fixture.componentInstance.Close);
    click(fixture, '.btn-outline');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].Save).toBe(false);
  });
});

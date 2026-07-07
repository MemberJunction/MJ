import { describe, it, expect } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, click, typeInto, capture, hasClass } from '@memberjunction/ng-test-utils';
import { MJQueryEntityExtended, MJQueryParameterEntity } from '@memberjunction/core-entities';
import { QueryParameterFormComponent } from './query-parameter-form.component';

/**
 * DOM-level spec for <mj-query-parameter-form> — a self-contained, data-driven slide-in.
 * It builds its form purely from QueryInfo.QueryParameters (no provider / RunView / engine),
 * so we feed it typed parameter mocks. We verify @if(IsOpen) gating, per-type input rendering,
 * the required/disabled-submit gating, validation error display, and the Submit/Close @Outputs.
 *
 * Animations are stubbed via NoopAnimationsModule (the component declares @slideIn/@fadeIn).
 */

// The component reads only scalar properties off each parameter; build narrow typed mocks.
type ParamShape = Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'IsRequired' | 'Description' | 'DefaultValue' | 'SampleValue'>;
function param(p: ParamShape): MJQueryParameterEntity {
  return p as MJQueryParameterEntity;
}

function queryInfo(name: string, params: MJQueryParameterEntity[]): MJQueryEntityExtended {
  return { Name: name, QueryParameters: params } as MJQueryEntityExtended;
}

function render(inputs: Record<string, unknown>): ComponentFixture<QueryParameterFormComponent> {
  return renderComponentFixture(QueryParameterFormComponent, {
    imports: [CommonModule, NoopAnimationsModule],
    declarations: [QueryParameterFormComponent],
    inputs,
    autoDetect: true,
  });
}

describe('QueryParameterFormComponent (DOM, data-bound)', () => {
  it('renders nothing when closed', () => {
    const f = render({ IsOpen: false, QueryInfo: queryInfo('Q', []) });
    expect(query(f, '.param-form-panel')).toBeNull();
  });

  it('renders the panel and the query name when open', () => {
    const f = render({ IsOpen: true, QueryInfo: queryInfo('Sales Report', []) });
    expect(query(f, '.param-form-panel')).not.toBeNull();
    expect(text(f, '.header-subtitle')).toBe('Sales Report');
  });

  it('shows the no-parameters message and a Run Query button when there are no params', () => {
    const f = render({ IsOpen: true, QueryInfo: queryInfo('Q', []) });
    expect(query(f, '.no-params')).not.toBeNull();
    expect(text(f, '.no-params button')).toContain('Run Query');
    // No footer / field list when there are no parameters
    expect(query(f, '.param-fields')).toBeNull();
    expect(query(f, '.panel-footer')).toBeNull();
  });

  it('renders the overlay when ShowOverlay is true', () => {
    const f = render({ IsOpen: true, ShowOverlay: true, QueryInfo: queryInfo('Q', []) });
    expect(query(f, '.param-form-overlay')).not.toBeNull();
  });

  it('omits the overlay when ShowOverlay is false', () => {
    const f = render({ IsOpen: true, ShowOverlay: false, QueryInfo: queryInfo('Q', []) });
    expect(query(f, '.param-form-overlay')).toBeNull();
  });

  it('renders a typed input per parameter type', () => {
    const f = render({
      IsOpen: true,
      QueryInfo: queryInfo('Q', [
        param({ Name: 'name', Type: 'string', IsRequired: false, Description: null, DefaultValue: null, SampleValue: null }),
        param({ Name: 'count', Type: 'number', IsRequired: false, Description: null, DefaultValue: null, SampleValue: null }),
        param({ Name: 'when', Type: 'date', IsRequired: false, Description: null, DefaultValue: null, SampleValue: null }),
        param({ Name: 'flag', Type: 'boolean', IsRequired: false, Description: null, DefaultValue: null, SampleValue: null }),
      ]),
    });

    expect(queryAll(f, '.param-field').length).toBe(4);
    expect(query(f, 'input#param-name[type="text"]')).not.toBeNull();
    expect(query(f, 'input#param-count[type="number"]')).not.toBeNull();
    expect(query(f, 'input#param-when[type="date"]')).not.toBeNull();
    expect(query(f, 'input#param-flag[type="checkbox"]')).not.toBeNull();
  });

  it('marks a required field with the required class and a "*" indicator', () => {
    const f = render({
      IsOpen: true,
      QueryInfo: queryInfo('Q', [param({ Name: 'id', Type: 'string', IsRequired: true, Description: null, DefaultValue: null, SampleValue: null })]),
    });
    expect(hasClass(f, '.param-field', 'required')).toBe(true);
    expect(text(f, '.required-indicator')).toBe('*');
  });

  it('renders the field description when present', () => {
    const f = render({
      IsOpen: true,
      QueryInfo: queryInfo('Q', [
        param({ Name: 'id', Type: 'string', IsRequired: false, Description: 'The record id', DefaultValue: null, SampleValue: null }),
      ]),
    });
    expect(text(f, '.field-description')).toBe('The record id');
  });

  it('disables the Run Query submit button until required fields are filled', () => {
    const f = render({
      IsOpen: true,
      QueryInfo: queryInfo('Q', [param({ Name: 'id', Type: 'string', IsRequired: true, Description: null, DefaultValue: null, SampleValue: null })]),
    });

    const submit = query(f, '.panel-footer .btn-primary') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    typeInto(f, 'input#param-id', 'abc');
    f.detectChanges();
    expect(submit.disabled).toBe(false);
  });

  it('emits ParametersSubmit with the entered values when submitted', () => {
    const f = render({
      IsOpen: true,
      QueryInfo: queryInfo('Q', [param({ Name: 'id', Type: 'string', IsRequired: true, Description: null, DefaultValue: null, SampleValue: null })]),
    });
    const submitted = capture(f.componentInstance.ParametersSubmit);

    typeInto(f, 'input#param-id', 'abc');
    f.detectChanges();
    click(f, '.panel-footer .btn-primary');

    expect(submitted).toEqual([{ id: 'abc' }]);
  });

  it('does not emit and shows an error when submitting with a required field empty', () => {
    const f = render({
      IsOpen: true,
      QueryInfo: queryInfo('Q', [param({ Name: 'id', Type: 'string', IsRequired: true, Description: null, DefaultValue: null, SampleValue: null })]),
    });
    const submitted = capture(f.componentInstance.ParametersSubmit);

    // Force the submit handler directly — the button is disabled, but Submit() must still guard.
    f.componentInstance.Submit();
    f.detectChanges();

    expect(submitted).toEqual([]);
    expect(text(f, '.field-error')).toContain('This field is required');
  });

  it('emits Close when the header close button is clicked', () => {
    const f = render({ IsOpen: true, QueryInfo: queryInfo('Q', []) });
    const closed = capture(f.componentInstance.Close);

    click(f, '.close-btn');

    expect(closed.length).toBe(1);
  });

  it('emits Close when the overlay backdrop is clicked', () => {
    const f = render({ IsOpen: true, ShowOverlay: true, QueryInfo: queryInfo('Q', []) });
    const closed = capture(f.componentInstance.Close);

    click(f, '.param-form-overlay');

    expect(closed.length).toBe(1);
  });

  it('pre-fills a field from InitialValues', () => {
    const f = render({
      IsOpen: true,
      InitialValues: { id: 'seeded' },
      QueryInfo: queryInfo('Q', [param({ Name: 'id', Type: 'string', IsRequired: false, Description: null, DefaultValue: null, SampleValue: null })]),
    });
    expect((query(f, 'input#param-id') as HTMLInputElement).value).toBe('seeded');
  });

  it('shows a sample-value hint when a parameter has a SampleValue', () => {
    const f = render({
      IsOpen: true,
      QueryInfo: queryInfo('Q', [param({ Name: 'id', Type: 'string', IsRequired: false, Description: null, DefaultValue: null, SampleValue: '12345' })]),
    });
    expect(text(f, '.field-sample')).toContain('12345');
  });
});

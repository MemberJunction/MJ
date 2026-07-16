import { describe, it, expect } from 'vitest';
import { AgGridAngular } from 'ag-grid-angular';
import { MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { TemplateParamsGridComponent } from './template-params-grid.component';

/**
 * DOM coverage for <mj-template-params-grid> — the editable grid of a template's parameters. ngOnInit
 * builds the AG Grid column defs and only loads rows when a `template.ID` is present; we render
 * WITHOUT a template so no RunView fires. The observable pieces are the header (always shown) and the
 * edit-mode gate (Add Parameter toolbar + parameter-types help appear only when `editMode` is true).
 * ag-grid-angular + mjButton are imported directly; MJConfirmService (only touched on delete) is stubbed.
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(TemplateParamsGridComponent, {
    imports: [AgGridAngular, MJButtonDirective],
    declarations: [TemplateParamsGridComponent],
    providers: [{ provide: MJConfirmService, useValue: { ConfirmDelete: async () => false } }],
    inputs,
  });

describe('TemplateParamsGridComponent (DOM)', () => {
  it('renders the parameters header and the ag-grid', () => {
    const fixture = render();
    expect(text(fixture, '.params-header h3')).toContain('Template Parameters');
    expect(query(fixture, 'ag-grid-angular')).not.toBeNull();
  });

  it('hides the Add Parameter toolbar when not in edit mode', () => {
    expect(query(render({ editMode: false }), '.params-toolbar')).toBeNull();
  });

  it('shows the Add Parameter toolbar in edit mode', () => {
    const fixture = render({ editMode: true });
    expect(query(fixture, '.params-toolbar')).not.toBeNull();
    const addBtn = queryAll(fixture, '.params-toolbar button').find((b) => b.textContent?.includes('Add Parameter'));
    expect(addBtn).toBeTruthy();
  });

  it('hides the parameter-types help section when not in edit mode', () => {
    expect(query(render({ editMode: false }), '.params-help')).toBeNull();
  });

  it('shows the parameter-types help section in edit mode', () => {
    expect(query(render({ editMode: true }), '.params-help')).not.toBeNull();
  });

  it('does not build an Actions column when not in edit mode', () => {
    // buildColumnDefs runs in ngOnInit; the Actions column is appended only when editMode is true.
    const cols = render({ editMode: false }).componentInstance.ColumnDefs.map((c) => c.headerName);
    expect(cols).not.toContain('Actions');
  });

  it('builds an Actions column in edit mode', () => {
    const cols = render({ editMode: true }).componentInstance.ColumnDefs.map((c) => c.headerName);
    expect(cols).toContain('Actions');
  });

  it('maps parameter types to their Font Awesome icons', () => {
    const c = render().componentInstance;
    expect(c.getTypeIcon('Scalar')).toBe('fa-font');
    expect(c.getTypeIcon('Entity')).toBe('fa-table');
    expect(c.getTypeIcon('Unknown')).toBe('fa-question');
  });
});

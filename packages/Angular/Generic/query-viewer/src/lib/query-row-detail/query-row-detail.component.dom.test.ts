import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, click, capture, hasClass } from '@memberjunction/ng-test-utils';
import { QueryRowDetailComponent, RowDetailEntityLinkEvent } from './query-row-detail.component';
import { QueryGridColumnConfig } from '../query-data-grid/models/query-grid-types';

/**
 * DOM-level spec for <mj-query-row-detail> — a slide-in that renders one row's fields,
 * grouped into Primary Key / Related Records (FK) / Fields sections. It is fully input-driven:
 * RowData + Columns drive buildDetailFields(); we supply plain QueryGridColumnConfig objects
 * (a plain interface) and a record. @if(Visible) gates the whole panel.
 *
 * Animations stubbed via NoopAnimationsModule; no child components are rendered.
 * UserInfoEngine.Instance.GetSetting in ngOnInit is wrapped in try/catch in the component.
 */

function col(partial: Partial<QueryGridColumnConfig> & { field: string; title: string }): QueryGridColumnConfig {
  return {
    visible: true,
    sortable: true,
    resizable: true,
    reorderable: true,
    sqlBaseType: 'nvarchar',
    sqlFullType: 'nvarchar(max)',
    order: 0,
    isEntityLink: false,
    ...partial,
  };
}

function render(inputs: Record<string, unknown>): ComponentFixture<QueryRowDetailComponent> {
  return renderComponentFixture(QueryRowDetailComponent, {
    imports: [CommonModule, NoopAnimationsModule],
    declarations: [QueryRowDetailComponent],
    inputs,
    autoDetect: true,
  });
}

describe('QueryRowDetailComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    const f = render({
      Visible: false,
      Columns: [col({ field: 'Name', title: 'Name' })],
      RowData: { Name: 'Ada' },
    });
    expect(query(f, '.row-detail-panel')).toBeNull();
  });

  it('renders the panel when visible', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'Name', title: 'Name' })],
      RowData: { Name: 'Ada' },
    });
    expect(query(f, '.row-detail-panel')).not.toBeNull();
    expect(text(f, '.panel-title')).toBe('Row Details');
  });

  it('renders a regular field with its display name and formatted value', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'Name', title: 'Full Name' })],
      RowData: { Name: 'Ada Lovelace' },
    });
    expect(text(f, '.field-name')).toBe('Full Name');
    expect(text(f, '.field-value .value-text')).toBe('Ada Lovelace');
  });

  it('groups a primary-key column into the Primary Key section', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'ID', title: 'ID', isPrimaryKey: true, sqlBaseType: 'uniqueidentifier' })],
      RowData: { ID: 'abc-123' },
    });
    expect(text(f, '.section-title')).toContain('Primary Key');
    expect(text(f, '.field-value .value-text')).toBe('abc-123');
  });

  it('groups a foreign-key column into the Related Records section', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'OwnerID', title: 'Owner', isForeignKey: true, targetEntityName: 'Users' })],
      RowData: { OwnerID: 'u-1' },
    });
    const titles = queryAll(f, '.section-title').map((t) => t.textContent?.trim() ?? '');
    expect(titles.some((t) => t.includes('Related Records'))).toBe(true);
    expect(text(f, '.target-entity')).toContain('Users');
  });

  it('shows the row navigation only when there is more than one row', () => {
    const single = render({
      Visible: true,
      TotalRows: 1,
      RowIndex: 0,
      Columns: [col({ field: 'Name', title: 'Name' })],
      RowData: { Name: 'Ada' },
    });
    expect(query(single, '.row-nav')).toBeNull();
  });

  it('shows the row indicator and disables prev on the first row', () => {
    const f = render({
      Visible: true,
      TotalRows: 3,
      RowIndex: 0,
      Columns: [col({ field: 'Name', title: 'Name' })],
      RowData: { Name: 'Ada' },
    });
    expect(query(f, '.row-nav')).not.toBeNull();
    expect(text(f, '.row-indicator')).toBe('1 / 3');
    const prev = queryAll(f, '.nav-btn')[0] as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });

  it('emits NavigateRow "next" when the next button is clicked', () => {
    const f = render({
      Visible: true,
      TotalRows: 3,
      RowIndex: 0,
      Columns: [col({ field: 'Name', title: 'Name' })],
      RowData: { Name: 'Ada' },
    });
    const nav = capture(f.componentInstance.NavigateRow);
    const next = queryAll(f, '.nav-btn')[1] as HTMLButtonElement;
    next.click();
    expect(nav).toEqual(['next']);
  });

  it('emits Close when the close button is clicked', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'Name', title: 'Name' })],
      RowData: { Name: 'Ada' },
    });
    const closed = capture(f.componentInstance.Close);
    click(f, '.close-btn');
    expect(closed.length).toBe(1);
  });

  it('emits Close when the backdrop is clicked', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'Name', title: 'Name' })],
      RowData: { Name: 'Ada' },
    });
    const closed = capture(f.componentInstance.Close);
    click(f, '.panel-backdrop');
    expect(closed.length).toBe(1);
  });

  it('emits EntityLinkClick with the target entity and record id when a FK value is clicked', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'OwnerID', title: 'Owner', isForeignKey: true, targetEntityName: 'Users' })],
      RowData: { OwnerID: 'u-42' },
    });
    const links = capture(f.componentInstance.EntityLinkClick);
    click(f, '.field-value.clickable');
    expect(links).toEqual<RowDetailEntityLinkEvent[]>([{ entityName: 'Users', recordId: 'u-42', fieldName: 'OwnerID' }]);
  });

  it('hides empty fields by default and shows the hidden-empty count', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'Name', title: 'Name' }), col({ field: 'Notes', title: 'Notes' })],
      RowData: { Name: 'Ada', Notes: null },
    });
    // HideEmptyFields defaults to true → only the non-empty 'Name' field item renders.
    expect(queryAll(f, '.field-item').length).toBe(1);
    expect(text(f, '.field-name')).toBe('Name');
    expect(text(f, '.hidden-count')).toContain('1 empty hidden');
  });

  it('marks the toggle-empty button active when HideEmptyFields is on', () => {
    const f = render({
      Visible: true,
      Columns: [col({ field: 'Name', title: 'Name' })],
      RowData: { Name: 'Ada' },
    });
    expect(hasClass(f, '.action-btn', 'active')).toBe(true);
  });
});

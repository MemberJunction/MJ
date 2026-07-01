import { describe, it, expect } from 'vitest';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { query, queryAll, text, click, capture, hasClass } from '@memberjunction/ng-test-utils';
import { MJQueryEntityExtended, MJQueryFieldEntity, MJQueryParameterEntity } from '@memberjunction/core-entities';
import { QueryInfoPanelComponent } from './query-info-panel.component';

/**
 * DOM-level spec for <mj-query-info-panel> — a slide-in that renders read-only query metadata.
 * It is input-driven; the only data dependency is QueryInfo's already-loaded child arrays
 * (QueryFields / QueryParameters / QueryDependents), which we supply as typed structural mocks.
 *
 * The template embeds <mj-markdown> and <mj-code-editor>; we don't exercise those, so we
 * declare the component with NO_ERRORS_SCHEMA so the unknown child elements are ignored.
 * Animations are stubbed via NoopAnimationsModule. UserInfoEngine.Instance.GetSetting in
 * ngOnInit is wrapped in try/catch in the component, so it is harmless here.
 */

function field(name: string, sqlType: string): MJQueryFieldEntity {
  return { Name: name, SQLFullType: sqlType, SQLBaseType: sqlType, Description: null, SourceEntity: null, SourceFieldName: null } as MJQueryFieldEntity;
}

interface QueryInfoShape {
  Name: string;
  Description?: string | null;
  Category?: string | null;
  Status?: string;
  OriginalSQL?: string | null;
  TechnicalDescription?: string | null;
  SQL?: string | null;
  QueryFields: MJQueryFieldEntity[];
  QueryParameters: MJQueryParameterEntity[];
  QueryDependents: unknown[];
}

function queryInfo(partial: Partial<QueryInfoShape> & { Name: string }): MJQueryEntityExtended {
  const full: QueryInfoShape = {
    Status: 'Approved',
    QueryFields: [],
    QueryParameters: [],
    QueryDependents: [],
    ...partial,
  };
  return full as MJQueryEntityExtended;
}

function render(inputs: Record<string, unknown>): ComponentFixture<QueryInfoPanelComponent> {
  TestBed.configureTestingModule({
    imports: [CommonModule, NoopAnimationsModule],
    declarations: [QueryInfoPanelComponent],
    schemas: [NO_ERRORS_SCHEMA],
  });
  const fixture = TestBed.createComponent(QueryInfoPanelComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.autoDetectChanges();
  return fixture;
}

describe('QueryInfoPanelComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    const f = render({ Visible: false, QueryInfo: queryInfo({ Name: 'Q' }) });
    expect(query(f, '.info-panel')).toBeNull();
  });

  it('renders the panel and the query name in the header when visible', () => {
    const f = render({ Visible: true, QueryInfo: queryInfo({ Name: 'Sales' }) });
    expect(query(f, '.info-panel')).not.toBeNull();
    expect(text(f, '.header-subtitle')).toBe('Sales');
  });

  it('renders the overlay only when ShowOverlay is true', () => {
    const f = render({ Visible: true, ShowOverlay: true, QueryInfo: queryInfo({ Name: 'Q' }) });
    expect(query(f, '.info-panel-overlay')).not.toBeNull();
  });

  it('omits the overlay when ShowOverlay is false', () => {
    const f = render({ Visible: true, ShowOverlay: false, QueryInfo: queryInfo({ Name: 'Q' }) });
    expect(query(f, '.info-panel-overlay')).toBeNull();
  });

  it('shows the description row only when QueryInfo has a description', () => {
    const f = render({ Visible: true, QueryInfo: queryInfo({ Name: 'Q', Description: 'My query' }) });
    expect(text(f, '.info-value.description')).toBe('My query');
  });

  it('shows the field count and a row per field when the Fields section is expanded', () => {
    const f = render({
      Visible: true,
      QueryInfo: queryInfo({ Name: 'Q', QueryFields: [field('ID', 'uniqueidentifier'), field('Name', 'nvarchar')] }),
    });
    // 'fields' is expanded by default
    expect(text(f, '.field-name')).toBe('ID');
    expect(queryAll(f, '.field-item').length).toBe(2);
  });

  it('marks the status badge approved when Status is Approved', () => {
    const f = render({ Visible: true, QueryInfo: queryInfo({ Name: 'Q', Status: 'Approved' }) });
    expect(hasClass(f, '.status-badge', 'approved')).toBe(true);
    expect(text(f, '.status-badge')).toBe('Approved');
  });

  it('does not mark the status badge approved when Status is Pending', () => {
    const f = render({ Visible: true, QueryInfo: queryInfo({ Name: 'Q', Status: 'Pending' }) });
    expect(hasClass(f, '.status-badge', 'approved')).toBe(false);
  });

  it('emits Close when the close button is clicked', () => {
    const f = render({ Visible: true, QueryInfo: queryInfo({ Name: 'Q' }) });
    const closed = capture(f.componentInstance.Close);

    click(f, '.close-btn');

    expect(closed.length).toBe(1);
  });

  it('emits Close when the footer Close button is clicked', () => {
    const f = render({ Visible: true, QueryInfo: queryInfo({ Name: 'Q' }) });
    const closed = capture(f.componentInstance.Close);

    click(f, '.panel-footer .btn-secondary');

    expect(closed.length).toBe(1);
  });

  it('emits OpenRecord with the query id and name when Open Full Record is clicked', () => {
    const f = render({ Visible: true, QueryInfo: queryInfo({ Name: 'Sales' }) });
    // Give the mock an ID for the OpenRecord payload.
    (f.componentInstance.QueryInfo as unknown as { ID: string }).ID = 'q-123';
    const opened = capture(f.componentInstance.OpenRecord);

    click(f, '.panel-footer .btn-primary');

    expect(opened).toEqual([{ queryId: 'q-123', queryName: 'Sales' }]);
  });

  it('collapses the Fields section when its header is clicked', () => {
    const f = render({
      Visible: true,
      QueryInfo: queryInfo({ Name: 'Q', QueryFields: [field('ID', 'uniqueidentifier')] }),
    });
    // Fields section starts expanded → a field-item is shown.
    expect(query(f, '.field-item')).not.toBeNull();
    expect(f.componentInstance.IsSectionExpanded('fields')).toBe(true);

    // Find the Fields section header by its title text and click it.
    const fieldsHeader = queryAll(f, '.section-header').find((h) => h.querySelector('.section-title')?.textContent?.trim() === 'Fields');
    expect(fieldsHeader).toBeDefined();
    (fieldsHeader as HTMLElement).click();
    f.detectChanges();

    expect(f.componentInstance.IsSectionExpanded('fields')).toBe(false);
    expect(query(f, '.field-item')).toBeNull();
  });
});

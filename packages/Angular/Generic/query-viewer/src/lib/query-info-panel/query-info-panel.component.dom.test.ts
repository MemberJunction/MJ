import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { query, queryAll, text, click, capture, hasClass } from '@memberjunction/ng-test-utils';
import { MJAccordionModule } from '@memberjunction/ng-ui-components';
import { MJQueryEntityExtended, MJQueryFieldEntity, MJQueryParameterEntity } from '@memberjunction/core-entities';
import { CompositionTokenClickEvent } from '@memberjunction/ng-code-editor';
import { QueryInfoPanelComponent } from './query-info-panel.component';

/**
 * DOM-level spec for <mj-query-info-panel> — a slide-in that renders read-only query metadata.
 * It is input-driven; the only data dependency is QueryInfo's already-loaded child arrays
 * (QueryFields / QueryParameters / QueryDependents), which we supply as typed structural mocks.
 *
 * The info sections are <mj-accordion-panel>s, so MJAccordionModule is registered for real (a
 * stubbed-out accordion would drop the ng-template title/body slots). The other embedded child
 * components — <mj-markdown>, <mj-code-editor>, and <mj-empty-state> — are replaced with typed
 * standalone stubs below (no blanket schema), matching the inputs/outputs the template binds.
 * 'overview' and 'fields' start expanded; the Overview/Fields bodies are eager <ng-content>,
 * the rest are lazy [mjAccordionBody]. Animations are stubbed via NoopAnimationsModule.
 * UserInfoEngine.Instance.GetSetting in ngOnInit is wrapped in try/catch in the component,
 * so it is harmless here.
 */

/** Stub for <mj-markdown> (technical-description body) — template binds data + enable* flags. */
@Component({ standalone: true, selector: 'mj-markdown', template: '' })
class MarkdownStubComponent {
  @Input() data = '';
  @Input() enableMermaid = false;
  @Input() enableHighlight = false;
  @Input() enableCollapsibleHeadings = false;
  @Input() enableSmartypants = false;
}

/** Stub for <mj-code-editor> (SQL body) — template binds value/readonly/language and listens to CompositionTokenClick. */
@Component({ standalone: true, selector: 'mj-code-editor', template: '' })
class CodeEditorStubComponent {
  @Input() value = '';
  @Input() readonly = false;
  @Input() language = '';
  @Output() CompositionTokenClick = new EventEmitter<CompositionTokenClickEvent>();
}

/** Stub for <mj-empty-state> (empty fields/params/SQL sections) — template sets Size/Icon/Title. */
@Component({ standalone: true, selector: 'mj-empty-state', template: '' })
class EmptyStateStubComponent {
  @Input() Size = '';
  @Input() Icon = '';
  @Input() Title = '';
}

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
    imports: [
      CommonModule,
      NoopAnimationsModule,
      MJAccordionModule,
      MarkdownStubComponent,
      CodeEditorStubComponent,
      EmptyStateStubComponent,
    ],
    declarations: [QueryInfoPanelComponent],
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

  it('collapses the Fields section when its accordion header is clicked', () => {
    const f = render({
      Visible: true,
      QueryInfo: queryInfo({ Name: 'Q', QueryFields: [field('ID', 'uniqueidentifier')] }),
    });
    // Fields section starts expanded → a field-item is shown.
    expect(query(f, '.field-item')).not.toBeNull();
    expect(f.componentInstance.IsSectionExpanded('fields')).toBe(true);

    // Find the Fields accordion panel by its title text and click its header. The header's
    // Toggle() emits ExpandedChange, wired to ToggleSection('fields').
    const fieldsPanel = queryAll(f, 'mj-accordion-panel').find(
      (p) => p.querySelector('.section-title')?.textContent?.trim() === 'Fields',
    );
    expect(fieldsPanel).toBeDefined();
    (fieldsPanel!.querySelector('.mj-accordion-header') as HTMLElement).click();
    f.detectChanges();

    // Section is now collapsed; the accordion drops its --expanded class. (The field-item stays
    // in the DOM — it's eager <ng-content>, just marked inert — so state, not presence, is the
    // assertion.)
    expect(f.componentInstance.IsSectionExpanded('fields')).toBe(false);
    expect(fieldsPanel!.querySelector('.mj-accordion-panel--expanded')).toBeNull();
  });
});

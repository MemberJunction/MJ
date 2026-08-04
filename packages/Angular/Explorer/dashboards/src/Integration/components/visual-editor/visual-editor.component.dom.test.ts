import { describe, it, expect } from 'vitest';
import { Component, Directive } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { VisualFieldEditorComponent } from './visual-editor.component';
import { IntegrationDataService } from '../../services/integration-data.service';

/**
 * DOM coverage for <app-visual-field-editor> — the field-mapping editor. Rendered without a
 * CompanyIntegrationID so ngOnChanges never fires the data-loading openEditor() path (which
 * needs the live IntegrationEngine); this exercises the static shell: the back button (emits
 * Close), the EntityMap-gated header (labels + sync toggle + stats), and the "no fields" empty
 * states over the empty EditorSourceFields/EditorDestFields arrays. Accordion children stubbed.
 *
 * NOTE: the data-loading path (EntityMap + CompanyIntegrationID both set → openEditor →
 * IntegrationDataService + IntegrationEngineBase.Instance) is intentionally NOT exercised —
 * it needs heavy live-engine infra and belongs to the integration suite, not a DOM unit test.
 */

@Component({ standalone: true, selector: 'mj-accordion-panel', template: '<ng-content></ng-content>', inputs: ['Size', 'Fill', 'FlushBody', 'Expanded'] })
class AccordionStub {}
@Directive({ standalone: true, selector: '[mjAccordionTitle]' })
class AccordionTitleStub {}
@Directive({ standalone: true, selector: '[mjAccordionBody]' })
class AccordionBodyStub {}

const ENTITY_MAP = {
  ID: 'em1',
  EntityID: 'e1',
  Entity: 'Members',
  ExternalObjectName: 'contact',
  ExternalObjectLabel: 'Contact',
  SyncEnabled: true,
} as unknown as VisualFieldEditorComponent['EntityMap'];

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(VisualFieldEditorComponent, {
    imports: [CommonModule, MJEmptyStateComponent, AccordionStub, AccordionTitleStub, AccordionBodyStub],
    declarations: [VisualFieldEditorComponent],
    providers: [{ provide: IntegrationDataService, useValue: {} }],
    inputs,
  });

describe('VisualFieldEditorComponent (DOM)', () => {
  it('renders the back button and header shell', () => {
    const fixture = render();
    expect(query(fixture, '.ve-back-btn')).not.toBeNull();
    expect(query(fixture, '.ve-header')).not.toBeNull();
  });

  it('emits Close when the back button is clicked', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.Close);
    (query(fixture, '.ve-back-btn') as HTMLElement).click();
    expect(closed.length).toBe(1);
  });

  it('shows source/destination labels from the EntityMap input', () => {
    const fixture = render({ EntityMap: ENTITY_MAP });
    expect(text(fixture, '.ve-source-label')).toContain('Contact');
    expect(text(fixture, '.ve-dest-label')).toContain('Members');
  });

  it('hides the sync toggle when no EntityMap is bound', () => {
    expect(query(render(), '.ve-sync-toggle')).toBeNull();
  });

  it('shows the sync toggle reflecting SyncEnabled when an EntityMap is bound', () => {
    const withMap = render({ EntityMap: ENTITY_MAP });
    const toggle = query(withMap, '.ve-sync-toggle input[type="checkbox"]') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(true);
  });

  it('shows zeroed header stats with no connections loaded', () => {
    const fixture = render({ EntityMap: ENTITY_MAP });
    const stats = queryAll(fixture, '.ve-stat strong').map((s) => s.textContent?.trim());
    expect(stats).toEqual(['0', '0', '0']);
  });

  it('shows the "no source/destination fields" empty states when field lists are empty', () => {
    const fixture = render({ EntityMap: ENTITY_MAP });
    const emptyTitles = queryAll(fixture, 'mj-empty-state.ve-field-empty');
    expect(emptyTitles.length).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import { Component, Directive, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture, createFakeProvider, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { ArtifactLoadDialogComponent } from './artifact-load-dialog.component';

/**
 * DOM coverage for <app-artifact-load-dialog> — loads a component spec from an artifact or
 * collection. ngOnInit loads artifacts + collections via RunView (fake provider → empty), so
 * after the async flush the Artifacts tab shows an empty state. Covers: the two tabs
 * (All Artifacts / Collections), tab switching, empty state, and Load gating (disabled until a
 * spec preview is ready) + Cancel emitting Close. Dialog/loading/accordion children stubbed.
 */

@Component({ standalone: true, selector: 'mj-dialog', template: '<ng-content></ng-content>', inputs: ['Visible', 'Title', 'Width', 'MinWidth'] })
class DialogStub {}
@Component({ standalone: true, selector: 'mj-dialog-actions', template: '<ng-content></ng-content>' })
class DialogActionsStub {}
@Component({ standalone: true, selector: 'mj-accordion-panel', template: '<ng-content></ng-content>', inputs: ['Size', 'FlushBody', 'Expanded'] })
class AccordionStub {}
@Directive({ standalone: true, selector: '[mjAccordionTitle]' })
class AccordionTitleStub {}
@Directive({ standalone: true, selector: '[mjAccordionBody]' })
class AccordionBodyStub {}
@Component({ standalone: true, selector: 'mj-code-editor', template: '', inputs: ['value', 'language', 'readonly', 'lineWrapping', 'setup'] })
class CodeEditorStub {
  @Input() value = '';
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render() {
  const fixture = renderComponentFixture(ArtifactLoadDialogComponent, {
    imports: [
      CommonModule, FormsModule, MJButtonDirective, MJEmptyStateComponent,
      DialogStub, DialogActionsStub, StubLoadingComponent, AccordionStub, AccordionTitleStub, AccordionBodyStub, CodeEditorStub,
    ],
    declarations: [ArtifactLoadDialogComponent],
    setup: (instance) => { instance.Provider = createFakeProvider({ runViewResults: [] }); },
  });
  await flush();
  fixture.componentInstance['cdr'].detectChanges();
  fixture.detectChanges();
  return fixture;
}

describe('ArtifactLoadDialogComponent (DOM)', () => {
  it('renders the two tabs with All Artifacts active by default', async () => {
    const fixture = await render();
    const tabs = queryAll(fixture, '.tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('All Artifacts');
    expect(tabs[0].classList.contains('active')).toBe(true);
  });

  it('shows an empty state on the Artifacts tab when nothing loaded', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.isLoading).toBe(false);
    expect(query(fixture, '.artifacts-list mj-empty-state')).not.toBeNull();
  });

  it('switches to the Collections tab when clicked', async () => {
    const fixture = await render();
    queryAll(fixture, '.tab').find((t) => t.textContent?.includes('Collections'))!.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTab).toBe(1);
    expect(queryAll(fixture, '.tab')[1].classList.contains('active')).toBe(true);
  });

  it('disables the Load button until a spec preview is ready', async () => {
    const fixture = await render();
    const load = queryAll(fixture, 'button').find((b) => b.textContent?.includes('Load Component')) as HTMLButtonElement;
    expect(load.disabled).toBe(true);
    expect(fixture.componentInstance.canLoad()).toBe(false);
  });

  it('emits Close(undefined) when Cancel is clicked', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.Close);
    queryAll(fixture, 'button').find((b) => b.textContent?.trim() === 'Cancel')!.dispatchEvent(new Event('click'));
    expect(closed.length).toBe(1);
    expect(closed[0]).toBeUndefined();
  });
});

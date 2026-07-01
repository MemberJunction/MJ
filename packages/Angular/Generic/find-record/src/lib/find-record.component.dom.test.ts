import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridModule } from 'ag-grid-angular';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { query, text, queryAll, capture, click, createFakeProvider } from '@memberjunction/ng-test-utils';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FindRecordComponent } from './find-record.component';
import { BaseEntity } from '@memberjunction/core';

/**
 * DOM-level spec for <mj-find-record> — a module-declared (standalone:false) component.
 *
 * The component's ngOnInit reads metadata via this.ProviderToUse.EntityByName(EntityName);
 * with an empty EntityName it LogErrors and returns early (no provider data needed), so the
 * template's presentational surface — the search input, the Find button, and the three
 * @if-gated states (loading / grid / "no records found") — renders without a backend.
 *
 * We render via TestBed directly (rather than renderComponentFixture) so internal state
 * (loading / records / searchHasRun) can be set on the instance BEFORE the first
 * detectChanges(), keeping each render NG0100-safe (guide §5).
 */
describe('FindRecordComponent (DOM)', () => {
  function render(setup?: (c: FindRecordComponent) => void): ComponentFixture<FindRecordComponent> {
    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, AgGridModule, MJButtonDirective],
      declarations: [FindRecordComponent],
    });
    const fixture = TestBed.createComponent(FindRecordComponent);
    // Supply a fake provider whose EntityByName returns undefined → ngOnInit returns early
    // after a LogError (no backend data needed). Without it, ProviderToUse falls back to the
    // unset global Metadata.Provider and ngOnInit throws on md.EntityByName.
    fixture.componentRef.setInput('Provider', createFakeProvider());
    // EntityName left empty → ngOnInit returns early after a LogError, no provider data needed.
    setup?.(fixture.componentInstance);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the search input and the Find button', () => {
    const fixture = render();
    expect(query(fixture, 'input.find-textbox')).not.toBeNull();
    expect(text(fixture, 'button.find-button')).toBe('Find');
  });

  it('shows neither the "Searching..." message nor the "No records found." message before a search has run', () => {
    const fixture = render();
    expect(text(fixture, 'div.find-grid-wrapper')).toBe('');
    // No loading, no records, searchHasRun false → all three @if branches are off.
    expect(query(fixture, '.find-grid-wrapper')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Searching...');
    expect(fixture.nativeElement.textContent).not.toContain('No records found.');
  });

  it('shows the "Searching..." message while loading', () => {
    const fixture = render((c) => {
      c.loading = true;
    });
    expect(fixture.nativeElement.textContent).toContain('Searching...');
    // grid + empty-state are gated on !loading, so they stay hidden
    expect(query(fixture, '.find-grid-wrapper')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('No records found.');
  });

  it('shows "No records found." once a search has run with zero results', () => {
    const fixture = render((c) => {
      c.loading = false;
      c.records = [];
      c.searchHasRun = true;
    });
    expect(fixture.nativeElement.textContent).toContain('No records found.');
    expect(query(fixture, '.find-grid-wrapper')).toBeNull();
  });

  it('renders the result grid (not the empty state) when records are present', () => {
    const fixture = render((c) => {
      c.loading = false;
      c.records = [{ ID: 'r1' } as unknown as BaseEntity];
      c.searchHasRun = true;
    });
    expect(query(fixture, '.find-grid-wrapper')).not.toBeNull();
    expect(queryAll(fixture, 'ag-grid-angular').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('No records found.');
  });

  it('emits OnRecordSelected when a row is selected via onSelectionChange', () => {
    const fixture = render();
    const selected = capture(fixture.componentInstance.OnRecordSelected);
    const row = { ID: 'r1' } as unknown as BaseEntity;
    // onSelectionChange reads the selected rows off the grid event's api.
    fixture.componentInstance.onSelectionChange({
      api: { getSelectedRows: () => [row] },
    } as unknown as Parameters<FindRecordComponent['onSelectionChange']>[0]);

    expect(selected).toEqual([row]);
  });

  it('does not emit OnRecordSelected when the selection is empty', () => {
    const fixture = render();
    const selected = capture(fixture.componentInstance.OnRecordSelected);
    fixture.componentInstance.onSelectionChange({
      api: { getSelectedRows: () => [] },
    } as unknown as Parameters<FindRecordComponent['onSelectionChange']>[0]);

    expect(selected).toEqual([]);
  });

  it('feeds the typed search term into the search pipeline via the Find button', () => {
    const fixture = render((c) => {
      c.searchTerm = 'hello';
    });
    const calls: string[] = [];
    // Spy on the subject the Find button pushes into (onFind → searchSubject.next(searchTerm)).
    const subject = (fixture.componentInstance as unknown as { searchSubject: { next(v: string): void } }).searchSubject;
    subject.next = (v: string) => calls.push(v);

    click(fixture, 'button.find-button');
    expect(calls).toEqual(['hello']);
  });
});

import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, text, click, typeInto, capture } from '@memberjunction/ng-test-utils';
import { DuplicateViewDialogComponent, DuplicateViewEvent } from './duplicate-view-dialog.component';
import { ViewConfigSummary } from '../types';

/**
 * DOM coverage for DuplicateViewDialogComponent. Template highlights:
 *   - @if (IsOpen) gates .dialog-backdrop
 *   - {{ SourceViewName }} in the intro text
 *   - ngOnChanges seeds NewName = "<Source> (Copy)" when IsOpen flips true
 *   - Duplicate button [disabled]="!NewName.trim()"; (click) -> OnDuplicate -> Duplicate emit
 *   - @if (Summary) renders the meta-summary with pluralized counts
 */
describe('DuplicateViewDialogComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(DuplicateViewDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [DuplicateViewDialogComponent],
      inputs,
      autoDetect: true,
    });

  it('hides the backdrop when closed', () => {
    const fixture = render({ IsOpen: false });
    expect(query(fixture, '.dialog-backdrop')).toBeNull();
  });

  it('renders the source view name and seeds the default copy name', () => {
    const fixture = render({ IsOpen: true, SourceViewName: 'My View' });
    expect(text(fixture, '.intro-text')).toContain('My View');
    // ngOnChanges seeds NewName when IsOpen flips true (the ngModel-bound input)
    expect(fixture.componentInstance.NewName).toBe('My View (Copy)');
  });

  it('emits the trimmed new name on Duplicate', () => {
    const fixture = render({ IsOpen: true, SourceViewName: 'Src' });
    const events: DuplicateViewEvent[] = capture(fixture.componentInstance.Duplicate);
    typeInto(fixture, '#duplicateName', '  Renamed Copy  ');
    fixture.detectChanges();
    click(fixture, '.btn-primary');
    expect(events).toEqual([{ Name: 'Renamed Copy' }]);
  });

  it('disables the Duplicate button when the name is blank', () => {
    const fixture = render({ IsOpen: true, SourceViewName: 'Src' });
    typeInto(fixture, '#duplicateName', '   ');
    fixture.detectChanges();
    expect((query(fixture, '.btn-primary') as HTMLButtonElement).disabled).toBe(true);
  });

  it('omits the meta-summary when no Summary is provided', () => {
    const fixture = render({ IsOpen: true, SourceViewName: 'Src' });
    expect(query(fixture, '.meta-summary')).toBeNull();
  });

  it('renders pluralized counts from the Summary', () => {
    const summary: ViewConfigSummary = {
      FilterCount: 2,
      ColumnCount: 1,
      SortCount: 0,
      AggregateCount: 0,
      SmartFilterActive: false,
      SmartFilterPrompt: '',
    };
    const fixture = render({ IsOpen: true, SourceViewName: 'Src', Summary: summary });
    const metaText = text(fixture, '.meta-summary');
    expect(metaText).toContain('2 filters');
    expect(metaText).toContain('1 column');
  });
});

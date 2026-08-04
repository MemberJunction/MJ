import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { ViewHeaderComponent } from './view-header.component';

/**
 * DOM coverage for ViewHeaderComponent. Template highlights:
 *   - @if (IsEditing) swaps the .view-name span for the .name-input field
 *   - .view-name carries [class.editable]="CanEdit"; (click) -> StartEdit()
 *   - @if (IsShared) gates the .shared-badge; @if (IsModified) gates .modified-badge
 *   - @if (IsModified && CanEdit) gates the .view-actions group
 *   - save button: [disabled]="IsSaving"; spinner vs save icon swap on IsSaving
 *   - action buttons (click) emit Save/SaveAsNew/Revert requests
 */
describe('ViewHeaderComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(ViewHeaderComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ViewHeaderComponent],
      inputs,
    });

  it('renders the view name in display mode', () => {
    const fixture = render({ ViewName: 'My Records' });
    expect(text(fixture, '.view-name')).toBe('My Records');
    expect(query(fixture, '.name-input')).toBeNull();
  });

  it('marks the name editable when CanEdit is true', () => {
    const editable = render({ ViewName: 'V', CanEdit: true });
    expect(hasClass(editable, '.view-name', 'editable')).toBe(true);
  });

  it('does not mark the name editable when CanEdit is false', () => {
    const locked = render({ ViewName: 'V', CanEdit: false });
    expect(hasClass(locked, '.view-name', 'editable')).toBe(false);
  });

  it('switches to an input when editing begins (CanEdit)', () => {
    const fixture = render({ ViewName: 'V', CanEdit: true });
    click(fixture, '.view-name');
    fixture.detectChanges();
    expect(query(fixture, '.name-input')).not.toBeNull();
    expect(query(fixture, '.view-name')).toBeNull();
  });

  it('does not start editing when CanEdit is false', () => {
    const fixture = render({ ViewName: 'V', CanEdit: false });
    click(fixture, '.view-name');
    fixture.detectChanges();
    expect(query(fixture, '.name-input')).toBeNull();
  });

  it('hides the shared and modified badges by default', () => {
    const none = render({ ViewName: 'V' });
    expect(query(none, '.shared-badge')).toBeNull();
    expect(query(none, '.modified-badge')).toBeNull();
  });

  it('shows the shared and modified badges when their inputs are set', () => {
    const both = render({ ViewName: 'V', IsShared: true, IsModified: true, CanEdit: true });
    expect(query(both, '.shared-badge')).not.toBeNull();
    expect(query(both, '.modified-badge')).not.toBeNull();
  });

  it('hides the action group when modified but not editable', () => {
    const notEditable = render({ ViewName: 'V', IsModified: true, CanEdit: false });
    expect(query(notEditable, '.view-actions')).toBeNull();
  });

  it('shows the action group when modified and editable', () => {
    const editable = render({ ViewName: 'V', IsModified: true, CanEdit: true });
    expect(query(editable, '.view-actions')).not.toBeNull();
  });

  it('disables the action buttons while saving', () => {
    const fixture = render({ ViewName: 'V', IsModified: true, CanEdit: true, IsSaving: true });
    expect((query(fixture, '.save-btn') as HTMLButtonElement).disabled).toBe(true);
    expect(query(fixture, '.save-btn .fa-spinner')).not.toBeNull();
  });

  it('emits save/save-as-new/revert requests when their buttons are clicked', () => {
    const fixture = render({ ViewName: 'V', IsModified: true, CanEdit: true });
    const save = capture(fixture.componentInstance.SaveRequested);
    const saveAs = capture(fixture.componentInstance.SaveAsNewRequested);
    const revert = capture(fixture.componentInstance.RevertRequested);

    click(fixture, '.save-btn');
    click(fixture, '.save-as-btn');
    click(fixture, '.revert-btn');

    expect(save.length).toBe(1);
    expect(saveAs.length).toBe(1);
    expect(revert.length).toBe(1);
  });
});

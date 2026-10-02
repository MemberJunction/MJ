import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, text, click, typeInto, capture } from '@memberjunction/ng-test-utils';
import { QuickSaveDialogComponent } from './quick-save-dialog.component';
import { QuickSaveEvent, QuickSaveAdvancedEvent } from '../types';

/**
 * DOM coverage for QuickSaveDialogComponent — the "new view" path (ViewEntity null).
 * Template highlights:
 *   - @if (IsOpen) gates .dialog-backdrop; [class.open] on .dialog-panel
 *   - @if (EntityName) renders the .entity-badge
 *   - @else branch (no ViewEntity) shows a single "Create View" primary button,
 *     [disabled]="!Name.trim() || IsSaving"; (click)=OnSave(true)
 *   - advanced-link (click) -> OnOpenAdvanced -> OpenAdvanced emit
 *   - close button / backdrop / cancel emit Close
 */
describe('QuickSaveDialogComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(QuickSaveDialogComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [QuickSaveDialogComponent],
      inputs,
      autoDetect: true,
    });

  it('hides the backdrop when closed', () => {
    const fixture = render({ IsOpen: false });
    expect(query(fixture, '.dialog-backdrop')).toBeNull();
  });

  it('omits the entity badge when EntityName is unset', () => {
    const without = render({ IsOpen: true });
    expect(query(without, '.entity-badge')).toBeNull();
  });

  it('renders the entity badge when EntityName is set', () => {
    const withName = render({ IsOpen: true, EntityName: 'Contacts' });
    expect(text(withName, '.entity-badge')).toBe('Contacts');
  });

  it('shows the Create View button for a new view', () => {
    const fixture = render({ IsOpen: true });
    expect(text(fixture, '.btn-primary')).toContain('Create View');
    // No existing-view secondary "Save As New" button on the create path
    expect(query(fixture, '.btn-secondary')).toBeNull();
  });

  it('disables Create until a name is entered', () => {
    const fixture = render({ IsOpen: true });
    expect((query(fixture, '.btn-primary') as HTMLButtonElement).disabled).toBe(true);

    typeInto(fixture, '#quickSaveName', 'New View');
    fixture.detectChanges();
    expect((query(fixture, '.btn-primary') as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits a SaveAsNew event with the trimmed name on Create', () => {
    const fixture = render({ IsOpen: true });
    const saves: QuickSaveEvent[] = capture(fixture.componentInstance.Save);
    typeInto(fixture, '#quickSaveName', '  Fresh View  ');
    fixture.detectChanges();
    click(fixture, '.btn-primary');
    expect(saves).toEqual([{ Name: 'Fresh View', Description: '', IsShared: false, SaveAsNew: true }]);
  });

  it('emits OpenAdvanced when the advanced link is clicked', () => {
    const fixture = render({ IsOpen: true });
    const advanced: QuickSaveAdvancedEvent[] = capture(fixture.componentInstance.OpenAdvanced);
    typeInto(fixture, '#quickSaveName', 'Partial');
    fixture.detectChanges();
    click(fixture, '.advanced-link');
    expect(advanced).toEqual([{ Name: 'Partial', Description: '', IsShared: false }]);
  });

  it('emits Close when the cancel button is clicked', () => {
    const fixture = render({ IsOpen: true });
    const close = capture(fixture.componentInstance.Close);
    click(fixture, '.btn-cancel');
    expect(close.length).toBe(1);
  });

  it('renders the column count from the Summary', () => {
    const summary = {
      ColumnCount: 3,
      FilterCount: 0,
      SortCount: 0,
      SmartFilterActive: false,
      SmartFilterPrompt: '',
      AggregateCount: 0,
    };
    const fixture = render({ IsOpen: true, Summary: summary });
    expect(text(fixture, '.summary-items')).toContain('3 columns');
  });

  /**
   * #4220 — a default-view Save that carries a filter is promoted to a named view, so the
   * dialog opens as a name prompt. It seeds a suggested name (one click to accept) and puts
   * the cursor in the field with the text selected (one keystroke to replace).
   */
  describe('suggested name (#4220)', () => {
    it('seeds the name field from SuggestedName when creating a new view', async () => {
      const fixture = render({ IsOpen: true, SuggestedName: 'Accounts — Filtered' });
      expect(fixture.componentInstance.Name).toBe('Accounts — Filtered');
      // ngModel writes the seeded value to the element on a microtask.
      await fixture.whenStable();
      expect((query(fixture, '#quickSaveName') as HTMLInputElement).value).toBe('Accounts — Filtered');
    });

    it('enables Create immediately, so the suggestion is one click away', () => {
      const fixture = render({ IsOpen: true, SuggestedName: 'Accounts — Filtered' });
      expect((query(fixture, '.btn-primary') as HTMLButtonElement).disabled).toBe(false);
    });

    it('emits the suggested name unchanged when accepted as-is', () => {
      const fixture = render({ IsOpen: true, SuggestedName: 'Accounts — Filtered' });
      const saves: QuickSaveEvent[] = capture(fixture.componentInstance.Save);
      click(fixture, '.btn-primary');
      expect(saves).toEqual([
        { Name: 'Accounts — Filtered', Description: '', IsShared: false, SaveAsNew: true },
      ]);
    });

    it('lets the user replace the suggestion', () => {
      const fixture = render({ IsOpen: true, SuggestedName: 'Accounts — Filtered' });
      const saves: QuickSaveEvent[] = capture(fixture.componentInstance.Save);
      typeInto(fixture, '#quickSaveName', 'My Own Name');
      fixture.detectChanges();
      click(fixture, '.btn-primary');
      expect(saves[0].Name).toBe('My Own Name');
    });

    it('leaves the name blank when no suggestion is supplied', () => {
      const fixture = render({ IsOpen: true });
      expect(fixture.componentInstance.Name).toBe('');
      expect((query(fixture, '.btn-primary') as HTMLButtonElement).disabled).toBe(true);
    });

    it('never overrides an existing view name with the suggestion', () => {
      const viewEntity = { Name: 'Existing View', Description: 'desc', IsShared: true };
      const fixture = render({
        IsOpen: true,
        SuggestedName: 'Accounts — Filtered',
        ViewEntity: viewEntity,
      });
      expect(fixture.componentInstance.Name).toBe('Existing View');
    });

    it('focuses and selects the name field so typing replaces the suggestion', async () => {
      const fixture = render({ IsOpen: true, SuggestedName: 'Accounts — Filtered' });
      await fixture.whenStable();
      const input = query(fixture, '#quickSaveName') as HTMLInputElement;
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe('Accounts — Filtered'.length);
    });
  });
});

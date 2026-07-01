import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent, MJAlertComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, createFakeProvider, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { SaveViewAsListDialogComponent } from './save-view-as-list-dialog.component';

// SaveViewAsListDialogComponent is module-declared (standalone: false). It loads list
// categories via RunView in ngOnInit, so it is data-bound — we pass a fake provider so
// `RunView.FromMetadataProvider(this.ProviderToUse)` resolves to canned category rows
// (no backend). The dialog renders inline through mj-dialog. Everything else is pure
// @Input/@Output + getter-driven gating.

const IMPORTS = [CommonModule, FormsModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent, MJAlertComponent];
const DECLARATIONS = [SaveViewAsListDialogComponent];

const CATEGORIES = [
  { ID: 'cat-1', Name: 'Donors' },
  { ID: 'cat-2', Name: 'Volunteers' },
];

function render(inputs: Record<string, unknown> = {}) {
  const provider = createFakeProvider({ runViewResults: CATEGORIES });
  return renderComponentFixture(SaveViewAsListDialogComponent, {
    imports: IMPORTS,
    declarations: DECLARATIONS,
    inputs: { Provider: provider, ...inputs },
  });
}

describe('SaveViewAsListDialogComponent (DOM)', () => {
  it('renders nothing when not Visible', () => {
    const fixture = render({ Visible: false });
    expect(query(fixture, '.save-view-form')).toBeNull();
  });

  it('renders the form when Visible', () => {
    const fixture = render({ Visible: true, ViewId: 'view-1' });
    expect(query(fixture, '.save-view-form')).not.toBeNull();
  });

  describe('info banner', () => {
    it('shows the record count and view name when provided', () => {
      const fixture = render({ Visible: true, ViewId: 'view-1', ViewName: 'Q4 Donors', RecordCount: 120 });
      const banner = text(fixture, 'mj-alert');
      expect(banner).toContain('120 records');
      expect(banner).toContain('Q4 Donors');
    });

    it('shows the generic "view results" copy when no record count is provided', () => {
      const fixture = render({ Visible: true, ViewId: 'view-1' });
      expect(text(fixture, 'mj-alert')).toContain('view results');
    });
  });

  describe('category dropdown', () => {
    it('renders an option per loaded category plus the uncategorized option', async () => {
      const fixture = render({ Visible: true, ViewId: 'view-1' });
      // loadCategories is a fire-and-forget promise kicked off in ngOnInit; flush
      // microtasks until the categories array is populated, then re-render.
      for (let i = 0; i < 5 && fixture.componentInstance.categories.length === 0; i++) {
        await Promise.resolve();
      }
      fixture.detectChanges();
      const options = queryAll(fixture, 'select#save-view-category option');
      // 1 uncategorized + 2 categories
      expect(options.length).toBe(3);
      const labels = options.map((o) => o.textContent?.trim());
      expect(labels).toContain('Donors');
      expect(labels).toContain('Volunteers');
    });
  });

  describe('lineage section', () => {
    it('shows the snapshot freeze + refresh-mode controls when Remember source is selected (default)', () => {
      const fixture = render({ Visible: true, ViewId: 'view-1' });
      expect(query(fixture, '#save-view-freeze')).not.toBeNull();
      expect(query(fixture, '#save-view-mode')).not.toBeNull();
    });

    it('hides the snapshot freeze + refresh-mode controls after choosing one-time snapshot', () => {
      const fixture = render({ Visible: true, ViewId: 'view-1' });
      // The second lineage radio = one-time snapshot → OnLineageChange(false).
      const radios = queryAll(fixture, 'input[name="lineage"]') as HTMLInputElement[];
      radios[1].dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(query(fixture, '#save-view-freeze')).toBeNull();
      expect(query(fixture, '#save-view-mode')).toBeNull();
    });
  });

  describe('save gating', () => {
    it('disables Save when there is no list name', () => {
      const fixture = render({ Visible: true, ViewId: 'view-1' });
      // resetForm runs only when Visible flips false->true via the setter; with ViewName
      // unset, listName stays empty → canSave false.
      const saveBtn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('enables Save once a list name is entered', async () => {
      const fixture = render({ Visible: true, ViewId: 'view-1' });
      await fixture.whenStable();
      fixture.detectChanges();
      const input = query(fixture, '#save-view-list-name') as HTMLInputElement;
      input.value = 'My New List';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();

      const saveBtn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });

  describe('emissions', () => {
    it('emits Save with the form payload when Save is clicked', async () => {
      const fixture = render({ Visible: true, ViewId: 'view-1' });
      const emitted = capture(fixture.componentInstance.Save);
      await fixture.whenStable();
      fixture.detectChanges();

      const input = query(fixture, '#save-view-list-name') as HTMLInputElement;
      input.value = 'My New List';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();

      (query(fixture, 'mj-dialog-actions button') as HTMLButtonElement).click();

      expect(emitted.length).toBe(1);
      expect(emitted[0].ListName).toBe('My New List');
      expect(emitted[0].RememberLineage).toBe(true);
      expect(emitted[0].RefreshMode).toBe('Additive');
    });

    it('emits Cancel when the Cancel button is clicked', () => {
      const fixture = render({ Visible: true, ViewId: 'view-1' });
      const emitted = capture(fixture.componentInstance.Cancel);
      const buttons = queryAll(fixture, 'mj-dialog-actions button') as HTMLButtonElement[];
      const cancel = buttons.find((b) => b.textContent?.trim() === 'Cancel')!;
      cancel.click();
      expect(emitted.length).toBe(1);
    });
  });

  describe('confirm button label', () => {
    it('includes the record count when provided', () => {
      const fixture = render({ Visible: true, ViewId: 'view-1', RecordCount: 42 });
      const saveBtn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(saveBtn.textContent).toContain('42 records');
    });
  });
});

import { describe, expect, it } from 'vitest';
import { RenderComponentFixture, capture, query, queryAll, text } from '@memberjunction/ng-test-utils';

import { SaveAsListDialogComponent, type SaveAsListKeyColumn } from './save-as-list-dialog.component';

// A standalone, pure @Input/@Output form: no provider and no data loading. Inputs are applied in
// key order, so DefaultName and KeyColumns go before Visible, whose setter resets the form from them.

const KEYS: SaveAsListKeyColumn[] = [
  { Column: 'PersonID', EntityName: 'MJ_Members: Persons', EntityDisplayName: 'Persons' },
  { Column: 'ChapterID', EntityName: 'MJ_Members: Chapters', EntityDisplayName: 'Chapters' },
];

function render(inputs: Record<string, unknown> = {}) {
  return RenderComponentFixture(SaveAsListDialogComponent, {
    inputs: { DefaultName: 'Active members', KeyColumns: KEYS, ...inputs, Visible: inputs['Visible'] ?? true },
  });
}

async function settle(fixture: ReturnType<typeof render>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function buttons(fixture: ReturnType<typeof render>): HTMLButtonElement[] {
  return queryAll(fixture, 'mj-dialog-actions button') as HTMLButtonElement[];
}

describe('SaveAsListDialogComponent (DOM)', () => {
  it('renders nothing when not Visible', () => {
    expect(query(render({ Visible: false }), 'form.save-as-list')).toBeNull();
  });

  it('starts from the default name, the first key column, Additive and Refresh automatically off', async () => {
    const fixture = render();
    await settle(fixture);

    expect((query(fixture, '#save-as-list-name') as HTMLInputElement).value).toBe('Active members');
    const options = queryAll(fixture, '#save-as-list-records option').map((o) => o.textContent?.trim());
    expect(options).toEqual(['Persons (column PersonID)', 'Chapters (column ChapterID)']);
    expect(fixture.componentInstance.KeyColumnIndex).toBe(0);
    expect(fixture.componentInstance.RefreshMode).toBe('Additive');
    expect(fixture.componentInstance.AutoRefresh).toBe(false);
  });

  it('says the query will be saved Pending, or names the saved query it links to', () => {
    expect(text(render(), 'mj-alert')).toContain('saved as a draft (Pending) in the User Lists folder');
    expect(text(render({ SavedQueryName: 'Conference attendees' }), 'mj-alert')).toContain('the saved query Conference attendees');
  });

  it('emits Save with what the user chose', async () => {
    const fixture = render();
    const emitted = capture(fixture.componentInstance.Save);
    await settle(fixture);
    const select = query(fixture, '#save-as-list-records') as HTMLSelectElement;
    select.selectedIndex = 1;
    select.dispatchEvent(new Event('change'));
    fixture.componentInstance.RefreshMode = 'Sync';
    fixture.componentInstance.AutoRefresh = true;
    await settle(fixture);

    buttons(fixture)[0].click();

    expect(emitted).toEqual([{ ListName: 'Active members', KeyColumn: KEYS[1], RefreshMode: 'Sync', AutoRefresh: true }]);
  });

  it('disables Create list without a name, and while submitting', async () => {
    const blank = render({ DefaultName: '   ' });
    await settle(blank);
    expect(buttons(blank)[0].disabled).toBe(true);

    const submitting = render({ Submitting: true });
    await settle(submitting);
    expect(buttons(submitting)[0].disabled).toBe(true);
    expect(buttons(submitting)[0].textContent).toContain('Creating...');
  });

  it('shows why the last attempt failed', async () => {
    const fixture = render({ ErrorMessage: 'Not permitted to run this query' });
    await settle(fixture);
    expect(text(fixture, 'form.save-as-list')).toContain('Not permitted to run this query');
  });

  it('emits Cancel, except while submitting', async () => {
    const fixture = render();
    const emitted = capture(fixture.componentInstance.Cancel);
    await settle(fixture);
    buttons(fixture)[1].click();
    expect(emitted.length).toBe(1);

    fixture.componentInstance.Submitting = true;
    fixture.componentInstance.OnCancel();
    expect(emitted.length).toBe(1);
  });
});

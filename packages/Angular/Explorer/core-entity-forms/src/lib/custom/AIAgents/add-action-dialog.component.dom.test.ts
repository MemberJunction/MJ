import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { RunViewParams } from '@memberjunction/core';
import { AddActionDialogComponent } from './add-action-dialog.component';

/**
 * DOM coverage for <mj-add-action-dialog> — a data-bound action picker that loads its list +
 * categories through `RunView.FromMetadataProvider(this.ProviderToUse).RunViews([...])` (so a
 * `createFakeProvider` passed via the `Provider` input feeds canned rows — no backend). It reads
 * NO data-bearing singleton in `ngOnInit`. Covers: the category sidebar (All Actions + per-category
 * nodes with counts), one `.action-card` per action in grid view, the stats line, the empty state
 * when the search matches nothing, selection (`.selected` + Add-button enablement + summary), and
 * the `result` emission on Add / Cancel.
 *
 * `RunViews` comes back ordered [actions, categories]; the fake keys off `EntityName` so each
 * result set is distinct. ngOnInit's async `initializeData()` flips `isLoading$` off after a
 * microtask, so every render does detectChanges(false) → await a macrotask → markForCheck →
 * detectChanges(false) (zoneless).
 */

const ACTIONS = [
  { ID: 'a1', Name: 'Send Email', Description: 'sends an email', Category: 'Communication', Type: 'Custom', IconClass: '', GetAll() { return this; } },
  { ID: 'a2', Name: 'Create Invoice', Description: 'creates invoice', Category: 'Data', Type: 'Custom', IconClass: '', GetAll() { return this; } },
];
const CATEGORIES = [
  { ID: 'c-comm', Name: 'Communication', Status: 'Active' },
  { ID: 'c-data', Name: 'Data', Status: 'Active' },
];

function fakeProvider() {
  return createFakeProvider({
    runViewResults: (params: RunViewParams): Record<string, unknown>[] =>
      params.EntityName === 'MJ: Actions' ? ACTIONS : CATEGORIES,
  });
}

async function render(existingActionIds: string[] = []): Promise<ComponentFixture<AddActionDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [ReactiveFormsModule, MJButtonDirective, MJEmptyStateComponent],
    declarations: [AddActionDialogComponent],
  });
  const fixture = TestBed.createComponent(AddActionDialogComponent);
  const inst = fixture.componentInstance;
  inst.Provider = fakeProvider();
  inst.existingActionIds = existingActionIds;
  fixture.detectChanges(false); // renders loading; ngOnInit kicks off async initializeData()
  await new Promise((r) => setTimeout(r, 0)); // let RunViews settle (isLoading -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<AddActionDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<AddActionDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('AddActionDialogComponent (DOM)', () => {
  it('renders one action card per loaded action with its name + description', async () => {
    const fixture = await render();
    const cards = queryAll(fixture, '.action-card');
    expect(cards.length).toBe(2);
    const names = queryAll(fixture, '.action-name').map((n) => n.textContent?.trim());
    expect(names).toContain('Send Email');
    expect(names).toContain('Create Invoice');
    expect(fixture.nativeElement.textContent).toContain('sends an email');
  });

  it('renders the category sidebar with All Actions plus one node per used category', async () => {
    const fixture = await render();
    const catNames = queryAll(fixture, '.category-name').map((c) => c.textContent?.trim());
    expect(catNames).toContain('All Actions');
    expect(catNames).toContain('Communication');
    expect(catNames).toContain('Data');
    const allNode = queryAll(fixture, '.category-item').find((el) => el.textContent?.includes('All Actions'))!;
    expect(allNode.querySelector('.category-count')?.textContent?.trim()).toBe('2');
  });

  it('shows the total/filtered stats line', async () => {
    const fixture = await render();
    expect(query(fixture, '.stats')?.textContent).toContain('2 of 2 actions');
  });

  it('shows the empty state when the search matches no actions', async () => {
    const fixture = await render();
    const searchInput = query(fixture, '.search-input') as HTMLInputElement;
    searchInput.value = 'zzz-no-match';
    searchInput.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 350)); // debounceTime(300)
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(queryAll(fixture, '.action-card').length).toBe(0);
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
  });

  it('selects a card on click, marking it .selected and enabling Add', async () => {
    const fixture = await render();
    expect(buttonByText(fixture, 'Add Selected').disabled).toBe(true);
    (queryAll(fixture, '.action-card')[0] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(queryAll(fixture, '.action-card')[0].classList.contains('selected')).toBe(true);
    expect(buttonByText(fixture, 'Add Selected').disabled).toBe(false);
    expect(query(fixture, '.selection-summary')?.textContent).toContain('1 action selected');
  });

  it('emits the selected actions via result on Add Selected', async () => {
    const fixture = await render();
    const results: Array<{ ID: string }[]> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    const closed = capture(fixture.componentInstance.DialogClose);
    (queryAll(fixture, '.action-card')[1] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    buttonByText(fixture, 'Add Selected').click();
    expect(results.length).toBe(1);
    expect(results[0].map((a) => a.ID)).toEqual(['a2']);
    expect(closed.length).toBe(1);
  });

  it('emits an empty result on Cancel', async () => {
    const fixture = await render();
    const results: Array<{ ID: string }[]> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    buttonByText(fixture, 'Cancel').click();
    expect(results).toEqual([[]]);
  });
});

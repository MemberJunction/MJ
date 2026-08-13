import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { createFakeProvider } from '@memberjunction/ng-test-utils';
import type { EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import { SimpleRecordListComponent } from './simple-record-list.component';
import { SimpleRecordListModule } from '../module';

/**
 * DOM coverage for <mj-simple-record-list> — a data-bound Explorer list. It loads through the
 * `[Provider]` (`ProviderToUse` → `RunView.FromMetadataProvider(...)`), so specs supply a
 * `createFakeProvider` whose `RunView` returns canned rows and whose `Entities` catalog carries
 * the name-field metadata `getRecordName()` reads. The real `SimpleRecordListModule` is imported
 * so the child components (`mj-loading`, `mj-dialog`, `mj-entity-form-dialog`, `mjButton`) resolve.
 *
 * Change detection is driven explicitly with `detectChanges(false)`: `Refresh()` toggles
 * `isLoading` across an `await`, so the `@if(isLoading)` branch flips during load. A strict
 * `detectChanges()` would raise NG0100 on that transition; `false` skips the dev checkNoChanges
 * pass. Rows are plain objects exposing the `.Get(col)` slice the template uses (`{{ r.Get(c) }}`).
 */

interface FakeRow {
  Get(col: string): string;
}
const makeRow = (vals: Record<string, string>): FakeRow => ({ Get: (c: string) => vals[c] ?? '' });

const ROWS: FakeRow[] = [
  makeRow({ Name: 'Ada Lovelace', Email: 'ada@example.com' }),
  makeRow({ Name: 'Alan Turing', Email: 'alan@example.com' }),
];

// Minimal entity catalog: getRecordName() scans Entities for the IsNameField column.
// The two field props we supply stay type-checked against EntityFieldInfo; one seam cast lifts
// the partial field into the `Fields` array, and the entity itself is a plain Partial<EntityInfo>
// (exactly what createFakeProvider's `entities` option accepts).
const NAME_FIELD = { Name: 'Name', IsNameField: true } satisfies Pick<EntityFieldInfo, 'Name' | 'IsNameField'>;
const ENTITIES: Array<Partial<EntityInfo>> = [{ Name: 'Users', Fields: [NAME_FIELD as unknown as EntityFieldInfo] }];

interface RenderOpts {
  AllowNew?: boolean;
  AllowEdit?: boolean;
  AllowDelete?: boolean;
  AllowCustomAction?: boolean;
  CustomActionIcon?: string;
}

/**
 * Render the list with a fake provider and let the async `ngOnInit → Refresh()` load settle,
 * so the grid is populated before assertions run. One render per test (TestBed is single-use).
 */
async function render(opts: RenderOpts = {}): Promise<ComponentFixture<SimpleRecordListComponent>> {
  TestBed.configureTestingModule({ imports: [SimpleRecordListModule] });
  const fixture = TestBed.createComponent(SimpleRecordListComponent);
  const provider = createFakeProvider<FakeRow>({ runViewResults: ROWS, entities: ENTITIES });
  const ref = fixture.componentRef;
  ref.setInput('Provider', provider);
  ref.setInput('EntityName', 'Users');
  ref.setInput('Columns', ['Name', 'Email']);
  ref.setInput('AllowNew', opts.AllowNew ?? false);
  ref.setInput('AllowEdit', opts.AllowEdit ?? false);
  ref.setInput('AllowDelete', opts.AllowDelete ?? false);
  ref.setInput('AllowCustomAction', opts.AllowCustomAction ?? false);
  ref.setInput('CustomActionIcon', opts.CustomActionIcon ?? '');
  fixture.detectChanges(false); // init → ngOnInit → Refresh() (async); skip strict checkNoChanges
  await new Promise((r) => setTimeout(r, 0)); // let the RunView promise + isLoading toggle settle
  // The component mutates plain properties (no signals / markForCheck), so in zoneless the view
  // isn't marked dirty after the async load — force a check so the loaded grid renders.
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('SimpleRecordListComponent (DOM)', () => {
  it('renders the grid (not the loading indicator) once the load settles', async () => {
    const fixture = await render();
    expect(query(fixture, 'mj-loading')).toBeNull();
    expect(query(fixture, 'table.grid')).not.toBeNull();
  });

  it('renders one column header per Columns entry', async () => {
    const headers = queryAll(await render(), 'thead th').map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Name', 'Email']);
  });

  it('renders one row per loaded record with the cell values from Get()', async () => {
    const fixture = await render();
    const rows = queryAll(fixture, 'tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent ?? '').toContain('Ada Lovelace');
    expect(rows[0].textContent ?? '').toContain('ada@example.com');
  });

  it('hides the New button when AllowNew is false', async () => {
    expect(query(await render({ AllowNew: false }), 'button')).toBeNull();
  });

  it('shows the New button when AllowNew is true', async () => {
    expect(text(await render({ AllowNew: true }), 'button')).toContain('New');
  });

  it('hides the edit icon when AllowEdit is false', async () => {
    expect(queryAll(await render({ AllowEdit: false }), '.fa-pen-to-square').length).toBe(0);
  });

  it('shows one edit icon per row when AllowEdit is true', async () => {
    expect(queryAll(await render({ AllowEdit: true }), '.fa-pen-to-square').length).toBe(2);
  });

  it('hides the delete icon when AllowDelete is false', async () => {
    expect(queryAll(await render({ AllowDelete: false }), '.fa-trash-can').length).toBe(0);
  });

  it('shows one delete icon per row when AllowDelete is true', async () => {
    expect(queryAll(await render({ AllowDelete: true }), '.fa-trash-can').length).toBe(2);
  });

  it('shows the custom-action icon per row when AllowCustomAction is true (alongside edit/delete)', async () => {
    // The action-icon <span> is gated by `@if(i === 0 && (AllowDelete || AllowEdit))`, so the
    // custom-action icon only renders when edit or delete is also enabled — assert that reality.
    const fixture = await render({ AllowCustomAction: true, AllowEdit: true, CustomActionIcon: 'fa-user-lock' });
    expect(queryAll(fixture, '.fa-user-lock').length).toBe(2);
  });

  it('emits RecordSelected with the row when a row is clicked', async () => {
    const fixture = await render();
    const selected = capture(fixture.componentInstance.RecordSelected);
    (queryAll(fixture, 'tbody tr')[0] as HTMLElement).click();
    expect(selected.length).toBe(1);
    expect((selected[0] as unknown as FakeRow).Get('Name')).toBe('Ada Lovelace');
  });

  it('opens the delete confirmation dialog when a row delete icon is clicked', async () => {
    const fixture = await render({ AllowDelete: true });
    expect(query(fixture, 'mj-dialog')).toBeNull();
    (queryAll(fixture, '.fa-trash-can')[0] as HTMLElement).click();
    fixture.detectChanges(false);
    const dialog = query(fixture, 'mj-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Ada Lovelace');
  });
});

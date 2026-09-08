import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { RecordProcessEditorComponent } from './record-process-editor.component';

/**
 * DOM coverage for <mj-record-process-editor> — the Bulk Operations process editor (~4×). It reads
 * provider.Entities for the entity dropdown and edits a passed MJRecordProcessEntity. Specs pass a fake
 * provider + a fake record, and keep EntityID un-matched so the heavy FieldRulesBuilder child stays
 * unrendered (SelectedEntityName empty). Covers the Basics fields, the entity dropdown options, the
 * scope-filter conditional, the Save enable-gate + Save/Cancel wiring, the save-failure error, and the
 * inline field setters.
 */

const ENTITIES = [
  { ID: 'e1', Name: 'Accounts', DisplayName: 'Accounts' },
  { ID: 'e2', Name: 'Contacts', DisplayName: 'Contacts' },
] as Array<Partial<EntityInfo>>;

const makeRecord = (over: Partial<Record<string, unknown>> = {}, save: () => Promise<boolean> = async () => true): MJRecordProcessEntity =>
  ({
    Name: '',
    Status: 'Active',
    Description: '',
    EntityID: '',
    ScopeType: 'Filter',
    ScopeFilter: '',
    WorkType: 'FieldRules',
    Configuration: '',
    Save: save,
    LatestResult: null,
    ...over,
  } as unknown as MJRecordProcessEntity);

function fakeProvider() {
  const p = createFakeProvider({ entities: ENTITIES });
  // resolveEntityName() calls EntityByID; the fake doesn't implement it. Provide a no-match stub so
  // SelectedEntityName stays empty (keeping the heavy FieldRulesBuilder unrendered) without console noise.
  Object.assign(p, { EntityByID: () => undefined });
  return p;
}

const render = (record: MJRecordProcessEntity) =>
  renderComponentFixture(RecordProcessEditorComponent, {
    imports: [RecordProcessEditorComponent],
    inputs: { Record: record, Provider: fakeProvider() },
  });
type Fx = ReturnType<typeof render>;
const nameInput = (f: Fx) => query(f, 'section:first-of-type .mj-input') as HTMLInputElement;

describe('RecordProcessEditorComponent (DOM)', () => {
  it('renders the Basics section with the record name', () => {
    const f = render(makeRecord({ Name: 'Mark idle prompts' }));
    expect(nameInput(f).value).toBe('Mark idle prompts');
  });

  it('renders an entity option per provider entity', () => {
    const f = render(makeRecord());
    const opts = queryAll(f, 'select option').map((o) => o.textContent?.trim());
    expect(opts).toContain('Accounts');
    expect(opts).toContain('Contacts');
  });

  it('shows the scope filter input when ScopeType is Filter', () => {
    const f = render(makeRecord({ ScopeType: 'Filter' }));
    expect(query(f, '.mono')).not.toBeNull();
  });

  it('hides the scope filter input when ScopeType is not Filter', () => {
    const f = render(makeRecord({ ScopeType: 'View' }));
    expect(query(f, '.mono')).toBeNull();
  });

  it('disables Save when the record is not complete (no name / entity)', () => {
    const f = render(makeRecord({ Name: '', EntityID: '' }));
    const save = query(f, '.rpe-bar button') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('enables Save when name + entity are set, and emits Saved after a successful save', async () => {
    const f = render(makeRecord({ Name: 'Cleanup', EntityID: 'zzz-unmatched' }));
    const out = capture(f.componentInstance.Saved);
    const save = query(f, '.rpe-bar button') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    save.click();
    await f.whenStable();
    expect(out.length).toBe(1);
  });

  it('surfaces the error message when the save fails', async () => {
    const rec = makeRecord({ Name: 'Cleanup', EntityID: 'zzz', LatestResult: { CompleteMessage: 'nope' } }, async () => false);
    const f = render(rec);
    await f.componentInstance.Save();
    f.detectChanges(false);
    expect(query(f, '.rpe-err')?.textContent).toContain('nope');
  });

  it('emits Cancelled when the Cancel button is clicked', () => {
    const f = render(makeRecord({ Name: 'X', EntityID: 'e1' }));
    const out = capture(f.componentInstance.Cancelled);
    const buttons = queryAll(f, '.rpe-bar button') as HTMLButtonElement[];
    buttons[buttons.length - 1].click(); // Cancel is the last toolbar button
    expect(out.length).toBe(1);
  });

  it('writes edits back to the record via the inline field setter', () => {
    const rec = makeRecord({ Name: '' });
    const f = render(rec);
    const input = nameInput(f);
    input.value = 'Typed name';
    input.dispatchEvent(new Event('input'));
    expect(rec.Name).toBe('Typed name');
  });
});

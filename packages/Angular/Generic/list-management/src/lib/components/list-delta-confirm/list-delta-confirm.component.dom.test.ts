import { describe, it, expect, vi } from 'vitest';
import type { EntityInfo, EntityRecordNameInput, EntityRecordNameResult, IMetadataProvider } from '@memberjunction/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent, MJAlertComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import type { ListDelta } from '@memberjunction/lists-base';
import { ListDeltaConfirmComponent } from './list-delta-confirm.component';

// ListDeltaConfirmComponent is module-declared (standalone: false). It renders into
// mj-dialog (which projects ng-content inline into the fixture DOM — no CDK overlay),
// and uses mjButton + mj-dialog-actions. It is pure @Input/@Output + getter-driven
// gating; its only data load is the record-name lookup for the preview rows, which the
// tests below drive through a fake provider.

const IMPORTS = [CommonModule, FormsModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent, MJAlertComponent];
const DECLARATIONS = [ListDeltaConfirmComponent];

function makeDelta(overrides: Partial<ListDelta> = {}): ListDelta {
  return {
    TargetListId: 'list-1',
    EntityName: 'Contacts',
    ToAdd: ['a1', 'a2', 'a3'],
    ToRemove: [],
    Unchanged: ['u1', 'u2'],
    Counts: { Add: 3, Remove: 0, Unchanged: 2, SourceTotal: 5, TargetTotal: 2 },
    Warnings: [],
    DeltaToken: 'token-abc',
    ...overrides,
  };
}

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(ListDeltaConfirmComponent, { imports: IMPORTS, declarations: DECLARATIONS, inputs });
}

/**
 * A provider that knows one entity ("Contacts", keyed by ID) and names records from `names`.
 * A record missing from `names` comes back unsuccessful, as the server does for an unknown ID.
 */
function fakeNameProvider(names: Record<string, string>, fail = false) {
  const entity = { Name: 'Contacts' } as unknown as EntityInfo;
  const GetEntityRecordNames = vi.fn(async (info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> => {
    if (fail) throw new Error('network down');
    return info.map((i) => {
      const id = String(i.CompositeKey.KeyValuePairs[0].Value);
      return { EntityName: i.EntityName, CompositeKey: i.CompositeKey, Success: id in names, Status: '', RecordName: names[id] };
    });
  });
  const provider = {
    EntityByName: (name: string) => (name === 'Contacts' ? entity : undefined),
    GetEntityRecordNames,
  } as unknown as IMetadataProvider;
  return { provider, GetEntityRecordNames };
}

/** Lets the async name lookup settle, then re-renders. */
async function settle(fixture: { detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

describe('ListDeltaConfirmComponent (DOM)', () => {
  it('renders nothing when not Visible', () => {
    const fixture = render({ Visible: false, Delta: makeDelta() });
    expect(query(fixture, '.mj-dialog-backdrop')).toBeNull();
    expect(query(fixture, '.delta-confirm-body')).toBeNull();
  });

  it('renders nothing when Visible but Delta is null', () => {
    const fixture = render({ Visible: true, Delta: null });
    expect(query(fixture, '.delta-confirm-body')).toBeNull();
  });

  it('renders the dialog body when Visible with a Delta', () => {
    const fixture = render({ Visible: true, Delta: makeDelta() });
    expect(query(fixture, '.delta-confirm-body')).not.toBeNull();
  });

  describe('safe operation (no removals)', () => {
    it('shows the safe banner and not the danger banner', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      expect(query(fixture, 'mj-alert.mj-alert--success')).not.toBeNull();
      expect(query(fixture, 'mj-alert.mj-alert--error')).toBeNull();
    });

    it('does not apply the danger modifier to the body', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      expect(hasClass(fixture, '.delta-confirm-body', 'delta-confirm-body--danger')).toBe(false);
    });

    it('renders the add/unchanged/remove count tiles', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      expect(text(fixture, '.delta-tile--add .delta-tile__count')).toBe('+3');
      expect(text(fixture, '.delta-tile--keep .delta-tile__count')).toBe('2');
      // No drops: the remove tile shows the count with no minus sign.
      expect(text(fixture, '.delta-tile--remove-empty .delta-tile__count')).toBe('0');
    });

    it('enables the confirm button immediately', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      const btn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('emits Confirm with the delta token on click', () => {
      const fixture = render({ Visible: true, Delta: makeDelta({ DeltaToken: 'safe-token' }) });
      const emitted = capture(fixture.componentInstance.Confirm);
      click(fixture, 'mj-dialog-actions button');
      expect(emitted).toEqual(['safe-token']);
    });
  });

  describe('drop-warning operation (removals present)', () => {
    const dropDelta = () =>
      makeDelta({
        ToRemove: ['r1', 'r2'],
        Counts: { Add: 3, Remove: 2, Unchanged: 2, SourceTotal: 5, TargetTotal: 4 },
      });

    it('shows the danger banner and the acknowledgement checkbox', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      expect(query(fixture, 'mj-alert.mj-alert--error')).not.toBeNull();
      expect(query(fixture, 'mj-alert.mj-alert--success')).toBeNull();
      expect(query(fixture, '.delta-banner__ack input[type="checkbox"]')).not.toBeNull();
    });

    it('applies the danger modifier to the body', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      expect(hasClass(fixture, '.delta-confirm-body', 'delta-confirm-body--danger')).toBe(true);
    });

    it('renders the remove tile with a minus-prefixed count', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      expect(text(fixture, '.delta-tile--remove .delta-tile__count')).toBe('−2');
    });

    it('disables the confirm button until the user acknowledges', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      const btn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('does not emit Confirm while the button is disabled', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      const emitted = capture(fixture.componentInstance.Confirm);
      click(fixture, 'mj-dialog-actions button');
      expect(emitted).toEqual([]);
    });

    it('enables and emits Confirm after the acknowledgement checkbox is checked', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      const emitted = capture(fixture.componentInstance.Confirm);

      const ack = query(fixture, '.delta-banner__ack input[type="checkbox"]') as HTMLInputElement;
      ack.checked = true;
      ack.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const btn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);

      btn.click();
      expect(emitted).toEqual(['token-abc']);
    });
  });

  describe('preview lists', () => {
    it('renders add preview rows limited by PreviewLimit', () => {
      const fixture = render({
        Visible: true,
        Delta: makeDelta({ ToAdd: ['a1', 'a2', 'a3', 'a4', 'a5'], Counts: { Add: 5, Remove: 0, Unchanged: 0, SourceTotal: 5, TargetTotal: 0 } }),
        PreviewLimit: 2,
      });
      expect(queryAll(fixture, '.delta-preview__row--add').length).toBe(2);
    });

    it('renders remove preview rows when drops are present', () => {
      const fixture = render({
        Visible: true,
        Delta: makeDelta({ ToRemove: ['r1', 'r2', 'r3'], Counts: { Add: 0, Remove: 3, Unchanged: 0, SourceTotal: 0, TargetTotal: 3 } }),
        PreviewLimit: 5,
      });
      expect(queryAll(fixture, '.delta-preview__row--remove').length).toBe(3);
    });
  });

  describe('record names in the preview', () => {
    const rowTexts = (fixture: Parameters<typeof queryAll>[0], kind: 'add' | 'remove') =>
      queryAll(fixture, `.delta-preview__row--${kind}`).map((row) => ({
        name: row.querySelector('.delta-preview__name')?.textContent?.trim() ?? null,
        id: row.querySelector('.delta-preview__id')?.textContent?.trim() ?? null,
      }));

    it('shows each record\'s name with its ID beside it', async () => {
      const { provider } = fakeNameProvider({ a1: 'Ada Lovelace', a2: 'Grace Hopper', r1: 'Alan Turing' });
      const fixture = render({
        Visible: true,
        Provider: provider,
        Delta: makeDelta({ ToAdd: ['a1', 'a2'], ToRemove: ['r1'], Counts: { Add: 2, Remove: 1, Unchanged: 0, SourceTotal: 2, TargetTotal: 1 } }),
      });
      await settle(fixture);
      expect(rowTexts(fixture, 'add')).toEqual([
        { name: 'Ada Lovelace', id: 'a1' },
        { name: 'Grace Hopper', id: 'a2' },
      ]);
      expect(rowTexts(fixture, 'remove')).toEqual([{ name: 'Alan Turing', id: 'r1' }]);
    });

    it('keeps the ID alone for a record with no name', async () => {
      const { provider } = fakeNameProvider({ a1: 'Ada Lovelace', a2: '   ' });
      const fixture = render({ Visible: true, Provider: provider, Delta: makeDelta() });
      await settle(fixture);
      expect(rowTexts(fixture, 'add')).toEqual([
        { name: 'Ada Lovelace', id: 'a1' },
        { name: null, id: 'a2' },
        { name: null, id: 'a3' },
      ]);
    });

    it('looks up only the records it previews', async () => {
      const { provider, GetEntityRecordNames } = fakeNameProvider({});
      const fixture = render({
        Visible: true,
        Provider: provider,
        PreviewLimit: 2,
        Delta: makeDelta({ ToAdd: ['a1', 'a2', 'a3', 'a4'], ToRemove: ['r1', 'r2', 'r3'], Counts: { Add: 4, Remove: 3, Unchanged: 0, SourceTotal: 4, TargetTotal: 3 } }),
      });
      await settle(fixture);
      expect(GetEntityRecordNames).toHaveBeenCalledTimes(1);
      const asked = GetEntityRecordNames.mock.calls[0][0].map((i) => String(i.CompositeKey.KeyValuePairs[0].Value));
      expect(asked).toEqual(['a1', 'a2', 'r1', 'r2']);
    });

    it('shows IDs when the lookup fails', async () => {
      const { provider } = fakeNameProvider({ a1: 'Ada Lovelace' }, true);
      const fixture = render({ Visible: true, Provider: provider, Delta: makeDelta() });
      await settle(fixture);
      expect(rowTexts(fixture, 'add').map((r) => r.name)).toEqual([null, null, null]);
      expect(rowTexts(fixture, 'add').map((r) => r.id)).toEqual(['a1', 'a2', 'a3']);
    });

    it('shows IDs when the entity is unknown, without a lookup', async () => {
      const { provider, GetEntityRecordNames } = fakeNameProvider({ a1: 'Ada Lovelace' });
      const fixture = render({ Visible: true, Provider: provider, Delta: makeDelta({ EntityName: 'Nope' }) });
      await settle(fixture);
      expect(GetEntityRecordNames).not.toHaveBeenCalled();
      expect(rowTexts(fixture, 'add').map((r) => r.name)).toEqual([null, null, null]);
    });

    it('drops names from an earlier delta', async () => {
      const { provider } = fakeNameProvider({ a1: 'Ada Lovelace', b1: 'Barbara Liskov' });
      const fixture = render({ Visible: true, Provider: provider, Delta: makeDelta({ ToAdd: ['a1'] }) });
      await settle(fixture);
      fixture.componentRef.setInput('Delta', makeDelta({ ToAdd: ['b1'] }));
      await settle(fixture);
      expect(rowTexts(fixture, 'add')).toEqual([{ name: 'Barbara Liskov', id: 'b1' }]);
    });
  });

  describe('target name binding', () => {
    it('renders the provided target list name', () => {
      const fixture = render({ Visible: true, Delta: makeDelta(), TargetListName: 'VIP Donors' });
      expect(text(fixture, '.delta-confirm-intro')).toContain('VIP Donors');
    });

    it('falls back to "this list" when no name is provided', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      expect(text(fixture, '.delta-confirm-intro')).toContain('this list');
    });
  });

  describe('cancel', () => {
    it('emits Cancel when the Cancel button is clicked', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      const emitted = capture(fixture.componentInstance.Cancel);
      const buttons = queryAll(fixture, 'mj-dialog-actions button') as HTMLButtonElement[];
      const cancel = buttons.find((b) => b.textContent?.trim() === 'Cancel')!;
      cancel.click();
      expect(emitted.length).toBe(1);
    });
  });
});

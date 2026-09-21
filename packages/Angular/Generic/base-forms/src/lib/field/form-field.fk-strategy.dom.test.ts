/**
 * DOM spec for the foreign-key lookup seam in <mj-form-field>.
 *
 * The main `form-field.component.dom.test.ts` deliberately defers the FK path because it
 * reaches two process singletons. The seam is what makes it testable: a registered
 * {@link FKLookupStrategy} supplies the rows, so the only thing left to stub is the provider's
 * entity metadata. `LinkedFieldOptionsStore` still goes through `UserInfoEngine`, which is
 * mocked here the same way its own spec mocks it.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Component, Input, Output, EventEmitter, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, createFakeProvider } from '@memberjunction/ng-test-utils';
import { BaseEntity, BaseEngineRegistry, EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

const settings = vi.hoisted(() => ({ backing: new Map<string, string>() }));

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    Instance: {
      GetSetting: (key: string) => settings.backing.get(key),
      SetSettingDebounced: (key: string, value: string) => {
        settings.backing.set(key, value);
      },
    },
  },
}));

import { MjFormFieldComponent } from './form-field.component';
import { FKLookupStrategy, type FKLookupContext, type FKLookupGroup } from './fk-lookup-strategy';
import { DefaultFKLookupStrategy } from './default-fk-lookup-strategy';
import { LinkedFieldOptionsStore } from './linked-field-options';

// ---- Inert child stubs (template compile only) ----

@Component({ standalone: true, selector: 'mj-markdown', template: '' })
class StubMarkdownComponent {
  @Input() data = '';
}

@Component({ standalone: true, selector: 'mj-code-editor', template: '' })
class StubCodeEditorComponent {
  @Input() value = '';
  @Input() language = '';
  @Input() readonly = false;
  @Output() change = new EventEmitter<string>();
}

@Pipe({ standalone: true, name: 'mjSafeRichHtml' })
class StubSafeRichHtmlPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ---- Fixtures ----

class TestOrderEntity extends BaseEntity {}

const ORDER_ID = '11111111-2222-3333-4444-555555555555';
const CUSTOMER_ID = 'c1111111-0000-0000-0000-000000000001';
const RECENT_ID = 'c1111111-0000-0000-0000-000000000002';

function orderEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000001',
    Name: 'Test Orders',
    Status: 'Active',
    BaseTable: 'TestOrder',
    BaseView: 'vwTestOrders',
    Fields: [
      { ID: 'O1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'O2', Name: 'OrderNumber', Type: 'nvarchar', Length: 40, AllowsNull: false, AllowUpdateAPI: true },
      {
        ID: 'O3',
        Name: 'PartyID',
        DisplayName: 'Bill To',
        Type: 'uniqueidentifier',
        AllowsNull: true,
        AllowUpdateAPI: true,
        RelatedEntity: 'Test Parties',
        RelatedEntityFieldName: 'ID',
      },
    ],
  });
}

function partyEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000002-0000-0000-0000-000000000002',
    Name: 'Test Parties',
    Status: 'Active',
    BaseTable: 'Party',
    BaseView: 'vwParties',
    Fields: [
      { ID: 'P1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
      { ID: 'P2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, IsNameField: true },
      { ID: 'P3', Name: 'City', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true },
    ],
  });
}

/** A strategy that groups, decorates and offers a second population — everything the seam carries. */
class GroupedTestStrategy extends FKLookupStrategy {
  public static LastContext: FKLookupContext | null = null;

  public override ScopeLabels(): { primary: string; all: string } {
    return { primary: 'Customers', all: 'All parties' };
  }

  public async Lookup(context: FKLookupContext): Promise<FKLookupGroup[]> {
    GroupedTestStrategy.LastContext = context;
    return [
      {
        Key: 'customers',
        Label: 'Customers',
        Rows: [
          {
            Values: { ID: CUSTOMER_ID, Name: 'Northwind Institute', City: 'Springfield' },
            Secondary: 'Springfield, IL · northwind.example.org',
            Chips: [{ Text: '4 orders' }],
          },
        ],
      },
      {
        Key: 'all',
        Label: null,
        Rows: [{ Values: { ID: 'x1', Name: 'Southwind Logistics', City: 'Riverton' } }],
      },
    ];
  }
}

/**
 * A strategy that reuses MJ's querying by subclassing the default — the shape the docs
 * recommend, and the one an `instanceof DefaultFKLookupStrategy` test would misread as
 * "no strategy registered".
 */
class DerivedTestStrategy extends DefaultFKLookupStrategy {
  public static Ran = false;

  public override async Lookup(context: FKLookupContext): Promise<FKLookupGroup[]> {
    DerivedTestStrategy.Ran = true;
    return super.Lookup(context);
  }
}

function makeOrder(values: Record<string, unknown> = {}): BaseEntity {
  const record = new TestOrderEntity(orderEntityInfo());
  record.SetMany({ ID: ORDER_ID, OrderNumber: 'ORD-000001', PartyID: null, ...values }, true, true);
  return record;
}

/**
 * `createFakeProvider` does not implement `GetEntityRecordName`, which the field calls to
 * resolve the display name once a value is set. Supply it so picking a row does not throw
 * during the re-render that follows.
 */
function fkProvider(rows: Record<string, unknown>[] = []): IMetadataProvider {
  const provider = createFakeProvider({
    runViewResults: rows,
    entityByName: (name: string) =>
      name === 'Test Parties' ? partyEntityInfo() : name === 'Test Orders' ? orderEntityInfo() : undefined,
  });
  provider.GetEntityRecordName = async () => 'Northwind Institute';
  return provider;
}

function renderFK(inputs: Record<string, unknown> = {}): ComponentFixture<MjFormFieldComponent> {
  const provider = fkProvider();
  return renderComponentFixture(MjFormFieldComponent, {
    declarations: [MjFormFieldComponent],
    imports: [CommonModule, StubMarkdownComponent, StubCodeEditorComponent, StubSafeRichHtmlPipe],
    inputs: {
      Record: makeOrder(),
      FieldName: 'PartyID',
      EditMode: true,
      Provider: provider,
      FKLookupOptions: { ScopeField: 'BillToOrganizationID' },
      ...inputs,
    },
  });
}

async function openDropdown(fixture: ComponentFixture<MjFormFieldComponent>): Promise<void> {
  const input = query(fixture, 'input.mj-forms-field-input');
  if (!input) throw new Error('no FK input rendered');
  input.dispatchEvent(new FocusEvent('focus'));
  await fixture.whenStable();
  fixture.detectChanges();
}

function mousedown(fixture: ComponentFixture<MjFormFieldComponent>, selector: string): void {
  const el = query(fixture, selector);
  if (!el) throw new Error(`mousedown(): no element matched "${selector}"`);
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('mj-form-field FK lookup strategy', () => {
  beforeAll(() => {
    MJGlobal.Instance.ClassFactory.Register(FKLookupStrategy, GroupedTestStrategy, 'Test Orders.PartyID');
  });

  beforeEach(() => {
    settings.backing.clear();
    GroupedTestStrategy.LastContext = null;
  });

  it('renders the strategy group headers, a second line and chips', async () => {
    const f = renderFK();
    await openDropdown(f);

    expect(text(f, '.mj-fk-group-head')).toContain('Customers');
    expect(text(f, '.mj-fk-secondary')).toContain('Springfield, IL');
    expect(text(f, '.mj-fk-chip')).toContain('4 orders');
    expect(queryAll(f, '.mj-fk-grid-row:not(.mj-fk-grid-row--header):not(.mj-fk-group-head)')).toHaveLength(2);
  });

  it('hands the strategy its options, the scope and the field list', async () => {
    const f = renderFK();
    await openDropdown(f);

    const context = GroupedTestStrategy.LastContext;
    expect(context?.Options['ScopeField']).toBe('BillToOrganizationID');
    expect(context?.Scope).toBe('primary');
    expect(context?.Query).toBe('');
    expect(context?.PkField).toBe('ID');
    expect(context?.NameField).toBe('Name');
    expect(context?.RelatedEntity.Name).toBe('Test Parties');
  });

  it('passes the field inputs through as filter and order-by options', async () => {
    const f = renderFK({ FKExtraFilter: `Kind = 'Org'`, FKOrderBy: '[City]' });
    await openDropdown(f);

    expect(GroupedTestStrategy.LastContext?.Options['ExtraFilter']).toBe(`Kind = 'Org'`);
    expect(GroupedTestStrategy.LastContext?.Options['OrderBy']).toBe('[City]');
  });

  it('shows the strategy scope toggle and flips the scope when it is clicked', async () => {
    const f = renderFK();
    await openDropdown(f);

    // The toggle names the population you would switch TO.
    expect(text(f, '.mj-fk-scope-toggle')).toContain('All parties');

    mousedown(f, '.mj-fk-scope-toggle');
    await f.whenStable();
    f.detectChanges();

    expect(GroupedTestStrategy.LastContext?.Scope).toBe('all');
    expect(text(f, '.mj-fk-scope-toggle')).toContain('Customers');
  });

  it('records a pick as a recent pick for this host entity and field', async () => {
    const f = renderFK();
    await openDropdown(f);

    mousedown(f, '.mj-fk-grid-row:not(.mj-fk-grid-row--header):not(.mj-fk-group-head)');
    await f.whenStable();

    expect(LinkedFieldOptionsStore.Instance.RecentPicks('Test Orders', 'PartyID')[0]).toBe(CUSTOMER_ID);
    expect(f.componentInstance.Value).toBe(CUSTOMER_ID);
  });

  it('does not write the value when the strategy vetoes the pick', async () => {
    const veto = vi.spyOn(GroupedTestStrategy.prototype, 'BeforeSelect').mockResolvedValue(false);
    try {
      const f = renderFK();
      await openDropdown(f);

      mousedown(f, '.mj-fk-grid-row:not(.mj-fk-grid-row--header):not(.mj-fk-group-head)');
      await f.whenStable();

      expect(f.componentInstance.Value).toBeNull();
      expect(LinkedFieldOptionsStore.Instance.RecentPicks('Test Orders', 'PartyID')).toEqual([]);
    } finally {
      veto.mockRestore();
    }
  });

  it('runs a registered strategy even when an engine caches the related entity unfiltered', async () => {
    // The in-memory cached path filters by name over every cached row — precisely the answer a
    // registered strategy exists to replace — so it must yield.
    const cached = vi
      .spyOn(BaseEngineRegistry.Instance, 'TryGetCachedRecords')
      .mockReturnValue([{ Get: () => 'Southwind Logistics' }] as unknown as BaseEntity[]);
    try {
      const f = renderFK();
      await openDropdown(f);

      expect(GroupedTestStrategy.LastContext).not.toBeNull();
      expect(text(f, '.mj-fk-group-head')).toContain('Customers');
    } finally {
      cached.mockRestore();
    }
  });

  it('runs a registered strategy that subclasses the default, which the cache must not preempt', async () => {
    // A strategy is "registered" or not; whether it happens to extend DefaultFKLookupStrategy to
    // reuse MJ's querying must not decide it, or this one would be silently bypassed.
    MJGlobal.Instance.ClassFactory.Register(FKLookupStrategy, DerivedTestStrategy, 'Test Parties');
    DerivedTestStrategy.Ran = false;

    const cached = vi
      .spyOn(BaseEngineRegistry.Instance, 'TryGetCachedRecords')
      .mockReturnValue([{ Get: () => 'Southwind Logistics' }] as unknown as BaseEntity[]);
    try {
      // A host with no field-level registration falls through to the 'Test Parties' one.
      const f = renderFK({ Record: makeOrder(), FieldName: 'PartyID' });
      (f.componentInstance.Record.EntityInfo as { Name: string }).Name = 'Other Orders';
      await openDropdown(f);

      expect(DerivedTestStrategy.Ran).toBe(true);
    } finally {
      cached.mockRestore();
    }
  });

  it('offers the user recent picks above the strategy rows on the browse list', async () => {
    LinkedFieldOptionsStore.Instance.PushRecentPick('Test Orders', 'PartyID', RECENT_ID);

    // The recent-pick hydration is the only RunView the field itself issues.
    const f = renderFK({
      Provider: fkProvider([{ ID: RECENT_ID, Name: 'Eastwind Co', City: 'Riverton' }]),
    });
    await openDropdown(f);

    expect(text(f, '.mj-fk-group-head')).toContain('Recent');
    expect(f.componentInstance.FKGroups.map(g => g.Key)).toEqual(['__recent', 'customers', 'all']);
  });

  it('lists a recent pick once when the strategy already offers it, and never the linked value', async () => {
    LinkedFieldOptionsStore.Instance.PushRecentPick('Test Orders', 'PartyID', CUSTOMER_ID);
    LinkedFieldOptionsStore.Instance.PushRecentPick('Test Orders', 'PartyID', RECENT_ID);

    // RECENT_ID is the linked value, so it is pinned above the grid; CUSTOMER_ID is already a
    // strategy row. Neither belongs under "Recent", and no empty header may remain.
    const f = renderFK({
      Record: makeOrder({ PartyID: RECENT_ID }),
      Provider: fkProvider([{ ID: CUSTOMER_ID, Name: 'Northwind Institute', City: 'Springfield' }]),
    });
    await openDropdown(f);

    expect(f.componentInstance.FKGroups.map(g => g.Key)).toEqual(['customers', 'all']);
    expect(text(f, '.mj-fk-group-head')).not.toContain('Recent');
  });

  it('hands BeforeSelect the row the strategy returned, not a rebuilt key and name', async () => {
    const veto = vi.spyOn(GroupedTestStrategy.prototype, 'BeforeSelect').mockResolvedValue(true);
    try {
      const f = renderFK();
      await openDropdown(f);
      mousedown(f, '.mj-fk-grid-row:not(.mj-fk-grid-row--header):not(.mj-fk-group-head)');
      await f.whenStable();

      const row = veto.mock.calls[0][1];
      expect(row.Values['City']).toBe('Springfield');
      expect(row.Chips?.[0]?.Text).toBe('4 orders');
    } finally {
      veto.mockRestore();
    }
  });
});

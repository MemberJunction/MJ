import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { SavedColumnsMatchEntity } from '../lib/utils/record.util';
import { ViewConfigPanelComponent } from '../lib/view-config-panel/view-config-panel.component';
import { ViewWorkspaceComponent } from '../lib/view-workspace/view-workspace.component';
import type { ViewGridState } from '../lib/types';

/**
 * A saved view layout that belongs to a DIFFERENT entity, as seen from the view settings panel.
 *
 * Follow-up to MemberJunction/MJ#4656. The grid now refuses a foreign saved state's aggregates — they
 * are raw SQL with their own labels, so computed against the wrong entity they produce a plausible
 * number under someone else's label. The settings panel undid that refusal through ordinary use:
 *
 *  1. It loaded the foreign aggregates verbatim, so it listed "Open Orders" as configured while the
 *     grid showed no card for it.
 *  2. It hid every column, because none of the foreign column names matched and it hides first,
 *     then shows matches — so the panel opened with every box unticked.
 *  3. On save it wrote THIS entity's real columns next to whatever aggregates it held. Even when it
 *     held none, `view-workspace` reads a missing aggregates config as "keep the existing ones" and
 *     restores the foreign aggregates from the live state. Real columns plus foreign aggregates is a
 *     state the grid now believes, so it computes them: the wrong numbers come back, and stay.
 *
 * The panel now applies the grid's own rule — a saved column list naming none of this entity's
 * fields did not come from it — shows the entity's default columns, does not load the aggregates,
 * TELLS the user why, and on save writes an explicit "no aggregates" so nothing restores them.
 */

function makeEntity(id: string, name: string, fields: { Name: string; DefaultInView: boolean }[]): EntityInfo {
  const table = name.replace(/\W/g, '');
  return new EntityInfo({
    ID: id,
    Name: name,
    Status: 'Active',
    BaseTable: table,
    BaseView: `vw${table}`,
    Fields: fields.map((f, i) => ({
      ID: `${id}-F${i}`, Name: f.Name, Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: f.DefaultInView,
    })),
  });
}

const CARE_LOGS = makeEntity('E0000008-0000-0000-0000-000000000001', 'MJ: Care Logs', [
  { Name: 'CareDate', DefaultInView: true },
  { Name: 'CareType', DefaultInView: true },
  { Name: 'Notes', DefaultInView: false },
]);

const ORDERS_AGGREGATES = {
  expressions: [
    { id: 'o1', expression: 'COUNT(*)', displayType: 'card', label: 'Open Orders', enabled: true },
    { id: 'o2', expression: 'SUM(OrderTotal)', displayType: 'card', label: 'Revenue', enabled: true },
  ],
};

function stateOf(columnNames: string[], aggregates?: unknown): ViewGridState {
  return {
    columnSettings: columnNames.map((Name, orderIndex) => ({ Name, orderIndex, hidden: false })),
    aggregates,
  } as unknown as ViewGridState;
}

type PanelInternals = {
  initializeFromEntity(): void;
  buildAggregatesConfig(): { expressions?: unknown[] } | null;
  Columns: { fieldName: string; visible: boolean }[];
  Aggregates: unknown[];
};

function openPanel(state: ViewGridState | null): ViewConfigPanelComponent {
  const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
  const panel = new ViewConfigPanelComponent(cdr);
  panel.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
  panel.Entity = CARE_LOGS;
  panel.CurrentGridState = state;
  (panel as unknown as PanelInternals).initializeFromEntity();
  return panel;
}

function internalsOf(panel: ViewConfigPanelComponent): PanelInternals {
  return panel as unknown as PanelInternals;
}

function visibleColumns(panel: ViewConfigPanelComponent): string[] {
  return internalsOf(panel).Columns.filter(c => c.visible).map(c => c.fieldName);
}

describe('SavedColumnsMatchEntity — the shared "does this saved layout belong here" rule', () => {
  it('is false when the saved columns name none of the entity\'s fields', () => {
    expect(SavedColumnsMatchEntity(['OrderNumber', 'OrderTotal'], CARE_LOGS)).toBe(false);
  });

  it('is true when at least one saved column names a field — a partial match is a real preference', () => {
    expect(SavedColumnsMatchEntity(['CareDate', 'FieldTheSchemaDropped'], CARE_LOGS)).toBe(true);
  });

  it('matches case-insensitively, as the grid does', () => {
    expect(SavedColumnsMatchEntity(['caredate'], CARE_LOGS)).toBe(true);
  });

  it('is true when there is no evidence either way', () => {
    expect(SavedColumnsMatchEntity([], CARE_LOGS)).toBe(true);
    expect(SavedColumnsMatchEntity(undefined, CARE_LOGS)).toBe(true);
    expect(SavedColumnsMatchEntity(['OrderNumber'], null)).toBe(true);
  });
});

describe('ViewConfigPanelComponent — a saved layout from a different entity', () => {
  it('does not load the foreign aggregates, and counts them so it can say so', () => {
    const panel = openPanel(stateOf(['OrderNumber', 'OrderTotal'], ORDERS_AGGREGATES));

    expect(internalsOf(panel).Aggregates).toEqual([]);
    expect(panel.RefusedAggregateCount).toBe(2);
  });

  it('shows the entity\'s default columns instead of hiding every column', () => {
    const panel = openPanel(stateOf(['OrderNumber', 'OrderTotal'], ORDERS_AGGREGATES));

    expect(visibleColumns(panel)).toEqual(['CareDate', 'CareType']);
  });

  it('explains it to the user instead of failing silently', () => {
    const panel = openPanel(stateOf(['OrderNumber', 'OrderTotal'], ORDERS_AGGREGATES));

    expect(panel.ForeignSavedLayout).toBe(true);
    expect(panel.ForeignSavedLayoutMessage).toContain('different kind of record');
    expect(panel.ForeignSavedLayoutMessage).toContain('2 aggregates');
    expect(panel.ForeignSavedLayoutMessage).toContain('Saving replaces');
  });

  it('applies the same rule to the view record\'s own columns when there is no live state', () => {
    // The record's `Columns` are parsed from the same saved state, so they carry the same foreign names.
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const panel = new ViewConfigPanelComponent(cdr);
    panel.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
    panel.Entity = CARE_LOGS;
    panel.CurrentGridState = null;
    panel.ViewEntity = {
      Columns: [{ Name: 'OrderNumber', hidden: false, orderIndex: 0 }],
      FilterState: null,
    } as unknown as ViewConfigPanelComponent['ViewEntity'];
    internalsOf(panel).initializeFromEntity();

    expect(panel.ForeignSavedLayout).toBe(true);
    expect(visibleColumns(panel)).toEqual(['CareDate', 'CareType']);
  });

  it('writes an EXPLICIT "no aggregates" on save, so the foreign ones cannot be restored', () => {
    const panel = openPanel(stateOf(['OrderNumber', 'OrderTotal'], ORDERS_AGGREGATES));

    const saved = internalsOf(panel).buildAggregatesConfig();

    expect(saved).not.toBeNull();
    expect(saved?.expressions).toEqual([]);
  });
});

describe('ViewConfigPanelComponent — a saved layout that belongs to this entity is untouched', () => {
  it('loads its aggregates and columns as before, with no notice', () => {
    const own = { expressions: [{ id: 'c1', expression: 'COUNT(*)', displayType: 'card', label: 'Care Logs', enabled: true }] };
    const panel = openPanel(stateOf(['Notes'], own));

    expect(internalsOf(panel).Aggregates).toHaveLength(1);
    expect(visibleColumns(panel)).toEqual(['Notes']);
    expect(panel.ForeignSavedLayout).toBe(false);
    expect(panel.RefusedAggregateCount).toBe(0);
  });

  it('still says "no opinion" (null) when the layout never had aggregates', () => {
    const panel = openPanel(stateOf(['CareDate']));
    expect(internalsOf(panel).buildAggregatesConfig()).toBeNull();
  });

  it('writes an explicit empty config when the user removes the last aggregate', () => {
    // The same null-means-keep reading in view-workspace used to make this deletion silently not stick.
    const own = { expressions: [{ id: 'c1', expression: 'COUNT(*)', displayType: 'card', label: 'Care Logs', enabled: true }] };
    const panel = openPanel(stateOf(['CareDate'], own));
    internalsOf(panel).Aggregates.length = 0;

    expect(internalsOf(panel).buildAggregatesConfig()?.expressions).toEqual([]);
  });
});

describe('ViewWorkspaceComponent — saving from the panel', () => {
  type WorkspaceInternals = {
    _entity: EntityInfo | null;
    CurrentGridState: ViewGridState | null;
    buildGridState(event: unknown): { aggregates?: { expressions?: unknown[] } } | null;
  };

  function saveEvent(aggregatesConfig: unknown) {
    return {
      Name: 'v', Description: '', IsShared: false, SaveAsNew: false,
      Columns: [{ fieldId: 'f1', fieldName: 'CareDate', displayName: 'Care Date', width: null }],
      SortField: null, SortDirection: 'asc', SortItems: [],
      SmartFilterEnabled: false, SmartFilterPrompt: '', FilterState: null,
      AggregatesConfig: aggregatesConfig,
    };
  }

  function workspaceWithLiveState(state: ViewGridState): WorkspaceInternals {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const ws = new ViewWorkspaceComponent(cdr) as unknown as WorkspaceInternals;
    ws._entity = CARE_LOGS;
    ws.CurrentGridState = state;
    return ws;
  }

  it('does not restore foreign aggregates from the live state when the panel says "none"', () => {
    // End to end through the save path: the panel's explicit empty config must survive the merge.
    const panel = openPanel(stateOf(['OrderNumber'], ORDERS_AGGREGATES));
    const ws = workspaceWithLiveState(stateOf(['OrderNumber'], ORDERS_AGGREGATES));

    const saved = ws.buildGridState(saveEvent(internalsOf(panel).buildAggregatesConfig()));

    expect(saved?.aggregates?.expressions ?? []).toEqual([]);
  });

  it('still falls back to the live aggregates when the panel has no opinion', () => {
    // The fallback itself is right for a panel that never touched aggregates; only "none" must win.
    const ws = workspaceWithLiveState(stateOf(['CareDate'], { expressions: [{ id: 'c1' }] }));

    expect(ws.buildGridState(saveEvent(null))?.aggregates?.expressions).toHaveLength(1);
  });
});

/** Sanity: the fixtures really are foreign, or the specs above prove nothing. */
describe('the fixtures', () => {
  it('Orders column names match no Care Logs field', () => {
    expect(SavedColumnsMatchEntity(['OrderNumber', 'OrderTotal'], CARE_LOGS)).toBe(false);
  });
});

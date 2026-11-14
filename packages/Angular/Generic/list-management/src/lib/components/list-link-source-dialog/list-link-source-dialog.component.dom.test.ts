import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
  MJAlertComponent,
  MJButtonDirective,
  MJComboboxComponent,
  MJDialogActionsComponent,
  MJDialogComponent,
  MJDropdownComponent,
} from '@memberjunction/ng-ui-components';
import { capture, CreateFakeProvider, query, queryAll, renderComponentFixture, text } from '@memberjunction/ng-test-utils';

import type { ListSourceParameterInfo } from '../../models/list-refresh.models';
import { ListRefreshService } from '../../services/list-refresh.service';
import { ListLinkSourceDialogComponent } from './list-link-source-dialog.component';

/**
 * DOM spec for <mj-list-link-source-dialog>. The list record and the view, query and query-field
 * rows come from a fake provider passed as [Provider]; saving and the query's parameters go through
 * ListRefreshService, which is replaced by a stub.
 */

const ENTITY_ID = 'ent-1';

function listRecord(overrides: Record<string, unknown> = {}) {
  return {
    Load: vi.fn(async () => true),
    Entity: 'Contacts',
    EntityID: ENTITY_ID,
    SourceViewID: null,
    SourceQueryID: null,
    SourceQueryKeyField: null,
    SourceQueryParameters: null,
    ...overrides,
  };
}

const rows = (p: RunViewParams): Array<Record<string, string>> => {
  if (p.EntityName === 'MJ: User Views') return [{ ID: 'view-1', Name: 'Active members' }];
  if (p.EntityName === 'MJ: Queries') return [{ ID: 'query-1', Name: 'Board-eligible contacts', Category: 'Members' }];
  if (p.EntityName === 'MJ: Query Fields') {
    return [
      { Name: 'Email', SourceEntityID: ENTITY_ID, SourceFieldName: 'Email' },
      { Name: 'ContactID', SourceEntityID: ENTITY_ID, SourceFieldName: 'ID' },
    ];
  }
  return [];
};

const REGION: ListSourceParameterInfo = { Name: 'Region', Type: 'string', IsRequired: true, Description: null, SampleValue: 'Northeast', CurrentValue: null };

let service: { Provider: unknown; UpdateListAsync: ReturnType<typeof vi.fn>; LoadSourceParametersAsync: ReturnType<typeof vi.fn> };

function provider(list = listRecord()): IMetadataProvider {
  const base = CreateFakeProvider({
    runViewResults: rows,
    entities: [{ ID: ENTITY_ID, Name: 'Contacts', PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' } } as never],
  });
  return Object.assign(base, { GetEntityObject: vi.fn(async () => list) });
}

async function render(list = listRecord()) {
  const f = renderComponentFixture(ListLinkSourceDialogComponent, {
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective, MJAlertComponent, MJDialogComponent, MJDialogActionsComponent, MJComboboxComponent, MJDropdownComponent],
    declarations: [ListLinkSourceDialogComponent],
    providers: [{ provide: ListRefreshService, useValue: service }],
    inputs: { Provider: provider(list), ListID: 'list-1', Visible: true },
  });
  await settle(f);
  return f;
}

async function settle(f: { detectChanges(): void }) {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  f.detectChanges();
}

function linkButton(f: Parameters<typeof queryAll>[0]): HTMLButtonElement {
  return queryAll(f, 'button').find((b) => b.textContent?.includes('Link and fill')) as HTMLButtonElement;
}

beforeEach(() => {
  service = {
    Provider: null,
    UpdateListAsync: vi.fn(async () => undefined),
    LoadSourceParametersAsync: vi.fn(async () => [REGION]),
  };
});

describe('ListLinkSourceDialogComponent (DOM)', () => {
  it('names the list type and offers its views, with Link disabled until one is chosen', async () => {
    const f = await render();
    expect(text(f, '.lsd-intro')).toContain('Contacts');
    expect(f.componentInstance.Views.map((v) => v.Name)).toEqual(['Active members']);
    expect(linkButton(f).disabled).toBe(true);
  });

  it('saves a view source, clearing any query fields, and reports it linked', async () => {
    const f = await render();
    const linked = capture(f.componentInstance.Linked);
    f.componentInstance.SelectedViewID = 'view-1';
    expect(f.componentInstance.CanSave).toBe(true);

    await f.componentInstance.OnSave();
    expect(service.UpdateListAsync).toHaveBeenCalledWith('list-1', {
      SourceViewID: 'view-1', SourceQueryID: null, SourceQueryKeyField: null, SourceQueryParameters: null,
    });
    expect(linked).toHaveLength(1);
  });

  it('for a query, suggests the column that maps to the key and asks for its parameters', async () => {
    const f = await render();
    f.componentInstance.OnKindChange('query');
    await f.componentInstance.OnQueryChange('query-1');
    f.detectChanges();

    expect(f.componentInstance.KeyField).toBe('ContactID');
    expect(service.LoadSourceParametersAsync).toHaveBeenCalledWith('query-1', null);
    expect(text(f, '.lsd-params')).toContain('Region');
    expect(query(f, '.lsd-params input')?.getAttribute('aria-required')).toBe('true');
  });

  it('keeps Link disabled until required parameters are filled, then saves them as JSON', async () => {
    const f = await render();
    f.componentInstance.OnKindChange('query');
    await f.componentInstance.OnQueryChange('query-1');
    f.detectChanges();
    expect(f.componentInstance.CanSave).toBe(false);

    f.componentInstance.ParameterValues['Region'] = '  Northeast ';
    f.detectChanges();
    expect(f.componentInstance.CanSave).toBe(true);

    await f.componentInstance.OnSave();
    expect(service.UpdateListAsync).toHaveBeenCalledWith('list-1', {
      SourceViewID: null, SourceQueryID: 'query-1', SourceQueryKeyField: 'ContactID', SourceQueryParameters: '{"Region":"Northeast"}',
    });
  });

  it('opens on the current query source with its stored parameters', async () => {
    const stored = '{"Region":"West"}';
    service.LoadSourceParametersAsync.mockResolvedValue([{ ...REGION, CurrentValue: 'West' }]);
    const f = await render(listRecord({ SourceQueryID: 'query-1', SourceQueryKeyField: 'Email', SourceQueryParameters: stored }));

    expect(f.componentInstance.Kind).toBe('query');
    expect(f.componentInstance.KeyField).toBe('Email');
    expect(service.LoadSourceParametersAsync).toHaveBeenCalledWith('query-1', stored);
    expect(f.componentInstance.ParameterValues['Region']).toBe('West');
  });

  it('shows a refused save as an error and stays open', async () => {
    service.UpdateListAsync.mockRejectedValue(new Error('Only the owner of this List can link it to a source'));
    const f = await render();
    const linked = capture(f.componentInstance.Linked);
    f.componentInstance.SelectedViewID = 'view-1';
    await f.componentInstance.OnSave();
    f.detectChanges();

    expect(text(f, 'mj-alert[Variant="error"], mj-alert:last-of-type')).toContain('Only the owner');
    expect(linked).toHaveLength(0);
  });

  it('Cancel closes without saving', async () => {
    const f = await render();
    const cancelled = capture(f.componentInstance.Cancel);
    (queryAll(f, 'button').find((b) => b.textContent?.trim() === 'Cancel') as HTMLButtonElement).click();
    expect(cancelled).toHaveLength(1);
    expect(service.UpdateListAsync).not.toHaveBeenCalled();
  });
});

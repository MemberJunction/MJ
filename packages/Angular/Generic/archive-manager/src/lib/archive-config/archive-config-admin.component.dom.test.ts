import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, queryAll, text, hasClass, createFakeProvider } from '@memberjunction/ng-test-utils';
import { ComponentFixture } from '@angular/core/testing';
import { ArchiveConfigAdminComponent } from './archive-config-admin.component';

/**
 * loadAllData() chains several awaited RunView calls (configs -> auto-select -> entities),
 * each resolving on a later microtask turn. A single whenStable() can return before the
 * tail of that chain runs, so flush a handful of turns, then settle + render.
 */
async function settle(f: ComponentFixture<ArchiveConfigAdminComponent>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
  await f.whenStable();
  f.detectChanges();
}

/**
 * DOM spec for <mj-archive-config-admin> — the DATA-BOUND component. It loads via
 * RunView.FromMetadataProvider(this.ProviderToUse), so we inject a fake provider whose
 * RunViews/RunView return canned config + storage-account rows. After the async load
 * settles (whenStable), the list, selection, and detail panel render.
 *
 * The fake provider's RunViews returns the SAME rows for every params entry, so we vary
 * results by EntityName to feed the configs query vs the storage-accounts query.
 */
type Row = Record<string, unknown>;

const CONFIG_ROW: Row = {
  ID: 'cfg-1',
  Name: 'Primary Archive',
  Description: 'desc',
  Status: 'Idle',
  StorageAccountID: 'sa-1',
  StorageAccount: 'Cold Storage',
  RootPath: '/archives',
  DefaultRetentionDays: 365,
  DefaultBatchSize: 100,
  DefaultMode: 'StripFields',
  ArchiveRelatedRecordChanges: false,
};
const STORAGE_ROW: Row = { ID: 'sa-1', Name: 'Cold Storage' };

function providerWithConfigs() {
  return createFakeProvider<Row>({
    runViewResults: (params) => {
      if (params.EntityName === 'MJ: Archive Configurations') return [CONFIG_ROW];
      if (params.EntityName === 'MJ: File Storage Accounts') return [STORAGE_ROW];
      // 'MJ: Archive Configuration Entities' (detail load) -> none
      return [];
    },
  });
}

const MODULES = [CommonModule, FormsModule, SharedGenericModule];

describe('ArchiveConfigAdminComponent (DOM, data-bound)', () => {
  it('shows the loading indicator on initial render', () => {
    const f = renderComponentFixture(ArchiveConfigAdminComponent, {
      imports: MODULES,
      declarations: [ArchiveConfigAdminComponent],
      inputs: { Provider: createFakeProvider<Row>({ runViewResults: [] }) },
    });
    expect(f.componentInstance.IsLoading).toBe(true);
    expect(query(f, '.config-loading')).not.toBeNull();
  });

  it('renders the empty state after load when no configs exist', async () => {
    const f = renderComponentFixture(ArchiveConfigAdminComponent, {
      imports: MODULES,
      declarations: [ArchiveConfigAdminComponent],
      inputs: { Provider: createFakeProvider<Row>({ runViewResults: [] }) },
    });
    await settle(f);

    expect(f.componentInstance.IsLoading).toBe(false);
    expect(query(f, '.config-empty')).not.toBeNull();
    expect(queryAll(f, '.config-card').length).toBe(0);
  });

  it('renders a config card per loaded config and auto-selects the first', async () => {
    const f = renderComponentFixture(ArchiveConfigAdminComponent, {
      imports: MODULES,
      declarations: [ArchiveConfigAdminComponent],
      inputs: { Provider: providerWithConfigs() },
    });
    await settle(f);

    expect(queryAll(f, '.config-card').length).toBe(1);
    expect(text(f, '.config-card-name')).toBe('Primary Archive');
    // first config auto-selected -> card carries .selected and detail panel is shown
    expect(hasClass(f, '.config-card', 'selected')).toBe(true);
    expect(query(f, '.config-detail-content')).not.toBeNull();
  });

  it('shows the active status label for an Idle config', async () => {
    const f = renderComponentFixture(ArchiveConfigAdminComponent, {
      imports: MODULES,
      declarations: [ArchiveConfigAdminComponent],
      inputs: { Provider: providerWithConfigs() },
    });
    await settle(f);

    expect(text(f, '.config-status-badge')).toBe('Idle');
    expect(hasClass(f, '.config-status-badge', 'status-active')).toBe(true);
  });

  it('adds a new configuration card when "Add Configuration" is clicked', async () => {
    const f = renderComponentFixture(ArchiveConfigAdminComponent, {
      imports: MODULES,
      declarations: [ArchiveConfigAdminComponent],
      inputs: { Provider: createFakeProvider<Row>({ runViewResults: [] }) },
    });
    await settle(f);

    expect(queryAll(f, '.config-card').length).toBe(0);
    (query(f, '.config-list-header .btn-primary') as HTMLElement).click();
    f.detectChanges();

    expect(queryAll(f, '.config-card').length).toBe(1);
    expect(text(f, '.config-card-name')).toBe('New Configuration');
  });

  it('appends an entity row when "Add Entity" is clicked on a selected config', async () => {
    const f = renderComponentFixture(ArchiveConfigAdminComponent, {
      imports: MODULES,
      declarations: [ArchiveConfigAdminComponent],
      inputs: { Provider: providerWithConfigs() },
    });
    await settle(f);

    expect(queryAll(f, '.entity-table tbody tr').length).toBe(0);
    expect(query(f, '.entity-empty')).not.toBeNull();

    (query(f, '.detail-section-header .btn-outline') as HTMLElement).click();
    f.detectChanges();

    expect(queryAll(f, '.entity-table tbody tr').length).toBe(1);
  });

  // NOTE: the status banner's status-success/-error modifier classes are intentionally NOT
  // covered. The banner only renders inside the selected-config detail panel, but selecting a
  // config calls clearStatus(), and the banner is not reachable in the empty/no-selection state —
  // so the status fields can't be deterministically surfaced without entangling with that
  // lifecycle. Low-value cosmetic classes; deferred per the rollout's diminishing-returns cutoff.
});

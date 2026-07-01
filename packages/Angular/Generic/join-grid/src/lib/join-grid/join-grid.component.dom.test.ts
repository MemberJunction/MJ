import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, queryAll, createFakeProvider, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { JoinGridComponent } from './join-grid.component';

/**
 * DOM spec for <mj-join-grid> — a module-declared compound, data-bound component.
 *
 * SCOPE: the toolbar (Save/Cancel gating + disabled state) and the loading-spinner gate,
 * because those render independently of grid data.
 *
 * WIRING NOTE — JoinGridComponent runs an async `Refresh()` from `ngAfterViewInit`. `Refresh()`
 * resolves the rows/columns entities via `this.ProviderToUse.EntityByName(...)` (throwing if it
 * returns null) and loads rows/cols/join data via a bare `new RunView()` (the GLOBAL provider).
 * Each test therefore:
 *   - supplies an `EntityByName` resolver on the `[Provider]` input that returns a minimal
 *     EntityInfo stub (so the entity-name guards pass), and the required Rows/Columns entity
 *     names + display fields as inputs, and
 *   - installs a fake GLOBAL provider via `useFakeGlobalProvider()` whose `RunView` returns `[]`.
 * With empty rows/cols/join data, `PopulateGridData()` iterates nothing and `Refresh()` settles
 * cleanly — no unhandled rejection — while still rendering the real toolbar/loading template.
 *
 * DEFERRED — the data-bearing render path (header columns, body rows, checkbox/checkmark state,
 * dirty-cell class, Fields-mode Add/Remove cell buttons): seeding grid data flips
 * `NumDirtyRecords` between the first and verification CD passes, tripping the zoneless dev-mode
 * NG0100 check. Covering it honestly needs a testability seam to suppress/defer the auto-Refresh;
 * tracked for a follow-up.
 */

/** Minimal EntityInfo stub: Refresh() only reads `.FirstPrimaryKey.{Name,NeedsQuotes}`. */
const fakeEntityInfo = (name: string): EntityInfo =>
  ({ Name: name, FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true } }) as unknown as EntityInfo;

/** Provider for the `[Provider]` input: resolves any entity name to the stub above. */
const inputProvider = (): IMetadataProvider =>
  createFakeProvider({ runViewResults: [], entityByName: (name) => fakeEntityInfo(name) });

/** Inputs that satisfy Refresh()'s required Rows/Columns entity metadata (Entity mode, the default). */
const DATA_INPUTS = {
  RowsEntityName: 'Users',
  RowsEntityDisplayField: 'Name',
  ColumnsEntityName: 'Roles',
  ColumnsEntityDisplayField: 'Name',
  JoinEntityName: 'User Roles',
  JoinEntityRowForeignKey: 'UserID',
  JoinEntityColumnForeignKey: 'RoleID',
};

const MODULE = {
  imports: [CommonModule, FormsModule, ContainerDirectivesModule, SharedGenericModule, MJButtonDirective, MJDropdownComponent],
  declarations: [JoinGridComponent],
};

describe('JoinGridComponent (DOM — toolbar + loading gating)', () => {
  // Refresh() loads via a bare `new RunView()` (global provider); fake it so it returns [].
  const installGlobal = useFakeGlobalProvider();

  /**
   * Let the fire-and-forget `Refresh()` (launched from ngAfterViewInit) settle to completion
   * WHILE the fake global provider is still installed. Without this, the async join `RunView`
   * resolves after the test ends — by which point `afterEach` has restored the (undefined)
   * prior global provider, surfacing as an unhandled rejection.
   */
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('shows both Save and Cancel buttons by default', async () => {
    installGlobal({ runViewResults: [], entityByName: (name) => fakeEntityInfo(name) });
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: inputProvider(), ...DATA_INPUTS },
    });
    const buttons = queryAll(f, '.wrapper > button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Save', 'Cancel']);
    await flush();
  });

  it('hides the Save button when ShowSaveButton is false', async () => {
    installGlobal({ runViewResults: [], entityByName: (name) => fakeEntityInfo(name) });
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: inputProvider(), ...DATA_INPUTS, ShowSaveButton: false },
    });
    const buttons = queryAll(f, '.wrapper > button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Cancel']);
    await flush();
  });

  it('hides the Cancel button when ShowCancelButton is false', async () => {
    installGlobal({ runViewResults: [], entityByName: (name) => fakeEntityInfo(name) });
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: inputProvider(), ...DATA_INPUTS, ShowCancelButton: false },
    });
    const buttons = queryAll(f, '.wrapper > button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Save']);
    await flush();
  });

  it('disables Save and Cancel when there are no dirty records', async () => {
    installGlobal({ runViewResults: [], entityByName: (name) => fakeEntityInfo(name) });
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: inputProvider(), ...DATA_INPUTS },
    });
    const buttons = queryAll(f, '.wrapper > button') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    await flush();
  });

  it('shows the loading spinner and hides the table while loading', async () => {
    installGlobal({ runViewResults: [], entityByName: (name) => fakeEntityInfo(name) });
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: inputProvider(), ...DATA_INPUTS },
      setup: (c) => {
        c._IsLoading = true;
      },
    });
    // Assert the loading gate BEFORE flushing — Refresh() flips _IsLoading off when it settles.
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, 'table.grid')).toBeNull();
    await flush();
  });
});

import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import { JoinGridComponent } from './join-grid.component';

/**
 * DOM spec for <mj-join-grid> — a module-declared compound, data-bound component.
 *
 * SCOPE: only the toolbar (Save/Cancel gating + disabled state) and the loading-spinner
 * gate are covered here, because those render independently of grid data.
 *
 * DEFERRED — the data-bearing render path (header columns, body rows, checkbox/checkmark
 * state, dirty-cell class, Fields-mode Add/Remove cell buttons): JoinGridComponent runs an
 * async `Refresh()` from `ngAfterViewInit` that mutates `_IsLoading` / `_GridData` / the
 * pending-insert/delete arrays AFTER the first change-detection pass. Because the Save/Cancel
 * `[disabled]="NumDirtyRecords === 0"` binding reads those arrays, the value flips between the
 * first and the verification CD pass, tripping the zoneless dev-mode NG0100 check on every
 * test that seeds grid state. This is a component-side CD-stability issue (same shape as
 * filter-builder), not a test defect — masking it (prod mode / detectChanges(false)) is
 * disallowed. Covering the data path honestly needs a testability seam to suppress the
 * auto-Refresh, or a provider-fed deterministic load; tracked for a follow-up.
 */

const MODULE = {
  imports: [CommonModule, FormsModule, ContainerDirectivesModule, SharedGenericModule, MJButtonDirective, MJDropdownComponent],
  declarations: [JoinGridComponent],
};

describe('JoinGridComponent (DOM — toolbar + loading gating)', () => {
  it('shows both Save and Cancel buttons by default', () => {
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: createFakeProvider() },
    });
    const buttons = queryAll(f, '.wrapper > button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Save', 'Cancel']);
  });

  it('hides the Save button when ShowSaveButton is false', () => {
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: createFakeProvider(), ShowSaveButton: false },
    });
    const buttons = queryAll(f, '.wrapper > button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Cancel']);
  });

  it('hides the Cancel button when ShowCancelButton is false', () => {
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: createFakeProvider(), ShowCancelButton: false },
    });
    const buttons = queryAll(f, '.wrapper > button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Save']);
  });

  it('disables Save and Cancel when there are no dirty records', () => {
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: createFakeProvider() },
    });
    const buttons = queryAll(f, '.wrapper > button') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('shows the loading spinner and hides the table while loading', () => {
    const f = renderComponentFixture(JoinGridComponent, {
      ...MODULE,
      inputs: { Provider: createFakeProvider(), RowsEntityName: 'Users' },
      setup: (c) => {
        c._IsLoading = true;
      },
    });
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, 'table.grid')).toBeNull();
  });
});

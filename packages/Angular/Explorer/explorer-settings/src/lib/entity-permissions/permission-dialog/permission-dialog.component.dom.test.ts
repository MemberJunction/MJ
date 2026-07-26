import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { PermissionDialogComponent, PermissionDialogData } from './permission-dialog.component';
import type { MJEntityEntity, MJRoleEntity, MJEntityPermissionEntity } from '@memberjunction/core-entities';

/**
 * DOM coverage for <mj-permission-dialog> — a standalone:false, ViewEncapsulation.None, default-CD
 * dialog (`extends BaseAngularComponent`). Renders only when `[visible]` is true. On becoming visible
 * it runs `loadPermissionData()` (SYNCHRONOUS — no provider call; it just correlates
 * `data.existingPermissions` against `data.roles` into `rolePermissions`, and computes `availableRoles`
 * as the un-configured remainder). Because that method calls `cdr.detectChanges()` during ngOnChanges,
 * we render with `autoDetect` to stay NG0100-safe.
 *
 * Covered: the entity name/permission-count rendered from `data`, one permissions-table row per matched
 * role permission with the four CRUD checkboxes, one "add role" chip per available role, the
 * save-button gating (`[disabled]="!hasChanges || isLoading"` — disabled when there are no dirty/new
 * rows), and the cancel `result` emission. The happy-path save (entity.Save) needs a backend → out of
 * unit-DOM scope.
 *
 * `mj-alert` is a light stub (error branch only). Save/Cancel obey the MJ convention: confirm LEFT, cancel RIGHT.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<span class="stub-alert"><ng-content></ng-content></span>' })
class StubAlert {
  @Input() Variant = '';
  @Input() Message = '';
}

const ENTITY = { ID: 'e1', Name: 'Accounts', SchemaName: 'crm', Description: 'Account records' } as unknown as MJEntityEntity;
const ROLES = [
  { ID: 'r1', Name: 'Administrator' },
  { ID: 'r2', Name: 'User' },
] as unknown as MJRoleEntity[];

// A permission for role r1 only, leaving r2 "available". `isNew:false` + `Dirty:false` keep hasChanges false.
function permissionFor(roleId: string, dirty = false): MJEntityPermissionEntity {
  return {
    RoleID: roleId,
    CanCreate: false,
    CanRead: true,
    CanUpdate: false,
    CanDelete: false,
    Dirty: dirty,
  } as unknown as MJEntityPermissionEntity;
}

const DATA: PermissionDialogData = {
  entity: ENTITY,
  roles: ROLES,
  existingPermissions: [permissionFor('r1')],
};

const render = (data: PermissionDialogData = DATA, visible = true) =>
  renderComponentFixture(PermissionDialogComponent, {
    imports: [CommonModule, FormsModule, ReactiveFormsModule, StubAlert],
    declarations: [PermissionDialogComponent],
    inputs: { data, visible },
    autoDetect: true,
  });

const submitBtn = (f: ReturnType<typeof render>) => query(f, '.footer-actions button[type="submit"]') as HTMLButtonElement;
const cancelBtn = (f: ReturnType<typeof render>) => query(f, '.footer-actions button.btn-secondary') as HTMLButtonElement;

describe('PermissionDialogComponent (DOM)', () => {
  it('does not render the dialog body when not visible', () => {
    const fixture = render(DATA, false);
    expect(query(fixture, '.modal-dialog')).toBeNull();
  });

  it('renders the entity name and one permissions-table row per configured role', () => {
    const fixture = render();
    // The entity name shows in the subtitle and the meta card.
    expect(fixture.nativeElement.textContent).toContain('Accounts');
    const rows = queryAll(fixture, 'tr.permission-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Administrator');
  });

  it('renders the four CRUD checkboxes for the configured role row', () => {
    const fixture = render();
    const checkboxes = queryAll(fixture, 'tr.permission-row input[type="checkbox"]');
    expect(checkboxes.length).toBe(4);
  });

  it('renders an add-role chip for each un-configured role', () => {
    const fixture = render();
    const chips = queryAll(fixture, '.role-chip');
    // Only r2 (User) is un-configured — r1 is already in the table.
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('User');
  });

  it('disables Save while there are no pending changes', () => {
    const fixture = render();
    expect(fixture.componentInstance.hasChanges).toBe(false);
    expect(submitBtn(fixture).disabled).toBe(true);
  });

  it('emits {action:cancel} when the Cancel button is clicked', () => {
    const fixture = render();
    const results = capture(fixture.componentInstance.result);
    cancelBtn(fixture).click();
    expect(results).toEqual([{ action: 'cancel' }]);
  });
});

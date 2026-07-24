import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { query, queryAll, text } from '@memberjunction/ng-test-utils';
import { createFakeProvider } from '@memberjunction/ng-test-utils';
import { EntityPermissionsGridComponent } from './entity-permissions-grid.component';
import { EntityPermissionsModule } from '../module';

/**
 * DOM coverage for <mj-entity-permissions-grid> — a Read/Create/Update/Delete permission matrix.
 * It loads through `[Provider]` (`ProviderToUse.Roles` to resolve the role filter + a `RunView`
 * for the saved permissions), so specs supply a `createFakeProvider` with a `roles` catalog and
 * canned permission rows. Tested in `Mode='Role'` so each row shows `permission.Entity` directly
 * (the `Mode='Entity'` path resolves role names and auto-creates missing rows — out of scope here).
 *
 * Explicit CD (`detectChanges(false)` + post-flush `markForCheck`) is used because `Refresh()`
 * toggles `isLoading` across an `await` and the component mutates plain properties (no signals).
 */

interface PermRow {
  Entity: string;
  RoleID: string;
  CanRead: boolean;
  CanCreate: boolean;
  CanUpdate: boolean;
  CanDelete: boolean;
}
const PERMS: PermRow[] = [
  { Entity: 'Accounts', RoleID: 'r1', CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false },
  { Entity: 'Users', RoleID: 'r1', CanRead: true, CanCreate: true, CanUpdate: false, CanDelete: false },
];

async function render(): Promise<ComponentFixture<EntityPermissionsGridComponent>> {
  TestBed.configureTestingModule({ imports: [EntityPermissionsModule] });
  const fixture = TestBed.createComponent(EntityPermissionsGridComponent);
  const provider = createFakeProvider<PermRow>({ runViewResults: PERMS, roles: [{ Name: 'Admin', ID: 'r1' }] });
  fixture.componentRef.setInput('Provider', provider);
  fixture.componentRef.setInput('Mode', 'Role');
  fixture.componentRef.setInput('RoleName', 'Admin');
  fixture.detectChanges(false); // ngOnInit → async load; skip strict checkNoChanges (isLoading flips)
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck(); // plain-property mutation → force render
  fixture.detectChanges(false);
  return fixture;
}

describe('EntityPermissionsGridComponent (DOM)', () => {
  it('renders the Read/Create/Update/Delete permission column headers', async () => {
    const headers = queryAll(await render(), 'thead th').map((th) => th.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(['Read', 'Create', 'Update', 'Delete']));
  });

  it("shows the 'Entity' left-column header in Role mode", async () => {
    const headers = queryAll(await render(), 'thead th').map((th) => th.textContent?.trim());
    expect(headers).toContain('Entity');
    expect(headers).not.toContain('Role');
  });

  it('renders one row per loaded permission, each with four checkboxes', async () => {
    const fixture = await render();
    const rows = queryAll(fixture, 'tbody tr');
    expect(rows.length).toBe(PERMS.length);
    expect((rows[0] as HTMLElement).querySelectorAll('input[type="checkbox"]').length).toBe(4);
  });

  it('renders the entity name in each permission row (Role mode)', async () => {
    const fixture = await render();
    const rowText = queryAll(fixture, 'tbody tr').map((r) => r.textContent ?? '');
    expect(rowText.some((t) => t.includes('Accounts'))).toBe(true);
    expect(rowText.some((t) => t.includes('Users'))).toBe(true);
  });

  it('disables Save and Cancel while there are no dirty edits', async () => {
    const fixture = await render();
    const buttons = queryAll(fixture, 'button');
    const save = buttons.find((b) => b.textContent?.includes('Save')) as HTMLButtonElement;
    const cancel = buttons.find((b) => b.textContent?.includes('Cancel')) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
  });
});

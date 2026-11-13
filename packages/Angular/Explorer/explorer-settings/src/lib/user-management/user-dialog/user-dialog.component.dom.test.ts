import { describe, it, expect, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { UserDialogComponent, UserDialogData } from './user-dialog.component';
import type { MJRoleEntity, MJUserEntity } from '@memberjunction/core-entities';

/**
 * DOM coverage for <mj-user-dialog> — a standalone:false, default-CD reactive-form dialog
 * (`extends BaseAngularComponent`). Renders only when `[visible]` is true, takes create/edit intent +
 * the assignable role catalog via the `[data]` input, and emits its outcome on the `result` @Output.
 *
 * We test the CREATE path (edit mode's `loadExistingUserRoles` hits the provider; create mode's
 * ngOnChanges just `resetForm()`s synchronously, so a single detectChanges renders cleanly). Covered:
 * title, the required email/name validation gating the submit button, the `data.availableRoles`-driven
 * role cards + click-to-select toggling `selectedRoleIds`, and the cancel `result` emission. The
 * happy-path save (Metadata + transaction group) needs a backend, so it stays out of unit-DOM scope.
 *
 * `mj-alert` is a light stub. Save/Cancel obey the MJ convention: confirm on the LEFT, cancel on the RIGHT.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<span class="stub-alert"><ng-content></ng-content></span>' })
class StubAlert {
  @Input() Variant = '';
  @Input() Message = '';
}

const ROLES = [
  { ID: 'r1', Name: 'Administrator', Description: 'Full access' },
  { ID: 'r2', Name: 'User', Description: 'Standard access' },
] as unknown as MJRoleEntity[];

const CREATE: UserDialogData = { mode: 'create', availableRoles: ROLES };

const render = (data: UserDialogData = CREATE, visible = true) =>
  renderComponentFixture(UserDialogComponent, {
    imports: [CommonModule, FormsModule, ReactiveFormsModule, StubAlert],
    declarations: [UserDialogComponent],
    inputs: { data, visible },
  });

const submitBtn = (f: ReturnType<typeof render>) => query(f, '.modal-footer button[type="submit"]') as HTMLButtonElement;
const cancelBtn = (f: ReturnType<typeof render>) => query(f, '.modal-footer button.btn-secondary') as HTMLButtonElement;

describe('UserDialogComponent (DOM)', () => {
  it('does not render the dialog body when not visible', () => {
    const fixture = render(CREATE, false);
    expect(query(fixture, '.modal-dialog')).toBeNull();
  });

  it('renders the Create title and one role-card per availableRole', () => {
    const fixture = render(CREATE);
    expect(text(fixture, '.dialog-title')).toContain('Create New User');
    const cards = queryAll(fixture, '.role-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Administrator');
    expect(cards[1].textContent).toContain('User');
  });

  it('disables the submit button until name + email pass validation', () => {
    const fixture = render(CREATE);
    expect(submitBtn(fixture).disabled).toBe(true);
    fixture.componentInstance.userForm.patchValue({ name: 'jane@co.com', email: 'jane@co.com' });
    fixture.detectChanges();
    expect(submitBtn(fixture).disabled).toBe(false);
  });

  it('keeps the submit button disabled when the email is invalid', () => {
    const fixture = render(CREATE);
    fixture.componentInstance.userForm.patchValue({ name: 'not-an-email', email: 'not-an-email' });
    fixture.detectChanges();
    expect(submitBtn(fixture).disabled).toBe(true);
  });

  it('toggles selectedRoleIds and the .selected class when a role card is clicked', () => {
    const fixture = render(CREATE);
    const card = queryAll(fixture, '.role-card')[0] as HTMLElement;
    expect(card.classList.contains('selected')).toBe(false);
    card.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedRoleIds.has('r1')).toBe(true);
    expect((queryAll(fixture, '.role-card')[0] as HTMLElement).classList.contains('selected')).toBe(true);
  });

  it('emits {action:cancel} when the Cancel button is clicked', () => {
    const fixture = render(CREATE);
    const results = capture(fixture.componentInstance.result);
    cancelBtn(fixture).click();
    expect(results).toEqual([{ action: 'cancel' }]);
  });
});

/**
 * Edit mode loads the user's current roles through `RunView` AFTER the dialog has rendered. Nothing
 * in that load is a change Angular tracks (it adds to a Set), so the component must run change
 * detection itself; before it did, every card stayed unchecked until the admin clicked one (#6590).
 * These tests never call `fixture.detectChanges()` after the load, so they fail without that pass.
 */
describe('UserDialogComponent (DOM) — edit mode shows existing roles', () => {
  const user = (id: string) => ({ ID: id, Name: `${id}@co.com`, Email: `${id}@co.com`, Type: 'User', IsActive: true }) as unknown as MJUserEntity;
  const flush = () => new Promise(resolve => setTimeout(resolve));

  /** Provider stub whose RunView resolves only when the test releases it, keyed by the filtered user. */
  function deferredProvider() {
    const pending = new Map<string, (roleIds: string[]) => void>();
    const provider = {
      RunView: vi.fn().mockImplementation((params: { ExtraFilter: string }) => {
        const userId = /UserID='([^']+)'/.exec(params.ExtraFilter)![1];
        return new Promise(resolve => pending.set(userId, (roleIds: string[]) =>
          resolve({ Success: true, Results: roleIds.map(RoleID => ({ RoleID })) })));
      }),
    };
    return { provider, release: (userId: string, roleIds: string[]) => pending.get(userId)!(roleIds) };
  }

  const selectedCards = (f: ReturnType<typeof render>) =>
    queryAll(f, '.role-card.selected').map(c => c.textContent ?? '');

  it('checks the user\'s current roles as soon as they load, without a click', async () => {
    const { provider, release } = deferredProvider();
    const fixture = renderComponentFixture(UserDialogComponent, {
      imports: [CommonModule, FormsModule, ReactiveFormsModule, StubAlert],
      declarations: [UserDialogComponent],
      inputs: { Provider: provider, data: { mode: 'edit', user: user('u1'), availableRoles: ROLES }, visible: true },
    });
    expect(selectedCards(fixture)).toEqual([]);

    release('u1', ['r2']);
    await flush();

    const selected = selectedCards(fixture);
    expect(selected.length).toBe(1);
    expect(selected[0]).toContain('User');
    expect((query(fixture, '#role-r2') as HTMLInputElement).checked).toBe(true);
  });

  it('ignores a role load that finishes after the dialog moved to another user', async () => {
    const { provider, release } = deferredProvider();
    const fixture = renderComponentFixture(UserDialogComponent, {
      imports: [CommonModule, FormsModule, ReactiveFormsModule, StubAlert],
      declarations: [UserDialogComponent],
      inputs: { Provider: provider, data: { mode: 'edit', user: user('u1'), availableRoles: ROLES }, visible: true },
    });
    fixture.componentRef.setInput('data', { mode: 'edit', user: user('u2'), availableRoles: ROLES });
    fixture.detectChanges();

    release('u1', ['r1']);
    await flush();
    expect(fixture.componentInstance.SelectedRoleIds.has('r1')).toBe(false);

    release('u2', ['r2']);
    await flush();
    expect([...fixture.componentInstance.SelectedRoleIds]).toEqual(['r2']);
    expect(selectedCards(fixture).length).toBe(1);
  });
});

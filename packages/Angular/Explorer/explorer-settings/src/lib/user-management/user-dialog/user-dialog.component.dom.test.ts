import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { UserDialogComponent, UserDialogData } from './user-dialog.component';
import type { MJRoleEntity } from '@memberjunction/core-entities';

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

import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { createFakeProvider, renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import type { MJRoleEntity, MJUserEntity } from '@memberjunction/core-entities';
import { UserDialogComponent, UserDialogData } from './user-dialog.component';
import { OWNER_ONLY_NOTE } from '../owner-gate';

/**
 * <mj-user-dialog> opens read-only when a non-Owner opens another user (issue #4281): the server
 * refuses that save, so the dialog shows the record without a save button or editable inputs.
 * Editing your own record, and an Owner editing anyone, are unchanged. The edit path loads the
 * user's roles through `RunView`, which the fake provider answers with no rows.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<span class="stub-alert"></span>' })
class StubAlert {
  @Input() Variant = '';
  @Input() Message = '';
}

const SELF_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const OTHER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const ROLES = [{ ID: 'r1', Name: 'Sample Role', Description: 'Placeholder' }] as unknown as MJRoleEntity[];

function editData(userId: string): UserDialogData {
  const user = { ID: userId, Name: 'sample@example.test', Email: 'sample@example.test', FirstName: 'Sample', LastName: 'User', Title: '', Type: 'User', IsActive: true } as unknown as MJUserEntity;
  return { mode: 'edit', user, availableRoles: ROLES };
}

const render = (callerType: string, data: UserDialogData) =>
  renderComponentFixture(UserDialogComponent, {
    imports: [CommonModule, FormsModule, ReactiveFormsModule, StubAlert],
    declarations: [UserDialogComponent],
    inputs: { Provider: createFakeProvider({ currentUser: { ID: SELF_ID, Type: callerType } }), data, visible: true },
  });

const submitBtn = (f: ReturnType<typeof render>) => query(f, '.modal-footer button[type="submit"]');

describe('UserDialogComponent — Owner gate (DOM)', () => {
  it('opens read-only for a non-Owner viewing another user', () => {
    const f = render('User', editData(OTHER_ID));
    expect(f.componentInstance.IsReadOnly).toBe(true);
    expect(text(f, '.dialog-title')).toContain('View User');
    expect(text(f, '.dialog-subtitle')).toContain(OWNER_ONLY_NOTE);
    expect(submitBtn(f)).toBeNull();
    expect(text(f, '.modal-footer button.btn-secondary')).toContain('Close');
    expect(f.componentInstance.UserForm.disabled).toBe(true);
    expect(queryAll(f, '.role-card input[type="checkbox"]').every((cb) => (cb as HTMLInputElement).disabled)).toBe(true);
  });

  it('ignores role clicks and submits while read-only', async () => {
    const f = render('User', editData(OTHER_ID));
    f.componentInstance.ToggleRole('r1');
    expect(f.componentInstance.SelectedRoleIds.has('r1')).toBe(false);
    await f.componentInstance.OnSubmit();
    expect(f.componentInstance.isLoading).toBe(false);
  });

  it('stays editable for a non-Owner editing their own record', () => {
    const f = render('User', editData(SELF_ID));
    expect(f.componentInstance.IsReadOnly).toBe(false);
    expect(text(f, '.dialog-title')).toContain('Edit User');
    expect(submitBtn(f)).not.toBeNull();
    expect(f.componentInstance.UserForm.enabled).toBe(true);
  });

  it('stays editable for an Owner editing another user', () => {
    const f = render('Owner', editData(OTHER_ID));
    expect(f.componentInstance.IsReadOnly).toBe(false);
    expect(submitBtn(f)).not.toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { RoleDialogComponent, RoleDialogData } from './role-dialog.component';

/**
 * DOM coverage for <mj-role-dialog> — a standalone:false, default-CD reactive-form dialog that
 * `extends BaseAngularComponent`. It renders only when `[visible]` is true (template is wrapped in
 * `@if (visible)`), takes its create/edit intent via the `[data]` input, and emits its outcome on the
 * `result` @Output (`{action:'save'|'cancel', role?}`). ngOnChanges patches the form from `data.role`
 * in edit mode / resets it in create mode — both synchronous, so a single detectChanges suffices.
 *
 * The tested surface is entirely input/local-state driven: the create-vs-edit title, the required-name
 * validation gating the submit button (`[disabled]="roleForm.invalid || isLoading"`), and the
 * `result` emissions from the footer buttons. The submit's Metadata/Save path needs a backend, so we
 * only assert the gating + the cancel emission — the happy-path save is out of unit-DOM scope.
 *
 * `mj-alert` is a light stub (it renders on the error/type-info branches). Save/Cancel obey the MJ
 * convention: confirm on the LEFT, cancel on the RIGHT.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<span class="stub-alert"><ng-content></ng-content></span>' })
class StubAlert {
  @Input() Variant = '';
  @Input() Title = '';
  @Input() Message = '';
}

const CREATE: RoleDialogData = { mode: 'create' };

const render = (data: RoleDialogData = CREATE, visible = true) =>
  renderComponentFixture(RoleDialogComponent, {
    imports: [CommonModule, FormsModule, ReactiveFormsModule, StubAlert],
    declarations: [RoleDialogComponent],
    inputs: { data, visible },
  });

const submitBtn = (f: ReturnType<typeof render>) => query(f, '.modal-footer button[type="submit"]') as HTMLButtonElement;
const cancelBtn = (f: ReturnType<typeof render>) => query(f, '.modal-footer button.btn-secondary') as HTMLButtonElement;

describe('RoleDialogComponent (DOM)', () => {
  it('does not render the dialog body when not visible', () => {
    const fixture = render(CREATE, false);
    expect(query(fixture, '.modal-dialog')).toBeNull();
  });

  it('renders the Create title and the required role-name field when visible in create mode', () => {
    const fixture = render(CREATE);
    expect(text(fixture, '.dialog-title')).toContain('Create New Role');
    expect(query(fixture, 'input[formControlName="name"]')).not.toBeNull();
    // Directory ID field is edit-mode only.
    expect(query(fixture, 'input[formControlName="directoryId"]')).toBeNull();
  });

  it('renders the Edit title and patches the form from data.role', () => {
    const role = { Name: 'Sales Manager', Description: 'Handles sales', DirectoryID: 'dir-1' } as RoleDialogData['role'];
    const fixture = render({ mode: 'edit', role });
    expect(text(fixture, '.dialog-title')).toContain('Edit Role');
    const nameInput = query(fixture, 'input[formControlName="name"]') as HTMLInputElement;
    expect(nameInput.value).toBe('Sales Manager');
    // Directory ID field appears in edit mode.
    expect(query(fixture, 'input[formControlName="directoryId"]')).not.toBeNull();
  });

  it('disables the submit button while the required name is empty, enables it once filled', () => {
    const fixture = render(CREATE);
    expect(submitBtn(fixture).disabled).toBe(true);
    fixture.componentInstance.roleForm.get('name')!.setValue('New Role');
    fixture.detectChanges();
    expect(submitBtn(fixture).disabled).toBe(false);
  });

  it('emits {action:cancel} when the Cancel button is clicked', () => {
    const fixture = render(CREATE);
    const results = capture(fixture.componentInstance.result);
    cancelBtn(fixture).click();
    expect(results).toEqual([{ action: 'cancel' }]);
  });

  it('shows the system-role warning alert for a known system role', () => {
    const role = { Name: 'Administrator', Description: '', DirectoryID: null } as RoleDialogData['role'];
    const fixture = render({ mode: 'edit', role });
    const alerts = queryAll(fixture, '.stub-alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(fixture.componentInstance.isSystemRole).toBe(true);
  });
});

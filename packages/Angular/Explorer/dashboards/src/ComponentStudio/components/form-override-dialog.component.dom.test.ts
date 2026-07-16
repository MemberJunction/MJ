import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { FormOverrideDialogComponent } from './form-override-dialog.component';

/**
 * DOM coverage for <mj-form-override-dialog> — a standalone modal that collects
 * EntityFormOverride intent. It is gated on `Visible`; when open it pre-fills from the
 * Initial* inputs, adapts its title/buttons for `EditMode`, reveals a role <select> when
 * Scope='Role', validates on confirm, and emits `confirmed`/`dismissed`. Roles come from
 * the injected provider (`ProviderToUse.Roles`), supplied via a fake provider input.
 */

const ROLES = [
  { ID: 'r1', Name: 'Admin' },
  { ID: 'r2', Name: 'Member' },
];

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(FormOverrideDialogComponent, {
    imports: [CommonModule],
    inputs: { Provider: createFakeProvider({ roles: ROLES }), ...inputs },
  });

describe('FormOverrideDialogComponent (DOM)', () => {
  it('renders nothing when Visible is false', () => {
    expect(query(render({ Visible: false }), '.modal')).toBeNull();
  });

  it('shows the "Activate this form" title and pre-filled name when opened', () => {
    const fixture = render({ Visible: true, ComponentName: 'MyForm', InitialName: 'Compact Form' });
    expect(text(fixture, '.modal-header h3')).toBe('Activate this form');
    expect((query(fixture, '.field input[type="text"]') as HTMLInputElement).value).toBe('Compact Form');
  });

  it('switches title and confirm button label in EditMode', () => {
    const fixture = render({ Visible: true, EditMode: true, EntityName: 'Members' });
    expect(text(fixture, '.modal-header h3')).toBe('Edit form details');
    expect(text(fixture, '.btn-primary')).toContain('Save changes');
  });

  it('reveals the role picker with one option per provider role when Scope=Role', () => {
    const fixture = render({ Visible: true, EntityName: 'Members', InitialScope: 'Role' });
    const options = queryAll(fixture, 'select.role-picker option');
    // one placeholder + one per role
    expect(options.length).toBe(ROLES.length + 1);
    expect(options[1].textContent).toContain('Admin');
  });

  it('emits dismissed when Skip/Cancel is clicked', () => {
    const fixture = render({ Visible: true, EntityName: 'Members' });
    const dismissed = capture(fixture.componentInstance.dismissed);
    queryAll(fixture, '.btn').find((b) => b.textContent?.trim() === 'Skip')!.dispatchEvent(new Event('click'));
    (query(fixture, '.modal-footer .btn:not(.btn-primary)') as HTMLElement).click();
    expect(dismissed.length).toBeGreaterThanOrEqual(1);
  });

  it('shows a validation error and does not emit confirmed when the name is blank', () => {
    const fixture = render({ Visible: true, EntityName: 'Members', InitialName: '  ' });
    const confirmed = capture(fixture.componentInstance.confirmed);
    (query(fixture, '.btn-primary') as HTMLElement).click();
    fixture.detectChanges();
    expect(query(fixture, '.error')?.textContent).toContain('Name is required');
    expect(confirmed.length).toBe(0);
  });

  it('emits confirmed with the entered values for a valid form', () => {
    const fixture = render({ Visible: true, EntityName: 'Members', InitialName: 'Nice Form' });
    const confirmed = capture(fixture.componentInstance.confirmed);
    (query(fixture, '.btn-primary') as HTMLElement).click();
    expect(confirmed.length).toBe(1);
    expect(confirmed[0].Name).toBe('Nice Form');
    expect(confirmed[0].EntityName).toBe('Members');
  });
});

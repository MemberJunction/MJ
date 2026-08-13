import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, click, capture, createFakeProvider, StubDropdownComponent, StubNumericInputComponent } from '@memberjunction/ng-test-utils';
import type { MCPConnectionData, MCPServerData } from '../mcp-dashboard.component';
import { MCPConnectionDialogComponent, ConnectionDialogResult } from './mcp-connection-dialog.component';

/**
 * DOM coverage for <mj-mcp-connection-dialog> — the create/edit MCP connection dialog. Module-declared
 * (standalone:false), FormBuilder-driven ReactiveForm; on init it loads credential/company dropdowns via
 * RunViews through ProviderToUse (a fake provider returns empty rows — no backend). MJ UI elements are
 * replaced with lightweight standalone stubs (the credential sub-dialog is only rendered when
 * ShowCredentialDialog is true, so it needs no stub here). We test title/edit-mode, the active-server
 * filter, save/cancel outputs, and the "New credential" toggle. Single sync render per test.
 */

@Component({ selector: 'mj-dialog', standalone: true, template: '<ng-content></ng-content>' })
class StubDialog {
  @Input() Visible = false;
  @Input() Title = '';
  @Input() Width = 0;
  @Output() Close = new EventEmitter<void>();
}
@Component({ selector: 'mj-dialog-actions', standalone: true, template: '<ng-content></ng-content>' })
class StubDialogActions {}
@Component({ selector: 'mj-alert', standalone: true, template: '<ng-content></ng-content>' })
class StubAlert {
  @Input() Variant = '';
}
// Rendered only when ShowCredentialDialog is true (the "New credential" toggle).
@Component({ selector: 'mj-credential-dialog', standalone: true, template: '' })
class StubCredentialDialog {
  @Input() Visible = false;
  @Output() close = new EventEmitter<unknown>();
}

const SERVERS: MCPServerData[] = [
  { ID: 's1', Name: 'GitHub', Status: 'Active' } as unknown as MCPServerData,
  { ID: 's2', Name: 'Retired', Status: 'Inactive' } as unknown as MCPServerData,
];
const CONNECTION: MCPConnectionData = {
  ID: 'c1',
  MCPServerID: 's1',
  Name: 'Prod GitHub',
  Description: 'desc',
  CompanyID: null,
  CredentialID: null,
  AutoSyncTools: true,
  LogToolCalls: true,
  Status: 'Active',
} as unknown as MCPConnectionData;

const render = (inputs: { connection?: MCPConnectionData | null; visible?: boolean } = {}) =>
  renderComponentFixture(MCPConnectionDialogComponent, {
    declarations: [MCPConnectionDialogComponent],
    imports: [ReactiveFormsModule, FormsModule, StubDialog, StubDialogActions, StubAlert, StubDropdownComponent, StubNumericInputComponent, StubCredentialDialog],
    inputs: {
      Provider: createFakeProvider({ runViewResults: [] }),
      servers: SERVERS,
      connection: inputs.connection ?? null,
      visible: inputs.visible ?? true,
    },
  });

describe('MCPConnectionDialogComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    expect(query(render({ visible: false }), 'mj-dialog')).toBeNull();
  });

  it('shows the "Add" title + Create button in create mode', () => {
    const fixture = render({ connection: null });
    expect(fixture.componentInstance.DialogTitle).toBe('Add Connection');
    expect(fixture.componentInstance.IsEditMode).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Create');
  });

  it('shows the "Edit" title + Update button in edit mode', () => {
    const fixture = render({ connection: CONNECTION });
    expect(fixture.componentInstance.DialogTitle).toBe('Edit Connection');
    expect(fixture.componentInstance.IsEditMode).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Update');
  });

  it('exposes only Active servers via the ActiveServers getter', () => {
    const fixture = render({ connection: null });
    expect(fixture.componentInstance.ActiveServers.map((s) => s.ID)).toEqual(['s1']);
  });

  it('renders the server + name form controls', () => {
    const fixture = render({ connection: CONNECTION });
    expect(query(fixture, 'input[formControlName="Name"]')).not.toBeNull();
    expect(query(fixture, 'textarea[formControlName="Description"]')).not.toBeNull();
  });

  it('emits close({saved:false}) when the Cancel button is clicked', () => {
    const fixture = render({ connection: CONNECTION });
    const closed = capture<ConnectionDialogResult>(fixture.componentInstance.close);
    // The Cancel button is the variant-less mjButton in the dialog actions (Save is variant="primary").
    click(fixture, 'mj-dialog-actions button:not([variant])');
    expect(closed).toEqual([{ saved: false }]);
  });

  it('emits close({saved:false}) when the dialog itself is closed (mj-dialog Close output)', () => {
    const fixture = render({ connection: CONNECTION });
    const closed = capture<ConnectionDialogResult>(fixture.componentInstance.close);
    const dialog = fixture.debugElement.query(By.directive(StubDialog));
    (dialog.componentInstance as StubDialog).Close.emit();
    expect(closed).toEqual([{ saved: false }]);
  });

  it('opens the credential creation dialog when the "New" credential button is clicked', async () => {
    const fixture = render({ connection: CONNECTION });
    // loadDropdownData is async; the credential row (which holds the "New" button) only renders
    // once IsLoadingDropdowns flips back to false — flush the fake-provider promise first.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges(false);
    expect(fixture.componentInstance.ShowCredentialDialog).toBe(false);
    expect(query(fixture, 'mj-credential-dialog')).toBeNull();
    click(fixture, '.credential-row button');
    fixture.detectChanges(false);
    expect(fixture.componentInstance.ShowCredentialDialog).toBe(true);
    expect(query(fixture, 'mj-credential-dialog')).not.toBeNull();
  });
});

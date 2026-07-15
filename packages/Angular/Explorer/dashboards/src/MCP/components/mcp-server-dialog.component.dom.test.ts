import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, forwardRef, Input, Output } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import type { MCPServerData } from '../mcp-dashboard.component';
import { MCPServerDialogComponent, ServerDialogResult } from './mcp-server-dialog.component';

/**
 * DOM coverage for <mj-mcp-server-dialog> — the create/edit MCP server dialog. Module-declared
 * (standalone:false), FormBuilder-driven ReactiveForm. The template is gated on `visible` and nests MJ
 * UI elements (mj-dialog / mj-dropdown / mj-numeric-input / mj-alert / mj-dialog-actions); those are
 * replaced with lightweight standalone stubs (selector + the inputs/outputs the template binds) so we
 * test THIS dialog's structure — title/edit-mode, transport-driven field gating, error alert, and the
 * save/cancel outputs — not the real UI kit. No async on init. Single sync render per test.
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
// A no-op ControlValueAccessor so the template's [ngModel] on these stubs binds cleanly under
// FormsModule (the real components are CVAs too). Without it, ngModel triggers NgControlStatus →
// "No provider for NgControl".
class NoopCva implements ControlValueAccessor {
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}
@Component({
  selector: 'mj-dropdown',
  standalone: true,
  template: '<ng-content></ng-content>',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StubDropdown), multi: true }],
})
class StubDropdown extends NoopCva {
  @Input() Data: unknown;
  @Input() TextField = '';
  @Input() ValueField = '';
  @Input() ValuePrimitive = false;
  @Output() ValueChange = new EventEmitter<unknown>();
}
@Component({
  selector: 'mj-numeric-input',
  standalone: true,
  template: '',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StubNumeric), multi: true }],
})
class StubNumeric extends NoopCva {
  @Input() Min = 0;
  @Input() Max = 0;
  @Input() Step = 0;
  @Input() Placeholder = '';
}

const SERVER: MCPServerData = {
  ID: 'srv-1',
  Name: 'GitHub MCP',
  Description: 'desc',
  TransportType: 'StreamableHTTP',
  ServerURL: 'https://example.com/mcp',
  Command: null,
  DefaultAuthType: 'None',
  RateLimitPerMinute: null,
  RateLimitPerHour: null,
  Status: 'Active',
} as unknown as MCPServerData;

const render = (inputs: { server?: MCPServerData | null; visible?: boolean } = {}) =>
  renderComponentFixture(MCPServerDialogComponent, {
    declarations: [MCPServerDialogComponent],
    imports: [ReactiveFormsModule, FormsModule, StubDialog, StubDialogActions, StubAlert, StubDropdown, StubNumeric],
    inputs: { server: inputs.server ?? null, visible: inputs.visible ?? true },
  });

describe('MCPServerDialogComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    expect(query(render({ visible: false }), 'mj-dialog')).toBeNull();
  });

  it('shows the "Add" title + Create button in create mode (no server)', () => {
    const fixture = render({ server: null });
    expect(fixture.componentInstance.DialogTitle).toBe('Add MCP Server');
    expect(fixture.componentInstance.IsEditMode).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Create');
  });

  it('shows the "Edit" title + Update button in edit mode (server has ID)', () => {
    const fixture = render({ server: SERVER });
    expect(fixture.componentInstance.DialogTitle).toBe('Edit MCP Server');
    expect(fixture.nativeElement.textContent).toContain('Update');
  });

  it('shows the Server URL field for an HTTP transport (RequiresURL)', () => {
    const fixture = render({ server: SERVER });
    expect(query(fixture, 'input[formControlName="ServerURL"]')).not.toBeNull();
    expect(query(fixture, 'input[formControlName="Command"]')).toBeNull();
  });

  it('shows the Command field (not URL) for a Stdio transport', () => {
    const fixture = render({ server: { ...SERVER, TransportType: 'Stdio' } as MCPServerData });
    expect(query(fixture, 'input[formControlName="Command"]')).not.toBeNull();
    expect(query(fixture, 'input[formControlName="ServerURL"]')).toBeNull();
  });

  it('does not render the error alert while ErrorMessage is null (gating)', () => {
    const fixture = render({ server: SERVER });
    expect(fixture.componentInstance.ErrorMessage).toBeNull();
    expect(query(fixture, 'mj-alert')).toBeNull();
  });

  it('emits close({saved:false}) when Cancel is clicked', () => {
    const fixture = render({ server: SERVER });
    const closed = capture<ServerDialogResult>(fixture.componentInstance.close);
    fixture.componentInstance.cancel();
    expect(closed).toEqual([{ saved: false }]);
  });
});

import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { AgentPermissionsDialogComponent } from './agent-permissions-dialog.component';

/**
 * Stub for the data-bound <mj-agent-permissions-panel> child so the wrapper renders
 * without its AgentPermissionsService / RunView dependencies. We test only the
 * wrapper's own template (title, subtitle gating, close wiring, panel hookup).
 */
@Component({ standalone: false, selector: 'mj-agent-permissions-panel', template: '' })
class StubAgentPermissionsPanelComponent {
  @Input() Agent: unknown = null;
  @Output() PermissionsChanged = new EventEmitter<void>();
}

/** Minimal agent shape — only .Name is read by this wrapper's template. */
const agent = { Name: 'Sales Agent' };

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(AgentPermissionsDialogComponent, {
    imports: [CommonModule],
    declarations: [AgentPermissionsDialogComponent, StubAgentPermissionsPanelComponent],
    inputs,
  });
}

function renderVisible(inputs: Record<string, unknown>) {
  return renderComponentFixture(AgentPermissionsDialogComponent, {
    imports: [CommonModule],
    declarations: [AgentPermissionsDialogComponent, StubAgentPermissionsPanelComponent],
    inputs,
    setup: (instance) => {
      instance.IsVisible = true;
    },
  });
}

describe('AgentPermissionsDialogComponent (DOM)', () => {
  it('always renders the static "Manage Permissions" title', () => {
    const fixture = render({ Agent: agent });
    expect(text(fixture, '.apd-title')).toBe('Manage Permissions');
  });

  it('shows the agent name as subtitle when an Agent is bound', () => {
    const fixture = render({ Agent: agent });
    expect(text(fixture, '.apd-subtitle')).toBe('Sales Agent');
  });

  it('hides the subtitle when no Agent is bound (@if gating)', () => {
    const fixture = render({ Agent: null });
    expect(query(fixture, '.apd-subtitle')).toBeNull();
  });

  it('starts not-visible (IsVisible flips on a later microtask)', () => {
    const fixture = render({ Agent: agent });
    expect(hasClass(fixture, '.apd-dialog', 'apd-visible')).toBe(false);
  });

  it('renders the open state (apd-visible) when IsVisible is set before first CD', () => {
    const fixture = renderVisible({ Agent: agent });
    expect(hasClass(fixture, '.apd-dialog', 'apd-visible')).toBe(true);
    expect(hasClass(fixture, '.apd-backdrop', 'apd-visible')).toBe(true);
  });

  it('hides the dialog when the close button is clicked', () => {
    const fixture = renderVisible({ Agent: agent });
    click(fixture, '.apd-close-btn');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsVisible).toBe(false);
    expect(hasClass(fixture, '.apd-dialog', 'apd-visible')).toBe(false);
  });

  it('hides the dialog when the backdrop is clicked', () => {
    const fixture = renderVisible({ Agent: agent });
    click(fixture, '.apd-backdrop');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsVisible).toBe(false);
  });

  it('re-emits PermissionsChanged when the child panel emits it (template binding)', () => {
    const fixture = renderVisible({ Agent: agent });
    const changed = capture(fixture.componentInstance.PermissionsChanged);

    const panelDe = fixture.debugElement.query(By.directive(StubAgentPermissionsPanelComponent));
    expect(panelDe).not.toBeNull();

    // The wrapper template wires (PermissionsChanged)="PermissionsChanged.emit()".
    (panelDe.componentInstance as StubAgentPermissionsPanelComponent).PermissionsChanged.emit();
    expect(changed.length).toBe(1);
  });
});

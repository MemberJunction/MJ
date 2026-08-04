import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { AgentPermissionsSlideoverComponent } from './agent-permissions-slideover.component';

/** Stub for the data-bound <mj-agent-permissions-panel> child (see dialog spec). */
@Component({ standalone: false, selector: 'mj-agent-permissions-panel', template: '' })
class StubAgentPermissionsPanelComponent {
  @Input() Agent: unknown = null;
  @Output() PermissionsChanged = new EventEmitter<void>();
}

/** Minimal agent shape — only .Name is read by this wrapper's template. */
const agent = { Name: 'Support Agent' };

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(AgentPermissionsSlideoverComponent, {
    imports: [CommonModule],
    declarations: [AgentPermissionsSlideoverComponent, StubAgentPermissionsPanelComponent],
    inputs,
  });
}

function renderVisible(inputs: Record<string, unknown>) {
  return renderComponentFixture(AgentPermissionsSlideoverComponent, {
    imports: [CommonModule],
    declarations: [AgentPermissionsSlideoverComponent, StubAgentPermissionsPanelComponent],
    inputs,
    setup: (instance) => {
      instance.IsVisible = true;
    },
  });
}

describe('AgentPermissionsSlideoverComponent (DOM)', () => {
  it('always renders the static "Permissions" title', () => {
    const fixture = render({ Agent: agent });
    expect(text(fixture, '.aps-title')).toBe('Permissions');
  });

  it('shows the agent name as subtitle when an Agent is bound', () => {
    const fixture = render({ Agent: agent });
    expect(text(fixture, '.aps-subtitle')).toBe('Support Agent');
  });

  it('hides the subtitle when no Agent is bound (@if gating)', () => {
    const fixture = render({ Agent: null });
    expect(query(fixture, '.aps-subtitle')).toBeNull();
  });

  it('binds the panel width via [style.width.px] to the default WidthPx (560)', () => {
    const fixture = renderVisible({ Agent: agent });
    const panel = query(fixture, '.aps-panel') as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(panel!.style.width).toBe('560px');
  });

  it('starts not-visible (IsVisible flips on a later microtask)', () => {
    const fixture = render({ Agent: agent });
    expect(hasClass(fixture, '.aps-panel', 'aps-visible')).toBe(false);
  });

  it('renders the open state (aps-visible) when IsVisible is set before first CD', () => {
    const fixture = renderVisible({ Agent: agent });
    expect(hasClass(fixture, '.aps-panel', 'aps-visible')).toBe(true);
    expect(hasClass(fixture, '.aps-backdrop', 'aps-visible')).toBe(true);
  });

  it('hides the panel when the close button is clicked', () => {
    const fixture = renderVisible({ Agent: agent });
    click(fixture, '.aps-close-btn');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsVisible).toBe(false);
    expect(hasClass(fixture, '.aps-panel', 'aps-visible')).toBe(false);
  });

  it('hides the panel when the backdrop is clicked', () => {
    const fixture = renderVisible({ Agent: agent });
    click(fixture, '.aps-backdrop');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsVisible).toBe(false);
  });

  it('re-emits PermissionsChanged when the child panel emits it (template binding)', () => {
    const fixture = renderVisible({ Agent: agent });
    const changed = capture(fixture.componentInstance.PermissionsChanged);

    const panelDe = fixture.debugElement.query(By.directive(StubAgentPermissionsPanelComponent));
    expect(panelDe).not.toBeNull();

    (panelDe.componentInstance as StubAgentPermissionsPanelComponent).PermissionsChanged.emit();
    expect(changed.length).toBe(1);
  });
});

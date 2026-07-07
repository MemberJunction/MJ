import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { CreateAgentDialogComponent } from './create-agent-dialog.component';
import type { CreateAgentConfig } from './create-agent-panel.component';

/**
 * Stub for the data-bound <mj-create-agent-panel> child so the wrapper can render
 * without touching providers/RunView/AIEngineBase. We only test the wrapper's own
 * template contract (title, subtitle gating, close wiring), not the panel.
 */
@Component({ standalone: false, selector: 'mj-create-agent-panel', template: '' })
class StubCreateAgentPanelComponent {
  @Input() Config: CreateAgentConfig = {};
  @Output() Created = new EventEmitter<unknown>();
  @Output() Cancelled = new EventEmitter<void>();
}

function render(config: CreateAgentConfig) {
  return renderComponentFixture(CreateAgentDialogComponent, {
    imports: [CommonModule],
    declarations: [CreateAgentDialogComponent, StubCreateAgentPanelComponent],
    inputs: { Config: config },
  });
}

/**
 * Render with IsVisible forced ON before the first change-detection pass — the
 * zoneless-correct way to assert the "open" template state (see guide §5, option 2).
 * The component itself flips IsVisible on a microtask, so we set it deterministically.
 */
function renderVisible(config: CreateAgentConfig) {
  return renderComponentFixture(CreateAgentDialogComponent, {
    imports: [CommonModule],
    declarations: [CreateAgentDialogComponent, StubCreateAgentPanelComponent],
    inputs: { Config: config },
    setup: (instance) => {
      instance.IsVisible = true;
    },
  });
}

describe('CreateAgentDialogComponent (DOM)', () => {
  it('renders the default "Create New Agent" title when no Title/parent is set', () => {
    const fixture = render({});
    expect(text(fixture, '.cad-title')).toBe('Create New Agent');
  });

  it('renders "Create Sub-Agent" when a ParentAgentId is set without an explicit Title', () => {
    const fixture = render({ ParentAgentId: 'P1' });
    expect(text(fixture, '.cad-title')).toBe('Create Sub-Agent');
  });

  it('prefers an explicit Title over the computed default', () => {
    const fixture = render({ Title: 'My Custom Title', ParentAgentId: 'P1' });
    expect(text(fixture, '.cad-title')).toBe('My Custom Title');
  });

  it('hides the subtitle when no ParentAgentName is provided (@if gating)', () => {
    const fixture = render({});
    expect(query(fixture, '.cad-subtitle')).toBeNull();
  });

  it('shows the parent-agent subtitle when ParentAgentName is provided', () => {
    const fixture = render({ ParentAgentName: 'Orchestrator' });
    expect(query(fixture, '.cad-subtitle')).not.toBeNull();
    expect(text(fixture, '.cad-subtitle')).toBe('Sub-agent of Orchestrator');
  });

  it('starts not-visible (IsVisible flips on a later microtask, not at first CD)', () => {
    const fixture = render({});
    expect(hasClass(fixture, '.cad-dialog', 'cad-visible')).toBe(false);
    expect(hasClass(fixture, '.cad-backdrop', 'cad-visible')).toBe(false);
  });

  it('renders the open state (cad-visible) when IsVisible is set before first CD', () => {
    const fixture = renderVisible({});
    expect(hasClass(fixture, '.cad-dialog', 'cad-visible')).toBe(true);
    expect(hasClass(fixture, '.cad-backdrop', 'cad-visible')).toBe(true);
  });

  it('hides the dialog (clears IsVisible) when the close button is clicked', () => {
    const fixture = renderVisible({});
    expect(hasClass(fixture, '.cad-dialog', 'cad-visible')).toBe(true);

    click(fixture, '.cad-close-btn');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsVisible).toBe(false);
    expect(hasClass(fixture, '.cad-dialog', 'cad-visible')).toBe(false);
  });

  it('hides the dialog when the backdrop is clicked', () => {
    const fixture = renderVisible({});

    click(fixture, '.cad-backdrop');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsVisible).toBe(false);
  });

  it('renders the stub panel child and forwards its Created event while closing', () => {
    const fixture = renderVisible({});
    const created = capture(fixture.componentInstance.Created);

    const panel = query(fixture, 'mj-create-agent-panel');
    expect(panel).not.toBeNull();

    const result = { Agent: {} } as never;
    fixture.componentInstance.OnCreated(result);
    expect(created).toEqual([result]);
    expect(fixture.componentInstance.IsVisible).toBe(false);
  });
});

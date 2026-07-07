import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { CreateAgentSlideInComponent } from './create-agent-slidein.component';
import type { CreateAgentConfig } from './create-agent-panel.component';

/** Stub for the data-bound <mj-create-agent-panel> child (see create-agent-dialog spec). */
@Component({ standalone: false, selector: 'mj-create-agent-panel', template: '' })
class StubCreateAgentPanelComponent {
  @Input() Config: CreateAgentConfig = {};
  @Output() Created = new EventEmitter<unknown>();
  @Output() Cancelled = new EventEmitter<void>();
}

function render(config: CreateAgentConfig) {
  return renderComponentFixture(CreateAgentSlideInComponent, {
    imports: [CommonModule],
    declarations: [CreateAgentSlideInComponent, StubCreateAgentPanelComponent],
    inputs: { Config: config },
  });
}

function renderVisible(config: CreateAgentConfig) {
  return renderComponentFixture(CreateAgentSlideInComponent, {
    imports: [CommonModule],
    declarations: [CreateAgentSlideInComponent, StubCreateAgentPanelComponent],
    inputs: { Config: config },
    setup: (instance) => {
      instance.IsVisible = true;
    },
  });
}

describe('CreateAgentSlideInComponent (DOM)', () => {
  it('renders the default "Create New Agent" title', () => {
    const fixture = render({});
    expect(text(fixture, '.cas-title')).toBe('Create New Agent');
  });

  it('renders "Create Sub-Agent" when ParentAgentId is set without a Title', () => {
    const fixture = render({ ParentAgentId: 'P1' });
    expect(text(fixture, '.cas-title')).toBe('Create Sub-Agent');
  });

  it('prefers an explicit Title over the computed default', () => {
    const fixture = render({ Title: 'Slide Title', ParentAgentId: 'P1' });
    expect(text(fixture, '.cas-title')).toBe('Slide Title');
  });

  it('hides the subtitle when no ParentAgentName is provided (@if gating)', () => {
    const fixture = render({});
    expect(query(fixture, '.cas-subtitle')).toBeNull();
  });

  it('shows the parent-agent subtitle when ParentAgentName is provided', () => {
    const fixture = render({ ParentAgentName: 'Orchestrator' });
    expect(text(fixture, '.cas-subtitle')).toBe('Sub-agent of Orchestrator');
  });

  it('binds the panel width via [style.width.px] to the default WidthPx (640)', () => {
    const fixture = renderVisible({});
    const panel = query(fixture, '.cas-panel') as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(panel!.style.width).toBe('640px');
  });

  it('starts not-visible (IsVisible flips on a later microtask)', () => {
    const fixture = render({});
    expect(hasClass(fixture, '.cas-panel', 'cas-visible')).toBe(false);
  });

  it('renders the open state (cas-visible) when IsVisible is set before first CD', () => {
    const fixture = renderVisible({});
    expect(hasClass(fixture, '.cas-panel', 'cas-visible')).toBe(true);
    expect(hasClass(fixture, '.cas-backdrop', 'cas-visible')).toBe(true);
  });

  it('hides the panel when the close button is clicked', () => {
    const fixture = renderVisible({});
    click(fixture, '.cas-close-btn');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsVisible).toBe(false);
    expect(hasClass(fixture, '.cas-panel', 'cas-visible')).toBe(false);
  });

  it('hides the panel when the backdrop is clicked', () => {
    const fixture = renderVisible({});
    click(fixture, '.cas-backdrop');
    fixture.detectChanges();
    expect(fixture.componentInstance.IsVisible).toBe(false);
  });

  it('forwards the panel Created event and closes', () => {
    const fixture = renderVisible({});
    const created = capture(fixture.componentInstance.Created);
    expect(query(fixture, 'mj-create-agent-panel')).not.toBeNull();

    const result = { Agent: {} } as never;
    fixture.componentInstance.OnCreated(result);
    expect(created).toEqual([result]);
    expect(fixture.componentInstance.IsVisible).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { NavigationService } from '@memberjunction/ng-shared';
import { CreateAgentService } from '@memberjunction/ng-agents';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { AgentEditorComponent } from './agent-editor.component';

/**
 * DOM smoke coverage for <mj-agent-editor>. Its main surface (tabs, D3 hierarchy chart, prompts,
 * properties) is entirely gated on `currentAgent`, which is only populated by an async RunView load
 * triggered when `agentId` is set. With agentId=null that load never runs, so the component renders
 * only its static header — no data infra, no chart. We fake the two constructor-injected services
 * (NavigationService, CreateAgentService), which are touched only in event handlers, not on render.
 * Covers: the always-present Back button + its close output, and that the agent-gated chrome
 * (Open Record button, tab navigation) is absent when there is no current agent.
 */

const render = () =>
  renderComponentFixture(AgentEditorComponent, {
    imports: [CommonModule],
    declarations: [AgentEditorComponent],
    providers: [
      { provide: NavigationService, useValue: {} },
      { provide: CreateAgentService, useValue: {} },
    ],
    inputs: { agentId: null },
  });

describe('AgentEditorComponent (DOM)', () => {
  it('renders the editor container with the Back to Agents button', () => {
    const fixture = render();
    expect(query(fixture, '.agent-editor-container')).not.toBeNull();
    expect(text(fixture, '.back-btn')).toContain('Back to Agents');
  });

  it('emits close when the Back button is clicked', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.close);
    (query(fixture, '.back-btn') as HTMLElement).click();
    expect(closed.length).toBe(1);
  });

  it('hides the agent-gated chrome (Open Record + tabs) when there is no current agent', () => {
    const fixture = render();
    expect(query(fixture, '.open-btn')).toBeNull();
    expect(query(fixture, '.tab-navigation')).toBeNull();
    expect(query(fixture, '.hierarchy-chart')).toBeNull();
  });

  it('does not show the loading or error containers on the empty (no agentId) render', () => {
    const fixture = render();
    expect(query(fixture, 'mj-loading')).toBeNull();
    expect(query(fixture, '.error-container')).toBeNull();
  });
});

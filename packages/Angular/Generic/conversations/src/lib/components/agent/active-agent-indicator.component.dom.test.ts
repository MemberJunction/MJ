import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { ActiveAgentIndicatorComponent } from './active-agent-indicator.component';
import { AgentStateService, AgentStatus } from '../../services/agent-state.service';

/**
 * DOM spec for <mj-active-agent-indicator> — the chat-header strip of active-agent
 * avatars. ngOnInit subscribes to AgentStateService.getActiveAgents(conversationId),
 * so a stub service emitting a fixed list drives every branch: the empty gate, the
 * status modifier classes, the pulse-ring gating, the confidence badge, the
 * maxVisibleAgents overflow (+N) / expand behavior, and both outputs.
 */
describe('ActiveAgentIndicatorComponent (DOM)', () => {
  const currentUser = { ID: 'u1' } as unknown as UserInfo;

  type AgentEntry = { run: MJAIAgentRunEntity; status: AgentStatus; confidence: number | null };
  const makeAgent = (id: string, status: AgentStatus, confidence: number | null = null, name = 'Sage'): AgentEntry => ({
    // Test seam: the template reads only run.ID / run.Agent, so a plain cast stands in for the entity.
    run: { ID: id, Agent: name } as unknown as MJAIAgentRunEntity,
    status,
    confidence,
  });

  const render = (agents: AgentEntry[], inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(ActiveAgentIndicatorComponent, {
      declarations: [ActiveAgentIndicatorComponent],
      providers: [{ provide: AgentStateService, useValue: { getActiveAgents: () => of(agents) } }],
      inputs: { currentUser, conversationId: 'c1', ...inputs },
    });

  it('renders nothing when there are no active agents', () => {
    const f = render([]);
    expect(query(f, '.active-agents-container')).toBeNull();
  });

  it('renders one avatar per agent with the agent count on the panel toggle', () => {
    const f = render([makeAgent('r1', 'working'), makeAgent('r2', 'acknowledging')]);
    expect(queryAll(f, '.agent-avatar').length).toBe(2);
    expect(text(f, '.agent-count')).toBe('2');
    expect(text(f, '.active-agents-label')).toContain('Active:');
  });

  it('applies the status modifier class matching each agent status', () => {
    const f = render([makeAgent('r1', 'working'), makeAgent('r2', 'error')]);
    const avatars = queryAll(f, '.agent-avatar');
    expect(avatars[0].classList.contains('status-working')).toBe(true);
    expect(avatars[1].classList.contains('status-error')).toBe(true);
  });

  it('shows a pulse indicator for in-flight agents but not for completed ones', () => {
    const f = render([makeAgent('r1', 'working'), makeAgent('r2', 'completed')]);
    const avatars = queryAll(f, '.agent-avatar');
    expect(avatars[0].querySelector('.status-indicator')).not.toBeNull();
    expect(avatars[1].querySelector('.status-indicator')).toBeNull();
  });

  it('renders a confidence badge only when confidence is set, as a whole percentage', () => {
    const f = render([makeAgent('r1', 'working', 0.87), makeAgent('r2', 'working', null)]);
    const avatars = queryAll(f, '.agent-avatar');
    expect(avatars[0].querySelector('.confidence-badge')?.textContent?.trim()).toBe('87%');
    expect(avatars[1].querySelector('.confidence-badge')).toBeNull();
  });

  it('builds the tooltip from agent name, status text, and confidence', () => {
    const f = render([makeAgent('r1', 'acknowledging', 0.5, 'Scout')]);
    expect(f.componentInstance.getAgentTooltip(f.componentInstance.activeAgents[0])).toBe(
      'Scout - Acknowledging request (Confidence: 50%)'
    );
  });

  it('caps visible avatars at maxVisibleAgents and shows a +N overflow button', () => {
    const agents = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => makeAgent(id, 'working'));
    const f = render(agents, { maxVisibleAgents: 3 });
    expect(queryAll(f, '.agent-avatar').length).toBe(3);
    expect(text(f, '.more-agents')).toBe('+2');
  });

  it('expands to show all avatars when the overflow button is clicked', () => {
    const agents = ['r1', 'r2', 'r3', 'r4'].map((id) => makeAgent(id, 'working'));
    const f = render(agents, { maxVisibleAgents: 2 });
    (query(f, '.more-agents') as HTMLButtonElement).click();
    f.detectChanges();
    expect(queryAll(f, '.agent-avatar').length).toBe(4);
    expect(query(f, '.more-agents')).toBeNull();
  });

  it('emits agentSelected with the run when an avatar is clicked', () => {
    const agent = makeAgent('r9', 'working');
    const f = render([agent]);
    const picked = capture(f.componentInstance.agentSelected);
    (query(f, '.agent-avatar') as HTMLElement).click();
    expect(picked).toHaveLength(1);
    expect(picked[0].ID).toBe('r9');
  });

  it('emits togglePanel when the panel-toggle button is clicked', () => {
    const f = render([makeAgent('r1', 'working')]);
    const spy = vi.fn();
    f.componentInstance.togglePanel.subscribe(spy);
    (query(f, '.panel-toggle') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});

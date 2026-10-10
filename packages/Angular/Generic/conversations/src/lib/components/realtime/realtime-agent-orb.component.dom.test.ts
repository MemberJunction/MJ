import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { RealtimeConnectionState } from '@memberjunction/realtime-runtime';
import { AgentOrbStateFor, RealtimeAgentOrbComponent } from './realtime-agent-orb.component';

/**
 * DOM spec for <mj-realtime-agent-orb>: the call's orb. It must show the agent's turn on the orb, inside three rings, and
 * stay out of the accessibility tree (its host says what the agent is doing).
 */
describe('RealtimeAgentOrbComponent (DOM)', () => {
  it("shows the agent's turn on the orb, inside three rings, hidden from assistive technology", () => {
    const f = renderComponentFixture(RealtimeAgentOrbComponent, { inputs: { State: 'speaking' } });
    expect(query(f, '.orb')?.getAttribute('data-state')).toBe('speaking');
    expect(queryAll(f, '.orb-ring')).toHaveLength(3);
    expect(query(f, '.orb-stage')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('follows a change of turn', () => {
    const f = renderComponentFixture(RealtimeAgentOrbComponent, { inputs: { State: 'listening' } });
    f.componentRef.setInput('State', 'thinking');
    f.detectChanges();
    expect(query(f, '.orb')?.getAttribute('data-state')).toBe('thinking');
  });

  it("maps the call's state to a turn: speaking and thinking as such, everything else as listening", () => {
    expect(AgentOrbStateFor('speaking')).toBe('speaking');
    expect(AgentOrbStateFor('thinking')).toBe('thinking');
    const others: Array<RealtimeConnectionState | null | undefined> = ['listening', 'connecting', 'error', 'closed', null, undefined];
    expect(others.map((state) => AgentOrbStateFor(state))).toEqual(Array(6).fill('listening'));
  });
});

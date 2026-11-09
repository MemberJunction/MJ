import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { LiveKitAgentStateComponent } from './livekit-agent-state.component';

/**
 * DOM spec for the deprecated <mj-livekit-agent-state> wrapper: it renders `mj-agent-state` (whose own spec, in
 * ng-realtime-media, covers the states and the label) and passes its inputs through.
 */
describe('LiveKitAgentStateComponent (DOM, deprecated wrapper)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(LiveKitAgentStateComponent, { inputs });

  it('renders mj-agent-state with the state and the agent name', () => {
    const f = render({ State: 'thinking', AgentName: 'Sage' });
    expect(query(f, 'mj-agent-state .agent--thinking')).not.toBeNull();
    expect(text(f, '.agent__label')).toContain('Sage · thinking…');
    expect(f.componentInstance.labelText).toBe('thinking…');
  });

  it('passes ShowLabel through', () => {
    expect(query(render({ ShowLabel: false }), '.agent__label')).toBeNull();
  });
});

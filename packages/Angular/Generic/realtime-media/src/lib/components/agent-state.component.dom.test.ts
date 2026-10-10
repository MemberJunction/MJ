import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import type { MediaAgentState } from '@memberjunction/ai-realtime-client/media';
import { MediaAgentStateComponent } from './agent-state.component';

/** Moved from ng-livekit-room's agent-state spec; each case keeps its meaning. */
describe('MediaAgentStateComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(MediaAgentStateComponent, { inputs });

  it('renders the idle state by default', () => {
    const f = render();
    expect(query(f, '.agent--idle')).not.toBeNull();
    expect(text(f, '.agent__label')).toContain('Agent · idle');
  });

  it('applies the state modifier class for each state', () => {
    for (const state of ['listening', 'thinking', 'speaking'] as MediaAgentState[]) {
      const f = render({ State: state });
      expect(query(f, `.agent--${state}`)).not.toBeNull();
    }
  });

  it('shows the spinning icon only while thinking', () => {
    const thinking = render({ State: 'thinking' });
    expect(query(thinking, '.agent__orb .fa-spinner.fa-spin')).not.toBeNull();
    expect(query(thinking, '.agent__orb .fa-robot')).toBeNull();

    const speaking = render({ State: 'speaking' });
    expect(query(speaking, '.agent__orb .fa-robot')).not.toBeNull();
    expect(query(speaking, '.agent__orb .fa-spinner')).toBeNull();
  });

  it('renders the agent name and the state in the label', () => {
    const f = render({ State: 'thinking', AgentName: 'Sage' });
    expect(text(f, '.agent__label')).toContain('Sage · thinking…');
  });

  it('hides the label when ShowLabel is false', () => {
    const f = render({ ShowLabel: false });
    expect(query(f, '.agent__label')).toBeNull();
  });
});

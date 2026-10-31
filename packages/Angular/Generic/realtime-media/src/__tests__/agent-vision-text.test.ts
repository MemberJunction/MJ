import { describe, expect, it } from 'vitest';
import { AgentVisionText } from '../lib/agent-vision-text';

/**
 * Agent vision is one room-wide choice: every agent in the room honors it, including agents that join after the
 * person turns it on. The control's name says so in both the one-agent and the several-agent wording.
 */
describe('AgentVisionText', () => {
  it('says the choice covers agents that join later, with one agent', () => {
    const words = AgentVisionText(1);
    expect(words.LetName).toBe('Let the agent, and any agent that joins later, see your camera and screen');
    expect(words.StopName).toBe('Stop letting the agent, and any agent that joins later, see your camera and screen');
  });

  it('says the choice covers every agent in the room now or later, with several agents', () => {
    const words = AgentVisionText(3);
    expect(words.LetName).toBe('Let every agent in this room, including any that join later, see your camera and screen');
    expect(words.StopName).toBe('Stop letting every agent in this room, including any that join later, see your camera and screen');
  });

  it('keeps the short labels and chips unchanged', () => {
    expect(AgentVisionText(1)).toMatchObject({ Let: 'Let the agent see me', Hide: 'Hide from the agent', CanSee: 'Agent can see' });
    expect(AgentVisionText(2)).toMatchObject({ Let: 'Let agents see me', Hide: 'Hide from agents', CanSee: 'Agents can see' });
  });

  it('uses the one-agent wording when no agent has joined yet', () => {
    expect(AgentVisionText(0)).toBe(AgentVisionText(1));
  });
});

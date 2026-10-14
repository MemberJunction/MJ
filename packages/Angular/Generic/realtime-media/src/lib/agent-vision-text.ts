/**
 * The words the media kit uses for whether agents see the user: the tile's chip, the self-view's badge, the
 * agent-vision control, and the notice when the choice can't be saved. They are plural only in a room with more than one agent; a call with one agent says "the agent".
 */
export interface AgentVisionWords {
  /** The tile's chip while an agent can see the participant: "Agent can see" / "Agents can see". */
  CanSee: string;
  /** The self-view's badge while the user's frames reach an agent: "Agent can see this" / "Agents can see this". */
  CanSeeThis: string;
  /** The control's label while agents can't see the user: "Let the agent see me" / "Let agents see me". */
  Let: string;
  /** The control's label while they can: "Hide from the agent" / "Hide from agents". */
  Hide: string;
  /** The control's name while agents can't see the user. */
  LetName: string;
  /** The control's name while they can. */
  StopName: string;
  /** The start of the notice when the choice couldn't be saved: "Couldn't change what the agent sees" / "... agents see". */
  ChangeFailed: string;
}

const ONE_AGENT: AgentVisionWords = {
  CanSee: 'Agent can see',
  CanSeeThis: 'Agent can see this',
  Let: 'Let the agent see me',
  Hide: 'Hide from the agent',
  LetName: 'Let the agent see your camera and screen',
  StopName: 'Stop letting the agent see your camera and screen',
  ChangeFailed: "Couldn't change what the agent sees",
};

const SEVERAL_AGENTS: AgentVisionWords = {
  CanSee: 'Agents can see',
  CanSeeThis: 'Agents can see this',
  Let: 'Let agents see me',
  Hide: 'Hide from agents',
  LetName: 'Let agents in this room see your camera and screen',
  StopName: 'Stop letting agents in this room see your camera and screen',
  ChangeFailed: "Couldn't change what agents see",
};

/**
 * The agent-vision words for a room with this many agents: plural when there is more than one, singular otherwise.
 *
 * @param agentCount The number of agents in the room or call.
 */
export function AgentVisionText(agentCount: number): AgentVisionWords {
  return agentCount > 1 ? SEVERAL_AGENTS : ONE_AGENT;
}

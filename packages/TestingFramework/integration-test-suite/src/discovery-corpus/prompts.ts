/**
 * prompts.ts — the prompts `rigs/generate-discovery-corpus.ts` sends to write the agent-discovery
 * corpus (typed-decision plan, Task 3.1).
 *
 * The corpus measures whether Sage's discovery decision reaches the agent a request needs. Its labels
 * come from construction: a request written FOR an agent is labelled with that agent. That only works
 * if the requests read like real traffic, so the prompts insist on two things:
 *
 *   - requests a real user would type: short and long, direct and indirect, with ordinary sloppiness;
 *   - requests that do NOT echo the agent's name or description. Discovery reads descriptions, so a
 *     request that copies one would measure string matching, not judgement.
 *
 * Each prompt is sent as one system message ({@link DISCOVERY_CORPUS_GENERATION_PROMPT}) and one user
 * message (built below), and asks for JSON only: `{"requests": ["...", ...]}`.
 */

import type { DecisionDiscoveryOption } from '@memberjunction/ai-agents';
import type { DiscoveryNoneKind } from '@memberjunction/testing-engine';

/**
 * The system prompt for every generation call. It tells the model who the requests are for, how real
 * users write, what never to write (the agent's name, its description's wording, anything about
 * agents or routing), and the reply format.
 */
export const DISCOVERY_CORPUS_GENERATION_PROMPT = [
    'You write realistic test messages for measuring how an AI assistant routes work.',
    'The assistant is a conversation manager. For each user message it does one of three things: it answers',
    'the message itself, it plans a workflow across several specialist agents, or it hands the message to the',
    'one specialist agent that should do the work.',
    '',
    'Write each message the way a real user types into a chat box at work:',
    '- vary the length: some are a few words, some are two or three sentences with background;',
    '- vary the form: direct instructions, questions, and descriptions of a situation or goal that only imply',
    '  what the user needs;',
    '- keep ordinary imperfections: lowercase starts, missing punctuation, the occasional typo or shorthand;',
    '- invent concrete, plausible details (names, dates, amounts, products) instead of placeholders.',
    '',
    'Never:',
    '- name any agent, or mention agents, assistants, routing, tools or this exercise;',
    '- reuse the wording of an agent\'s description. Describe the user\'s need in the user\'s own words; at most',
    '  one message in five may share a distinctive word with the description;',
    '- repeat a message, or write two that differ only in small details.',
    '',
    'Reply with JSON only, with no prose and no code fence: {"requests": ["first message", "second message"]}'
].join('\n');

/** How each kind of `none` request is described to the model. */
const NONE_KIND_INSTRUCTIONS: Record<DiscoveryNoneKind, string> = {
    chat: 'small talk or social chit-chat: greetings, thanks, reactions, jokes, or questions about the assistant '
        + 'itself. None of them asks for any work, and none of the specialist agents below is needed.',
    direct: 'general questions that a knowledgeable assistant answers directly from general knowledge in a few '
        + 'sentences: definitions, explanations, quick how-to advice or opinions. None of them needs the '
        + 'organisation\'s data or systems, and none of the specialist agents below is needed.',
    workflow: 'requests that need two or more of the specialist agents below, in sequence or together. Each '
        + 'request must clearly involve the work of at least two different agents, so that no single agent '
        + 'could handle it alone. Do not name the agents; describe the work.'
};

/**
 * The user message asking for requests one agent should handle. The other agents are listed so the
 * model writes requests that fit this agent better than any of them, which is what makes the label
 * from construction trustworthy.
 *
 * @param agent The agent the requests are for.
 * @param others The other discoverable agents.
 * @param count How many requests to write.
 */
export function BuildAgentRequestsPrompt(agent: DecisionDiscoveryOption, others: ReadonlyArray<DecisionDiscoveryOption>, count: number): string {
    return [
        `Write ${count} different messages that this specialist agent should handle:`,
        '',
        `Agent (for your understanding only; never use its name): ${agent.Name}`,
        `What it does: ${agent.Description}`,
        '',
        'Mix them: about half ask directly for its kind of work, and about half describe a situation or goal that',
        'only implies it. Every message must fit this agent better than any of the other agents below.',
        '',
        ...catalogLines('The other agents', others)
    ].join('\n');
}

/**
 * The user message asking for requests no single specialist should handle.
 *
 * @param kind Which kind of `none` request.
 * @param agents The discoverable agents, so the model can steer clear of them (or, for a workflow, combine them).
 * @param count How many requests to write.
 */
export function BuildNoneRequestsPrompt(kind: DiscoveryNoneKind, agents: ReadonlyArray<DecisionDiscoveryOption>, count: number): string {
    return [
        `Write ${count} different messages that are ${NONE_KIND_INSTRUCTIONS[kind]}`,
        '',
        ...catalogLines('The specialist agents', agents)
    ].join('\n');
}

/**
 * The note added when a reply could not be used, before asking again.
 *
 * @param reason Why the last reply could not be used.
 */
export function BuildRetryNote(reason: string): string {
    return `Your last reply could not be used: ${reason}. Reply again with JSON only, exactly in the form {"requests": ["..."]}.`;
}

/** A titled list of agents, one per line, with their descriptions. */
function catalogLines(title: string, agents: ReadonlyArray<DecisionDiscoveryOption>): string[] {
    if (agents.length === 0) {
        return [`${title}: none.`];
    }
    return [`${title} (name: what it does):`, ...agents.map(a => `- ${a.Name}: ${a.Description}`)];
}

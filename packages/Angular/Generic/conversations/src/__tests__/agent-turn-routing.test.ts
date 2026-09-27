/**
 * @fileoverview The routing matrix for an agent turn: reply mode × mention × allowed list × route.
 *
 * `ResolveAgentTurn` is the pure rule `MessageInputComponent` applies to every saved message, so
 * the matrix is pinned here without Angular. The component-level wiring (events, rows, the host
 * handler) is pinned in agent-turn-host-rules.test.ts.
 */
import { describe, it, expect } from 'vitest';

import {
    ResolveAgentTurn,
    IsAgentAllowed,
    FindDisallowedTaskGraphAgents,
    type AgentTurnCandidates,
    type AgentTurnRules,
} from '../lib/utils/agent-turn-routing';
import type { AgentReplyMode, AgentTurnRoute } from '../lib/models/agent-turn.model';

const MANAGER = 'AAAAAAAA-0000-0000-0000-000000000001';
const TAGGED = 'AAAAAAAA-0000-0000-0000-000000000002';
const LAST = 'AAAAAAAA-0000-0000-0000-000000000003';
const PINNED = 'AAAAAAAA-0000-0000-0000-000000000004';
const HOST = 'AAAAAAAA-0000-0000-0000-000000000005';
const OTHER = 'AAAAAAAA-0000-0000-0000-000000000006';
const UNKNOWN = 'AAAAAAAA-0000-0000-0000-00000000FFFF';

const KNOWN = new Set([MANAGER, TAGGED, LAST, PINNED, HOST, OTHER]);
const isKnown = (id: string) => KNOWN.has(id.toUpperCase());

function candidates(overrides: Partial<AgentTurnCandidates> = {}): AgentTurnCandidates {
    return {
        MentionedAgentIds: [],
        ContinuityAgentId: null,
        ConversationDefaultAgentId: null,
        HostDefaultAgentId: null,
        ConversationManagerAgentId: MANAGER,
        ...overrides,
    };
}

function rules(replyMode: AgentReplyMode, allowed: string[] | null = null): AgentTurnRules {
    return { ReplyMode: replyMode, AllowedAgentIDs: allowed };
}

/** Every route with the candidate that makes it the one chosen when nothing outranks it. */
const ROUTES: ReadonlyArray<{ route: AgentTurnRoute; agent: string; set: Partial<AgentTurnCandidates> }> = [
    { route: 'Mention', agent: TAGGED, set: { MentionedAgentIds: [TAGGED] } },
    { route: 'Continuity', agent: LAST, set: { ContinuityAgentId: LAST } },
    { route: 'ConversationDefault', agent: PINNED, set: { ConversationDefaultAgentId: PINNED } },
    { route: 'HostDefault', agent: HOST, set: { HostDefaultAgentId: HOST } },
    { route: 'ConversationManager', agent: MANAGER, set: {} },
];

describe('ResolveAgentTurn — the routing matrix', () => {
    describe.each(['Always', 'MentionOnly'] as const)('reply mode %s', (mode) => {
        describe.each([
            ['no allowed list', null],
            ['an allowed list that includes the agent', 'includes'],
            ['an allowed list that excludes the agent', 'excludes'],
        ] as const)('with %s', (_label, listKind) => {
            it.each(ROUTES)('route $route', ({ route, agent, set }) => {
                const allowed = listKind === null ? null : listKind === 'includes' ? [agent] : [OTHER];
                const result = ResolveAgentTurn(candidates(set), rules(mode, allowed), isKnown);

                const routeApplies = mode === 'Always' || route === 'Mention';
                const agentAllowed = listKind !== 'excludes';
                if (routeApplies && agentAllowed) {
                    expect(result).toEqual({ AgentId: agent, Route: route });
                } else {
                    // Nothing else is a candidate here, and OTHER is not the manager, so no turn.
                    expect(result).toBeNull();
                }
            });
        });
    });

    it('keeps MJ\'s order: mention, continuity, conversation default, host default, manager', () => {
        const all = candidates({
            MentionedAgentIds: [TAGGED],
            ContinuityAgentId: LAST,
            ConversationDefaultAgentId: PINNED,
            HostDefaultAgentId: HOST,
        });
        expect(ResolveAgentTurn(all, rules('Always'), isKnown)?.Route).toBe('Mention');
        expect(ResolveAgentTurn({ ...all, MentionedAgentIds: [] }, rules('Always'), isKnown)?.Route).toBe('Continuity');
        expect(ResolveAgentTurn({ ...all, MentionedAgentIds: [], ContinuityAgentId: null }, rules('Always'), isKnown)?.Route)
            .toBe('ConversationDefault');
        expect(ResolveAgentTurn({ ...all, MentionedAgentIds: [], ContinuityAgentId: null, ConversationDefaultAgentId: null }, rules('Always'), isKnown)?.Route)
            .toBe('HostDefault');
    });

    it('MentionOnly starts no turn for a message that tags no agent, whatever else is set', () => {
        const noMention = candidates({ ContinuityAgentId: LAST, ConversationDefaultAgentId: PINNED, HostDefaultAgentId: HOST });
        expect(ResolveAgentTurn(noMention, rules('MentionOnly'), isKnown)).toBeNull();
        expect(ResolveAgentTurn(noMention, rules('MentionOnly', [LAST, PINNED, HOST, MANAGER]), isKnown)).toBeNull();
    });

    it('takes the first tagged agent the host allows, skipping disallowed ones', () => {
        const twoTags = candidates({ MentionedAgentIds: [OTHER, TAGGED] });
        expect(ResolveAgentTurn(twoTags, rules('MentionOnly', [TAGGED]), isKnown)).toEqual({ AgentId: TAGGED, Route: 'Mention' });
        expect(ResolveAgentTurn(twoTags, rules('MentionOnly'), isKnown)).toEqual({ AgentId: OTHER, Route: 'Mention' });
    });

    it('under Always, a disallowed tag falls through to the next route instead of answering', () => {
        const result = ResolveAgentTurn(
            candidates({ MentionedAgentIds: [OTHER], HostDefaultAgentId: HOST }),
            rules('Always', [HOST]),
            isKnown
        );
        expect(result).toEqual({ AgentId: HOST, Route: 'HostDefault' });
    });

    it('a disallowed candidate falls through to the next allowed route', () => {
        const result = ResolveAgentTurn(
            candidates({ ContinuityAgentId: LAST, ConversationDefaultAgentId: PINNED, HostDefaultAgentId: HOST }),
            rules('Always', [HOST]),
            isKnown
        );
        expect(result).toEqual({ AgentId: HOST, Route: 'HostDefault' });
    });

    it('the conversation manager is narrowed like any other agent', () => {
        expect(ResolveAgentTurn(candidates(), rules('Always', [HOST]), isKnown)).toBeNull();
        expect(ResolveAgentTurn(candidates(), rules('Always', [MANAGER]), isKnown))
            .toEqual({ AgentId: MANAGER, Route: 'ConversationManager' });
        expect(ResolveAgentTurn(candidates(), rules('Always', []), isKnown)).toBeNull();
    });

    it('an unknown continuity or default agent falls back to the conversation manager, as before', () => {
        for (const set of [{ ContinuityAgentId: UNKNOWN }, { ConversationDefaultAgentId: UNKNOWN }, { HostDefaultAgentId: UNKNOWN }]) {
            expect(ResolveAgentTurn(candidates(set), rules('Always'), isKnown))
                .toEqual({ AgentId: MANAGER, Route: 'ConversationManager' });
        }
    });

    it('with no manager and no other candidate, no turn starts', () => {
        expect(ResolveAgentTurn(candidates({ ConversationManagerAgentId: null }), rules('Always'), isKnown)).toBeNull();
    });

    it('compares IDs without regard to case (SQL Server upper, PostgreSQL lower)', () => {
        const result = ResolveAgentTurn(
            candidates({ MentionedAgentIds: [TAGGED.toLowerCase()] }),
            rules('MentionOnly', [TAGGED]),
            isKnown
        );
        expect(result?.Route).toBe('Mention');
    });
});

describe('IsAgentAllowed', () => {
    it('allows every agent when there is no list', () => {
        expect(IsAgentAllowed(OTHER, null)).toBe(true);
        expect(IsAgentAllowed(OTHER, undefined)).toBe(true);
    });

    it('allows only listed agents, and none for an empty list', () => {
        expect(IsAgentAllowed(TAGGED, [TAGGED])).toBe(true);
        expect(IsAgentAllowed(OTHER, [TAGGED])).toBe(false);
        expect(IsAgentAllowed(TAGGED, [])).toBe(false);
    });

    it('never allows a missing agent', () => {
        expect(IsAgentAllowed(null, null)).toBe(false);
        expect(IsAgentAllowed(undefined, [TAGGED])).toBe(false);
    });
});

describe('FindDisallowedTaskGraphAgents', () => {
    const idByName: Record<string, string> = { Research: TAGGED, Writer: OTHER };
    const resolve = (name: string) => idByName[name] ?? null;
    const steps = [
        { kind: 'Agent', configuration: { agentName: 'Research' } },
        { kind: 'Action', configuration: { actionName: 'Send Email' } },
        { kind: 'Agent', configuration: { agentName: 'Writer' } },
        { kind: 'Agent', configuration: { agentName: 'Writer' } },
        { kind: 'Agent', configuration: { agentName: 'Nobody' } },
    ] as const;

    it('finds nothing when there is no allowed list', () => {
        expect(FindDisallowedTaskGraphAgents(steps, null, resolve)).toEqual([]);
    });

    it('names each disallowed or unknown agent once, in order', () => {
        expect(FindDisallowedTaskGraphAgents(steps, [TAGGED], resolve)).toEqual(['Writer', 'Nobody']);
    });

    it('ignores steps that do not run an agent', () => {
        expect(FindDisallowedTaskGraphAgents([{ kind: 'Action', configuration: { actionName: 'X' } }], [], resolve)).toEqual([]);
    });
});

/**
 * @fileoverview The per-composer scope on MentionAutocomplete's '@' list.
 *
 * MentionAutocomplete is one process-wide instance serving every composer on the page, so a host
 * that runs two chats side by side (a team chat and a direct chat, say) must be able to give each
 * its own '@' list without either leaking into the other. The scope therefore travels with each
 * call rather than living on the engine. Pinned here:
 *   - no scope keeps today's list: every runnable agent, and the current user;
 *   - AllowedAgentIDs narrows the agents (case-insensitive IDs), and [] offers none;
 *   - People replaces the engine's user list;
 *   - two scopes used alternately never see each other's agents or people.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: { Instance: { GetAgentConfigurationPresets: vi.fn().mockReturnValue([]) } },
    AIAgentPermissionHelper: { HasPermission: vi.fn().mockResolvedValue(true) },
    AISkillPermissionHelper: { HasPermission: vi.fn().mockResolvedValue(true) },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        public static Provider = {};
    },
}));

import { MentionAutocomplete } from '../mentions/MentionAutocomplete';
import type { MentionSuggestion, MentionSuggestionScope } from '../mentions/MentionSuggestion';

const RESEARCH = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Research', Description: 'finds things', IconClass: null, LogoURL: null };
const WRITER = { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Writer', Description: null, IconClass: null, LogoURL: null };
const CODER = { ID: 'AAAAAAAA-0000-0000-0000-000000000003', Name: 'Code Helper', Description: null, IconClass: null, LogoURL: null };
const CURRENT_USER = { ID: 'user-me', Name: 'Me Myself', Email: 'me@example.com' };

interface EngineCaches {
    agentsCache: unknown[];
    usersCache: unknown[];
    entitiesCache: unknown[];
}

function names(list: MentionSuggestion[], type: 'agent' | 'user'): string[] {
    return list.filter((s) => s.type === type).map((s) => s.name);
}

describe('MentionAutocomplete — per-composer scope on the @ list', () => {
    let engine: MentionAutocomplete;

    beforeEach(() => {
        engine = MentionAutocomplete.Instance;
        const caches = engine as unknown as EngineCaches;
        caches.agentsCache = [RESEARCH, WRITER, CODER];
        caches.usersCache = [CURRENT_USER];
        caches.entitiesCache = [];
    });

    it('with no scope, offers every runnable agent and the current user (unchanged)', () => {
        const list = engine.GetSuggestions('', true, '@');
        expect(names(list, 'agent').sort()).toEqual(['Code Helper', 'Research', 'Writer']);
        expect(names(list, 'user')).toEqual(['Me Myself']);
    });

    it('narrows the agents to the allowed list, comparing IDs case-insensitively', () => {
        const scope: MentionSuggestionScope = { AllowedAgentIDs: [RESEARCH.ID.toLowerCase()] };
        expect(names(engine.GetSuggestions('', true, '@', null, scope), 'agent')).toEqual(['Research']);
    });

    it('an empty allowed list offers no agent', () => {
        expect(names(engine.GetSuggestions('', true, '@', null, { AllowedAgentIDs: [] }), 'agent')).toEqual([]);
    });

    it('offers the host\'s people in place of the engine\'s user list, and still filters by the query', () => {
        const scope: MentionSuggestionScope = {
            People: [
                { ID: 'p-1', Name: 'Ada Lovelace', Email: 'ada@example.com' },
                { ID: 'p-2', Name: 'Grace Hopper' },
            ],
        };
        const all = engine.GetSuggestions('', true, '@', null, scope);
        expect(names(all, 'user')).toEqual(['Ada Lovelace', 'Grace Hopper']);
        expect(all.find((s) => s.id === 'p-1')?.description).toBe('ada@example.com');

        expect(names(engine.GetSuggestions('grace', true, '@', null, scope), 'user')).toEqual(['Grace Hopper']);
    });

    it('offers no people when the composer excludes users, whatever the scope', () => {
        const list = engine.GetSuggestions('', false, '@', null, { People: [{ ID: 'p-1', Name: 'Ada Lovelace' }] });
        expect(names(list, 'user')).toEqual([]);
    });

    it('keeps two composers\' lists apart when their calls interleave', () => {
        const teamChat: MentionSuggestionScope = {
            AllowedAgentIDs: [RESEARCH.ID, WRITER.ID],
            People: [{ ID: 'p-1', Name: 'Ada Lovelace' }, { ID: 'p-2', Name: 'Grace Hopper' }],
        };
        const directChat: MentionSuggestionScope = {
            AllowedAgentIDs: [CODER.ID],
            People: [{ ID: 'p-3', Name: 'Alan Turing' }],
        };

        const teamFirst = engine.GetSuggestions('', true, '@', null, teamChat);
        const direct = engine.GetSuggestions('', true, '@', null, directChat);
        const teamAgain = engine.GetSuggestions('', true, '@', null, teamChat);
        const unscoped = engine.GetSuggestions('', true, '@');

        expect(names(teamFirst, 'agent').sort()).toEqual(['Research', 'Writer']);
        expect(names(teamFirst, 'user')).toEqual(['Ada Lovelace', 'Grace Hopper']);
        expect(names(direct, 'agent')).toEqual(['Code Helper']);
        expect(names(direct, 'user')).toEqual(['Alan Turing']);
        expect(teamAgain).toEqual(teamFirst);
        expect(names(unscoped, 'user')).toEqual(['Me Myself']);
        expect(names(unscoped, 'agent')).toHaveLength(3);
    });

    it('leaves the # list alone — the scope narrows only agents and people', () => {
        (engine as unknown as { entitiesCache: unknown[] }).entitiesCache = [
            { ID: 'e-1', Name: 'Accounts', DisplayName: null, DisplayNameOrName: 'Accounts', Description: null, Icon: null },
        ];
        const hash = engine.GetSuggestions('', true, '#', null, { AllowedAgentIDs: [], People: [] });
        expect(hash.map((s) => s.name)).toEqual(['Accounts']);
    });
});

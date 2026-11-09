/**
 * @fileoverview Two composers' '@' lists don't mix.
 *
 * Every `mj-ai-composer` shares one suggestion engine (`MentionAutocompleteService`, a process-wide
 * singleton), so a host showing two chats at once — a team chat beside a direct chat — needs each
 * composer's `AllowedAgentIDs` and `MentionPeople` to stay with that composer. The scope lives on
 * each composer's own '@' provider and travels with every request; these tests interleave two
 * composers against the one engine and check neither sees the other's agents or people.
 */
import '@angular/compiler'; // JIT support — the component module evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { ComposerTriggerProvider, MentionSuggestion } from '@memberjunction/ng-composer';

import { AiComposerComponent } from '../lib/components/composer/ai-composer.component';
import { MentionAutocompleteService } from '../lib/services/mention-autocomplete.service';

const RESEARCH = { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Research', Description: null, IconClass: null, LogoURL: null };
const WRITER = { ID: 'AAAAAAAA-0000-0000-0000-000000000003', Name: 'Writer', Description: null, IconClass: null, LogoURL: null };
const CODER = { ID: 'AAAAAAAA-0000-0000-0000-000000000004', Name: 'Coder', Description: null, IconClass: null, LogoURL: null };
const ME = { ID: 'user-me', Name: 'Me Myself', Email: 'me@example.com' };

const REQUEST = { Query: '', MaxResults: 50, ContextUser: ME as unknown as UserInfo, Provider: null };

/** The composer's '@' provider — the one that carries its scope. */
function atProvider(composer: AiComposerComponent): ComposerTriggerProvider {
    const provider = composer.ActiveTriggerProviders.find(p => p.TriggerChar === '@');
    if (!provider) {
        throw new Error("composer has no '@' provider");
    }
    return provider;
}

async function atList(composer: AiComposerComponent): Promise<{ agents: string[]; people: string[] }> {
    const list: MentionSuggestion[] = await atProvider(composer).GetSuggestions(REQUEST);
    return {
        agents: list.filter(s => s.type === 'agent').map(s => s.name).sort(),
        people: list.filter(s => s.type === 'user').map(s => s.name),
    };
}

describe("mj-ai-composer — each composer keeps its own '@' scope", () => {
    beforeEach(() => {
        vi.spyOn(AIEngineBase.Instance, 'GetAgentConfigurationPresets').mockReturnValue([]);
        const engine = MentionAutocompleteService.Instance as unknown as {
            agentsCache: unknown[];
            usersCache: unknown[];
            isInitialized: boolean;
        };
        engine.agentsCache = [RESEARCH, WRITER, CODER];
        engine.usersCache = [ME];
        engine.isInitialized = true; // caches seeded above; skip the metadata load
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('a composer with neither input offers every runnable agent and the current user, as before', async () => {
        const composer = new AiComposerComponent();

        expect(await atList(composer)).toEqual({ agents: ['Coder', 'Research', 'Writer'], people: ['Me Myself'] });
    });

    it("two composers' lists stay apart when their requests interleave", async () => {
        const teamChat = new AiComposerComponent();
        teamChat.AllowedAgentIDs = [RESEARCH.ID, WRITER.ID];
        teamChat.MentionPeople = [{ ID: 'p-1', Name: 'Ada Lovelace' }, { ID: 'p-2', Name: 'Grace Hopper' }];

        const directChat = new AiComposerComponent();
        directChat.AllowedAgentIDs = [CODER.ID];
        directChat.MentionPeople = [{ ID: 'p-3', Name: 'Alan Turing' }];

        const [team, direct, teamAgain] = await Promise.all([atList(teamChat), atList(directChat), atList(teamChat)]);

        expect(team).toEqual({ agents: ['Research', 'Writer'], people: ['Ada Lovelace', 'Grace Hopper'] });
        expect(direct).toEqual({ agents: ['Coder'], people: ['Alan Turing'] });
        expect(teamAgain).toEqual(team);
    });

    it('setting a scope on one composer leaves another composer on the full list', async () => {
        const scoped = new AiComposerComponent();
        scoped.AllowedAgentIDs = [];
        const plain = new AiComposerComponent();

        expect((await atList(scoped)).agents).toEqual([]);
        expect((await atList(plain)).agents).toEqual(['Coder', 'Research', 'Writer']);
    });

    it('clearing the inputs restores the full list', async () => {
        const composer = new AiComposerComponent();
        composer.AllowedAgentIDs = [RESEARCH.ID];
        composer.MentionPeople = [{ ID: 'p-1', Name: 'Ada Lovelace' }];
        composer.AllowedAgentIDs = null;
        composer.MentionPeople = null;

        expect(await atList(composer)).toEqual({ agents: ['Coder', 'Research', 'Writer'], people: ['Me Myself'] });
    });
});

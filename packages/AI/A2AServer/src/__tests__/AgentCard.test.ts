/**
 * The public agent card is served to unauthenticated callers. Under the principal rule its reader
 * is anonymous, so with no configured service identity it carries no entity or agent names; with
 * one, it lists the entities and agents the capability settings name.
 */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { BuildAgentCard, ResolveAgentCardIdentity } from '../AgentCard.js';

const SERVICE = { ID: 'svc', Email: 'Service@Example.com' } as UserInfo;
const OTHER = { ID: 'other', Email: 'other@example.com' } as UserInfo;

describe('ResolveAgentCardIdentity', () => {
    it('is anonymous when no service user email is configured', () => {
        expect(ResolveAgentCardIdentity(undefined, [SERVICE, OTHER])).toEqual({ Kind: 'anonymous' });
        expect(ResolveAgentCardIdentity({ userEmail: '  ' }, [SERVICE, OTHER])).toEqual({ Kind: 'anonymous' });
    });

    it('resolves the configured service user by email, case-insensitively', () => {
        expect(ResolveAgentCardIdentity({ userEmail: ' service@example.com ' }, [OTHER, SERVICE])).toEqual({ Kind: 'service', User: SERVICE });
    });

    it('reports a configured email that matches no user, rather than substituting another user', () => {
        expect(ResolveAgentCardIdentity({ userEmail: 'nobody@example.com' }, [SERVICE, OTHER])).toEqual({ Kind: 'unresolved', Email: 'nobody@example.com' });
    });
});

describe('BuildAgentCard', () => {
    const settings = { agentName: 'Acme', agentDescription: 'Acme agent', streamingEnabled: true };

    it('builds a minimal card with no entity or agent lists when none are given', () => {
        const card = BuildAgentCard(settings);
        expect(card.name).toBe('Acme');
        expect(card.description).toBe('Acme agent');
        expect(card.authentication).toEqual({ type: 'apiKey', scheme: 'X-API-Key' });
        expect(card.capabilities.streaming).toBe(true);
        expect(card.capabilities).not.toHaveProperty('entities');
        expect(card.capabilities).not.toHaveProperty('agents');
    });

    it('lists the given entity and agent capabilities', () => {
        const entities = [{ name: 'Customers', schema: 'dbo', operations: ['get'] }];
        const agents = [{ name: 'Helper', operations: ['execute'] }];
        const card = BuildAgentCard(settings, { entities, agents });
        expect(card.capabilities.entities).toEqual(entities);
        expect(card.capabilities.agents).toEqual(agents);
    });
});

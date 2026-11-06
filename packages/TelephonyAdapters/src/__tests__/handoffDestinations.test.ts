import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));

import { ResolveHandoffDestination, type HandoffDestinationDeps } from '../telephony/handoffDestinations.js';
import { ResolveOutboundPolicy, type TransferTarget } from '../telephony/outboundCallPolicy.js';

const RUN_AS = { ID: 'run-as' } as unknown as UserInfo;
const PROVIDER = {} as unknown as IMetadataProvider;
const CONTEXT = { User: RUN_AS, Provider: PROVIDER };

function person(over: Partial<{ ID: string; IsActive: boolean }> = {}): UserInfo {
    return { ID: 'user-dana', IsActive: true, ...over } as unknown as UserInfo;
}

function deps(over: Partial<HandoffDestinationDeps> = {}): HandoffDestinationDeps {
    return {
        Policy: ResolveOutboundPolicy(),
        Directory: { FindByEmail: (email) => (email === 'dana@example.com' ? person() : undefined), GetSystemUser: () => undefined },
        FindAgentByName: async (name) => (name === 'Rex' ? { ID: 'agent-rex', Name: 'Rex' } : undefined),
        CanRunAgent: async () => true,
        ...over,
    };
}

describe('ResolveHandoffDestination', () => {
    describe('a number', () => {
        it('resolves a number that passes the outbound policy', async () => {
            const target: TransferTarget = { Kind: 'number', Name: 'Front desk', Number: '+14155550100' };
            expect(await ResolveHandoffDestination(target, CONTEXT, deps())).toEqual({ Ok: true, Destination: { Kind: 'number', Number: '+14155550100', DisplayName: 'Front desk' } });
        });

        it('re-checks the policy at transfer time and refuses a number the policy no longer allows', async () => {
            const target: TransferTarget = { Kind: 'number', Name: 'Premium', Number: '+19005551234' };
            const result = await ResolveHandoffDestination(target, CONTEXT, deps());
            expect(result.Ok).toBe(false);
        });
    });

    describe('a person', () => {
        const target: TransferTarget = { Kind: 'user', Name: 'Billing', UserEmail: 'dana@example.com', FallbackNumber: '+14155550199' };

        it('resolves an active user, carrying the validated fallback number', async () => {
            expect(await ResolveHandoffDestination(target, CONTEXT, deps())).toEqual({
                Ok: true,
                Destination: { Kind: 'user', UserID: 'user-dana', DisplayName: 'Billing', FallbackNumber: '+14155550199' },
            });
        });

        it('omits the fallback when the entry has none', async () => {
            const result = await ResolveHandoffDestination({ Kind: 'user', Name: 'Billing', UserEmail: 'dana@example.com' }, CONTEXT, deps());
            expect(result).toEqual({ Ok: true, Destination: { Kind: 'user', UserID: 'user-dana', DisplayName: 'Billing' } });
        });

        it('refuses a user who does not exist or is inactive, without saying which', async () => {
            const unknown = await ResolveHandoffDestination({ ...target, UserEmail: 'nobody@example.com' }, CONTEXT, deps());
            const inactive = await ResolveHandoffDestination(target, CONTEXT, deps({ Directory: { FindByEmail: () => person({ IsActive: false }), GetSystemUser: () => undefined } }));
            expect(unknown).toEqual({ Ok: false, Error: 'Billing is not available.' });
            expect(inactive).toEqual(unknown);
        });

        it('refuses when the fallback number no longer passes the outbound policy', async () => {
            const result = await ResolveHandoffDestination({ ...target, FallbackNumber: '+19005551234' }, CONTEXT, deps());
            expect(result.Ok).toBe(false);
        });
    });

    describe('another agent', () => {
        const target: TransferTarget = { Kind: 'agent', Name: 'Legal', AgentName: 'Rex' };

        it('resolves an agent that exists and the run-as user may run', async () => {
            expect(await ResolveHandoffDestination(target, CONTEXT, deps())).toEqual({ Ok: true, Destination: { Kind: 'agent', AgentID: 'agent-rex', AgentName: 'Rex' } });
        });

        it('refuses an agent that does not exist', async () => {
            const result = await ResolveHandoffDestination({ ...target, AgentName: 'Ghost' }, CONTEXT, deps());
            expect(result).toEqual({ Ok: false, Error: 'Ghost is not available.' });
        });

        it('refuses an agent the run-as user is not permitted to run, with the same answer as a missing one', async () => {
            const result = await ResolveHandoffDestination(target, CONTEXT, deps({ CanRunAgent: async () => false }));
            expect(result).toEqual({ Ok: false, Error: 'Rex is not available.' });
        });

        it('passes the run-as user and provider to the agent lookup and the permission check', async () => {
            const find = vi.fn(async () => ({ ID: 'agent-rex', Name: 'Rex' }));
            const canRun = vi.fn(async () => true);
            await ResolveHandoffDestination(target, CONTEXT, deps({ FindAgentByName: find, CanRunAgent: canRun }));
            expect(find).toHaveBeenCalledWith('Rex', RUN_AS, PROVIDER);
            expect(canRun).toHaveBeenCalledWith('agent-rex', RUN_AS);
        });
    });
});

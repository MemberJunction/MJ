/**
 * Tests for BaseAgent.getStorageAccountID's system fallback.
 *
 * Two or more active file storage accounts with no DefaultStorageAccountID at the agent, category,
 * or agent-type level used to THROW at the start of every agent run — so one ambiguous storage setup
 * (for example two installed apps that each ship an account) failed every agent, including agents
 * that never write a file. The fallback now picks the most recently updated account (ties broken by
 * ID) and warns once per agent per process.
 *
 * Exercises the REAL protected method on a real BaseAgent, with the FileStorageEngineBase and
 * AIEngine singletons' cached getters spied rather than the logic reimplemented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { PickFallbackStorageAccountID, ResetStorageFallbackWarnings } from '../storage-account-fallback';
import { FileStorageEngineBase } from '@memberjunction/core-entities';
import type { StorageAccountWithProvider } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import * as core from '@memberjunction/core';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';

const DROPBOX_ID = '636E204B-12CB-4D67-A861-09DA9C825BA3';
const BOX_ID = 'F3000001-0000-4000-8000-000000000002';
const CONFIGURED_ID = 'AAAAAAAA-0000-4000-8000-000000000001';

function account(id: string, name: string, providerName: string, updatedAt: string, providerActive = true): StorageAccountWithProvider {
    return {
        account: { ID: id, Name: name, __mj_UpdatedAt: new Date(updatedAt) },
        provider: { Name: providerName, IsActive: providerActive },
    } as unknown as StorageAccountWithProvider;
}

interface AgentShape {
    ID: string;
    Name: string;
    TypeID: string | null;
    CategoryID: string | null;
    DefaultStorageAccountID: string | null;
}

function params(agent: Partial<AgentShape> = {}): ExecuteAgentParams {
    return {
        agent: { ID: 'agent-1', Name: 'Skip', TypeID: null, CategoryID: null, DefaultStorageAccountID: null, ...agent },
    } as unknown as ExecuteAgentParams;
}

function resolve(p: ExecuteAgentParams): Promise<string | null> {
    return (new BaseAgent() as unknown as { getStorageAccountID(p: ExecuteAgentParams): Promise<string | null> })
        .getStorageAccountID(p);
}

function stubAccounts(accounts: StorageAccountWithProvider[]): void {
    vi.spyOn(FileStorageEngineBase.Instance, 'AccountsWithProviders', 'get').mockReturnValue(accounts);
}

describe('BaseAgent.getStorageAccountID — system fallback', () => {
    let logStatus: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        ResetStorageFallbackWarnings();
        vi.spyOn(AIEngine.Instance, 'AgentTypes', 'get').mockReturnValue([]);
        vi.spyOn(AIEngine.Instance, 'AgentCategories', 'get').mockReturnValue([]);
        logStatus = vi.spyOn(core, 'LogStatus').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns null when no account is active', async () => {
        stubAccounts([account(BOX_ID, 'Collaboration Box', 'Box.com', '2026-10-01', false)]);
        expect(await resolve(params())).toBeNull();
    });

    it('returns the only active account without warning', async () => {
        stubAccounts([
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', '2026-10-01'),
            account(BOX_ID, 'Collaboration Box', 'Box.com', '2026-10-05', false),
        ]);
        expect(await resolve(params())).toBe(DROPBOX_ID);
        expect(logStatus).not.toHaveBeenCalled();
    });

    it('picks the most recently updated account instead of throwing when several are active', async () => {
        stubAccounts([
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', '2026-10-01T00:00:00Z'),
            account(BOX_ID, 'Collaboration Box', 'Box.com', '2026-10-05T00:00:00Z'),
        ]);
        expect(await resolve(params())).toBe(BOX_ID);
    });

    it('warns naming every candidate, the choice, and where to set a default', async () => {
        stubAccounts([
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', '2026-10-09T00:00:00Z'),
            account(BOX_ID, 'Collaboration Box', 'Box.com', '2026-10-01T00:00:00Z'),
        ]);
        await resolve(params());
        expect(logStatus).toHaveBeenCalledTimes(1);
        const message = String(logStatus.mock.calls[0][0]);
        expect(message).toContain("'More Cheese Dropbox' (Dropbox)");
        expect(message).toContain("'Collaboration Box' (Box.com)");
        expect(message).toContain("Using 'More Cheese Dropbox'");
        expect(message).toContain('DefaultStorageAccountID');
        expect(message).toContain("agent 'Skip'");
    });

    it('warns once per agent per process, not on every run', async () => {
        stubAccounts([
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', '2026-10-09T00:00:00Z'),
            account(BOX_ID, 'Collaboration Box', 'Box.com', '2026-10-01T00:00:00Z'),
        ]);
        await resolve(params());
        await resolve(params());
        await resolve(params({ ID: 'agent-2', Name: 'Sage' }));
        expect(logStatus).toHaveBeenCalledTimes(2);
    });

    it('breaks an exact __mj_UpdatedAt tie by ID so the choice is stable', async () => {
        const same = '2026-10-05T00:00:00Z';
        stubAccounts([
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', same),
            account(BOX_ID, 'Collaboration Box', 'Box.com', same),
        ]);
        expect(await resolve(params())).toBe(DROPBOX_ID);
        stubAccounts([
            account(BOX_ID, 'Collaboration Box', 'Box.com', same),
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', same),
        ]);
        expect(await resolve(params())).toBe(DROPBOX_ID);
    });

    it('still prefers an agent-level DefaultStorageAccountID over the fallback, with no warning', async () => {
        stubAccounts([
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', '2026-10-09T00:00:00Z'),
            account(BOX_ID, 'Collaboration Box', 'Box.com', '2026-10-01T00:00:00Z'),
        ]);
        expect(await resolve(params({ DefaultStorageAccountID: CONFIGURED_ID }))).toBe(CONFIGURED_ID);
        expect(logStatus).not.toHaveBeenCalled();
    });

    it('still prefers an agent-type DefaultStorageAccountID over the fallback', async () => {
        stubAccounts([
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', '2026-10-09T00:00:00Z'),
            account(BOX_ID, 'Collaboration Box', 'Box.com', '2026-10-01T00:00:00Z'),
        ]);
        vi.spyOn(AIEngine.Instance, 'AgentTypes', 'get').mockReturnValue(
            [{ ID: 'type-loop', Name: 'Loop', DefaultStorageAccountID: CONFIGURED_ID }] as unknown as AIEngine['AgentTypes']
        );
        expect(await resolve(params({ TypeID: 'type-loop' }))).toBe(CONFIGURED_ID);
        expect(logStatus).not.toHaveBeenCalled();
    });
});

describe('PickFallbackStorageAccountID', () => {
    beforeEach(() => ResetStorageFallbackWarnings());
    afterEach(() => vi.restoreAllMocks());

    it('does not mutate the caller\'s array order', () => {
        vi.spyOn(core, 'LogStatus').mockImplementation(() => undefined);
        const list = [
            account(DROPBOX_ID, 'More Cheese Dropbox', 'Dropbox', '2026-10-01T00:00:00Z'),
            account(BOX_ID, 'Collaboration Box', 'Box.com', '2026-10-05T00:00:00Z'),
        ];
        PickFallbackStorageAccountID(list, { AgentKey: 'k', AgentName: 'A', CategoryName: 'none', AgentTypeName: 'Loop' });
        expect(list[0].account.ID).toBe(DROPBOX_ID);
    });
});

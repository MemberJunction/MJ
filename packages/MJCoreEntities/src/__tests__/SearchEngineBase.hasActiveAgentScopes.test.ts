/**
 * Unloaded probe tests for SearchEngineBase.HasActiveAgentScopes.
 *
 * Ensures agents with no active matching PreExecution/AgentInvoked scopes skip loading all 7 Search
 * entities on deferred/selective startups while honoring Phase, Status, StartAt/EndAt time windows,
 * cache invalidation on `MJ: AI Agent Search Scopes` events, and fail-open behavior on query errors.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, type IMetadataProvider, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { SearchEngineBase } from '../engines/SearchEngineBase';

interface ProbeRow {
    AgentID: string;
    Status: string;
    Phase: string;
    StartAt: Date | string | null;
    EndAt: Date | string | null;
}

class FakeSearchScopeProvider {
    public Rows: ProbeRow[] = [];
    public FailNext = false;
    public ReadCount = 0;

    public EntityByName(name: string) {
        if (name !== 'MJ: AI Agent Search Scopes') return undefined;
        return {
            Name: name,
            UserExemptFromRowLevelSecurity: () => true,
            GetUserPermisions: () => ({ CanRead: true }),
            GetUserRowLevelSecurityInfo: () => [],
            Fields: [],
        };
    }

    public async RunView<T = ProbeRow>(_params: RunViewParams, _user?: UserInfo): Promise<RunViewResult<T>> {
        this.ReadCount++;
        if (this.FailNext) {
            this.FailNext = false;
            return { Success: false, ErrorMessage: 'db down', Results: [] } as unknown as RunViewResult<T>;
        }
        const active = this.Rows.filter(r => r.Status === 'Active');
        return { Success: true, ErrorMessage: '', Results: active as unknown as T[] } as unknown as RunViewResult<T>;
    }
}

const user = { ID: 'user-1', UserRoles: [] } as unknown as UserInfo;

function raiseScopeSave(): void {
    MJGlobal.Instance.RaiseEvent({
        component: {},
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        args: {
            type: 'save',
            entityName: 'MJ: AI Agent Search Scopes',
        },
    });
}

describe('SearchEngineBase.HasActiveAgentScopes', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('probes MJ: AI Agent Search Scopes lightly, caches per provider, and honors Phase and time windows', async () => {
        const provider = new FakeSearchScopeProvider();
        const future = new Date(Date.now() + 3600_000).toISOString();
        const past = new Date(Date.now() - 3600_000).toISOString();
        provider.Rows = [
            { AgentID: 'agent-invoked-only', Status: 'Active', Phase: 'AgentInvoked', StartAt: null, EndAt: null },
            { AgentID: 'agent-expired', Status: 'Active', Phase: 'Both', StartAt: null, EndAt: past },
            { AgentID: 'agent-future', Status: 'Active', Phase: 'Both', StartAt: future, EndAt: null },
            { AgentID: 'agent-inactive', Status: 'Inactive', Phase: 'Both', StartAt: null, EndAt: null },
            { AgentID: 'agent-ready', Status: 'Active', Phase: 'Both', StartAt: null, EndAt: future },
        ];
        const mp = provider as unknown as IMetadataProvider;

        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-none', 'PreExecution', user, mp)).toBe(false);
        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-invoked-only', 'PreExecution', user, mp)).toBe(false);
        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-expired', 'PreExecution', user, mp)).toBe(false);
        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-future', 'PreExecution', user, mp)).toBe(false);
        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-inactive', 'PreExecution', user, mp)).toBe(false);
        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-invoked-only', 'AgentInvoked', user, mp)).toBe(true);
        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-ready', 'PreExecution', user, mp)).toBe(true);

        // All 7 checks above shared a single lightweight RunView call.
        expect(provider.ReadCount).toBe(1);
    });

    it('invalidates the unloaded probe cache when MJ: AI Agent Search Scopes changes', async () => {
        const provider = new FakeSearchScopeProvider();
        const mp = provider as unknown as IMetadataProvider;

        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-new', 'PreExecution', user, mp)).toBe(false);
        expect(provider.ReadCount).toBe(1);

        provider.Rows = [{ AgentID: 'agent-new', Status: 'Active', Phase: 'PreExecution', StartAt: null, EndAt: null }];
        raiseScopeSave();

        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-new', 'PreExecution', user, mp)).toBe(true);
        expect(provider.ReadCount).toBe(2);
    });

    it('fails open without caching when the probe query errors', async () => {
        const provider = new FakeSearchScopeProvider();
        provider.FailNext = true;
        const mp = provider as unknown as IMetadataProvider;

        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-err', 'PreExecution', user, mp)).toBe(true);
        expect(await SearchEngineBase.Instance.HasActiveAgentScopes('agent-err', 'PreExecution', user, mp)).toBe(false);
        expect(provider.ReadCount).toBe(2);
    });
});

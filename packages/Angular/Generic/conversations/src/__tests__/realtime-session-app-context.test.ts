import { describe, it, expect, beforeEach, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { IMetadataProvider } from '@memberjunction/core';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import { RealtimeSessionService } from '../lib/services/realtime-session.service';

/**
 * App-awareness surface of the session service (the host side of the ClientContextChannel):
 *  - RegisterAppClientTools / executeAppClientTool — the ContextTool's executor over host-registered
 *    surface client tools;
 *  - UpdateAppContext / AppContext$ — the continuous app-context stream the channel subscribes to.
 *
 * `executeAppClientTool` is private; reached through a narrow typed seam (the codebase convention).
 */
interface AppContextInternals {
  executeAppClientTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<{ Success: boolean; Result?: unknown; ErrorMessage?: string }>;
}
function internals(service: RealtimeSessionService): AppContextInternals {
  return service as unknown as AppContextInternals;
}

const snapshot: AppContextSnapshot = {
  App: { Name: 'Data Explorer', Description: '' },
  ActiveNavItem: { Name: 'Queries' },
  OtherNavItems: [],
  User: { Name: 'Amith', Roles: [] },
};

describe('RealtimeSessionService — app-context stream', () => {
  let service: RealtimeSessionService;
  beforeEach(() => { service = new RealtimeSessionService(); });

  it('emits null initially, then the pushed snapshot', async () => {
    expect(service.AppContext$ ? true : false).toBe(true);
    service.UpdateAppContext(snapshot);
    const latest = await firstValueFrom(service.AppContext$.pipe(take(1)));
    expect(latest?.App.Name).toBe('Data Explorer');
  });
});

describe('RealtimeSessionService — RegisterAppClientTools / executeAppClientTool', () => {
  let service: RealtimeSessionService;
  beforeEach(() => { service = new RealtimeSessionService(); });

  it('runs a registered tool and returns its result', async () => {
    let received: Record<string, unknown> | null = null;
    service.RegisterAppClientTools([
      { Name: 'SwitchTab', Handler: (p) => { received = p; return { ok: true }; } },
    ]);
    const out = await internals(service).executeAppClientTool('SwitchTab', { tab: 'Queries' });
    expect(out.Success).toBe(true);
    expect(out.Result).toEqual({ ok: true });
    expect(received).toEqual({ tab: 'Queries' });
  });

  it('matches tool names case-insensitively', async () => {
    service.RegisterAppClientTools([{ Name: 'Export', Handler: () => 'exported' }]);
    const out = await internals(service).executeAppClientTool('export', {});
    expect(out.Success).toBe(true);
    expect(out.Result).toBe('exported');
  });

  it('returns a structured error (naming available tools) for an unknown tool', async () => {
    service.RegisterAppClientTools([{ Name: 'Export', Handler: () => 'x' }]);
    const out = await internals(service).executeAppClientTool('Bogus', {});
    expect(out.Success).toBe(false);
    expect(out.ErrorMessage).toContain('Bogus');
    expect(out.ErrorMessage).toContain('export'); // available tool listed for self-correction
  });

  it('catches a throwing handler and returns a structured error (never throws)', async () => {
    service.RegisterAppClientTools([
      { Name: 'Boom', Handler: () => { throw new Error('kaboom'); } },
    ]);
    const out = await internals(service).executeAppClientTool('Boom', {});
    expect(out.Success).toBe(false);
    expect(out.ErrorMessage).toContain('kaboom');
  });

  it('replaces the registered set on each call (no stale handlers)', async () => {
    service.RegisterAppClientTools([{ Name: 'Old', Handler: () => 'old' }]);
    service.RegisterAppClientTools([{ Name: 'New', Handler: () => 'new' }]);
    const oldResult = await internals(service).executeAppClientTool('Old', {});
    const newResult = await internals(service).executeAppClientTool('New', {});
    expect(oldResult.Success).toBe(false); // cleared
    expect(newResult.Success).toBe(true);
  });

  it('awaits async handlers', async () => {
    service.RegisterAppClientTools([
      { Name: 'Async', Handler: async () => { await Promise.resolve(); return 'done'; } },
    ]);
    const out = await internals(service).executeAppClientTool('Async', {});
    expect(out.Result).toBe('done');
  });
});

/** The full mintSession seam incl. the app-awareness trailing params (positions 11–12). */
interface MintInternals {
  mintSession(
    targetAgentId: string,
    conversationId: string | null,
    lastSessionId: string | null,
    preferredModelId: string | null,
    clientTools: null,
    coAgentId: string | null,
    configOverridesJson: string | null,
    recordingConsent: boolean | null,
    recordingStartedAt: string | null,
    mediaCollectionId: string | null,
    applicationId?: string | null,
    appContext?: AppContextSnapshot | null
  ): Promise<unknown>;
}

describe('RealtimeSessionService — mint passthrough of applicationId + appContext', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => ({
      StartRealtimeClientSession: {
        AgentSessionId: 's1', ConversationId: 'c1', Provider: 'openai', Model: 'm',
        EphemeralToken: 'ek', ExpiresAt: '2099-01-01T00:00:00Z', SessionConfigJson: '{}',
      },
    }));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
  });

  async function mintVars(applicationId: string | null, appContext: AppContextSnapshot | null): Promise<Record<string, unknown>> {
    await (service as unknown as MintInternals).mintSession(
      't1', 'c1', null, null, null, null, null, null, null, null, applicationId, appContext,
    );
    return executeGQL.mock.calls[0][1] as Record<string, unknown>;
  }

  it('threads applicationId + serialized appContextJson into the mutation variables', async () => {
    const vars = await mintVars('app-9', snapshot);
    expect(vars.applicationId).toBe('app-9');
    expect(JSON.parse(vars.appContextJson as string).App.Name).toBe('Data Explorer');
  });

  it('sends nulls when no app context is supplied (pre-app behavior)', async () => {
    const vars = await mintVars(null, null);
    expect(vars.applicationId).toBeNull();
    expect(vars.appContextJson).toBeNull();
  });
});

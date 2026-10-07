import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { HandoffOfferRegistry } from '../room-handoff/handoff-offer-registry';

/** A provider stand-in that satisfies the registry's `GetEntityObject` capability check. */
const provider = { GetEntityObject: async () => undefined } as unknown as IMetadataProvider;
const SYSTEM_USER = { ID: 'system-user' } as unknown as UserInfo;
const EMPTY: RunViewResult = { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };

describe('HandoffOfferRegistry server identity', () => {
  let registry: HandoffOfferRegistry;
  let runView: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    registry = HandoffOfferRegistry.Instance;
    registry.Clear();
    registry.Configure({ Provider: provider, ContextUser: undefined, ResolveContextUser: undefined });
    runView = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(EMPTY);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('with no user: sweep, PendingForUser, ListForUser and ForRoom issue no RunView and do not throw', async () => {
    await expect(registry.Sweep()).resolves.toBe(0);
    await expect(registry.PendingForUser('u1')).resolves.toEqual([]);
    await expect(registry.ListForUser('u1')).resolves.toEqual([]);
    await expect(registry.ForRoom('room')).resolves.toEqual([]);
    expect(runView).not.toHaveBeenCalled();
  });

  it('with no user: still expires in-memory offers', async () => {
    let now = 1_000_000;
    registry.SetClock(() => now);
    const offer = await registry.Create({ RoomName: 'r', TargetUserID: 'u1', Mode: 'warm', Summary: 's', CallerLabel: 'c', AgentName: 'a' }, 1000);
    expect(offer?.Status).toBe('Pending');
    now += 5000;
    await expect(registry.Sweep()).resolves.toBeGreaterThan(0);
    registry.SetClock(Date.now);
  });

  it('with a lazily resolved server user: RunView is called with that user', async () => {
    registry.Configure({ ResolveContextUser: () => SYSTEM_USER });
    await registry.Sweep();
    expect(runView).toHaveBeenCalledTimes(1);
    expect(runView.mock.calls[0][1]).toBe(SYSTEM_USER);
  });

  it('picks up a user that becomes available after configuration (cache loads late)', async () => {
    let loaded: UserInfo | undefined;
    registry.Configure({ ResolveContextUser: () => loaded });
    await registry.Sweep();
    expect(runView).not.toHaveBeenCalled();
    loaded = SYSTEM_USER;
    await registry.Sweep();
    expect(runView).toHaveBeenCalledTimes(1);
  });

  it('a per-call user wins over the configured identity', async () => {
    const caller = { ID: 'caller' } as unknown as UserInfo;
    registry.Configure({ ResolveContextUser: () => SYSTEM_USER });
    await registry.PendingForUser('u1', caller);
    expect(runView.mock.calls[0][1]).toBe(caller);
  });
});

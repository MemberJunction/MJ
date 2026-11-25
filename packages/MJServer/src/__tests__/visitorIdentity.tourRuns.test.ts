import { describe, it, expect, vi, beforeEach } from 'vitest';

const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: class MockRunView {
      RunView = runViewMock;
    },
  };
});

import { ClaimGuestTourRuns, ForgetVisitor } from '../realtimeWidget/visitorIdentity.js';
import { Metadata, UserInfo } from '@memberjunction/core';

const dummyUser = new UserInfo(undefined, { ID: 'system-1', Name: 'System', Email: 'sys@example.com', Type: 'User', IsActive: true });
const dummyProvider = Metadata.Provider;

describe('visitorIdentity — TourRun RV4 claim & RV5 forget', () => {
  beforeEach(() => runViewMock.mockReset());

  it('ClaimGuestTourRuns stamps UserID onto guest TourRuns matching VisitorKey', async () => {
    const run1 = { ID: 'run-1', UserID: null as string | null, Save: vi.fn(async () => true) };
    const run2 = { ID: 'run-2', UserID: null as string | null, Save: vi.fn(async () => true) };
    runViewMock.mockResolvedValue({ Success: true, Results: [run1, run2] });

    const claimed = await ClaimGuestTourRuns({
      visitorKey: 'visitor_key_1234567890',
      userId: 'user-abc',
      surfaceId: 'surf-1',
      contextUser: dummyUser,
    });

    expect(claimed).toBe(2);
    expect(run1.UserID).toBe('user-abc');
    expect(run2.UserID).toBe('user-abc');
    expect(run1.Save).toHaveBeenCalledTimes(1);
    expect(run2.Save).toHaveBeenCalledTimes(1);
  });

  it('ForgetVisitor deletes guest-only TourRuns (+ child steps) and clears VisitorKey on claimed runs', async () => {
    const guestRun = { ID: 'run-guest', UserID: null as string | null, VisitorKey: 'vk-1' as string | null, Delete: vi.fn(async () => true), Save: vi.fn(async () => true) };
    const claimedRun = { ID: 'run-claimed', UserID: 'user-1', VisitorKey: 'vk-1' as string | null, Delete: vi.fn(async () => true), Save: vi.fn(async () => true) };
    const childStep = { ID: 'step-1', Delete: vi.fn(async () => true) };

    runViewMock.mockImplementation(async (params?: { EntityName?: string }) => {
      if (params?.EntityName === 'MJ: Conversations') return { Success: true, Results: [] };
      if (params?.EntityName === 'MJ: Tour Runs') return { Success: true, Results: [guestRun, claimedRun] };
      if (params?.EntityName === 'MJ: Tour Run Steps') return { Success: true, Results: [childStep] };
      return { Success: true, Results: [] };
    });

    const result = await ForgetVisitor({
      visitorKey: 'vk-1',
      surfaceId: 'surf-1',
      contextUser: dummyUser,
      provider: dummyProvider,
    });

    expect(result.tourRunsDeleted).toBe(1);
    expect(result.tourRunsCleared).toBe(1);
    expect(childStep.Delete).toHaveBeenCalledTimes(1);
    expect(guestRun.Delete).toHaveBeenCalledTimes(1);
    expect(claimedRun.VisitorKey).toBeNull();
    expect(claimedRun.Save).toHaveBeenCalledTimes(1);
  });
});

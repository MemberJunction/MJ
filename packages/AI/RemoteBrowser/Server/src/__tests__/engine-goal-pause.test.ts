/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IRemoteBrowserSession } from '@memberjunction/remote-browser-base';
import { RemoteBrowserEngine, type RemoteBrowserSessionHandle } from '../remote-browser-engine';

/**
 * Builds a fake session whose `RunComputerUseGoal` blocks until its `Signal` aborts — modeling a
 * computer-use loop that stops cooperatively on barge-in/takeover. Records whether it saw the abort.
 */
function makeBlockingSession() {
  const state = { aborted: false };
  const session = {
    RunComputerUseGoal: vi.fn(
      (_goal: string, opts: { Signal?: AbortSignal }) =>
        new Promise((resolve) => {
          opts.Signal?.addEventListener('abort', () => {
            state.aborted = true;
            resolve({ Success: false, Status: 'Aborted', StepCount: 1 });
          });
        }),
    ),
    InvokeNativeAIControl: vi.fn(),
  } as any as IRemoteBrowserSession & { RunComputerUseGoal: ReturnType<typeof vi.fn> };
  return { session, state };
}

/** Injects a Collaborative session handle into the engine's private maps so AchieveGoal can reach it. */
function injectHandle(engine: RemoteBrowserEngine, sessionID: string, agentSessionID: string, session: IRemoteBrowserSession) {
  const handle: RemoteBrowserSessionHandle = {
    SessionID: sessionID,
    Driver: {} as any,
    Session: session,
    Provider: {} as any,
    ControlMode: 'Collaborative',
    Features: {}, // no NativeAIControl → ComputerUse strategy
    FloorHolder: 'Agent',
    HumanControlRequested: false,
  };
  (engine as any).activeSessions.set(sessionID.toLowerCase(), handle);
  (engine as any).agentSessionToEngineSession.set(agentSessionID.toLowerCase(), sessionID);
  return handle;
}

describe('RemoteBrowserEngine — Collaborative pause on human takeover', () => {
  const SESSION_ID = 'pause-test-sess';
  const AGENT_SESSION_ID = 'pause-test-agent';

  afterEach(() => {
    const engine = RemoteBrowserEngine.Instance as any;
    engine.activeSessions.delete(SESSION_ID.toLowerCase());
    engine.agentSessionToEngineSession.delete(AGENT_SESSION_ID.toLowerCase());
    engine.activeGoalAborts.delete(SESSION_ID.toLowerCase());
  });

  it('aborts the in-flight goal when a human is granted the floor', async () => {
    const engine = RemoteBrowserEngine.Instance;
    const { session, state } = makeBlockingSession();
    injectHandle(engine, SESSION_ID, AGENT_SESSION_ID, session);

    const goalPromise = engine.AchieveGoal(AGENT_SESSION_ID, 'log in');
    await vi.waitFor(() => expect(session.RunComputerUseGoal).toHaveBeenCalled());

    // Human grabs the wheel: request → grant. The grant must pause the running goal.
    expect(engine.RequestControl(SESSION_ID)).toBe(true);
    expect(engine.GrantControl(SESSION_ID, 'Human')).toBe(true);

    const result = await goalPromise;
    expect(state.aborted).toBe(true);
    expect(result.Status).toBe('Aborted');
    // The abort registration is cleaned up once the goal settles.
    expect((engine as any).activeGoalAborts.has(SESSION_ID.toLowerCase())).toBe(false);
  });

  it('does NOT abort the goal when the agent (re)claims the floor', async () => {
    const engine = RemoteBrowserEngine.Instance;
    const { session, state } = makeBlockingSession();
    injectHandle(engine, SESSION_ID, AGENT_SESSION_ID, session);

    const goalPromise = engine.AchieveGoal(AGENT_SESSION_ID, 'log in');
    await vi.waitFor(() => expect(session.RunComputerUseGoal).toHaveBeenCalled());

    // Agent grant is unconditional and must NOT pause the agent's own goal.
    expect(engine.GrantControl(SESSION_ID, 'Agent')).toBe(true);
    expect(state.aborted).toBe(false);

    // Clean up the still-pending goal so the promise settles for the test runner.
    expect((engine as any).abortActiveGoal(SESSION_ID)).toBe(true);
    await goalPromise;
  });

  it('chains the caller Signal so external barge-in also aborts the goal', async () => {
    const engine = RemoteBrowserEngine.Instance;
    const { session, state } = makeBlockingSession();
    injectHandle(engine, SESSION_ID, AGENT_SESSION_ID, session);

    const external = new AbortController();
    const goalPromise = engine.AchieveGoal(AGENT_SESSION_ID, 'log in', { Signal: external.signal });
    await vi.waitFor(() => expect(session.RunComputerUseGoal).toHaveBeenCalled());

    external.abort();
    const result = await goalPromise;
    expect(state.aborted).toBe(true);
    expect(result.Status).toBe('Aborted');
  });
});

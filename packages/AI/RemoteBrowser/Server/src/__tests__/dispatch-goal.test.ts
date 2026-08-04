import { describe, it, expect, vi } from 'vitest';
import type { IRemoteBrowserProviderFeatures, IRemoteBrowserSession } from '@memberjunction/remote-browser-base';
import { dispatchRemoteBrowserGoal } from '../remote-browser-engine';

/** A fake session exposing only the two methods the dispatcher calls. */
function makeSession() {
  const session = {
    InvokeNativeAIControl: vi.fn(async (_intent: string) => ({ Success: true, CurrentUrl: 'https://native.test/', Detail: 'native done' })),
    RunComputerUseGoal: vi.fn(async (_goal: string, _opts?: unknown) => ({
      Success: true,
      Strategy: 'ComputerUse' as const,
      CurrentUrl: 'https://cu.test/',
      Status: 'Completed',
      StepCount: 2,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as IRemoteBrowserSession & {
    InvokeNativeAIControl: ReturnType<typeof vi.fn>;
    RunComputerUseGoal: ReturnType<typeof vi.fn>;
  };
  return session;
}

describe('dispatchRemoteBrowserGoal', () => {
  it('uses the ComputerUse strategy by default (no native capability) and passes options through', async () => {
    const session = makeSession();
    const features: IRemoteBrowserProviderFeatures = {};
    const result = await dispatchRemoteBrowserGoal(session, features, 'log in', { MaxSteps: 9, StartUrl: 'https://start.test/' });

    expect(session.RunComputerUseGoal).toHaveBeenCalledOnce();
    expect(session.RunComputerUseGoal.mock.calls[0][0]).toBe('log in');
    expect(session.RunComputerUseGoal.mock.calls[0][1]).toMatchObject({ MaxSteps: 9, StartUrl: 'https://start.test/' });
    expect(session.InvokeNativeAIControl).not.toHaveBeenCalled();
    expect(result.Strategy).toBe('ComputerUse');
    expect(result.Success).toBe(true);
  });

  it('uses NativeAI when the backend advertises it and the caller did not pin ComputerUse', async () => {
    const session = makeSession();
    const features: IRemoteBrowserProviderFeatures = { NativeAIControl: true };
    const result = await dispatchRemoteBrowserGoal(session, features, 'log in', {});

    expect(session.InvokeNativeAIControl).toHaveBeenCalledWith('log in');
    expect(session.RunComputerUseGoal).not.toHaveBeenCalled();
    expect(result.Strategy).toBe('NativeAI');
    expect(result.CurrentUrl).toBe('https://native.test/');
    expect(result.Status).toBe('Completed');
  });

  it('honors an explicit ComputerUse preference even when NativeAI is available', async () => {
    const session = makeSession();
    const features: IRemoteBrowserProviderFeatures = { NativeAIControl: true };
    const result = await dispatchRemoteBrowserGoal(session, features, 'log in', { PreferredStrategy: 'ComputerUse' });

    expect(session.RunComputerUseGoal).toHaveBeenCalledOnce();
    expect(session.InvokeNativeAIControl).not.toHaveBeenCalled();
    expect(result.Strategy).toBe('ComputerUse');
  });

  it('maps a failed native control result to a failed goal result', async () => {
    const session = makeSession();
    session.InvokeNativeAIControl.mockResolvedValueOnce({ Success: false, Detail: 'stagehand error' });
    const result = await dispatchRemoteBrowserGoal(session, { NativeAIControl: true }, 'x', {});
    expect(result.Success).toBe(false);
    expect(result.Strategy).toBe('NativeAI');
    expect(result.Status).toBe('Error');
    expect(result.Detail).toBe('stagehand error');
  });
});

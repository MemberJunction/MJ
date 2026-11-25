import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient, type RealtimeChannelContext } from '@memberjunction/realtime-runtime';
import {
  LoadTourChannel,
  RegisterTourRealtimeBridge,
  TourChannel,
  type TourChannelBridgeEvent,
  type TourRealtimeBridge,
} from '../lib/components/realtime/channels/tour-channel';

LoadTourChannel();

function createChannelContext(spoken: string[]): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    Provider: null,
    SendContextNote: () => undefined,
    RequestSpokenResponse: (instructions: string) => spoken.push(instructions),
    RequestSave: () => undefined,
    SetFocusMode: () => undefined,
  };
}

describe('TourChannel (headless Guided Tour realtime channel)', () => {
  let listeners: Array<(evt: TourChannelBridgeEvent) => void> = [];

  beforeEach(() => {
    listeners = [];
    const bridge: TourRealtimeBridge = {
      GetActiveStep: () => ({
        TourKey: 'core.welcome',
        TourName: 'Welcome to MemberJunction',
        StepKey: 'app-switcher',
        StepTitle: 'Switch between applications',
        StepIndex: 1,
        StepCount: 5,
        Mode: 'Guide',
        DirectorType: 'Voice',
        VoiceScript: 'Click the application switcher in the top left.',
      }),
      GetVisibleAnchors: () => [
        {
          AnchorKey: 'core.shell.app-switcher',
          Strategy: 'Registered',
          AccessibleName: 'Application switcher',
          Role: 'button',
        },
      ],
      Highlight: async (anchorKey: string) =>
        anchorKey === 'core.shell.app-switcher'
          ? { Success: true }
          : { Success: false, ErrorMessage: 'Anchor not visible.' },
      GoToStep: async (stepKey: string) =>
        stepKey === 'omnibar'
          ? { Success: true }
          : { Success: false, ErrorMessage: 'Not an authored outgoing step.' },
      PrepareStep: async () => ({ Success: true }),
      SubscribeEvents: (listener) => {
        listeners.push(listener);
        return () => {
          listeners = listeners.filter((l) => l !== listener);
        };
      },
    };
    RegisterTourRealtimeBridge(bridge);
  });

  afterEach(() => {
    RegisterTourRealtimeBridge(null);
  });

  it('registers TourChannel in MJGlobal ClassFactory under BaseRealtimeChannelClient', () => {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(
      BaseRealtimeChannelClient,
      'TourChannel',
    );
    expect(instance).toBeInstanceOf(TourChannel);
    expect(instance?.ChannelName).toBe('Tour');
    expect(instance?.GetDescriptor().DisplayPolicy).toBe('headless');
  });

  it('exposes activeStep and visibleAnchors state and routes highlight / goToStep / prepareStep verbs', async () => {
    const spoken: string[] = [];
    const channel = new TourChannel();
    channel.Initialize(createChannelContext(spoken), null);

    const state = channel.GetState();
    expect(state['activeStep']).toMatchObject({
      TourKey: 'core.welcome',
      StepKey: 'app-switcher',
      DirectorType: 'Voice',
    });
    expect(state['visibleAnchors']).toEqual([
      {
        AnchorKey: 'core.shell.app-switcher',
        Strategy: 'Registered',
        AccessibleName: 'Application switcher',
        Role: 'button',
      },
    ]);

    const okHighlight = await channel.ApplyVerb('highlight', { anchorKey: 'core.shell.app-switcher' }, 'agent');
    expect(okHighlight.Success).toBe(true);

    const badHighlight = await channel.ApplyVerb('highlight', { anchorKey: 'missing.anchor' }, 'agent');
    expect(badHighlight.Success).toBe(false);
    expect(badHighlight.ErrorCode).toBe('anchor_not_visible');

    const moved = await channel.ApplyVerb('goToStep', { stepKey: 'omnibar' }, 'agent');
    expect(moved.Success).toBe(true);

    const prepared = await channel.ApplyVerb('prepareStep', { consentGranted: true }, 'agent');
    expect(prepared.Success).toBe(true);

    listeners.forEach((l) =>
      l({
        Kind: 'step_completed',
        TourKey: 'core.welcome',
        StepKey: 'app-switcher',
        StepTitle: 'Switch between applications',
      }),
    );
    expect(spoken.length).toBe(1);
    expect(spoken[0]).toContain('Switch between applications');

    channel.Dispose();
  });
});

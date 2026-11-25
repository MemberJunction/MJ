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
      Highlight: async (anchorKey: string, _caption?: string, _durationMs?: number) =>
        anchorKey === 'core.shell.app-switcher'
          ? { Success: true }
          : { Success: false, ErrorMessage: 'Anchor not visible.' },
      GoToStep: async (stepKey: string) =>
        stepKey === 'omnibar'
          ? { Success: true }
          : { Success: false, ErrorMessage: 'Not an authored outgoing step.' },
      PrepareStep: async () => ({ Success: true }),
      SelectChoice: async (choiceKey: string) =>
        choiceKey === 'explore-dashboards'
          ? { Success: true }
          : { Success: false, ErrorMessage: 'Unknown choiceKey.' },
      AdvanceStep: async () => ({ Success: true }),
      GoBack: async () => ({ Success: true }),
      DemonstrateStep: async (confirmedMutation?: boolean) =>
        confirmedMutation
          ? { Success: true }
          : {
              Success: false,
              RequiresConfirmation: true,
              ConfirmationPrompt: 'Confirm creating a sample record?',
            },
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

  it('exposes Sage voice-guide instructions without co-pilot terminology and includes all tour-driving verbs', () => {
    const channel = new TourChannel();
    const descriptor = channel.GetDescriptor();
    expect(descriptor.Instructions).toContain('Sage');
    expect(descriptor.Instructions.toLowerCase()).not.toContain('co-pilot');
    expect(descriptor.Instructions.toLowerCase()).not.toContain('copilot');

    const verbNames = descriptor.Verbs.map((v) => v.Name);
    expect(verbNames).toEqual(
      expect.arrayContaining(['highlight', 'goToStep', 'prepareStep', 'selectChoice', 'advanceStep', 'goBack', 'demonstrateStep']),
    );
  });

  it('routes selectChoice, advanceStep, goBack, and demonstrateStep through TourRealtimeBridge', async () => {
    const spoken: string[] = [];
    const channel = new TourChannel();
    channel.Initialize(createChannelContext(spoken), null);

    const timedHighlight = await channel.ApplyVerb(
      'highlight',
      { anchorKey: 'core.shell.app-switcher', caption: 'Open switcher', durationMs: 4000 },
      'agent',
    );
    expect(timedHighlight.Success).toBe(true);

    const okChoice = await channel.ApplyVerb('selectChoice', { choiceKey: 'explore-dashboards' }, 'agent');
    expect(okChoice.Success).toBe(true);
    expect(okChoice.Result).toEqual({ selectedChoiceKey: 'explore-dashboards' });

    const missingChoice = await channel.ApplyVerb('selectChoice', {}, 'agent');
    expect(missingChoice.Success).toBe(false);
    expect(missingChoice.ErrorCode).toBe('invalid_params');

    const badChoice = await channel.ApplyVerb('selectChoice', { choiceKey: 'nope' }, 'agent');
    expect(badChoice.Success).toBe(false);
    expect(badChoice.ErrorCode).toBe('select_choice_failed');

    const advanced = await channel.ApplyVerb('advanceStep', {}, 'agent');
    expect(advanced.Success).toBe(true);
    expect(advanced.Result).toEqual({ advanced: true });

    const wentBack = await channel.ApplyVerb('goBack', {}, 'agent');
    expect(wentBack.Success).toBe(true);
    expect(wentBack.Result).toEqual({ movedBack: true });

    const needsConfirm = await channel.ApplyVerb('demonstrateStep', {}, 'agent');
    expect(needsConfirm.Success).toBe(false);
    expect(needsConfirm.ErrorCode).toBe('confirmation_required');
    expect(needsConfirm.Result).toMatchObject({
      requiresConfirmation: true,
      confirmationPrompt: 'Confirm creating a sample record?',
    });

    const demonstrated = await channel.ApplyVerb('demonstrateStep', { confirmedMutation: true }, 'agent');
    expect(demonstrated.Success).toBe(true);
    expect(demonstrated.Result).toMatchObject({ demonstrated: true });

    channel.Dispose();
  });

  it('falls back to client tools TourSelectChoice, TourAdvanceStep, TourGoBack, and TourDemonstrateStep when no bridge is registered', async () => {
    RegisterTourRealtimeBridge(null);
    const executed: Array<{ name: string; params: Record<string, unknown> }> = [];
    const channel = new TourChannel();
    channel.Initialize(
      {
        ...createChannelContext([]),
        ExecuteClientTool: async (toolName, params) => {
          executed.push({ name: toolName, params });
          return { Success: true, Result: { ok: true } };
        },
      },
      null,
    );

    await channel.ApplyVerb('selectChoice', { choiceKey: 'branch-a' }, 'agent');
    await channel.ApplyVerb('advanceStep', {}, 'agent');
    await channel.ApplyVerb('goBack', {}, 'agent');
    await channel.ApplyVerb('demonstrateStep', { confirmedMutation: true }, 'agent');

    expect(executed).toEqual([
      { name: 'TourSelectChoice', params: { ChoiceKey: 'branch-a' } },
      { name: 'TourAdvanceStep', params: {} },
      { name: 'TourGoBack', params: {} },
      { name: 'TourDemonstrateStep', params: { ConfirmedMutation: true } },
    ]);

    channel.Dispose();
  });
});

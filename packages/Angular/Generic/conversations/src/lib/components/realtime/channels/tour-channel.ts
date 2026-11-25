/**
 * @fileoverview Headless Guided Tour realtime channel (`TourChannel`) for Voice-directed tours
 * (§10.3 & §18 Phase 5).
 *
 * Paired with the generic `ClientOnlyChannelServer` (`MJ: AI Agent Channels.ServerPluginClass = 'ClientOnlyChannelServer'`).
 * Never renders a tab surface (`DisplayPolicy: 'headless'`). Streams active-step and visible-anchor
 * state into the live realtime session via {@link RecordChange}, forwards step-completion updates via
 * {@link RealtimeChannelContext.RequestSpokenResponse}, and exposes `highlight`, `goToStep`,
 * `prepareStep`, `selectChoice`, `advanceStep`, `goBack`, and `demonstrateStep` verbs routed to the
 * active tour session.
 *
 * @module @memberjunction/ng-conversations
 */

import { JSONObject, JSONValue, RealtimeToolDefinition } from '@memberjunction/ai';
import {
  REALTIME_CHANNEL_CONTRACT_VERSION,
  type AppContextSnapshot,
  type RealtimeChannelActor,
  type RealtimeChannelDescriptor,
} from '@memberjunction/ai-core-plus';
import { GetGlobalObjectStore, RegisterClass } from '@memberjunction/global';
import {
  BaseRealtimeChannelClient,
  type RealtimeChannelVerbResult,
} from '@memberjunction/realtime-runtime';
import { Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

/** Global store key where `@memberjunction/ng-tours` mounts the active tour voice bridge. */
export const TOUR_REALTIME_BRIDGE_STORE_KEY = '___MJ_TOUR_REALTIME_BRIDGE';

/** Read-only snapshot of the active tour step exposed as the `activeStep` noun. */
export interface TourChannelActiveStepState {
  TourKey: string;
  TourName: string;
  StepKey: string;
  StepTitle: string;
  StepIndex: number;
  StepCount: number;
  Mode: string;
  DirectorType: string;
  GuideNotes?: string;
  VoiceScript?: string;
}

/** Visible anchor entry exposed as the `visibleAnchors` noun. */
export interface TourChannelVisibleAnchor {
  AnchorKey: string;
  Strategy: string;
  AccessibleName: string;
  Role?: string;
}

/** Event emitted by the tour runtime into the Voice channel. */
export interface TourChannelBridgeEvent {
  Kind: 'tour_started' | 'step_entered' | 'step_completed' | 'tour_ended';
  TourKey: string;
  StepKey?: string;
  StepTitle?: string;
  StepBody?: string;
  GuideNotes?: string;
  VoiceScript?: string;
  Outcome?: string;
}

/**
 * Bridge registered in `GetGlobalObjectStore()[TOUR_REALTIME_BRIDGE_STORE_KEY]` by `@memberjunction/ng-tours`
 * so `@memberjunction/ng-conversations` never takes a compile-time dependency on `tours-runtime` or `ng-tours`.
 */
export interface TourRealtimeBridge {
  GetActiveStep(): TourChannelActiveStepState | null;
  GetVisibleAnchors(): TourChannelVisibleAnchor[];
  Highlight(anchorKey: string, caption?: string, durationMs?: number): Promise<{ Success: boolean; ErrorMessage?: string }>;
  GoToStep(stepKey: string): Promise<{ Success: boolean; ErrorMessage?: string }>;
  PrepareStep(consentGranted?: boolean): Promise<{ Success: boolean; ErrorMessage?: string }>;
  SelectChoice?(choiceKey: string): Promise<{ Success: boolean; ErrorMessage?: string }>;
  AdvanceStep?(): Promise<{ Success: boolean; ErrorMessage?: string }>;
  GoBack?(): Promise<{ Success: boolean; ErrorMessage?: string }>;
  DemonstrateStep?(confirmedMutation?: boolean): Promise<{
    Success: boolean;
    RequiresConfirmation?: boolean;
    ConfirmationPrompt?: string;
    ErrorMessage?: string;
  }>;
  SubscribeEvents(listener: (event: TourChannelBridgeEvent) => void): () => void;
}

/** Registers (or clears) the active tour realtime bridge in the process-wide global object store. */
export function RegisterTourRealtimeBridge(bridge: TourRealtimeBridge | null): void {
  const store = GetGlobalObjectStore();
  if (!store) {
    return;
  }
  if (bridge === null) {
    delete store[TOUR_REALTIME_BRIDGE_STORE_KEY];
  } else {
    store[TOUR_REALTIME_BRIDGE_STORE_KEY] = bridge;
  }
}

function readTourRealtimeBridge(): TourRealtimeBridge | null {
  const store = GetGlobalObjectStore();
  const candidate = store ? store[TOUR_REALTIME_BRIDGE_STORE_KEY] : undefined;
  if (candidate && typeof candidate === 'object' && 'GetActiveStep' in candidate) {
    return candidate as TourRealtimeBridge;
  }
  return null;
}

const TOUR_CHANNEL_DESCRIPTOR: RealtimeChannelDescriptor = {
  Key: 'Tour',
  Version: REALTIME_CHANNEL_CONTRACT_VERSION,
  DisplayName: 'Guided Tour',
  Instructions:
    'Headless Guided Tour voice-guide channel for Sage. When `step_entered` fires, speak naturally in 1–2 ' +
    'conversational sentences using `VoiceScript` and `GuideNotes` rather than reading `Body` verbatim, then pause ' +
    'for user questions or action. Only cite anchors currently present in `visibleAnchors`. Use `highlight` to ' +
    'point at a visible anchor with a short caption, `prepareStep` to reveal or navigate to the step target, ' +
    '`selectChoice` when the user picks a branch by voice, `advanceStep` or `goBack` for pacing, `goToStep` to ' +
    'move strictly along authored edges or back to completed steps, and `demonstrateStep` when the user asks to ' +
    'be shown.',
  Nouns: [
    {
      Name: 'activeStep',
      Description: 'Current Guided Tour session and active step state, or null when no tour is running.',
      Schema: {
        type: 'object',
        properties: {
          TourKey: { type: 'string' },
          TourName: { type: 'string' },
          StepKey: { type: 'string' },
          StepTitle: { type: 'string' },
          StepIndex: { type: 'number' },
          StepCount: { type: 'number' },
          Mode: { type: 'string' },
          DirectorType: { type: 'string' },
          GuideNotes: { type: 'string' },
          VoiceScript: { type: 'string' },
        },
      },
    },
    {
      Name: 'visibleAnchors',
      Description: 'UI anchors currently visible on screen with accessible names. The only UI targets you may cite.',
      Schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            AnchorKey: { type: 'string' },
            Strategy: { type: 'string' },
            AccessibleName: { type: 'string' },
            Role: { type: 'string' },
          },
          required: ['AnchorKey', 'AccessibleName'],
        },
      },
    },
  ],
  Verbs: [
    {
      Name: 'highlight',
      Description: 'Spotlight a currently visible anchor with an optional short caption. Fails if the anchor is not visible.',
      ParametersSchema: {
        type: 'object',
        properties: {
          anchorKey: { type: 'string', description: 'AnchorKey from visibleAnchors.' },
          caption: { type: 'string', description: 'Optional concise caption to display.' },
          durationMs: { type: 'number', description: 'Optional spotlight duration in milliseconds.' },
        },
        required: ['anchorKey'],
      },
      InvokableBy: 'agent',
    },
    {
      Name: 'goToStep',
      Description: 'Move the active tour cursor to an authored outgoing step or previously completed step.',
      ParametersSchema: {
        type: 'object',
        properties: {
          stepKey: { type: 'string', description: 'Target StepKey.' },
        },
        required: ['stepKey'],
      },
      InvokableBy: 'agent',
    },
    {
      Name: 'prepareStep',
      Description: 'Run the current step Prepare navigation and make-visible instructions.',
      ParametersSchema: {
        type: 'object',
        properties: {
          consentGranted: { type: 'boolean', description: 'Whether the user consented to cross-screen navigation.' },
        },
      },
      InvokableBy: 'agent',
    },
    {
      Name: 'selectChoice',
      Description: 'Select an authored choice branch on the current step when the user picks an option by voice.',
      ParametersSchema: {
        type: 'object',
        properties: {
          choiceKey: { type: 'string', description: 'Authored ChoiceKey to select.' },
        },
        required: ['choiceKey'],
      },
      InvokableBy: 'agent',
    },
    {
      Name: 'advanceStep',
      Description: 'Advance the active tour along the next outgoing step transition when the user is ready to proceed.',
      ParametersSchema: {
        type: 'object',
        properties: {},
      },
      InvokableBy: 'agent',
    },
    {
      Name: 'goBack',
      Description: 'Move the active tour back to the previous step when the user asks to revisit it.',
      ParametersSchema: {
        type: 'object',
        properties: {},
      },
      InvokableBy: 'agent',
    },
    {
      Name: 'demonstrateStep',
      Description:
        'Execute the current step demonstration when the user asks Sage to show them. Pass confirmedMutation=true ' +
        'only after the user explicitly confirms a mutating action.',
      ParametersSchema: {
        type: 'object',
        properties: {
          confirmedMutation: {
            type: 'boolean',
            description: 'Whether the user explicitly confirmed running a mutating demonstration.',
          },
        },
      },
      InvokableBy: 'agent',
    },
  ],
  Events: [
    { Name: 'tour_started', Description: 'A Guided Tour session started.' },
    { Name: 'step_entered', Description: 'The tour entered a step.' },
    { Name: 'step_completed', Description: 'The user or director completed a step.' },
    { Name: 'tour_ended', Description: 'The Guided Tour session ended.' },
  ],
  DisplayPolicy: 'headless',
  DefaultAvailability: 'all-sessions',
  MaxExposure: 'state',
};

interface AppContextActiveTourSnapshot {
  TourKey: string;
  Name: string;
  StepKey: string;
  StepTitle: string;
  StepIndex: number;
  StepCount: number;
  Mode: string;
  DirectorType: string;
}

type AppContextSnapshotWithTour = AppContextSnapshot & {
  ActiveTour?: AppContextActiveTourSnapshot | null;
};

/**
 * Headless Guided Tour realtime channel client.
 * Paired on the server with `ClientOnlyChannelServer` (`ServerPluginClass: 'ClientOnlyChannelServer'`).
 */
@RegisterClass(BaseRealtimeChannelClient, 'TourChannel')
export class TourChannel extends BaseRealtimeChannelClient<object> {
  private appContextSub: Subscription | null = null;
  private unsubscribeBridge: (() => void) | null = null;
  private fallbackActiveTour: AppContextActiveTourSnapshot | null = null;

  /** Matches the seeded `MJ: AI Agent Channels` row's `Name`. */
  public get ChannelName(): string {
    return 'Tour';
  }

  public override get TabTitle(): string {
    return 'Guided Tour';
  }

  public override get TabIcon(): string {
    return 'fa-solid fa-route';
  }

  /** V2 headless channel: verbs are invoked via the `ContextTool` proxy. */
  public override GetToolDefinitions(): RealtimeToolDefinition[] {
    return [];
  }

  public override GetDescriptor(): RealtimeChannelDescriptor {
    return TOUR_CHANNEL_DESCRIPTOR;
  }

  public override GetState(): JSONObject {
    const bridge = readTourRealtimeBridge();
    if (bridge) {
      const step = bridge.GetActiveStep();
      const anchors = bridge.GetVisibleAnchors();
      return {
        activeStep: step ? toActiveStepJson(step) : null,
        visibleAnchors: anchors.map(toVisibleAnchorJson),
      };
    }

    const active = this.fallbackActiveTour ?? null;
    return {
      activeStep: active
        ? {
            TourKey: active.TourKey,
            TourName: active.Name,
            StepKey: active.StepKey,
            StepTitle: active.StepTitle,
            StepIndex: active.StepIndex,
            StepCount: active.StepCount,
            Mode: active.Mode,
            DirectorType: active.DirectorType,
          }
        : null,
      visibleAnchors: [],
    };
  }

  public override async ApplyVerb(
    verb: string,
    args: JSONObject,
    _actor: RealtimeChannelActor,
  ): Promise<RealtimeChannelVerbResult> {
    const normalized = verb.trim().toLowerCase();
    const bridge = readTourRealtimeBridge();

    if (normalized === 'highlight') {
      const anchorKey = typeof args['anchorKey'] === 'string' ? args['anchorKey'] : '';
      const caption = typeof args['caption'] === 'string' ? args['caption'] : undefined;
      const durationMs = typeof args['durationMs'] === 'number' ? args['durationMs'] : undefined;
      if (!anchorKey) {
        return { Success: false, ErrorCode: 'invalid_params', Error: 'highlight requires anchorKey.' };
      }
      if (bridge) {
        const res = await bridge.Highlight(anchorKey, caption, durationMs);
        return res.Success
          ? { Success: true, Result: { highlighted: true, anchorKey } }
          : { Success: false, ErrorCode: 'anchor_not_visible', Error: res.ErrorMessage ?? 'Anchor is not visible.' };
      }
      return this.forwardToClientTool('TourHighlight', { AnchorKey: anchorKey, Caption: caption, DurationMs: durationMs });
    }

    if (normalized === 'gotostep') {
      const stepKey = typeof args['stepKey'] === 'string' ? args['stepKey'] : '';
      if (!stepKey) {
        return { Success: false, ErrorCode: 'invalid_params', Error: 'goToStep requires stepKey.' };
      }
      if (bridge) {
        const res = await bridge.GoToStep(stepKey);
        if (res.Success) {
          const changeId = this.RecordChange({ Author: 'agent' });
          this.EmitChannelEvent('step_entered', { stepKey }, changeId);
          return { Success: true, Result: { movedToStepKey: stepKey } };
        }
        return { Success: false, ErrorCode: 'invalid_step_transition', Error: res.ErrorMessage ?? 'Could not move to step.' };
      }
      return this.forwardToClientTool('TourGoToStep', { StepKey: stepKey });
    }

    if (normalized === 'preparestep') {
      const consentGranted = typeof args['consentGranted'] === 'boolean' ? args['consentGranted'] : undefined;
      if (bridge) {
        const res = await bridge.PrepareStep(consentGranted);
        return res.Success
          ? { Success: true, Result: { prepared: true } }
          : { Success: false, ErrorCode: 'prepare_failed', Error: res.ErrorMessage ?? 'Could not prepare step.' };
      }
      return this.forwardToClientTool('TourPrepareStep', { ConsentGranted: consentGranted });
    }

    if (normalized === 'selectchoice') {
      const choiceKey = typeof args['choiceKey'] === 'string' ? args['choiceKey'].trim() : '';
      if (!choiceKey) {
        return { Success: false, ErrorCode: 'invalid_params', Error: 'selectChoice requires choiceKey.' };
      }
      if (bridge?.SelectChoice) {
        const res = await bridge.SelectChoice(choiceKey);
        if (res.Success) {
          this.RecordChange({ Author: 'agent' });
          return { Success: true, Result: { selectedChoiceKey: choiceKey } };
        }
        return { Success: false, ErrorCode: 'select_choice_failed', Error: res.ErrorMessage ?? 'Could not select choice.' };
      }
      return this.forwardToClientTool('TourSelectChoice', { ChoiceKey: choiceKey });
    }

    if (normalized === 'advancestep') {
      if (bridge?.AdvanceStep) {
        const res = await bridge.AdvanceStep();
        if (res.Success) {
          this.RecordChange({ Author: 'agent' });
          return { Success: true, Result: { advanced: true } };
        }
        return { Success: false, ErrorCode: 'advance_failed', Error: res.ErrorMessage ?? 'Could not advance step.' };
      }
      return this.forwardToClientTool('TourAdvanceStep', {});
    }

    if (normalized === 'goback') {
      if (bridge?.GoBack) {
        const res = await bridge.GoBack();
        if (res.Success) {
          this.RecordChange({ Author: 'agent' });
          return { Success: true, Result: { movedBack: true } };
        }
        return { Success: false, ErrorCode: 'go_back_failed', Error: res.ErrorMessage ?? 'Could not go back.' };
      }
      return this.forwardToClientTool('TourGoBack', {});
    }

    if (normalized === 'demonstratestep') {
      const confirmedMutation = typeof args['confirmedMutation'] === 'boolean' ? args['confirmedMutation'] : undefined;
      if (bridge?.DemonstrateStep) {
        const res = await bridge.DemonstrateStep(confirmedMutation);
        if (res.Success) {
          this.RecordChange({ Author: 'agent' });
          return {
            Success: true,
            Result: {
              demonstrated: true,
              ...(res.RequiresConfirmation !== undefined ? { requiresConfirmation: res.RequiresConfirmation } : {}),
              ...(res.ConfirmationPrompt !== undefined ? { confirmationPrompt: res.ConfirmationPrompt } : {}),
            },
          };
        }
        if (res.RequiresConfirmation) {
          return {
            Success: false,
            ErrorCode: 'confirmation_required',
            Error: res.ConfirmationPrompt ?? res.ErrorMessage ?? 'User confirmation is required to demonstrate this step.',
            Result: {
              requiresConfirmation: true,
              ...(res.ConfirmationPrompt !== undefined ? { confirmationPrompt: res.ConfirmationPrompt } : {}),
            },
          };
        }
        return {
          Success: false,
          ErrorCode: 'demonstrate_failed',
          Error: res.ErrorMessage ?? 'Could not demonstrate step.',
        };
      }
      return this.forwardToClientTool('TourDemonstrateStep', { ConfirmedMutation: confirmedMutation });
    }

    return {
      Success: false,
      ErrorCode: 'unknown_verb',
      Error: `Unknown Tour channel verb '${verb}'.`,
    };
  }

  protected override OnInitialize(): void {
    const bridge = readTourRealtimeBridge();
    if (bridge) {
      this.unsubscribeBridge = bridge.SubscribeEvents((event) => this.handleBridgeEvent(event));
      const currentStep = bridge.GetActiveStep();
      if (currentStep) {
        this.RecordChange({ Author: 'system' });
        if (this.Context?.RequestSpokenResponse) {
          const prompt =
            currentStep.VoiceScript ??
            (currentStep.GuideNotes
              ? `Guide the user on step "${currentStep.StepTitle}": ${currentStep.GuideNotes}`
              : `Briefly and warmly introduce the current tour step "${currentStep.StepTitle}" (${currentStep.StepIndex + 1} of ${currentStep.StepCount}) in one or two short sentences, then invite the user to proceed or ask a question.`);
          this.Context.RequestSpokenResponse(prompt);
        }
      }
    }

    const stream = this.Context?.AppContext$;
    if (stream) {
      this.appContextSub = stream
        .pipe(
          distinctUntilChanged(
            (a, b) =>
              JSON.stringify((a as AppContextSnapshotWithTour | null)?.ActiveTour ?? null) ===
              JSON.stringify((b as AppContextSnapshotWithTour | null)?.ActiveTour ?? null),
          ),
        )
        .subscribe((snapshot: AppContextSnapshot | null) => {
          const withTour = snapshot as AppContextSnapshotWithTour | null;
          this.fallbackActiveTour = withTour?.ActiveTour ?? null;
          if (!readTourRealtimeBridge()) {
            this.RecordChange({ Author: 'system' });
          }
        });
    }
  }

  public override Dispose(): void {
    this.unsubscribeBridge?.();
    this.unsubscribeBridge = null;
    this.appContextSub?.unsubscribe();
    this.appContextSub = null;
    super.Dispose();
  }

  private handleBridgeEvent(event: TourChannelBridgeEvent): void {
    const changeId = this.RecordChange({ Author: 'user' });
    this.EmitChannelEvent(
      event.Kind,
      {
        tourKey: event.TourKey,
        ...(event.StepKey ? { stepKey: event.StepKey } : {}),
        ...(event.Outcome ? { outcome: event.Outcome } : {}),
      },
      changeId,
    );

    if (event.Kind === 'step_entered' && this.Context?.RequestSpokenResponse) {
      const prompt =
        event.VoiceScript ??
        (event.GuideNotes
          ? `Guide the user on step "${event.StepTitle ?? event.StepKey ?? 'this step'}": ${event.GuideNotes}`
          : event.StepBody
            ? `In 1–2 concise conversational sentences, guide the user through "${event.StepTitle ?? 'this step'}" (${event.StepBody}), without reading word-for-word.`
            : `Briefly introduce step "${event.StepTitle ?? event.StepKey ?? 'this step'}" in one short sentence.`);
      this.Context.RequestSpokenResponse(prompt);
    } else if (event.Kind === 'step_completed' && this.Context?.RequestSpokenResponse) {
      const stepLabel = event.StepTitle ?? event.StepKey ?? 'this step';
      this.Context.RequestSpokenResponse(
        `The user completed ${stepLabel}. Briefly acknowledge and guide the next step if one is active.`,
      );
    }
  }

  private async forwardToClientTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<RealtimeChannelVerbResult> {
    const executor = this.Context?.ExecuteClientTool;
    if (!executor) {
      return {
        Success: false,
        ErrorCode: 'tour_unavailable',
        Error: 'No active Guided Tour bridge or client tool executor is available.',
      };
    }
    const result = await executor(toolName, params);
    if (!result.Success) {
      return {
        Success: false,
        ErrorCode: 'verb_failed',
        Error: result.ErrorMessage ?? `Tool ${toolName} failed.`,
      };
    }
    return {
      Success: true,
      Result: (result.Result as JSONValue) ?? { ok: true },
    };
  }
}

function toActiveStepJson(step: TourChannelActiveStepState): JSONObject {
  const out: JSONObject = {
    TourKey: step.TourKey,
    TourName: step.TourName,
    StepKey: step.StepKey,
    StepTitle: step.StepTitle,
    StepIndex: step.StepIndex,
    StepCount: step.StepCount,
    Mode: step.Mode,
    DirectorType: step.DirectorType,
  };
  if (step.GuideNotes !== undefined) {
    out['GuideNotes'] = step.GuideNotes;
  }
  if (step.VoiceScript !== undefined) {
    out['VoiceScript'] = step.VoiceScript;
  }
  return out;
}

function toVisibleAnchorJson(anchor: TourChannelVisibleAnchor): JSONObject {
  const out: JSONObject = {
    AnchorKey: anchor.AnchorKey,
    Strategy: anchor.Strategy,
    AccessibleName: anchor.AccessibleName,
  };
  if (anchor.Role !== undefined) {
    out['Role'] = anchor.Role;
  }
  return out;
}

/**
 * Tree-shaking prevention for {@link TourChannel}'s `@RegisterClass` registration.
 */
export function LoadTourChannel(): void {
  // no-op: static import reference keeps @RegisterClass intact
}

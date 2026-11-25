/**
 * @fileoverview Headless Guided Tour realtime channel (`TourChannel`) for Voice-directed tours
 * (§10.3 & §18 Phase 5).
 *
 * Paired with the generic `ClientOnlyChannelServer` (`MJ: AI Agent Channels.ServerPluginClass = 'ClientOnlyChannelServer'`).
 * Never renders a tab surface (`DisplayPolicy: 'headless'`). Streams active-step and visible-anchor
 * state into the live realtime session via {@link RecordChange}, forwards step-completion updates via
 * {@link RealtimeChannelContext.RequestSpokenResponse}, and exposes `highlight`, `goToStep`, and
 * `prepareStep` verbs routed to the active tour session.
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
  Highlight(anchorKey: string, caption?: string): Promise<{ Success: boolean; ErrorMessage?: string }>;
  GoToStep(stepKey: string): Promise<{ Success: boolean; ErrorMessage?: string }>;
  PrepareStep(consentGranted?: boolean): Promise<{ Success: boolean; ErrorMessage?: string }>;
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
    'Headless voice-director channel for Guided Tours. Only cite anchors currently present in `visibleAnchors`. ' +
    'Use `highlight` to spotlight a visible anchor with a short caption, `prepareStep` to reveal or navigate to the ' +
    'next step target, and `goToStep` to move strictly along authored edges or back to completed steps. Keep spoken ' +
    'turns short and wait silently while the user performs an action.',
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
  ],
  Events: [
    { Name: 'tour_started', Description: 'A Guided Tour session started.' },
    { Name: 'step_entered', Description: 'The tour entered a step.' },
    { Name: 'step_completed', Description: 'The user or director completed a step.' },
    { Name: 'tour_ended', Description: 'The Guided Tour session ended.' },
  ],
  DisplayPolicy: 'headless',
  DefaultAvailability: 'opt-in',
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
      if (!anchorKey) {
        return { Success: false, ErrorCode: 'invalid_params', Error: 'highlight requires anchorKey.' };
      }
      if (bridge) {
        const res = await bridge.Highlight(anchorKey, caption);
        return res.Success
          ? { Success: true, Result: { highlighted: true, anchorKey } }
          : { Success: false, ErrorCode: 'anchor_not_visible', Error: res.ErrorMessage ?? 'Anchor is not visible.' };
      }
      return this.forwardToClientTool('TourHighlight', { AnchorKey: anchorKey, Caption: caption });
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

    if (event.Kind === 'step_completed' && this.Context?.RequestSpokenResponse) {
      const stepLabel = event.StepTitle ?? event.StepKey ?? 'this step';
      this.Context.RequestSpokenResponse(
        `The user completed ${stepLabel}. Briefly acknowledge and guide the next step if one is active.`,
      );
    } else if (event.Kind === 'step_entered' && event.VoiceScript && this.Context?.RequestSpokenResponse) {
      this.Context.RequestSpokenResponse(event.VoiceScript);
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

/**
 * @fileoverview Host adapter, capability, definition source, progress store, and
 * DOM-bridge contracts for `@memberjunction/tours-runtime`.
 * @module @memberjunction/tours-runtime
 */

import type { Observable } from 'rxjs';
import type {
    ITourAnchor,
    TourAnchorResolution,
    TourDefinition,
    TourGuideMode,
    TourRunEvent,
    TourRunRecord,
    TourStepDefinition,
} from './types';

// ============================================================================
// Host & Principal Contracts (§4.2)
// ============================================================================

export interface TourHostCapabilities {
    Navigation: 'MJ App' | 'Url' | 'None';
    /** `BaseEntity` events are observable in this host. */
    EntityEvents: boolean;
    /** Generated MJ forms render in this host (`FormField` / `FormSection` anchors). */
    MJForms: boolean;
    /** Angular renderers can be mounted. */
    Angular: boolean;
    Agent: 'None' | 'Chat' | 'Voice' | 'Chat and Voice';
    Persistence: 'MJ User' | 'Guest' | 'Memory';
}

export interface TourCapabilityRequirement {
    Navigation?: Array<TourHostCapabilities['Navigation']>;
    EntityEvents?: boolean;
    MJForms?: boolean;
    Angular?: boolean;
    Agent?: Array<TourHostCapabilities['Agent']>;
    Persistence?: Array<TourHostCapabilities['Persistence']>;
}

export interface TourLocation {
    ApplicationID?: string;
    ApplicationName?: string;
    NavItemKey?: string;
    DriverClass?: string;
    EntityName?: string;
    RecordId?: string;
    Url?: string;
    CustomContext?: Record<string, unknown>;
}

export interface TourNavigationIntent {
    ApplicationID?: string;
    ApplicationName?: string;
    NavItemKey?: string;
    DriverClass?: string;
    EntityName?: string;
    RecordId?: string;
    RailKey?: string;
    SectionKey?: string;
    Url?: string;
    QueryParams?: Record<string, string>;
}

export type TourPrincipal =
    | {
          Kind: 'MJUser';
          UserId: string;
          Roles: string[];
          Permissions?: Record<
              string,
              {
                  CanRead: boolean;
                  CanCreate: boolean;
                  CanUpdate: boolean;
                  CanDelete: boolean;
              }
          >;
      }
    | {
          Kind: 'Guest';
          VisitorKey: string;
          SurfaceKey: string;
      }
    | {
          Kind: 'Anonymous';
      };

/** Host adapter implemented by Explorer, custom Angular apps, WebTourHost, or mobile hosts. */
export interface ITourHost {
    /** What this host can do; tours that need more are not offered here. */
    readonly Capabilities: TourHostCapabilities;
    /** Where the user is now, and every change. */
    readonly Location$: Observable<TourLocation>;
    /** Carry out a navigation intent (app + nav item, record, or URL). Resolves when ready. */
    Navigate(intent: TourNavigationIntent): Promise<boolean>;
    /** The signed-in MJ user, a guest visitor, or nobody. */
    readonly Principal: TourPrincipal;
    /** Optional: current snapshot of location if host supports synchronous reads. */
    GetCurrentLocation?(): TourLocation;
    /** Optional: installed application names for capability/prerequisite checks. */
    GetInstalledApplications?(): string[];
    /** Optional: register the tour agent toolkit with whatever agent surface this host has. */
    AttachAgentBridge?(bridge: ITourHostAgentBridge): void;
    /** Optional: host-side demonstration of a step's UI action (with Tier-3 confirmation gate). */
    DemonstrateStep?(
        step: TourStepDefinition,
        context: { ConfirmedMutation?: boolean },
    ): Promise<{
        Success: boolean;
        RequiresConfirmation?: boolean;
        ConfirmationPrompt?: string;
        MutatesData?: boolean;
        ErrorMessage?: string;
    }>;
}

// ============================================================================
// Definition Source, Progress Store & Server Predicate Adapter
// ============================================================================

export interface ITourDefinitionSource {
    GetTours(location: TourLocation): Promise<TourDefinition[]>;
    GetTourByKey?(tourKey: string): Promise<TourDefinition | null>;
}

export interface ITourProgressStore {
    GetRuns(): Promise<TourRunRecord[]>;
    RecordEvents(events: TourRunEvent[]): Promise<void>;
}

export interface TourServerPredicateRequest {
    PredicateKey: string;
    Params?: Record<string, unknown>;
}

export interface TourServerPredicateResult {
    PredicateKey: string;
    Satisfied: boolean;
    ErrorMessage?: string;
}

export interface ITourServerPredicateEvaluator {
    EvaluatePredicates(
        requests: TourServerPredicateRequest[],
    ): Promise<TourServerPredicateResult[]>;
}

// ============================================================================
// DOM Bridge & Runtime Safety Callbacks (DOM-free abstractions)
// ============================================================================

export interface TourVisibleAnchorInfo {
    AnchorKey: string;
    Strategy: string;
    AccessibleName: string;
    Role?: string;
    EntityName?: string;
    FieldName?: string;
    IsVisible: boolean;
    Bounds?: { X: number; Y: number; Width: number; Height: number };
}

export interface TourResolvedAnchorInfo {
    Found: boolean;
    Resolution: TourAnchorResolution;
    AnchorKey?: string;
    AccessibleName?: string;
    FailureReason?: string;
}

/**
 * Pure abstraction implemented by UI layer (`@memberjunction/ng-tours` `AnchorRegistry`)
 * or test harnesses so `TourSession` never touches DOM globals directly.
 */
export interface ITourAnchorDomBridge {
    ResolveAnchor(anchor: ITourAnchor, timeoutMs?: number): Promise<TourResolvedAnchorInfo>;
    GetVisibleAnchors(): TourVisibleAnchorInfo[];
    HighlightAnchor?(anchorKey: string, caption?: string): Promise<{ Success: boolean; ErrorMessage?: string }>;
    WaitForAnchorInteraction?(
        anchor: ITourAnchor,
        interaction: 'click' | 'focus' | 'change' | 'input' | 'any',
        signal?: AbortSignal,
    ): Promise<boolean>;
    GetFieldValue?(entityName: string | undefined, fieldName: string): unknown;
}

export type TourBannedDoActionCategory =
    | 'Delete'
    | 'FinancialPosting'
    | 'BatchDispatch'
    | 'PermissionGrant'
    | 'OutboundMessage';

export interface TourMutationConfirmationRequest {
    TourKey: string;
    StepKey: string;
    ActionCategory: string;
    Description: string;
    ToolName?: string;
    ActionName?: string;
    Params?: Record<string, unknown>;
}

/** Explicit per-mutation consent gate required for Do mode (§10.3). */
export interface ITourMutationConfirmer {
    ConfirmMutation(request: TourMutationConfirmationRequest): Promise<boolean>;
}

export interface TourAgentActionRequest {
    TourKey: string;
    Step: TourStepDefinition;
    ActionCategory: string;
    ToolName?: string;
    ActionName?: string;
    Params?: Record<string, unknown>;
}

export interface TourAgentActionResult {
    Success: boolean;
    Message?: string;
    Data?: Record<string, unknown>;
}

/** Executes permitted Do-mode mutations via typed client tools or MJ Actions. */
export interface ITourAgentActionExecutor {
    ExecuteStepAction(request: TourAgentActionRequest): Promise<TourAgentActionResult>;
}

// ============================================================================
// Agent Bridge Contracts (Host-agnostic)
// ============================================================================

export interface TourClientToolDefinition {
    Name: string;
    Description: string;
    InputSchema: Record<string, unknown>;
    OutputSchema?: Record<string, unknown>;
    Category?: string;
    Handler: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface TourActiveContextSnapshot {
    ActiveTour: {
        TourKey: string;
        Name: string;
        StepKey: string;
        StepTitle: string;
        StepIndex: number;
        StepCount: number;
        Mode: TourGuideMode | string;
        DirectorType: string;
        StartedAt: string;
    } | null;
    AvailableTours: Array<{
        TourKey: string;
        Name: string;
        Description: string;
        EstimatedMinutes?: number;
    }>;
}

export interface ITourHostAgentBridge {
    RegisterGlobalTools(tools: TourClientToolDefinition[]): void;
    RegisterSessionTools(tools: TourClientToolDefinition[]): void;
    ClearSessionTools(): void;
    UpdateContextSnapshot?(snapshot: TourActiveContextSnapshot): void;
}

// ============================================================================
// Capability Helpers
// ============================================================================

/** Checks whether `hostCaps` meets every requirement in `required`. */
export function HostSatisfiesCapabilities(
    hostCaps: TourHostCapabilities,
    required?: TourCapabilityRequirement,
): { Satisfied: boolean; Missing: string[] } {
    if (!required) {
        return { Satisfied: true, Missing: [] };
    }
    const missing: string[] = [];

    if (required.Navigation && !required.Navigation.includes(hostCaps.Navigation)) {
        missing.push(`Navigation(${required.Navigation.join('|')})`);
    }
    if (required.EntityEvents && !hostCaps.EntityEvents) {
        missing.push('EntityEvents');
    }
    if (required.MJForms && !hostCaps.MJForms) {
        missing.push('MJForms');
    }
    if (required.Angular && !hostCaps.Angular) {
        missing.push('Angular');
    }
    if (required.Agent && !required.Agent.includes(hostCaps.Agent)) {
        missing.push(`Agent(${required.Agent.join('|')})`);
    }
    if (required.Persistence && !required.Persistence.includes(hostCaps.Persistence)) {
        missing.push(`Persistence(${required.Persistence.join('|')})`);
    }

    return { Satisfied: missing.length === 0, Missing: missing };
}

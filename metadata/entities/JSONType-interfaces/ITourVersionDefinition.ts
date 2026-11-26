/**
 * Immutable published tour snapshot stored on `MJ: Tour Versions.Definition`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Immutable snapshot of a single `TourStep` at publish time. */
export interface ITourVersionStepSnapshot {
    /** Original `TourStep.ID` at publish time. */
    ID: string;
    /** Stable step key within the tour. */
    StepKey: string;
    /** Linear sequence order. */
    Sequence: number;
    /** Step type ID (`MJ: Tour Step Types`). */
    StepTypeID: string;
    /** Step type name resolved at publish time (for example `'Spotlight'`). */
    StepTypeName: string;
    /** Step type `DriverClass` resolved at publish time. */
    StepTypeDriverClass: string;
    /** Optional step type `RendererClass`. */
    StepTypeRendererClass?: string | null;
    /** Optional step type `ComponentID` for runtime `ComponentSpec` step types. */
    StepTypeComponentID?: string | null;
    /** Optional per-step `DriverClass` override. */
    DriverClass?: string | null;
    /** Step heading. */
    Title: string;
    /** Markdown step body. */
    Body?: string | null;
    /** Parsed `ITourStepConfiguration` object. */
    Configuration?: Record<string, unknown> | null;
    /** Parsed `ITourAnchor` object. */
    Anchor?: Record<string, unknown> | null;
    /** Popover placement. */
    Placement: 'Auto' | 'Top' | 'Bottom' | 'Left' | 'Right' | 'Center';
    /** Step interaction mode. */
    Mode: 'Show' | 'Guide' | 'Do';
    /** Parsed `ITourStepPrepare` object. */
    Prepare?: Record<string, unknown> | null;
    /** Parsed `ITourCompletion` object. */
    Completion?: Record<string, unknown> | null;
    /** Parsed `SkipWhen` condition object. */
    SkipWhen?: Record<string, unknown> | null;
    /** Missing-anchor fallback behavior. */
    OnMissing: 'Skip' | 'Center' | 'Stall' | 'Agent Recover';
    /** Whether the step may be skipped. */
    IsOptional: boolean;
    /** Agent-only grounding notes. */
    GuideNotes?: string | null;
    /** Voice narration script. */
    VoiceScript?: string | null;
}

/** Immutable snapshot of a single `TourStepPath` edge at publish time. */
export interface ITourVersionStepPathSnapshot {
    /** Original `TourStepPath.ID` at publish time. */
    ID: string;
    /** Source step ID. */
    FromStepID: string;
    /** Source `StepKey`. */
    FromStepKey: string;
    /** Target step ID. */
    ToStepID: string;
    /** Target `StepKey`. */
    ToStepKey: string;
    /** Parsed branch condition (CompositeFilter or choice key). */
    Condition?: Record<string, unknown> | string | null;
    /** Branch edge label. */
    Label?: string | null;
    /** Evaluation priority. */
    Priority: number;
    /** Display sequence. */
    Sequence: number;
    /** Whether this edge is the default fallback branch. */
    IsDefault: boolean;
    /** Parsed `ITourStepPathConfiguration` object. */
    Configuration?: Record<string, unknown> | null;
}

/** TourVersion.Definition — self-contained immutable tour definition pinned by `TourRun`. */
export interface ITourVersionDefinition {
    /** Stable namespaced tour key. */
    TourKey: string;
    /** Tour title at publish time. */
    Name: string;
    /** Tour summary description at publish time. */
    Description?: string | null;
    /** Estimated completion minutes. */
    EstimatedMinutes?: number | null;
    /** Default guidance mode. */
    DefaultGuideMode: 'Visual' | 'Chat' | 'Voice' | 'User Choice';
    /** Whether confirmed Do-mode agent actions are permitted. */
    AllowAgentActions: boolean;
    /** Optional tour-level `DriverClass`. */
    DriverClass?: string | null;
    /** Optional tour-level `PresenterClass`. */
    PresenterClass?: string | null;
    /** Parsed `ITourGoal` object. */
    Goal?: Record<string, unknown> | null;
    /** Parsed `ITourStartLocation` object. */
    StartLocation?: Record<string, unknown> | null;
    /** Parsed `ITourConfiguration` object. */
    Configuration?: Record<string, unknown> | null;
    /** Ordered snapshot of all tour steps. */
    Steps: ITourVersionStepSnapshot[];
    /** Snapshot of all tour branching paths. */
    Paths: ITourVersionStepPathSnapshot[];
}

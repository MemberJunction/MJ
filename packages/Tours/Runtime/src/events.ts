/**
 * @fileoverview Class-based `Before*` / `After*` event-args contract for Guided Tours
 * following `UI_LAYERING_GUIDE.md` §6 (`Before*` synchronous and cancelable; `After*` informational).
 * @module @memberjunction/tours-runtime
 */

import type {
    ITourAnchor,
    TourLaunchSource,
    TourRunOutcome,
    TourSessionGuideMode,
    TourStepOutcome,
    TourStepRef,
} from './types';

export type TourEventName =
    | 'BeforeTourStart'
    | 'AfterTourStart'
    | 'BeforeTourStepEnter'
    | 'AfterTourStepEnter'
    | 'AfterTourStepComplete'
    | 'BeforeTourEnd'
    | 'AfterTourEnd'
    | 'AnchorMissing'
    | 'DirectorChanged';

/** Synchronous, cancelable event fired before a tour session begins. */
export class BeforeTourStartEventArgs {
    public readonly EventName = 'BeforeTourStart' as const;
    public Cancel: boolean = false;
    public CancelReason?: string;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly TourVersionID: string,
        public readonly GuideMode: TourSessionGuideMode,
        public readonly DirectorType: string,
        public readonly LaunchSource: TourLaunchSource,
    ) {}
}

/** Informational event fired after a tour session starts (suppressed if `BeforeTourStart` canceled). */
export class AfterTourStartEventArgs {
    public readonly EventName = 'AfterTourStart' as const;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly TourVersionID: string,
        public readonly GuideMode: TourSessionGuideMode,
        public readonly DirectorType: string,
        public readonly LaunchSource: TourLaunchSource,
    ) {}
}

/** Synchronous, cancelable event fired before entering a step. */
export class BeforeTourStepEnterEventArgs {
    public readonly EventName = 'BeforeTourStepEnter' as const;
    public Cancel: boolean = false;
    public CancelReason?: string;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly Step: TourStepRef,
    ) {}
}

/** Informational event fired after entering a step (suppressed if `BeforeTourStepEnter` canceled). */
export class AfterTourStepEnterEventArgs {
    public readonly EventName = 'AfterTourStepEnter' as const;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly Step: TourStepRef,
    ) {}
}

/** Informational event fired after a step finishes (completed, skipped, or dismissed). */
export class AfterTourStepCompleteEventArgs {
    public readonly EventName = 'AfterTourStepComplete' as const;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly StepKey: string,
        public readonly Step: TourStepRef,
        public readonly Outcome: TourStepOutcome,
    ) {}
}

/** Synchronous, cancelable event fired before ending a tour session. */
export class BeforeTourEndEventArgs {
    public readonly EventName = 'BeforeTourEnd' as const;
    public Cancel: boolean = false;
    public CancelReason?: string;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly Outcome: TourRunOutcome,
    ) {}
}

/** Informational event fired after a tour session ends (suppressed if `BeforeTourEnd` canceled). */
export class AfterTourEndEventArgs {
    public readonly EventName = 'AfterTourEnd' as const;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly Outcome: TourRunOutcome,
    ) {}
}

/** Informational event fired when a step anchor fails to resolve. */
export class TourAnchorMissingEventArgs {
    public readonly EventName = 'AnchorMissing' as const;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly StepKey: string,
        public readonly Anchor: ITourAnchor,
        public readonly Reason: string,
    ) {}
}

/** Informational event fired when the session's active director changes. */
export class TourDirectorChangedEventArgs {
    public readonly EventName = 'DirectorChanged' as const;

    constructor(
        public readonly RunID: string,
        public readonly TourKey: string,
        public readonly PreviousDirectorType: string | null,
        public readonly NewDirectorType: string,
    ) {}
}

export type TourSessionEventArgs =
    | BeforeTourStartEventArgs
    | AfterTourStartEventArgs
    | BeforeTourStepEnterEventArgs
    | AfterTourStepEnterEventArgs
    | AfterTourStepCompleteEventArgs
    | BeforeTourEndEventArgs
    | AfterTourEndEventArgs
    | TourAnchorMissingEventArgs
    | TourDirectorChangedEventArgs;

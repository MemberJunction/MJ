/**
 * Step-level configuration and localization overrides stored on `MJ: Tour Steps.Configuration`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Locale-specific display and narration overrides for a tour step. */
export interface ITourStepLocalization {
    /** Localized step heading. */
    title?: string;
    /** Localized Markdown step body. */
    body?: string;
    /** Localized voice narration script. */
    voiceScript?: string;
    /** Localized primary Next/Continue button label. */
    nextLabel?: string;
    /** Localized CTA label for Modal or Banner steps. */
    ctaLabel?: string;
}

/** Selectable option rendered by `Choice` steps. */
export interface ITourStepChoiceOption {
    /** Stable key exposed to `TourStepPath` conditions. */
    key: string;
    /** Display label of the choice. */
    label: string;
    /** Optional supporting explanation shown under the label. */
    description?: string;
    /** Optional Font Awesome icon class. */
    icon?: string;
    /** Marks the correct answer when `choiceMode` is `'knowledgeCheck'`. */
    isCorrect?: boolean;
    /** Optional explanation shown after selecting this answer in knowledge-check mode. */
    feedback?: string;
}

/** Single slide in a multi-image `Media` carousel step. */
export interface ITourMediaSlide {
    /** Image or video URL. */
    mediaUrl: string;
    /** Accessible alternative text describing the slide. */
    altText: string;
    /** Optional caption displayed below the slide. */
    caption?: string;
}

/** TourStep.Configuration — typed options for the 9 standard step primitives, localizations, and custom step plugins. */
export interface ITourStepConfiguration {
    /** Locale-keyed copy overrides (BCP 47 tags such as `'es'`, `'fr-CA'`). */
    localizations?: Record<string, ITourStepLocalization>;
    /** Explicit opt-in permitting a CSS `Selector` anchor fallback without failing the `tour-anchors` gate. */
    tourAnchorsAllowSelector?: boolean;

    // --- Spotlight ---
    /** Padding in pixels around the spotlight SVG cutout. */
    spotlightPadding?: number;
    /** Border radius in pixels of the spotlight SVG cutout. */
    spotlightRadius?: number;
    /** Whether clicks inside the spotlight cutout pass through to the target element. */
    allowInteraction?: boolean;
    /** Additional registered anchor keys highlighted alongside the primary anchor. */
    additionalAnchors?: string[];
    /** Custom label for the Next button. */
    nextLabel?: string;
    /** Custom label for the Back button. */
    backLabel?: string;

    // --- Action ---
    /** Short imperative instruction telling the user what action to perform. */
    actionPrompt?: string;
    /** Displays a waiting spinner/indicator while awaiting a background `Signal` or `EntityEvent`. */
    showWaitingIndicator?: boolean;
    /** Label shown beside the waiting indicator. */
    waitingLabel?: string;
    /** Automatically advances to the next step as soon as completion checks satisfy (default true). */
    autoAdvanceOnComplete?: boolean;

    // --- Beacon ---
    /** Anchor corner or position for the pulsing beacon dot. */
    beaconPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
    /** Pulse animation duration in milliseconds (capped at 5000 ms for WCAG 2.2.2). */
    beaconPulseDurationMs?: number;
    /** Accessible label on the beacon trigger button. */
    beaconLabel?: string;

    // --- Modal ---
    /** Visual variant of a Modal step: welcome card, announcement, or end-of-tour checkpoint recap. */
    modalVariant?: 'welcome' | 'announcement' | 'checkpoint';
    /** Primary call-to-action button label on Modal or Banner steps. */
    ctaLabel?: string;
    /** Optional follow-on tour key offered from a checkpoint Modal. */
    nextTourKey?: string;
    /** Optional learning path key linked from a checkpoint Modal. */
    learningPathKey?: string;
    /** Optional hero Font Awesome icon class for Modal cards. */
    heroIcon?: string;

    // --- Banner ---
    /** Semantic color tone for a Banner step. */
    bannerTone?: 'info' | 'success' | 'warning' | 'accent';
    /** Whether a Banner step includes a dismiss button. */
    dismissible?: boolean;
    /** Optional destination URL opened by a Banner CTA button. */
    ctaUrl?: string;

    // --- Choice ---
    /** Choices rendered by a `Choice` step (2-4 answers recommended). */
    choices?: ITourStepChoiceOption[];
    /** Whether `Choice` acts as a pathway branch selector or a knowledge check with feedback. */
    choiceMode?: 'branch' | 'knowledgeCheck';
    /** Displays immediate feedback after answer selection in `knowledgeCheck` mode. */
    showFeedback?: boolean;

    // --- Media ---
    /** Media format rendered by `Media` steps. */
    mediaType?: 'video' | 'image' | 'carousel';
    /** Source URL for video or image media. */
    mediaUrl?: string;
    /** Required WebVTT captions track URL for video media. */
    captionsUrl?: string;
    /** Required inline transcript/captions text when `captionsUrl` is omitted. */
    captionsText?: string;
    /** Optional poster image URL for video media. */
    posterUrl?: string;
    /** Required accessible alt text for image media. */
    altText?: string;
    /** Slide list when `mediaType` is `'carousel'`. */
    slides?: ITourMediaSlide[];

    // --- EmbeddedComponent ---
    /** Optional `MJ: Components` ID rendered inside an `EmbeddedComponent` step. */
    componentId?: string;
    /** Inline `ComponentSpec` definition rendered via `<mj-react-component>` when no `componentId` is set. */
    componentSpec?: Record<string, unknown>;
    /** Input properties bound into the embedded component host. */
    hostProps?: Record<string, unknown>;
    /** Event name emitted by the embedded component to complete the step. */
    completeEvent?: string;

    // --- AskAgent ---
    /** Seeded prompt sent to Sage when entering an `AskAgent` step. */
    agentPrompt?: string;
    /** Preferred modality when opening the agent bridge from `AskAgent`. */
    preferredMode?: 'Chat' | 'Voice';
    /** Automatically submits `agentPrompt` when the step opens. */
    autoSendPrompt?: boolean;
    /** Requires explicit `AgentConfirmed` tool call before advancing. */
    requireConfirmation?: boolean;

    /** Extensible properties for custom `BaseTourStepType` plugins. */
    [key: string]: unknown;
}

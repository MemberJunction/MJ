/**
 * @fileoverview Per-model Live API profiles — which features are LEGAL on a given Gemini Live model.
 *
 * Gemini's three Live models share one protocol and differ in what they accept. Sending a key a
 * model has retired is not a degraded session, it is a **hard error at session mint** — the same
 * failure class as an illegal tool name, and upstream of every line of UI code. So the rules have to
 * be applied before the config is built, not discovered at connect time.
 *
 * **This is a data table, not a branch.** `if (model === 'gemini-3.8-live')` scattered through
 * config assembly is the shape MJ's design canon exists to prevent; a keyed table of capability
 * facts is inspectable, testable, and extends by adding a row. It is also provider-LOCAL knowledge —
 * "what does this vendor's model accept" belongs in the vendor's package, not in `@memberjunction/ai`.
 *
 * **Metadata is the authority; this is the fallback.** `ModelConfiguration.Realtime` is where a
 * deployment states these facts, per the generalize-then-map rule. This table answers the case
 * metadata cannot: a model whose catalog rows have not been seeded yet, or were seeded stale, must
 * still mint a WORKING session rather than a hard error. Every resolved value prefers explicit
 * config and falls back here.
 *
 * Facts verified against Google's published model pages and the Live API capabilities guide
 * (2026-09-15). See `plans/realtime/gemini-3-8-live.md` §3.
 *
 * @module @memberjunction/ai-gemini
 * @author MemberJunction.com
 */

import type { RealtimeIdleSignal, RealtimeToolingSettings, RealtimeTurnCoverage } from '@memberjunction/ai';

/** Thinking levels the Live API accepts. `'minimal'` is legal on 3.1 but NOT on 3.8 Extended Thinking. */
export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/** What a given Gemini Live model accepts. Every field is a documented fact, not a preference. */
export interface GeminiLiveModelProfile {
    /** Model id prefix this profile matches (longest match wins). */
    MatchPrefix: string;

    /**
     * Whether `thinkingConfig.thinkingLevel` may be sent at all.
     *
     * `false` for `gemini-3.8-live`, whose page says thinkingLevel "is not supported ... Omit
     * thinking_level (or thinking_config) from your session setup". It still thinks — interleaved
     * reasoning — it just takes no level.
     */
    SupportsThinkingLevel: boolean;

    /** Levels this model accepts when it accepts any. Empty when SupportsThinkingLevel is false. */
    AllowedThinkingLevels: readonly GeminiThinkingLevel[];

    /** Whether `thinkingConfig.includeThoughts` yields thought summaries. */
    SupportsThoughtSummaries: boolean;

    /** Tool-execution semantics. */
    Tooling: Required<Pick<RealtimeToolingSettings, 'SupportsBlockingExecution' | 'SupportsScheduling'>>;

    /**
     * Which server signal actually means idle.
     *
     * `'interactionStatus'` on Extended Thinking, whose page is explicit that "turnComplete: true no
     * longer indicates that the model is idle" because the server may still be running background
     * reasoning or async tool calls.
     */
    IdleSignal: RealtimeIdleSignal;

    /**
     * Whether this model has RETIRED affective dialogue. When true, `enableAffectiveDialog` must
     * never be sent — the 3.8 pages say it "is removed from the API".
     */
    AffectiveDialogRemoved: boolean;

    /**
     * Whether proactive audio is permanently on, making `proactivity: false` an error rather than a
     * preference.
     */
    ProactiveAudioAlwaysOn: boolean;

    /** The model's OWN turn-coverage default, i.e. what we get if we say nothing. */
    ProviderDefaultTurnCoverage: RealtimeTurnCoverage;
}

/**
 * The known Live models. Order is irrelevant — resolution takes the LONGEST matching prefix, so
 * `gemini-3.8-live-extended-thinking` cannot be captured by `gemini-3.8-live`.
 */
export const GEMINI_LIVE_MODEL_PROFILES: readonly GeminiLiveModelProfile[] = [
    {
        MatchPrefix: 'gemini-3.8-live-extended-thinking',
        SupportsThinkingLevel: true,
        AllowedThinkingLevels: ['low', 'medium', 'high'],
        SupportsThoughtSummaries: true,
        // Blocking mode "is not supported and returns a hard error"; scheduling is unsupported too.
        Tooling: { SupportsBlockingExecution: false, SupportsScheduling: false },
        IdleSignal: 'interactionStatus',
        AffectiveDialogRemoved: true,
        ProactiveAudioAlwaysOn: true,
        ProviderDefaultTurnCoverage: 'audioActivityAndAllVideo',
    },
    {
        MatchPrefix: 'gemini-3.8-live',
        SupportsThinkingLevel: false,
        AllowedThinkingLevels: [],
        SupportsThoughtSummaries: false,
        // NON_BLOCKING is the default but BLOCKING remains legal for back-compat, and scheduling
        // (SILENT / WHEN_IDLE / INTERRUPTED) is supported here and only here.
        Tooling: { SupportsBlockingExecution: true, SupportsScheduling: true },
        IdleSignal: 'turnComplete',
        AffectiveDialogRemoved: true,
        ProactiveAudioAlwaysOn: true,
        ProviderDefaultTurnCoverage: 'audioActivityAndAllVideo',
    },
    {
        // The legacy preview model. Retained deliberately: the capability table is what makes
        // supporting it cost nothing, so there is no reason to drop it.
        MatchPrefix: 'gemini-3.1-flash-live',
        SupportsThinkingLevel: true,
        AllowedThinkingLevels: ['minimal', 'low', 'medium', 'high'],
        SupportsThoughtSummaries: true,
        Tooling: { SupportsBlockingExecution: true, SupportsScheduling: false },
        IdleSignal: 'turnComplete',
        AffectiveDialogRemoved: false,
        ProactiveAudioAlwaysOn: false,
        ProviderDefaultTurnCoverage: 'audioActivityOnly',
    },
];

/**
 * The profile applied to a Live model this table does not know.
 *
 * Deliberately the most PERMISSIVE and least surprising option: an unknown model is most likely a
 * newer one, and refusing to mint a session for it would make every future model release a hard
 * outage until this table is updated. The one thing it does not do is invent a thinking level.
 */
export const GEMINI_LIVE_FALLBACK_PROFILE: GeminiLiveModelProfile = {
    MatchPrefix: '',
    SupportsThinkingLevel: false,
    AllowedThinkingLevels: [],
    SupportsThoughtSummaries: false,
    Tooling: { SupportsBlockingExecution: true, SupportsScheduling: false },
    IdleSignal: 'turnComplete',
    AffectiveDialogRemoved: false,
    ProactiveAudioAlwaysOn: false,
    ProviderDefaultTurnCoverage: 'audioActivityOnly',
};

/**
 * Resolves the profile for a model id, longest prefix first.
 *
 * Case- and whitespace-insensitive because model ids reach us from metadata that humans edit.
 * Never throws and never returns undefined — an unknown model gets
 * {@link GEMINI_LIVE_FALLBACK_PROFILE} so a new model release degrades to "treated conservatively"
 * rather than "cannot connect".
 */
export function ResolveGeminiLiveProfile(model: string | null | undefined): GeminiLiveModelProfile {
    const id = String(model ?? '').trim().toLowerCase();
    if (id.length === 0) {
        return GEMINI_LIVE_FALLBACK_PROFILE;
    }
    let best: GeminiLiveModelProfile | undefined;
    for (const p of GEMINI_LIVE_MODEL_PROFILES) {
        if (id.startsWith(p.MatchPrefix) && (!best || p.MatchPrefix.length > best.MatchPrefix.length)) {
            best = p;
        }
    }
    return best ?? GEMINI_LIVE_FALLBACK_PROFILE;
}

/**
 * Picks the thinking level to send, or `undefined` for "send no thinkingConfig at all".
 *
 * Returns a `Warning` instead of throwing whenever a requested level cannot be honoured: a
 * misconfigured effort level must not cost the user their voice session, and a silent downgrade is
 * exactly the kind of thing that is discovered months later. Both outcomes are reported.
 *
 * @param requested The effort level from `ModelConfiguration.Realtime.Reasoning.Effort`, if any.
 * @param profile The resolved model profile.
 */
export function ResolveGeminiThinkingLevel(
    requested: string | null | undefined,
    profile: GeminiLiveModelProfile
): { Level?: GeminiThinkingLevel; Warning?: string } {
    const want = String(requested ?? '').trim().toLowerCase();

    if (!profile.SupportsThinkingLevel) {
        return want.length === 0
            ? {}
            : {
                  Warning:
                      `Ignored reasoning effort "${want}": ${profile.MatchPrefix || 'this model'} does not accept ` +
                      `thinkingLevel and documents that thinkingConfig must be omitted entirely. It still reasons (interleaved).`,
              };
    }
    if (want.length === 0) {
        return {};
    }
    // 'none' and 'xhigh' exist in the neutral Effort vocabulary but have no Gemini equivalent.
    if (!profile.AllowedThinkingLevels.includes(want as GeminiThinkingLevel)) {
        return {
            Warning:
                `Ignored reasoning effort "${want}": ${profile.MatchPrefix || 'this model'} accepts only ` +
                `${profile.AllowedThinkingLevels.join(', ')}. No thinkingLevel was sent, so the model's own default applies.`,
        };
    }
    return { Level: want as GeminiThinkingLevel };
}

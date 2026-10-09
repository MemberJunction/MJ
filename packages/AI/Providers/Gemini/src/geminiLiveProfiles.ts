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

import { ResolveMaxInboundVideoStreams, type RealtimeIdleSignal, type RealtimeToolingSettings, type RealtimeTurnCoverage } from '@memberjunction/ai';

/** Thinking levels the Live API accepts. `'minimal'` is legal on 3.1 but NOT on 3.8 Extended Thinking. */
export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/**
 * Which Gemini endpoint serves a Live session: the Gemini Developer API (an API key) or Gemini Enterprise (Vertex AI,
 * Google Cloud credentials). The protocol is the same; some outputs are not. On the Developer API, `gemini-3.8-live`
 * refuses every avatar field and returns audio for a VIDEO request (probed 2026-10-08).
 */
export type GeminiLiveEndpoint = 'developer' | 'enterprise';

/** What a Live model renders as video output on one endpoint: a live avatar, or nothing. */
export interface GeminiLiveAvatarFacts {
    /** Whether the model renders a live avatar on this endpoint. */
    SupportsAvatarOutput: boolean;
    /** The avatar stream's media type when it does: fragmented MP4 with its codecs, as Media Source Extensions name it. */
    AvatarOutputEncoding?: string;
    /**
     * Whether the avatar's video stream carries the voice. When it does, separate PCM must not also play, or the voice
     * doubles. From Google's sample stream (an AAC track inside the MP4); a player still follows the stream itself.
     */
    AvatarAudioMuxed?: boolean;
}

/** A model profile resolved for one endpoint: the model's facts plus what it renders there. */
export interface GeminiLiveResolvedProfile extends GeminiLiveModelProfile, GeminiLiveAvatarFacts {
    /** The endpoint this profile was resolved for. */
    Endpoint: GeminiLiveEndpoint;
}

/** Endpoint-specific facts for one model row, matched by that row's exact {@link GeminiLiveModelProfile.MatchPrefix}. */
export interface GeminiLiveEndpointOverlay extends GeminiLiveAvatarFacts {
    /** The endpoint these facts hold on. */
    Endpoint: GeminiLiveEndpoint;
    /** The model row they belong to: equal to its `MatchPrefix`, so a longer model id never inherits another row's facts. */
    ModelPrefix: string;
}

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

    /**
     * Default thinking level to send when the model supports/requires thinking level and none
     * was explicitly requested. For `gemini-3.8-live-extended-thinking`, Google's API requires
     * a thinkingLevel in thinkingConfig.
     */
    DefaultThinkingLevel?: GeminiThinkingLevel;

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

    /** Whether the model supports inbound video input stream. */
    SupportsInboundVideo: boolean;

    /**
     * Maximum inbound video frame rate (frames per second) this model accepts, when
     * {@link SupportsInboundVideo} is true.
     *
     * This is the model's own ceiling and the authority for any consumer pacing a video feed —
     * it is carried into the session config, negotiated into the live track descriptor by
     * `ResolveRequestedTracks` (which takes the more restrictive of requested and supported),
     * and read from there. Consumers must NOT hardcode a rate of their own: a future model that
     * accepts a faster feed says so HERE and every consumer follows, which is the whole point of
     * keeping per-model legality in this table rather than in code.
     *
     * Undefined means "no declared ceiling" — the requested rate passes through unclamped, so
     * declare it for every video-capable model.
     */
    MaxInboundVideoRate?: number;

    /**
     * How many concurrent inbound video streams this model accepts when {@link SupportsInboundVideo} is
     * true. Read it through {@link ResolveGeminiMaxInboundVideoStreams}, which returns `0` for a model
     * that does not accept video at all and `1` when a video model declares no limit.
     *
     * Every Live model shipped so far takes ONE stream, so a source arbiter chooses which of several
     * sources the model sees and tells it on each switch. A future model that accepts several says so
     * HERE and the arbiter passes sources through untouched; no consumer hardcodes the number.
     */
    MaxInboundVideoStreams?: number;
}

/**
 * The inbound video stream count a profile ACTUALLY allows: `0` when the model accepts no video (whatever
 * the table says, so a stale number on a non-video row cannot enable streams), else its declared maximum
 * or `1`.
 */
export function ResolveGeminiMaxInboundVideoStreams(profile: GeminiLiveModelProfile): number {
    return ResolveMaxInboundVideoStreams(profile.SupportsInboundVideo, profile.MaxInboundVideoStreams);
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
        DefaultThinkingLevel: 'medium',
        SupportsThoughtSummaries: true,
        // Blocking mode "is not supported and returns a hard error"; scheduling is unsupported too.
        Tooling: { SupportsBlockingExecution: false, SupportsScheduling: false },
        IdleSignal: 'interactionStatus',
        AffectiveDialogRemoved: true,
        ProactiveAudioAlwaysOn: true,
        ProviderDefaultTurnCoverage: 'audioActivityAndAllVideo',
        SupportsInboundVideo: true,
        MaxInboundVideoRate: 1,
        MaxInboundVideoStreams: 1,
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
        SupportsInboundVideo: true,
        MaxInboundVideoRate: 1,
        MaxInboundVideoStreams: 1,
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
        SupportsInboundVideo: false,
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
    SupportsInboundVideo: false,
    // The stream count the model WOULD take if it accepted video. The effective value is still 0 while
    // SupportsInboundVideo is false (ResolveGeminiMaxInboundVideoStreams), so a newer unknown model that
    // turns out to take video is one profile row away from working, with the count already stated.
    MaxInboundVideoStreams: 1,
};

/**
 * What each model renders on each endpoint, beyond its row's facts. A model with no overlay for an endpoint renders no
 * avatar there. Matched by the row's exact `MatchPrefix`, so `gemini-3.8-live-extended-thinking` never inherits
 * `gemini-3.8-live`'s avatar.
 */
export const GEMINI_LIVE_ENDPOINT_OVERLAYS: readonly GeminiLiveEndpointOverlay[] = [
    {
        // Live avatars are Gemini Enterprise only, on `gemini-3.8-live` only. Encoding and muxing are from Google's sample
        // stream (H.264 Constrained Baseline 3.1, 704x1280 at 24 fps, and AAC-LC in fragmented MP4); the spike against a
        // live Enterprise session confirms them.
        Endpoint: 'enterprise',
        ModelPrefix: 'gemini-3.8-live',
        SupportsAvatarOutput: true,
        AvatarOutputEncoding: 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"',
        AvatarAudioMuxed: true,
    },
];

/**
 * The environment variable that gives a model id this table doesn't know the profile of one it does:
 * `<model id>=<known model id>`, comma-separated (`gemini-live-3.8-preview-1009=gemini-3.8-live`). For when Google names
 * a model differently from the table: the catalog's `APIName` is still what Google is sent; only what the model accepts
 * and renders (an avatar on Gemini Enterprise, for `gemini-3.8-live`) comes from the known model's row. An id matches
 * whole, ignoring case and spaces, and an alias wins over the table. Read on each resolution: a restart applies a change.
 */
export const GEMINI_LIVE_MODEL_ALIASES_ENV = 'MJ_GEMINI_LIVE_MODEL_ALIASES';

/** The longest part of a bad alias entry quoted in the log line. */
const MAX_QUOTED_ALIAS_CHARS = 80;

/** The parsed alias setting, kept while the variable's text stays the same. */
let aliasCache: { Raw: string; Aliases: ReadonlyMap<string, GeminiLiveModelProfile> } | null = null;

/** Aliases already reported as used (`alias=row`), so each is logged once per process. */
const reportedAliases = new Set<string>();

/** Resolved profiles by endpoint and model row, so every resolution of one model on one endpoint is the same object. */
const resolvedProfiles = new Map<string, GeminiLiveResolvedProfile>();

/**
 * Resolves the profile for a model id on an endpoint: the model's row (an alias from
 * {@link GEMINI_LIVE_MODEL_ALIASES_ENV}, else the longest prefix), plus what it renders on that endpoint
 * ({@link GEMINI_LIVE_ENDPOINT_OVERLAYS}).
 *
 * Case- and whitespace-insensitive because model ids reach us from metadata that humans edit.
 * Never throws and never returns undefined — an unknown model gets
 * {@link GEMINI_LIVE_FALLBACK_PROFILE} so a new model release degrades to "treated conservatively"
 * rather than "cannot connect".
 *
 * @param model The model id.
 * @param endpoint The endpoint serving the session. Default: the Developer API.
 */
export function ResolveGeminiLiveProfile(model: string | null | undefined, endpoint: GeminiLiveEndpoint = 'developer'): GeminiLiveResolvedProfile {
    const row = resolveModelRow(model);
    const key = `${endpoint}|${row.MatchPrefix}`;
    let resolved = resolvedProfiles.get(key);
    if (!resolved) {
        resolved = { ...row, ...avatarFactsFor(row, endpoint), Endpoint: endpoint };
        resolvedProfiles.set(key, resolved);
    }
    return resolved;
}

/** The model's row: its alias's row, else the longest matching prefix, else the fallback. */
function resolveModelRow(model: string | null | undefined): GeminiLiveModelProfile {
    const id = normalizeModelId(model);
    if (id.length === 0) {
        return GEMINI_LIVE_FALLBACK_PROFILE;
    }
    const aliased = liveModelAliases().get(id);
    if (aliased) {
        reportAliasUsed(id, aliased);
        return aliased;
    }
    return longestPrefixRow(id) ?? GEMINI_LIVE_FALLBACK_PROFILE;
}

/** A model id as the table compares it: trimmed and lower case. */
function normalizeModelId(model: string | null | undefined): string {
    return String(model ?? '').trim().toLowerCase();
}

/** The row whose prefix is the longest one the id starts with, if any. */
function longestPrefixRow(id: string): GeminiLiveModelProfile | undefined {
    let best: GeminiLiveModelProfile | undefined;
    for (const p of GEMINI_LIVE_MODEL_PROFILES) {
        if (id.startsWith(p.MatchPrefix) && (!best || p.MatchPrefix.length > best.MatchPrefix.length)) {
            best = p;
        }
    }
    return best;
}

/** The deployment's aliases ({@link GEMINI_LIVE_MODEL_ALIASES_ENV}), parsed again only when the variable's text changes. */
function liveModelAliases(): ReadonlyMap<string, GeminiLiveModelProfile> {
    const raw = typeof process !== 'undefined' && process.env ? (process.env[GEMINI_LIVE_MODEL_ALIASES_ENV] ?? '') : '';
    if (aliasCache?.Raw !== raw) {
        aliasCache = { Raw: raw, Aliases: parseModelAliases(raw) };
    }
    return aliasCache.Aliases;
}

/** The aliases in a setting; entries that are not `<id>=<known id>` are left out and named in one log line. */
function parseModelAliases(raw: string): ReadonlyMap<string, GeminiLiveModelProfile> {
    const aliases = new Map<string, GeminiLiveModelProfile>();
    const bad: string[] = [];
    for (const entry of raw.split(',').map((text) => text.trim()).filter((text) => text.length > 0)) {
        const alias = readAliasEntry(entry);
        if (alias) {
            aliases.set(alias.Id, alias.Row);
        } else {
            bad.push(entry);
        }
    }
    if (bad.length > 0) {
        const quoted = bad.map((entry) => `"${entry.replace(/[^\x20-\x7E]/g, '?').slice(0, MAX_QUOTED_ALIAS_CHARS)}"`).join(', ');
        const known = GEMINI_LIVE_MODEL_PROFILES.map((p) => p.MatchPrefix).join(', ');
        console.warn(`[GeminiLiveProfiles] Ignored ${GEMINI_LIVE_MODEL_ALIASES_ENV} entries ${quoted}: each must be <model id>=<a known model id> (${known}).`);
    }
    return aliases;
}

/** One `<id>=<known id>` entry: the id and the known model's row, or `null` when it is not one. */
function readAliasEntry(entry: string): { Id: string; Row: GeminiLiveModelProfile } | null {
    const separator = entry.indexOf('=');
    if (separator <= 0) {
        return null;
    }
    const id = normalizeModelId(entry.slice(0, separator));
    const target = normalizeModelId(entry.slice(separator + 1));
    const row = target.length > 0 ? longestPrefixRow(target) : undefined;
    return id.length > 0 && row ? { Id: id, Row: row } : null;
}

/** Says once per process that a model id took an alias's profile, so the log shows the setting took effect. */
function reportAliasUsed(id: string, row: GeminiLiveModelProfile): void {
    const key = `${id}=${row.MatchPrefix}`;
    if (!reportedAliases.has(key)) {
        reportedAliases.add(key);
        console.log(`[GeminiLiveProfiles] Model ${id} uses the ${row.MatchPrefix} profile (${GEMINI_LIVE_MODEL_ALIASES_ENV}).`);
    }
}

/** The row's overlay on the endpoint, or no avatar. */
function avatarFactsFor(row: GeminiLiveModelProfile, endpoint: GeminiLiveEndpoint): GeminiLiveAvatarFacts {
    const overlay = GEMINI_LIVE_ENDPOINT_OVERLAYS.find((o) => o.Endpoint === endpoint && o.ModelPrefix === row.MatchPrefix);
    if (!overlay) {
        return { SupportsAvatarOutput: false };
    }
    return { SupportsAvatarOutput: overlay.SupportsAvatarOutput, AvatarOutputEncoding: overlay.AvatarOutputEncoding, AvatarAudioMuxed: overlay.AvatarAudioMuxed };
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
                `${profile.AllowedThinkingLevels.join(', ')}. Falling back to the configured default (${profile.DefaultThinkingLevel ?? 'model default'}).`,
        };
    }
    return { Level: want as GeminiThinkingLevel };
}

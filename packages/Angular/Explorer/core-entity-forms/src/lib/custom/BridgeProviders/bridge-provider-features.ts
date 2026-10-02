import { MJAIBridgeProviderEntity_IBridgeProviderFeatures } from '@memberjunction/core-entities';

/**
 * Pure, framework-free model + helpers for the AI Bridge Provider capability
 * editor. Kept separate from the Angular component so the object↔toggle mapping
 * is unit-testable without an Angular harness.
 *
 * The capability flags live in `AIBridgeProvider.SupportedFeatures` as JSON,
 * exposed via the typed `SupportedFeaturesObject` accessor
 * (`IBridgeProviderFeatures`). Every key is an optional boolean; absent/false
 * both mean "unsupported".
 */

/** A single capability flag key on the typed features object. */
export type BridgeFeatureKey = keyof MJAIBridgeProviderEntity_IBridgeProviderFeatures;

/** One toggle row in the editor. */
export interface BridgeFeatureDescriptor {
    Key: BridgeFeatureKey;
    Label: string;
    Description: string;
}

/** A labeled group of toggle rows. */
export interface BridgeFeatureGroup {
    Title: string;
    Icon: string;
    Features: BridgeFeatureDescriptor[];
}

/**
 * The full editor layout: the 16 flags grouped the way the IBridgeProviderFeatures
 * interface documents them (join methods / media tracks / signals & telephony).
 * Order here is the render order.
 */
export const BRIDGE_FEATURE_GROUPS: readonly BridgeFeatureGroup[] = [
    {
        Title: 'Join methods',
        Icon: 'fa-door-open',
        Features: [
            { Key: 'OnDemandJoin', Label: 'On-demand join', Description: 'Join now from a supplied join URL / ID.' },
            { Key: 'ScheduledJoin', Label: 'Scheduled join', Description: 'Join a known meeting at a future start time.' },
            { Key: 'InviteJoin', Label: 'Invite join', Description: "Invited like a person via the agent's calendar / email identity." },
            { Key: 'NativeInvite', Label: 'Native invite', Description: "A host adds the agent from inside the platform's own UI (marketplace app)." },
            { Key: 'InboundRouting', Label: 'Inbound routing', Description: "Inbound calls / invites to the agent's identity route to the agent." },
            { Key: 'OutboundDial', Label: 'Outbound dial', Description: 'Telephony: the agent can place outbound calls.' },
        ],
    },
    {
        Title: 'Media tracks',
        Icon: 'fa-photo-film',
        Features: [
            { Key: 'AudioIn', Label: 'Audio in', Description: 'The agent hears the meeting / call.' },
            { Key: 'AudioOut', Label: 'Audio out', Description: 'The agent speaks into the meeting / call.' },
            { Key: 'VideoIn', Label: 'Video in', Description: "The agent sees participants' video." },
            { Key: 'VideoOut', Label: 'Video out', Description: 'The agent shows video.' },
            { Key: 'ScreenIn', Label: 'Screen in', Description: 'The agent sees a shared screen.' },
            { Key: 'ScreenOut', Label: 'Screen out', Description: 'The agent shares a screen (e.g. a live demo).' },
        ],
    },
    {
        Title: 'Signals & telephony',
        Icon: 'fa-tower-broadcast',
        Features: [
            { Key: 'SpeakerDiarization', Label: 'Speaker diarization', Description: 'Inbound audio carries per-speaker labels.' },
            { Key: 'DTMF', Label: 'DTMF', Description: 'Telephony: send / receive DTMF tones.' },
            { Key: 'CallTransfer', Label: 'Call transfer', Description: 'Telephony: transfer a call to another party.' },
            { Key: 'Recording', Label: 'Recording', Description: 'Request platform recording (subject to consent handling).' },
        ],
    },
] as const;

/** Every feature key in render order — handy for counting / iteration. */
export const BRIDGE_FEATURE_KEYS: readonly BridgeFeatureKey[] =
    BRIDGE_FEATURE_GROUPS.flatMap(g => g.Features.map(f => f.Key));

/**
 * Read a single flag from a (possibly null) features object. Absent or false
 * both resolve to false.
 */
export function IsFeatureEnabled(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null,
    key: BridgeFeatureKey,
): boolean {
    return features?.[key] === true;
}

/** @deprecated Use {@link IsFeatureEnabled}. */
export function isFeatureEnabled(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null,
    key: BridgeFeatureKey,
): boolean {
    return IsFeatureEnabled(features, key);
}

/**
 * Return a NEW features object with `key` set to `enabled`. When disabling, the
 * key is omitted entirely (rather than persisted as `false`) so the stored JSON
 * stays minimal — matching the "NULL/omitted = unsupported" convention.
 *
 * Never mutates the input; the typed accessor's cache invalidation depends on a
 * fresh object reference being assigned back through the setter.
 */
export function SetFeature(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null,
    key: BridgeFeatureKey,
    enabled: boolean,
): MJAIBridgeProviderEntity_IBridgeProviderFeatures {
    const next: MJAIBridgeProviderEntity_IBridgeProviderFeatures = { ...(features ?? {}) };
    if (enabled) {
        next[key] = true;
    } else {
        delete next[key];
    }
    return next;
}

/** @deprecated Use {@link SetFeature}. */
export function setFeature(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null,
    key: BridgeFeatureKey,
    enabled: boolean,
): MJAIBridgeProviderEntity_IBridgeProviderFeatures {
    return SetFeature(features, key, enabled);
}

/** Count of enabled flags across all groups — used for the panel header badge. */
export function CountEnabledFeatures(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null,
): number {
    if (!features) return 0;
    return BRIDGE_FEATURE_KEYS.reduce((n, key) => (features[key] === true ? n + 1 : n), 0);
}

/** @deprecated Use {@link CountEnabledFeatures}. */
export function countEnabledFeatures(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null,
): number {
    return CountEnabledFeatures(features);
}

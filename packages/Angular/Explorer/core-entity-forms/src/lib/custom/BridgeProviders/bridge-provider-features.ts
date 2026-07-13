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
    key: BridgeFeatureKey;
    label: string;
    description: string;
}

/** A labeled group of toggle rows. */
export interface BridgeFeatureGroup {
    title: string;
    icon: string;
    features: BridgeFeatureDescriptor[];
}

/**
 * The full editor layout: the 16 flags grouped the way the IBridgeProviderFeatures
 * interface documents them (join methods / media tracks / signals & telephony).
 * Order here is the render order.
 */
export const BRIDGE_FEATURE_GROUPS: readonly BridgeFeatureGroup[] = [
    {
        title: 'Join methods',
        icon: 'fa-door-open',
        features: [
            { key: 'OnDemandJoin', label: 'On-demand join', description: 'Join now from a supplied join URL / ID.' },
            { key: 'ScheduledJoin', label: 'Scheduled join', description: 'Join a known meeting at a future start time.' },
            { key: 'InviteJoin', label: 'Invite join', description: "Invited like a person via the agent's calendar / email identity." },
            { key: 'NativeInvite', label: 'Native invite', description: "A host adds the agent from inside the platform's own UI (marketplace app)." },
            { key: 'InboundRouting', label: 'Inbound routing', description: "Inbound calls / invites to the agent's identity route to the agent." },
            { key: 'OutboundDial', label: 'Outbound dial', description: 'Telephony: the agent can place outbound calls.' },
        ],
    },
    {
        title: 'Media tracks',
        icon: 'fa-photo-film',
        features: [
            { key: 'AudioIn', label: 'Audio in', description: 'The agent hears the meeting / call.' },
            { key: 'AudioOut', label: 'Audio out', description: 'The agent speaks into the meeting / call.' },
            { key: 'VideoIn', label: 'Video in', description: "The agent sees participants' video." },
            { key: 'VideoOut', label: 'Video out', description: 'The agent shows video.' },
            { key: 'ScreenIn', label: 'Screen in', description: 'The agent sees a shared screen.' },
            { key: 'ScreenOut', label: 'Screen out', description: 'The agent shares a screen (e.g. a live demo).' },
        ],
    },
    {
        title: 'Signals & telephony',
        icon: 'fa-tower-broadcast',
        features: [
            { key: 'SpeakerDiarization', label: 'Speaker diarization', description: 'Inbound audio carries per-speaker labels.' },
            { key: 'DTMF', label: 'DTMF', description: 'Telephony: send / receive DTMF tones.' },
            { key: 'CallTransfer', label: 'Call transfer', description: 'Telephony: transfer a call to another party.' },
            { key: 'Recording', label: 'Recording', description: 'Request platform recording (subject to consent handling).' },
        ],
    },
] as const;

/** Every feature key in render order — handy for counting / iteration. */
export const BRIDGE_FEATURE_KEYS: readonly BridgeFeatureKey[] =
    BRIDGE_FEATURE_GROUPS.flatMap(g => g.features.map(f => f.key));

/**
 * Read a single flag from a (possibly null) features object. Absent or false
 * both resolve to false.
 */
export function isFeatureEnabled(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null,
    key: BridgeFeatureKey,
): boolean {
    return features?.[key] === true;
}

/**
 * Return a NEW features object with `key` set to `enabled`. When disabling, the
 * key is omitted entirely (rather than persisted as `false`) so the stored JSON
 * stays minimal — matching the "NULL/omitted = unsupported" convention.
 *
 * Never mutates the input; the typed accessor's cache invalidation depends on a
 * fresh object reference being assigned back through the setter.
 */
export function setFeature(
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

/** Count of enabled flags across all groups — used for the panel header badge. */
export function countEnabledFeatures(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures | null,
): number {
    if (!features) return 0;
    return BRIDGE_FEATURE_KEYS.reduce((n, key) => (features[key] === true ? n + 1 : n), 0);
}

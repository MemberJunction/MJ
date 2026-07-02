import {
    MJAIRemoteBrowserProviderEntity,
    MJAIRemoteBrowserProviderEntity_IRemoteBrowserProviderFeatures,
} from '@memberjunction/core-entities';

/**
 * Strongly-typed shape of a remote-browser backend's `SupportedFeatures` JSON.
 *
 * This is an **alias** of the CodeGen-generated
 * `MJAIRemoteBrowserProviderEntity_IRemoteBrowserProviderFeatures` (emitted from the
 * `IRemoteBrowserProviderFeatures` JSONType interface bound to the
 * `MJ: AI Remote Browser Providers.SupportedFeatures` column). It is re-exported here under the
 * short source-interface name so channel/engine/driver code can refer to
 * `IRemoteBrowserProviderFeatures` without importing the verbose generated name.
 *
 * Per repo convention we do not re-export TYPES from other packages as a dependency chain — this is a
 * documented type alias of a generated entity shape for ergonomics, and the canonical source remains
 * `@memberjunction/core-entities`.
 *
 * The capability flags are *transport / control* concerns only — the universal CDP substrate
 * (`RawCdpControl`), an optional provider-native AI-control harness (`NativeAIControl`), viewing &
 * collaboration (`LiveView`, `HumanTakeover`, `ScreenStreaming`), and operational capabilities
 * (`Stealth`, `ProxyEgress`, `SessionRecording`, `PersistentContext`, `MultiTab`, `FileDownloads`,
 * `CaptchaSolving`). Every flag is optional; an omitted flag means the feature is **not** supported.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d / §4d-i.
 */
export type IRemoteBrowserProviderFeatures = MJAIRemoteBrowserProviderEntity_IRemoteBrowserProviderFeatures;

/**
 * The complete set of `IRemoteBrowserProviderFeatures` keys, as a readonly tuple.
 *
 * Useful for validators, diffing a driver's declared overrides against its provider metadata, and any
 * code that must iterate over every known capability flag. Typed as `ReadonlyArray<keyof
 * IRemoteBrowserProviderFeatures>` so the list stays in lock-step with the interface — adding a flag
 * to the interface surfaces a compile error here until the key is added.
 */
export const KNOWN_REMOTE_BROWSER_FEATURE_KEYS: ReadonlyArray<keyof IRemoteBrowserProviderFeatures> = [
    'RawCdpControl',
    'NativeAIControl',
    'LiveView',
    'HumanTakeover',
    'ScreenStreaming',
    'Stealth',
    'ProxyEgress',
    'SessionRecording',
    'PersistentContext',
    'MultiTab',
    'FileDownloads',
    'CaptchaSolving',
];

/**
 * Null-safely reads a provider's typed capability flags.
 *
 * Reads `provider.SupportedFeaturesObject` (the generated, lazily-parsed JSON accessor — never
 * `JSON.parse(provider.SupportedFeatures)`) and substitutes an empty feature set when the column is
 * NULL/omitted, so callers can dereference flags without a null guard. An empty set means every
 * capability reads as `undefined` (i.e. unsupported), which is the intended fail-closed default.
 *
 * @param provider The remote-browser provider metadata row.
 * @returns The provider's capability flags, or an empty object when none are declared.
 */
export function featuresOf(
    provider: MJAIRemoteBrowserProviderEntity,
): IRemoteBrowserProviderFeatures {
    return provider.SupportedFeaturesObject ?? {};
}

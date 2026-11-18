import type { LazyFeatureChunk } from '../services/lazy-module-registry';

// Category #1 (Angular lazy-loaded chunk): keep livekit-client and its
// resource wrappers out of the eager ExplorerCoreModule bundle until needed.
const loadLiveKitResourcesChunk: LazyFeatureChunk = {
  chunkId: '@memberjunction/ng-explorer-core/livekit-resources.module',
  load: () => import('./livekit-resources.module').then(() => {}),
};

/**
 * Lazy feature registry entries for the LiveKit-backed resource wrappers
 * severed from `ExplorerCoreModule`. Register alongside `LAZY_FEATURE_CONFIG`
 * in `LazyModuleRegistry.RegisterMany(...)`.
 */
export const LIVEKIT_LAZY_FEATURE_CONFIG: Record<string, LazyFeatureChunk> = {
  'BaseResourceComponent::HumanHandoffConsoleResource': loadLiveKitResourcesChunk,
  'BaseResourceComponent::LiveKitRoomResource': loadLiveKitResourcesChunk,
  'BaseResourceComponent::MeetingsResource': loadLiveKitResourcesChunk,
};

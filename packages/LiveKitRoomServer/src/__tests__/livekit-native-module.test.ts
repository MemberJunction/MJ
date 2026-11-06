import { describe, it, expect } from 'vitest';
import { DefaultNativeLoader, GetRegisteredNativeRoomModule } from '@memberjunction/ai-bridge-livekit';
import { DEFAULT_LIVEKIT_NATIVE_MODULE, ResolveLiveKitNativeModuleSpecifier } from '../livekit-native-module';
import { LiveKitAgentRoomCoordinator } from '../livekit-agent-room-coordinator';

describe('default native room module registration', () => {
  it('registers the statically imported native wrapper under the default specifier', () => {
    const registered = GetRegisteredNativeRoomModule(DEFAULT_LIVEKIT_NATIVE_MODULE);
    expect(typeof registered?.createRoomClient).toBe('function');
  });

  it('the bridge loader serves the default specifier from the registry (the path the coordinator hands the SDK)', async () => {
    const specifier = ResolveLiveKitNativeModuleSpecifier();
    expect(specifier).toBe(process.env.LIVEKIT_NATIVE_MODULE ?? DEFAULT_LIVEKIT_NATIVE_MODULE);
    if (specifier === DEFAULT_LIVEKIT_NATIVE_MODULE) {
      const mod = await DefaultNativeLoader(specifier);
      expect(mod).toBe(GetRegisteredNativeRoomModule(DEFAULT_LIVEKIT_NATIVE_MODULE));
    }
    // Importing the coordinator module loads the registration too.
    expect(LiveKitAgentRoomCoordinator.Instance).toBeDefined();
  });

  it('an override specifier that is not registered is not served by the registry', () => {
    expect(GetRegisteredNativeRoomModule('file:///custom/livekit-wrapper.js')).toBeUndefined();
  });
});

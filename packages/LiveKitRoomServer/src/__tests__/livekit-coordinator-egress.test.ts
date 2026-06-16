import { describe, it, expect } from 'vitest';
import { LiveKitAgentRoomCoordinator, LIVEKIT_BRIDGE_DRIVER_CLASS } from '../livekit-agent-room-coordinator';
import { LiveKitEgressService } from '../livekit-egress-service';
import { LiveKitTokenService } from '../livekit-token-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

describe('LiveKitAgentRoomCoordinator', () => {
  it('is a process-wide singleton', () => {
    expect(LiveKitAgentRoomCoordinator.Instance).toBe(LiveKitAgentRoomCoordinator.Instance);
  });

  it('exposes the expected LiveKit bridge driver class key', () => {
    expect(LIVEKIT_BRIDGE_DRIVER_CLASS).toBe('LiveKitBridge');
  });

  it('accepts a bound session factory and token service without throwing', () => {
    const coordinator = LiveKitAgentRoomCoordinator.Instance;
    expect(() => coordinator.SetTokenService(new LiveKitTokenService(CONFIG))).not.toThrow();
    expect(() =>
      coordinator.SetSessionFactory(async () => {
        // Stub IRealtimeSession — never actually invoked in this test.
        throw new Error('stub');
      }),
    ).not.toThrow();
  });
});

describe('LiveKitEgressService', () => {
  it('constructs from explicit config without network access', () => {
    expect(() => new LiveKitEgressService(CONFIG)).not.toThrow();
  });

  it('constructs from environment fallback without throwing', () => {
    expect(() => new LiveKitEgressService()).not.toThrow();
  });
});

import { InMemoryTransport, IN_MEMORY_TRANSPORT_CAPABILITIES } from '../memory/InMemoryTransport';
import { BuildSubscriptionBinding, BuildTopicBinding, ManualClock } from '../testing';
import { RunTransportConformanceSuite } from '../testing/vitest';

// A fresh clock per driver keeps the cases independent of their order.
let clock = new ManualClock();

RunTransportConformanceSuite('InMemoryTransport', {
    Capabilities: IN_MEMORY_TRANSPORT_CAPABILITIES,
    Traits: { ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 },
    CreateDriver: async () => {
        clock = new ManualClock();
        return new InMemoryTransport({ Now: () => clock.Now() });
    },
    CreateTopic: async (_driver, name, overrides) => BuildTopicBinding(name, overrides),
    CreateSubscription: async (_driver, topic, name, overrides) => BuildSubscriptionBinding(topic, name, overrides),
    AdvanceTime: async (ms) => clock.Advance(ms),
});

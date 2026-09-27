import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';
import { FakeServiceBusHarness } from '../testing/FakeServiceBusHarness';

RunTransportConformanceSuite('AzureTransportDriver on FakeServiceBus', new FakeServiceBusHarness());

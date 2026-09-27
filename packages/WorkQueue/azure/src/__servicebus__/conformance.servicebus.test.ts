import { describe, it } from 'vitest';
import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';
import { NAMESPACE_ENV_VAR, ServiceBusHarness } from './ServiceBusHarness';

const namespace = process.env[NAMESPACE_ENV_VAR];

if (namespace) {
    RunTransportConformanceSuite(`AzureTransportDriver on ${namespace}`, new ServiceBusHarness(namespace));
} else {
    describe('AzureTransportDriver on Service Bus', () => {
        it.skip(`skipped: set ${NAMESPACE_ENV_VAR} to a sandbox namespace (and sign in with an identity holding Data Owner on it)`, () => undefined);
    });
}

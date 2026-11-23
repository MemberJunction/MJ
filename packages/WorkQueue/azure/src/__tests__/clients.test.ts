import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TokenCredential } from '@azure/identity';
import { CreateServiceBusAdminClient } from '../gateway/adminClient';
import { CreateServiceBusClient } from '../gateway/serviceBusClient';

const GATEWAY_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'gateway');
const SAMPLE_CONN = 'Endpoint=sb://mj-wq-test.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=dGVzdGtleQ==';

describe('Azure Service Bus client factories', () => {
    it('creates data-plane and admin clients from connection string or TokenCredential', async () => {
        const config = { Namespace: 'mj-wq-test.servicebus.windows.net', Endpoint: null, UseEmulator: false };
        const sbFromConn = CreateServiceBusClient(config, { ConnectionString: SAMPLE_CONN });
        expect(sbFromConn.fullyQualifiedNamespace).toBe('mj-wq-test.servicebus.windows.net');
        await sbFromConn.close();

        const tokenCred: TokenCredential = {
            getToken: async () => ({ token: 'tok', expiresOnTimestamp: Date.now() + 60_000 }),
        };
        const sbFromCred = CreateServiceBusClient(config, tokenCred);
        expect(sbFromCred.fullyQualifiedNamespace).toBe('mj-wq-test.servicebus.windows.net');
        await sbFromCred.close();

        const adminFromConn = CreateServiceBusAdminClient(config, { ConnectionString: SAMPLE_CONN });
        expect(adminFromConn).toBeDefined();
        const adminFromCred = CreateServiceBusAdminClient(config, tokenCred);
        expect(adminFromCred).toBeDefined();
    });

    it('keeps serviceBusClient.ts free of ServiceBusAdministrationClient', () => {
        const text = readFileSync(join(GATEWAY_DIR, 'serviceBusClient.ts'), 'utf8');
        expect(text).not.toContain('ServiceBusAdministrationClient');
    });
});

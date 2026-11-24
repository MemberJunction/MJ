import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreatePubSubAdminClients } from '../gateway/adminClient';
import { BuildPubSubClientConfig, CreatePubSubDataClients } from '../gateway/pubSubClient';

const GATEWAY_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'gateway');

describe('GCP Pub/Sub client factories', () => {
    it('builds ClientConfig from ADC, ClientEmail+PrivateKey, KeyFilename, and CredentialsJson', async () => {
        const baseConfig = { ProjectId: 'mj-wq-test', ApiEndpoint: 'localhost:8085', UseEmulator: true };
        expect(BuildPubSubClientConfig(baseConfig)).toEqual({
            projectId: 'mj-wq-test',
            apiEndpoint: 'localhost:8085',
            emulatorMode: true,
        });

        expect(BuildPubSubClientConfig(baseConfig, {
            ClientEmail: 'svc@proj.iam.gserviceaccount.com',
            PrivateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
            ProjectId: 'override-proj',
        })).toMatchObject({
            projectId: 'override-proj',
            credentials: { client_email: 'svc@proj.iam.gserviceaccount.com' },
        });

        expect(BuildPubSubClientConfig(baseConfig, {
            CredentialsJson: JSON.stringify({
                client_email: 'json@proj.iam.gserviceaccount.com',
                private_key: 'pem-key',
                project_id: 'json-proj',
            }),
        })).toMatchObject({
            projectId: 'json-proj',
            credentials: { client_email: 'json@proj.iam.gserviceaccount.com', private_key: 'pem-key' },
        });

        const dataBundle = CreatePubSubDataClients(baseConfig);
        expect(dataBundle.ProjectId).toBe('mj-wq-test');
        await dataBundle.Close();

        const adminBundle = CreatePubSubAdminClients(baseConfig);
        expect(adminBundle.ProjectId).toBe('mj-wq-test');
        await adminBundle.Close();
    });

    it('keeps pubSubClient.ts free of admin gateway imports', () => {
        const text = readFileSync(join(GATEWAY_DIR, 'pubSubClient.ts'), 'utf8');
        expect(text).not.toContain('SdkPubSubAdminGateway');
        expect(text).not.toContain('adminClient');
    });
});

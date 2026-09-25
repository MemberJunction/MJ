import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateSqsClient } from '../gateway/sqsClient';
import { CreateSnsClient } from '../gateway/snsClient';

const GATEWAY_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'gateway');

describe('client factories', () => {
    it('configure the region with default endpoints', async () => {
        const config = { Region: 'eu-west-2', Endpoint: null };
        expect(await CreateSqsClient(config).config.region()).toBe('eu-west-2');
        expect(await CreateSnsClient(config).config.region()).toBe('eu-west-2');
        expect(CreateSqsClient(config).config.isCustomEndpoint).toBe(false);
    });

    it('apply a custom endpoint and static credentials (LocalStack)', async () => {
        const config = { Region: 'us-east-1', Endpoint: 'http://localhost:4566' };
        const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
        const sqs = CreateSqsClient(config, credentials);
        expect(sqs.config.isCustomEndpoint).toBe(true);
        expect(CreateSnsClient(config, credentials).config.isCustomEndpoint).toBe(true);
        expect((await sqs.config.credentials()).accessKeyId).toBe('test');
    });

    it('keeps the SQS factory free of the SNS client', () => {
        const text = readFileSync(join(GATEWAY_DIR, 'sqsClient.ts'), 'utf8');
        expect(text).not.toContain('client-sns');
    });
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { WorkContext, WorkJson, WorkLogger, WorkMessage } from '@memberjunction/work-queue-core';

export const TEST_USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001', Email: 'system@memberjunction.org' } as UserInfo;
export const TEST_PROVIDER = { Name: 'test-provider' } as unknown as IMetadataProvider;

export function MakeMessage(overrides: Partial<WorkMessage> = {}): WorkMessage {
    return {
        MessageID: 'BBBBBBBB-2222-4222-8222-000000000001',
        Topic: 'test.topic',
        Attributes: {},
        PublishedAt: '2026-09-16T12:00:00.000Z',
        ...overrides,
    };
}

export function MakeContext(overrides: Partial<WorkContext> = {}): WorkContext {
    return {
        SubscriptionName: 'test.subscription',
        DeliveryID: 'CCCCCCCC-3333-4333-8333-000000000001',
        Attempt: 1,
        MaxAttempts: 5,
        IsReplay: false,
        Signal: new AbortController().signal,
        Heartbeat: async () => true,
        Log: new SilentLogger(),
        ...overrides,
    };
}

/** Collects log lines instead of printing them. */
export class SilentLogger implements WorkLogger {
    public readonly Lines: string[] = [];

    public Info(message: string, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`info:${message}`);
    }

    public Warn(message: string, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`warn:${message}`);
    }

    public Error(message: string, error?: Error, _data?: Record<string, WorkJson>): void {
        this.Lines.push(`error:${message}${error ? `:${error.message}` : ''}`);
    }
}

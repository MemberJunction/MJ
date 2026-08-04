// type-graphql decorators (`@Field`, `@ObjectType`) call `Reflect.getMetadata`,
// which only exists once this polyfill is loaded. Vitest doesn't bring it in
// automatically — it MUST come before any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the PubSubManager singleton so PublishIntegrationProgress never touches a
// real PubSubEngine (no network, no resolver-build dependency).
const publishSpy = vi.fn();
vi.mock('../../generic/PubSubManager.js', () => ({
    PubSubManager: {
        Instance: {
            Publish: (...args: unknown[]) => publishSpy(...args),
        },
    },
}));

// Silence LogError so a deliberately-failing serialization test doesn't spam output.
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
}));

import {
    INTEGRATION_PROGRESS_TOPIC,
    IntegrationProgressTopicForKind,
    BuildIntegrationProgressNotification,
    MatchesIntegrationSubscription,
    PublishIntegrationProgress,
    type IntegrationProgressNotification,
    type PublishIntegrationProgressArgs,
} from '../IntegrationProgressResolver';

const baseArgs = (overrides: Partial<PublishIntegrationProgressArgs> = {}): PublishIntegrationProgressArgs => ({
    RunID: 'run-1',
    Kind: 'SyncRun',
    EventType: 'stage.start',
    Seq: 1,
    CompanyIntegrationID: 'ci-1',
    Message: 'starting',
    Stage: 'extract',
    Level: 'info',
    Data: { foo: 'bar' },
    ...overrides,
});

const baseNotification = (overrides: Partial<IntegrationProgressNotification> = {}): IntegrationProgressNotification => ({
    RunID: 'run-1',
    CompanyIntegrationID: 'ci-1',
    Kind: 'SyncRun',
    Topic: 'Sync',
    EventType: 'stage.start',
    Seq: 1,
    Message: 'starting',
    Stage: 'extract',
    Level: 'info',
    DataJSON: '{"foo":"bar"}',
    ...overrides,
});

describe('IntegrationProgressTopicForKind', () => {
    it('maps each run kind to its logical channel', () => {
        expect(IntegrationProgressTopicForKind('Discovery')).toBe('MetadataRefresh');
        expect(IntegrationProgressTopicForKind('Enrichment')).toBe('MetadataRefresh');
        expect(IntegrationProgressTopicForKind('ConnectorCreation')).toBe('ConnectorCreation');
        expect(IntegrationProgressTopicForKind('SyncRun')).toBe('Sync');
        expect(IntegrationProgressTopicForKind('RSU')).toBe('RSU');
        expect(IntegrationProgressTopicForKind('TableCreation')).toBe('RSU');
    });

    it('returns undefined for kinds without a dedicated channel', () => {
        expect(IntegrationProgressTopicForKind('Other')).toBeUndefined();
    });
});

describe('BuildIntegrationProgressNotification', () => {
    it('builds the full notification shape with derived topic and serialized data', () => {
        const n = BuildIntegrationProgressNotification(baseArgs());
        expect(n).toEqual(baseNotification());
    });

    it('derives ConnectorCreation topic from ConnectorCreation kind', () => {
        const n = BuildIntegrationProgressNotification(baseArgs({ Kind: 'ConnectorCreation' }));
        expect(n.Kind).toBe('ConnectorCreation');
        expect(n.Topic).toBe('ConnectorCreation');
    });

    it('leaves DataJSON undefined when no data is supplied', () => {
        const n = BuildIntegrationProgressNotification(baseArgs({ Data: undefined }));
        expect(n.DataJSON).toBeUndefined();
    });

    it('swallows un-serializable data and leaves DataJSON undefined', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        const n = BuildIntegrationProgressNotification(baseArgs({ Data: cyclic }));
        expect(n.DataJSON).toBeUndefined();
        // The rest of the payload is unaffected.
        expect(n.RunID).toBe('run-1');
        expect(n.Topic).toBe('Sync');
    });

    it('omits Topic for an Other-kind run', () => {
        const n = BuildIntegrationProgressNotification(baseArgs({ Kind: 'Other' }));
        expect(n.Topic).toBeUndefined();
    });
});

describe('MatchesIntegrationSubscription', () => {
    it('matches everything when no args are supplied', () => {
        expect(MatchesIntegrationSubscription(baseNotification(), {})).toBe(true);
    });

    it('filters by runID', () => {
        const n = baseNotification();
        expect(MatchesIntegrationSubscription(n, { runID: 'run-1' })).toBe(true);
        expect(MatchesIntegrationSubscription(n, { runID: 'run-2' })).toBe(false);
    });

    it('filters by companyIntegrationID', () => {
        const n = baseNotification();
        expect(MatchesIntegrationSubscription(n, { companyIntegrationID: 'ci-1' })).toBe(true);
        expect(MatchesIntegrationSubscription(n, { companyIntegrationID: 'ci-2' })).toBe(false);
    });

    it('filters by topic', () => {
        const n = baseNotification({ Topic: 'Sync' });
        expect(MatchesIntegrationSubscription(n, { topic: 'Sync' })).toBe(true);
        expect(MatchesIntegrationSubscription(n, { topic: 'RSU' })).toBe(false);
    });

    it('requires all supplied filters to match', () => {
        const n = baseNotification();
        expect(MatchesIntegrationSubscription(n, { runID: 'run-1', topic: 'Sync', companyIntegrationID: 'ci-1' })).toBe(true);
        expect(MatchesIntegrationSubscription(n, { runID: 'run-1', topic: 'RSU' })).toBe(false);
    });
});

describe('PublishIntegrationProgress', () => {
    beforeEach(() => {
        publishSpy.mockClear();
    });

    it('publishes the built notification to the integration topic and returns it', () => {
        const result = PublishIntegrationProgress(baseArgs());

        expect(result).toEqual(baseNotification());
        expect(publishSpy).toHaveBeenCalledTimes(1);

        const [topic, payload] = publishSpy.mock.calls[0];
        expect(topic).toBe(INTEGRATION_PROGRESS_TOPIC);
        expect(payload).toEqual(baseNotification());
    });

    it('publishes a fresh object copy (not the internal notification reference)', () => {
        const result = PublishIntegrationProgress(baseArgs());
        const [, payload] = publishSpy.mock.calls[0];
        // Spread copy semantics: structurally equal but a distinct instance.
        expect(payload).not.toBe(result);
        expect(payload).toEqual(result);
    });

    it('returns undefined and does not throw when publishing fails', () => {
        publishSpy.mockImplementationOnce(() => {
            throw new Error('pubsub down');
        });
        const result = PublishIntegrationProgress(baseArgs());
        expect(result).toBeUndefined();
    });
});

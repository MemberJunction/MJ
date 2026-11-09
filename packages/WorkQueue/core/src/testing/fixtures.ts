import type { WorkJson, WorkMessage } from '../envelope';
import type { SubscriptionFilter } from '../filterTypes';
import { SUBSCRIPTION_POLICY_DEFAULTS } from '../policy';
import type { HostType, SubscriptionPolicy } from '../policy';
import type { PublishRequest } from '../publishing';
import type { SubscriptionBinding, TopicBinding } from '../transport';
import { BuildWorkMessage, MAX_ENVELOPE_BYTES } from '../validation';

export type SubscriptionBindingOverrides = Partial<Omit<SubscriptionPolicy, 'SubscriptionName' | 'TopicName'>> & {
    Filter?: SubscriptionFilter | null;
    HostType?: HostType;
    Config?: Record<string, WorkJson>;
};

export function BuildTopicBinding(name: string, overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: name,
        IsFifo: false,
        MaxPayloadBytes: MAX_ENVELOPE_BYTES,
        Config: {},
        ...overrides,
    };
}

export function BuildSubscriptionBinding(topic: TopicBinding, name: string, overrides: SubscriptionBindingOverrides = {}): SubscriptionBinding {
    const { Filter: filter, HostType: hostType, Config: config, ...policy } = overrides;
    return {
        Policy: {
            SubscriptionName: name,
            TopicName: topic.TopicName,
            ...SUBSCRIPTION_POLICY_DEFAULTS,
            ...policy,
        },
        Filter: filter ?? null,
        HostType: hostType ?? 'MJWorker',
        Config: config ?? {},
    };
}

export function BuildMessages(topic: TopicBinding, requests: PublishRequest[], publishedAt: Date = new Date()): WorkMessage[] {
    return requests.map((request) => BuildWorkMessage(topic.TopicName, request, publishedAt, () => crypto.randomUUID()));
}

/** A clock tests advance explicitly. Pass `clock.Now` as a transport's `Now` option. */
export class ManualClock {
    private current: number;

    public readonly Now = (): number => this.current;

    constructor(startMs: number = Date.UTC(2026, 0, 1)) {
        this.current = startMs;
    }

    public Advance(ms: number): void {
        this.current += ms;
    }
}

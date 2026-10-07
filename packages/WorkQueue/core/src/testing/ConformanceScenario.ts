import type { ITransportOperator } from '../operator';
import type { PublishRequest, PublishResult } from '../publishing';
import type { ITransportConsumer, ITransportDriver, ReceivedDelivery, SubscriptionBinding, TopicBinding } from '../transport';
import { Fail } from './assertions';
import type { ConformanceHarness } from './ConformanceHarness';
import { BuildMessages } from './fixtures';
import type { SubscriptionBindingOverrides } from './fixtures';

let nameCounter = 0;

function uniqueName(prefix: string): string {
    nameCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${nameCounter}`;
}

/** One driver, one topic and named subscriptions for a single conformance case. */
export class ConformanceScenario {
    private readonly subscriptions = new Map<string, SubscriptionBinding>();
    private readonly consumers = new Map<string, ITransportConsumer>();

    private constructor(
        private readonly harness: ConformanceHarness,
        public readonly Driver: ITransportDriver,
        public readonly Topic: TopicBinding,
    ) {}

    public static async Open(harness: ConformanceHarness, driver: ITransportDriver, topicOverrides: Partial<TopicBinding>): Promise<ConformanceScenario> {
        const topic = await harness.CreateTopic(driver, uniqueName('wqc-topic'), topicOverrides);
        return new ConformanceScenario(harness, driver, topic);
    }

    public get Operator(): ITransportOperator {
        return this.Driver.Operator();
    }

    public async AddSubscription(key: string, overrides: SubscriptionBindingOverrides): Promise<void> {
        this.subscriptions.set(key, await this.harness.CreateSubscription(this.Driver, this.Topic, uniqueName(`wqc-${key}`), overrides));
    }

    public Subscription(key: string): SubscriptionBinding {
        return this.subscriptions.get(key) ?? Fail(`Scenario has no subscription '${key}'`);
    }

    public Consumer(key: string): ITransportConsumer {
        const existing = this.consumers.get(key);
        if (existing !== undefined) {
            return existing;
        }
        const created = this.Driver.OpenConsumer(this.Subscription(key));
        this.consumers.set(key, created);
        return created;
    }

    public Publish(requests: PublishRequest[]): Promise<PublishResult[]> {
        return this.Driver.Publish(this.Topic, BuildMessages(this.Topic, requests), [...this.subscriptions.values()]);
    }

    public Receive(key: string, max = 10): Promise<ReceivedDelivery[]> {
        return this.Consumer(key).Receive(max, this.harness.Traits.ReceiveWaitSeconds, new AbortController().signal);
    }

    public async DeadLetterID(key: string, messageID: string): Promise<string> {
        const page = await this.Operator.ListDeadLetters(this.Subscription(key), null, 100);
        const record = page?.Items.find((item) => item.Message.MessageID === messageID);
        return record?.DeliveryID ?? Fail(`No dead letter listed for message ${messageID}`);
    }

    public async Close(): Promise<void> {
        for (const consumer of this.consumers.values()) {
            await consumer.Close();
        }
    }
}

/** Opens a scenario, runs the case body, then always closes consumers and disposes the driver. */
export async function WithScenario(
    harness: ConformanceHarness,
    topicOverrides: Partial<TopicBinding>,
    subscriptions: [string, SubscriptionBindingOverrides][],
    body: (scenario: ConformanceScenario) => Promise<void>,
): Promise<void> {
    const driver = await harness.CreateDriver();
    let scenario: ConformanceScenario | null = null;
    try {
        scenario = await ConformanceScenario.Open(harness, driver, topicOverrides);
        for (const [key, overrides] of subscriptions) {
            await scenario.AddSubscription(key, overrides);
        }
        await body(scenario);
    } finally {
        if (scenario !== null) {
            await scenario.Close();
        }
        if (harness.Dispose !== undefined) {
            await harness.Dispose(driver);
        }
    }
}

/** Sorted values of each delivery's `n` attribute, the numbering every case publishes with. */
export function Numbers(deliveries: ReceivedDelivery[]): string[] {
    return deliveries.map((delivery) => delivery.Message.Attributes['n'] ?? '').sort();
}

export function Keyed(n: string, key = 'k'): PublishRequest {
    return { PartitionKey: key, Attributes: { n } };
}

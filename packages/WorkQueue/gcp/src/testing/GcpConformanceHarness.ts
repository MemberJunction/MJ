import type { ITransportDriver, SubscriptionBinding, TopicBinding } from '@memberjunction/work-queue-core';
import {
    BuildSubscriptionBinding,
    BuildTopicBinding,
    type ConformanceHarness,
    type ConformanceTraits,
    type SubscriptionBindingOverrides,
} from '@memberjunction/work-queue-core/testing';
import { ExpectedMaxDeliveryAttempts } from '../driver/bindingValidation';
import { GCP_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { GcpTransportDriver } from '../driver/GcpTransportDriver';
import { GcpPubSubFilterFor } from '../filterPolicy';
import { GcpResourceName } from '../names';
import { FakePubSubGateway } from './fakes';

/** Deterministic ConformanceHarness backed by FakePubSubGateway for running all shared WorkQueue conformance checks. */
export class GcpConformanceHarness implements ConformanceHarness {
    public readonly Capabilities = GCP_TRANSPORT_CAPABILITIES;
    public readonly Traits: ConformanceTraits = {
        ReleaseConsumesAttempt: true,
        ExpiredLeaseDeadLetters: false,
        ReceiveWaitSeconds: 0,
    };

    private readonly gateways = new WeakMap<ITransportDriver, FakePubSubGateway>();
    private currentGateway: FakePubSubGateway | null = null;

    public async CreateDriver(): Promise<ITransportDriver> {
        const fake = new FakePubSubGateway();
        const driver = new GcpTransportDriver(fake, fake, { Now: () => fake.Now, ProjectId: fake.ProjectId });
        this.gateways.set(driver, fake);
        return driver;
    }

    public async CreateTopic(driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> {
        const fake = this.gatewayFor(driver);
        const binding = BuildTopicBinding(name, overrides);
        const gcpTopicName = GcpResourceName('wqc', 'test', name, 'Topic');
        fake.AddTopic(gcpTopicName);
        return {
            ...binding,
            Config: {
                ProjectId: fake.ProjectId,
                TopicName: gcpTopicName,
            },
        };
    }

    public async CreateSubscription(
        driver: ITransportDriver,
        topic: TopicBinding,
        name: string,
        overrides: SubscriptionBindingOverrides = {},
    ): Promise<SubscriptionBinding> {
        const fake = this.gatewayFor(driver);
        const binding = BuildSubscriptionBinding(topic, name, overrides);
        const gcpTopicName = String(topic.Config['TopicName']);
        const gcpSubName = GcpResourceName('wqc', 'test', name, 'Subscription');
        const dlqTopicName = GcpResourceName('wqc', 'test', `${name}-${gcpSubName}`, 'DeadLetterTopic');
        const dlqSubName = GcpResourceName('wqc', 'test', `${name}-${gcpSubName}`, 'DeadLetterSubscription');

        fake.AddTopic(dlqTopicName);
        fake.AddSubscription(dlqTopicName, dlqSubName, {
            EnableMessageOrdering: topic.IsFifo,
            AckDeadlineSeconds: 60,
        });
        fake.AddSubscription(gcpTopicName, gcpSubName, {
            EnableMessageOrdering: topic.IsFifo,
            AckDeadlineSeconds: binding.Policy.LeaseSeconds,
            DeadLetterTopicName: dlqTopicName,
            MaxDeliveryAttempts: ExpectedMaxDeliveryAttempts(binding.Policy),
            Filter: GcpPubSubFilterFor(binding.Filter),
            FilterObject: binding.Filter,
        });

        return {
            ...binding,
            Config: {
                ProjectId: fake.ProjectId,
                TopicName: gcpTopicName,
                SubscriptionName: gcpSubName,
                DeadLetterTopicName: dlqTopicName,
                DeadLetterSubscriptionName: dlqSubName,
                EnableMessageOrdering: topic.IsFifo,
                AckDeadlineSeconds: binding.Policy.LeaseSeconds,
            },
        };
    }

    public async AdvanceTime(ms: number): Promise<void> {
        this.currentGateway?.Advance(ms / 1000);
    }

    public async Dispose(driver: ITransportDriver): Promise<void> {
        await (driver as GcpTransportDriver).Close();
    }

    private gatewayFor(driver: ITransportDriver): FakePubSubGateway {
        const gw = this.gateways.get(driver);
        if (!gw) {
            throw new Error('Driver was not created by GcpConformanceHarness');
        }
        this.currentGateway = gw;
        return gw;
    }
}

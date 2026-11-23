import type { ITransportDriver, SubscriptionBinding, TopicBinding } from '@memberjunction/work-queue-core';
import {
    BuildSubscriptionBinding,
    BuildTopicBinding,
    type ConformanceHarness,
    type ConformanceTraits,
    type SubscriptionBindingOverrides,
} from '@memberjunction/work-queue-core/testing';
import { ExpectedMaxDeliveryCount } from '../driver/bindingValidation';
import { AzureTransportDriver } from '../driver/AzureTransportDriver';
import { AZURE_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { AzureSqlFilterFor } from '../filterPolicy';
import { AzureResourceName } from '../names';
import { FakeServiceBusGateway } from './fakes';

/** Deterministic ConformanceHarness backed by FakeServiceBusGateway for running all shared WorkQueue conformance checks. */
export class AzureConformanceHarness implements ConformanceHarness {
    public readonly Capabilities = AZURE_TRANSPORT_CAPABILITIES;
    public readonly Traits: ConformanceTraits = {
        ReleaseConsumesAttempt: true,
        ExpiredLeaseDeadLetters: false,
        ReceiveWaitSeconds: 0,
    };

    private readonly gateways = new WeakMap<ITransportDriver, FakeServiceBusGateway>();

    public async CreateDriver(): Promise<ITransportDriver> {
        const fake = new FakeServiceBusGateway();
        const driver = new AzureTransportDriver(fake, fake, { Now: () => fake.Now });
        this.gateways.set(driver, fake);
        return driver;
    }

    public async CreateTopic(driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> {
        const fake = this.gatewayFor(driver);
        const binding = BuildTopicBinding(name, overrides);
        const sbTopicName = AzureResourceName('wqc', 'test', name, 'Topic');
        fake.AddTopic(sbTopicName);
        return { ...binding, Config: { ServiceBusTopicName: sbTopicName } };
    }

    public async CreateSubscription(
        driver: ITransportDriver,
        topic: TopicBinding,
        name: string,
        overrides: SubscriptionBindingOverrides = {},
    ): Promise<SubscriptionBinding> {
        const fake = this.gatewayFor(driver);
        const binding = BuildSubscriptionBinding(topic, name, overrides);
        const sbTopicName = String(topic.Config['ServiceBusTopicName']);
        const sbSubName = AzureResourceName('wqc', 'test', name, 'Subscription');
        fake.AddSubscription(sbTopicName, sbSubName, {
            RequiresSession: topic.IsFifo,
            MaxDeliveryCount: ExpectedMaxDeliveryCount(binding.Policy),
            LockDurationSeconds: binding.Policy.LeaseSeconds,
            SqlFilterExpression: AzureSqlFilterFor(binding.Filter) ?? '1=1',
            Filter: binding.Filter,
        });
        return {
            ...binding,
            Config: {
                Namespace: fake.Namespace,
                ServiceBusTopicName: sbTopicName,
                SubscriptionName: sbSubName,
                RequiresSession: topic.IsFifo,
                LockDurationSeconds: binding.Policy.LeaseSeconds,
            },
        };
    }

    public async AdvanceTime(ms: number): Promise<void> {
        this.currentGateway?.Advance(ms / 1000);
    }

    public async Dispose(driver: ITransportDriver): Promise<void> {
        await (driver as AzureTransportDriver).Close();
    }

    private currentGateway: FakeServiceBusGateway | null = null;

    private gatewayFor(driver: ITransportDriver): FakeServiceBusGateway {
        const gw = this.gateways.get(driver);
        if (!gw) {
            throw new Error('Driver was not created by AzureConformanceHarness');
        }
        this.currentGateway = gw;
        return gw;
    }
}

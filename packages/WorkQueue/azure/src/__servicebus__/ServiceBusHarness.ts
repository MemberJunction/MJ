import { DefaultAzureCredential } from '@azure/identity';
import { ServiceBusAdministrationClient } from '@azure/service-bus';
import type { ITransportDriver, SubscriptionBinding, TopicBinding } from '@memberjunction/work-queue-core';
import { BuildSubscriptionBinding, BuildTopicBinding, type ConformanceHarness, type ConformanceTraits, type SubscriptionBindingOverrides } from '@memberjunction/work-queue-core/testing';
import { ExpectedMaxDeliveryCount } from '../driver/bindingValidation';
import { AZURE_TRANSPORT_CAPABILITIES } from '../driver/capabilities';
import { AzureTransportDriver } from '../driver/AzureTransportDriver';
import { ServiceBusRuleSqlFor, SERVICE_BUS_RULE_NAME } from '../filterSql';
import { SdkServiceBusGateway } from '../gateway/SdkServiceBusGateway';
import { IsoDuration } from '../gateway/ServiceBusAdminGateway';
import { AzureEntityName } from '../names';

/** Fully qualified namespace of a sandbox Service Bus namespace (Standard tier or above); the run is skipped without it. */
export const NAMESPACE_ENV_VAR = 'AZURE_SERVICEBUS_NAMESPACE';

interface Created {
    Topics: string[];
}

/**
 * Runs core's conformance cases against a real namespace with DefaultAzureCredential (the identity needs Azure
 * Service Bus Data Owner on the namespace: it creates and deletes topics). Every topic name starts with `wqc-sb-`.
 */
export class ServiceBusHarness implements ConformanceHarness {
    public readonly Capabilities = AZURE_TRANSPORT_CAPABILITIES;
    public readonly Traits: ConformanceTraits = { ReleaseConsumesAttempt: true, ExpiredLeaseDeadLetters: false, ReceiveWaitSeconds: 5 };
    private readonly credential = new DefaultAzureCredential();
    private readonly admin: ServiceBusAdministrationClient;
    private readonly created = new WeakMap<ITransportDriver, Created>();

    constructor(public readonly FullyQualifiedNamespace: string) {
        this.admin = new ServiceBusAdministrationClient(FullyQualifiedNamespace, this.credential);
    }

    public async CreateDriver(): Promise<ITransportDriver> {
        const driver = AzureTransportDriver.Create({ FullyQualifiedNamespace: this.FullyQualifiedNamespace }, this.credential);
        this.created.set(driver, { Topics: [] });
        return driver;
    }

    public async CreateTopic(driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> {
        const binding = BuildTopicBinding(name, overrides);
        const topicName = AzureEntityName('wqc', 'sb', name, 'Topic');
        await this.admin.createTopic(topicName, { supportOrdering: binding.IsFifo, requiresDuplicateDetection: true, duplicateDetectionHistoryTimeWindow: 'PT10M' });
        this.track(driver).Topics.push(topicName);
        return { ...binding, Config: { TopicName: topicName } };
    }

    public async CreateSubscription(_driver: ITransportDriver, topic: TopicBinding, name: string, overrides: SubscriptionBindingOverrides = {}): Promise<SubscriptionBinding> {
        const binding = BuildSubscriptionBinding(topic, name, overrides);
        const topicName = String(topic.Config['TopicName']);
        const subscriptionName = AzureEntityName('wqc', 'sb', name, 'Subscription');
        const requiresSession = binding.Policy.PartitionMode === 'Exclusive';
        await this.admin.createSubscription(topicName, subscriptionName, {
            requiresSession,
            lockDuration: IsoDuration(binding.Policy.LeaseSeconds),
            maxDeliveryCount: ExpectedMaxDeliveryCount(binding.Policy),
            deadLetteringOnMessageExpiration: true,
            defaultRuleOptions: { name: SERVICE_BUS_RULE_NAME, filter: { sqlExpression: ServiceBusRuleSqlFor(binding.Filter, name) } },
        });
        return { ...binding, Config: { FullyQualifiedNamespace: this.FullyQualifiedNamespace, TopicName: topicName, SubscriptionName: subscriptionName, RequiresSession: requiresSession } };
    }

    public async AdvanceTime(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    public async Dispose(driver: ITransportDriver): Promise<void> {
        if (driver instanceof AzureTransportDriver && driver.Bus instanceof SdkServiceBusGateway) {
            await driver.Bus.Close();
        }
        for (const topic of this.created.get(driver)?.Topics ?? []) {
            await this.admin.deleteTopic(topic).catch(() => undefined);
        }
    }

    private track(driver: ITransportDriver): Created {
        const created = this.created.get(driver);
        if (!created) {
            throw new Error('Driver was not created by this harness');
        }
        return created;
    }
}

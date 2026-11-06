import { randomUUID } from 'node:crypto';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { BaseSingleton, NormalizeUUID } from '@memberjunction/global';
import {
    BuildTopologyManifest, FindByID, PlanBindingImport, ResolveTopic, WorkQueueEngineBase, WorkQueueEntityNames,
} from '@memberjunction/work-queue-base';
import type { BindingUpdate } from '@memberjunction/work-queue-base';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type {
    BindingImport, BindingValidationIssue, FilterSupport, ITransportDriver, ITransportOperator, IWorkPublisher, PublishRequest,
    PublishResult, SubscriptionBinding, TopicBinding, TopologyManifest, TransportCapabilities, WorkJson,
} from '@memberjunction/work-queue-core';
import { DeduplicationLedger } from './dedup/DeduplicationLedger';
import { DriverCacheKey, ResolveDriverFactory } from './engine/driverResolution';
import { ListenerSet, PublishListenerSet } from './engine/PublishListenerSet';
import { MJWorkLogger } from './logging/MJWorkLogger';
import { WorkQueuePublishCoordinator } from './publish/WorkQueuePublishCoordinator';
import { ErrorText } from './sql/sqlExecution';
import { IsWorkQueueExecutorSource, IsWorkQueueTransactionalExecutor } from './sql/WorkQueueSqlExecutor';
import type { WorkQueueExecutorSource } from './sql/WorkQueueSqlExecutor';
import { DatabaseTransportDriver } from './transports/database/DatabaseTransportDriver';
import { LoadDatabaseTransportDriverFactory } from './transports/database/DatabaseTransportDriverFactory';
import type { DeadLetteredEvent, TransportDriverDeps } from './transports/TransportDriverDeps';
import { ManifestEnricherRegistry } from './topology/ManifestEnricherRegistry';

// The Database transport ships with the engine: its factory is registered whenever the engine module loads.
LoadDatabaseTransportDriverFactory();

export interface WorkQueuePublishOptions {
    ContextUser: UserInfo;
    /** When it satisfies WorkQueueTransactionalExecutor, the publish enlists in the caller's transaction (03 §11). */
    Provider?: IMetadataProvider;
    External?: boolean;
}

/** Autoscaler metric (03 §11). Cloud subscriptions answer Supported: false. */
export interface SubscriptionBacklogReport {
    Supported: boolean;
    Claimable: number;
    InFlight: number;
    Total: number;
    Capped: boolean;
}

interface CachedDriver {
    Key: string;
    Driver: Promise<ITransportDriver>;
}

/** Members a driver may add beyond the core contract; the Database driver has both (Task 9). */
interface ClosableDriver { Close(): Promise<void>; }
interface PrerequisiteChecker { CheckPrerequisites(): Promise<BindingValidationIssue[]>; }

function IsClosable(driver: ITransportDriver): driver is ITransportDriver & ClosableDriver {
    return 'Close' in driver && typeof driver.Close === 'function';
}

function ChecksPrerequisites(driver: ITransportDriver): driver is ITransportDriver & PrerequisiteChecker {
    return 'CheckPrerequisites' in driver && typeof driver.CheckPrerequisites === 'function';
}

/**
 * Server tier: the in-process publisher, driver registry and operator entry point (03 §11).
 *
 * 🚨 THIS CLASS IS A FACADE, NOT A SUBCLASS. Metadata lives in `WorkQueueEngineBase` (browser-safe, loaded once);
 * `BaseEngine<T>` is a singleton keyed on its own type, so a server subclass would give a second cache of the same
 * three entities — the same reason `AIEngine` composes `AIEngineBase`. The proxy list below is CLOSED — it is the
 * list 03 §11 publishes. Reach anything else as `engine.Metadata.Member(…)`.
 *
 * Not an IStartupSink and not registered for startup: MJServer configures it explicitly when the `workQueue` section
 * is enabled (plan 06).
 */
export class WorkQueueEngine extends BaseSingleton<WorkQueueEngine> implements IWorkPublisher {
    public static get Instance(): WorkQueueEngine {
        return super.getInstance<WorkQueueEngine>();
    }

    private provider: IMetadataProvider | null = null;
    private readonly drivers = new Map<string, CachedDriver>();
    private readonly publishListeners = new PublishListenerSet();
    private readonly deadLetterListeners = new ListenerSet<DeadLetteredEvent>('dead-letter');
    private readonly log = new MJWorkLogger();
    private coordinator: WorkQueuePublishCoordinator | null = null;

    /** The metadata tier. Config() delegates to it. */
    public get Metadata(): WorkQueueEngineBase {
        return WorkQueueEngineBase.Instance;
    }

    /** Loads (or refreshes) the metadata tier and remembers the provider the server side runs against. */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (provider) {
            this.provider = provider;
        }
        await this.Metadata.Config(forceRefresh ?? false, contextUser, provider);
    }

    // ── Proxies: the COMPLETE list (03 §11). Each forwards to Metadata with the same signature. ──
    public get Transports(): MJWorkQueueTransportEntity[] { return this.Metadata.Transports; }
    public get Topics(): MJWorkQueueTopicEntity[] { return this.Metadata.Topics; }
    public get Subscriptions(): MJWorkQueueSubscriptionEntity[] { return this.Metadata.Subscriptions; }
    public GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined { return this.Metadata.GetTopicByName(name); }
    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined { return this.Metadata.GetSubscriptionByName(name); }
    public SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[] { return this.Metadata.SubscriptionsForTopic(topicID); }
    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding { return this.Metadata.BuildTopicBinding(topic); }
    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity, support?: FilterSupport): SubscriptionBinding {
        return this.Metadata.BuildSubscriptionBinding(subscription, support);
    }

    // ── Server-only ──

    /** ONE cached instance per transport, however it is reached. A changed transport builds a new driver and closes the old one. */
    public async GetDriver(transportID: string): Promise<ITransportDriver> {
        const transport = FindByID(this.Transports, transportID);
        if (!transport) {
            throw new WorkQueueConfigurationError(`Work-queue transport ${transportID} does not exist`);
        }
        const cacheID = NormalizeUUID(transport.ID);
        const key = DriverCacheKey(transport);
        const cached = this.drivers.get(cacheID);
        if (cached && cached.Key === key) {
            return cached.Driver;
        }
        if (cached) {
            await this.evict(cacheID, cached);
        }
        const driver = ResolveDriverFactory(transport.DriverClass).Create(transport, this.driverDeps());
        this.drivers.set(cacheID, { Key: key, Driver: driver });
        driver.catch(() => this.drivers.delete(cacheID));
        return driver;
    }

    public async GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator> {
        const topic = this.Metadata.TopicOf(subscription);
        if (!topic) {
            throw new WorkQueueConfigurationError(`Subscription '${subscription.Name}' references a topic that does not exist`);
        }
        return (await this.GetDriver(topic.TransportID)).Operator();
    }

    /** Topology rows + capability gating + driver ValidateBindings + database prerequisites (RCSI, 03 §6). */
    public async ValidateTopology(): Promise<BindingValidationIssue[]> {
        const issues: BindingValidationIssue[] = [];
        const capabilities: Record<string, TransportCapabilities> = {};
        const resolved = new Map<string, ITransportDriver>();
        for (const transport of this.Transports) {
            try {
                const driver = await this.GetDriver(transport.ID);
                capabilities[transport.DriverClass] = driver.Capabilities;
                resolved.set(NormalizeUUID(transport.ID), driver);
            } catch (error) {
                issues.push({ Severity: 'Error', Subject: transport.Name, Message: ErrorText(error) });
            }
        }
        issues.push(...this.Metadata.ValidateTopologyRows(capabilities));
        for (const driver of new Set(resolved.values())) {
            if (ChecksPrerequisites(driver)) {
                issues.push(...await driver.CheckPrerequisites());
            }
        }
        issues.push(...await this.validateBindings(resolved));
        return issues;
    }

    public PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]> {
        const provider = options.Provider;
        return this.coordinatorInstance().Publish(topic, requests, {
            UserID: options.ContextUser?.ID ?? null,
            External: options.External === true,
            CallerExecutor: provider && IsWorkQueueTransactionalExecutor(provider) ? provider : null,
        });
    }

    /** Publishes as the engine's system user. */
    public Publish<T extends WorkJson>(topic: string, requests: PublishRequest<T>[]): Promise<PublishResult[]> {
        return this.PublishAs(topic, requests, { ContextUser: this.systemUser });
    }

    /** Host Kick hook (plan 06); returns unsubscribe. */
    public OnPublished(listener: (topicName: string) => void): () => void {
        return this.publishListeners.Add(listener);
    }

    /**
     * Autoscaler metric (03 §11): claimable Pending (partition rules applied) + InFlight, each capped at 1000.
     * Cloud subscriptions answer `Supported: false` — scale those from the broker's own metrics.
     */
    public async GetBacklog(subscriptionName: string): Promise<SubscriptionBacklogReport> {
        const subscription = this.GetSubscriptionByName(subscriptionName);
        const topic = subscription && this.Metadata.TopicOf(subscription);
        if (!subscription || !topic) {
            throw new WorkQueueConfigurationError(`Work-queue subscription '${subscriptionName}' does not exist`);
        }
        const driver = await this.GetDriver(topic.TransportID);
        if (!(driver instanceof DatabaseTransportDriver)) {
            return { Supported: false, Claimable: 0, InFlight: 0, Total: 0, Capped: false };
        }
        const counts = await driver.GetBacklog(this.BuildSubscriptionBinding(subscription));
        return { Supported: true, ...counts, Total: counts.Claimable + counts.InFlight };
    }

    /** Public (F13): drivers call it through TransportDriverDeps, and plan 06's sweeper calls it directly. */
    public NotifyDeadLettered(event: DeadLetteredEvent): void {
        this.deadLetterListeners.Notify(event);
    }

    /** IN-PROCESS ONLY (03 §11): fires for dead letters produced by this process. Alert durably from subscription stats. */
    public OnDeadLettered(listener: (event: DeadLetteredEvent) => void): () => void {
        return this.deadLetterListeners.Add(listener);
    }

    public ExportManifest(transportName: string): TopologyManifest {
        return this.EnrichManifest(BuildTopologyManifest(this.Metadata.Snapshot, transportName, new Date()));
    }

    /** Saves each binding as the caller's user (validation, permissions, record changes apply), then re-reads metadata as the system user. */
    public async ImportBindings(bindings: BindingImport, contextUser: UserInfo): Promise<BindingValidationIssue[]> {
        const plan = PlanBindingImport(this.Metadata.Snapshot, bindings);
        const issues = [...plan.Issues];
        for (const update of plan.TopicUpdates) {
            issues.push(...await this.saveBinding(WorkQueueEntityNames.Topics, update, contextUser));
        }
        for (const update of plan.SubscriptionUpdates) {
            issues.push(...await this.saveBinding(WorkQueueEntityNames.Subscriptions, update, contextUser));
        }
        await this.Config(true, this.systemUser, this.providerInstance);
        issues.push(...await this.ValidateTopology());
        return issues;
    }

    /** Closes every cached driver and the publish coordinator, releasing their independent executors (F8). */
    public async Shutdown(): Promise<void> {
        const cached = [...this.drivers.entries()];
        this.drivers.clear();
        for (const [cacheID, entry] of cached) {
            await this.evict(cacheID, entry);
        }
        const coordinator = this.coordinator;
        this.coordinator = null;
        await coordinator?.Close();
    }

    /**
     * The single manifest post-processing step: the enricher registered for the manifest's DriverClass renders the
     * transport's artifacts (AWS: `DriverArtifacts.SnsFilterPolicy`, CD8). Database manifests pass through; a cloud
     * manifest whose engine entry was not imported is refused (03 §0, F12).
     */
    protected EnrichManifest(manifest: TopologyManifest): TopologyManifest {
        return ManifestEnricherRegistry.Instance.Apply(manifest);
    }

    /** The shared server provider. Used ONLY to mint independent executors and as PublishAs's default (03 §11). */
    protected get Executor(): WorkQueueExecutorSource {
        const provider = this.providerInstance;
        if (!IsWorkQueueExecutorSource(provider)) {
            throw new WorkQueueConfigurationError('WorkQueueEngine requires a server-side database provider (DatabaseProviderBase)');
        }
        return provider;
    }

    private get providerInstance(): IMetadataProvider {
        return this.provider ?? this.Metadata.ProviderToUse;
    }

    /** Server-side, BaseEngine.ContextUser is the MJ system user. */
    private get systemUser(): UserInfo {
        return this.Metadata.ContextUser;
    }

    private coordinatorInstance(): WorkQueuePublishCoordinator {
        this.coordinator ??= new WorkQueuePublishCoordinator({
            ResolveTopic: name => ResolveTopic(this.Metadata.Snapshot, name),
            GetDriver: transportID => this.GetDriver(transportID),
            Executor: this.Executor,
            // Ledger SQL runs as the system user; the publisher's identity travels as CoordinatorPublishOptions.UserID.
            CreateLedger: executor => new DeduplicationLedger(executor, this.systemUser),
            NewID: () => randomUUID(),
            Now: () => new Date(),
            NotifyPublished: name => this.publishListeners.Notify(name),
            Log: this.log,
        });
        return this.coordinator;
    }

    private driverDeps(): TransportDriverDeps {
        return {
            ContextUser: this.systemUser, Executor: this.Executor, Log: this.log,
            NotifyDeadLettered: event => this.NotifyDeadLettered(event),
        };
    }

    private async evict(cacheID: string, entry: CachedDriver): Promise<void> {
        this.drivers.delete(cacheID);
        try {
            const driver = await entry.Driver;
            if (IsClosable(driver)) {
                await driver.Close();
            }
        } catch (error) {
            this.log.Warn(`Closing the replaced work-queue driver failed: ${ErrorText(error)}`);
        }
    }

    private async validateBindings(resolved: Map<string, ITransportDriver>): Promise<BindingValidationIssue[]> {
        const issues: BindingValidationIssue[] = [];
        for (const topic of this.Topics.filter(t => t.Status === 'Active')) {
            const driver = resolved.get(NormalizeUUID(topic.TransportID));
            if (!driver) {
                continue;                                   // already reported as an unavailable driver
            }
            try {
                const subscriptions = this.SubscriptionsForTopic(topic.ID)
                    .filter(s => s.Status !== 'Disabled')
                    .map(s => this.BuildSubscriptionBinding(s, driver.Capabilities.Filters));
                issues.push(...await driver.ValidateBindings(this.BuildTopicBinding(topic), subscriptions));
            } catch {
                // Unparseable filter or binding JSON: ValidateTopologyRows has already named it.
            }
        }
        return issues;
    }

    private async saveBinding(entityName: string, update: BindingUpdate, contextUser: UserInfo): Promise<BindingValidationIssue[]> {
        const entity = entityName === WorkQueueEntityNames.Topics
            ? await this.providerInstance.GetEntityObject<MJWorkQueueTopicEntity>(entityName, contextUser)
            : await this.providerInstance.GetEntityObject<MJWorkQueueSubscriptionEntity>(entityName, contextUser);
        if (!(await entity.Load(update.ID))) {
            return [{ Severity: 'Error', Subject: update.Name, Message: `Could not load ${entityName} ${update.ID}` }];
        }
        entity.BindingConfig = update.BindingConfig;
        if (await entity.Save()) {
            return [];
        }
        return [{ Severity: 'Error', Subject: update.Name, Message: entity.LatestResult?.CompleteMessage ?? 'Save failed' }];
    }
}

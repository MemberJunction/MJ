import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { Outcome } from '@memberjunction/work-queue-core';
import type { WorkContext, WorkHandler, WorkMessage, WorkOutcome } from '@memberjunction/work-queue-core';
import type { BaseWorkHandler } from './BaseWorkHandler';

/**
 * Supplies the provider a delivery's handler uses. A host may mint one per delivery or share one. A source that mints
 * implements ReleaseProvider; the host calls it once the handler has settled, success or failure.
 */
export interface WorkQueueProviderSource {
    CreateProvider(): Promise<IMetadataProvider>;
    ReleaseProvider?(provider: IMetadataProvider): Promise<void>;
}

/** What IndependentProviderSource needs from the root provider; DatabaseProviderBase satisfies it. */
export interface IndependentInstanceRoot {
    CreateIndependentInstance(): Promise<IMetadataProvider>;
}

interface ReleasableProvider extends IMetadataProvider {
    ReleaseIndependentInstance(): Promise<void>;
}

function IsReleasable(provider: IMetadataProvider): provider is ReleasableProvider {
    return 'ReleaseIndependentInstance' in provider && typeof provider.ReleaseIndependentInstance === 'function';
}

/**
 * Mints an independent provider over the root's shared pool for every delivery, so concurrent handlers never share a
 * transaction scope, and drops that instance's transaction handle when the handler settles.
 */
export class IndependentProviderSource implements WorkQueueProviderSource {
    constructor(private readonly root: IndependentInstanceRoot) {}

    public async CreateProvider(): Promise<IMetadataProvider> {
        return this.root.CreateIndependentInstance();
    }

    public async ReleaseProvider(provider: IMetadataProvider): Promise<void> {
        if (IsReleasable(provider)) {
            await provider.ReleaseIndependentInstance();
        }
    }
}

/** Hands every delivery the same provider — tests, CLIs and hosts without a connection pool. */
export class SharedProviderSource implements WorkQueueProviderSource {
    constructor(private readonly provider: IMetadataProvider) {}

    public async CreateProvider(): Promise<IMetadataProvider> {
        return this.provider;
    }
}

export type WorkHandlerResolver = (handlerKey: string) => BaseWorkHandler | null;

/**
 * The WorkHandler a host gives ConsumerRuntime. For each delivery it resolves a fresh BaseWorkHandler, mints a
 * provider, binds the execution context and delegates. The host checks the key resolves before starting a runtime;
 * the dead-letter branch covers a registration removed while the host runs. A provider-source failure propagates,
 * which ConsumerRuntime treats as Retry (03 §3.2).
 */
export class BoundWorkHandler implements WorkHandler {
    constructor(
        private readonly handlerKey: string,
        private readonly contextUser: UserInfo,
        private readonly providers: WorkQueueProviderSource,
        private readonly resolve: WorkHandlerResolver,
    ) {}

    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        const handler = this.resolve(this.handlerKey);
        if (!handler) {
            return Outcome.DeadLetter('HandlerNotRegistered');
        }
        const provider = await this.providers.CreateProvider();
        try {
            handler.BindExecutionContext({ ContextUser: this.contextUser, Provider: provider });
            return await handler.Handle(message, context);
        } finally {
            await this.providers.ReleaseProvider?.(provider);
        }
    }
}

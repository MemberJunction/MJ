import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { WorkContext, WorkHandler, WorkJson, WorkMessage, WorkOutcome } from '@memberjunction/work-queue-core';

export interface WorkHandlerExecutionContext {
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/**
 * Base class for handlers hosted inside MJ (03 §3). Register with `@RegisterClass(BaseWorkHandler, '<HandlerKey>')`;
 * the host creates a new instance per delivery and binds the system user and a provider before calling Handle.
 *
 * Handlers must be idempotent: a delivery can run again after a crash between the work and the settle.
 * Use `this.Provider` and `this.ContextUser` for every data call — never `new Metadata()`.
 */
export abstract class BaseWorkHandler<TPayload extends WorkJson = WorkJson> implements WorkHandler<TPayload> {
    protected ContextUser!: UserInfo;
    protected Provider!: IMetadataProvider;

    public BindExecutionContext(ctx: WorkHandlerExecutionContext): void {
        this.ContextUser = ctx.ContextUser;
        this.Provider = ctx.Provider;
    }

    public abstract Handle(message: WorkMessage<TPayload>, context: WorkContext): Promise<WorkOutcome>;
}

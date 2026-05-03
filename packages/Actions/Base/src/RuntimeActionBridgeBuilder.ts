import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { BridgeHandlerMap } from '@memberjunction/code-execution';
import { MJActionEntity, MJActionEntity_IRuntimeActionConfiguration } from '@memberjunction/core-entities';

/**
 * Shared context passed to `RuntimeActionBridgeBuilder.BuildHandlers` at
 * the point ActionEngine decides to run a `Type='Runtime'` action. Everything
 * the builder needs to produce a per-execution handler map lives here.
 *
 * `config` has already been Zod-validated by ActionEngine before the builder
 * is asked to build handlers — implementations can trust the shape.
 */
export interface BridgeContext {
    /** The MJ Action record being executed. */
    action: MJActionEntity;
    /** Validated runtime configuration parsed from `Action.RuntimeActionConfiguration`. */
    config: MJActionEntity_IRuntimeActionConfiguration;
    /** The invoking user context — used for permission checks inside handlers. */
    contextUser: UserInfo;
    /** Optional cancellation signal propagated from the caller. */
    abortSignal?: AbortSignal;
    /**
     * Optional metadata provider to use for any data access performed inside bridge handlers.
     * When supplied, handlers must honor it (e.g. `const md = ctx.provider ?? new Metadata()`)
     * so that handler-side reads/writes participate in the caller's transaction. Falls back to
     * the default global provider when not supplied.
     */
    provider?: IMetadataProvider;
}

/**
 * Abstract contract for building the bridge handler map that
 * `CodeExecutionService` exposes to sandboxed Runtime-action code, plus the
 * JavaScript preamble injected at the top of the user code to define the
 * `utilities.*` namespace.
 *
 * ## Why this is abstract
 *
 * The concrete bridge needs to call into `@memberjunction/ai-agents`,
 * `@memberjunction/ai-prompts`, and `@memberjunction/aiengine` — packages
 * that already depend on `@memberjunction/actions`. Putting the concrete
 * implementation directly inside `@memberjunction/actions` creates a cycle.
 *
 * Instead, the actions package takes a runtime dependency on this abstract
 * via `ClassFactory.CreateInstance`, and a top-of-stack package
 * (`@memberjunction/action-runtime-host`) registers a concrete subclass via
 * `@RegisterClass`. External consumers can register their own subclass with
 * higher auto-priority to override the default bridge — for example, to add
 * custom namespaces, restrict the surface area, or swap in a mock for tests.
 *
 * If no subclass is registered, ActionEngine falls through to pure-compute
 * mode (no bridge available, user code sees only `input`/`output`) — a
 * graceful degradation, not an error.
 */
export abstract class RuntimeActionBridgeBuilder extends BaseSingleton<RuntimeActionBridgeBuilder> {
    protected constructor() {
        super();
    }

    // Intentionally no static `Instance` accessor — abstract classes can't
    // be constructed, and the consumer side (`@memberjunction/actions`)
    // resolves the concrete subclass via `ClassFactory.CreateInstance` so
    // that any `@RegisterClass`-registered override wins by priority.
    // Concrete subclasses are free to expose their own `Instance` accessor
    // if they're being used directly (bypassing the factory).

    /**
     * Build the per-execution handler map exposed to sandboxed user code via
     * `__bridgeCall(name, args)`. Each handler runs in the host process and
     * is responsible for its own authorization checks against `ctx.config`
     * (the permission allowlists in `RuntimeActionConfiguration.permissions`).
     */
    public abstract BuildHandlers(ctx: BridgeContext): BridgeHandlerMap;

    /**
     * Returns the JavaScript preamble that `ActionEngine` prepends to the
     * user's Runtime action code. The preamble defines the `utilities.*`
     * namespace object whose methods proxy through `__bridgeCall` to the
     * handlers returned by `BuildHandlers`. Preamble and handler map MUST
     * stay in sync — a `utilities.foo.bar(x)` call requires a
     * `'foo.bar'` handler to be registered.
     */
    public abstract GetPreamble(): string;
}

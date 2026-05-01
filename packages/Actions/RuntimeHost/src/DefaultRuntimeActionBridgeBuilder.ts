import { RegisterClass } from '@memberjunction/global';
import { RuntimeActionBridgeBuilder, BridgeContext } from '@memberjunction/actions-base';
import type { BridgeHandlerMap } from '@memberjunction/code-execution';
import { buildRuntimeActionBridgeHandlers, getRuntimeActionBridgePreamble } from './RuntimeActionBridge';

/**
 * Default concrete `RuntimeActionBridgeBuilder` — registered with no key so
 * any subclass registered later wins automatically via MJ's auto-priority
 * tiebreak. Consumers that want to customize the bridge (for example, to
 * add a new `utilities.*` namespace, tighten the default surface, or stub
 * everything out for tests) just need to register their own subclass:
 *
 * ```ts
 * @RegisterClass(RuntimeActionBridgeBuilder)
 * export class MyBridge extends RuntimeActionBridgeBuilder {
 *   public override BuildHandlers(ctx: BridgeContext): BridgeHandlerMap { ... }
 *   public override GetPreamble(): string { ... }
 * }
 * ```
 *
 * `@memberjunction/actions` calls `ClassFactory.CreateInstance(RuntimeActionBridgeBuilder)`
 * and invokes these two methods each time a Runtime action with a bridge
 * configuration runs. If nothing registers (e.g., this package isn't loaded),
 * ActionEngine falls through to pure-compute mode — a safe degradation.
 */
@RegisterClass(RuntimeActionBridgeBuilder, undefined, undefined, true)
export class DefaultRuntimeActionBridgeBuilder extends RuntimeActionBridgeBuilder {
    // The inherited constructor from `BaseSingleton` is `protected`; we
    // redeclare it here (still protected, still calling super()) so that
    // `getInstance`'s internal `new this()` call type-checks — abstract-to-
    // concrete promotion is what TypeScript was rejecting before.
    protected constructor() {
        super();
    }

    public static get Instance(): DefaultRuntimeActionBridgeBuilder {
        return super.getInstance<DefaultRuntimeActionBridgeBuilder>();
    }

    public BuildHandlers(ctx: BridgeContext): BridgeHandlerMap {
        return buildRuntimeActionBridgeHandlers(ctx);
    }

    public GetPreamble(): string {
        return getRuntimeActionBridgePreamble();
    }
}

/**
 * Invoke this from the consuming app's bootstrap path (or let the class
 * manifest generator find the `@RegisterClass` decorator for you) to ensure
 * the default bridge is registered before any Runtime action runs. Safe to
 * call multiple times — registration is idempotent at the MJGlobal level.
 */
export function LoadDefaultRuntimeActionBridgeBuilder(): void {
    // Referencing the class keeps tree-shakers from eliminating the
    // module-evaluation side effect (the @RegisterClass decorator call).
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    DefaultRuntimeActionBridgeBuilder;
}

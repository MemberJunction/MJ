import { CompositeKey } from '@memberjunction/core';
import { LogError } from '@memberjunction/core';

/**
 * How a widget asks its host to open a record.
 *
 * ## Why an adapter rather than an import
 *
 * A reusable widget sometimes needs an action only the HOST can perform — opening a record is the
 * canonical one. Importing `SharedService` or `NavigationService` to do it makes the widget an MJ
 * Explorer component: it can no longer be mounted in a standalone Angular app, a React host, or a
 * test. See `guides/UI_LAYERING_GUIDE.md` §3.
 *
 * Two ways out, and both are legitimate:
 *
 *   1. **An `@Output()` event** — the default. Best when the widget has a direct template host that
 *      can bind it.
 *   2. **This adapter** — for widgets mounted DYNAMICALLY through several layers of internal
 *      wrappers, where threading an output through every layer would be more coupling, not less.
 *
 * This mirrors the adapter pattern `@memberjunction/conversations-runtime` already uses for
 * notifications, active-task tracking and sessions: the runtime declares the interface, the host
 * registers an implementation once at bootstrap.
 *
 * ## Registration
 *
 * MJ Explorer registers automatically (`SharedService` does it on construction). A non-Explorer
 * host registers its own:
 *
 * ```typescript
 * RecordNavigationAdapter.Register({
 *     OpenEntityRecord: (entityName, key) => myRouter.go(`/records/${entityName}/${key.ToURLSegment()}`),
 * });
 * ```
 *
 * ## The default is loud on purpose
 *
 * With no adapter registered, `OpenEntityRecord` logs an error rather than silently doing nothing.
 * A drill-through that quietly stops working is the failure mode this whole layering effort exists
 * to prevent — so a host that forgets to register finds out.
 */
export interface IRecordNavigationAdapter {
    /** Open the given record on whatever surface the host considers appropriate. */
    OpenEntityRecord(entityName: string, recordKey: CompositeKey): void;
}

/** The registered adapter, or null before any host registers one. */
let registered: IRecordNavigationAdapter | null = null;

/**
 * Host-facing registration point for {@link IRecordNavigationAdapter}.
 *
 * Deliberately a plain module-level registry rather than an Angular DI token: widgets that use it
 * are often created dynamically outside an injector context, which is the situation that made a
 * simple `@Output()` insufficient in the first place.
 */
export class RecordNavigationAdapter {
    /** Register the host's implementation. The last registration wins. */
    public static Register(adapter: IRecordNavigationAdapter): void {
        registered = adapter;
    }

    /** Whether a host has registered. Lets a widget hide an affordance it cannot fulfil. */
    public static get IsRegistered(): boolean {
        return registered !== null;
    }

    /**
     * Ask the host to open a record. Logs an error when no host has registered — never throws,
     * because a missing drill-through must not take down the surface that offered it.
     */
    public static OpenEntityRecord(entityName: string, recordKey: CompositeKey): void {
        if (!registered) {
            LogError(
                `RecordNavigationAdapter: no host registered, so "${entityName}" could not be opened. ` +
                `The host application must call RecordNavigationAdapter.Register(...) at bootstrap.`,
            );
            return;
        }
        try {
            registered.OpenEntityRecord(entityName, recordKey);
        } catch (e) {
            LogError(`RecordNavigationAdapter.OpenEntityRecord failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Clear the registration. Test-support only. */
    public static Reset(): void {
        registered = null;
    }
}

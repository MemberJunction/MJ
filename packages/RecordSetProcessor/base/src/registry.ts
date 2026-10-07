/**
 * @fileoverview The **processor registry** — the open seam that lets external packages teach the
 * Record Set Processing substrate about new work types WITHOUT the base package depending on them.
 *
 * The engine's `RecordProcessExecutor.buildProcessor()` handles the built-in work types
 * (`FieldRules` / `Action` / `Agent` / `Infer`) directly, then consults this registry for any work
 * type its switch doesn't recognize before failing. A consumer package (e.g. Predictive Studio's
 * `'ML Model'` scoring) registers a factory keyed by its work-type string; the factory closes over
 * whatever injected dependencies that consumer needs (sidecars, loaders, etc.) and constructs its
 * `IRecordProcessor` from the per-run build context.
 *
 * @module @memberjunction/record-set-processor-base
 */

import { BaseSingleton } from '@memberjunction/global';
import { IProcessRunTracker } from './interfaces';
import { IRecordProcessor } from './interfaces';

/**
 * The per-run context handed to a registered factory. Carries the resolved Record Process fields the
 * factory needs to build its processor, plus the dry-run flag, WITHOUT coupling the base package to
 * the `MJRecordProcessEntity` type (the base package depends only on `@memberjunction/core` +
 * `@memberjunction/global`). The engine populates this from the loaded Record Process; the registered
 * factory reads `Configuration` / `InputMapping` to build itself.
 */
export interface RecordProcessorBuildContext {
    /** The work-type key being built (the registry lookup key). */
    WorkType: string;
    /** The Record Process's `Configuration` JSON string (work-type-specific config), if any. */
    Configuration?: string | null;
    /** The Record Process's `InputMapping` JSON string, if any. */
    InputMapping?: string | null;
    /** The Record Process's `OutputMapping` JSON string, if any (write-back targets). */
    OutputMapping?: string | null;
    /** The target entity id of the Record Process. */
    EntityID?: string;
    /** The Record Process id (lineage / diagnostics). */
    RecordProcessID?: string;
    /** The Record Process name (diagnostics). */
    RecordProcessName?: string;
    /** True when this is a dry-run (compute-only) pass — the factory should honor it when supported. */
    DryRun?: boolean;
    /**
     * The tracker this run will use, when the caller supplied one.
     *
     * Some processors are paired with a tracker: the processor reports progress and per-child
     * outcomes, and the tracker is what turns those into rows. A factory that needs the pairing
     * reads it here, so the pairing survives however the run was triggered. Absent when the caller
     * supplied no tracker and the engine will use its default.
     */
    Tracker?: IProcessRunTracker;
    /**
     * The loaded Record Process record itself, as an opaque object. The engine passes the real
     * `MJRecordProcessEntity`; a factory that needs fields beyond those projected above can read them
     * off this with its own typing. Typed as `unknown` so the base package stays free of
     * `@memberjunction/core-entities`.
     */
    RecordProcess?: unknown;
}

/**
 * Factory that builds an {@link IRecordProcessor} for a registered work type. Returning `null` (or
 * `undefined`) signals "not applicable" so the executor can continue (defensive — normally a factory
 * registered for a work type always builds for it). The factory may throw to surface a configuration
 * error (e.g. a missing required id), exactly as the built-in work types do.
 */
export type RecordProcessorFactory = (context: RecordProcessorBuildContext) => IRecordProcessor | null | undefined;

/**
 * Builds the tracker a work type's processor is paired with.
 *
 * Some processors only half-work without their tracker: they report live progress and per-child
 * outcomes, and the tracker is what turns those into rows. Registering the pairing here is what
 * makes it survive every trigger — a scheduled run and an on-change run reach the executor directly,
 * and neither has any way to know a particular work type wanted a particular tracker. Without this
 * the pairing could only be established by wrapping the executor, which works for exactly the one
 * caller that uses the wrapper and silently loses the rows for all the others.
 *
 * Returning `undefined` leaves the engine's default tracker in place.
 */
export type RecordProcessorTrackerFactory = (
    context: RecordProcessorBuildContext,
) => IProcessRunTracker | null | undefined;

/**
 * Process-wide registry of work-type → processor factory, used by the engine's `buildProcessor()` to
 * resolve work types beyond its built-ins. A {@link BaseSingleton} so there is exactly one instance
 * across the process even when a bundler duplicates the module (per CLAUDE.md rule 7).
 *
 * Work-type keys are matched case-insensitively (trimmed), so a consumer can register `'ML Model'`
 * and the executor resolves it whether the Record Process row stores `'ML Model'` or `'ml model'`.
 */
export class RecordProcessorRegistry extends BaseSingleton<RecordProcessorRegistry> {
    /** work-type (normalized) → factory. */
    private readonly factories = new Map<string, RecordProcessorFactory>();

    /** work-type (normalized) → the tracker its processor is paired with, when it has one. */
    private readonly trackerFactories = new Map<string, RecordProcessorTrackerFactory>();

    /** @internal — use {@link RecordProcessorRegistry.Instance}. */
    protected constructor() {
        super();
    }

    /** The single process-wide registry instance. */
    public static get Instance(): RecordProcessorRegistry {
        return super.getInstance<RecordProcessorRegistry>();
    }

    /** Normalize a work-type key for case/whitespace-insensitive matching. */
    private normalize(workType: string): string {
        return workType.trim().toLowerCase();
    }

    /**
     * Register a factory for a work-type key. A later registration for the same key overrides the
     * earlier one (last-wins), which lets a consumer replace a default.
     *
     * @param workType the work-type string (e.g. `'ML Model'`), matched case-insensitively
     * @param factory builds the processor for that work type from the per-run context
     */
    public Register(workType: string, factory: RecordProcessorFactory): void {
        if (!workType || !workType.trim()) {
            throw new Error('RecordProcessorRegistry.Register: workType must be a non-empty string');
        }
        this.factories.set(this.normalize(workType), factory);
    }

    /**
     * Register the tracker a work type's processor is paired with.
     *
     * Optional and independent of {@link Register}: a work type whose processor needs nothing beyond
     * the default tracker simply does not call this.
     */
    public RegisterTracker(workType: string, factory: RecordProcessorTrackerFactory): void {
        if (!workType || !workType.trim()) {
            throw new Error('RecordProcessorRegistry.RegisterTracker: workType must be a non-empty string');
        }
        this.trackerFactories.set(this.normalize(workType), factory);
    }

    /** The tracker registered for a work type, or undefined to use the engine's default. */
    public ResolveTracker(context: RecordProcessorBuildContext): IProcessRunTracker | undefined {
        const factory = this.trackerFactories.get(this.normalize(context.WorkType));
        return factory?.(context) ?? undefined;
    }

    /** Whether a factory is registered for the given work type (case-insensitive). */
    public Has(workType: string | null | undefined): boolean {
        return workType != null && this.factories.has(this.normalize(workType));
    }

    /**
     * Resolve and invoke the factory for a work type, returning the built processor or `null` when no
     * factory is registered (or the factory itself declined by returning null/undefined).
     *
     * @param context the per-run build context (work type + Record Process fields)
     */
    public Resolve(context: RecordProcessorBuildContext): IRecordProcessor | null {
        const factory = context.WorkType != null ? this.factories.get(this.normalize(context.WorkType)) : undefined;
        if (!factory) {
            return null;
        }
        return factory(context) ?? null;
    }

    /** The set of registered work-type keys (normalized). Primarily for diagnostics/tests. */
    public get RegisteredWorkTypes(): string[] {
        return Array.from(this.factories.keys());
    }

    /** Remove a registration (case-insensitive). Returns whether one was present. Primarily for tests. */
    public Unregister(workType: string): boolean {
        return this.factories.delete(this.normalize(workType));
    }
}

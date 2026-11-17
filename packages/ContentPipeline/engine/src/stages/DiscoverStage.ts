/**
 * @fileoverview {@link DiscoverStage} — finds what exists at a source, through the source type's
 * driver (`ContentSourceType.DriverClass`, an `AutotagBase` subclass).
 *
 * @module @memberjunction/content-pipeline
 */

import { createHash } from 'node:crypto';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { AutotagBase } from '@memberjunction/content-autotagging';
import {
    BasePipelineStage,
    DiscoveredItem,
    DiscoverWalkEnd,
    FatalStageError,
    Outcome,
    ResolveConfidence,
    ResolveTuning,
    StageContext,
    StageDeclaration,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { ContentSourceConfigurationResolver, ResolvedSourceConfiguration } from '../ContentSourceConfigurationResolver.js';

/** The registered name. */
export const DISCOVER_STAGE = 'Discover';

/** True when a run's configuration requests a full Sync reconciliation walk (`Mode: 'Sync'`). */
export function IsSyncMode(configuration: Readonly<Record<string, unknown>> | undefined): boolean {
    const optionsObj = configuration?.Options as Record<string, unknown> | undefined;
    return configuration?.Mode === 'Sync' || optionsObj?.Mode === 'Sync';
}

/**
 * Where an unfinished walk of a source stopped, kept on the source (`ContentSource.DiscoverState`, JSON) until
 * a walk finishes. A walk resumes only in the mode it was started in.
 */
export interface DiscoverState {
    /** The token the driver's `Discover` returned. */
    ResumeToken: string;
    /** When the first part of this walk started; `LastDiscoveredAt` takes it once the walk finishes. */
    WalkStartedAt: string;
    Mode: 'Discover' | 'Sync';
    /** Items found by the walk's earlier parts. */
    ItemsFound: number;
}

/** A source's saved walk state, or null when there is none or it does not parse. */
export function ParseDiscoverState(raw: string | null | undefined): DiscoverState | null {
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as Partial<DiscoverState>;
        if (typeof parsed.ResumeToken !== 'string' || parsed.ResumeToken.length === 0 || typeof parsed.WalkStartedAt !== 'string') {
            return null;
        }
        return {
            ResumeToken: parsed.ResumeToken,
            WalkStartedAt: parsed.WalkStartedAt,
            Mode: parsed.Mode === 'Sync' ? 'Sync' : 'Discover',
            ItemsFound: typeof parsed.ItemsFound === 'number' ? parsed.ItemsFound : 0,
        };
    } catch {
        return null;
    }
}

/** What one walk of a source came to. */
interface WalkResult {
    Found: number;
    /** Locators the driver reported gone. */
    Removed: string[];
    /** Set when the walk is not finished: where the next one carries on. */
    ResumeToken: string | null;
}

/** The source type's driver. Throws when the key is unregistered rather than handing back nothing. */
export function ResolveSourceDriver(driverClass: string): AutotagBase {
    const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<AutotagBase>(AutotagBase, driverClass);
    if (!result.Resolved || !result.Instance) {
        throw new FatalStageError(
            `Content Source Type driver '${driverClass}' is not registered. Check that the package registering it has been loaded.`,
        );
    }
    return result.Instance;
}

/** Walks a source through its driver's `Discover`, turning each item into a child Content Item record. */
@RegisterClass(BasePipelineStage, DISCOVER_STAGE)
export class DiscoverStage extends BasePipelineStage {
    public readonly Name = DISCOVER_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Source';
    public readonly StatusField: string | null = null;

    public override get Declaration(): StageDeclaration {
        return {
            Reads: [],
            // Everything it produces is a child record.
            Writes: [],
            ReadsExtensions: ['Pipeline.lastDiscoveredAt', 'Pipeline.discoverState'],
            WritesExtensions: [
                `${DISCOVER_STAGE}.itemCount`,
                `${DISCOVER_STAGE}.walkStartedAt`,
                `${DISCOVER_STAGE}.removed`,
                `${DISCOVER_STAGE}.incomplete`,
                `${DISCOVER_STAGE}.resumed`,
            ],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        const contentSourceID = record.Identity.RecordID;
        if (!contentSourceID) {
            throw new FatalStageError('Discover was handed a Content Source that has not been persisted');
        }
        const isSync = IsSyncMode(context.Configuration);
        const { resolved, driver, isPushOnly } = await this.resolveWalkSource(contentSourceID, isSync, context);
        if (isPushOnly) {
            const stampedAt = new Date();
            record.SetExtension(
                'Pipeline',
                'columns',
                isSync
                    ? { LastDiscoveredAt: stampedAt, LastSyncedAt: stampedAt }
                    : { ForceDiscovery: false, LastDiscoveredAt: stampedAt },
            );
            return Outcome.Skipped(
                `Driver '${resolved.DriverClass}' is push-only; ${isSync ? 'Sync' : 'Discover'} does not walk this source`,
            );
        }
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before discovery started');
        }
        const mode = isSync ? 'Sync' : 'Discover';
        const saved = ParseDiscoverState(record.GetExtension<string>('Pipeline', 'discoverState'));
        // A walk resumes only in the mode it started in; a walk of the other mode starts afresh and replaces it.
        const resuming = saved?.Mode === mode ? saved : null;
        const segmentStartedAt = new Date();
        const walkStartedAt = resuming ? new Date(resuming.WalkStartedAt) : segmentStartedAt;
        const tuning = ResolveTuning(resolved.TypeConfiguration, resolved.Configuration, resolved.Settings, context.Configuration);
        record.SetExtension(DISCOVER_STAGE, 'tuning', tuning);
        const lastDiscoveredAt = record.GetExtension<Date>('Pipeline', 'lastDiscoveredAt') ?? null;
        const since = isSync || !lastDiscoveredAt ? null : new Date(lastDiscoveredAt.getTime() - tuning.ClockSkewOverlapMs);
        const deadline = tuning.DiscoverWalkBudgetMs ? new Date(segmentStartedAt.getTime() + tuning.DiscoverWalkBudgetMs) : null;
        const walk = await this.walk(driver.Discover!.bind(driver), resolved, record, context, {
            Since: since,
            IsSync: isSync,
            ProgressEveryItems: tuning.ProgressEveryItems,
            ResumeToken: resuming?.ResumeToken ?? null,
            Deadline: deadline,
        });

        if (context.Signal.aborted) {
            context.ReportProgress(`stopped after ${walk.Found} item(s)`);
            return Outcome.Retry(`cancelled after finding ${walk.Found} item(s)`);
        }
        record.SetExtension(DISCOVER_STAGE, 'itemCount', walk.Found);
        record.SetExtension(DISCOVER_STAGE, 'walkStartedAt', walkStartedAt);
        record.SetExtension(DISCOVER_STAGE, 'removed', walk.Removed);
        record.SetExtension(DISCOVER_STAGE, 'resumed', resuming !== null);
        const removed = walk.Removed.length > 0 ? `, ${walk.Removed.length} reported gone` : '';
        if (walk.ResumeToken) {
            return this.continueLater(record, context, mode, walkStartedAt, (resuming?.ItemsFound ?? 0) + walk.Found, walk, removed);
        }
        context.ReportProgress(`found ${walk.Found} item(s)${removed}`);
        // Written only if every found item commits, so a walk that could not save its items stays due.
        // ForceDiscovery belongs to Discover and is never cleared by a Sync run.
        record.SetExtension(
            'Pipeline',
            'completionColumns',
            isSync
                ? { LastDiscoveredAt: walkStartedAt, LastSyncedAt: walkStartedAt }
                : { ForceDiscovery: false, LastDiscoveredAt: walkStartedAt },
        );
        if (saved) {
            record.SetExtension('Pipeline', 'completionClears', ['DiscoverState']);
        }
        const total = resuming ? ` (${resuming.ItemsFound + walk.Found} across the walk)` : '';
        return Outcome.Complete(`found ${walk.Found} item(s)${total}${removed}`);
    }

    /**
     * The walk is not finished. What was found commits as usual, and the source keeps where the walk stopped,
     * so the next run carries on from there. Nothing that marks the walk done is written: `LastDiscoveredAt`
     * stays (so the next part keeps this walk's `Since`) and `ForceDiscovery` stays set (so the source is
     * selected again).
     *
     * The new state is a completion column: it is saved only when every item this part found commits. A part
     * that could not save its items keeps the old state, so the next run walks that part again (child commits
     * are idempotent) instead of resuming past items that were never saved, and the removals the driver
     * reported in it are reported again.
     */
    private continueLater(
        record: WorkingRecord,
        context: StageContext,
        mode: DiscoverState['Mode'],
        walkStartedAt: Date,
        itemsFound: number,
        walk: WalkResult,
        removed: string,
    ): StageOutcome {
        const state: DiscoverState = { ResumeToken: walk.ResumeToken!, WalkStartedAt: walkStartedAt.toISOString(), Mode: mode, ItemsFound: itemsFound };
        record.SetExtension('Pipeline', 'completionColumns', {
            ...(record.GetExtension<Record<string, unknown>>('Pipeline', 'completionColumns') ?? {}),
            DiscoverState: JSON.stringify(state),
        });
        record.SetExtension(DISCOVER_STAGE, 'incomplete', true);
        context.ReportProgress(`found ${walk.Found} item(s)${removed}; the walk carries on next run`);
        return Outcome.Complete(`found ${walk.Found} item(s)${removed}; ${itemsFound} so far, the walk carries on next run`);
    }

    private async resolveWalkSource(
        contentSourceID: string,
        isSync: boolean,
        context: StageContext,
    ): Promise<{ resolved: ResolvedSourceConfiguration; driver: AutotagBase; isPushOnly: boolean }> {
        const resolver = new ContentSourceConfigurationResolver(context.Provider, context.ContextUser);
        const resolved = await resolver.Resolve(contentSourceID, context.ContextUser);
        if (!resolved.IsValid) {
            const detail = resolved.Problems.map((p) => p.Message).join('; ');
            throw new FatalStageError(`Content Source '${contentSourceID}' is not configured correctly: ${detail}`);
        }
        if (!resolved.DriverClass) {
            throw new FatalStageError("No Discover driver for this source. Set its Content Source Type's DriverClass.");
        }
        const driver = ResolveSourceDriver(resolved.DriverClass);
        if (driver.IsPushOnly === true) {
            return { resolved, driver, isPushOnly: true };
        }
        if (!driver.Discover) {
            throw new FatalStageError(`Driver '${resolved.DriverClass}' cannot discover: it has no Discover method`);
        }
        if (isSync && !driver.SupportsExhaustiveWalk) {
            throw new FatalStageError(
                `Driver '${resolved.DriverClass}' does not support exhaustive walks (SupportsExhaustiveWalk = false), so Sync mode cannot run against this source`,
            );
        }
        return { resolved, driver, isPushOnly: false };
    }

    /**
     * Walk the source, adding each item as a child. Children are linked to the source on commit by
     * `ContentSourceID` and matched to existing rows by URL. A locator the driver reports gone is collected,
     * not added. The driver's return value says whether the walk is finished.
     *
     * @returns What was found, including on a walk that stopped early.
     */
    private async walk(
        discover: NonNullable<AutotagBase['Discover']>,
        resolved: ResolvedSourceConfiguration,
        record: WorkingRecord,
        context: StageContext,
        options: { Since: Date | null; IsSync: boolean; ProgressEveryItems: number; ResumeToken: string | null; Deadline: Date | null },
    ): Promise<WalkResult> {
        const confidence = ResolveConfidence(resolved.Confidence, context.Configuration);
        const result: WalkResult = { Found: 0, Removed: [], ResumeToken: null };
        const iterator = discover({
            ContentSourceID: resolved.ContentSourceID,
            URL: resolved.URL,
            Parameters: resolved.Parameters,
            Configuration: resolved.Configuration,
            Access: await context.ResolveAccess(resolved.ContentSourceID),
            Since: options.Since,
            ResumeToken: options.ResumeToken,
            Deadline: options.Deadline,
            Confidence: confidence,
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            Signal: context.Signal,
            ReportProgress: (message: string) => context.ReportProgress(message),
        })[Symbol.asyncIterator]();
        for (;;) {
            const next = await iterator.next();
            if (next.done) {
                const end = next.value as DiscoverWalkEnd | void;
                result.ResumeToken = end && typeof end.ResumeToken === 'string' && end.ResumeToken.length > 0 ? end.ResumeToken : null;
                return result;
            }
            if (context.Signal.aborted) {
                await iterator.return?.();
                return result;
            }
            const item = next.value;
            if (item.Removed) {
                result.Removed.push(item.URL);
                continue;
            }
            record.AddChild(this.toWorkingRecord(item, `${DISCOVER_STAGE}.${resolved.DriverClass}`, options.IsSync, resolved.ContentSourceID));
            if (++result.Found % options.ProgressEveryItems === 0) {
                context.ReportProgress(`found ${result.Found} item(s)`);
            }
        }
    }

    /** A driver's item as a Content Item record; each field competes on the driver's own confidence. */
    private toWorkingRecord(item: DiscoveredItem, setBy: string, isSync: boolean, contentSourceID: string): WorkingRecord {
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', item.URL));
        child.SetExtension('Pipeline', 'contentSourceID', contentSourceID);
        if (item.Columns && Object.keys(item.Columns).length > 0) {
            child.SetExtension('Pipeline', 'customColumns', { ...item.Columns });
        }
        if (item.Request) {
            child.SetExtension('Pipeline', 'request', item.Request);
        }
        if (isSync) {
            child.SetExtension('Pipeline', 'syncWalk', true);
        }
        for (const field of item.Fields ?? []) {
            child.Propose(field.Field, field.Value, field.Confidence, setBy);
        }
        const inlineText = child.Get('Text');
        if (typeof inlineText === 'string' && inlineText.length > 0) {
            child.SetExtension('Pipeline', 'checksum', createHash('sha256').update(inlineText, 'utf8').digest('hex'));
        }
        for (const [key, value] of Object.entries(item.Extensions ?? {})) {
            child.SetExtension(setBy, key, value);
        }
        if (item.Complete) {
            child.MarkComplete();
        }
        return child;
    }
}


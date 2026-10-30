/**
 * @fileoverview {@link DiscoverStage} — finds what exists at a source, through the source type's
 * driver (`ContentSourceType.DriverClass`, an `AutotagBase` subclass).
 *
 * @module @memberjunction/content-pipeline
 */

import { createHash } from 'node:crypto';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { AutotagBase, AutotagUpload } from '@memberjunction/content-autotagging';
import {
    BasePipelineStage,
    DiscoveredItem,
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

void AutotagUpload;

/** The registered name. */
export const DISCOVER_STAGE = 'Discover';

/** True when a run's configuration requests a full Sync reconciliation walk (`Mode: 'Sync'`). */
export function IsSyncMode(configuration: Readonly<Record<string, unknown>> | undefined): boolean {
    const optionsObj = configuration?.Options as Record<string, unknown> | undefined;
    return configuration?.Mode === 'Sync' || optionsObj?.Mode === 'Sync';
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
            ReadsExtensions: ['Pipeline.lastDiscoveredAt'],
            WritesExtensions: [`${DISCOVER_STAGE}.itemCount`, `${DISCOVER_STAGE}.walkStartedAt`],
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
            return Outcome.Skipped(
                `Driver '${resolved.DriverClass}' is push-only; ${isSync ? 'Sync' : 'Discover'} does not walk this source`,
            );
        }
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before discovery started');
        }
        const walkStartedAt = new Date();
        const tuning = ResolveTuning(resolved.TypeConfiguration, resolved.Configuration, resolved.Settings, context.Configuration);
        record.SetExtension(DISCOVER_STAGE, 'tuning', tuning);
        const lastDiscoveredAt = record.GetExtension<Date>('Pipeline', 'lastDiscoveredAt') ?? null;
        const since = isSync || !lastDiscoveredAt ? null : new Date(lastDiscoveredAt.getTime() - tuning.ClockSkewOverlapMs);
        const found = await this.walk(driver.Discover!.bind(driver), resolved, record, context, since, isSync, tuning.ProgressEveryItems);

        if (context.Signal.aborted) {
            context.ReportProgress(`stopped after ${found} item(s)`);
            return Outcome.Retry(`cancelled after finding ${found} item(s)`);
        }
        context.ReportProgress(`found ${found} item(s)`);
        record.SetExtension(DISCOVER_STAGE, 'itemCount', found);
        record.SetExtension(DISCOVER_STAGE, 'walkStartedAt', walkStartedAt);
        // Written only if every found item commits, so a walk that could not save its items stays due.
        // ForceDiscovery belongs to Discover and is never cleared by a Sync run.
        record.SetExtension(
            'Pipeline',
            'completionColumns',
            isSync
                ? { LastDiscoveredAt: walkStartedAt, LastSyncedAt: walkStartedAt }
                : { ForceDiscovery: false, LastDiscoveredAt: walkStartedAt },
        );
        return Outcome.Complete(`found ${found} item(s)`);
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
        const isPushOnly =
            driver.IsPushOnly === true ||
            resolved.TypeConfiguration?.IsPushOnly === true ||
            resolved.Configuration?.IsPushOnly === true;
        if (isPushOnly) {
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
     * `ContentSourceID` and matched to existing rows by URL.
     *
     * @returns How many items were found, including on a walk that stopped early.
     */
    private async walk(
        discover: NonNullable<AutotagBase['Discover']>,
        resolved: ResolvedSourceConfiguration,
        record: WorkingRecord,
        context: StageContext,
        since: Date | null,
        isSync: boolean,
        progressEveryItems: number,
    ): Promise<number> {
        const confidence = ResolveConfidence(resolved.Confidence, context.Configuration);
        let found = 0;
        for await (const item of discover({
            ContentSourceID: resolved.ContentSourceID,
            URL: resolved.URL,
            Parameters: resolved.Parameters,
            Configuration: resolved.Configuration,
            Access: await context.ResolveAccess(resolved.ContentSourceID),
            Since: since,
            Confidence: confidence,
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            Signal: context.Signal,
            ReportProgress: (message: string) => context.ReportProgress(message),
        })) {
            if (context.Signal.aborted) {
                return found;
            }
            record.AddChild(this.toWorkingRecord(item, `${DISCOVER_STAGE}.${resolved.DriverClass}`, isSync, resolved.ContentSourceID));
            if (++found % progressEveryItems === 0) {
                context.ReportProgress(`found ${found} item(s)`);
            }
        }
        return found;
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


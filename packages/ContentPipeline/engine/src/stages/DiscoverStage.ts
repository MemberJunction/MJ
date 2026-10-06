/**
 * @fileoverview {@link DiscoverStage} — finds what exists at a source.
 *
 * Runs over Content Source. The only stage whose input needs no other stage's output, and the only
 * one whose records have no prior identity: its record is the *source*, and the items it produces
 * are the processor's to commit (live) or report (test).
 *
 * Walking a large source is the pipeline's longest-running unit of work, so this reports progress as
 * it goes and checks its stop signal between items.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BasePipelineStage,
    BaseDiscoverDriver,
    DiscoveredItem,
    FatalStageError,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
    ResolveTuning,
} from '@memberjunction/content-pipeline-base';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';

/** The registered name. */
export const DISCOVER_STAGE = 'Discover';

/**
 * Walks a source through its registered Discover driver, turning each found item into a child
 * working record.
 *
 * The driver yields items; this stage does the pipeline-shaped work around them — progress, the stop
 * signal, confidence-tagged field proposals, and the completion signal.
 */
@RegisterClass(BasePipelineStage, DISCOVER_STAGE)
export class DiscoverStage extends BasePipelineStage {
    public readonly Name = DISCOVER_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Source';
    public readonly StatusField = 'DiscoveryStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: [],
            // Writes nothing on the source itself; everything it produces is a child record.
            Writes: [],
            ReadsExtensions: [],
            WritesExtensions: [`${DISCOVER_STAGE}.itemCount`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        const contentSourceID = record.Identity.RecordID;
        if (!contentSourceID) {
            throw new FatalStageError('Discover was handed a Content Source that has not been persisted');
        }

        const resolver = new ContentSourceConfigurationResolver(context.Provider, context.ContextUser);
        const resolved = await resolver.Resolve(contentSourceID, context.ContextUser);
        if (!resolved.IsValid) {
            // A source that does not meet its type's declaration cannot be walked, and will not
            // start meeting it on a retry.
            const detail = resolved.Problems.map((p) => p.Message).join('; ');
            throw new FatalStageError(`Content Source '${contentSourceID}' is not configured correctly: ${detail}`);
        }

        const driver = this.resolveDriver(resolved.Settings, context, resolved.DriverClass);
        if (context.Signal.aborted) {
            // Already cancelled before the walk started: do not open the source at all.
            return Outcome.Retry('cancelled before discovery started');
        }
        const found = await this.walk(driver, record, resolved, contentSourceID, context);

        // A driver that honours the stop signal ends its walk by returning, which is
        // indistinguishable from having reached the end — so the signal, not the loop, is what says
        // whether this was a complete walk. Without this check a cancelled walk would commit
        // Complete and the source would never be revisited for what it did not reach.
        if (context.Signal.aborted) {
            context.ReportProgress(`stopped after ${found} item(s)`);
            return Outcome.Retry(`cancelled after finding ${found} item(s)`);
        }

        context.ReportProgress(`found ${found} item(s)`);
        record.SetExtension(DISCOVER_STAGE, 'itemCount', found);
        return Outcome.Complete(`found ${found} item(s)`);
    }

    /**
     * Walk the source, turning each yielded item into a **Content Item** working record.
     *
     * "Child" here is the in-memory relation on `WorkingRecord.Children` — a record produced by
     * working on this one — not a Content Item hierarchy. Discover's parent is a Content *Source*
     * and its children are Content *Items*, linked on commit by `ContentSourceID`, never `ParentID`.
     * (`ParentID` is for an artifact that expands into other items, which is Extract's business.)
     *
     * None of these items need exist beforehand: each carries only its URL as an ephemeral identity
     * until the committer either matches an existing row by that URL within the source, or creates
     * a new one.
     *
     * @returns How many items were found, including on a walk that stopped early.
     */
    private async walk(
        driver: BaseDiscoverDriver,
        record: WorkingRecord,
        resolved: { URL: string; Parameters: Readonly<Record<string, string>>; Configuration: Readonly<Record<string, unknown>> },
        contentSourceID: string,
        context: StageContext,
    ): Promise<number> {
        const { ProgressEveryItems } = ResolveTuning(context.Configuration);
        let found = 0;
        for await (const item of driver.Discover({
            ContentSourceID: contentSourceID,
            URL: resolved.URL,
            Parameters: resolved.Parameters,
            Configuration: resolved.Configuration,
            ContextUser: context.ContextUser,
            Provider: context.Provider,
            Signal: context.Signal,
            ReportProgress: (message: string) => context.ReportProgress(message),
        })) {
            if (context.Signal.aborted) {
                // What was found so far stays on the record; the caller reports the early stop.
                return found;
            }
            record.AddChild(this.toWorkingRecord(item, driver.Key));
            found++;
            if (found % ProgressEveryItems === 0) {
                context.ReportProgress(`found ${found} item(s)`);
            }
        }
        return found;
    }

    /**
     * Turn a driver's item into a Content Item working record.
     *
     * Each proposed field carries the driver's own confidence, so a later stage with a better
     * finding — Extract reading a title out of the document itself — wins on the merits rather than
     * by running later.
     */
    private toWorkingRecord(item: DiscoveredItem, driverKey: string): WorkingRecord {
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', item.URL));
        const setBy = `${DISCOVER_STAGE}.${driverKey}`;
        if (item.Checksum) {
            // Not a well-known field: nothing competes for it on confidence. It is the committer's
            // change signal, so it travels as a column the producing stage sets directly.
            child.SetExtension('Pipeline', 'columns', { Checksum: item.Checksum });
        }
        for (const field of item.Fields ?? []) {
            child.Propose(field.Field, field.Value, field.Confidence, setBy);
        }
        for (const [key, value] of Object.entries(item.Extensions ?? {})) {
            child.SetExtension(setBy, key, value);
        }
        if (item.Complete) {
            // The source handed back everything a use case needs — a structured API response with
            // full text attached has no reason to wait on Extract.
            child.MarkComplete();
        }
        return child;
    }

    /**
     * The source's Discover driver.
     *
     * `ContentSourceType.DriverClass` is the normal answer and needs no configuration — the column
     * exists and is seeded for every shipped source type, so a source with a type is discoverable as
     * it stands. `DiscoverDriverKey` stays as an override for a source that wants a different walk
     * than its type's default, and for a Record Process pinning one for a single run.
     */
    private resolveDriver(
        settings: Readonly<Record<string, unknown>>,
        context: StageContext,
        driverClass: string | null,
    ): BaseDiscoverDriver {
        const configured = settings.DiscoverDriverKey ?? context.Configuration.DiscoverDriverKey ?? driverClass;
        if (typeof configured !== 'string' || configured.length === 0) {
            throw new FatalStageError(
                "No Discover driver for this source. Set its Content Source Type's DriverClass, or " +
                    "DiscoverDriverKey in the source's type-specific configuration or the Record Process's Options.",
            );
        }
        const driver = BaseDiscoverDriver.Resolve(configured);
        if (!driver) {
            throw new FatalStageError(
                `Discover driver '${configured}' is not registered. Check that the package registering it has been loaded.`,
            );
        }
        return driver;
    }
}

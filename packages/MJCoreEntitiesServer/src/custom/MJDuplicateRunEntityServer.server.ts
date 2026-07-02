import { BaseEntity, DuplicateDetectionOptions, DuplicateDetectionProgress, IMetadataProvider, LogError, LogStatus, PotentialDuplicateRequest, RunView } from "@memberjunction/core";
import { RegisterClass, GetGlobalObjectStore } from "@memberjunction/global";
import { MJDuplicateRunEntity, MJEntityDocumentEntity } from "@memberjunction/core-entities";
import { DuplicateRecordDetector } from "@memberjunction/ai-vector-dupe";

const PIPELINE_PROGRESS_TOPIC = 'PIPELINE_PROGRESS';

/**
 * Key under which we stash the "detection in flight" set in the MJ global object
 * store. Using the global store (rather than a plain module-level variable) keeps
 * this a true process-singleton even if this module is bundled into more than one
 * execution path — matching the BaseSingleton rationale in the repo guidelines.
 */
const DETECTION_IN_FLIGHT_KEY = '___MJDuplicateRunDetectionInFlight';

/**
 * Returns the process-global set of Duplicate Run IDs that currently have a
 * detection pass in flight.
 *
 * WHY THIS EXISTS: {@link MJDuplicateRunEntityServer.runDetectionAsync} drives
 * `DuplicateRecordDetector.GetDuplicateRecords()`, which legitimately re-saves the
 * SAME run record many times mid-run (total-count update, per-batch resume cursor,
 * completion). Every one of those saves re-enters `Save()`, and while `EndedAt` is
 * still null each previously kicked off ANOTHER detection pass — an exponential
 * fan-out that produced thousands of duplicate Duplicate Run Detail rows and
 * eventually failed the run. Guarding on the run ID makes detection fire exactly
 * once per run.
 */
function detectionInFlightSet(): Set<string> {
    const store = GetGlobalObjectStore();
    if (!store[DETECTION_IN_FLIGHT_KEY]) {
        store[DETECTION_IN_FLIGHT_KEY] = new Set<string>();
    }
    return store[DETECTION_IN_FLIGHT_KEY] as Set<string>;
}

/** Map DuplicateDetectionProgress phases to pipeline stage names */
const PHASE_TO_STAGE: Record<DuplicateDetectionProgress['Phase'], string> = {
    'Loading': 'extract',
    'Vectorizing': 'vectorize',
    'Embedding': 'autotag',
    'Querying': 'extract',
    'Matching': 'autotag',
    'Merging': 'complete'
};

@RegisterClass(BaseEntity, 'MJ: Duplicate Runs')
export class MJDuplicateRunEntityServer extends MJDuplicateRunEntity {
    public async Save(): Promise<boolean> {
        const saveResult: boolean = await super.Save();

        // Only kick off detection on the INITIAL save of an unfinished run, and never
        // while a detection pass for this run is already in flight. The detector saves
        // this record repeatedly mid-run (progress + resume cursor) — without this guard
        // each of those saves would spawn another detection pass. See detectionInFlightSet().
        const inFlight = detectionInFlightSet();
        if (saveResult && this.EndedAt === null && !inFlight.has(this.ID)) {
            inFlight.add(this.ID);
            // Fire-and-forget: run detection asynchronously so the save returns immediately
            this.runDetectionAsync()
                .catch((error) => {
                    LogError(`Async duplicate detection failed for run ${this.ID}`, undefined, error);
                })
                .finally(() => {
                    inFlight.delete(this.ID);
                });
        }

        return saveResult;
    }

    /**
     * Run duplicate detection asynchronously. On failure, updates the run's
     * ProcessingStatus to 'Error' so the UI can surface the problem.
     */
    private async runDetectionAsync(): Promise<void> {
        const startTime = Date.now();
        try {
            // Thread this entity's provider (request-scoped — each MJAPI call binds its own
            // connection) down the detection stack instead of letting it fall back to the
            // process-global default provider.
            const provider = this.ProviderToUse as unknown as IMetadataProvider;
            const detector = new DuplicateRecordDetector(provider);
            const request = new PotentialDuplicateRequest();
            request.EntityID = this.EntityID;
            request.ListID = this.SourceListID || undefined; // Optional — if not set, scans all entity records

            // Find the first active entity document for this entity to get template/thresholds
            const rv = new RunView(this.RunViewProviderToUse);
            const edResult = await rv.RunView<MJEntityDocumentEntity>({
                EntityName: 'MJ: Entity Documents',
                ExtraFilter: `EntityID='${this.EntityID}' AND Status='Active'`,
                MaxRows: 1,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);
            if (edResult.Success && edResult.Results.length > 0) {
                request.EntityDocumentID = edResult.Results[0].ID;
            }

            // Build detection options with threshold normalization.
            // Entity document defaults are 1.0 (100%) which means nothing ever matches.
            // Normalize to sensible fallbacks when the stored value is effectively unconfigured.
            const potentialThreshold = this.normalizeThreshold(
                edResult.Success && edResult.Results.length > 0 ? edResult.Results[0].PotentialMatchThreshold : 1.0,
                0.70 // fallback: 70% for potential matches
            );
            const absoluteThreshold = this.normalizeThreshold(
                edResult.Success && edResult.Results.length > 0 ? edResult.Results[0].AbsoluteMatchThreshold : 1.0,
                0.95 // fallback: 95% for absolute matches
            );

            const detectionOptions: DuplicateDetectionOptions = {
                DuplicateRunID: this.ID,
                PotentialMatchThreshold: potentialThreshold,
                AbsoluteMatchThreshold: absoluteThreshold,
                OnProgress: (progress: DuplicateDetectionProgress) => {
                    this.publishProgress(progress, startTime);
                }
            };
            request.Options = detectionOptions;

            // Publish initial progress
            this.publishPipelineNotification('autotag', 0, 0, 0, startTime, 'Starting duplicate detection...');

            await detector.GetDuplicateRecords(request, this.ContextCurrentUser);
            LogStatus(`Duplicate detection completed for run ${this.ID}`);

            // Publish completion
            this.publishPipelineNotification('complete', 100, 100, 100, startTime);
        } catch (error) {
            LogError(`Duplicate detection error for run ${this.ID}`, undefined, error);

            // Publish error
            this.publishPipelineNotification('error', 0, 0, 0, startTime, String(error));

            // Update the run record to reflect the error
            try {
                this.ProcessingStatus = 'Failed';
                this.EndedAt = new Date();
                await super.Save();
            } catch (updateError) {
                LogError(`Failed to update run ${this.ID} after detection error`, undefined, updateError);
            }
        }
    }

    /**
     * Convert a DuplicateDetectionProgress callback into a PipelineProgress notification.
     */
    private publishProgress(progress: DuplicateDetectionProgress, startTime: number): void {
        const stage = PHASE_TO_STAGE[progress.Phase] ?? 'autotag';
        const pct = progress.TotalRecords > 0
            ? Math.round((progress.ProcessedRecords / progress.TotalRecords) * 100)
            : 0;

        this.publishPipelineNotification(
            stage,
            progress.TotalRecords,
            progress.ProcessedRecords,
            pct,
            startTime,
            progress.CurrentRecordID
        );
    }

    /**
     * Publish a pipeline progress notification via the global PubSubManager.
     * Uses GetGlobalObjectStore to access PubSubManager without a direct dependency
     * on @memberjunction/server.
     */
    /**
     * Normalize a threshold value — treat <= 0 or >= 1.0 as "unconfigured" and use the fallback.
     */
    private normalizeThreshold(value: number | null | undefined, fallback: number): number {
        if (value == null || value <= 0 || value >= 1.0) {
            return fallback;
        }
        return value;
    }

    private publishPipelineNotification(
        stage: string,
        totalItems: number,
        processedItems: number,
        percentComplete: number,
        startTime: number,
        currentItem?: string
    ): void {
        try {
            // Access PubSubManager through the global object store
            // PubSubManager is a BaseSingleton stored in the global registry
            const globalStore = GetGlobalObjectStore();
            const pubSubManager = globalStore['___SINGLETON__PubSubManager'];
            if (pubSubManager && typeof pubSubManager.Publish === 'function') {
                const elapsedMs = Date.now() - startTime;
                pubSubManager.Publish(PIPELINE_PROGRESS_TOPIC, {
                    PipelineRunID: this.ID,
                    Stage: stage,
                    TotalItems: totalItems,
                    ProcessedItems: processedItems,
                    CurrentItem: currentItem,
                    ElapsedMs: elapsedMs,
                    PercentComplete: percentComplete
                });
            }
        } catch (error) {
            // Don't let progress publishing errors break detection
            LogError(`Failed to publish pipeline progress for run ${this.ID}`, undefined, error);
        }
    }
}

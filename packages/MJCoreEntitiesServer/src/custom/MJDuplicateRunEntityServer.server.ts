import { BaseEntity, DuplicateDetectionOptions, DuplicateDetectionProgress, EntitySaveOptions, IMetadataProvider, LogError, LogStatus, PotentialDuplicateRequest, RunView } from "@memberjunction/core";
import { RegisterClass, GetGlobalObjectStore, EscapeSQLString, UUIDsEqual } from "@memberjunction/global";
import { MJDuplicateRunEntity, MJEntityDocumentEntity } from "@memberjunction/core-entities";
import { DuplicateRecordDetector } from "@memberjunction/ai-vector-dupe";

const PIPELINE_PROGRESS_TOPIC = 'PIPELINE_PROGRESS';

/** Entity Document Type name of documents built for duplicate detection. */
const RECORD_DUPLICATE_DOCUMENT_TYPE = 'Record Duplicate';

/**
 * Chooses the default entity document for a new duplicate run that was created without one, from
 * the entity's active documents ordered newest-updated first. A 'Record Duplicate' document wins
 * over any other type: an entity can also have a Search document (MJ ships one for several core
 * entities), whose template and vectors are built for search, not for matching records. Without a
 * 'Record Duplicate' document, the newest active document is used.
 *
 * Only callers that name no document get this default; the Duplicates tab always names the one
 * the user picked.
 *
 * @param activeDocuments the entity's active documents, newest `__mj_UpdatedAt` first
 * @returns the document to use, or null when there is none
 */
export function PickDuplicateDetectionDocument<T extends Pick<MJEntityDocumentEntity, 'Type'>>(activeDocuments: T[]): T | null {
    const recordDuplicate = activeDocuments.find(d => d.Type === RECORD_DUPLICATE_DOCUMENT_TYPE);
    return recordDuplicate ?? activeDocuments[0] ?? null;
}

/**
 * Checks that the entity document a run names belongs to the run's entity.
 *
 * @param entityDocument the run's document
 * @param entityID the run's EntityID
 * @returns why the document cannot be used, or null when it can
 */
export function CheckRunEntityDocument(
    entityDocument: Pick<MJEntityDocumentEntity, 'EntityID' | 'Name'>,
    entityID: string
): string | null {
    if (!UUIDsEqual(entityDocument.EntityID, entityID)) {
        return `Entity Document "${entityDocument.Name}" belongs to a different entity than this duplicate run`;
    }
    return null;
}

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
    'Embedding': 'extract',
    'Querying': 'extract',
    'Matching': 'autotag',
    'Merging': 'autotag'
};

@RegisterClass(BaseEntity, 'MJ: Duplicate Runs')
export class MJDuplicateRunEntityServer extends MJDuplicateRunEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // A run must name its entity document. Server-side callers that create a run without one
        // (GetRecordDuplicates, scripts) get the entity's default duplicate-detection document.
        if (!this.IsSaved && !this.EntityDocumentID) {
            const defaultDocument = await this.findDefaultEntityDocument();
            if (defaultDocument) {
                this.EntityDocumentID = defaultDocument.ID;
            }
        }

        const saveResult: boolean = await super.Save(options);

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
     * ProcessingStatus to 'Failed' with ProcessingErrorMessage so the UI can surface the problem.
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

            // The run's entity document supplies the template, vectors and thresholds.
            const entityDocument = await this.loadRunEntityDocument();
            request.EntityDocumentID = entityDocument.ID;

            // Build detection options with threshold normalization.
            // A threshold left at 1.0 (100%) matches nothing, so treat it as unconfigured and use
            // the fallback instead.
            const potentialThreshold = this.normalizeThreshold(
                entityDocument.PotentialMatchThreshold,
                0.70 // fallback: 70% for potential matches
            );
            const absoluteThreshold = this.normalizeThreshold(
                entityDocument.AbsoluteMatchThreshold,
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
            this.publishPipelineNotification('extract', 0, 0, 0, startTime, 'Starting duplicate detection...');

            const response = await detector.GetDuplicateRecords(request, this.ContextCurrentUser);
            if (response.Status === 'Error') {
                throw new Error(response.ErrorMessage || 'Duplicate detection failed');
            }
            LogStatus(`Duplicate detection completed for run ${this.ID}`);

            // Publish completion
            this.publishPipelineNotification('complete', 100, 100, 100, startTime);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            LogError(`Duplicate detection error for run ${this.ID}: ${errorMsg}`, undefined, error);

            // Publish error
            this.publishPipelineNotification('error', 0, 0, 0, startTime, errorMsg);

            // Update the run record to reflect the error
            try {
                await this.Load(this.ID);
                this.ProcessingStatus = 'Failed';
                this.ProcessingErrorMessage = errorMsg;
                this.EndedAt = new Date();
                await super.Save();
            } catch (updateError) {
                LogError(`Failed to update run ${this.ID} after detection error`, undefined, updateError);
            }
        }
    }

    /**
     * The entity's default duplicate-detection document (see {@link PickDuplicateDetectionDocument}),
     * or null when the entity has no active document.
     */
    private async findDefaultEntityDocument(): Promise<MJEntityDocumentEntity | null> {
        const rv = new RunView(this.RunViewProviderToUse);
        const result = await rv.RunView<MJEntityDocumentEntity>({
            EntityName: 'MJ: Entity Documents',
            ExtraFilter: `EntityID='${EscapeSQLString(this.EntityID)}' AND Status='Active'`,
            OrderBy: '__mj_UpdatedAt DESC',
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);
        if (!result.Success) {
            LogError(`Duplicate run: could not load entity documents for entity ${this.EntityID}: ${result.ErrorMessage}`);
            return null;
        }
        return PickDuplicateDetectionDocument(result.Results);
    }

    /**
     * Loads the entity document this run names. Throws when it is missing or belongs to another
     * entity, which fails the run with that message.
     */
    private async loadRunEntityDocument(): Promise<MJEntityDocumentEntity> {
        const rv = new RunView(this.RunViewProviderToUse);
        const result = await rv.RunView<MJEntityDocumentEntity>({
            EntityName: 'MJ: Entity Documents',
            ExtraFilter: `ID='${EscapeSQLString(this.EntityDocumentID)}'`,
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);
        if (!result.Success) {
            throw new Error(`Could not load Entity Document ${this.EntityDocumentID}: ${result.ErrorMessage}`);
        }
        const entityDocument = result.Results[0];
        if (!entityDocument) {
            throw new Error(`Entity Document ${this.EntityDocumentID} was not found`);
        }
        const problem = CheckRunEntityDocument(entityDocument, this.EntityID);
        if (problem) {
            throw new Error(problem);
        }
        return entityDocument;
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

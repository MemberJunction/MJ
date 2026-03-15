import { Injectable } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobTypeEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';

/**
 * Service for loading and caching scheduled job data.
 * Safe to call multiple times — caches job types after first load.
 */
@Injectable({ providedIn: 'root' })
export class ScheduledJobService {
    private _jobTypes: MJScheduledJobTypeEntity[] = [];
    private _jobTypesLoading: Promise<MJScheduledJobTypeEntity[]> | null = null;

    /** Cached list of all scheduled job types */
    public get JobTypes(): MJScheduledJobTypeEntity[] {
        return this._jobTypes;
    }

    /**
     * Load and cache all job types. Safe to call multiple times —
     * returns cached data after first successful load.
     */
    public async LoadJobTypes(): Promise<MJScheduledJobTypeEntity[]> {
        if (this._jobTypes.length > 0) {
            return this._jobTypes;
        }
        if (this._jobTypesLoading) {
            return this._jobTypesLoading;
        }

        this._jobTypesLoading = this.fetchJobTypes();
        try {
            this._jobTypes = await this._jobTypesLoading;
            return this._jobTypes;
        } finally {
            this._jobTypesLoading = null;
        }
    }

    /**
     * Load a single scheduled job by ID.
     * Returns null if not found or load fails.
     */
    public async LoadJob(jobID: string): Promise<MJScheduledJobEntity | null> {
        const md = new Metadata();
        const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');
        const loaded = await job.Load(jobID);
        return loaded ? job : null;
    }

    /**
     * Load recent runs for a given job, ordered by most recent first.
     */
    public async LoadJobRuns(jobID: string, maxRows: number = 10): Promise<MJScheduledJobRunEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJScheduledJobRunEntity>({
            EntityName: 'MJ: Scheduled Job Runs',
            ExtraFilter: `ScheduledJobID='${jobID}'`,
            OrderBy: 'StartedAt DESC',
            MaxRows: maxRows,
            ResultType: 'entity_object',
        });
        return result.Success ? result.Results : [];
    }

    /** Clear cached data so next LoadJobTypes call re-fetches */
    public ClearCache(): void {
        this._jobTypes = [];
        this._jobTypesLoading = null;
    }

    private async fetchJobTypes(): Promise<MJScheduledJobTypeEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJScheduledJobTypeEntity>({
            EntityName: 'MJ: Scheduled Job Types',
            ExtraFilter: '',
            OrderBy: 'Name',
            ResultType: 'entity_object',
        });
        return result.Success ? result.Results : [];
    }
}

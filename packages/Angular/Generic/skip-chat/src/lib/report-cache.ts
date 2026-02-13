import { IRunViewProvider, RunView } from "@memberjunction/core";
import { MJReportEntity } from "@memberjunction/core-entities";
import { BaseSingleton } from "@memberjunction/global";
import { BehaviorSubject, firstValueFrom, Observable, of, shareReplay, switchMap } from "rxjs";
import { CacheManager } from '@memberjunction/react-runtime';

/**
 * This is a very simple _cache that tracks all of the reports for conversations that are in the context of Skip. 
 * We update this whenever reports are created, deleted, or updated. This saves a lot of network traffic for 
 * conversations/conversation details.
 */
export class SkipConversationReportCache extends BaseSingleton<SkipConversationReportCache> {
    public static get Instance(): SkipConversationReportCache {
        return super.getInstance<SkipConversationReportCache>();
    }

    private _cache: CacheManager<MJReportEntity[]>;
    private _loadingObservables: { [conversationId: string]: Observable<MJReportEntity[]> } = {};

    constructor() {
        super();
        // Initialize cache with 100 conversations max, 10MB memory limit, and 10 minute TTL
        this._cache = new CacheManager<MJReportEntity[]>({
            maxSize: 100,
            maxMemory: 10 * 1024 * 1024, // 10MB
            defaultTTL: 10 * 60 * 1000,   // 10 minutes
            cleanupInterval: 60 * 1000    // 1 minute cleanup
        });
    }

    /**
     * Loads and caches reports for a given conversation. If the reports are already loaded, it will return the cached version unless forceRefresh is true.
     * @param conversationId 
     * @param provider 
     * @param forceRefresh 
     * @returns 
     */
    public GetConversationReports(
        conversationId: string,
        provider: IRunViewProvider | null = null,
        forceRefresh: boolean = false
    ): Promise<MJReportEntity[]> {
        // If forceRefresh, clear the cache and observable for the conversationId
        if (forceRefresh) {
            this._cache.delete(conversationId);
            delete this._loadingObservables[conversationId];
        }

        // If the data is already cached, return it immediately
        const cached = this._cache.get(conversationId);
        if (cached) {
            return Promise.resolve(cached);
        }

        // If an observable already exists for this conversationId, reuse it
        if (!this._loadingObservables[conversationId]) {
            this._loadingObservables[conversationId] = this.createLoadingObservable(conversationId, provider).pipe(
                shareReplay(1) // Share the result among all subscribers
            );
        }

        // Convert the observable to a promise
        return firstValueFrom(this._loadingObservables[conversationId]);
    }

    private createLoadingObservable(
        conversationId: string,
        provider: IRunViewProvider | null
    ): Observable<MJReportEntity[]> {
        return new Observable<MJReportEntity[]>(subscriber => {
            const rv = provider || RunView.Provider;
            rv.RunView<MJReportEntity>({
                EntityName: "MJ: Reports",
                ExtraFilter: `ConversationID = '${conversationId}'`,
                ResultType: 'entity_object'
            })
                .then(result => {
                    const reports = (result && result.Success && result.Results.length > 0) 
                        ? result.Results 
                        : [];
                    
                    // Cache with default TTL
                    this._cache.set(conversationId, reports);
                    
                    subscriber.next(reports); // Emit the result
                    subscriber.complete(); // Complete the observable
                })
                .catch(err => {
                    subscriber.error(err); // Emit an error if the call fails
                });
        });
    }

    public AddConversationReport(conversationId: string, report: MJReportEntity) {
        const reports = this._cache.get(conversationId) || [];
        reports.push(report);
        this._cache.set(conversationId, reports);
    }
    public RemoveConversationReport(conversationId: string, reportId: string) {
        const reports = this._cache.get(conversationId);
        if (reports) {
            const filtered = reports.filter(x => x.ID !== reportId);
            this._cache.set(conversationId, filtered);
        }
    }
    public UpdateConversationReport(conversationId: string, report: MJReportEntity) {
        const reports = this._cache.get(conversationId);
        if (reports) {
            const index = reports.findIndex(x => x.ID === report.ID);
            if (index >= 0) {
                reports[index] = report;
                this._cache.set(conversationId, reports);
            }
        }
    }
}
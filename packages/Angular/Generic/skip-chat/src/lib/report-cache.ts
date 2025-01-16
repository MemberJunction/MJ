import { IRunViewProvider, RunView } from "@memberjunction/core";
import { ReportEntity } from "@memberjunction/core-entities";
import { BaseSingleton } from "@memberjunction/global";
import { BehaviorSubject, firstValueFrom, Observable, of, shareReplay, switchMap } from "rxjs";

/**
 * This is a very simple _cache that tracks all of the reports for conversations that are in the context of Skip. 
 * We update this whenever reports are created, deleted, or updated. This saves a lot of network traffic for 
 * conversations/conversation details.
 */
export class SkipConversationReportCache extends BaseSingleton<SkipConversationReportCache> {
    public static get Instance(): SkipConversationReportCache {
        return super.getInstance<SkipConversationReportCache>();
    }

    private _cache: { [conversationId: string]: ReportEntity[] } = {};

    private _loadingObservables: { [conversationId: string]: Observable<ReportEntity[]> } = {};

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
    ): Promise<ReportEntity[]> {
        // If forceRefresh, clear the cache and observable for the conversationId
        if (forceRefresh) {
            delete this._cache[conversationId];
            delete this._loadingObservables[conversationId];
        }

        // If the data is already cached, return it immediately
        if (this._cache[conversationId]) {
            return Promise.resolve(this._cache[conversationId]);
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
    ): Observable<ReportEntity[]> {
        return new Observable<ReportEntity[]>(subscriber => {
            const rv = provider || RunView.Provider;
            rv.RunView<ReportEntity>({
                EntityName: "Reports",
                ExtraFilter: `ConversationID = '${conversationId}'`,
                ResultType: 'entity_object'
            })
                .then(result => {
                    if (result && result.Success && result.Results.length > 0) {
                        this._cache[conversationId] = result.Results;
                    } else {
                        this._cache[conversationId] = [];
                    }
                    subscriber.next(this._cache[conversationId]); // Emit the result
                    subscriber.complete(); // Complete the observable
                })
                .catch(err => {
                    subscriber.error(err); // Emit an error if the call fails
                });
        });
    }

    public AddConversationReport(conversationId: string, report: ReportEntity) {
        if (!this._cache[conversationId]) {
            this._cache[conversationId] = [];
        }
        this._cache[conversationId].push(report);
    }
    public RemoveConversationReport(conversationId: string, reportId: string) {
        if (this._cache[conversationId]) {
            this._cache[conversationId] = this._cache[conversationId].filter(x => x.ID !== reportId);
        }
    }
    public UpdateConversationReport(conversationId: string, report: ReportEntity) {
        if (this._cache[conversationId]) {
            const index = this._cache[conversationId].findIndex(x => x.ID === report.ID);
            if (index >= 0) {
                this._cache[conversationId][index] = report;
            }
        }
    }
}
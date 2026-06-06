/**
 * @fileoverview Cross-surface "Activity" tracker for long-running jobs.
 *
 * The Knowledge Hub (and other dashboards) kick off fire-and-forget jobs from
 * different surfaces — Run Pipeline (Classify), Run Cluster Analysis (Visualize),
 * Vector Sync (Vectors), Run Detection (Duplicates), Run Tag Health (Tags). Once
 * the user navigates away they lose all visibility into those jobs. This service
 * is the single place those jobs register, so the shell can show one global
 * "Activity" indicator + drawer that survives navigation.
 *
 * It is an Angular `providedIn: 'root'` singleton (same pattern as
 * {@link NavigationService}); consumers in any package that depends on
 * `@memberjunction/ng-shared` get the same instance.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/** Lifecycle state of a tracked activity. */
export type ActivityStatus = 'running' | 'success' | 'error';

/** A single tracked job surfaced in the global Activity indicator. */
export interface ActivityItem {
    /** Stable unique id (returned by {@link ActivityService.Start}). */
    ID: string;
    /** Short label, e.g. "Classify pipeline". */
    Label: string;
    /** Optional secondary detail, e.g. "Sidecar · 18 of 30 items". */
    Detail?: string;
    /** Font Awesome icon class for the row. */
    Icon?: string;
    /** Current status. */
    Status: ActivityStatus;
    /** Optional 0–100 progress for a determinate bar. */
    Progress?: number;
    /** Epoch ms when the job started. */
    StartedAt: number;
    /** Epoch ms when the job finished (set on Complete). */
    EndedAt?: number;
}

@Injectable({ providedIn: 'root' })
export class ActivityService {
    private _items: ActivityItem[] = [];
    private readonly _subject = new BehaviorSubject<ActivityItem[]>([]);

    /** Observable list of activities (most-recent first). */
    public readonly Activities$: Observable<ActivityItem[]> = this._subject.asObservable();

    /** Current snapshot of all tracked activities. */
    public get Activities(): ActivityItem[] {
        return this._items;
    }

    /** Number of activities currently running. */
    public get RunningCount(): number {
        return this._items.filter(i => i.Status === 'running').length;
    }

    /**
     * Register a new running activity.
     * @returns the activity id — pass it to {@link Update} / {@link Complete}.
     */
    public Start(label: string, opts?: { detail?: string; icon?: string; progress?: number }): string {
        const id = this.genId();
        const item: ActivityItem = {
            ID: id,
            Label: label,
            Detail: opts?.detail,
            Icon: opts?.icon ?? 'fa-solid fa-gear',
            Status: 'running',
            Progress: opts?.progress,
            StartedAt: Date.now(),
        };
        // Cap the list so a long session can't grow unbounded.
        this._items = [item, ...this._items].slice(0, 50);
        this.emit();
        return id;
    }

    /** Patch an in-flight activity's label / detail / progress. */
    public Update(id: string, patch: Partial<Pick<ActivityItem, 'Label' | 'Detail' | 'Progress'>>): void {
        const item = this._items.find(i => i.ID === id);
        if (!item) return;
        Object.assign(item, patch);
        this.emit();
    }

    /** Mark an activity finished (success or error). */
    public Complete(id: string, status: 'success' | 'error' = 'success', detail?: string): void {
        const item = this._items.find(i => i.ID === id);
        if (!item) return;
        item.Status = status;
        item.EndedAt = Date.now();
        item.Progress = status === 'success' ? 100 : item.Progress;
        if (detail != null) item.Detail = detail;
        this.emit();
    }

    /** Remove a single activity from the list. */
    public Remove(id: string): void {
        this._items = this._items.filter(i => i.ID !== id);
        this.emit();
    }

    /** Clear all finished (non-running) activities. */
    public ClearFinished(): void {
        this._items = this._items.filter(i => i.Status === 'running');
        this.emit();
    }

    private emit(): void {
        this._subject.next([...this._items]);
    }

    private genId(): string {
        return 'act_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }
}

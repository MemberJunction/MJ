import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** RSU status as returned by the server. */
export interface RSUStatus {
    Enabled: boolean;
    Running: boolean;
    OutOfSync: boolean;
    OutOfSyncSince: string | null;
    LastRunAt: string | null;
    LastRunResult: string | null;
}

const STATUS_QUERY = `
    query RuntimeSchemaUpdateStatus {
        RuntimeSchemaUpdateStatus {
            Enabled
            Running
            OutOfSync
            OutOfSyncSince
            LastRunAt
            LastRunResult
        }
    }
`;

/**
 * RSU Status Panel — displays the current state of the Runtime Schema Update system:
 * enabled/disabled, in-progress, out-of-sync warning, and last run details.
 *
 * Usage: <mj-rsu-status-panel></mj-rsu-status-panel>
 */
@Component({
    standalone: false,
    selector: 'mj-rsu-status-panel',
    templateUrl: './rsu-status-panel.component.html',
    styleUrls: ['./rsu-status-panel.component.css'],
})
export class RsuStatusPanelComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    public Status: RSUStatus | null = null;
    public IsLoading = false;
    public LoadError = '';

    ngOnInit(): void {
        this.Refresh();
    }

    public async Refresh(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = '';
        this.cdr.detectChanges();

        try {
            const result = await GraphQLDataProvider.Instance.ExecuteGQL(STATUS_QUERY, {});
            this.Status = result?.RuntimeSchemaUpdateStatus ?? null;
            if (!this.Status) {
                this.LoadError = 'No status returned from server.';
            }
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    public FormatDate(isoDate: string | null): string {
        if (!isoDate) return '—';
        const d = new Date(isoDate);
        return isNaN(d.getTime()) ? isoDate : d.toLocaleString();
    }

    public get OutOfSyncDuration(): string {
        if (!this.Status?.OutOfSyncSince) return '';
        const ms = Date.now() - new Date(this.Status.OutOfSyncSince).getTime();
        if (isNaN(ms)) return '';
        const mins = Math.floor(ms / 60_000);
        if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''}`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''}`;
        const days = Math.floor(hrs / 24);
        return `${days} day${days !== 1 ? 's' : ''}`;
    }
}

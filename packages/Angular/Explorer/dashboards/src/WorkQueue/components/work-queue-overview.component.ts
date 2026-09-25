import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { formatAge, needsAttention } from '../work-queue-agent-context';
import type { WorkQueueOverviewRow, WorkQueueRecordOpenRequest } from '../work-queue-types';

interface OverviewGroup {
    Transport: string;
    DriverClass: string;
    Rows: WorkQueueOverviewRow[];
}

/**
 * Topology joined with live stats, grouped by transport. Pure display: the dashboard loads the rows and passes
 * them in; this component only orders them (attention first) and raises selection / open-record events.
 */
@Component({
    standalone: false,
    selector: 'mj-work-queue-overview',
    templateUrl: './work-queue-overview.component.html',
    styleUrls: ['./work-queue-overview.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkQueueOverviewComponent {
    @Input() Rows: WorkQueueOverviewRow[] = [];
    @Input() IsLoading = false;
    @Input() LastRefreshedAt: Date | null = null;
    @Output() SubscriptionSelected = new EventEmitter<string>();
    @Output() OpenRecord = new EventEmitter<WorkQueueRecordOpenRequest>();

    public get Groups(): OverviewGroup[] {
        const groups = new Map<string, OverviewGroup>();
        for (const row of this.Rows) {
            const group = groups.get(row.TransportID) ?? { Transport: row.Transport, DriverClass: row.DriverClass, Rows: [] };
            group.Rows.push(row);
            groups.set(row.TransportID, group);
        }
        for (const group of groups.values()) {
            group.Rows.sort((a, b) => {
                const attention = Number(this.NeedsAttention(b)) - Number(this.NeedsAttention(a));
                return attention !== 0 ? attention : `${a.Topic}/${a.Subscription}`.localeCompare(`${b.Topic}/${b.Subscription}`);
            });
        }
        return [...groups.values()].sort((a, b) => a.Transport.localeCompare(b.Transport));
    }

    public NeedsAttention(row: WorkQueueOverviewRow): boolean {
        return row.Error !== null || (row.Stats !== null && needsAttention({ DeadLettered: row.Stats.DeadLettered, BlockedKeys: row.Stats.BlockedKeys }));
    }

    public Age(seconds: number | null | undefined): string {
        return formatAge(seconds);
    }

    public Count(value: number | null | undefined): string {
        return value === null || value === undefined ? '—' : String(value);
    }

    public Select(row: WorkQueueOverviewRow): void {
        this.SubscriptionSelected.emit(row.Subscription);
    }

    public Open(entityName: WorkQueueRecordOpenRequest['EntityName'], id: string, event: Event): void {
        event.stopPropagation();
        this.OpenRecord.emit({ EntityName: entityName, ID: id });
    }
}

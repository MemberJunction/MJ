import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { WorkQueuePartitionStateRow } from '@memberjunction/core-entities';
import { WorkQueueOperatorService } from '../services/work-queue-operator.service';
import { WORK_QUEUE_PARTITION_CONDITIONS, WorkQueuePartitionCondition } from '../work-queue-agent-context';
import type { WorkQueueSubscriptionOption } from '../work-queue-types';

/**
 * Partition-key state for one Ordered subscription: which keys are Blocked (a dead-lettered head holds the key),
 * InFlight or Idle, and how much waits behind each head. Replay / discard act on the blocking head delivery.
 */
@Component({
    standalone: false,
    selector: 'mj-work-queue-partitions',
    templateUrl: './work-queue-partitions.component.html',
    styleUrls: ['./work-queue-partitions.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkQueuePartitionsComponent implements OnChanges {
    @Input() Provider!: IMetadataProvider;
    @Input() Subscriptions: WorkQueueSubscriptionOption[] = [];
    @Input() SelectedSubscription: string | null = null;
    @Input() Condition: WorkQueuePartitionCondition | null = null;
    @Input() CanOperate = false;
    @Output() SelectedSubscriptionChange = new EventEmitter<string | null>();
    @Output() ConditionChange = new EventEmitter<WorkQueuePartitionCondition | null>();
    @Output() Changed = new EventEmitter<void>();
    @Output() Loaded = new EventEmitter<{ Count: number; Blocked: number }>();

    public readonly Conditions = WORK_QUEUE_PARTITION_CONDITIONS;
    public Rows: WorkQueuePartitionStateRow[] = [];
    public Supported = true;
    public IsLoading = false;
    public LoadError: string | null = null;
    public PendingHead: WorkQueuePartitionStateRow | null = null;
    public ConfirmReplayVisible = false;
    public DiscardVisible = false;
    public ActionInProgress = false;
    public LastOutcome: { Ok: boolean; Message: string } | null = null;

    constructor(private readonly operator: WorkQueueOperatorService, private readonly cdr: ChangeDetectorRef) {}

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['SelectedSubscription'] || changes['Condition'] || changes['Provider']) {
            void this.Refresh();
        }
    }

    /** Only Ordered subscriptions have partitions; the picker lists just those. */
    public get OrderedSubscriptions(): WorkQueueSubscriptionOption[] {
        return this.Subscriptions.filter((s) => s.PartitionMode === 'Ordered');
    }

    public get BlockedCount(): number {
        return this.Rows.filter((r) => r.Condition === 'Blocked').length;
    }

    public OnSubscriptionChange(name: string): void {
        this.SelectedSubscriptionChange.emit(name === '' ? null : name);
    }

    public ToggleCondition(condition: WorkQueuePartitionCondition): void {
        this.ConditionChange.emit(this.Condition === condition ? null : condition);
    }

    public async Refresh(): Promise<void> {
        this.LastOutcome = null;
        if (!this.SelectedSubscription || !this.Provider) {
            this.Rows = [];
            this.emitLoaded();
            this.cdr.markForCheck();
            return;
        }
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            const output = await this.operator.ListPartitions(this.Provider, this.SelectedSubscription, this.Condition ?? undefined);
            this.Supported = output.supported;
            this.Rows = output.items;
        } catch (error) {
            this.Rows = [];
            this.LoadError = error instanceof Error ? error.message : String(error);
        } finally {
            this.IsLoading = false;
            this.emitLoaded();
            this.cdr.markForCheck();
        }
    }

    public ConditionClass(condition: WorkQueuePartitionStateRow['Condition']): string {
        switch (condition) {
            case 'Blocked': return 'wq-chip-error';
            case 'InFlight': return 'wq-chip-info';
            default: return 'wq-chip-neutral';
        }
    }

    public RequestReplay(row: WorkQueuePartitionStateRow, event: Event): void {
        event.stopPropagation();
        if (row.HeadDeliveryID && this.CanOperate) {
            this.PendingHead = row;
            this.ConfirmReplayVisible = true;
        }
    }

    public RequestDiscard(row: WorkQueuePartitionStateRow, event: Event): void {
        event.stopPropagation();
        if (row.HeadDeliveryID && this.CanOperate) {
            this.PendingHead = row;
            this.DiscardVisible = true;
        }
    }

    public get DiscardMessage(): string {
        const head = this.PendingHead;
        if (!head) return '';
        return `The head delivery of key "${head.PartitionKey}" will be discarded permanently, releasing the ${head.WaitingItems} item${head.WaitingItems === 1 ? '' : 's'} waiting behind it.`;
    }

    public async ReplayHead(): Promise<void> {
        this.ConfirmReplayVisible = false;
        const head = this.PendingHead;
        if (!head?.HeadDeliveryID) return;
        await this.runAction(() => this.operator.Replay(this.Provider, this.SelectedSubscription ?? '', head.HeadDeliveryID ?? '', `Replayed head of key ${head.PartitionKey} from the Work Queue dashboard`)
            .then((r) => (r.supported ? (r.replayed ? `Replayed the head of key "${head.PartitionKey}".` : 'Nothing replayed (the head was already resolved).') : 'Replay is not supported on this transport.')));
    }

    public async DiscardHead(reason: string): Promise<void> {
        const head = this.PendingHead;
        if (!head?.HeadDeliveryID) return;
        await this.runAction(() => this.operator.Discard(this.Provider, this.SelectedSubscription ?? '', head.HeadDeliveryID ?? '', reason)
            .then((r) => (r.supported ? (r.discarded ? `Discarded the head of key "${head.PartitionKey}".` : 'Nothing discarded (the head was already resolved).') : 'Discard is not supported on this transport.')));
        this.DiscardVisible = false;
        this.cdr.markForCheck();
    }

    private async runAction(action: () => Promise<string>): Promise<void> {
        this.ActionInProgress = true;
        this.cdr.markForCheck();
        let outcome: { Ok: boolean; Message: string };
        try {
            outcome = { Ok: true, Message: await action() };
        } catch (error) {
            outcome = { Ok: false, Message: error instanceof Error ? error.message : String(error) };
        }
        this.ActionInProgress = false;
        this.PendingHead = null;
        await this.Refresh();
        this.LastOutcome = outcome;
        if (outcome.Ok) this.Changed.emit();
        this.cdr.markForCheck();
    }

    private emitLoaded(): void {
        this.Loaded.emit({ Count: this.Rows.length, Blocked: this.BlockedCount });
    }
}

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { WorkQueueDeadLetterRow } from '@memberjunction/core-entities';
import { WorkQueueOperatorService } from '../services/work-queue-operator.service';
import { formatAge } from '../work-queue-agent-context';
import type { WorkQueueSubscriptionOption } from '../work-queue-types';

/** One per-item outcome of a bulk replay or discard, shown until the next action. */
export interface WorkQueueActionOutcome {
    DeliveryID: string;
    Ok: boolean;
    Message: string;
}

/**
 * Dead-letter browser for one subscription: list (best-effort scan on cloud transports), envelope viewer, and the
 * replay / discard actions, which loop the single-item operations client-side and report per-item results.
 */
@Component({
    standalone: false,
    selector: 'mj-work-queue-dead-letters',
    templateUrl: './work-queue-dead-letters.component.html',
    styleUrls: ['./work-queue-dead-letters.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkQueueDeadLettersComponent implements OnChanges {
    @Input() Provider!: IMetadataProvider;
    @Input() Subscriptions: WorkQueueSubscriptionOption[] = [];
    @Input() SelectedSubscription: string | null = null;
    /** Update on MJ: Work Queue Subscriptions — replay and discard are disabled without it. */
    @Input() CanOperate = false;
    @Output() SelectedSubscriptionChange = new EventEmitter<string | null>();
    /** Emitted after a replay or discard changed something, so the dashboard refreshes stats. */
    @Output() Changed = new EventEmitter<void>();
    @Output() Loaded = new EventEmitter<{ Count: number; Selected: number }>();

    public Items: WorkQueueDeadLetterRow[] = [];
    public Supported = true;
    public IsLoading = false;
    public LoadError: string | null = null;
    public ExpandedID: string | null = null;
    public Selected = new Set<string>();
    public ConfirmReplayVisible = false;
    public DiscardVisible = false;
    public ActionInProgress = false;
    public Outcomes: WorkQueueActionOutcome[] = [];

    constructor(private readonly operator: WorkQueueOperatorService, private readonly cdr: ChangeDetectorRef) {}

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['SelectedSubscription'] || changes['Provider']) {
            void this.Refresh();
        }
    }

    public get Current(): WorkQueueSubscriptionOption | undefined {
        return this.Subscriptions.find((s) => s.Name === this.SelectedSubscription);
    }

    public get IsBestEffort(): boolean {
        return this.Current !== undefined && this.Current.DriverClass !== 'Database';
    }

    public get SelectedCount(): number {
        return this.Selected.size;
    }

    public get AllSelected(): boolean {
        return this.Items.length > 0 && this.Items.every((i) => this.Selected.has(i.DeliveryID));
    }

    public OnSubscriptionChange(name: string): void {
        this.SelectedSubscriptionChange.emit(name === '' ? null : name);
    }

    public async Refresh(): Promise<void> {
        this.Selected.clear();
        this.Outcomes = [];
        if (!this.SelectedSubscription || !this.Provider) {
            this.Items = [];
            this.emitLoaded();
            this.cdr.markForCheck();
            return;
        }
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            const output = await this.operator.ListDeadLetters(this.Provider, this.SelectedSubscription);
            this.Supported = output.supported;
            this.Items = output.items;
        } catch (error) {
            this.Items = [];
            this.LoadError = error instanceof Error ? error.message : String(error);
        } finally {
            this.IsLoading = false;
            this.emitLoaded();
            this.cdr.markForCheck();
        }
    }

    public ToggleExpanded(id: string): void {
        this.ExpandedID = this.ExpandedID === id ? null : id;
    }

    public ToggleSelected(id: string, event: Event): void {
        event.stopPropagation();
        if (this.Selected.has(id)) this.Selected.delete(id); else this.Selected.add(id);
        this.emitLoaded();
    }

    public ToggleAll(): void {
        if (this.AllSelected) this.Selected.clear(); else this.Items.forEach((i) => this.Selected.add(i.DeliveryID));
        this.emitLoaded();
    }

    public Age(seconds: number | null | undefined): string {
        return formatAge(seconds);
    }

    public PrettyPayload(item: WorkQueueDeadLetterRow): string {
        const json = item.Message.PayloadJSON;
        if (json === null) {
            return item.Message.PayloadRef ? `PayloadRef: ${JSON.stringify(item.Message.PayloadRef)}` : '(no payload)';
        }
        try {
            return JSON.stringify(JSON.parse(json), null, 2);
        } catch {
            return json;
        }
    }

    public AttributeEntries(item: WorkQueueDeadLetterRow): { Key: string; Value: string }[] {
        return Object.entries(item.Message.Attributes).map(([Key, Value]) => ({ Key, Value }));
    }

    /** How many waiting items a discard of the selected blocking heads would release, for the confirmation text. */
    public get DiscardMessage(): string {
        const blocking = this.Items.filter((i) => this.Selected.has(i.DeliveryID) && i.BlocksKey).length;
        const base = `${this.SelectedCount} dead letter${this.SelectedCount === 1 ? '' : 's'} will be discarded permanently.`;
        return blocking > 0 ? `${base} ${blocking} of them block${blocking === 1 ? 's' : ''} an Ordered key; discarding releases the items waiting behind ${blocking === 1 ? 'it' : 'them'}.` : base;
    }

    public RequestReplay(): void {
        if (this.SelectedCount > 0 && this.CanOperate) this.ConfirmReplayVisible = true;
    }

    public RequestDiscard(): void {
        if (this.SelectedCount > 0 && this.CanOperate) this.DiscardVisible = true;
    }

    public async ReplaySelected(): Promise<void> {
        this.ConfirmReplayVisible = false;
        await this.runForSelected('replay', (id) => this.operator.Replay(this.Provider, this.SelectedSubscription ?? '', id, 'Replayed from the Work Queue dashboard')
            .then((r) => (r.supported ? (r.replayed ? 'replayed' : 'not replayed (already resolved?)') : 'not supported on this transport')));
    }

    public async DiscardSelected(reason: string): Promise<void> {
        await this.runForSelected('discard', (id) => this.operator.Discard(this.Provider, this.SelectedSubscription ?? '', id, reason)
            .then((r) => (r.supported ? (r.discarded ? 'discarded' : 'not discarded (already resolved?)') : 'not supported on this transport')));
        this.DiscardVisible = false;
        this.cdr.markForCheck();
    }

    private async runForSelected(verb: string, action: (deliveryID: string) => Promise<string>): Promise<void> {
        this.ActionInProgress = true;
        this.cdr.markForCheck();
        const outcomes: WorkQueueActionOutcome[] = [];
        for (const id of [...this.Selected]) {
            try {
                outcomes.push({ DeliveryID: id, Ok: true, Message: await action(id) });
            } catch (error) {
                outcomes.push({ DeliveryID: id, Ok: false, Message: `${verb} failed: ${error instanceof Error ? error.message : String(error)}` });
            }
        }
        this.ActionInProgress = false;
        await this.Refresh();
        this.Outcomes = outcomes;
        if (outcomes.some((o) => o.Ok)) {
            this.Changed.emit();
        }
        this.cdr.markForCheck();
    }

    private emitLoaded(): void {
        this.Loaded.emit({ Count: this.Items.length, Selected: this.Selected.size });
    }
}

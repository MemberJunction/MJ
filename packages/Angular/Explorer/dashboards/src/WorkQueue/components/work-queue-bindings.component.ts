import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { WorkQueueValidateBindingsOutput } from '@memberjunction/core-entities';
import { WorkQueueOperatorService } from '../services/work-queue-operator.service';
import type { WorkQueueTransportOption } from '../work-queue-types';

type BindingIssue = WorkQueueValidateBindingsOutput['issues'][number];

/**
 * Runs WorkQueue.ValidateBindings for every transport (or one) and lists the issues by severity. Read-only: the
 * fix is always a metadata or infrastructure change, so each issue links back to its subject in words.
 */
@Component({
    standalone: false,
    selector: 'mj-work-queue-bindings',
    templateUrl: './work-queue-bindings.component.html',
    styleUrls: ['./work-queue-bindings.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkQueueBindingsComponent implements OnChanges {
    @Input() Provider!: IMetadataProvider;
    @Input() Transports: WorkQueueTransportOption[] = [];
    @Output() Loaded = new EventEmitter<{ Errors: number; Warnings: number }>();

    public SelectedTransport: string | null = null;
    public Issues: BindingIssue[] = [];
    public IsLoading = false;
    public HasRun = false;
    public LoadError: string | null = null;
    public LastRunAt: Date | null = null;

    constructor(private readonly operator: WorkQueueOperatorService, private readonly cdr: ChangeDetectorRef) {}

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['Provider'] && this.Provider && !this.HasRun) {
            void this.Refresh();
        }
    }

    public get Errors(): BindingIssue[] {
        return this.Issues.filter((i) => i.Severity === 'Error');
    }

    public get Warnings(): BindingIssue[] {
        return this.Issues.filter((i) => i.Severity === 'Warning');
    }

    public OnTransportChange(name: string): void {
        this.SelectedTransport = name === '' ? null : name;
        void this.Refresh();
    }

    public async Refresh(): Promise<void> {
        if (!this.Provider) return;
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            const output = await this.operator.ValidateBindings(this.Provider, this.SelectedTransport ?? undefined);
            this.Issues = [...output.issues].sort((a, b) => (a.Severity === b.Severity ? a.Subject.localeCompare(b.Subject) : a.Severity === 'Error' ? -1 : 1));
            this.HasRun = true;
            this.LastRunAt = new Date();
        } catch (error) {
            this.Issues = [];
            this.LoadError = error instanceof Error ? error.message : String(error);
        } finally {
            this.IsLoading = false;
            this.Loaded.emit({ Errors: this.Errors.length, Warnings: this.Warnings.length });
            this.cdr.markForCheck();
        }
    }
}

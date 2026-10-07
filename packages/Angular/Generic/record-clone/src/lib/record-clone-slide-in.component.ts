/**
 * @fileoverview Slide-in wrapper for the record clone panel.
 *
 * Puts {@link RecordClonePanelComponent} inside MJ's generic `<mj-slide-panel>` so any host
 * (the base-forms record toolbar, a grid, a dashboard) gets the standard right-hand slide-in
 * with one element. Everything the panel reports is re-emitted unchanged; the wrapper only
 * adds open/close handling.
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    ViewChild,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { BaseEntity } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { RecordCloneKey, RecordClonePlanDetails } from '@memberjunction/core-entities';
import { MjSlidePanelComponent } from '@memberjunction/ng-ui-components';

import { RecordClonePanelComponent } from './record-clone-panel.component';
import type {
    CloneCompletedEvent,
    CloneFailedEvent,
    CloneNavigationEvent,
    RecordClonePanelState,
    RecordCloneStep,
} from './record-clone-types';

/**
 * The clone wizard in a right-hand slide-in.
 *
 * Bind {@link Visible} two-way. The inner panel is created on first open and restarted on
 * every later open, so each open plans against the record's current state. Closing is refused
 * while a clone is executing.
 *
 * @example
 * ```html
 * <mj-record-clone-slide-in
 *     [(Visible)]="ShowClone"
 *     [Record]="record"
 *     [Provider]="provider"
 *     (CloneCompleted)="OnCloned($event)"
 *     (NavigateToRecord)="OpenRecord($event)">
 * </mj-record-clone-slide-in>
 * ```
 */
@Component({
    standalone: true,
    selector: 'mj-record-clone-slide-in',
    template: `
        <mj-slide-panel
            [Visible]="Visible"
            [Title]="Title || DefaultTitle"
            [WidthPx]="WidthPx"
            [CanClose]="CanCloseGuard"
            (Closed)="Close()">
            @if (HasOpened) {
                <mj-record-clone-panel
                    [Provider]="Provider"
                    [Record]="Record"
                    [EntityName]="EntityName"
                    [RecordKey]="RecordKey"
                    [AutoStart]="false"
                    [ShowStepTabs]="ShowStepTabs"
                    (StateChange)="StateChange.emit($event)"
                    (StepChange)="StepChange.emit($event)"
                    (PlanChanged)="PlanChanged.emit($event)"
                    (CloneCompleted)="CloneCompleted.emit($event)"
                    (CloneFailed)="CloneFailed.emit($event)"
                    (NavigateToRecord)="NavigateToRecord.emit($event)"
                    (CloseRequested)="Close()">
                </mj-record-clone-panel>
            }
        </mj-slide-panel>
    `,
    styles: [`
        :host {
            display: contents;
        }
    `],
    imports: [CommonModule, MjSlidePanelComponent, RecordClonePanelComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordCloneSlideInComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** The embedded panel, once the slide-in has been opened. */
    @ViewChild(RecordClonePanelComponent) public Panel?: RecordClonePanelComponent;

    // ── Inputs ───────────────────────────────────────────────────────────

    /** Whether the slide-in is open. Opening (re)starts the wizard. Bind two-way with `[(Visible)]`. */
    @Input()
    set Visible(value: boolean) {
        const opening = value && !this._visible;
        this._visible = value;
        if (opening) {
            this.onOpened();
        }
    }
    get Visible(): boolean {
        return this._visible;
    }
    private _visible = false;

    /** The record to clone. See {@link RecordClonePanelComponent.Record}. */
    @Input() Record: BaseEntity | null = null;

    /** Entity of the source record when {@link Record} is not set. */
    @Input() EntityName?: string;

    /** Key of the source record when {@link Record} is not set. See {@link RecordClonePanelComponent.RecordKey}. */
    @Input() RecordKey?: RecordCloneKey | string;

    /** Header text. Defaults to `Clone <entity name>`. */
    @Input() Title = '';

    /** Initial width in pixels. Default 720, wide enough for the plan tree and the review diff. */
    @Input() WidthPx = 720;

    /** Show the Scope / Values / Review step tabs. Default true. */
    @Input() ShowStepTabs = true;

    // ── Outputs (re-emitted from the panel) ──────────────────────────────

    /** Fires with the new value when the slide-in opens or closes itself. */
    @Output() VisibleChange = new EventEmitter<boolean>();
    /** Fires after the slide-in closes, whatever closed it. */
    @Output() Closed = new EventEmitter<void>();
    /** See {@link RecordClonePanelComponent.StateChange}. */
    @Output() StateChange = new EventEmitter<RecordClonePanelState>();
    /** See {@link RecordClonePanelComponent.StepChange}. */
    @Output() StepChange = new EventEmitter<RecordCloneStep>();
    /** See {@link RecordClonePanelComponent.PlanChanged}. */
    @Output() PlanChanged = new EventEmitter<RecordClonePlanDetails>();
    /** See {@link RecordClonePanelComponent.CloneCompleted}. */
    @Output() CloneCompleted = new EventEmitter<CloneCompletedEvent>();
    /** See {@link RecordClonePanelComponent.CloneFailed}. */
    @Output() CloneFailed = new EventEmitter<CloneFailedEvent>();
    /** See {@link RecordClonePanelComponent.NavigateToRecord}. The slide-in closes after emitting it. */
    @Output() NavigateToRecord = new EventEmitter<CloneNavigationEvent>();

    // ── State ────────────────────────────────────────────────────────────

    /** True once the slide-in has opened at least once; the panel is created lazily. */
    public HasOpened = false;

    public get DefaultTitle(): string {
        const name = this.EntityName || this.Record?.EntityInfo?.Name;
        return name ? `Clone ${name}` : 'Clone record';
    }

    /** Passed to `mj-slide-panel`: refuses X, Escape and backdrop closes while a clone is running. */
    public readonly CanCloseGuard = (): boolean => this.Panel?.CurrentState !== 'executing';

    // ── Methods ──────────────────────────────────────────────────────────

    /** Opens the slide-in and restarts the wizard. */
    public Open(): void {
        if (this._visible) return;
        this.Visible = true;
        this.VisibleChange.emit(true);
        this.cdr.markForCheck();
    }

    /** Closes the slide-in unless a clone is executing. */
    public Close(): void {
        if (!this._visible || !this.CanCloseGuard()) return;
        this._visible = false;
        this.VisibleChange.emit(false);
        this.Closed.emit();
        this.cdr.markForCheck();
    }

    private onOpened(): void {
        if (!this.HasOpened) {
            this.HasOpened = true;
            this.cdr.markForCheck();
        }
        // The panel exists after this change-detection pass; start it once it does.
        queueMicrotask(() => {
            this.cdr.detectChanges();
            void this.Panel?.Reset();
        });
    }
}

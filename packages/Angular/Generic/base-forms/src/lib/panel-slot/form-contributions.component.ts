import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { Subject, skip, takeUntil } from 'rxjs';
import { BaseEntity } from '@memberjunction/core';
import { InteractiveFormsEngine } from '@memberjunction/core-entities';
import { BaseFormComponent } from '../base-form-component';
import { FormContext } from '../types/form-types';
import { CollectFormContributionRegistrations } from './collect-form-contribution-registrations';
import {
    ResolveFormContributions,
    type FormContributionWinner,
} from './form-contribution';
import { FORM_PLACEMENT_PREVIEW } from './placement-preview';
import { FormSlotCoordinator } from './form-slot-coordinator.service';

/**
 * Fills in related-entity grids that the form template did not bake and that
 * no contribution claimed. Lives in `<mj-record-form-container>` so every
 * generated and custom form that uses the container picks it up.
 *
 * Reads the same contributions the slots do (compiled panels and rows, less the
 * ones this user hid) and resolves again when rows change or the user hides or
 * shows a panel. Claimed / extra panels still mount via `<mj-form-panel-slot>` —
 * this host does not remount those.
 */
@Component({
    standalone: false,
    selector: 'mj-form-contributions',
    template: `
        @for (grid of StockGrids; track grid.ContributionKey) {
            <mj-related-entity-grid-panel
                [Contribution]="grid"
                [Record]="Record"
                [FormComponent]="FormComponent"
                [FormContext]="FormContext">
            </mj-related-entity-grid-panel>
        }
    `,
    styles: [`:host { display: contents; }`],
})
export class FormContributionsComponent implements OnChanges, OnInit, OnDestroy {
    @Input() Record!: BaseEntity;
    @Input() FormComponent!: BaseFormComponent;
    @Input() FormContext?: FormContext;
    @Input() BakedSectionKeys: string[] = [];
    @Input() ShowRelatedEntities = true;

    public StockGrids: FormContributionWinner[] = [];

    private readonly destroy$ = new Subject<void>();
    private readonly cdr = inject(ChangeDetectorRef);
    /** The placement dialog's unsaved panel, when this is the dialog's preview form. */
    private readonly preview = inject(FORM_PLACEMENT_PREVIEW, { optional: true });
    /** The form's slot coordinator, which says when the user hid or showed a panel. */
    private readonly slots = inject(FormSlotCoordinator, { optional: true });

    public ngOnChanges(changes: SimpleChanges): void {
        const keys = ['Record', 'FormComponent', 'BakedSectionKeys', 'ShowRelatedEntities'];
        const meaningful = keys.some((k) => changes[k] && changes[k].currentValue !== changes[k].previousValue);
        if (!meaningful && this.StockGrids.length > 0) return;
        this.refresh();
    }

    public ngOnInit(): void {
        // The engine's subject replays the current rows on subscribe, which ngOnChanges has
        // already resolved.
        try {
            InteractiveFormsEngine.Instance.Contributions$
                .pipe(skip(1), takeUntil(this.destroy$))
                .subscribe(() => this.refreshAndMark());
        } catch {
            // No engine here — compiled registrations are the only source.
        }
        this.preview?.Changed$.pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshAndMark());
        this.slots?.PanelsChanged.pipe(takeUntil(this.destroy$)).subscribe(() => this.refreshAndMark());
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private refreshAndMark(): void {
        this.refresh();
        this.cdr.markForCheck();
    }

    private refresh(): void {
        if (!this.Record?.EntityInfo || !this.FormComponent) {
            this.StockGrids = [];
            return;
        }
        const entity = this.Record.EntityInfo;
        const resolved = ResolveFormContributions({
            EntityName: entity.Name,
            RelatedEntities: entity.RelatedEntities,
            IsaChildEntityIDs: entity.ChildEntities.map((child) => child.ID),
            Registrations: this.FormComponent.OwnsEntireFormBody
                ? []
                : CollectFormContributionRegistrations(entity, this.FormComponent.ProviderToUse, { Preview: this.preview }),
            BakedSectionKeys: this.BakedSectionKeys,
            ShowRelatedEntities: this.ShowRelatedEntities,
        });
        this.StockGrids = resolved.StockGrids;
    }
}

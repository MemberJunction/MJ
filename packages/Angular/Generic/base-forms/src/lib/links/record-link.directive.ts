import {
    ChangeDetectorRef,
    Directive,
    ElementRef,
    EventEmitter,
    HostBinding,
    HostListener,
    Input,
    OnDestroy,
    Output,
    inject
} from '@angular/core';
import { BaseEntity, CompositeKey, IMetadataProvider } from '@memberjunction/core';
import { FormNavigationEvent } from '../types/navigation-events';
import { MjRecordPreviewPopoverService } from '../preview-popover/record-preview-popover.service';
import { RecordPreviewUpdatedEvent } from '../preview-popover/record-preview-popover.component';
import { MjRecordFormContainerComponent } from '../container/record-form-container.component';
import { FormPanelSlotComponent } from '../panel-slot/form-panel-slot.component';
import { FormFieldPanelSlotComponent } from '../panel-slot/form-field-panel-slot.component';
import {
    ApplyQuickEditToHostRecord,
    ResolveLinkMetadataProvider,
    ResolveRecordLinkTarget,
    ResolvedRecordLinkTarget
} from './record-link-utils';

let nextDirectiveId = 1;

/**
 * Declarative `[mjRecordLink]` directive that attaches MemberJunction's full record-linking UX
 * to any `<button>`, `<a>`, `<span>`, or chip element:
 * - **Hover-intent preview popover** (`<mj-record-preview-popover>`) with summary fields and status badge
 * - **Inline Quick Edit** inside the hover popover with automatic propagation back to virtual display fields on `Record`
 * - **Standard & Polymorphic FK resolution** (`EntityField.RelatedEntity` + `EntityField.EntityIDFieldName`)
 * - **Click & Ctrl/Cmd+Click navigation** (`FormNavigationEvent` with `OpenInNewTab`)
 *
 * ### Usage Modes
 * 1. **Field-Driven Mode** (resolves target entity, PK, and companion virtual display field from `Record` metadata):
 *    ```html
 *    <button type="button" [mjRecordLink]="Record" FieldName="CurrentOrganizationID" (Navigate)="Navigate.emit($event)">
 *      {{ Record.CurrentOrganizationName }}
 *    </button>
 *    ```
 * 2. **Direct Mode** (explicit `EntityName` and `RecordID` or `PrimaryKey`):
 *    ```html
 *    <button type="button" mjRecordLink [EntityName]="'MJ_BizApps_Common: People'" [RecordID]="row.PersonID">
 *      {{ row.PersonName }}
 *    </button>
 *    ```
 */
@Directive({
    standalone: false,
    selector: '[mjRecordLink]',
    exportAs: 'mjRecordLink'
})
export class MjRecordLinkDirective implements OnDestroy {
    private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly previewService = inject(MjRecordPreviewPopoverService);
    private readonly formContainer = inject(MjRecordFormContainerComponent, { optional: true });
    private readonly panelSlot = inject(FormPanelSlotComponent, { optional: true });
    private readonly fieldPanelSlot = inject(FormFieldPanelSlotComponent, { optional: true });

    private readonly sourceId = `mj-record-link-${nextDirectiveId++}`;
    private _recordInput: BaseEntity | null = null;
    private _dispatchingSyntheticClick = false;

    /**
     * Primary input bound via `[mjRecordLink]="Record"` (Field-driven mode) or bare `mjRecordLink` (`""` in Direct mode).
     */
    @Input('mjRecordLink')
    public set MjRecordLinkInput(value: BaseEntity | '' | null | undefined) {
        this._recordInput = value && typeof value === 'object' ? value : null;
    }
    public get MjRecordLinkInput(): BaseEntity | null {
        return this._recordInput;
    }

    /** Optional explicit `[Record]` input when using bare `mjRecordLink` attribute. */
    @Input() public Record: BaseEntity | null = null;

    /** Foreign-key or polymorphic-FK field name on `Record` (e.g. `'CurrentOrganizationID'`, `'RecordID'`). */
    @Input() public FieldName: string | null = null;

    /** Explicit target entity name (or UUID) for Direct mode, or fallback when `FieldName` metadata is absent. */
    @Input() public EntityName: string | null = null;

    /** Explicit target record ID for Direct mode. */
    @Input() public RecordID: string | number | null = null;

    /** Explicit target `CompositeKey` for Direct mode. */
    @Input() public PrimaryKey: CompositeKey | null = null;

    /** Optional pre-resolved display name for the target record. */
    @Input() public DisplayName: string | null = null;

    /** Optional explicit virtual display-name field on `Record` to update when Quick Edit saves. */
    @Input() public NameFieldMap: string | null = null;

    /** Whether record link navigation and hover preview are enabled (defaults to `true`). */
    @Input() public RecordLinksEnabled = true;

    /** Whether hovering the element opens the `<mj-record-preview-popover>` card (defaults to `true`). */
    @Input() public ShowHoverPreview = true;

    /** Hover intent delay in milliseconds before opening the preview popover (defaults to `260`). */
    @Input() public HoverDelayMs = 260;

    /**
     * Controls whether clicking the host element is intercepted by `[mjRecordLink]` to emit `FormNavigationEvent`:
     * - `'auto'` (default): intercepts clicks when `(Navigate)` has subscribers or when inside a form container/slot;
     *   otherwise lets any existing `(click)` handler on the host element run naturally.
     * - `true`: always intercepts clicks and dispatches `FormNavigationEvent`.
     * - `false`: never intercepts host element clicks (hover preview + Quick Edit only).
     */
    @Input() public HandleClick: boolean | 'auto' = 'auto';

    /** Optional metadata provider override. */
    @Input() public Provider: IMetadataProvider | null = null;

    /** Emitted when the user clicks the link or clicks "Open Record" inside the hover preview popover. */
    @Output() public readonly Navigate = new EventEmitter<FormNavigationEvent>();

    /** Emitted when the user saves inline Quick Edit changes inside the hover preview popover. */
    @Output() public readonly RecordUpdated = new EventEmitter<RecordPreviewUpdatedEvent>();

    /** Effective `BaseEntity` record from `[mjRecordLink]="Record"` or `[Record]="Record"`. */
    public get EffectiveRecord(): BaseEntity | null {
        return this._recordInput ?? this.Record ?? null;
    }

    /** Resolves the current target record descriptor from the directive's inputs. */
    public get ResolvedTarget(): ResolvedRecordLinkTarget | null {
        return ResolveRecordLinkTarget({
            Record: this.EffectiveRecord,
            FieldName: this.FieldName,
            EntityName: this.EntityName,
            RecordID: this.RecordID,
            PrimaryKey: this.PrimaryKey,
            DisplayName: this.DisplayName,
            NameFieldMap: this.NameFieldMap,
            Provider: this.Provider
        });
    }

    @HostBinding('class.mj-record-link-active')
    public get IsLinkActive(): boolean {
        return Boolean(this.RecordLinksEnabled && this.ResolvedTarget);
    }

    @HostListener('mouseenter')
    public OnMouseEnter(): void {
        if (!this.RecordLinksEnabled || !this.ShowHoverPreview) {
            return;
        }
        const target = this.ResolvedTarget;
        if (!target) {
            return;
        }
        const provider = ResolveLinkMetadataProvider(this.Provider, this.EffectiveRecord);
        const hostText = this.hostEl.nativeElement?.textContent?.trim() || null;
        const effectiveDisplayName = this.DisplayName?.trim() || target.DisplayName || hostText;

        this.previewService.RequestOpen({
            SourceID: this.sourceId,
            EntityName: target.EntityName,
            PrimaryKey: target.PrimaryKey,
            RecordID: target.RecordID,
            DisplayName: effectiveDisplayName,
            AnchorElement: this.hostEl.nativeElement,
            Provider: provider,
            HoverDelayMs: this.HoverDelayMs,
            OnNavigate: (navEvent: FormNavigationEvent) => this.handlePopoverNavigate(navEvent),
            OnRecordUpdated: (updatedEvent: RecordPreviewUpdatedEvent) => this.handlePopoverRecordUpdated(target, updatedEvent)
        });
    }

    @HostListener('mouseleave')
    public OnMouseLeave(): void {
        this.previewService.RequestClose(this.sourceId);
    }

    @HostListener('click', ['$event'])
    public OnHostClick(event: MouseEvent): void {
        if (this._dispatchingSyntheticClick || !this.RecordLinksEnabled || this.HandleClick === false) {
            return;
        }
        const target = this.ResolvedTarget;
        if (!target) {
            return;
        }

        const shouldIntercept =
            this.HandleClick === true ||
            this.Navigate.observed ||
            this.hasAncestorFormNavigationTarget();

        this.previewService.CloseImmediately(this.sourceId);

        if (!shouldIntercept) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const openInNewTab = Boolean(event.ctrlKey || event.metaKey);
        const navEvent: FormNavigationEvent = openInNewTab
            ? {
                  Kind: 'record',
                  EntityName: target.EntityName,
                  PrimaryKey: target.PrimaryKey,
                  OpenInNewTab: true
              }
            : {
                  Kind: 'record',
                  EntityName: target.EntityName,
                  PrimaryKey: target.PrimaryKey
              };

        this.dispatchNavigationEvent(navEvent);
    }

    public ngOnDestroy(): void {
        this.previewService.CloseImmediately(this.sourceId);
    }

    private handlePopoverNavigate(navEvent: FormNavigationEvent): void {
        if (this.Navigate.observed || this.hasAncestorFormNavigationTarget() || MjRecordPreviewPopoverService.FallbackNavigationHandler) {
            this.dispatchNavigationEvent(navEvent);
            return;
        }
        // Fallback for standalone dashboard buttons that bound `(click)="..."` instead of `(Navigate)`:
        const el = this.hostEl.nativeElement;
        if (el && typeof el.click === 'function') {
            this._dispatchingSyntheticClick = true;
            try {
                el.click();
            } finally {
                this._dispatchingSyntheticClick = false;
            }
        }
    }

    private handlePopoverRecordUpdated(
        target: ResolvedRecordLinkTarget,
        updatedEvent: RecordPreviewUpdatedEvent
    ): void {
        ApplyQuickEditToHostRecord(this.EffectiveRecord, target, updatedEvent.UpdatedFields);
        this.RecordUpdated.emit(updatedEvent);
        this.cdr.markForCheck();
    }

    private hasAncestorFormNavigationTarget(): boolean {
        return Boolean(
            this.panelSlot?.FormComponent ||
            this.fieldPanelSlot?.FormComponent ||
            this.formContainer
        );
    }

    private dispatchNavigationEvent(navEvent: FormNavigationEvent): void {
        if (this.Navigate.observed) {
            this.Navigate.emit(navEvent);
            return;
        }
        if (this.panelSlot?.FormComponent) {
            this.panelSlot.FormComponent.OnFormNavigate(navEvent);
            return;
        }
        if (this.fieldPanelSlot?.FormComponent) {
            this.fieldPanelSlot.FormComponent.OnFormNavigate(navEvent);
            return;
        }
        if (this.formContainer) {
            if (this.formContainer.FormComponent) {
                this.formContainer.FormComponent.OnFormNavigate(navEvent);
            } else {
                this.formContainer.Navigate.emit(navEvent);
            }
            return;
        }
        if (MjRecordPreviewPopoverService.FallbackNavigationHandler) {
            MjRecordPreviewPopoverService.FallbackNavigationHandler(navEvent);
        }
    }
}

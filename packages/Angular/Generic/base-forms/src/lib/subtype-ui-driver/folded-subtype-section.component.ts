import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ComponentRef,
    DoCheck,
    ElementRef,
    EventEmitter,
    HostBinding,
    Input,
    OnDestroy,
    OnInit,
    Output,
    Type,
    ViewChild,
    ViewContainerRef,
    ViewEncapsulation,
    inject,
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseEntity, EntityInfo, LogError, ValidationResult } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { BaseFormComponent } from '../base-form-component';
import type { FormContext } from '../types/form-types';
import type { FormNavigationEvent } from '../types/navigation-events';
import { FormFieldEditCoordinator } from '../form-field-edit.coordinator';
import { FormRecordRefreshCoordinator } from '../form-record-refresh.coordinator';
import { FormChromeCoordinator } from '../chrome/form-chrome-coordinator.service';
import {
    EntitySubtypeUIDriverBase,
    ResolveGeneratedSubtypeFieldSpecs,
    type SubtypeGeneratedFieldSpec,
} from './entity-subtype-ui-driver';

/**
 * Renders an entity's active IS-A subtype extension inline inside its parent form when
 * `EntityInfo.SubtypeSelectorConfig?.FoldIntoForm === true`.
 *
 * Behavior:
 * - Off unless the entity explicitly opts in with `"FoldIntoForm": true` in `SubtypeSelector`.
 * - Immediately reconciles the prospective `ISAChild` as soon as a type is picked on `Record`
 *   (including on a brand-new record before its first save).
 * - When `SubtypeSelector.UIDriver` resolves to a class registered with
 *   `@RegisterClass(EntitySubtypeUIDriverBase, key)`, mounts that component in place of the
 *   default generated fields.
 * - Otherwise renders the resolved child entity's generated fields inside their own
 *   `<mj-collapsible-panel>`.
 * - When a saved record already has a persisted child of one subtype and `OnSubtypeChange` is
 *   `'Refuse'`, surfaces an inline warning if the user selects a conflicting subtype in edit mode.
 */
@Component({
    standalone: false,
    selector: 'mj-folded-subtype-section',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    templateUrl: './folded-subtype-section.component.html',
    styleUrls: ['./folded-subtype-section.component.css'],
})
export class MjFoldedSubtypeSectionComponent extends BaseAngularComponent implements OnInit, DoCheck, OnDestroy {
    @HostBinding('style.display')
    public readonly HostDisplay = 'contents';

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly fieldEdits = inject(FormFieldEditCoordinator, { optional: true });
    private readonly recordRefresh = inject(FormRecordRefreshCoordinator, { optional: true });
    private readonly chrome = inject(FormChromeCoordinator, { optional: true });

    private readonly destroy$ = new Subject<void>();
    private recordEventSub: Subscription | null = null;
    private editModeSub: Subscription | null = null;

    private _record: BaseEntity | null = null;
    private _formComponent: BaseFormComponent | null = null;
    private _formContext: FormContext | undefined = undefined;
    private _editMode = false;

    private reconcileToken = 0;
    private lastWatchSignature: string | null = null;
    private mountedUIDriverRef: ComponentRef<EntitySubtypeUIDriverBase> | null = null;
    private mountedUIDriverKey: string | null = null;

    /** Dynamic host anchor when a custom `UIDriver` component replaces generated fields. */
    @ViewChild('uiDriverHost', { read: ViewContainerRef })
    public set UIDriverHost(vcr: ViewContainerRef | undefined) {
        this._uiDriverHost = vcr ?? null;
        this.syncMountedUIDriver();
    }
    private _uiDriverHost: ViewContainerRef | null = null;

    @Input()
    public set Record(value: BaseEntity | null) {
        if (this._record === value) return;
        this.teardownRecordSubscription();
        this._record = value;
        this.lastWatchSignature = null;
        this.bindRecordSubscription(value);
        void this.reconcileSubtype();
    }
    public get Record(): BaseEntity | null {
        return this._record;
    }

    @Input()
    public set FormComponent(value: BaseFormComponent | null) {
        if (this._formComponent === value) return;
        if (this._formComponent) {
            this._formComponent.UnregisterSubtypeValidator(this);
        }
        this.editModeSub?.unsubscribe();
        this.editModeSub = null;
        this._formComponent = value;
        if (value) {
            value.RegisterSubtypeValidator(this);
            this.editModeSub = value.EditModeChanged.subscribe(() => {
                this.pushInputsToMountedUIDriver();
                void this.reconcileSubtype();
                this.cdr.markForCheck();
            });
        }
        this.pushInputsToMountedUIDriver();
    }
    public get FormComponent(): BaseFormComponent | null {
        return this._formComponent;
    }

    @Input()
    public set FormContext(value: FormContext | undefined) {
        this._formContext = value;
        this.pushInputsToMountedUIDriver();
    }
    public get FormContext(): FormContext | undefined {
        return this._formContext ?? this._formComponent?.formContext;
    }

    @Input()
    public set EditMode(value: boolean) {
        this._editMode = value;
        this.pushInputsToMountedUIDriver();
    }
    public get EditMode(): boolean {
        return this._formComponent ? this._formComponent.EditMode : this._editMode;
    }

    @Output()
    public readonly Navigate = new EventEmitter<FormNavigationEvent>();

    /** Resolved child record currently displayed in the folded section, if any. */
    public ActiveChildRecord: BaseEntity | null = null;

    /** Resolved `UIDriver` registration key when a registered `EntitySubtypeUIDriverBase` matches. */
    public ActiveUIDriverKey: string | null = null;

    /** Derived field descriptors when rendering generated `<mj-form-field>` controls. */
    public GeneratedFieldSpecs: SubtypeGeneratedFieldSpec[] = [];

    /** Non-null when a saved record's subtype change conflicts with `OnSubtypeChange: 'Refuse'`. */
    public RefusalWarningMessage: string | null = null;

    /** True when either a `UIDriver`, generated child fields, or a refusal warning should render. */
    public get ShouldRenderSection(): boolean {
        if (!this.IsFoldEnabled) return false;
        if (this.ActiveUIDriverKey !== null) return true;
        if (this.RefusalWarningMessage !== null) return true;
        return this.ActiveChildRecord !== null && this.GeneratedFieldSpecs.length > 0;
    }

    /** Whether `FoldIntoForm` is enabled on the bound parent entity. */
    public get IsFoldEnabled(): boolean {
        return this._record?.EntityInfo?.SubtypeSelectorConfig?.FoldIntoForm === true;
    }

    /** Metadata for the active child entity, if any. */
    public get ActiveChildEntityInfo(): EntityInfo | null {
        return this.ActiveChildRecord?.EntityInfo ?? null;
    }

    /** Stable `SectionKey` for `<mj-collapsible-panel>` state persistence & chrome routing. */
    public get SectionKey(): string {
        if (this.ActiveChildEntityInfo) {
            return `subtype_${this.ActiveChildEntityInfo.CodeName}`;
        }
        if (this.ActiveUIDriverKey) {
            const safeKey = this.ActiveUIDriverKey.replace(/[^a-zA-Z0-9_]/g, '_');
            return `subtype_ui_${safeKey}`;
        }
        return 'subtype_extension';
    }

    /** Human-readable section title shown in the collapsible panel header. */
    public get SectionTitle(): string {
        if (this.ActiveChildEntityInfo) {
            return this.ActiveChildEntityInfo.DisplayNameOrName;
        }
        return 'Type Details';
    }

    /** FontAwesome icon class for the collapsible panel header. */
    public get SectionIcon(): string {
        return this.ActiveChildEntityInfo?.Icon || 'fa-solid fa-layer-group';
    }

    /** Whether the active child itself opts into `FoldIntoForm` for multi-level IS-A chains. */
    public get HasNestedFoldedSubtype(): boolean {
        return Boolean(
            this.ActiveChildRecord &&
            this.ActiveChildRecord.EntityInfo?.SubtypeSelectorConfig?.FoldIntoForm === true,
        );
    }

    /**
     * CSS flex `order` placing the folded subtype section immediately after the parent
     * entity's own field sections and before related-entity grids.
     */
    public get SectionOrder(): number | null {
        const containerEl = this.hostElement.nativeElement.parentElement;
        if (!containerEl || !this._formComponent?.getSectionDisplayOrder) {
            return null;
        }
        let maxFieldOrder: number | null = null;
        const panels = containerEl.querySelectorAll(':scope > mj-collapsible-panel');
        panels.forEach((node: Element) => {
            const variant = node.getAttribute('data-variant') ?? 'default';
            if (variant === 'related-entity') return;
            const key = node.getAttribute('data-section-key') ?? '';
            if (!key || key === this.SectionKey) return;
            const order = this._formComponent!.getSectionDisplayOrder(key);
            if (maxFieldOrder === null || order > maxFieldOrder) {
                maxFieldOrder = order;
            }
        });
        return maxFieldOrder;
    }

    public ngOnInit(): void {
        this.fieldEdits?.Edited$.pipe(takeUntil(this.destroy$)).subscribe((edit) => {
            if (this.shouldReconcileForField(edit.FieldName)) {
                void this.reconcileSubtype();
            }
        });
        this.recordRefresh?.Refreshed$.pipe(takeUntil(this.destroy$)).subscribe(() => {
            void this.reconcileSubtype();
        });
    }

    public ngDoCheck(): void {
        if (!this.IsFoldEnabled || !this._record) return;
        const sig = this.computeWatchSignature(this._record);
        if (sig !== this.lastWatchSignature) {
            this.lastWatchSignature = sig;
            void this.reconcileSubtype();
        }
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.teardownRecordSubscription();
        this.editModeSub?.unsubscribe();
        this.editModeSub = null;
        if (this._formComponent) {
            this._formComponent.UnregisterSubtypeValidator(this);
        }
        this.destroyMountedUIDriver();
    }

    /** Validates any mounted custom `UIDriver` component (async-capable). */
    public Validate(): ValidationResult | Promise<ValidationResult> {
        if (this.mountedUIDriverRef) {
            return this.mountedUIDriverRef.instance.Validate();
        }
        const ok = new ValidationResult();
        ok.Success = true;
        return ok;
    }

    /** Synchronous validation snapshot from any mounted custom `UIDriver` component. */
    public LastKnownValidation(): ValidationResult {
        if (this.mountedUIDriverRef) {
            return this.mountedUIDriverRef.instance.LastKnownValidation();
        }
        const ok = new ValidationResult();
        ok.Success = true;
        return ok;
    }

    public OnNavigate(event: FormNavigationEvent): void {
        if (this._formComponent) {
            this._formComponent.Navigate.emit(event);
        }
        this.Navigate.emit(event);
    }

    private bindRecordSubscription(record: BaseEntity | null): void {
        if (!record) return;
        this.recordEventSub = record.RegisterEventHandler((event) => {
            if (event.type === 'load_complete' || event.type === 'save' || event.type === 'new_record') {
                void this.reconcileSubtype();
            }
        });
    }

    private teardownRecordSubscription(): void {
        this.recordEventSub?.unsubscribe();
        this.recordEventSub = null;
    }

    private shouldReconcileForField(fieldName: string): boolean {
        if (!this._record || !fieldName) return false;
        const firstHop = this.firstHopSelectorFieldName(this._record);
        if (!firstHop) {
            // Entity may use a programmatic EntitySubtypeResolver; reconcile on any parent field edit.
            return true;
        }
        return firstHop.toLowerCase() === fieldName.trim().toLowerCase();
    }

    private firstHopSelectorFieldName(record: BaseEntity): string | null {
        const path = record.EntityInfo?.SubtypeSelectorConfig?.Path?.trim();
        if (!path) return null;
        const dotIdx = path.indexOf('.');
        return dotIdx > 0 ? path.slice(0, dotIdx) : path;
    }

    private computeWatchSignature(record: BaseEntity): string {
        const firstHop = this.firstHopSelectorFieldName(record);
        const rawVal = firstHop ? record.GetFieldByName(firstHop)?.Value : undefined;
        const valKey = rawVal === null || rawVal === undefined ? '' : String(rawVal);
        const childKey = record.ISAChild ? `${record.ISAChild.EntityInfo.Name}:${record.ISAChild.IsSaved ? '1' : '0'}` : '';
        return `${valKey}|${childKey}`;
    }

    private async reconcileSubtype(): Promise<void> {
        const token = ++this.reconcileToken;
        const record = this._record;

        if (!record || !this.IsFoldEnabled) {
            this.applyResolvedState(null, null, [], null);
            return;
        }

        try {
            const prevSectionKey = this.ShouldRenderSection ? this.SectionKey : null;

            const reconciledChild = await record.ReconcileISAChild();
            if (token !== this.reconcileToken) return;

            const targetEntityName = await record.ResolveSubtypeEntityName();
            if (token !== this.reconcileToken) return;

            const uiDriverName = await record.ResolveSubtypeUIDriverName();
            if (token !== this.reconcileToken) return;

            const resolvedUIDriverKey = this.findRegisteredUIDriverKey(uiDriverName);

            let activeChild: BaseEntity | null = reconciledChild;
            let refusalMessage: string | null = null;

            const savedChild = record.ISAChild?.IsSaved ? record.ISAChild : null;
            if (savedChild && targetEntityName !== savedChild.EntityInfo.Name) {
                const policy = record.EntityInfo.SubtypeSelectorConfig?.OnSubtypeChange ?? 'Refuse';
                if (policy === 'Refuse') {
                    activeChild = savedChild;
                    refusalMessage =
                        `This record already has saved ${savedChild.EntityInfo.DisplayNameOrName} details. ` +
                        `Changing its type to ${targetEntityName ?? 'a type without that extension'} will be refused on save.`;
                } else {
                    // OnSubtypeChange === 'Replace': hide old saved child fields while editing toward a new/empty subtype
                    activeChild = null;
                }
            }

            const specs =
                activeChild && resolvedUIDriverKey === null
                    ? ResolveGeneratedSubtypeFieldSpecs(activeChild.EntityInfo, this.ProviderToUse?.CurrentUser)
                    : [];

            this.lastWatchSignature = this.computeWatchSignature(record);
            this.applyResolvedState(activeChild, resolvedUIDriverKey, specs, refusalMessage);

            const nextSectionKey = this.ShouldRenderSection ? this.SectionKey : null;
            if (prevSectionKey !== nextSectionKey) {
                // Schedule chrome refresh on next microtask after DOM updates
                Promise.resolve().then(() => {
                    if (token === this.reconcileToken) {
                        this.chrome?.NotifySectionsChanged();
                    }
                });
            }
        } catch (e) {
            LogError(
                `MjFoldedSubtypeSectionComponent.reconcileSubtype failed on ${record.EntityInfo?.Name}: ` +
                `${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }

    private findRegisteredUIDriverKey(uiDriverName: string | null): string | null {
        if (!uiDriverName) return null;
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(EntitySubtypeUIDriverBase, uiDriverName);
        return reg?.SubClass ? uiDriverName : null;
    }

    private applyResolvedState(
        child: BaseEntity | null,
        uiDriverKey: string | null,
        specs: SubtypeGeneratedFieldSpec[],
        refusalWarning: string | null,
    ): void {
        this.ActiveChildRecord = child;
        this.ActiveUIDriverKey = uiDriverKey;
        this.GeneratedFieldSpecs = specs;
        this.RefusalWarningMessage = refusalWarning;
        this.syncMountedUIDriver();
        this.cdr.markForCheck();
    }

    private syncMountedUIDriver(): void {
        const key = this.ActiveUIDriverKey;
        if (!key || !this._uiDriverHost) {
            this.destroyMountedUIDriver();
            return;
        }
        if (this.mountedUIDriverRef && this.mountedUIDriverKey === key) {
            this.pushInputsToMountedUIDriver();
            return;
        }

        this.destroyMountedUIDriver();
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(EntitySubtypeUIDriverBase, key);
        if (!reg?.SubClass) return;

        const componentType = reg.SubClass as Type<EntitySubtypeUIDriverBase>;
        const ref = this._uiDriverHost.createComponent(componentType);
        this.mountedUIDriverRef = ref;
        this.mountedUIDriverKey = key;

        const navSub = ref.instance.Navigate.subscribe((evt: FormNavigationEvent) => this.OnNavigate(evt));
        const mutSub = ref.instance.RecordMutated.subscribe(() => this.cdr.markForCheck());
        ref.onDestroy(() => {
            navSub.unsubscribe();
            mutSub.unsubscribe();
        });

        this.pushInputsToMountedUIDriver();
    }

    private pushInputsToMountedUIDriver(): void {
        if (!this.mountedUIDriverRef) return;
        const inst = this.mountedUIDriverRef.instance;
        inst.Provider = this.Provider;
        inst.Record = this._record;
        inst.ChildRecord = this.ActiveChildRecord;
        inst.EditMode = this.EditMode;
        inst.Surface = 'form-section';
        inst.FormComponent = this._formComponent;
        inst.FormContext = this.FormContext;
        this.mountedUIDriverRef.changeDetectorRef.markForCheck();
    }

    private destroyMountedUIDriver(): void {
        if (this.mountedUIDriverRef) {
            this.mountedUIDriverRef.destroy();
            this.mountedUIDriverRef = null;
            this.mountedUIDriverKey = null;
        }
        this._uiDriverHost?.clear();
    }
}

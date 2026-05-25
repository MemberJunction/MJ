import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { BaseEntity, CompositeKey, LogError, RunView } from '@memberjunction/core';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    FormHostProps,
    FormEventNames,
    FormMethodNames,
    FormBeforeSaveArgs,
    FormBeforeDeleteArgs,
    FormEditModeChangeRequestedArgs,
    isFormRole,
} from '@memberjunction/interactive-component-types/forms';
import { SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';
import { MJReactComponent, ReactBridgeService, ReactComponentEvent } from '@memberjunction/ng-react';
import { BaseFormComponent } from '../base-form-component';

/**
 * Wraps a Component (the IC kind — declared `componentRole: 'form'`) so it can
 * stand in for an Angular form on any entity.
 *
 * **Layering invariant:** the React component never touches BaseEntity. This
 * wrapper owns the entity lifecycle (`record.Save`, `record.Delete`, mode
 * transitions). The React component sees only the snapshot in
 * {@link FormHostProps} and communicates back via `BeforeSave` /
 * `BeforeDelete` / `EditModeChangeRequested` events plus its dirty-field diff.
 *
 * Instantiated by `SingleRecordComponent.LoadForm` when the resolver finds an
 * `EntityFormOverride` matching the user's scope. Behaves exactly like the
 * generated Angular form from the host's perspective: same `record` setter,
 * same `EditMode` toggle, same outputs.
 */
@Component({
    standalone: false,
    selector: 'mj-interactive-form',
    templateUrl: './interactive-form.component.html',
})
export class InteractiveFormComponent extends BaseFormComponent implements OnInit, OnDestroy {

    /**
     * The bound record. Backed by a setter so swapping records *after*
     * the component has mounted (e.g. Form Builder cockpit preview record
     * picker) triggers a fresh `originalSnapshot` capture + a
     * `formHostProps` rebuild — without this, the React form keeps
     * rendering the original record's values even after the input
     * changes. Guarded on `_recordInitialized` so the post-mount path
     * doesn't fire during the first input assignment (handled by
     * `ngOnInit`, which sets both `originalSnapshot` and `formHostProps`).
     */
    private _record!: BaseEntity;
    private _recordInitialized = false;

    @Input()
    public override set record(value: BaseEntity) {
        if (this._record === value) return;
        this._record = value;
        if (this._recordInitialized && value) {
            this.originalSnapshot = value.GetAll();
            this.rebuildFormHostProps();
            this.cdr.markForCheck();
        }
    }
    public override get record(): BaseEntity { return this._record; }

    /**
     * The Component row ID resolved for this (entity, user, roles) tuple. Set
     * by `SingleRecordComponent.LoadForm` after the resolver returns an
     * override.
     */
    @Input() public ComponentID: string | null = null;

    /**
     * Loaded ComponentSpec, parsed from the Component row's `Specification` JSON.
     *
     * Two ways to populate this:
     *   1. **Via `ComponentID`** (the standard path): set the input, ngOnInit
     *      fetches the row from `MJ: Components` and assigns the parsed spec.
     *   2. **Direct assignment** (the artifact-viewer path): the caller already
     *      has the spec in hand (parsed from an artifact JSON blob) and sets
     *      `componentSpec` directly. In that case `ComponentID` should be left
     *      null and the DB fetch is skipped.
     */
    @Input() public componentSpec: ComponentSpec | null = null;

    /**
     * When true, render the React component **without** the
     * `<mj-record-form-container>` wrapper — i.e. no toolbar (no Save /
     * Cancel / Edit / Delete / History / Tags / Lists).
     *
     * Used by the Form Builder cockpit's Preview tab where the toolbar's
     * actions don't apply (Save would save the *record*, but the cockpit's
     * own Save button saves the *spec*; History/Tags assume a real
     * persistent record, but the preview record can be a synthetic
     * NewRecord). Keeping just the form body produces a clean "this is
     * what the form looks like" view.
     */
    @Input() public previewMode = false;

    /** FormHostProps passed to the React component. Recomputed when record or mode changes. */
    public formHostProps: FormHostProps | null = null;

    /** Loaded-spec error (component row missing, JSON parse failure, etc.). */
    private _loadError: string | null = null;

    /**
     * Loaded-spec error (component row missing, JSON parse failure,
     * React-runtime bootstrap failure, etc.). Setter auto-emits
     * `LoadErrorChanged` so host surfaces (e.g. Form Builder cockpit
     * Preview tab) can show their own error state — retrospective fix #10.
     */
    public get loadError(): string | null { return this._loadError; }
    public set loadError(v: string | null) {
        if (v === this._loadError) return;
        this._loadError = v;
        this.LoadErrorChanged.emit(v);
    }

    @Output() public LoadErrorChanged = new EventEmitter<string | null>();

    /** Tracks last-known field snapshot for computing the dirty-field diff on save. */
    private originalSnapshot: Record<string, unknown> = {};

    /**
     * Reference to the mounted React component. Used by the SaveRecord /
     * CancelEdit overrides below to invoke the component's registered
     * `RequestSave` / `RequestCancel` methods when the host toolbar fires
     * Save/Cancel — so the single user-visible Save lives on the toolbar
     * (consistent with every other entity form in MJ) and not duplicated
     * inside the form body.
     */
    @ViewChild('reactComponent') public reactComponent?: MJReactComponent;

    /**
     * Promise resolver populated when `SaveRecord` invokes `RequestSave`
     * on the React component. `handleBeforeSave` resolves it after the
     * BeforeSave-driven entity save completes, so SaveRecord can return
     * a meaningful success boolean and honor `StopEditModeAfterSave`.
     */
    private pendingSaveResolver: ((success: boolean) => void) | null = null;

    private readonly changeDetector = inject(ChangeDetectorRef);
    private readonly reactBridge = inject(ReactBridgeService);

    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        // Force the React bridge to be initialized BEFORE we let our template
        // mount the `<mj-react-component>` child. Without this, the child's
        // ngAfterViewInit can race the adapter bootstrap and throw "React
        // runtime not initialized" — which then prevents the form from
        // rendering and silently breaks the save flow.
        try {
            await this.reactBridge.getReactContext();
        } catch (err) {
            LogError(`InteractiveFormComponent: React bridge bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
            this.loadError ='React runtime failed to load. Try a hard refresh.';
            return;
        }
        if (this.record) {
            this.originalSnapshot = this.record.GetAll();
            this.rebuildFormHostProps();
        }
        // Mark init complete so the `record` setter rebuilds on subsequent
        // input changes (post-mount record swaps from the Form Builder
        // cockpit preview picker, etc.). Before this flag flips, the setter
        // intentionally does nothing because ngOnInit already handles the
        // initial assignment.
        this._recordInitialized = true;
        // Direct-spec path (artifact viewer) takes precedence; DB fetch only
        // when no spec was supplied and we have an ID to look up.
        if (!this.componentSpec && this.ComponentID) {
            await this.loadComponentSpec();
        }
    }

    /**
     * Called by the React component via `mj-react-component`'s `componentEvent`
     * @Output. Maps the form-role event names to BaseEntity operations.
     */
    public async OnReactComponentEvent(event: ReactComponentEvent): Promise<void> {
        switch (event.type) {
            case FormEventNames.BeforeSave:
                await this.handleBeforeSave(event.payload as FormBeforeSaveArgs);
                break;
            case FormEventNames.BeforeDelete:
                await this.handleBeforeDelete(event.payload as FormBeforeDeleteArgs);
                break;
            case FormEventNames.EditModeChangeRequested:
                this.handleEditModeChangeRequested(event.payload as FormEditModeChangeRequestedArgs);
                break;
            // FieldChanged / DirtyStateChanged / ValidationChanged are read-only signals;
            // the wrapper doesn't need to react beyond what the component does internally.
        }
    }

    /**
     * Apply the React component's dirty-field diff to the BaseEntity, save,
     * and refresh the snapshot. Errors surface via `LatestResult.CompleteMessage`
     * per the BaseEntity Save contract.
     *
     * Resolves `pendingSaveResolver` if {@link SaveRecord} initiated this
     * flow via the toolbar — so the toolbar can return a meaningful boolean
     * and honor `StopEditModeAfterSave`.
     */
    private async handleBeforeSave(args: FormBeforeSaveArgs): Promise<void> {
        if (args.cancel) {
            this.resolvePendingSave(false);
            return;
        }
        if (!this.record) {
            LogError('InteractiveFormComponent.handleBeforeSave: no record loaded');
            this.resolvePendingSave(false);
            return;
        }

        const dirtyEntries = Object.entries(args.dirtyFields ?? {});
        if (dirtyEntries.length === 0) {
            // No-op save — most likely cause is the React draft didn't reach
            // the host before RequestSave fired. Surface it so the user sees
            // why their edits didn't land, instead of silently "succeeding".
            console.warn(
                '[InteractiveFormComponent] BeforeSave fired with no dirtyFields. ' +
                'Either the user clicked Save without changing anything, or the ' +
                'React draft did not propagate before save fired.'
            );
        }
        for (const [fieldName, value] of dirtyEntries) {
            const field = this.record.Fields.find(f =>
                f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
            if (field) {
                // Use the canonical field name from the lookup so case
                // mismatches between the React draft and the entity schema
                // don't silently drop the value.
                this.record.Set(field.Name, value);
            } else {
                console.warn(
                    `[InteractiveFormComponent] Unknown field "${fieldName}" in dirtyFields ` +
                    `for entity ${this.record.EntityInfo.Name}. Value not applied.`
                );
            }
        }

        const saved = await this.record.Save();
        if (saved) {
            this.originalSnapshot = this.record.GetAll();
            this.rebuildFormHostProps();
        } else {
            LogError(`InteractiveFormComponent: save failed for ${this.record.EntityInfo.Name}: ${this.record.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        this.resolvePendingSave(saved);
    }

    private resolvePendingSave(success: boolean): void {
        if (this.pendingSaveResolver) {
            this.pendingSaveResolver(success);
            this.pendingSaveResolver = null;
        }
    }

    private async handleBeforeDelete(args: FormBeforeDeleteArgs): Promise<void> {
        if (args.cancel) {
            return;
        }
        if (!this.record) {
            return;
        }
        const deleted = await this.record.Delete();
        if (!deleted) {
            LogError(`InteractiveFormComponent: delete failed for ${this.record.EntityInfo.Name}: ${this.record.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    private handleEditModeChangeRequested(args: FormEditModeChangeRequestedArgs): void {
        if (args.cancel) {
            return;
        }
        if (args.requestedMode === 'edit') {
            this.StartEditMode();
        } else {
            this.EndEditMode();
        }
    }

    /**
     * Propagate Angular-toolbar-driven mode changes into the React component's
     * `FormHostProps.mode`. Without these overrides, clicking Edit on the
     * `<mj-record-form-container>` toolbar flips `this.EditMode` but the React
     * side still sees `mode: 'view'`.
     */
    public override StartEditMode(): void {
        super.StartEditMode();
        this.rebuildFormHostProps();
    }

    public override EndEditMode(): void {
        super.EndEditMode();
        this.rebuildFormHostProps();
    }

    /**
     * Toolbar **Save** override. Routes the click through the React
     * component's registered `RequestSave` method so the React layer can
     * (a) run its own validation, (b) flush its draft state, (c) emit
     * `BeforeSave` with the dirty-field diff — exactly the flow the
     * in-form Save button would trigger. The wrapper then awaits the
     * BeforeSave handler via `pendingSaveResolver`, gets a real
     * success/failure boolean, and honors `StopEditModeAfterSave`.
     *
     * Falls back to the base implementation for components that haven't
     * registered `RequestSave` — preserves correctness for forms that
     * keep their own in-form Save button (older sample, hand-authored
     * forms that pre-date this contract).
     */
    public override async SaveRecord(StopEditModeAfterSave: boolean): Promise<boolean> {
        if (!this.reactComponent?.hasMethod?.(FormMethodNames.RequestSave)) {
            return super.SaveRecord(StopEditModeAfterSave);
        }
        const completion = new Promise<boolean>(resolve => {
            this.pendingSaveResolver = resolve;
        });
        try {
            this.reactComponent.invokeMethod(FormMethodNames.RequestSave);
        } catch (err) {
            this.pendingSaveResolver = null;
            LogError(`InteractiveFormComponent.SaveRecord: RequestSave threw: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
        const success = await completion;
        if (success && StopEditModeAfterSave) {
            this.EndEditMode();
        }
        return success;
    }

    /**
     * Toolbar **Cancel** override. Asks the React component to discard
     * its draft via `RequestCancel`, then flips out of edit mode the
     * same way the base implementation would. The React component is
     * expected to (a) clear its local draft state and (b) emit
     * `EditModeChangeRequested({ requestedMode: 'view' })` — though we
     * call `EndEditMode` here directly anyway, so even a no-op handler
     * leaves the form in a coherent state.
     */
    public override CancelEdit(): void {
        if (this.reactComponent?.hasMethod?.(FormMethodNames.RequestCancel)) {
            try {
                this.reactComponent.invokeMethod(FormMethodNames.RequestCancel);
            } catch (err) {
                LogError(`InteractiveFormComponent.CancelEdit: RequestCancel threw: ${err instanceof Error ? err.message : String(err)}`);
            }
            // Don't call super.CancelEdit() — base reverts the BaseEntity,
            // but for interactive forms the BaseEntity never received the
            // React draft in the first place, so there's nothing to revert.
            // Just flip mode.
            this.EndEditMode();
            return;
        }
        super.CancelEdit();
    }

    /**
     * Resolve the Component row, parse its `Specification`, and surface either
     * the spec or an error. Uses a simple-row RunView (cheap, single record)
     * and falls back to a clear error message if the spec is malformed or
     * missing.
     */
    private async loadComponentSpec(): Promise<void> {
        if (!this.ComponentID) {
            this.loadError ='No ComponentID provided to InteractiveFormComponent.';
            return;
        }
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<{ ID: string; Specification: string; Name: string }>({
                EntityName: 'MJ: Components',
                Fields: ['ID', 'Name', 'Specification'],
                ExtraFilter: `ID='${this.ComponentID}'`,
                MaxRows: 1,
                ResultType: 'simple',
                // Components have AllowCaching=1. The override row this
                // wrapper is mounting in response to may point at a
                // freshly-created Component (AI authoring path) — the
                // session-side cache won't have it yet. Bypassing the
                // cache for this one indexed lookup is cheap and avoids
                // a "Component not found" stutter on first render.
                BypassCache: true,
            }, this.ProviderToUse.CurrentUser);

            if (!result.Success || !result.Results?.length) {
                this.loadError =`Component ${this.ComponentID} not found.`;
                return;
            }

            const row = result.Results[0];
            try {
                this.componentSpec = JSON.parse(row.Specification ?? 'null') as ComponentSpec;
            } catch (err) {
                this.loadError =`Component ${row.Name ?? this.ComponentID} has invalid Specification JSON: ${err instanceof Error ? err.message : String(err)}`;
                return;
            }
            if (!this.componentSpec) {
                this.loadError =`Component ${row.Name ?? this.ComponentID} has an empty Specification.`;
                return;
            }
            // Validate the spec commits to the form-role contract. We use the
            // helper (whose signature is structural via Pick<>) so this stays
            // robust across ComponentSpec field additions.
            if (!isFormRole(this.componentSpec)) {
                this.loadError =`Component ${row.Name ?? this.ComponentID} does not declare componentRole='form'.`;
                return;
            }
        } finally {
            this.changeDetector.markForCheck();
        }
    }

    /**
     * Build `FormHostProps` from the current record + permissions + edit mode.
     * Called whenever the record loads, mode changes, or save completes.
     */
    private rebuildFormHostProps(): void {
        if (!this.record) {
            this.formHostProps = null;
            return;
        }
        const fields: SimpleEntityFieldInfo[] = this.record.Fields.map(f =>
            SimpleEntityFieldInfo.FromEntityFieldInfo(f.EntityFieldInfo));

        const pk = this.record.PrimaryKey;
        const primaryKey: Record<string, unknown> | null = (pk && pk.HasValue)
            ? this.primaryKeyToPlain(pk)
            : null;

        this.formHostProps = {
            entityName: this.record.EntityInfo.Name,
            primaryKey,
            record: this.record.GetAll(),
            entityMetadata: {
                fields,
                displayName: this.record.EntityInfo.DisplayName ?? this.record.EntityInfo.Name,
                nameField: this.record.EntityInfo.NameField?.Name,
            },
            mode: this.EditMode ? 'edit' : (pk && pk.HasValue ? 'view' : 'create'),
            canEdit: this.UserCanEdit,
            canDelete: this.UserCanDelete,
            canCreate: this.UserCanCreate,
        };
    }

    private primaryKeyToPlain(pk: CompositeKey): Record<string, unknown> {
        const obj: Record<string, unknown> = {};
        for (const kvp of pk.KeyValuePairs ?? []) {
            obj[kvp.FieldName] = kvp.Value;
        }
        return obj;
    }
}

/**
 * Tree-shaking guard. Imported and called from public-api.ts so bundlers don't
 * drop the component when no consumer references it by name.
 */
export function LoadInteractiveFormComponent(): void {
    // Force the class reference to stay live.
    if (false as boolean) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _: unknown = InteractiveFormComponent;
    }
}

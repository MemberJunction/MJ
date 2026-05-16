import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { BaseEntity, CompositeKey, LogError, RunView } from '@memberjunction/core';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    FormHostProps,
    FormEventNames,
    FormBeforeSaveArgs,
    FormBeforeDeleteArgs,
    FormEditModeChangeRequestedArgs,
} from '@memberjunction/interactive-component-types/forms';
import { SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';
import { ReactComponentEvent } from '@memberjunction/ng-react';
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

    public override record!: BaseEntity;

    /**
     * The Component row ID resolved for this (entity, user, roles) tuple. Set
     * by `SingleRecordComponent.LoadForm` after the resolver returns an
     * override.
     */
    public ComponentID: string | null = null;

    /** Loaded ComponentSpec, parsed from the Component row's `Specification` JSON. */
    public componentSpec: ComponentSpec | null = null;

    /** FormHostProps passed to the React component. Recomputed when record or mode changes. */
    public formHostProps: FormHostProps | null = null;

    /** Loaded-spec error (component row missing, JSON parse failure, etc.). */
    public loadError: string | null = null;

    /** Tracks last-known field snapshot for computing the dirty-field diff on save. */
    private originalSnapshot: Record<string, unknown> = {};

    private readonly changeDetector = inject(ChangeDetectorRef);

    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        if (this.record) {
            this.originalSnapshot = this.record.GetAll();
            this.rebuildFormHostProps();
        }
        if (this.ComponentID) {
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
     */
    private async handleBeforeSave(args: FormBeforeSaveArgs): Promise<void> {
        if (args.cancel) {
            return;
        }
        if (!this.record) {
            LogError('InteractiveFormComponent.handleBeforeSave: no record loaded');
            return;
        }

        for (const [fieldName, value] of Object.entries(args.dirtyFields ?? {})) {
            const field = this.record.Fields.find(f =>
                f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
            if (field) {
                this.record.Set(fieldName, value);
            }
        }

        const saved = await this.record.Save();
        if (saved) {
            this.originalSnapshot = this.record.GetAll();
            this.rebuildFormHostProps();
        } else {
            LogError(`InteractiveFormComponent: save failed for ${this.record.EntityInfo.Name}: ${this.record.LatestResult?.CompleteMessage ?? 'unknown error'}`);
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
     * Resolve the Component row, parse its `Specification`, and surface either
     * the spec or an error. Uses a simple-row RunView (cheap, single record)
     * and falls back to a clear error message if the spec is malformed or
     * missing.
     */
    private async loadComponentSpec(): Promise<void> {
        if (!this.ComponentID) {
            this.loadError = 'No ComponentID provided to InteractiveFormComponent.';
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
            }, this.ProviderToUse.CurrentUser);

            if (!result.Success || !result.Results?.length) {
                this.loadError = `Component ${this.ComponentID} not found.`;
                return;
            }

            const row = result.Results[0];
            try {
                this.componentSpec = JSON.parse(row.Specification ?? 'null') as ComponentSpec;
            } catch (err) {
                this.loadError = `Component ${row.Name ?? this.ComponentID} has invalid Specification JSON: ${err instanceof Error ? err.message : String(err)}`;
                return;
            }
            if (!this.componentSpec) {
                this.loadError = `Component ${row.Name ?? this.ComponentID} has an empty Specification.`;
                return;
            }
            if (this.componentSpec.componentRole && this.componentSpec.componentRole !== 'form') {
                this.loadError = `Component ${row.Name ?? this.ComponentID} declares componentRole='${this.componentSpec.componentRole}', not 'form'.`;
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

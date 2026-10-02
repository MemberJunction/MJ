import { ChangeDetectorRef, Component, DoCheck, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { LogError, ValidationResult, type BaseEntity, type CompositeKey } from '@memberjunction/core';
import { ValidationErrorInfo } from '@memberjunction/global';
import { InteractiveFormsEngine } from '@memberjunction/core-entities';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    FormPanelEventNames,
    FormPanelMethodNames,
    IsFormPanelRole,
    type FormPanelHostProps,
    type FormPanelRowCountChangedArgs,
    type FormPanelValidateResult,
    type FormFieldChangedArgs,
    type FormValidationChangedArgs,
} from '@memberjunction/interactive-component-types/forms';
import { MJReactComponent, ReactBridgeService, type ReactComponentEvent } from '@memberjunction/ng-react';
import { BaseContributionPanel } from '../panel-slot/base-contribution-panel';
import { ContributionSectionKey } from '../panel-slot/form-contribution';
import { BuildFormPanelHostProps } from './form-panel-host-props.builder';

/**
 * Generic host for a metadata form contribution (`MJ: Entity Form Contributions` row →
 * `componentRole: 'form-panel'` React component). Mounted by `<mj-form-panel-slot>` for
 * `Source: 'metadata'` winners exactly where a compiled BaseFormPanel would mount.
 *
 * Layering: the React component never touches BaseEntity. This host owns the
 * `FormPanelHostProps` snapshot and rebuilds it when the parent record's values change,
 * applies `FieldChanged` to the PARENT record (only for the fields the contribution
 * claims, and only in edit mode; the parent form's Save persists it), forwards
 * `RowCountChanged` to the rail badge, and surfaces `Validate` through
 * `BaseFormPanel.Validate()`.
 */
@Component({
    standalone: false,
    selector: 'mj-interactive-form-panel',
    templateUrl: './interactive-form-panel.component.html',
})
export class InteractiveFormPanelComponent extends BaseContributionPanel implements OnInit, DoCheck, OnDestroy {
    @ViewChild('reactComponent') public ReactComponent?: MJReactComponent;

    public componentSpec: ComponentSpec | null = null;
    public HostProps: FormPanelHostProps | null = null;

    /**
     * Load-time failure only: missing ComponentID, component not found, bad Specification
     * JSON, wrong role. A panel that throws *during render* is a different case and is
     * already contained — `<mj-react-component>` wraps every spec in the runtime's
     * error boundary (`createErrorBoundary`, `mj-react-component.component.ts`), so the
     * throw stays inside this panel's subtree and the rest of the form renders and saves
     * normally. Bind the boundary's error output to `RenderError` so the failure is
     * visible in the panel rather than silent, and log it once.
     */
    public loadError: string | null = null;
    public RenderError: string | null = null;

    private lastValidation: FormPanelValidateResult | null = null;
    private lastEditMode: boolean | null = null;
    private lastExpanded: boolean | null = null;
    /** The record's field values when {@link HostProps} was last built, by field position. */
    private shownValues: unknown[] | null = null;
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly reactBridge = inject(ReactBridgeService);

    /** Section identity — {@link ContributionSectionKey}, the key the rail files this panel by. */
    public get SectionKey(): string {
        return ContributionSectionKey(this.Contribution);
    }

    public get Title(): string {
        return this.Contribution.Title ?? this.Contribution.Metadata.contributionKey ?? this.SectionKey;
    }

    public async ngOnInit(): Promise<void> {
        try {
            await this.reactBridge.getReactContext();
        } catch (err) {
            LogError(`InteractiveFormPanelComponent: React bridge bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
            this.loadError = 'React runtime failed to load. Try a hard refresh.';
            return;
        }
        await this.loadSpec();
        this.RebuildHostProps();
    }

    /**
     * Edit mode, expanded state and the parent record's values are not inputs; detect their
     * changes cheaply. A field the user edits elsewhere on the form reaches the panel this way.
     */
    public ngDoCheck(): void {
        const edit = this.FormComponent?.EditMode ?? false;
        const expanded = this.isExpanded();
        if (edit !== this.lastEditMode || expanded !== this.lastExpanded) {
            const modeChanged = this.lastEditMode !== null && edit !== this.lastEditMode;
            this.lastEditMode = edit;
            this.lastExpanded = expanded;
            if (this.HostProps) this.RebuildHostProps();
            if (modeChanged) this.invokeIfRegistered(FormPanelMethodNames.SetEditMode, { mode: edit ? 'edit' : 'view' });
        } else if (this.HostProps && this.recordValuesChanged()) {
            this.RebuildHostProps();
        }
    }

    public ngOnDestroy(): void {
        this.HostProps = null;
        this.shownValues = null;
    }

    public RebuildHostProps(): void {
        if (!this.Record) { this.HostProps = null; this.shownValues = null; return; }
        this.shownValues = this.Record.Fields.map((f) => f.Value);
        this.HostProps = BuildFormPanelHostProps({
            Record: this.Record,
            FormComponent: this.FormComponent ?? null,
            Contribution: this.Contribution,
            SectionKey: this.SectionKey,
            Layout: this.FormComponent?.ChromeLayout ?? 'accordion',
            IsExpanded: this.isExpanded(),
        });
        this.cdr.markForCheck();
    }

    public async OnReactComponentEvent(event: ReactComponentEvent): Promise<void> {
        switch (event.type) {
            case FormPanelEventNames.RowCountChanged: {
                const args = event.payload as FormPanelRowCountChangedArgs;
                if (typeof args?.count === 'number') this.FormComponent?.SetSectionRowCount(this.SectionKey, args.count);
                break;
            }
            case FormPanelEventNames.FieldChanged: {
                const args = event.payload as FormFieldChangedArgs;
                this.applyFieldChange(args?.fieldName, args?.newValue);
                break;
            }
            case FormPanelEventNames.ValidationChanged: {
                const args = event.payload as FormValidationChangedArgs;
                this.lastValidation = { isValid: !!args?.isValid, errors: args?.errors ?? [] };
                break;
            }
        }
    }

    public OnOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
        this.FormComponent?.OnFormNavigate({ Kind: 'record', EntityName: event.entityName, PrimaryKey: event.key });
    }

    public override OnRecordRefreshed(record: BaseEntity): void {
        this.Record = record;
        this.RebuildHostProps();
        this.invokeIfRegistered(FormPanelMethodNames.OnRecordRefreshed);
    }

    /**
     * Surface the panel's validity to the parent form's Save.
     *
     * The React method may be `async` — any validator that checks something
     * server-side will be — and `invokeMethod` returns whatever the method
     * returned. Awaiting is therefore load-bearing: a synchronous `'isValid' in
     * live` test sees a Promise, fails, silently falls back to the last cached
     * `ValidationChanged` payload, and the form saves an invalid record with no
     * error and no log. Resolving a non-Promise is a no-op, so one code path
     * covers both shapes.
     */
    public override async Validate(): Promise<ValidationResult> {
        const returned = this.invokeIfRegistered<FormPanelValidateResult | Promise<FormPanelValidateResult>>(
            FormPanelMethodNames.Validate,
        );
        let live: FormPanelValidateResult | undefined;
        try {
            live = await Promise.resolve(returned);
        } catch (err) {
            LogError(`InteractiveFormPanelComponent.Validate: panel validator threw: ${err instanceof Error ? err.message : String(err)}`);
            live = undefined;
        }
        const state = live && typeof live === 'object' && 'isValid' in live ? live : this.lastValidation;
        const result = new ValidationResult();
        result.Success = state ? state.isValid : true;
        result.Errors = (state?.errors ?? []).map((message) => new ValidationErrorInfo(this.SectionKey, message, null));
        return result;
    }

    private isExpanded(): boolean {
        return this.FormComponent?.IsSectionExpanded(this.SectionKey, !this.IsRelatedClaim) ?? true;
    }

    /** True when a field of the record no longer holds the value {@link HostProps} was built from. */
    private recordValuesChanged(): boolean {
        const shown = this.shownValues;
        const fields = this.Record?.Fields;
        if (!shown || !fields) return false;
        if (fields.length !== shown.length) return true;
        for (let i = 0; i < fields.length; i++) {
            if (!Object.is(fields[i].Value, shown[i])) return true;
        }
        return false;
    }

    /**
     * Writes a panel's `FieldChanged` to the parent record: only a field the contribution claims
     * (`replacesFieldNames`), and only while the form is in edit mode. Anything else is ignored
     * and logged, so a panel cannot change a field the user did not hand it or edit a record the
     * user is only viewing.
     */
    private applyFieldChange(fieldName: string | undefined, value: unknown): void {
        if (!fieldName || !this.Record) return;
        const wanted = fieldName.trim().toLowerCase();
        const entityName = this.Record.EntityInfo.Name;
        if (!this.FormComponent?.EditMode) {
            LogError(`InteractiveFormPanelComponent: "${fieldName}" on ${entityName} changed while the form is not in edit mode; change ignored.`);
            return;
        }
        const claimed = (this.Contribution.Metadata.replacesFieldNames ?? []).some((name) => name.trim().toLowerCase() === wanted);
        if (!claimed) {
            LogError(`InteractiveFormPanelComponent: "${fieldName}" on ${entityName} is not a field this panel claims; change ignored.`);
            return;
        }
        const field = this.Record.Fields.find((f) => f.Name.trim().toLowerCase() === wanted);
        if (!field) {
            LogError(`InteractiveFormPanelComponent: unknown field "${fieldName}" on ${entityName}; change ignored.`);
            return;
        }
        // Dynamic field name from the React side — the same sanctioned Set() path the whole-form host uses.
        this.Record.Set(field.Name, value);
    }

    private invokeIfRegistered<T = unknown>(method: string, ...args: unknown[]): T | undefined {
        if (!this.ReactComponent?.hasMethod?.(method)) return undefined;
        try {
            return this.ReactComponent.invokeMethod(method, ...args) as T;
        } catch (err) {
            LogError(`InteractiveFormPanelComponent.${method}: ${err instanceof Error ? err.message : String(err)}`);
            return undefined;
        }
    }

    private async loadSpec(): Promise<void> {
        const supplied = this.Contribution?.ComponentSpec;
        if (supplied) {
            this.componentSpec = IsFormPanelRole(supplied) ? supplied : null;
            if (!this.componentSpec) this.loadError = `Component ${supplied.name} does not declare componentRole='form-panel'.`;
            this.cdr.markForCheck();
            return;
        }
        const id = this.Contribution?.ComponentID;
        if (!id) { this.loadError = 'Contribution has no ComponentID.'; return; }
        const provider = this.FormComponent?.ProviderToUse;
        try {
            if (provider) await InteractiveFormsEngine.Instance.Config(false, provider.CurrentUser, provider);
        } catch (err) {
            LogError(`InteractiveFormPanelComponent: engine Config failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        // A panel's Widget component is not in the engine's loaded forms; the engine fetches it
        // by ID once and serves every later mount of it from memory.
        const component = await InteractiveFormsEngine.Instance.GetComponentByID(id, provider?.CurrentUser, provider);
        if (!component) { this.loadError = `Component ${id} not found.`; return; }
        try {
            this.componentSpec = JSON.parse(component.Specification ?? 'null') as ComponentSpec;
        } catch (err) {
            this.loadError = `Component ${component.Name} has invalid Specification JSON: ${err instanceof Error ? err.message : String(err)}`;
            return;
        }
        if (!this.componentSpec) { this.loadError = `Component ${component.Name} has an empty Specification.`; return; }
        if (!IsFormPanelRole(this.componentSpec)) {
            this.loadError = `Component ${component.Name} does not declare componentRole='form-panel'.`;
            this.componentSpec = null;
        }
        this.cdr.markForCheck();
    }
}

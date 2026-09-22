import { ChangeDetectorRef, Component, DoCheck, Input, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { LogError, RunView, ValidationResult, type BaseEntity, type CompositeKey, type IMetadataProvider } from '@memberjunction/core';
import { ValidationErrorInfo } from '@memberjunction/global';
import { InteractiveFormsEngine, type MJComponentEntity } from '@memberjunction/core-entities';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    FormPanelEventNames,
    FormPanelMethodNames,
    isFormPanelRole,
    type FormPanelHostProps,
    type FormPanelRowCountChangedArgs,
    type FormPanelValidateResult,
    type FormFieldChangedArgs,
    type FormValidationChangedArgs,
} from '@memberjunction/interactive-component-types/forms';
import { MJReactComponent, ReactBridgeService, type ReactComponentEvent } from '@memberjunction/ng-react';
import { NormalizeIconClass } from '@memberjunction/ng-ui-components';
import { BaseFormPanel, type FormPanelRegistrationMetadata } from '../panel-slot/base-form-panel';
import { ResolveContributionKey, type FormContributionRegistration } from '../panel-slot/form-contribution';
import { BuildFormPanelHostProps } from './form-panel-host-props.builder';

/**
 * Generic host for a metadata form contribution (`MJ: Entity Form Contributions` row →
 * `componentRole: 'form-panel'` React component). Mounted by `<mj-form-panel-slot>` for
 * `Source: 'metadata'` winners exactly where a compiled BaseFormPanel would mount.
 *
 * Layering: the React component never touches BaseEntity. This host owns the
 * `FormPanelHostProps` snapshot, applies `FieldChanged` to the PARENT record (the
 * parent form's Save persists it), forwards `RowCountChanged` to the rail badge, and
 * surfaces `Validate` through `BaseFormPanel.validate()`.
 */
@Component({
    standalone: false,
    selector: 'mj-interactive-form-panel',
    templateUrl: './interactive-form-panel.component.html',
})
export class InteractiveFormPanelComponent extends BaseFormPanel implements OnInit, DoCheck, OnDestroy {
    @Input() Contribution!: FormContributionRegistration;

    @ViewChild('reactComponent') public reactComponent?: MJReactComponent;

    public componentSpec: ComponentSpec | null = null;
    public hostProps: FormPanelHostProps | null = null;

    /**
     * Load-time failure only: missing ComponentID, component not found, bad Specification
     * JSON, wrong role. A panel that throws *during render* is a different case and is
     * already contained — `<mj-react-component>` wraps every spec in the runtime's
     * error boundary (`createErrorBoundary`, `mj-react-component.component.ts`), so the
     * throw stays inside this panel's subtree and the rest of the form renders and saves
     * normally. Bind the boundary's error output to `renderError` so the failure is
     * visible in the panel rather than silent, and log it once.
     */
    public loadError: string | null = null;
    public renderError: string | null = null;

    private lastValidation: FormPanelValidateResult | null = null;
    private lastEditMode: boolean | null = null;
    private lastExpanded: boolean | null = null;
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly reactBridge = inject(ReactBridgeService);

    /** Section identity — the contribution key, or a unique fallback for keyless rows. */
    public get SectionKey(): string {
        const key = ResolveContributionKey(this.Contribution.Metadata);
        return key || `contribution:${this.Contribution.RowID ?? this.Contribution.ComponentID ?? 'unknown'}`;
    }

    public get Title(): string {
        return this.Contribution.Title ?? this.Contribution.Metadata.contributionKey ?? this.SectionKey;
    }

    /**
     * The panel's icon, completed if it was stored without a style.
     *
     * Font Awesome needs a style class beside the name: `fa-chart-column` alone matches a
     * rule that sets a glyph but no font family, so nothing draws. Rows written before the
     * picker existed carry bare names, and normalizing on the way out makes them render
     * rather than requiring each one to be edited.
     */
    public get Icon(): string {
        return NormalizeIconClass(this.Contribution.Icon) || 'fa-solid fa-puzzle-piece';
    }

    public get IsBare(): boolean {
        return (this.Contribution.Presentation ?? this.Contribution.Metadata.presentation) === 'bare';
    }

    public get IsRelatedClaim(): boolean {
        return !!this.Contribution.Metadata.relatedEntity?.trim();
    }

    /**
     * The registration this panel renders, which it holds as a whole contribution rather
     * than as the bare bag the slot host assigns. Answers `DisplayOrder` on the base.
     */
    protected override get PanelMetadata(): FormPanelRegistrationMetadata | undefined {
        return this.Contribution?.Metadata ?? super.PanelMetadata;
    }

    public get Variant(): 'default' | 'related-entity' {
        return this.IsRelatedClaim ? 'related-entity' : 'default';
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

    /** Edit mode and expanded state are not inputs; detect their transitions cheaply. */
    public ngDoCheck(): void {
        const edit = this.FormComponent?.EditMode ?? false;
        const expanded = this.isExpanded();
        if (edit !== this.lastEditMode || expanded !== this.lastExpanded) {
            const modeChanged = this.lastEditMode !== null && edit !== this.lastEditMode;
            this.lastEditMode = edit;
            this.lastExpanded = expanded;
            if (this.hostProps) this.RebuildHostProps();
            if (modeChanged) this.invokeIfRegistered(FormPanelMethodNames.SetEditMode, { mode: edit ? 'edit' : 'view' });
        }
    }

    public ngOnDestroy(): void {
        this.hostProps = null;
    }

    public RebuildHostProps(): void {
        if (!this.Record) { this.hostProps = null; return; }
        this.hostProps = BuildFormPanelHostProps({
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
    public override async validate(): Promise<ValidationResult> {
        const returned = this.invokeIfRegistered<FormPanelValidateResult | Promise<FormPanelValidateResult>>(
            FormPanelMethodNames.Validate,
        );
        let live: FormPanelValidateResult | undefined;
        try {
            live = await Promise.resolve(returned);
        } catch (err) {
            LogError(`InteractiveFormPanelComponent.validate: panel validator threw: ${err instanceof Error ? err.message : String(err)}`);
            live = undefined;
        }
        const state = live && typeof live === 'object' && 'isValid' in live ? live : this.lastValidation;
        const result = new ValidationResult();
        result.Success = state ? state.isValid : true;
        result.Errors = (state?.errors ?? []).map((message) => new ValidationErrorInfo(this.SectionKey, message, null));
        return result;
    }

    /**
     * One component, by ID. Bulk-loading every `Type='Widget'` row would put an open-ended,
     * unrelated set of specs in the engine cache (and in client local storage); scoping the
     * engine's own filter with a subquery made a failure there fatal for every form. Fetching
     * the single component a mounted panel needs costs one query per distinct panel component
     * and cannot break anything that is not already rendering it.
     */
    private async loadComponentByID(id: string, provider: IMetadataProvider): Promise<MJComponentEntity | undefined> {
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const result = await rv.RunView<MJComponentEntity>({
                EntityName: 'MJ: Components',
                ExtraFilter: `ID='${id}'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            }, provider.CurrentUser);
            if (!result.Success) {
                LogError(`InteractiveFormPanelComponent: component lookup failed for ${id}: ${result.ErrorMessage ?? 'unknown error'}`);
                return undefined;
            }
            return (result.Results ?? [])[0];
        } catch (err) {
            LogError(`InteractiveFormPanelComponent: component lookup threw for ${id}: ${err instanceof Error ? err.message : String(err)}`);
            return undefined;
        }
    }

    private isExpanded(): boolean {
        return this.FormComponent?.IsSectionExpanded(this.SectionKey, !this.IsRelatedClaim) ?? true;
    }

    private applyFieldChange(fieldName: string | undefined, value: unknown): void {
        if (!fieldName || !this.Record) return;
        const field = this.Record.Fields.find((f) => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
        if (!field) {
            LogError(`InteractiveFormPanelComponent: unknown field "${fieldName}" on ${this.Record.EntityInfo.Name}; change ignored.`);
            return;
        }
        // Dynamic field name from the React side — the same sanctioned Set() path the whole-form host uses.
        this.Record.Set(field.Name, value);
    }

    private invokeIfRegistered<T = unknown>(method: string, ...args: unknown[]): T | undefined {
        if (!this.reactComponent?.hasMethod?.(method)) return undefined;
        try {
            return this.reactComponent.invokeMethod(method, ...args) as T;
        } catch (err) {
            LogError(`InteractiveFormPanelComponent.${method}: ${err instanceof Error ? err.message : String(err)}`);
            return undefined;
        }
    }

    private async loadSpec(): Promise<void> {
        const id = this.Contribution?.ComponentID;
        if (!id) { this.loadError = 'Contribution has no ComponentID.'; return; }
        const provider = this.FormComponent?.ProviderToUse;
        try {
            if (provider) await InteractiveFormsEngine.Instance.Config(false, provider.CurrentUser, provider);
        } catch (err) {
            LogError(`InteractiveFormPanelComponent: engine Config failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        // The engine caches whole-form Components only, so a panel's Widget component is
        // normally NOT there — fetch exactly the one this contribution renders.
        let component = InteractiveFormsEngine.Instance.FindComponentByID(id);
        if (!component && provider) component = await this.loadComponentByID(id, provider);
        if (!component) { this.loadError = `Component ${id} not found.`; return; }
        try {
            this.componentSpec = JSON.parse(component.Specification ?? 'null') as ComponentSpec;
        } catch (err) {
            this.loadError = `Component ${component.Name} has invalid Specification JSON: ${err instanceof Error ? err.message : String(err)}`;
            return;
        }
        if (!this.componentSpec) { this.loadError = `Component ${component.Name} has an empty Specification.`; return; }
        if (!isFormPanelRole(this.componentSpec)) {
            this.loadError = `Component ${component.Name} does not declare componentRole='form-panel'.`;
            this.componentSpec = null;
        }
        this.cdr.markForCheck();
    }
}

/** Tree-shaking guard, mirrors LoadInteractiveFormComponent. */
export function LoadInteractiveFormPanelComponent(): void {
    if (false as boolean) {
        const _: unknown = InteractiveFormPanelComponent;
    }
}

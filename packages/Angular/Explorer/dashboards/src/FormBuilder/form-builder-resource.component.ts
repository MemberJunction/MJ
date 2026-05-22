import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnDestroy,
    inject,
} from '@angular/core';
import { LogError, RunView } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import type { MJComponentEntity, MJEntityFormOverrideEntity } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    buildCuratedFormSchema,
    type CuratedFormSchema,
} from '@memberjunction/interactive-component-types/forms';
import { generateCodeFromCanvas, toComponentIdentifier } from '../ComponentStudio/services/canvas-to-code';
import { parseCanvasFromCode } from '../ComponentStudio/services/code-to-canvas';
import {
    buildEmptyCanvas,
    generateCanvasId,
    type FormCanvasElement,
    type FormCanvasModel,
    type FormCanvasSection,
} from '../ComponentStudio/services/form-canvas-model';
import { EntityFormOverrideService } from '../ComponentStudio/services/entity-form-override.service';
import type { FormOverrideDialogResult } from '../ComponentStudio/components/form-override-dialog.component';

/**
 * Lightweight summary of a form-role Component, populated from MJ: Components
 * for the left-rail picker. Specification is loaded on demand when the user
 * actually opens a form so we don't pay the JSON parse cost N times.
 */
interface FormComponentSummary {
    ID: string;
    Name: string;
    Namespace: string | null;
    Status: string | null;
    Description: string | null;
    TargetEntityName: string | null;
}

/**
 * Form Builder resource — the standalone Form Studio canvas reachable from
 * the top-left Application rail. Provides a drag-drop canvas, field-binding
 * inspector, and EntityFormOverride activation flow that mirrors Component
 * Studio's contextual Form Builder tab but as its own dedicated workspace.
 *
 * Owns its OWN state — does NOT depend on `ComponentStudioStateService`,
 * which is provided per-Component-Studio-dashboard. The canvas and right
 * panel children are state-agnostic and accept everything via @Input/@Output.
 *
 * Per `dashboards/CLAUDE.md`, this resource MUST call `NotifyLoadComplete()`
 * after the initial load — without it, the shell loading screen hangs forever
 * on direct URL navigation (e.g. `/app/form-studio/Form%20Builder`).
 */
@RegisterClass(BaseResourceComponent, 'FormBuilderResource')
@Component({
    standalone: false,
    selector: 'mj-form-builder-resource',
    templateUrl: './form-builder-resource.component.html',
    styleUrls: ['./form-builder-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormBuilderResourceComponent
    extends BaseResourceComponent
    implements AfterViewInit, OnDestroy {

    public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Form Builder';
    }

    public async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-pen-ruler';
    }

    public LeftRailCollapsed = false;
    public RightRailCollapsed = false;
    public IsLoading = true;
    public ExistingForms: FormComponentSummary[] = [];
    public LeftRailFilter = '';

    public SelectedFormID: string | null = null;
    public SelectedFormName = '';
    public IsNewForm = false;
    public TargetEntityName: string | null = null;
    public Schema: CuratedFormSchema | null = null;
    public Canvas: FormCanvasModel | null = null;
    public SelectedElementId: string | null = null;
    public SelectedSectionId: string | null = null;
    public EditableCode = '';
    public DirtyFlag = false;

    public IsEntityPickerOpen = false;
    public EntityPickerSearch = '';
    public EntityChoices: ReadonlyArray<{ Name: string; DisplayName: string }> = [];

    public ShowFormOverrideDialog = false;
    public PendingOverrideComponentID: string | null = null;
    public PendingOverrideComponentName = '';
    public PendingOverrideEntityName = '';

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly notifications = inject(MJNotificationService);
    private readonly overrideService = inject(EntityFormOverrideService);

    private get provider(): IMetadataProvider {
        return this.ProviderToUse;
    }

    private get currentUser(): UserInfo | null {
        return this.provider?.CurrentUser ?? null;
    }

    public async ngAfterViewInit(): Promise<void> {
        try {
            this.refreshEntityChoices();
            await this.loadExistingForms();
        } catch (err) {
            LogError(`FormBuilderResource.ngAfterViewInit: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
            this.NotifyLoadComplete();
            this.registerAgentContext();
        }
    }

    public override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    private async loadExistingForms(): Promise<void> {
        const provider = this.provider;
        if (!provider) {
            this.ExistingForms = [];
            return;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<{
            ID: string;
            Name: string;
            Namespace: string | null;
            Status: string | null;
            Description: string | null;
        }>({
            EntityName: 'MJ: Components',
            ExtraFilter: "Type='Form' OR Namespace LIKE 'Forms/%' OR Namespace LIKE '%/Forms/%'",
            Fields: ['ID', 'Name', 'Namespace', 'Status', 'Description'],
            OrderBy: 'Name',
            MaxRows: 500,
            ResultType: 'simple',
        }, this.currentUser ?? undefined);

        if (!result.Success) {
            LogError(`FormBuilderResource.loadExistingForms: ${result.ErrorMessage}`);
            this.ExistingForms = [];
            return;
        }
        this.ExistingForms = (result.Results ?? []).map(r => ({
            ID: r.ID,
            Name: r.Name,
            Namespace: r.Namespace,
            Status: r.Status,
            Description: r.Description,
            TargetEntityName: null,
        }));
    }

    public get filteredForms(): ReadonlyArray<FormComponentSummary> {
        const q = this.LeftRailFilter.trim().toLowerCase();
        if (!q) return this.ExistingForms;
        return this.ExistingForms.filter(f =>
            f.Name.toLowerCase().includes(q) ||
            (f.Namespace?.toLowerCase().includes(q) ?? false));
    }

    public OnLeftRailFilterChange(event: Event): void {
        this.LeftRailFilter = (event.target as HTMLInputElement).value;
        this.cdr.markForCheck();
    }

    public ToggleLeftRail(): void {
        this.LeftRailCollapsed = !this.LeftRailCollapsed;
        this.cdr.markForCheck();
    }

    public ToggleRightRail(): void {
        this.RightRailCollapsed = !this.RightRailCollapsed;
        this.cdr.markForCheck();
    }

    public async OnFormPicked(form: FormComponentSummary): Promise<void> {
        if (this.DirtyFlag && !this.confirmDiscard()) return;
        try {
            const provider = this.provider;
            if (!provider) return;
            const componentEntity = await provider.GetEntityObject<MJComponentEntity>(
                'MJ: Components',
                this.currentUser ?? undefined,
            );
            const loaded = await componentEntity.Load(form.ID);
            if (!loaded) {
                this.notifications.CreateSimpleNotification(
                    `Couldn't load form ${form.Name}.`, 'error', 4000);
                return;
            }
            const spec = this.parseSpec(componentEntity.Specification);
            const code = spec?.code ?? '';
            // Canonical entity binding lives on the EntityFormOverride row,
            // not in the generated code (which destructures entityName as a
            // host prop, never as a string literal). Look up an active override
            // for this Component to find the entity. Fall back to the regex
            // inference for legacy/hand-authored forms that don't have an
            // override yet.
            const entityName = await this.lookupEntityForComponent(form.ID)
                ?? this.inferTargetEntityFromCode(code);
            this.SelectedFormID = form.ID;
            this.SelectedFormName = form.Name;
            this.IsNewForm = false;
            this.EditableCode = code;
            this.TargetEntityName = entityName;
            this.Schema = entityName
                ? buildCuratedFormSchema(entityName, provider)
                : null;
            this.hydrateCanvasFromCode();
            this.DirtyFlag = false;
            this.cdr.markForCheck();
            this.registerAgentContext();
        } catch (err) {
            LogError(`FormBuilderResource.OnFormPicked: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Look up an EntityFormOverride that points at this Component and return
     * the bound entity's name. Used by `OnFormPicked` to recover the target
     * entity for forms that have been activated against a real entity.
     */
    private async lookupEntityForComponent(componentID: string): Promise<string | null> {
        const provider = this.provider;
        if (!provider) return null;
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<{ EntityID: string }>({
            EntityName: 'MJ: Entity Form Overrides',
            Fields: ['EntityID'],
            ExtraFilter: `ComponentID='${componentID}'`,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        }, this.currentUser ?? undefined);
        const entityID = result.Success ? result.Results?.[0]?.EntityID : null;
        if (!entityID) return null;
        const entityInfo = provider.Entities?.find(e => UUIDsEqual(e.ID, entityID));
        return entityInfo?.Name ?? null;
    }

    public OnNewForm(): void {
        if (this.DirtyFlag && !this.confirmDiscard()) return;
        this.SelectedFormID = null;
        // Empty default — the user fills the toolbar name input, OR picking
        // an entity auto-fills it with the entity's identifier. Either path
        // produces a valid function name for the emitted code.
        this.SelectedFormName = '';
        this.IsNewForm = true;
        this.EditableCode = '';
        this.TargetEntityName = null;
        this.Schema = null;
        this.Canvas = null;
        this.SelectedElementId = null;
        this.SelectedSectionId = null;
        this.DirtyFlag = false;
        this.cdr.markForCheck();
        this.registerAgentContext();
    }

    private confirmDiscard(): boolean {
        return window.confirm('You have unsaved changes. Discard them?');
    }

    /**
     * Best-effort parse of the `Specification` JSON column on MJ: Components.
     * Returns `null` if the column is empty or malformed — callers should
     * fall back to empty-code initialization in that case.
     */
    private parseSpec(specJson: string | null): ComponentSpec | null {
        if (!specJson) return null;
        try {
            return JSON.parse(specJson) as ComponentSpec;
        } catch (err) {
            LogError(`FormBuilderResource.parseSpec: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Best-effort attempt to extract the target entity from a form
     * Component's stored code. Form components conventionally reference
     * `host.entityName` or `entityName="…"`. If we can't infer it, the user
     * needs to re-pick from the entity dropdown.
     */
    private inferTargetEntityFromCode(code: string): string | null {
        if (!code) return null;
        const m = code.match(/entityName\s*[:=]\s*['"]([^'"]+)['"]/);
        return m ? m[1] : null;
    }

    public OnFormNameInput(event: Event): void {
        this.SelectedFormName = (event.target as HTMLInputElement).value;
        this.markDirty();
        // Regenerate code so the emitted `function <Name>(...)` keeps in sync
        // with the name. Spec.name is set from this at save time.
        this.regenerateCode();
        this.cdr.markForCheck();
    }

    public ToggleEntityPicker(): void {
        this.IsEntityPickerOpen = !this.IsEntityPickerOpen;
        if (this.IsEntityPickerOpen) this.refreshEntityChoices();
        this.cdr.markForCheck();
    }

    public OnEntityPickerSearch(event: Event): void {
        this.EntityPickerSearch = (event.target as HTMLInputElement).value;
        this.cdr.markForCheck();
    }

    public get filteredEntityChoices(): ReadonlyArray<{ Name: string; DisplayName: string }> {
        const q = this.EntityPickerSearch.trim().toLowerCase();
        if (!q) return this.EntityChoices;
        return this.EntityChoices.filter(e =>
            e.Name.toLowerCase().includes(q) ||
            e.DisplayName.toLowerCase().includes(q));
    }

    public OnEntityPicked(entityName: string): void {
        const provider = this.provider;
        const schema = buildCuratedFormSchema(entityName, provider);
        if (!schema) {
            this.notifications.CreateSimpleNotification(
                `Couldn't load schema for ${entityName}.`, 'error', 4000);
            return;
        }
        this.IsEntityPickerOpen = false;
        this.TargetEntityName = entityName;
        this.Schema = schema;
        // For brand-new forms still without an explicit name, auto-fill an
        // identifier-friendly default based on the entity. The runtime
        // compiler requires the function name in the emitted code to match
        // `spec.name` exactly, so we drive both from the same source.
        if (this.IsNewForm && !this.SelectedFormName?.trim()) {
            this.SelectedFormName = toComponentIdentifier(schema.displayName);
        }
        const existing = this.EditableCode ?? '';
        if (existing.length > 0) {
            const result = parseCanvasFromCode(existing, schema);
            this.Canvas = result.canvas ?? buildEmptyCanvas(entityName, schema.displayName);
        } else {
            this.Canvas = buildEmptyCanvas(entityName, schema.displayName);
        }
        this.SelectedElementId = null;
        this.SelectedSectionId = this.Canvas?.sections[0]?.id ?? null;
        this.regenerateCode();
        this.markDirty();
        this.cdr.markForCheck();
    }

    private refreshEntityChoices(): void {
        const provider = this.provider;
        if (!provider) {
            this.EntityChoices = [];
            return;
        }
        this.EntityChoices = (provider.Entities ?? [])
            .filter(e => e.AllowCreateAPI || e.AllowUpdateAPI)
            .map(e => ({ Name: e.Name, DisplayName: e.DisplayName ?? e.Name }))
            .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName));
    }

    public OnCanvasChanged(next: FormCanvasModel): void {
        this.Canvas = next;
        this.markDirty();
        this.regenerateCode();
        this.cdr.markForCheck();
    }

    public OnElementSelected(payload: { sectionId: string; elementId: string }): void {
        this.SelectedSectionId = null;
        this.SelectedElementId = payload.elementId;
        this.cdr.markForCheck();
    }

    public OnSectionSelected(sectionId: string): void {
        this.SelectedElementId = null;
        this.SelectedSectionId = sectionId;
        this.cdr.markForCheck();
    }

    public OnDeselected(): void {
        this.SelectedElementId = null;
        this.SelectedSectionId = null;
        this.cdr.markForCheck();
    }

    public OnElementChanged(next: FormCanvasElement): void {
        if (!this.Canvas) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.map(s => ({
                ...s,
                elements: s.elements.map(e => e.id === next.id ? next : e),
            })),
        };
        this.OnCanvasChanged(updated);
    }

    public OnSectionChanged(next: FormCanvasSection): void {
        if (!this.Canvas) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.map(s => s.id === next.id ? next : s),
        };
        this.OnCanvasChanged(updated);
    }

    public OnElementDeleted(elementId: string): void {
        if (!this.Canvas) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.map(s => ({
                ...s,
                elements: s.elements.filter(e => e.id !== elementId),
            })),
        };
        this.SelectedElementId = null;
        this.OnCanvasChanged(updated);
    }

    public OnSectionDeleted(sectionId: string): void {
        if (!this.Canvas) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.filter(s => s.id !== sectionId),
        };
        this.SelectedSectionId = null;
        this.OnCanvasChanged(updated);
    }

    public OnFieldAddedFromPalette(payload: { fieldName: string }): void {
        if (!this.Canvas) return;
        const target = this.focusedSection();
        if (!target) return;
        const updated: FormCanvasModel = {
            ...this.Canvas,
            sections: this.Canvas.sections.map(s => s.id === target.id
                ? {
                    ...s,
                    elements: [...s.elements, {
                        id: generateCanvasId('field'),
                        type: 'field',
                        fieldName: payload.fieldName,
                        span: 1,
                    }],
                }
                : s),
        };
        this.OnCanvasChanged(updated);
    }

    private focusedSection(): FormCanvasSection | null {
        if (!this.Canvas) return null;
        if (this.SelectedSectionId) {
            const s = this.Canvas.sections.find(sec => sec.id === this.SelectedSectionId);
            if (s) return s;
        }
        if (this.SelectedElementId) {
            const s = this.Canvas.sections.find(sec =>
                sec.elements.some(e => e.id === this.SelectedElementId));
            if (s) return s;
        }
        return this.Canvas.sections[0] ?? null;
    }

    private regenerateCode(): void {
        try {
            if (!this.Canvas || !this.Schema) return;
            // Drive the function name from SelectedFormName so the emitted
            // `function <Name>(...)` matches `spec.name` at save time. Falls
            // back to the entity displayName for safety.
            const name = this.SelectedFormName?.trim() || this.Schema.displayName;
            const code = generateCodeFromCanvas(this.Canvas, this.Schema, name);
            this.EditableCode = code;
        } catch (err) {
            LogError(`FormBuilderResource.regenerateCode: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private hydrateCanvasFromCode(): void {
        if (!this.TargetEntityName || !this.Schema || !this.EditableCode) {
            this.Canvas = null;
            return;
        }
        const result = parseCanvasFromCode(this.EditableCode, this.Schema);
        this.Canvas = result.canvas
            ?? buildEmptyCanvas(this.TargetEntityName, this.Schema.displayName);
        this.SelectedElementId = null;
        this.SelectedSectionId = this.Canvas?.sections[0]?.id ?? null;
    }

    public async OnSave(): Promise<void> {
        if (!this.TargetEntityName) {
            this.notifications.CreateSimpleNotification(
                'Pick a target entity before saving.', 'warning', 4000);
            return;
        }
        if (!this.Canvas) {
            this.notifications.CreateSimpleNotification(
                'Nothing to save.', 'warning', 3000);
            return;
        }
        this.regenerateCode();

        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user) {
            this.notifications.CreateSimpleNotification(
                'No metadata provider or current user — cannot save.', 'error', 4000);
            return;
        }

        try {
            const componentEntity = await provider.GetEntityObject<MJComponentEntity>(
                'MJ: Components', user);
            let existingSpec: ComponentSpec | null = null;
            if (this.SelectedFormID) {
                const loaded = await componentEntity.Load(this.SelectedFormID);
                if (!loaded) {
                    this.notifications.CreateSimpleNotification(
                        `Couldn't load existing form ${this.SelectedFormName}.`, 'error', 4000);
                    return;
                }
                existingSpec = this.parseSpec(componentEntity.Specification);
            } else {
                componentEntity.NewRecord();
                // Force the persisted Name to a valid JS identifier — the
                // runtime compiler requires `spec.name` to match the emitted
                // `function <Name>(...)`. Free-form names with spaces or
                // punctuation would mismatch and fail compilation.
                const safeName = toComponentIdentifier(
                    this.SelectedFormName?.trim() || `Form for ${this.TargetEntityName}`);
                componentEntity.Name = safeName;
                this.SelectedFormName = safeName;
                componentEntity.Type = 'Form';
                componentEntity.Status = 'Draft';
                // Version is required on MJ: Components. Use semver 1.0.0 for
                // the initial cut; subsequent saves bump VersionSequence via
                // CodeGen-managed flows. (We don't bump here — the Studio is
                // editing in place, not publishing.)
                componentEntity.Version = '1.0.0';
                componentEntity.VersionSequence = 1;
                // Regenerate code with the now-canonical name so the function
                // identifier in the emitted code matches `spec.name` exactly.
                this.regenerateCode();
            }
            const specToSave: ComponentSpec = {
                ...(existingSpec ?? {}),
                name: componentEntity.Name,
                code: this.EditableCode,
            } as ComponentSpec;
            componentEntity.Specification = JSON.stringify(specToSave, null, 2);

            const saved = await componentEntity.Save();
            if (!saved) {
                this.notifications.CreateSimpleNotification(
                    componentEntity.LatestResult?.CompleteMessage
                        ?? 'Save returned false with no diagnostic.',
                    'error', 6000);
                return;
            }

            this.SelectedFormID = componentEntity.ID;
            this.DirtyFlag = false;
            await this.loadExistingForms();
            this.notifications.CreateSimpleNotification(
                `Saved ${componentEntity.Name}.`, 'success', 3000);

            this.PendingOverrideComponentID = componentEntity.ID;
            this.PendingOverrideComponentName = componentEntity.Name;
            this.PendingOverrideEntityName = this.TargetEntityName;
            this.ShowFormOverrideDialog = true;
            this.cdr.markForCheck();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`FormBuilderResource.OnSave: ${message}`);
            this.notifications.CreateSimpleNotification(
                `Save failed: ${message}`, 'error', 6000);
        }
    }

    /**
     * Delete the currently-loaded form's Component AND any EntityFormOverride
     * rows pointing at it. Without the cascade, deleting just the Component
     * would leave orphan overrides whose resolver lookups fail silently.
     */
    public async OnDelete(): Promise<void> {
        if (!this.SelectedFormID) return;
        const formID = this.SelectedFormID;
        const formName = this.SelectedFormName || 'this form';
        if (!window.confirm(`Delete "${formName}" and any overrides pointing at it? This cannot be undone.`)) {
            return;
        }
        const provider = this.provider;
        const user = this.currentUser;
        if (!provider || !user) {
            this.notifications.CreateSimpleNotification(
                'No metadata provider or current user — cannot delete.', 'error', 4000);
            return;
        }
        try {
            // Step 1 — delete overrides pointing at this Component.
            const rv = RunView.FromMetadataProvider(provider);
            const overridesResult = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Entity Form Overrides',
                Fields: ['ID'],
                ExtraFilter: `ComponentID='${formID}'`,
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            const overrideIDs = overridesResult.Success
                ? (overridesResult.Results ?? []).map(r => r.ID)
                : [];
            for (const id of overrideIDs) {
                const override = await provider.GetEntityObject<MJEntityFormOverrideEntity>(
                    'MJ: Entity Form Overrides', user);
                if (await override.Load(id)) {
                    const ok = await override.Delete();
                    if (!ok) {
                        LogError(`FormBuilderResource.OnDelete: override ${id} delete failed: ${override.LatestResult?.CompleteMessage ?? 'unknown'}`);
                    }
                }
            }

            // Step 2 — delete the Component itself.
            const componentEntity = await provider.GetEntityObject<MJComponentEntity>(
                'MJ: Components', user);
            const loaded = await componentEntity.Load(formID);
            if (!loaded) {
                this.notifications.CreateSimpleNotification(
                    `Form ${formName} not found — may have already been deleted.`, 'warning', 4000);
                await this.loadExistingForms();
                this.OnNewForm();
                return;
            }
            const deleted = await componentEntity.Delete();
            if (!deleted) {
                this.notifications.CreateSimpleNotification(
                    componentEntity.LatestResult?.CompleteMessage ?? 'Delete returned false.',
                    'error', 6000);
                return;
            }
            this.notifications.CreateSimpleNotification(
                `Deleted ${formName}${overrideIDs.length ? ` and ${overrideIDs.length} override(s)` : ''}.`,
                'success', 3000);
            await this.loadExistingForms();
            // Reset the canvas to an empty state.
            this.SelectedFormID = null;
            this.SelectedFormName = '';
            this.IsNewForm = false;
            this.TargetEntityName = null;
            this.Schema = null;
            this.Canvas = null;
            this.EditableCode = '';
            this.DirtyFlag = false;
            this.cdr.markForCheck();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`FormBuilderResource.OnDelete: ${message}`);
            this.notifications.CreateSimpleNotification(
                `Delete failed: ${message}`, 'error', 6000);
        }
    }

    public async OnFormOverrideDialogConfirm(result: FormOverrideDialogResult): Promise<void> {
        this.ShowFormOverrideDialog = false;
        if (!this.PendingOverrideComponentID) {
            this.cdr.markForCheck();
            return;
        }
        const user = this.currentUser;
        if (!user) {
            this.notifications.CreateSimpleNotification(
                'No current user — cannot create override.', 'error', 4000);
            return;
        }
        const writeResult = await this.overrideService.CreateOverride(
            this.PendingOverrideComponentID, result, user, this.provider);
        if (writeResult.Success) {
            this.notifications.CreateSimpleNotification(
                `Override "${result.Name}" created.`, 'success', 4000);
        } else {
            this.notifications.CreateSimpleNotification(
                writeResult.Error ?? 'Failed to create override.', 'warning', 6000);
        }
        this.PendingOverrideComponentID = null;
        this.cdr.markForCheck();
    }

    public OnFormOverrideDialogDismiss(): void {
        this.ShowFormOverrideDialog = false;
        this.PendingOverrideComponentID = null;
        this.cdr.markForCheck();
    }

    private registerAgentContext(): void {
        try {
            this.navigationService.SetAgentContext(this, {
                ActiveForm: this.TargetEntityName
                    ? {
                        EntityName: this.TargetEntityName,
                        FormName: this.SelectedFormName,
                        SectionCount: this.Canvas?.sections.length ?? 0,
                        IsDirty: this.DirtyFlag,
                    }
                    : null,
            });
            this.navigationService.SetAgentClientTools(this, [
                {
                    Name: 'UpdateForm',
                    Description: 'Replace the active form canvas with a new canvas model. Pass the new FormCanvasModel JSON.',
                    ParameterSchema: {
                        type: 'object',
                        properties: {
                            canvasModel: {
                                type: 'object',
                                description: 'A FormCanvasModel — sections + elements.',
                            },
                        },
                        required: ['canvasModel'],
                    },
                    Handler: async (params: Record<string, unknown>): Promise<unknown> => {
                        const canvasModel = params?.['canvasModel'] as FormCanvasModel | undefined;
                        if (!canvasModel) {
                            return { Success: false, Error: 'No canvasModel provided.' };
                        }
                        this.OnCanvasChanged(canvasModel);
                        return { Success: true };
                    },
                },
            ]);
        } catch (err) {
            LogError(`FormBuilderResource.registerAgentContext: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private markDirty(): void {
        this.DirtyFlag = true;
    }
}

/** Tree-shake protection — referenced from the dashboards module loader. */
export function LoadFormBuilderResourceComponent(): void {
    // Intentional no-op. Forces the bundler to keep this file's side effects
    // (the @RegisterClass call above) when consumers only do `import { ... }`.
}

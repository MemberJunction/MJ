import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    HostListener,
    Output,
    inject,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { LogError } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { FormMode } from '@memberjunction/interactive-component-types/forms';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';
import { GenerateCodeFromCanvas } from '../../services/canvas-to-code';
import { ParseCanvasFromCode } from '../../services/code-to-canvas';
import {
    BuildEmptyCanvas,
    GenerateCanvasId,
    type FormCanvasElement,
    type FormCanvasModel,
    type FormCanvasSection,
} from '../../services/form-canvas-model';

/**
 * Form Builder tab — the visual drag-and-drop canvas surface that appears
 * in Component Studio's editor-tabs strip when the active spec is form-role.
 *
 * The canvas is the source-of-truth while this tab is active. On save, the
 * dashboard serialises the canvas to JSX via `generateCodeFromCanvas` and
 * pushes that into `state.EditableCode`. When the user opens an existing
 * form-role Component, `parseCanvasFromCode` reconstructs the canvas
 * (lossily) from the stored code; if the round-trip is too lossy, we leave
 * the canvas empty and steer the user toward the Code tab.
 *
 * The component is presentational where it can be — the heavy state
 * (canvas, schema, selection, preview mode) lives on
 * `ComponentStudioStateService`. This keeps the right-panel and the live
 * preview pane in sync with whatever the user is doing in here.
 */
@Component({
    standalone: false,
    selector: 'mj-form-builder-tab',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './form-builder-tab.component.html',
    styleUrls: ['./form-builder-tab.component.css'],
})
export class FormBuilderTabComponent {

    /** Notifies the parent (dashboard) that the user wants to switch to the Code tab. */
    @Output() RequestCodeTab = new EventEmitter<void>();

    /** Fired separately for the dashboard's NavigationService bridge. */
    @Output() OpenInChatRequested = new EventEmitter<void>();

    public IsEntityPickerOpen = false;
    public EntityPickerSearch = '';
    public EntityChoices: Array<{ Name: string; DisplayName: string }> = [];

    public readonly State = inject(ComponentStudioStateService);

    /** @deprecated Use {@link State}. */
    public get state() {
        return this.State;
    }
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly notifications = inject(MJNotificationService);
    private readonly destroy$ = new Subject<void>();

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    ngOnInit(): void {
        this.State.StateChanged.pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.cdr.markForCheck();
        });
        // Lazily hydrate the canvas if we have a target entity but no canvas
        // (typical when the user lands here from the Code tab).
        this.hydrateCanvasFromState();
        this.refreshEntityChoices();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ------------------------------------------------------------------
    // Entity picker
    // ------------------------------------------------------------------

    public ToggleEntityPicker(): void {
        this.IsEntityPickerOpen = !this.IsEntityPickerOpen;
        if (this.IsEntityPickerOpen) this.refreshEntityChoices();
        this.cdr.markForCheck();
    }

    public OnEntityPickerSearch(event: Event): void {
        this.EntityPickerSearch = (event.target as HTMLInputElement).value;
        this.cdr.markForCheck();
    }

    public OnEntityPicked(entityName: string): void {
        this.IsEntityPickerOpen = false;
        const schema = this.State.BuildFormSchema(entityName);
        if (!schema) {
            this.notifications.CreateSimpleNotification(
                `Couldn't load schema for ${entityName}.`, 'error', 4000,
            );
            return;
        }
        this.State.FormTargetEntityName = entityName;
        // Try to seed canvas from existing code first; otherwise start empty.
        const existing = this.State.EditableCode ?? '';
        if (existing.length > 0) {
            const result = ParseCanvasFromCode(existing, schema);
            if (result.canvas) {
                this.State.FormCanvas = result.canvas;
                this.State.FormCodeOnlySectionsDetected = result.hasUnknownConstructs;
            } else {
                this.State.FormCanvas = BuildEmptyCanvas(entityName, schema.displayName);
                this.State.FormCodeOnlySectionsDetected = true;
            }
        } else {
            this.State.FormCanvas = BuildEmptyCanvas(entityName, schema.displayName);
            this.State.FormCodeOnlySectionsDetected = false;
        }
        this.State.FormSelectedElementId = null;
        this.State.FormSelectedSectionId = this.State.FormCanvas?.sections[0]?.id ?? null;
        this.regenerateCode();
        this.cdr.markForCheck();
    }

    public get FilteredEntityChoices(): Array<{ Name: string; DisplayName: string }> {
        const q = this.EntityPickerSearch.trim().toLowerCase();
        if (!q) return this.EntityChoices;
        return this.EntityChoices.filter(e =>
            e.Name.toLowerCase().includes(q) ||
            e.DisplayName.toLowerCase().includes(q));
    }

    /** @deprecated Use {@link FilteredEntityChoices}. */
    public get filteredEntityChoices(): Array<{ Name: string; DisplayName: string }> {
        return this.FilteredEntityChoices;
    }

    private refreshEntityChoices(): void {
        const provider = this.State.Provider;
        if (!provider) {
            this.EntityChoices = [];
            return;
        }
        this.EntityChoices = (provider.Entities ?? [])
            .filter(e => e.AllowCreateAPI || e.AllowUpdateAPI)
            .map(e => ({ Name: e.Name, DisplayName: e.DisplayName ?? e.Name }))
            .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName));
    }

    // ------------------------------------------------------------------
    // Preview-mode pills (synced with state.FormPreviewMode)
    // ------------------------------------------------------------------

    public SetPreviewMode(mode: FormMode): void {
        this.State.FormPreviewMode = mode;
    }

    // ------------------------------------------------------------------
    // Canvas events
    // ------------------------------------------------------------------

    public OnCanvasChanged(next: FormCanvasModel): void {
        this.State.FormCanvas = next;
        this.State.HasUnsavedChanges = true;
        this.regenerateCode();
    }

    public OnElementSelected(payload: { sectionId: string; elementId: string }): void {
        this.State.FormSelectedSectionId = null;
        this.State.FormSelectedElementId = payload.elementId;
    }

    public OnSectionSelected(sectionId: string): void {
        this.State.FormSelectedElementId = null;
        this.State.FormSelectedSectionId = sectionId;
    }

    public OnDeselected(): void {
        this.State.FormSelectedElementId = null;
        this.State.FormSelectedSectionId = null;
    }

    public OnElementChanged(next: FormCanvasElement): void {
        const canvas = this.State.FormCanvas;
        if (!canvas) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.map(s => ({
                ...s,
                elements: s.elements.map(e => e.id === next.id ? next : e),
            })),
        };
        this.OnCanvasChanged(updated);
    }

    public OnSectionChanged(next: FormCanvasSection): void {
        const canvas = this.State.FormCanvas;
        if (!canvas) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.map(s => s.id === next.id ? next : s),
        };
        this.OnCanvasChanged(updated);
    }

    public OnElementDeleted(elementId: string): void {
        const canvas = this.State.FormCanvas;
        if (!canvas) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.map(s => ({
                ...s,
                elements: s.elements.filter(e => e.id !== elementId),
            })),
        };
        this.State.FormSelectedElementId = null;
        this.OnCanvasChanged(updated);
    }

    public OnSectionDeleted(sectionId: string): void {
        const canvas = this.State.FormCanvas;
        if (!canvas) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.filter(s => s.id !== sectionId),
        };
        this.State.FormSelectedSectionId = null;
        this.OnCanvasChanged(updated);
    }

    public OnFieldAddedFromPalette(payload: { fieldName: string }): void {
        const canvas = this.State.FormCanvas;
        if (!canvas) return;
        const target = this.findFocusedSection(canvas);
        if (!target) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.map(s => s.id === target.id
                ? { ...s, elements: [...s.elements, {
                    id: GenerateCanvasId('field'),
                    type: 'field',
                    fieldName: payload.fieldName,
                    span: 1,
                }] }
                : s),
        };
        this.OnCanvasChanged(updated);
    }

    private findFocusedSection(canvas: FormCanvasModel): FormCanvasSection | null {
        if (this.State.FormSelectedSectionId) {
            const s = canvas.sections.find(s => s.id === this.State.FormSelectedSectionId);
            if (s) return s;
        }
        if (this.State.FormSelectedElementId) {
            const s = canvas.sections.find(sec =>
                sec.elements.some(e => e.id === this.State.FormSelectedElementId));
            if (s) return s;
        }
        return canvas.sections[0] ?? null;
    }

    // ------------------------------------------------------------------
    // Open in Chat
    // ------------------------------------------------------------------

    /**
     * Bubble up — the dashboard wires up `navigationService.SetAgentContext`
     * via the state event because we don't extend BaseResourceComponent
     * here. The tab also fires a local Output for the editor-tabs parent in
     * case it wants to react.
     */
    public OnOpenInChat(): void {
        this.OpenInChatRequested.emit();
        this.State.OpenInChatRequested.emit();
    }

    // ------------------------------------------------------------------
    // View Code toggle
    // ------------------------------------------------------------------

    public OnViewCode(): void {
        // Make sure the latest canvas is reflected in code before switching.
        this.regenerateCode();
        this.RequestCodeTab.emit();
    }

    // ------------------------------------------------------------------
    // Keyboard
    // ------------------------------------------------------------------

    @HostListener('document:keydown', ['$event'])
    public OnKeyDown(event: KeyboardEvent): void {
        const target = event.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (event.key === 'Delete' && !isInput && this.State.FormSelectedElementId) {
            this.OnElementDeleted(this.State.FormSelectedElementId);
        }
        if (event.key === 'Escape' && !isInput) {
            this.OnDeselected();
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Build a fresh canvas if the spec already has a target entity but no
     * canvas yet (e.g. tab activated for the first time). Best-effort — if
     * the spec's code is too lossy to parse, we leave the canvas empty and
     * show a banner.
     */
    private hydrateCanvasFromState(): void {
        const entity = this.State.FormTargetEntityName;
        if (!entity || this.State.FormCanvas) return;
        const schema = this.State.BuildFormSchema(entity);
        if (!schema) return;
        const existing = this.State.EditableCode ?? '';
        if (existing.length > 0) {
            const result = ParseCanvasFromCode(existing, schema);
            if (result.canvas) {
                this.State.FormCanvas = result.canvas;
                this.State.FormCodeOnlySectionsDetected = result.hasUnknownConstructs;
                return;
            }
        }
        this.State.FormCanvas = BuildEmptyCanvas(entity, schema.displayName);
    }

    /**
     * Mirror the canvas into ComponentStudioStateService.EditableCode so the
     * Code tab, the preview, and the eventual Save flow all see the same
     * source. Quietly no-op if we don't have enough to render.
     */
    private regenerateCode(): void {
        try {
            const canvas = this.State.FormCanvas;
            const schema = this.State.FormSchema;
            if (!canvas || !schema) return;
            const name = canvas.title?.trim() || schema.displayName;
            const code = GenerateCodeFromCanvas(canvas, schema, name);
            this.State.EditableCode = code;
        } catch (err) {
            LogError(`FormBuilderTab.regenerateCode: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

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
import { generateCodeFromCanvas } from '../../services/canvas-to-code';
import { parseCanvasFromCode } from '../../services/code-to-canvas';
import {
    buildEmptyCanvas,
    generateCanvasId,
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

    public readonly state = inject(ComponentStudioStateService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly notifications = inject(MJNotificationService);
    private readonly destroy$ = new Subject<void>();

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    ngOnInit(): void {
        this.state.StateChanged.pipe(takeUntil(this.destroy$)).subscribe(() => {
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
        const schema = this.state.BuildFormSchema(entityName);
        if (!schema) {
            this.notifications.CreateSimpleNotification(
                `Couldn't load schema for ${entityName}.`, 'error', 4000,
            );
            return;
        }
        this.state.FormTargetEntityName = entityName;
        // Try to seed canvas from existing code first; otherwise start empty.
        const existing = this.state.EditableCode ?? '';
        if (existing.length > 0) {
            const result = parseCanvasFromCode(existing, schema);
            if (result.canvas) {
                this.state.FormCanvas = result.canvas;
                this.state.FormCodeOnlySectionsDetected = result.hasUnknownConstructs;
            } else {
                this.state.FormCanvas = buildEmptyCanvas(entityName, schema.displayName);
                this.state.FormCodeOnlySectionsDetected = true;
            }
        } else {
            this.state.FormCanvas = buildEmptyCanvas(entityName, schema.displayName);
            this.state.FormCodeOnlySectionsDetected = false;
        }
        this.state.FormSelectedElementId = null;
        this.state.FormSelectedSectionId = this.state.FormCanvas?.sections[0]?.id ?? null;
        this.regenerateCode();
        this.cdr.markForCheck();
    }

    public get filteredEntityChoices(): Array<{ Name: string; DisplayName: string }> {
        const q = this.EntityPickerSearch.trim().toLowerCase();
        if (!q) return this.EntityChoices;
        return this.EntityChoices.filter(e =>
            e.Name.toLowerCase().includes(q) ||
            e.DisplayName.toLowerCase().includes(q));
    }

    private refreshEntityChoices(): void {
        const provider = this.state.Provider;
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
        this.state.FormPreviewMode = mode;
    }

    // ------------------------------------------------------------------
    // Canvas events
    // ------------------------------------------------------------------

    public OnCanvasChanged(next: FormCanvasModel): void {
        this.state.FormCanvas = next;
        this.state.HasUnsavedChanges = true;
        this.regenerateCode();
    }

    public OnElementSelected(payload: { sectionId: string; elementId: string }): void {
        this.state.FormSelectedSectionId = null;
        this.state.FormSelectedElementId = payload.elementId;
    }

    public OnSectionSelected(sectionId: string): void {
        this.state.FormSelectedElementId = null;
        this.state.FormSelectedSectionId = sectionId;
    }

    public OnDeselected(): void {
        this.state.FormSelectedElementId = null;
        this.state.FormSelectedSectionId = null;
    }

    public OnElementChanged(next: FormCanvasElement): void {
        const canvas = this.state.FormCanvas;
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
        const canvas = this.state.FormCanvas;
        if (!canvas) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.map(s => s.id === next.id ? next : s),
        };
        this.OnCanvasChanged(updated);
    }

    public OnElementDeleted(elementId: string): void {
        const canvas = this.state.FormCanvas;
        if (!canvas) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.map(s => ({
                ...s,
                elements: s.elements.filter(e => e.id !== elementId),
            })),
        };
        this.state.FormSelectedElementId = null;
        this.OnCanvasChanged(updated);
    }

    public OnSectionDeleted(sectionId: string): void {
        const canvas = this.state.FormCanvas;
        if (!canvas) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.filter(s => s.id !== sectionId),
        };
        this.state.FormSelectedSectionId = null;
        this.OnCanvasChanged(updated);
    }

    public OnFieldAddedFromPalette(payload: { fieldName: string }): void {
        const canvas = this.state.FormCanvas;
        if (!canvas) return;
        const target = this.findFocusedSection(canvas);
        if (!target) return;
        const updated: FormCanvasModel = {
            ...canvas,
            sections: canvas.sections.map(s => s.id === target.id
                ? { ...s, elements: [...s.elements, {
                    id: generateCanvasId('field'),
                    type: 'field',
                    fieldName: payload.fieldName,
                    span: 1,
                }] }
                : s),
        };
        this.OnCanvasChanged(updated);
    }

    private findFocusedSection(canvas: FormCanvasModel): FormCanvasSection | null {
        if (this.state.FormSelectedSectionId) {
            const s = canvas.sections.find(s => s.id === this.state.FormSelectedSectionId);
            if (s) return s;
        }
        if (this.state.FormSelectedElementId) {
            const s = canvas.sections.find(sec =>
                sec.elements.some(e => e.id === this.state.FormSelectedElementId));
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
        this.state.OpenInChatRequested.emit();
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
        if (event.key === 'Delete' && !isInput && this.state.FormSelectedElementId) {
            this.OnElementDeleted(this.state.FormSelectedElementId);
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
        const entity = this.state.FormTargetEntityName;
        if (!entity || this.state.FormCanvas) return;
        const schema = this.state.BuildFormSchema(entity);
        if (!schema) return;
        const existing = this.state.EditableCode ?? '';
        if (existing.length > 0) {
            const result = parseCanvasFromCode(existing, schema);
            if (result.canvas) {
                this.state.FormCanvas = result.canvas;
                this.state.FormCodeOnlySectionsDetected = result.hasUnknownConstructs;
                return;
            }
        }
        this.state.FormCanvas = buildEmptyCanvas(entity, schema.displayName);
    }

    /**
     * Mirror the canvas into ComponentStudioStateService.EditableCode so the
     * Code tab, the preview, and the eventual Save flow all see the same
     * source. Quietly no-op if we don't have enough to render.
     */
    private regenerateCode(): void {
        try {
            const canvas = this.state.FormCanvas;
            const schema = this.state.FormSchema;
            if (!canvas || !schema) return;
            const name = canvas.title?.trim() || schema.displayName;
            const code = generateCodeFromCanvas(canvas, schema, name);
            this.state.EditableCode = code;
        } catch (err) {
            LogError(`FormBuilderTab.regenerateCode: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    EventEmitter,
    Input,
    Output,
    inject,
} from '@angular/core';
import type { CuratedFormField, CuratedFormSchema } from '@memberjunction/interactive-component-types/forms';
import type { FormCanvasElement, FormCanvasModel, FormCanvasSection } from '../../services/form-canvas-model';

/**
 * Right-panel inspector. Two modes:
 *
 * 1. **Palette mode** (default — no element selected): shows the curated
 *    fields for the active entity. Each row is a CDK drag source — drop
 *    onto a section to add a field element. Includes a search filter and a
 *    "bound" badge that mirrors which fields are already on the canvas.
 *
 * 2. **Inspector mode** (element selected): shows the selected element's
 *    properties (label override, helper text, required flag, span).
 *
 * The component is presentational — it emits events but doesn't mutate
 * canvas state. The dashboard owns the canvas and applies the updates.
 */
@Component({
    standalone: false,
    selector: 'mj-form-builder-right-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './form-builder-right-panel.component.html',
    styleUrls: ['./form-builder-right-panel.component.css'],
})
export class FormBuilderRightPanelComponent {
    private _schema: CuratedFormSchema | null = null;
    @Input()
    set Schema(value: CuratedFormSchema | null) {
        this._schema = value;
        this.cdr.markForCheck();
    }
    get Schema(): CuratedFormSchema | null {
        return this._schema;
    }

    private _canvas: FormCanvasModel | null = null;
    @Input()
    set Canvas(value: FormCanvasModel | null) {
        this._canvas = value;
        this.recomputeBoundFields();
        this.cdr.markForCheck();
    }
    get Canvas(): FormCanvasModel | null {
        return this._canvas;
    }

    @Input() SelectedElementId: string | null = null;
    @Input() SelectedSectionId: string | null = null;

    /** Emitted when the user updates a property on the selected element. */
    @Output() ElementChanged = new EventEmitter<FormCanvasElement>();
    /** Emitted when the user updates a property on the selected section. */
    @Output() SectionChanged = new EventEmitter<FormCanvasSection>();
    /** Delete the currently-selected element. */
    @Output() ElementDeleted = new EventEmitter<string>();
    /** Delete the currently-selected section. */
    @Output() SectionDeleted = new EventEmitter<string>();
    /** Add a new element from the palette (drag fallback for non-DnD inputs). */
    @Output() FieldAdded = new EventEmitter<{ fieldName: string }>();

    public Search = '';
    private boundFieldNames = new Set<string>();

    private readonly cdr = inject(ChangeDetectorRef);

    public get filteredFields(): CuratedFormField[] {
        if (!this._schema) return [];
        const q = this.Search.trim().toLowerCase();
        if (!q) return this._schema.fields;
        return this._schema.fields.filter(f =>
            f.name.toLowerCase().includes(q) ||
            (f.displayName?.toLowerCase().includes(q) ?? false),
        );
    }

    public get SelectedElement(): FormCanvasElement | null {
        if (!this._canvas || !this.SelectedElementId) return null;
        for (const section of this._canvas.sections) {
            const found = section.elements.find(e => e.id === this.SelectedElementId);
            if (found) return found;
        }
        return null;
    }

    public get SelectedSection(): FormCanvasSection | null {
        if (!this._canvas || !this.SelectedSectionId) return null;
        return this._canvas.sections.find(s => s.id === this.SelectedSectionId) ?? null;
    }

    public get SelectedField(): CuratedFormField | null {
        const el = this.SelectedElement;
        if (!el || el.type !== 'field' || !el.fieldName) return null;
        return this._schema?.fields.find(f => f.name === el.fieldName) ?? null;
    }

    public isBound(fieldName: string): boolean {
        return this.boundFieldNames.has(fieldName);
    }

    public OnSearchInput(event: Event): void {
        this.Search = (event.target as HTMLInputElement).value;
    }

    public OnElementLabelInput(event: Event): void {
        const el = this.SelectedElement;
        if (!el) return;
        const next: FormCanvasElement = { ...el, label: (event.target as HTMLInputElement).value };
        this.ElementChanged.emit(next);
    }

    public OnElementHelperInput(event: Event): void {
        const el = this.SelectedElement;
        if (!el) return;
        const v = (event.target as HTMLInputElement).value;
        const next: FormCanvasElement = { ...el, helper: v.length > 0 ? v : undefined };
        this.ElementChanged.emit(next);
    }

    public OnElementRequiredChange(event: Event): void {
        const el = this.SelectedElement;
        if (!el) return;
        const next: FormCanvasElement = { ...el, required: (event.target as HTMLInputElement).checked };
        this.ElementChanged.emit(next);
    }

    public OnElementSpanChange(event: Event): void {
        const el = this.SelectedElement;
        if (!el) return;
        const v = Number((event.target as HTMLSelectElement).value);
        const next: FormCanvasElement = { ...el, span: (v === 2 ? 2 : 1) };
        this.ElementChanged.emit(next);
    }

    public OnElementTextInput(event: Event): void {
        const el = this.SelectedElement;
        if (!el) return;
        const next: FormCanvasElement = { ...el, text: (event.target as HTMLInputElement).value };
        this.ElementChanged.emit(next);
    }

    public OnElementExpressionInput(event: Event): void {
        const el = this.SelectedElement;
        if (!el) return;
        const next: FormCanvasElement = { ...el, expression: (event.target as HTMLInputElement).value };
        this.ElementChanged.emit(next);
    }

    public OnDeleteElement(): void {
        const el = this.SelectedElement;
        if (!el) return;
        this.ElementDeleted.emit(el.id);
    }

    public OnSectionTitleInput(event: Event): void {
        const s = this.SelectedSection;
        if (!s) return;
        const next: FormCanvasSection = { ...s, title: (event.target as HTMLInputElement).value };
        this.SectionChanged.emit(next);
    }

    public OnSectionColumnsChange(event: Event): void {
        const s = this.SelectedSection;
        if (!s) return;
        const v = Number((event.target as HTMLSelectElement).value);
        const next: FormCanvasSection = { ...s, columns: (v === 2 ? 2 : 1) };
        this.SectionChanged.emit(next);
    }

    public OnSectionCollapsibleChange(event: Event): void {
        const s = this.SelectedSection;
        if (!s) return;
        const next: FormCanvasSection = { ...s, collapsible: (event.target as HTMLInputElement).checked };
        this.SectionChanged.emit(next);
    }

    public OnDeleteSection(): void {
        const s = this.SelectedSection;
        if (!s) return;
        this.SectionDeleted.emit(s.id);
    }

    public OnPaletteClick(field: CuratedFormField): void {
        this.FieldAdded.emit({ fieldName: field.name });
    }

    private recomputeBoundFields(): void {
        this.boundFieldNames = new Set<string>();
        if (!this._canvas) return;
        for (const section of this._canvas.sections) {
            for (const element of section.elements) {
                if (element.type === 'field' && element.fieldName) {
                    this.boundFieldNames.add(element.fieldName);
                }
            }
        }
    }
}

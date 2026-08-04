import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    EventEmitter,
    Input,
    Output,
    inject,
} from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import type { CuratedFormSchema } from '@memberjunction/interactive-component-types/forms';
import type { FormCanvasElement, FormCanvasModel, FormCanvasSection } from '../../services/form-canvas-model';
import { buildEmptySection, generateCanvasId } from '../../services/form-canvas-model';

/**
 * Visual canvas. Owns the drag-drop UX for sections + elements + palette drops.
 *
 * The canvas itself is presentational — the dashboard owns the model and
 * applies changes here via emitted events. This keeps the canvas focused on
 * UI ergonomics while the dashboard handles dirty tracking, code mirror
 * synchronization, and undo (future).
 */
@Component({
    standalone: false,
    selector: 'mj-form-builder-canvas',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './form-builder-canvas.component.html',
    styleUrls: ['./form-builder-canvas.component.css'],
})
export class FormBuilderCanvasComponent {
    private _canvas: FormCanvasModel | null = null;
    @Input()
    set Canvas(value: FormCanvasModel | null) {
        this._canvas = value;
        this.cdr.markForCheck();
    }
    get Canvas(): FormCanvasModel | null {
        return this._canvas;
    }

    @Input() Schema: CuratedFormSchema | null = null;
    @Input() SelectedElementId: string | null = null;
    @Input() SelectedSectionId: string | null = null;

    /** Emitted when the model changes structurally (drop, delete, reorder, etc.). */
    @Output() CanvasChanged = new EventEmitter<FormCanvasModel>();
    @Output() ElementSelected = new EventEmitter<{ sectionId: string; elementId: string }>();
    @Output() SectionSelected = new EventEmitter<string>();
    @Output() Deselected = new EventEmitter<void>();

    /**
     * IDs of the section drop lists. Computed once per render so `cdkDropList`
     * `connectedTo` can wire every section to every other section, enabling
     * cross-section drag.
     */
    public get sectionListIds(): string[] {
        return (this._canvas?.sections ?? []).map(s => `section-${s.id}`);
    }

    private readonly cdr = inject(ChangeDetectorRef);

    public OnAddSection(): void {
        if (!this._canvas) return;
        const next: FormCanvasModel = {
            ...this._canvas,
            sections: [...this._canvas.sections, buildEmptySection()],
        };
        this.CanvasChanged.emit(next);
    }

    public OnAddStaticElement(sectionId: string, kind: 'static-text' | 'spacer' | 'computed'): void {
        if (!this._canvas) return;
        const next = mutateSection(this._canvas, sectionId, s => ({
            ...s,
            elements: [...s.elements, {
                id: generateCanvasId(kind),
                type: kind,
                text: kind === 'static-text' ? 'Static text' : undefined,
                expression: kind === 'computed' ? 'record?.ID' : undefined,
                label: kind === 'computed' ? 'Computed' : undefined,
            }],
        }));
        this.CanvasChanged.emit(next);
    }

    public OnDropElement(event: CdkDragDrop<FormCanvasElement[]>, sectionId: string): void {
        if (!this._canvas) return;
        // Internal reorder within the same section.
        if (event.previousContainer === event.container) {
            const next = mutateSection(this._canvas, sectionId, s => {
                const elements = [...s.elements];
                moveItemInArray(elements, event.previousIndex, event.currentIndex);
                return { ...s, elements };
            });
            this.CanvasChanged.emit(next);
            return;
        }
        // Cross-section move: extract from source, insert into target.
        const sourceId = event.previousContainer.id.replace('section-', '');
        const sourceSection = this._canvas.sections.find(s => s.id === sourceId);
        if (!sourceSection) return;
        const moved = sourceSection.elements[event.previousIndex];
        if (!moved) return;

        const next: FormCanvasModel = {
            ...this._canvas,
            sections: this._canvas.sections.map(s => {
                if (s.id === sourceId) {
                    return { ...s, elements: s.elements.filter((_, i) => i !== event.previousIndex) };
                }
                if (s.id === sectionId) {
                    const elements = [...s.elements];
                    elements.splice(event.currentIndex, 0, moved);
                    return { ...s, elements };
                }
                return s;
            }),
        };
        this.CanvasChanged.emit(next);
    }

    public OnDropSection(event: CdkDragDrop<FormCanvasSection[]>): void {
        if (!this._canvas) return;
        const sections = [...this._canvas.sections];
        moveItemInArray(sections, event.previousIndex, event.currentIndex);
        this.CanvasChanged.emit({ ...this._canvas, sections });
    }

    /** Native-DnD fallback for palette → section drop (palette uses HTML5 DnD). */
    public OnNativeDragOver(event: DragEvent): void {
        if (event.dataTransfer?.types.includes('text/x-mj-form-field')) {
            event.preventDefault();
        }
    }

    public OnNativeDrop(event: DragEvent, sectionId: string): void {
        const fieldName = event.dataTransfer?.getData('text/x-mj-form-field');
        if (!fieldName || !this._canvas) return;
        event.preventDefault();
        const next = mutateSection(this._canvas, sectionId, s => ({
            ...s,
            elements: [...s.elements, {
                id: generateCanvasId('field'),
                type: 'field',
                fieldName,
                span: 1,
            }],
        }));
        this.CanvasChanged.emit(next);
    }

    public OnElementClick(sectionId: string, elementId: string, event: Event): void {
        event.stopPropagation();
        this.ElementSelected.emit({ sectionId, elementId });
    }

    public OnSectionHeaderClick(sectionId: string, event: Event): void {
        event.stopPropagation();
        this.SectionSelected.emit(sectionId);
    }

    public OnCanvasBackgroundClick(): void {
        this.Deselected.emit();
    }

    public OnTitleInput(event: Event): void {
        if (!this._canvas) return;
        const v = (event.target as HTMLInputElement).value;
        this.CanvasChanged.emit({ ...this._canvas, title: v });
    }

    public getLabelForElement(element: FormCanvasElement): string {
        if (element.type === 'static-text') return element.text ?? 'Static text';
        if (element.type === 'spacer') return 'Spacer';
        if (element.type === 'computed') return element.label ?? 'Computed';
        if (element.type === 'field' && element.fieldName) {
            return element.label ?? this.fieldDisplayName(element.fieldName);
        }
        return element.fieldName ?? '(unknown)';
    }

    public getFieldTypeBadge(element: FormCanvasElement): string | null {
        if (element.type === 'field' && element.fieldName) {
            const f = this.Schema?.fields.find(fld => fld.name === element.fieldName);
            return f?.type ?? null;
        }
        return element.type;
    }

    public isFieldUnknown(element: FormCanvasElement): boolean {
        if (element.type !== 'field' || !element.fieldName) return false;
        return !this.Schema?.fields.some(f => f.name === element.fieldName);
    }

    private fieldDisplayName(name: string): string {
        return this.Schema?.fields.find(f => f.name === name)?.displayName ?? name;
    }
}

/** Helper: replace one section in the model, leaving others untouched. */
function mutateSection(
    canvas: FormCanvasModel,
    sectionId: string,
    fn: (s: FormCanvasSection) => FormCanvasSection,
): FormCanvasModel {
    return {
        ...canvas,
        sections: canvas.sections.map(s => s.id === sectionId ? fn(s) : s),
    };
}

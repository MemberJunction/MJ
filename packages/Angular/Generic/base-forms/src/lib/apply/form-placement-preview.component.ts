import {
    AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output,
    ViewChild, inject,
} from '@angular/core';
import { CompositeKey, LogError, Metadata, RunView, type EntityInfo } from '@memberjunction/core';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { FORM_PLACEMENT_PREVIEW, FormPlacementPreview } from '../panel-slot/placement-preview';
import type { EntityFormConfig } from '../types/entity-form-config';

/**
 * The entity's real form, scaled down, with the placement dialog's panel drawn on it.
 *
 * The form is rendered by the same host every other surface uses, with a
 * {@link FormPlacementPreview} provided to it, so the form itself places the unsaved panel,
 * hides what it replaces and gives it a rail item.
 *
 * Read-only: the form is `inert` and every answer is made in the dialog's controls. The form
 * shows the rail tab the panel is on; the preview scrolls to it.
 */
@Component({
    standalone: false,
    selector: 'mj-form-placement-preview',
    templateUrl: './form-placement-preview.component.html',
    styleUrls: ['./form-placement-preview.component.css'],
    providers: [{ provide: FORM_PLACEMENT_PREVIEW, useFactory: () => new FormPlacementPreview() }],
})
export class MjFormPlacementPreviewComponent implements AfterViewInit, OnDestroy {
    /**
     * The narrowest width the form is laid out at. A narrower column shows it scaled down; a
     * wider one shows it at its real size, never enlarged.
     */
    public static readonly MIN_STAGE_WIDTH = 1100;

    /** A form that never finishes loading must not leave the dialog without a preview. */
    private static readonly LOAD_TIMEOUT_MS = 10000;

    /** How long the answers must be still before the panel is redrawn. */
    private static readonly REDRAW_DELAY_MS = 150;

    @Input()
    set EntityName(value: string) {
        const changed = value !== this._entityName;
        this._entityName = value;
        this.showSpec();
        if (changed) void this.resolveRecord();
    }
    get EntityName(): string { return this._entityName; }

    /**
     * The record to show. Null shows a sample: the entity's first record, as Form Builder's
     * preview picks it, or a new empty record when the entity has none.
     */
    @Input()
    set RecordKey(value: CompositeKey | null) {
        this._recordKey = value;
        void this.resolveRecord();
    }

    /** The panel to draw on the form. */
    @Input()
    set Spec(value: FormContributionSpec | null) {
        this._spec = value;
        this.showSpec();
    }

    /** The saved row the panel is an edit of, left off the preview. */
    @Input()
    set ReplacesRowID(value: string | null) {
        this._replacesRowID = value;
        this.showSpec();
    }

    /** The panel's component, not saved yet. Drawn in place of the placeholder. */
    @Input()
    set PanelComponentSpec(value: ComponentSpec | null) {
        this._componentSpec = value;
        this.showSpec();
    }

    /** The saved component of the panel being edited. Drawn in place of the placeholder. */
    @Input()
    set PanelComponentID(value: string | null) {
        this._componentID = value;
        this.showSpec();
    }

    /** The form did not render, so the dialog should show its list instead. */
    @Output() Failed = new EventEmitter<void>();

    @ViewChild('viewport', { static: true }) private viewport!: ElementRef<HTMLElement>;
    @ViewChild('stage', { static: true }) private stage!: ElementRef<HTMLElement>;

    public PrimaryKey = new CompositeKey();
    /** False until the record to show is known, so the form is drawn once, not blank and then again. */
    public RecordResolved = false;
    /** Which record the preview shows, in words. */
    public RecordLabel = '';
    public readonly FormConfig: EntityFormConfig = { Toolbar: null, EnableRecordLinks: false };
    public Scale = 1;
    public StageWidth = MjFormPlacementPreviewComponent.MIN_STAGE_WIDTH;
    public StageHeight = 0;
    public Loaded = false;

    private _entityName = '';
    private _recordKey: CompositeKey | null = null;
    private resolveRun = 0;
    private _spec: FormContributionSpec | null = null;
    private _replacesRowID: string | null = null;
    private _componentSpec: ComponentSpec | null = null;
    private _componentID: string | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private mutationObserver: MutationObserver | null = null;
    private frame = 0;
    private loadTimer: ReturnType<typeof setTimeout> | null = null;
    private showTimer: ReturnType<typeof setTimeout> | null = null;
    private sizeSignature = '';
    /** Set after each redraw, until the panel has been brought into view. */
    private revealPending = false;

    private readonly preview = inject(FORM_PLACEMENT_PREVIEW);
    private readonly zone = inject(NgZone);
    private readonly cdr = inject(ChangeDetectorRef);

    public ngAfterViewInit(): void {
        this.zone.runOutsideAngular(() => {
            this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
            this.resizeObserver.observe(this.viewport.nativeElement);
            this.resizeObserver.observe(this.stage.nativeElement);
            this.mutationObserver = new MutationObserver(() => this.scheduleMeasure());
            this.mutationObserver.observe(this.stage.nativeElement, {
                childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'],
            });
        });
        this.loadTimer = setTimeout(() => { if (!this.Loaded) this.Failed.emit(); }, MjFormPlacementPreviewComponent.LOAD_TIMEOUT_MS);
    }

    public ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
        this.mutationObserver?.disconnect();
        if (this.frame) cancelAnimationFrame(this.frame);
        if (this.loadTimer) clearTimeout(this.loadTimer);
        if (this.showTimer) clearTimeout(this.showTimer);
    }

    public OnLoaded(): void {
        this.Loaded = true;
        if (this.loadTimer) clearTimeout(this.loadTimer);
        this.scheduleMeasure();
    }

    public OnLoadError(): void {
        this.Failed.emit();
    }

    /** Settles which record the form shows, then lets the form draw. */
    private async resolveRecord(): Promise<void> {
        const run = ++this.resolveRun;
        this.RecordResolved = false;
        this.Loaded = false;
        const entity = this._entityName ? Metadata.Provider?.EntityByName(this._entityName) : undefined;
        let key = this._recordKey;
        let label = key ? 'Showing the record you have open' : '';
        if (!key && entity) {
            const sample = await this.sampleRecord(entity);
            if (run !== this.resolveRun) return;
            key = sample?.Key ?? null;
            label = sample ? `Showing ${sample.Label}, a sample record` : 'Showing a new, empty record — this entity has no records yet';
        }
        this.PrimaryKey = key ?? new CompositeKey();
        this.RecordLabel = label;
        this.RecordResolved = !!this._entityName;
        this.cdr.markForCheck();
    }

    /**
     * The entity's first record, ordered the way Form Builder's preview orders it: by name when
     * the entity has a name field, so every user sees the same one, else newest first.
     */
    private async sampleRecord(entity: EntityInfo): Promise<{ Key: CompositeKey; Label: string } | null> {
        const provider = Metadata.Provider;
        if (!provider) return null;
        const nameField = entity.NameField?.Name;
        const keyFields = entity.PrimaryKeys.map((pk) => pk.Name);
        try {
            const result = await RunView.FromMetadataProvider(provider).RunView<Record<string, unknown>>({
                EntityName: entity.Name,
                Fields: nameField && !keyFields.includes(nameField) ? [...keyFields, nameField] : keyFields,
                OrderBy: nameField ? `${nameField} ASC` : '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'simple',
            }, provider.CurrentUser);
            const row = result.Success ? result.Results?.[0] : undefined;
            if (!row) return null;
            const key = CompositeKey.FromEntityRecord(entity, row);
            const name = nameField ? String(row[nameField] ?? '').trim() : '';
            return { Key: key, Label: name ? `“${name}”` : 'the first record' };
        } catch (err) {
            LogError(`MjFormPlacementPreviewComponent: sample record for ${entity.Name} failed: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Redraws the panel on the form, shortly after the last change. Each redraw remounts the
     * panel's component, so typing a label must not remount it on every key.
     */
    private showSpec(): void {
        if (this.showTimer) clearTimeout(this.showTimer);
        this.showTimer = setTimeout(() => {
            this.showTimer = null;
            const component = this._componentSpec || this._componentID
                ? { Spec: this._componentSpec, ComponentID: this._componentID }
                : null;
            this.preview.Show(this.EntityName, this._spec, this._replacesRowID, component);
            this.revealPending = true;
            this.scheduleMeasure();
        }, MjFormPlacementPreviewComponent.REDRAW_DELAY_MS);
    }

    private scheduleMeasure(): void {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.measure();
        });
    }

    /** Fit the stage to the viewport, then keep the panel in view. Enters Angular only on a change. */
    private measure(): void {
        const viewport = this.viewport.nativeElement;
        const stage = this.stage.nativeElement;
        const available = viewport.clientWidth;
        const width = available > 0 ? Math.max(MjFormPlacementPreviewComponent.MIN_STAGE_WIDTH, available) : this.StageWidth;
        const scale = available > 0 ? available / width : this.Scale;
        const height = stage.offsetHeight * scale;
        if (this.Loaded && this.revealPending) this.revealPanel(stage);
        const signature = `${width}|${scale}|${height}`;
        if (signature === this.sizeSignature) return;
        this.sizeSignature = signature;
        this.zone.run(() => {
            this.StageWidth = width;
            this.Scale = scale;
            this.StageHeight = height;
            this.cdr.markForCheck();
        });
    }

    /**
     * Scrolls the panel into view once it draws after a redraw.
     *
     * On a form with a side rail the form itself shows the tab that holds the panel; this only
     * waits for it to draw and then brings it into view.
     */
    private revealPanel(stage: HTMLElement): void {
        const panel = stage.querySelector<HTMLElement>('[data-placement-preview]');
        if (!panel) return;
        const box = (panel.querySelector('mj-collapsible-panel') ?? panel).getBoundingClientRect();
        if (box.width === 0 && box.height === 0) return;
        this.revealPending = false;
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

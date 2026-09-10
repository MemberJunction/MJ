import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
    ViewChild,
    ViewEncapsulation,
    forwardRef,
    inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ZERO_WIDTH_SPACE_PATTERN } from './engine/constants';
import { RichTextEngine } from './engine/editor';
import {
    AfterPasteEventArgs,
    BeforePasteEventArgs,
    RichTextContentChangeEvent,
    RichTextEditorConfig,
    RichTextPasteImageEvent,
    RichTextPathChangeEvent,
    RichTextToolbarItem,
    RichTextUndoStateChangeEvent,
} from './rich-text-editor.types';
import { RichTextToolbarComponent } from './toolbar/rich-text-toolbar.component';
import { DEFAULT_TOOLBAR_ITEMS } from './toolbar/toolbar-config';

/**
 * `<mj-rich-text-editor>` — the Angular face of the engine.
 *
 * A thin wrapper: it owns one `RichTextEngine` over the editable surface, forwards the
 * engine's events as `@Output`s, and speaks `ControlValueAccessor` so it drops into
 * `[(ngModel)]` and reactive forms. Everything about editing lives in the engine; this class
 * holds only what Angular needs — inputs, outputs, and the form contract.
 *
 * ```html
 * <mj-rich-text-editor
 *     [(ngModel)]="draft"
 *     [Config]="{ SanitizeProfile: 'email' }"
 *     Placeholder="Write your reply…"
 *     (PasteImage)="upload($event.File)"
 * />
 * ```
 */
@Component({
    selector: 'mj-rich-text-editor',
    standalone: true,
    imports: [RichTextToolbarComponent],
    templateUrl: './rich-text-editor.component.html',
    styleUrls: ['./rich-text-editor.component.css'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RichTextEditorComponent), multi: true }],
})
export class RichTextEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {
    private readonly changeDetector = inject(ChangeDetectorRef);

    @ViewChild('surface', { static: true }) private surface!: ElementRef<HTMLElement>;
    @ViewChild(RichTextToolbarComponent) private toolbar?: RichTextToolbarComponent;

    private engine: RichTextEngine | null = null;
    private config: RichTextEditorConfig = {};
    private disabled = false;
    private readOnly = false;
    /** A value written before the engine existed; applied when it does. */
    private pendingValue: string | null = null;
    private onChange: (value: string) => void = () => undefined;
    private onTouched: () => void = () => undefined;

    /** True while the surface holds nothing the user would see; drives the placeholder. */
    public IsEmpty = true;
    /** True while the editing surface has keyboard focus. */
    public HasFocus = false;
    /** The toolbar layout used when `ToolbarItems` is null. */
    public readonly DefaultToolbar = DEFAULT_TOOLBAR_ITEMS;
    /** A paste passed `BeforePaste` uncanceled; the next content change is its `AfterPaste`. */
    private afterPasteDue = false;

    /**
     * Engine configuration. Applied when the engine is created; changing it afterwards
     * rebuilds the engine over the current content.
     */
    @Input() set Config(value: RichTextEditorConfig | null) {
        this.config = value ?? {};
        if (this.engine) {
            const html = this.engine.GetHTML();
            this.createEngine();
            this.engine.SetHTML(html);
        }
    }
    get Config(): RichTextEditorConfig {
        return this.config;
    }

    /**
     * Content, for templates that bind a value directly rather than through a form control.
     * Re-binding the same HTML the editor just emitted is a no-op, so `[Html]="value"` with
     * `(ContentChange)="value = $event.Html"` does not disturb the caret or the undo history.
     */
    @Input() set Html(value: string | null | undefined) {
        const html = value ?? '';
        if (this.engine && this.engine.GetHTML() === html) {
            return;
        }
        this.writeValue(html);
    }
    get Html(): string {
        return this.GetHTML();
    }

    /** Toolbar layout. `null` shows the default set. */
    @Input() ToolbarItems: readonly RichTextToolbarItem[] | null = null;

    /** Whether to render the toolbar at all. */
    @Input() ShowToolbar = true;

    /** Shown while the document is empty. */
    @Input() Placeholder = '';

    /** Accessible name of the editing surface. */
    @Input() AriaLabel = 'Rich text editor';

    /** Minimum height of the editing surface, as a CSS length. */
    @Input() MinHeight = '10rem';

    /** Maximum height of the editing surface, as a CSS length; the surface scrolls beyond it. `null` for unbounded. */
    @Input() MaxHeight: string | null = null;

    /** Focus the surface once it is ready. */
    @Input() AutoFocus = false;

    /**
     * What happens to an image on the clipboard. `'event'` (default) only emits `PasteImage`
     * and inserts nothing — the host uploads it and calls `Engine.InsertImage`. `'data-uri'`
     * inlines it as a data URI, which needs no infrastructure but is blocked by many mail
     * clients and bloats the stored HTML; use it for internal forms, not for email.
     */
    @Input() ImagePaste: 'event' | 'data-uri' = 'event';

    /** Disabled: no editing, no toolbar, dimmed. Also driven by the form via `setDisabledState`. */
    @Input() set Disabled(value: boolean) {
        this.disabled = value;
        this.applyEditable();
    }
    get Disabled(): boolean {
        return this.disabled;
    }

    /** Read-only: no editing, no toolbar, but presented as content rather than dimmed. */
    @Input() set ReadOnly(value: boolean) {
        this.readOnly = value;
        this.applyEditable();
    }
    get ReadOnly(): boolean {
        return this.readOnly;
    }

    /** Content changed. `IsUserChange` is false for programmatic writes. */
    @Output() ContentChange = new EventEmitter<RichTextContentChangeEvent>();
    /** The selection moved to a structurally different position. */
    @Output() PathChange = new EventEmitter<RichTextPathChangeEvent>();
    /** What Undo and Redo would do has changed. */
    @Output() UndoStateChange = new EventEmitter<RichTextUndoStateChangeEvent>();
    /** An image arrived on the clipboard; the host decides what to do with it. */
    @Output() PasteImage = new EventEmitter<RichTextPasteImageEvent>();
    /**
     * Fired before pasted content is inserted, after sanitization. Mutate `Fragment` in place
     * or set `Cancel` to drop the paste; a canceled paste fires no `AfterPaste`.
     */
    @Output() BeforePaste = new EventEmitter<BeforePasteEventArgs>();
    /** Fired after a paste was inserted, with the resulting document HTML. */
    @Output() AfterPaste = new EventEmitter<AfterPasteEventArgs>();
    /** True on focus, false on blur. */
    @Output() FocusChange = new EventEmitter<boolean>();

    /** The engine, for hosts that need more than the toolbar offers. */
    get Engine(): RichTextEngine | null {
        return this.engine;
    }

    public ngOnInit(): void {
        this.createEngine();
        if (this.pendingValue !== null) {
            this.engine?.SetHTML(this.pendingValue);
            this.pendingValue = null;
        }
        this.updateEmptyState();
        if (this.AutoFocus) {
            this.Focus();
        }
    }

    public ngOnDestroy(): void {
        this.engine?.Destroy();
        this.engine = null;
    }

    // -----------------------------------------------------------------------
    // Public surface
    // -----------------------------------------------------------------------

    /** Serialized content, with caret ballast stripped. */
    public GetHTML(): string {
        return this.engine?.GetHTML() ?? this.pendingValue ?? '';
    }

    /** Replace the content programmatically. Emits `ContentChange` with `IsUserChange: false`. */
    public SetHTML(html: string | null | undefined): void {
        this.writeValue(html ?? '');
        this.ContentChange.emit({ Html: this.GetHTML(), IsUserChange: false });
    }

    /** Focus the editing surface, restoring the last caret position. */
    public Focus(): void {
        this.engine?.Focus();
    }

    // -----------------------------------------------------------------------
    // ControlValueAccessor
    // -----------------------------------------------------------------------

    public writeValue(value: string | null | undefined): void {
        const html = value ?? '';
        if (!this.engine) {
            this.pendingValue = html;
            return;
        }
        this.engine.SetHTML(html);
        this.updateEmptyState();
        this.changeDetector.markForCheck();
    }

    public registerOnChange(fn: (value: string) => void): void {
        this.onChange = fn;
    }

    public registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    public setDisabledState(isDisabled: boolean): void {
        this.Disabled = isDisabled;
        this.changeDetector.markForCheck();
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    private createEngine(): void {
        this.engine?.Destroy();
        const engine = new RichTextEngine(this.surface.nativeElement, this.config);
        engine.On('input', () => {
            const html = engine.GetHTML();
            this.updateEmptyState();
            this.onChange(html);
            this.ContentChange.emit({ Html: html, IsUserChange: true });
            if (this.afterPasteDue) {
                this.afterPasteDue = false;
                this.AfterPaste.emit(new AfterPasteEventArgs(html));
            }
            this.changeDetector.markForCheck();
        });
        engine.On('pathChange', (event) => this.PathChange.emit(event));
        engine.On('undoStateChange', (event) => this.UndoStateChange.emit(event));
        engine.On('pasteImage', (event) => {
            this.PasteImage.emit(event);
            if (this.ImagePaste === 'data-uri') {
                this.insertAsDataUri(event.File);
            }
        });
        engine.On('willPaste', (event) => {
            // Translate the engine's notification into the Before/After pair hosts expect.
            const args = new BeforePasteEventArgs(event.Fragment);
            this.BeforePaste.emit(args);
            if (args.Cancel) {
                event.Cancel = true;
                return;
            }
            this.afterPasteDue = true;
        });
        engine.On('focus', () => {
            this.HasFocus = true;
            this.FocusChange.emit(true);
            this.changeDetector.markForCheck();
        });
        engine.On('blur', () => {
            this.HasFocus = false;
            this.onTouched();
            this.FocusChange.emit(false);
            this.changeDetector.markForCheck();
        });
        this.engine = engine;
        this.applyEditable();
    }

    /**
     * A click on the surface's padding below the last block. When that block is a quote,
     * list, table, or code block, the caret has nowhere to go, so add a line there. This is
     * the user asking for the line — not an automatic pass over the document.
     */
    public OnSurfaceMouseDown(event: MouseEvent): void {
        const surface = this.surface.nativeElement;
        if (event.target !== surface || !this.engine || this.disabled || this.readOnly || !this.engine.NeedsTrailingLine()) {
            return;
        }
        const last = surface.lastElementChild;
        if (last && event.clientY <= last.getBoundingClientRect().bottom) {
            return;
        }
        event.preventDefault();
        this.engine.AppendTrailingLine();
        this.engine.Focus();
    }

    /** Ctrl/Cmd+K opens the link editor; the toolbar owns it. */
    public OnSurfaceKeydown(event: KeyboardEvent): void {
        const primary = event.metaKey || event.ctrlKey;
        if (!primary || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') {
            return;
        }
        if (!this.toolbar || this.disabled || this.readOnly) {
            return;
        }
        event.preventDefault();
        this.toolbar.OpenLinkEditor();
    }

    private insertAsDataUri(file: File): void {
        const reader = new FileReader();
        reader.onload = () => {
            if (this.engine && typeof reader.result === 'string') {
                this.engine.InsertImage(reader.result, file.name);
            }
        };
        reader.readAsDataURL(file);
    }

    private applyEditable(): void {
        const surface = this.surface?.nativeElement;
        if (!surface) {
            return;
        }
        surface.setAttribute('contenteditable', this.disabled || this.readOnly ? 'false' : 'true');
    }

    /** Empty means nothing renders: filler `<br>`s and caret ballast do not count. */
    private updateEmptyState(): void {
        const surface = this.surface.nativeElement;
        const text = (surface.textContent ?? '').replace(ZERO_WIDTH_SPACE_PATTERN, '').trim();
        this.IsEmpty = text === '' && !surface.querySelector('img,hr,table,iframe');
    }
}

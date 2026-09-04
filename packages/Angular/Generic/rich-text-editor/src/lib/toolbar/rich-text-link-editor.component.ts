import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    Output,
    ViewChild,
    ViewEncapsulation,
} from '@angular/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { normalizeHref } from './toolbar-config';

let nextEditorId = 0;

/**
 * The link editor: an inline popover under the toolbar, not a modal.
 *
 * Opens with the current link's address (or empty), takes focus, and closes on Apply,
 * Remove, Cancel, or Escape. The editor selection survives because the engine remembers
 * the last caret position it saw and acts on it when the command fires from here.
 */
@Component({
    selector: 'mj-rich-text-link-editor',
    standalone: true,
    imports: [MJButtonDirective],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrls: ['./rich-text-link-editor.component.css'],
    template: `
        <form class="mj-rte-link-editor" [attr.aria-labelledby]="LabelId" (submit)="OnSubmit($event)" (keydown.escape)="OnCancel()">
            <label class="mj-rte-link-editor-label" [id]="LabelId" [for]="InputId">Link address</label>
            <input
                #input
                class="mj-rte-link-editor-input"
                type="text"
                [id]="InputId"
                [value]="Href"
                (input)="OnHrefInput($event)"
                placeholder="https://example.com"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
            />
            <!-- MJ button order: destructive far left, then the affirmative action, then Cancel. -->
            <div class="mj-rte-link-editor-actions">
                @if (HasExistingLink) {
                    <button mjButton variant="danger" size="sm" type="button" (click)="OnRemove()">Remove</button>
                }
                <button mjButton variant="primary" size="sm" type="submit">Apply</button>
                <button mjButton variant="outline" size="sm" type="button" (click)="OnCancel()">Cancel</button>
            </div>
        </form>
    `,
})
export class RichTextLinkEditorComponent implements AfterViewInit {
    /** The address to start from — the selection's current link, if any. */
    @Input() set InitialHref(value: string | null) {
        this.Href = value ?? '';
    }
    get InitialHref(): string | null {
        return this.Href === '' ? null : this.Href;
    }

    /** Whether the selection is already a link, which enables Remove. */
    @Input() HasExistingLink = false;

    /** A normalized address to apply. */
    @Output() Apply = new EventEmitter<string>();
    /** Take the link off the selection. */
    @Output() Remove = new EventEmitter<void>();
    /** Close without changing anything. */
    @Output() Cancel = new EventEmitter<void>();

    @ViewChild('input', { static: true }) private input!: ElementRef<HTMLInputElement>;

    /** The address as typed so far. */
    public Href = '';
    /** Unique id for the input, so the label can point at it. */
    public readonly InputId = `mj-rte-link-input-${(nextEditorId += 1)}`;
    /** Unique id for the label, referenced by the form's `aria-labelledby`. */
    public readonly LabelId = `${this.InputId}-label`;

    public ngAfterViewInit(): void {
        const element = this.input.nativeElement;
        element.focus();
        element.select();
    }

    /** Keep `Href` in step with the input. */
    public OnHrefInput(event: Event): void {
        this.Href = (event.target as HTMLInputElement).value;
    }

    /** Apply: normalize and emit; a blank address means Remove (if linked) or Cancel. */
    public OnSubmit(event: Event): void {
        event.preventDefault();
        const href = normalizeHref(this.Href);
        if (href === '') {
            if (this.HasExistingLink) {
                this.Remove.emit();
            } else {
                this.Cancel.emit();
            }
            return;
        }
        this.Apply.emit(href);
    }

    /** Remove the existing link. */
    public OnRemove(): void {
        this.Remove.emit();
    }

    /** Dismiss without changes. */
    public OnCancel(): void {
        this.Cancel.emit();
    }
}

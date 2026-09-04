import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Input,
    OnDestroy,
    ViewEncapsulation,
    inject,
} from '@angular/core';
import { RichTextEngine } from '../engine/editor';
import { detectMacPlatform } from '../engine/keyboard/keys';
import { RichTextCommand, RichTextToolbarItem } from '../rich-text-editor.types';
import { RichTextLinkEditorComponent } from './rich-text-link-editor.component';
import { RICH_TEXT_COMMAND_DESCRIPTORS, RichTextCommandDescriptor, ariaKeyShortcuts, describeCommand } from './toolbar-config';

/** A rendered toolbar entry. */
export type RichTextToolbarRow =
    | { Kind: 'separator' }
    | { Kind: 'command'; Descriptor: RichTextCommandDescriptor; Title: string; KeyShortcuts: string | null };

/**
 * The formatting toolbar.
 *
 * Pressed state comes from the engine (`IsCommandActive`) and is refreshed on every
 * selection change, so it reflects the document rather than the last click. Buttons swallow
 * `mousedown`, which keeps the editor's selection where it was — a toolbar that steals the
 * selection on click has nothing to format.
 *
 * The buttons are native, token-styled `<button>`s rather than `mjButton`: that directive owns
 * `aria-pressed` and flips its own selected state on click, which fights a pressed state that
 * must come from the document. (The link editor's Apply/Cancel buttons do use `mjButton`.)
 *
 * Keyboard: one Tab stop, arrow keys move between buttons (WAI-ARIA toolbar pattern).
 */
@Component({
    selector: 'mj-rich-text-toolbar',
    standalone: true,
    imports: [RichTextLinkEditorComponent],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrls: ['./rich-text-toolbar.component.css'],
    template: `
        <div class="mj-rte-toolbar" role="toolbar" aria-label="Formatting" (keydown)="OnToolbarKeydown($event)">
            @for (row of Rows; track $index) {
                @if (row.Kind === 'separator') {
                    <span class="mj-rte-toolbar-separator" role="separator" aria-orientation="vertical"></span>
                } @else {
                    <button
                        type="button"
                        class="mj-rte-toolbar-button"
                        [attr.data-command]="row.Descriptor.Command"
                        [attr.aria-label]="row.Descriptor.Label"
                        [attr.aria-pressed]="PressedState(row.Descriptor)"
                        [attr.aria-keyshortcuts]="row.KeyShortcuts"
                        [title]="row.Title"
                        [class.is-active]="IsActive(row.Descriptor.Command)"
                        [disabled]="IsDisabled(row.Descriptor.Command)"
                        [tabindex]="$index === FocusIndex ? 0 : -1"
                        (mousedown)="OnButtonMouseDown($event)"
                        (focus)="FocusIndex = $index"
                        (click)="OnCommand(row.Descriptor.Command)"
                    >
                        <i [class]="row.Descriptor.Icon" aria-hidden="true"></i>
                        @if (row.Descriptor.Badge) {
                            <span class="mj-rte-toolbar-badge" aria-hidden="true">{{ row.Descriptor.Badge }}</span>
                        }
                    </button>
                }
            }
        </div>
        @if (LinkEditorOpen) {
            <mj-rich-text-link-editor
                [InitialHref]="LinkEditorHref"
                [HasExistingLink]="LinkEditorHasLink"
                (Apply)="OnLinkApply($event)"
                (Remove)="OnLinkRemove()"
                (Cancel)="OnLinkCancel()"
            />
        }
    `,
})
export class RichTextToolbarComponent implements OnDestroy {
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly changeDetector = inject(ChangeDetectorRef);
    private readonly isMac = detectMacPlatform();

    private engine: RichTextEngine | null = null;
    private readonly refresh = (): void => this.Refresh();

    /** The rendered entries, in order. */
    public Rows: RichTextToolbarRow[] = [];
    /** Index of the row that currently holds the toolbar's single Tab stop. */
    public FocusIndex = 0;
    /** Toggle commands that read as pressed for the current selection. */
    public ActiveCommands: ReadonlySet<RichTextCommand> = new Set();
    /** Whether Undo has anything to undo. */
    public CanUndo = false;
    /** Whether Redo has anything to redo. */
    public CanRedo = false;
    /** Whether the inline link editor is showing. */
    public LinkEditorOpen = false;
    /** The address the link editor opened with, or null when the selection was not a link. */
    public LinkEditorHref: string | null = null;
    /** Whether the selection was already a link when the editor opened (enables Remove). */
    public LinkEditorHasLink = false;

    /** Ordered commands and separators to render. */
    @Input() set Items(items: readonly RichTextToolbarItem[]) {
        this.items = items;
        this.Rows = items.map((item) => {
            if (item === 'separator') {
                return { Kind: 'separator' as const };
            }
            const descriptor = RICH_TEXT_COMMAND_DESCRIPTORS[item];
            return {
                Kind: 'command' as const,
                Descriptor: descriptor,
                Title: describeCommand(descriptor, this.isMac),
                KeyShortcuts: ariaKeyShortcuts(descriptor, this.isMac),
            };
        });
        this.FocusIndex = this.Rows.findIndex((row) => row.Kind === 'command');
        // Inputs arrive in any order; pressed state depends on both the engine and the rows.
        this.Refresh();
    }
    get Items(): readonly RichTextToolbarItem[] {
        return this.items;
    }
    private items: readonly RichTextToolbarItem[] = [];

    /** The engine to drive. Listeners move with it. */
    @Input() set Engine(engine: RichTextEngine | null) {
        this.detach();
        this.engine = engine;
        if (engine) {
            engine.On('pathChange', this.refresh);
            engine.On('select', this.refresh);
            engine.On('undoStateChange', this.refresh);
            engine.On('input', this.refresh);
        }
        this.Refresh();
    }
    get Engine(): RichTextEngine | null {
        return this.engine;
    }

    /** Disables every button; the editor is read-only or disabled. */
    @Input() Disabled = false;

    public ngOnDestroy(): void {
        this.detach();
    }

    /** Whether a toggle command reads as pressed for the current selection. */
    public IsActive(command: RichTextCommand): boolean {
        return this.ActiveCommands.has(command);
    }

    /** `aria-pressed` for a toggle command; null (absent) for a plain action like Undo. */
    public PressedState(descriptor: RichTextCommandDescriptor): 'true' | 'false' | null {
        if (!descriptor.IsToggle) {
            return null;
        }
        return this.IsActive(descriptor.Command) ? 'true' : 'false';
    }

    /** Whether a button is disabled: globally, or because undo/redo has nothing to do. */
    public IsDisabled(command: RichTextCommand): boolean {
        if (this.Disabled || !this.engine) {
            return true;
        }
        if (command === 'undo') {
            return !this.CanUndo;
        }
        if (command === 'redo') {
            return !this.CanRedo;
        }
        return false;
    }

    /** Keep the editor's selection: a focused toolbar button has nothing to format. */
    public OnButtonMouseDown(event: MouseEvent): void {
        event.preventDefault();
    }

    /** Run a toolbar command; `link` opens the inline link editor instead. */
    public OnCommand(command: RichTextCommand): void {
        const engine = this.engine;
        if (!engine || this.IsDisabled(command)) {
            return;
        }
        if (command === 'link') {
            this.toggleLinkEditor();
            return;
        }
        engine.ExecuteCommand(command);
        engine.Focus();
        this.Refresh();
    }

    /** The link editor submitted an address. */
    public OnLinkApply(href: string): void {
        this.engine?.MakeLink(href);
        this.closeLinkEditor();
    }

    /** The link editor asked to remove the link. */
    public OnLinkRemove(): void {
        this.engine?.RemoveLink();
        this.closeLinkEditor();
    }

    /** The link editor was dismissed without changes. */
    public OnLinkCancel(): void {
        this.closeLinkEditor();
    }

    /** Arrow keys move between buttons; Home and End jump to the ends. */
    public OnToolbarKeydown(event: KeyboardEvent): void {
        const buttons = Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button[data-command]'));
        if (buttons.length === 0) {
            return;
        }
        const current = buttons.findIndex((button) => button === event.target);
        let next: number;
        switch (event.key) {
            case 'ArrowRight':
                next = (current + 1) % buttons.length;
                break;
            case 'ArrowLeft':
                next = (current - 1 + buttons.length) % buttons.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = buttons.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        buttons[next].focus();
    }

    /** Recompute pressed and enabled state from the engine. */
    public Refresh(): void {
        const engine = this.engine;
        if (!engine) {
            this.ActiveCommands = new Set();
            this.CanUndo = false;
            this.CanRedo = false;
        } else {
            const active = new Set<RichTextCommand>();
            for (const row of this.Rows) {
                if (row.Kind === 'command' && row.Descriptor.IsToggle && engine.IsCommandActive(row.Descriptor.Command)) {
                    active.add(row.Descriptor.Command);
                }
            }
            this.ActiveCommands = active;
            this.CanUndo = engine.CanUndo;
            this.CanRedo = engine.CanRedo;
        }
        this.changeDetector.markForCheck();
    }

    /** Open the link editor for the current selection (Ctrl/Cmd+K routes here). */
    public OpenLinkEditor(): void {
        const engine = this.engine;
        if (!engine || this.Disabled) {
            return;
        }
        this.LinkEditorHref = engine.GetLinkHref();
        this.LinkEditorHasLink = this.LinkEditorHref !== null;
        this.LinkEditorOpen = true;
        this.changeDetector.markForCheck();
    }

    private toggleLinkEditor(): void {
        if (this.LinkEditorOpen) {
            this.closeLinkEditor();
            return;
        }
        this.OpenLinkEditor();
    }

    private closeLinkEditor(): void {
        this.LinkEditorOpen = false;
        this.changeDetector.markForCheck();
        this.engine?.Focus();
        this.Refresh();
    }

    private detach(): void {
        const engine = this.engine;
        if (!engine) {
            return;
        }
        engine.Off('pathChange', this.refresh);
        engine.Off('select', this.refresh);
        engine.Off('undoStateChange', this.refresh);
        engine.Off('input', this.refresh);
    }
}

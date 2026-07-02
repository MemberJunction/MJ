/**
 * @fileoverview A category-grouped, searchable AI-Prompt picker — the "slick selector" for choosing the
 * prompt that powers a `prompt` field-rule source. Loads `MJ: AI Prompts`, groups them by category, and
 * exposes the chosen prompt's ID via a two-way `Value`. Self-contained (no CDK overlay) so it drops into
 * any form.
 * @module @memberjunction/ng-entity-action-ux
 */
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    OnInit,
    Output,
    inject,
} from '@angular/core';
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { filterPromptGroups, groupPromptsByCategory, type PromptGroup, type PromptOption } from '../prompt-grouping';

@Component({
    selector: 'mj-ai-prompt-selector',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="ps" [class.ps--open]="IsOpen">
            <button type="button" class="ps-trigger" (click)="Toggle()" [attr.aria-expanded]="IsOpen">
                <span class="ps-trigger-text" [class.ps-placeholder]="!SelectedLabel">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    {{ SelectedLabel || Placeholder }}
                </span>
                <i class="fa-solid fa-chevron-down ps-caret"></i>
            </button>

            @if (IsOpen) {
                <div class="ps-panel" role="listbox">
                    <div class="ps-search">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <input #search type="text" class="mj-input" placeholder="Search prompts…"
                            [value]="Filter" (input)="OnFilter($event)" />
                    </div>
                    <div class="ps-list">
                        @if (Loading) {
                            <div class="ps-empty">Loading prompts…</div>
                        } @else if (FilteredGroups.length === 0) {
                            <div class="ps-empty">No prompts match “{{ Filter }}”.</div>
                        } @else {
                            @for (group of FilteredGroups; track group.Category) {
                                <div class="ps-group-label">{{ group.Category }}</div>
                                @for (p of group.Prompts; track p.ID) {
                                    <div class="ps-option" role="option"
                                        [class.ps-option--selected]="IsSelected(p)"
                                        (click)="Select(p)">
                                        <span>{{ p.Name }}</span>
                                        @if (IsSelected(p)) { <i class="fa-solid fa-check"></i> }
                                    </div>
                                }
                            }
                        }
                    </div>
                </div>
            }
        </div>
    `,
    styles: [`
        .ps { position: relative; width: 100%; }
        .ps-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px;
            padding: 8px 12px; background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm, 6px); color: var(--mj-text-primary); cursor: pointer; font-size: 14px; }
        .ps--open .ps-trigger { border-color: var(--mj-border-focus); }
        .ps-trigger-text { display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ps-trigger-text i { color: var(--mj-brand-primary); }
        .ps-placeholder { color: var(--mj-text-muted); }
        .ps-caret { color: var(--mj-text-muted); font-size: 12px; transition: transform .15s ease; }
        .ps--open .ps-caret { transform: rotate(180deg); }
        .ps-panel { position: absolute; z-index: 50; top: calc(100% + 4px); left: 0; right: 0; max-height: 320px;
            display: flex; flex-direction: column; background: var(--mj-bg-surface-elevated, var(--mj-bg-surface));
            border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md, 8px);
            box-shadow: var(--mj-shadow-md, 0 6px 20px rgba(0,0,0,.12)); overflow: hidden; }
        .ps-search { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--mj-border-subtle); }
        .ps-search i { color: var(--mj-text-muted); }
        .ps-search input { flex: 1; border: none; outline: none; background: transparent; color: var(--mj-text-primary); }
        .ps-list { overflow-y: auto; padding: 4px 0; }
        .ps-group-label { padding: 6px 12px 2px; font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: .04em; color: var(--mj-text-muted); }
        .ps-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 12px 7px 22px;
            cursor: pointer; font-size: 14px; color: var(--mj-text-primary); }
        .ps-option:hover { background: var(--mj-bg-surface-hover); }
        .ps-option--selected { color: var(--mj-brand-primary); font-weight: 600; }
        .ps-option i { color: var(--mj-brand-primary); }
        .ps-empty { padding: 16px; text-align: center; color: var(--mj-text-muted); font-size: 13px; }
    `],
})
export class AIPromptSelectorComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private host = inject(ElementRef);

    /** The selected prompt's ID (two-way bindable). */
    @Input() Value: string | null = null;
    @Output() ValueChange = new EventEmitter<string | null>();

    /** Placeholder shown when nothing is selected. */
    @Input() Placeholder = 'Select an AI prompt…';

    /** Metadata provider (multi-provider). Falls back to the global default when null. */
    @Input() Provider: IMetadataProvider | null = null;

    public IsOpen = false;
    public Loading = true;
    public Filter = '';
    public Groups: PromptGroup[] = [];

    private allPrompts: PromptOption[] = [];

    async ngOnInit(): Promise<void> {
        await this.loadPrompts();
    }

    get SelectedLabel(): string {
        return this.allPrompts.find((p) => UUIDsEqual(p.ID, this.Value ?? ''))?.Name ?? '';
    }

    /** True when the given prompt is the selected one (UUID-safe across SQL Server / PostgreSQL). */
    IsSelected(prompt: PromptOption): boolean {
        return UUIDsEqual(prompt.ID, this.Value ?? '');
    }

    get FilteredGroups(): PromptGroup[] {
        return filterPromptGroups(this.Groups, this.Filter);
    }

    Toggle(): void {
        this.IsOpen = !this.IsOpen;
        if (this.IsOpen) this.Filter = '';
        this.cdr.detectChanges();
    }

    Select(p: PromptOption): void {
        this.Value = p.ID;
        this.ValueChange.emit(p.ID);
        this.IsOpen = false;
        this.cdr.detectChanges();
    }

    OnFilter(event: Event): void {
        this.Filter = (event.target as HTMLInputElement).value;
        this.cdr.detectChanges();
    }

    /** Close when clicking outside the component. */
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (this.IsOpen && !this.host.nativeElement.contains(event.target)) {
            this.IsOpen = false;
            this.cdr.detectChanges();
        }
    }

    private async loadPrompts(): Promise<void> {
        const runView = this.Provider ? RunView.FromMetadataProvider(this.Provider) : new RunView();
        const rv = await runView.RunView<PromptOption>({
            EntityName: 'MJ: AI Prompts',
            Fields: ['ID', 'Name', 'Category'],
            ExtraFilter: `Status='Active'`,
            OrderBy: 'Category, Name',
            ResultType: 'simple',
        });
        this.allPrompts = rv.Success ? (rv.Results ?? []) : [];
        this.Groups = groupPromptsByCategory(this.allPrompts);
        this.Loading = false;
        this.cdr.detectChanges();
    }
}

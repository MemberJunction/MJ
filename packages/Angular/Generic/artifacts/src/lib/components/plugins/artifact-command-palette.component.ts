import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

export interface ArtifactCommandPaletteItem {
  Id: string;
  Label: string;
  Category: string;
  Icon: string;
  Shortcut?: string;
  Description?: string;
  Active?: boolean;
  Disabled?: boolean;
}

/**
 * Shared standalone Cmd/Ctrl+K command palette across Docs, Sheets, and Slides viewers.
 * Gives power users keyboard-first access to every mode, layout, theme, freeze, lock, diff,
 * and export action without cluttering the calm single-row top toolbar.
 */
@Component({
  selector: 'mj-artifact-command-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (Open) {
      <div
        class="mj-cmdk-backdrop"
        role="presentation"
        data-testid="artifact-cmdk-backdrop"
        (click)="OnBackdropClick($event)"
      >
        <div
          class="mj-cmdk-dialog"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="Title"
          data-testid="artifact-cmdk-dialog"
          (keydown)="OnKeydown($event)"
        >
          <div class="mj-cmdk-search-row">
            <i class="fa-solid fa-magnifying-glass mj-cmdk-search-icon" aria-hidden="true"></i>
            <input
              #searchInput
              type="text"
              class="mj-cmdk-input"
              [value]="Query"
              [placeholder]="Placeholder"
              [attr.aria-label]="Placeholder"
              data-testid="artifact-cmdk-input"
              (input)="OnQueryInput($event)"
            />
            <span class="mj-cmdk-kbd">ESC</span>
          </div>

          <div class="mj-cmdk-list" role="listbox" data-testid="artifact-cmdk-list">
            @if (FilteredItems.length === 0) {
              <div class="mj-cmdk-empty">No matching commands</div>
            } @else {
              @for (item of FilteredItems; track item.Id; let idx = $index) {
                <button
                  type="button"
                  role="option"
                  class="mj-cmdk-item"
                  [class.highlighted]="idx === SelectedIndex"
                  [class.active]="item.Active"
                  [disabled]="item.Disabled"
                  [attr.aria-selected]="idx === SelectedIndex"
                  [attr.data-testid]="'cmdk-item-' + item.Id"
                  (mouseenter)="SelectedIndex = idx"
                  (click)="SelectItem(item)"
                >
                  <span class="mj-cmdk-item-left">
                    <i class="fa-solid mj-cmdk-item-icon" [class]="item.Icon" aria-hidden="true"></i>
                    <span class="mj-cmdk-item-text">
                      <span class="mj-cmdk-item-label">{{ item.Label }}</span>
                      @if (item.Description) {
                        <span class="mj-cmdk-item-desc">{{ item.Description }}</span>
                      }
                    </span>
                  </span>
                  <span class="mj-cmdk-item-right">
                    <span class="mj-cmdk-cat">{{ item.Category }}</span>
                    @if (item.Shortcut) {
                      <span class="mj-cmdk-kbd">{{ item.Shortcut }}</span>
                    }
                  </span>
                </button>
              }
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .mj-cmdk-backdrop {
        position: fixed;
        inset: 0;
        background: var(--mj-bg-overlay);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 72px 16px 24px;
        z-index: var(--mj-z-dialog, 1200);
      }

      .mj-cmdk-dialog {
        width: 100%;
        max-width: 520px;
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-strong);
        border-radius: 14px;
        box-shadow: var(--mj-shadow-lg);
        overflow: hidden;
        color: var(--mj-text-primary);
      }

      .mj-cmdk-search-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
      }

      .mj-cmdk-search-icon {
        color: var(--mj-text-muted);
        font-size: 13px;
      }

      .mj-cmdk-input {
        flex: 1;
        border: none;
        background: transparent;
        color: var(--mj-text-primary);
        font-size: 13.5px;
        outline: none;
      }

      .mj-cmdk-input::placeholder {
        color: var(--mj-text-muted);
      }

      .mj-cmdk-kbd {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 5px;
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-default);
        color: var(--mj-text-muted);
        white-space: nowrap;
      }

      .mj-cmdk-list {
        max-height: 340px;
        overflow-y: auto;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .mj-cmdk-empty {
        padding: 24px 12px;
        text-align: center;
        font-size: 12.5px;
        color: var(--mj-text-muted);
      }

      .mj-cmdk-item {
        width: 100%;
        border: none;
        background: transparent;
        color: var(--mj-text-primary);
        padding: 8px 10px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        cursor: pointer;
        text-align: left;
        transition: background-color 120ms ease;
      }

      .mj-cmdk-item:hover:not(:disabled),
      .mj-cmdk-item.highlighted:not(:disabled) {
        background: var(--mj-bg-surface-hover);
      }

      .mj-cmdk-item.active {
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      }

      .mj-cmdk-item:disabled {
        opacity: 0.48;
        cursor: not-allowed;
      }

      .mj-cmdk-item-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .mj-cmdk-item-icon {
        width: 16px;
        text-align: center;
        font-size: 13px;
        color: var(--mj-brand-primary);
        flex-shrink: 0;
      }

      .mj-cmdk-item-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .mj-cmdk-item-label {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--mj-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mj-cmdk-item-desc {
        font-size: 11px;
        color: var(--mj-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mj-cmdk-item-right {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      .mj-cmdk-cat {
        font-size: 10.5px;
        font-weight: 600;
        color: var(--mj-text-muted);
      }
    `,
  ],
})
export class ArtifactCommandPaletteComponent implements OnChanges {
  @Input() Open = false;
  @Input() Title = 'Artifact Commands';
  @Input() Placeholder = 'Search actions, layouts, freeze, export...';
  @Input() Commands: ReadonlyArray<ArtifactCommandPaletteItem> = [];

  @Output() Execute = new EventEmitter<string>();
  @Output() Closed = new EventEmitter<void>();

  @ViewChild('searchInput') private searchInputRef?: ElementRef<HTMLInputElement>;

  public Query = '';
  public SelectedIndex = 0;

  public get FilteredItems(): ArtifactCommandPaletteItem[] {
    const q = this.Query.trim().toLowerCase();
    if (!q) {
      return [...this.Commands];
    }
    return this.Commands.filter(
      (c) =>
        c.Label.toLowerCase().includes(q) ||
        c.Category.toLowerCase().includes(q) ||
        (c.Description ?? '').toLowerCase().includes(q),
    );
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['Open'] && this.Open) {
      this.Query = '';
      this.SelectedIndex = 0;
      setTimeout(() => {
        this.searchInputRef?.nativeElement?.focus();
      }, 0);
    }
  }

  public OnQueryInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.Query = target?.value ?? '';
    this.SelectedIndex = 0;
  }

  public OnBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.Closed.emit();
    }
  }

  public OnKeydown(event: KeyboardEvent): void {
    const items = this.FilteredItems;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.Closed.emit();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (items.length > 0) {
        this.SelectedIndex = (this.SelectedIndex + 1) % items.length;
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length > 0) {
        this.SelectedIndex = (this.SelectedIndex - 1 + items.length) % items.length;
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = items[this.SelectedIndex] ?? items[0];
      if (target && !target.Disabled) {
        this.SelectItem(target);
      }
    }
  }

  public SelectItem(item: ArtifactCommandPaletteItem): void {
    if (item.Disabled) {
      return;
    }
    this.Execute.emit(item.Id);
    this.Closed.emit();
  }
}

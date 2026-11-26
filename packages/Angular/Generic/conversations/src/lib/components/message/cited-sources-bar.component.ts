import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { MessageCitation } from '@memberjunction/ai-core-plus';

/**
 * Compact footer bar rendered beneath AI messages that cite MemberJunction entity records.
 * Shows up to `MaxInline` (default 4) clickable citation pills inline with a `"+K more"` /
 * `"Show less"` toggle when more sources are referenced.
 */
@Component({
  standalone: true,
  selector: 'mj-cited-sources-bar',
  templateUrl: './cited-sources-bar.component.html',
  styleUrls: ['./cited-sources-bar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CitedSourcesBarComponent extends BaseAngularComponent {
  private _citations: readonly MessageCitation[] = [];

  @Input()
  public set Citations(value: readonly MessageCitation[] | null | undefined) {
    const next = value ?? [];
    if (next !== this._citations) {
      this._citations = next;
      if (next.length <= this.MaxInline) {
        this.IsExpanded = false;
      }
    }
  }
  public get Citations(): readonly MessageCitation[] {
    return this._citations;
  }

  /** Maximum number of source pills shown inline before collapsing behind `"+K more"`. */
  @Input() public MaxInline = 4;

  @Output() public CitationClicked = new EventEmitter<MessageCitation>();

  public IsExpanded = false;

  public get VisibleCitations(): readonly MessageCitation[] {
    if (this.IsExpanded || this._citations.length <= this.MaxInline) {
      return this._citations;
    }
    return this._citations.slice(0, this.MaxInline);
  }

  public get HiddenCount(): number {
    return Math.max(0, this._citations.length - this.MaxInline);
  }

  public get HasOverflow(): boolean {
    return this._citations.length > this.MaxInline;
  }

  public ToggleExpanded(event: Event): void {
    event.stopPropagation();
    this.IsExpanded = !this.IsExpanded;
  }

  public OnPillClick(citation: MessageCitation, event: Event): void {
    event.stopPropagation();
    this.CitationClicked.emit(citation);
  }

  public GetCitationIcon(citation: MessageCitation): string {
    if (citation.Kind === 'url') {
      return 'fa-solid fa-link';
    }
    if (citation.Kind === 'artifact') {
      return 'fa-solid fa-file-lines';
    }
    const entityIcon = citation.EntityName
      ? this.ProviderToUse?.EntityByName?.(citation.EntityName)?.Icon
      : undefined;
    return this.normalizeIconClass(entityIcon || 'fa-solid fa-up-right-from-square');
  }

  public ShowEntitySubtitle(citation: MessageCitation): boolean {
    if (!citation.EntityName) {
      return false;
    }
    return citation.EntityName.trim().toLowerCase() !== citation.DisplayName.trim().toLowerCase();
  }

  public GetCitationTitle(citation: MessageCitation): string {
    if (this.ShowEntitySubtitle(citation)) {
      return `Open ${citation.DisplayName} (${citation.EntityName})`;
    }
    return `Open ${citation.DisplayName}`;
  }

  private normalizeIconClass(iconClass: string): string {
    if (!iconClass) return 'fa-solid fa-up-right-from-square';
    if (
      iconClass.includes('fa-') &&
      !/\b(fa-solid|fa-regular|fa-light|fa-thin|fa-duotone|fa-brands|fa-sharp)\b/.test(iconClass)
    ) {
      return `fa-solid ${iconClass}`;
    }
    return iconClass;
  }
}

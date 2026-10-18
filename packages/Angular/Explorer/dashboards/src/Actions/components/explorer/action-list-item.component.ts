import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { MJActionCategoryEntity } from '@memberjunction/core-entities';
import { MJActionEntityExtended } from '@memberjunction/actions-base';

@Component({
  standalone: false,
  selector: 'mj-action-list-item',
  templateUrl: './action-list-item.component.html',
  styleUrls: ['./action-list-item.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActionListItemComponent {
  @Input() Action!: MJActionEntityExtended;
  @Input() Categories: Map<string, MJActionCategoryEntity> = new Map();
  @Input() IsCompact = false;
  @Output() ActionClick = new EventEmitter<MJActionEntityExtended>();
  @Output() EditClick = new EventEmitter<MJActionEntityExtended>();
  @Output() RunClick = new EventEmitter<MJActionEntityExtended>();
  @Output() CategoryClick = new EventEmitter<string>();

  public OnRowClick(): void {
    this.ActionClick.emit(this.Action);
  }

  /** @deprecated Use {@link OnRowClick}. */
  public onRowClick(): void {
    return this.OnRowClick();
  }

  public OnEditClick(event: MouseEvent): void {
    event.stopPropagation();
    this.EditClick.emit(this.Action);
  }

  /** @deprecated Use {@link OnEditClick}. */
  public onEditClick(event: MouseEvent): void {
    return this.OnEditClick(event);
  }

  public OnRunClick(event: MouseEvent): void {
    event.stopPropagation();
    this.RunClick.emit(this.Action);
  }

  /** @deprecated Use {@link OnRunClick}. */
  public onRunClick(event: MouseEvent): void {
    return this.OnRunClick(event);
  }

  public OnCategoryClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.Action.CategoryID) {
      this.CategoryClick.emit(this.Action.CategoryID);
    }
  }

  /** @deprecated Use {@link OnCategoryClick}. */
  public onCategoryClick(event: MouseEvent): void {
    return this.OnCategoryClick(event);
  }

  public GetCategoryName(): string {
    if (!this.Action.CategoryID) return 'Uncategorized';
    return this.Categories.get(this.Action.CategoryID)?.Name || 'Unknown';
  }

  /** @deprecated Use {@link GetCategoryName}. */
  public getCategoryName(): string {
    return this.GetCategoryName();
  }

  public GetStatusColor(): 'success' | 'warning' | 'error' | 'info' {
    switch (this.Action.Status) {
      case 'Active': return 'success';
      case 'Pending': return 'warning';
      case 'Disabled': return 'error';
      default: return 'info';
    }
  }

  /** @deprecated Use {@link GetStatusColor}. */
  public getStatusColor(): 'success' | 'warning' | 'error' | 'info' {
    return this.GetStatusColor();
  }

  public GetActionIcon(): string {
    if (this.Action.IconClass) {
      return this.Action.IconClass;
    }
    switch (this.Action.Type) {
      case 'Generated': return 'fa-solid fa-robot';
      case 'Custom': return 'fa-solid fa-code';
      default: return 'fa-solid fa-bolt';
    }
  }

  /** @deprecated Use {@link GetActionIcon}. */
  public getActionIcon(): string {
    return this.GetActionIcon();
  }

  public FormatDate(date: Date | null | undefined): string {
    if (!date) return '-';
    const now = new Date();
    const d = new Date(date);
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  /** @deprecated Use {@link FormatDate}. */
  public formatDate(date: Date | null | undefined): string {
    return this.FormatDate(date);
  }
}

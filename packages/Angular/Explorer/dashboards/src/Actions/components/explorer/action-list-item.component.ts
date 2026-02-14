import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { MJActionCategoryEntity } from '@memberjunction/core-entities';
import { ActionEntityExtended } from '@memberjunction/actions-base';

@Component({
  standalone: false,
  selector: 'mj-action-list-item',
  templateUrl: './action-list-item.component.html',
  styleUrls: ['./action-list-item.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActionListItemComponent {
  @Input() Action!: ActionEntityExtended;
  @Input() Categories: Map<string, MJActionCategoryEntity> = new Map();
  @Input() IsCompact = false;
  @Output() ActionClick = new EventEmitter<ActionEntityExtended>();
  @Output() EditClick = new EventEmitter<ActionEntityExtended>();
  @Output() RunClick = new EventEmitter<ActionEntityExtended>();
  @Output() CategoryClick = new EventEmitter<string>();

  public onRowClick(): void {
    this.ActionClick.emit(this.Action);
  }

  public onEditClick(event: MouseEvent): void {
    event.stopPropagation();
    this.EditClick.emit(this.Action);
  }

  public onRunClick(event: MouseEvent): void {
    event.stopPropagation();
    this.RunClick.emit(this.Action);
  }

  public onCategoryClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.Action.CategoryID) {
      this.CategoryClick.emit(this.Action.CategoryID);
    }
  }

  public getCategoryName(): string {
    if (!this.Action.CategoryID) return 'Uncategorized';
    return this.Categories.get(this.Action.CategoryID)?.Name || 'Unknown';
  }

  public getStatusColor(): 'success' | 'warning' | 'error' | 'info' {
    switch (this.Action.Status) {
      case 'Active': return 'success';
      case 'Pending': return 'warning';
      case 'Disabled': return 'error';
      default: return 'info';
    }
  }

  public getActionIcon(): string {
    if (this.Action.IconClass) {
      return this.Action.IconClass;
    }
    switch (this.Action.Type) {
      case 'Generated': return 'fa-solid fa-robot';
      case 'Custom': return 'fa-solid fa-code';
      default: return 'fa-solid fa-bolt';
    }
  }

  public formatDate(date: Date | null | undefined): string {
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
}

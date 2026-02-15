import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy
} from '@angular/core';
import { MJActionCategoryEntity } from '@memberjunction/core-entities';

interface BreadcrumbItem {
  id: string;
  name: string;
  icon?: string;
}

@Component({
  standalone: false,
  selector: 'mj-action-breadcrumb',
  templateUrl: './action-breadcrumb.component.html',
  styleUrls: ['./action-breadcrumb.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActionBreadcrumbComponent implements OnChanges {
  @Input() SelectedCategoryId = 'all';
  @Input() Categories: MJActionCategoryEntity[] = [];
  @Output() CategorySelect = new EventEmitter<string>();

  public Breadcrumbs: BreadcrumbItem[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['SelectedCategoryId'] || changes['Categories']) {
      this.buildBreadcrumbs();
    }
  }

  private buildBreadcrumbs(): void {
    this.Breadcrumbs = [];

    // Always start with "All Actions"
    this.Breadcrumbs.push({
      id: 'all',
      name: 'All Actions',
      icon: 'fa-solid fa-layer-group'
    });

    if (this.SelectedCategoryId === 'all') {
      return;
    }

    if (this.SelectedCategoryId === 'uncategorized') {
      this.Breadcrumbs.push({
        id: 'uncategorized',
        name: 'Uncategorized',
        icon: 'fa-solid fa-inbox'
      });
      return;
    }

    // Build path from root to selected category
    const categoryMap = new Map<string, MJActionCategoryEntity>();
    this.Categories.forEach(c => categoryMap.set(c.ID, c));

    const path: BreadcrumbItem[] = [];
    let currentId: string | null = this.SelectedCategoryId;

    while (currentId) {
      const category = categoryMap.get(currentId);
      if (category) {
        path.unshift({
          id: category.ID,
          name: category.Name,
          icon: 'fa-solid fa-folder'
        });
        currentId = category.ParentID || null;
      } else {
        break;
      }
    }

    this.Breadcrumbs.push(...path);
  }

  public selectCategory(id: string): void {
    this.CategorySelect.emit(id);
  }

  public isLast(index: number): boolean {
    return index === this.Breadcrumbs.length - 1;
  }
}

import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { AIPromptCategoryEntity, AIPromptTypeEntity } from '@memberjunction/core-entities';

interface PromptFilter {
  searchTerm: string;
  categoryId: string;
  typeId: string;
  status: string;
}

interface PromptWithTemplate {
  prompt: any;
  template: any;
  templateContent: any;
  category: any;
  type: any;
}

@Component({
  standalone: false,
  selector: 'mj-prompt-filter-panel',
  templateUrl: './prompt-filter-panel.component.html',
  styleUrls: ['./prompt-filter-panel.component.css']
})
export class PromptFilterPanelComponent implements OnInit {
  @Input() prompts: PromptWithTemplate[] = [];
  @Input() filteredPrompts: PromptWithTemplate[] = [];
  @Input() categories: AIPromptCategoryEntity[] = [];
  @Input() types: AIPromptTypeEntity[] = [];
  @Input() filters: PromptFilter = {
    searchTerm: '',
    categoryId: 'all',
    typeId: 'all',
    status: 'all'
  };

  @Output() filtersChange = new EventEmitter<PromptFilter>();
  @Output() filterChange = new EventEmitter<void>();
  @Output() resetFilters = new EventEmitter<void>();
  @Output() closePanel = new EventEmitter<void>();

  public categoryOptions: Array<{text: string; value: string}> = [];
  public typeOptions: Array<{text: string; value: string}> = [];
  public statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Pending', value: 'Pending' },
    { text: 'Disabled', value: 'Disabled' }
  ];

  ngOnInit(): void {
    this.buildFilterOptions();
  }

  private buildFilterOptions(): void {
    this.categoryOptions = [
      { text: 'All Categories', value: 'all' },
      ...this.categories.map(cat => ({ text: cat.Name, value: cat.ID }))
    ];

    this.typeOptions = [
      { text: 'All Types', value: 'all' },
      ...this.types.map(type => ({ text: type.Name, value: type.ID }))
    ];
  }

  public onFilterChange(): void {
    this.filtersChange.emit(this.filters);
    this.filterChange.emit();
  }

  public resetAllFilters(): void {
    this.resetFilters.emit();
  }

  public toggleFilterPanel(): void {
    this.closePanel.emit();
  }

  public updateCategories(categories: AIPromptCategoryEntity[]): void {
    this.categories = categories;
    this.buildFilterOptions();
  }
}
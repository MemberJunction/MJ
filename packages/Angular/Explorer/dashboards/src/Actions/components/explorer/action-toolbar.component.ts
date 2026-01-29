import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  ActionExplorerStateService,
  ActionViewMode,
  SortField,
  SortDirection,
  ActionFilters
} from '../../services/action-explorer-state.service';

interface SortOption {
  field: SortField;
  label: string;
  icon: string;
}

@Component({
  selector: 'mj-action-toolbar',
  templateUrl: './action-toolbar.component.html',
  styleUrls: ['./action-toolbar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActionToolbarComponent implements OnInit, OnDestroy {
  @Input() TotalCount = 0;
  @Input() FilteredCount = 0;
  @Output() NewActionClick = new EventEmitter<void>();
  @Output() RefreshClick = new EventEmitter<void>();

  public ViewMode: ActionViewMode = 'card';
  public SortField: SortField = 'name';
  public SortDirection: SortDirection = 'asc';
  public Filters: ActionFilters = {
    searchTerm: '',
    statuses: [],
    types: [],
    approvalStatuses: [],
    hasExecutions: null
  };

  public ShowFiltersDropdown = false;
  public ShowSortDropdown = false;

  public SortOptions: SortOption[] = [
    { field: 'name', label: 'Name', icon: 'fa-solid fa-font' },
    { field: 'updated', label: 'Last Updated', icon: 'fa-solid fa-clock' },
    { field: 'status', label: 'Status', icon: 'fa-solid fa-circle-check' },
    { field: 'type', label: 'Type', icon: 'fa-solid fa-tag' },
    { field: 'category', label: 'Category', icon: 'fa-solid fa-folder' }
  ];

  public StatusOptions = [
    { value: 'Active', label: 'Active', color: 'success' },
    { value: 'Pending', label: 'Pending', color: 'warning' },
    { value: 'Disabled', label: 'Disabled', color: 'error' }
  ];

  public TypeOptions = [
    { value: 'Generated', label: 'AI Generated', icon: 'fa-solid fa-robot' },
    { value: 'Custom', label: 'Custom', icon: 'fa-solid fa-code' }
  ];

  private destroy$ = new Subject<void>();
  private searchInput$ = new Subject<string>();

  constructor(
    public StateService: ActionExplorerStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscribeToState();
    this.setupSearchDebounce();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private subscribeToState(): void {
    this.StateService.ViewMode$.pipe(takeUntil(this.destroy$)).subscribe(mode => {
      this.ViewMode = mode;
      this.cdr.markForCheck();
    });

    this.StateService.SortConfig$.pipe(takeUntil(this.destroy$)).subscribe(config => {
      this.SortField = config.field;
      this.SortDirection = config.direction;
      this.cdr.markForCheck();
    });

    this.StateService.Filters$.pipe(takeUntil(this.destroy$)).subscribe(filters => {
      this.Filters = filters;
      this.cdr.markForCheck();
    });
  }

  private setupSearchDebounce(): void {
    this.searchInput$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(term => {
      this.StateService.setSearchTerm(term);
    });
  }

  public onSearchInput(term: string): void {
    this.searchInput$.next(term);
  }

  public clearSearch(): void {
    this.StateService.setSearchTerm('');
  }

  public setViewMode(mode: ActionViewMode): void {
    this.StateService.setViewMode(mode);
  }

  public setSortField(field: SortField): void {
    this.StateService.setSortField(field);
    this.ShowSortDropdown = false;
  }

  public toggleSortDirection(): void {
    this.StateService.toggleSortDirection();
  }

  public toggleStatus(status: string): void {
    const current = [...this.Filters.statuses];
    const index = current.indexOf(status);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(status);
    }
    this.StateService.setStatusFilter(current);
  }

  public toggleType(type: string): void {
    const current = [...this.Filters.types];
    const index = current.indexOf(type);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(type);
    }
    this.StateService.setTypeFilter(current);
  }

  public isStatusSelected(status: string): boolean {
    return this.Filters.statuses.includes(status);
  }

  public isTypeSelected(type: string): boolean {
    return this.Filters.types.includes(type);
  }

  public clearFilters(): void {
    this.StateService.clearFilters();
  }

  public hasActiveFilters(): boolean {
    return this.StateService.hasActiveFilters();
  }

  public getActiveFilterCount(): number {
    let count = 0;
    if (this.Filters.searchTerm) count++;
    count += this.Filters.statuses.length;
    count += this.Filters.types.length;
    count += this.Filters.approvalStatuses.length;
    if (this.Filters.hasExecutions != null) count++;
    return count;
  }

  public toggleFiltersDropdown(): void {
    this.ShowFiltersDropdown = !this.ShowFiltersDropdown;
    if (this.ShowFiltersDropdown) {
      this.ShowSortDropdown = false;
    }
  }

  public toggleSortDropdown(): void {
    this.ShowSortDropdown = !this.ShowSortDropdown;
    if (this.ShowSortDropdown) {
      this.ShowFiltersDropdown = false;
    }
  }

  public closeDropdowns(): void {
    this.ShowFiltersDropdown = false;
    this.ShowSortDropdown = false;
  }

  public getSortLabel(): string {
    const option = this.SortOptions.find(o => o.field === this.SortField);
    return option?.label || 'Sort';
  }

  public getSortIcon(): string {
    return this.SortDirection === 'asc' ? 'fa-solid fa-arrow-up-short-wide' : 'fa-solid fa-arrow-down-wide-short';
  }

  public onNewAction(): void {
    this.NewActionClick.emit();
  }

  public onRefresh(): void {
    this.RefreshClick.emit();
  }
}

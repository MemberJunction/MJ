import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RestaurantInstrumentationService, VisitSummary } from '../../services/restaurant-instrumentation.service';

@RegisterClass(BaseResourceComponent, 'RestaurantVisits')
@Component({
  selector: 'app-restaurant-visits',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restaurant-visits.component.html',
  styleUrls: ['./restaurant-visits.component.css']
})
export class RestaurantVisitsComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private readonly _destroy$ = new Subject<void>();

  visits: VisitSummary[] = [];
  filteredVisits: VisitSummary[] = [];
  isLoading = false;
  searchText = '';
  selectedRating: number | null = null;

  constructor(
    private readonly _restaurantService: RestaurantInstrumentationService,
    private readonly _cdr: ChangeDetectorRef
  ) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Visits';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-calendar-check';
  }

  ngOnInit(): void {
    this._restaurantService.isLoading$
      .pipe(takeUntil(this._destroy$))
      .subscribe(loading => {
        this.isLoading = loading;
        this._cdr.markForCheck();
      });

    this._restaurantService.visits$
      .pipe(takeUntil(this._destroy$))
      .subscribe(visits => {
        this.visits = visits;
        this.applyFilters();
        this._cdr.markForCheck();
      });

    this._restaurantService.refresh();
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  refresh(): void {
    this._restaurantService.refresh();
  }

  onSearchChange(value: string): void {
    this.searchText = value.toLowerCase();
    this.applyFilters();
  }

  onRatingFilter(rating: number | null): void {
    this.selectedRating = rating;
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredVisits = this.visits.filter(visit => {
      // Search filter
      const matchesSearch = !this.searchText ||
        visit.restaurantName.toLowerCase().includes(this.searchText) ||
        visit.memberName.toLowerCase().includes(this.searchText) ||
        (visit.cuisineType && visit.cuisineType.toLowerCase().includes(this.searchText));

      // Rating filter
      const matchesRating = this.selectedRating === null ||
        visit.rating === this.selectedRating;

      return matchesSearch && matchesRating;
    });
  }

  getStarArray(rating: number | null): number[] {
    if (rating === null) return Array(5).fill(0);
    return Array(5).fill(0).map((_, i) => i < Math.round(rating) ? 1 : 0);
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

export function LoadRestaurantVisits() {
  // Tree-shaking prevention
}

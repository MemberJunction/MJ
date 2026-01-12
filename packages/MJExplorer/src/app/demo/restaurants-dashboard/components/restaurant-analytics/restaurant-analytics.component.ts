import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RestaurantInstrumentationService, RestaurantSummary, CuisineStats } from '../../services/restaurant-instrumentation.service';

@RegisterClass(BaseResourceComponent, 'RestaurantAnalytics')
@Component({
  selector: 'app-restaurant-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restaurant-analytics.component.html',
  styleUrls: ['./restaurant-analytics.component.css']
})
export class RestaurantAnalyticsComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private readonly _destroy$ = new Subject<void>();

  restaurants: RestaurantSummary[] = [];
  cuisineStats: CuisineStats[] = [];
  isLoading = false;

  constructor(
    private readonly _restaurantService: RestaurantInstrumentationService,
    private readonly _cdr: ChangeDetectorRef
  ) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Analytics';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-bar';
  }

  ngOnInit(): void {
    this._restaurantService.isLoading$
      .pipe(takeUntil(this._destroy$))
      .subscribe(loading => {
        this.isLoading = loading;
        this._cdr.markForCheck();
      });

    this._restaurantService.restaurants$
      .pipe(takeUntil(this._destroy$))
      .subscribe(restaurants => {
        this.restaurants = restaurants.sort((a, b) => b.averageRating - a.averageRating);
        this._cdr.markForCheck();
      });

    this._restaurantService.cuisineStats$
      .pipe(takeUntil(this._destroy$))
      .subscribe(stats => {
        this.cuisineStats = stats;
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

  getStarArray(rating: number): number[] {
    return Array(5).fill(0).map((_, i) => i < Math.round(rating) ? 1 : 0);
  }

  getTopRestaurants(): RestaurantSummary[] {
    return this.restaurants.slice(0, 10);
  }

  getPriceRangeColor(priceRange: string | null): string {
    if (!priceRange) return '#94a3b8';
    switch (priceRange) {
      case '$': return '#22c55e';
      case '$$': return '#3b82f6';
      case '$$$': return '#f59e0b';
      case '$$$$': return '#ef4444';
      default: return '#94a3b8';
    }
  }
}

export function LoadRestaurantAnalytics() {
  // Tree-shaking prevention
}

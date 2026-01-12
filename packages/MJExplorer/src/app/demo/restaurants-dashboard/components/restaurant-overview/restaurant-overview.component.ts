import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RestaurantInstrumentationService, RestaurantKPIs, CuisineStats, MemberActivity } from '../../services/restaurant-instrumentation.service';

@RegisterClass(BaseResourceComponent, 'RestaurantOverview')
@Component({
  selector: 'app-restaurant-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restaurant-overview.component.html',
  styleUrls: ['./restaurant-overview.component.css']
})
export class RestaurantOverviewComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private readonly _destroy$ = new Subject<void>();

  kpis: RestaurantKPIs | null = null;
  cuisineStats: CuisineStats[] = [];
  memberActivity: MemberActivity[] = [];
  isLoading = false;

  constructor(
    private readonly _restaurantService: RestaurantInstrumentationService,
    private readonly _cdr: ChangeDetectorRef
  ) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Overview';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }

  ngOnInit(): void {
    // Subscribe to loading state
    this._restaurantService.isLoading$
      .pipe(takeUntil(this._destroy$))
      .subscribe(loading => {
        this.isLoading = loading;
        this._cdr.markForCheck();
      });

    // Subscribe to KPIs
    this._restaurantService.kpis$
      .pipe(takeUntil(this._destroy$))
      .subscribe(kpis => {
        this.kpis = kpis;
        this._cdr.markForCheck();
      });

    // Subscribe to cuisine stats
    this._restaurantService.cuisineStats$
      .pipe(takeUntil(this._destroy$))
      .subscribe(stats => {
        this.cuisineStats = stats;
        this._cdr.markForCheck();
      });

    // Subscribe to member activity
    this._restaurantService.memberActivity$
      .pipe(takeUntil(this._destroy$))
      .subscribe(activity => {
        this.memberActivity = activity;
        this._cdr.markForCheck();
      });

    // Trigger initial load
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
}

export function LoadRestaurantOverview() {
  // Tree-shaking prevention
}

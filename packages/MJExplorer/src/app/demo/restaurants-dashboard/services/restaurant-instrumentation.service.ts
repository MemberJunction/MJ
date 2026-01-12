import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, from, Observable } from 'rxjs';
import { debounceTime, shareReplay, switchMap, tap } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';
import {
  RestaurantEntity,
  RestaurantVisitEntity,
  GroupVisitEntity,
  CuisineTypeEntity,
  Member__FoodieEntity,
  WishListEntity,
  GroupVisitMemberEntity
} from 'mj_generatedentities';

export interface RestaurantKPIs {
  totalRestaurants: number;
  totalVisits: number;
  totalMembers: number;
  averageRating: number;
  totalSpent: number;
  wishlistCount: number;
  favoriteRestaurants: number;
  mostVisitedCuisine: string;
  visitTrend: number;
}

export interface VisitSummary {
  id: string;
  restaurantName: string;
  restaurantID: string;
  memberName: string;
  memberID: string;
  visitDate: Date;
  rating: number | null;
  comments: string | null;
  dishesOrdered: string | null;
  wouldReturn: boolean | null;
  cuisineType: string | null;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  cuisineType: string | null;
  priceRange: string | null;
  city: string | null;
  state: string | null;
  averageRating: number;
  visitCount: number;
  latitude: number | null;
  longitude: number | null;
}

export interface CuisineStats {
  cuisineName: string;
  restaurantCount: number;
  visitCount: number;
  averageRating: number;
  totalSpent: number;
}

export interface MemberActivity {
  memberName: string;
  memberID: string;
  visitCount: number;
  averageRating: number;
  favoriteRestaurants: number;
  wishlistCount: number;
  totalSpent: number;
}

@Injectable()
export class RestaurantInstrumentationService {
  private readonly _refreshTrigger$ = new BehaviorSubject<void>(undefined);
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);
  private _loadingCount = 0;

  // Observable streams
  readonly isLoading$ = this._isLoading$.asObservable();

  readonly kpis$: Observable<RestaurantKPIs> = this._refreshTrigger$.pipe(
    tap(() => this.incrementLoading()),
    debounceTime(50),
    switchMap(() => from(this.loadKPIs())),
    tap(() => this.decrementLoading()),
    shareReplay(1)
  );

  readonly visits$: Observable<VisitSummary[]> = this._refreshTrigger$.pipe(
    tap(() => this.incrementLoading()),
    debounceTime(50),
    switchMap(() => from(this.loadVisits())),
    tap(() => this.decrementLoading()),
    shareReplay(1)
  );

  readonly restaurants$: Observable<RestaurantSummary[]> = this._refreshTrigger$.pipe(
    tap(() => this.incrementLoading()),
    debounceTime(50),
    switchMap(() => from(this.loadRestaurants())),
    tap(() => this.decrementLoading()),
    shareReplay(1)
  );

  readonly cuisineStats$: Observable<CuisineStats[]> = this._refreshTrigger$.pipe(
    tap(() => this.incrementLoading()),
    debounceTime(50),
    switchMap(() => from(this.loadCuisineStats())),
    tap(() => this.decrementLoading()),
    shareReplay(1)
  );

  readonly memberActivity$: Observable<MemberActivity[]> = this._refreshTrigger$.pipe(
    tap(() => this.incrementLoading()),
    debounceTime(50),
    switchMap(() => from(this.loadMemberActivity())),
    tap(() => this.decrementLoading()),
    shareReplay(1)
  );

  constructor() {}

  refresh(): void {
    this._refreshTrigger$.next();
  }

  private incrementLoading(): void {
    this._loadingCount++;
    if (this._loadingCount > 0) {
      this._isLoading$.next(true);
    }
  }

  private decrementLoading(): void {
    this._loadingCount--;
    if (this._loadingCount <= 0) {
      this._loadingCount = 0;
      this._isLoading$.next(false);
    }
  }

  private async loadKPIs(): Promise<RestaurantKPIs> {
    const rv = new RunView();

    // Load all data in parallel
    const [restaurantsResult, visitsResult, membersResult, wishlistResult, groupVisitsResult] = await rv.RunViews([
      {
        EntityName: 'Restaurants',
        ResultType: 'simple',
        Fields: ['ID']
      },
      {
        EntityName: 'Restaurant Visits',
        ResultType: 'simple',
        Fields: ['ID', 'Rating', 'RestaurantID']
      },
      {
        EntityName: 'Members',
        ResultType: 'simple',
        Fields: ['ID']
      },
      {
        EntityName: 'Wish Lists',
        ResultType: 'simple',
        Fields: ['ID']
      },
      {
        EntityName: 'Group Visits',
        ResultType: 'simple',
        Fields: ['ID', 'TotalCost']
      }
    ]);

    const visits = visitsResult.Results || [];
    const ratings = visits.filter((v: RestaurantVisitEntity) => v.Rating != null).map((v: RestaurantVisitEntity) => v.Rating!);
    const averageRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0;

    // Calculate favorite restaurants (4+ stars average)
    const restaurantRatings = new Map<string, number[]>();
    visits.forEach((visit: RestaurantVisitEntity) => {
      if (visit.Rating != null) {
        if (!restaurantRatings.has(visit.RestaurantID)) {
          restaurantRatings.set(visit.RestaurantID, []);
        }
        restaurantRatings.get(visit.RestaurantID)!.push(visit.Rating);
      }
    });

    let favoriteCount = 0;
    restaurantRatings.forEach((ratings) => {
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      if (avg >= 4) favoriteCount++;
    });

    const groupVisits = groupVisitsResult.Results || [];
    const totalSpent = groupVisits.reduce((sum: number, gv: GroupVisitEntity) => sum + (gv.TotalCost || 0), 0);

    // Calculate most visited cuisine by counting visits per restaurant, then grouping by cuisine
    const restaurantCuisinesResult = await rv.RunView<RestaurantEntity>({
      EntityName: 'Restaurants',
      ResultType: 'simple',
      Fields: ['ID', 'CuisineType']
    });

    const restaurantCuisines = new Map<string, string>();
    (restaurantCuisinesResult.Results || []).forEach((r: RestaurantEntity) => {
      if (r.CuisineType) {
        restaurantCuisines.set(r.ID, r.CuisineType);
      }
    });

    const cuisineCounts = new Map<string, number>();
    visits.forEach((visit: RestaurantVisitEntity) => {
      const cuisine = restaurantCuisines.get(visit.RestaurantID);
      if (cuisine) {
        cuisineCounts.set(cuisine, (cuisineCounts.get(cuisine) || 0) + 1);
      }
    });

    let mostVisitedCuisine = 'N/A';
    let maxCount = 0;
    cuisineCounts.forEach((count, cuisine) => {
      if (count > maxCount) {
        maxCount = count;
        mostVisitedCuisine = cuisine;
      }
    });

    return {
      totalRestaurants: restaurantsResult.Results?.length || 0,
      totalVisits: visitsResult.Results?.length || 0,
      totalMembers: membersResult.Results?.length || 0,
      averageRating: Math.round(averageRating * 10) / 10,
      totalSpent: Math.round(totalSpent * 100) / 100,
      wishlistCount: wishlistResult.Results?.length || 0,
      favoriteRestaurants: favoriteCount,
      mostVisitedCuisine,
      visitTrend: 12.5 // Placeholder - would calculate from date ranges
    };
  }

  private async loadVisits(): Promise<VisitSummary[]> {
    const rv = new RunView();

    // Load visits and restaurants in parallel
    const [visitsResult, restaurantsResult] = await rv.RunViews([
      {
        EntityName: 'Restaurant Visits',
        ResultType: 'simple',
        OrderBy: 'VisitDate DESC',
        Fields: ['ID', 'Restaurant', 'RestaurantID', 'Member', 'MemberID', 'VisitDate', 'Rating', 'Comments', 'DishesOrdered', 'WouldReturn']
      },
      {
        EntityName: 'Restaurants',
        ResultType: 'simple',
        Fields: ['ID', 'CuisineType']
      }
    ]);

    if (!visitsResult.Success || !visitsResult.Results) {
      return [];
    }

    // Build restaurant to cuisine map
    const restaurantCuisines = new Map<string, string>();
    (restaurantsResult.Results || []).forEach((r: RestaurantEntity) => {
      if (r.CuisineType) {
        restaurantCuisines.set(r.ID, r.CuisineType);
      }
    });

    return visitsResult.Results.map((v: RestaurantVisitEntity) => ({
      id: v.ID,
      restaurantName: v.Restaurant || 'Unknown',
      restaurantID: v.RestaurantID,
      memberName: v.Member || 'Unknown',
      memberID: v.MemberID,
      visitDate: new Date(v.VisitDate),
      rating: v.Rating,
      comments: v.Comments,
      dishesOrdered: v.DishesOrdered,
      wouldReturn: v.WouldReturn,
      cuisineType: restaurantCuisines.get(v.RestaurantID) || null
    }));
  }

  private async loadRestaurants(): Promise<RestaurantSummary[]> {
    const rv = new RunView();

    // Load restaurants and visits in parallel
    const [restaurantsResult, visitsResult] = await rv.RunViews([
      {
        EntityName: 'Restaurants',
        ResultType: 'simple',
        Fields: ['ID', 'Name', 'CuisineType', 'PriceRange', 'City', 'State', 'Latitude', 'Longitude']
      },
      {
        EntityName: 'Restaurant Visits',
        ResultType: 'simple',
        Fields: ['RestaurantID', 'Rating']
      }
    ]);

    if (!restaurantsResult.Success || !restaurantsResult.Results) {
      return [];
    }

    const visits = visitsResult.Results || [];

    // Calculate average ratings and visit counts per restaurant
    const restaurantStats = new Map<string, { ratings: number[]; count: number }>();
    visits.forEach((visit: RestaurantVisitEntity) => {
      if (!restaurantStats.has(visit.RestaurantID)) {
        restaurantStats.set(visit.RestaurantID, { ratings: [], count: 0 });
      }
      const stats = restaurantStats.get(visit.RestaurantID)!;
      stats.count++;
      if (visit.Rating != null) {
        stats.ratings.push(visit.Rating);
      }
    });

    return restaurantsResult.Results.map((r: RestaurantEntity) => {
      const stats = restaurantStats.get(r.ID) || { ratings: [], count: 0 };
      const averageRating = stats.ratings.length > 0
        ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
        : 0;

      return {
        id: r.ID,
        name: r.Name,
        cuisineType: r.CuisineType,
        priceRange: r.PriceRange,
        city: r.City,
        state: r.State,
        averageRating: Math.round(averageRating * 10) / 10,
        visitCount: stats.count,
        latitude: r.Latitude,
        longitude: r.Longitude
      };
    });
  }

  private async loadCuisineStats(): Promise<CuisineStats[]> {
    const rv = new RunView();

    const [cuisinesResult, restaurantsResult, visitsResult, groupVisitsResult] = await rv.RunViews([
      {
        EntityName: 'Cuisine Types',
        ResultType: 'simple',
        Fields: ['ID', 'Name']
      },
      {
        EntityName: 'Restaurants',
        ResultType: 'simple',
        Fields: ['ID', 'CuisineTypeID']
      },
      {
        EntityName: 'Restaurant Visits',
        ResultType: 'simple',
        Fields: ['RestaurantID', 'Rating']
      },
      {
        EntityName: 'Group Visits',
        ResultType: 'simple',
        Fields: ['RestaurantID', 'TotalCost']
      }
    ]);

    if (!cuisinesResult.Success || !cuisinesResult.Results) {
      return [];
    }

    const restaurants = restaurantsResult.Results || [];
    const visits = visitsResult.Results || [];
    const groupVisits = groupVisitsResult.Results || [];

    // Build restaurant to cuisine mapping
    const restaurantToCuisine = new Map<string, string>();
    restaurants.forEach((r: RestaurantEntity) => {
      if (r.CuisineTypeID) {
        restaurantToCuisine.set(r.ID, r.CuisineTypeID);
      }
    });

    // Calculate stats per cuisine
    const cuisineData = new Map<string, { restaurantIds: Set<string>; ratings: number[]; spent: number }>();

    cuisinesResult.Results.forEach((c: CuisineTypeEntity) => {
      cuisineData.set(c.ID, { restaurantIds: new Set(), ratings: [], spent: 0 });
    });

    restaurants.forEach((r: RestaurantEntity) => {
      if (r.CuisineTypeID && cuisineData.has(r.CuisineTypeID)) {
        cuisineData.get(r.CuisineTypeID)!.restaurantIds.add(r.ID);
      }
    });

    visits.forEach((v: RestaurantVisitEntity) => {
      const cuisineID = restaurantToCuisine.get(v.RestaurantID);
      if (cuisineID && cuisineData.has(cuisineID)) {
        if (v.Rating != null) {
          cuisineData.get(cuisineID)!.ratings.push(v.Rating);
        }
      }
    });

    groupVisits.forEach((gv: GroupVisitEntity) => {
      const cuisineID = restaurantToCuisine.get(gv.RestaurantID);
      if (cuisineID && cuisineData.has(cuisineID) && gv.TotalCost != null) {
        cuisineData.get(cuisineID)!.spent += gv.TotalCost;
      }
    });

    return cuisinesResult.Results.map((c: CuisineTypeEntity) => {
      const data = cuisineData.get(c.ID)!;
      const averageRating = data.ratings.length > 0
        ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
        : 0;

      return {
        cuisineName: c.Name,
        restaurantCount: data.restaurantIds.size,
        visitCount: data.ratings.length,
        averageRating: Math.round(averageRating * 10) / 10,
        totalSpent: Math.round(data.spent * 100) / 100
      };
    }).filter((c: CuisineStats) => c.restaurantCount > 0); // Only cuisines with restaurants
  }

  private async loadMemberActivity(): Promise<MemberActivity[]> {
    const rv = new RunView();

    const [membersResult, visitsResult, wishlistResult, groupVisitMembersResult] = await rv.RunViews([
      {
        EntityName: 'Members__Foodie',
        ResultType: 'simple',
        Fields: ['ID', 'Name']
      },
      {
        EntityName: 'Restaurant Visits',
        ResultType: 'simple',
        Fields: ['MemberID', 'RestaurantID', 'Rating']
      },
      {
        EntityName: 'Wish Lists',
        ResultType: 'simple',
        Fields: ['MemberID']
      },
      {
        EntityName: 'Group Visit Members',
        ResultType: 'simple',
        Fields: ['MemberID', 'AmountPaid']
      }
    ]);

    if (!membersResult.Success || !membersResult.Results) {
      return [];
    }

    const visits = visitsResult.Results || [];
    const wishlist = wishlistResult.Results || [];
    const groupVisitMembers = groupVisitMembersResult.Results || [];

    // Calculate stats per member
    const memberData = new Map<string, { visitCount: number; ratings: number[]; restaurants: Set<string>; wishlistCount: number; spent: number }>();

    membersResult.Results.forEach((m: Member__FoodieEntity) => {
      memberData.set(m.ID, { visitCount: 0, ratings: [], restaurants: new Set(), wishlistCount: 0, spent: 0 });
    });

    visits.forEach((v: RestaurantVisitEntity) => {
      if (memberData.has(v.MemberID)) {
        const data = memberData.get(v.MemberID)!;
        data.visitCount++;
        data.restaurants.add(v.RestaurantID);
        if (v.Rating != null) {
          data.ratings.push(v.Rating);
        }
      }
    });

    wishlist.forEach((w: WishListEntity) => {
      if (memberData.has(w.MemberID)) {
        memberData.get(w.MemberID)!.wishlistCount++;
      }
    });

    groupVisitMembers.forEach((gvm: GroupVisitMemberEntity) => {
      if (memberData.has(gvm.MemberID) && gvm.AmountPaid != null) {
        memberData.get(gvm.MemberID)!.spent += gvm.AmountPaid;
      }
    });

    return membersResult.Results.map((m: Member__FoodieEntity) => {
      const data = memberData.get(m.ID)!;
      const averageRating = data.ratings.length > 0
        ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
        : 0;

      return {
        memberName: m.Name,
        memberID: m.ID,
        visitCount: data.visitCount,
        averageRating: Math.round(averageRating * 10) / 10,
        favoriteRestaurants: data.restaurants.size,
        wishlistCount: data.wishlistCount,
        totalSpent: Math.round(data.spent * 100) / 100
      };
    }).sort((a, b) => b.visitCount - a.visitCount); // Sort by most active
  }
}

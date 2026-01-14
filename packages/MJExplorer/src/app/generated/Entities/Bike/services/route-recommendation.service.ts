import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, from } from 'rxjs';
import { switchMap, shareReplay, takeUntil, tap } from 'rxjs/operators';
import { MapLocation } from './biking-instrumentation.service';

/**
 * Interface for attraction types that users can search for
 */
export interface AttractionCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  keywords: string[];
}

/**
 * Interface for a discovered attraction along a route
 */
export interface RouteAttraction {
  name: string;
  type: string;
  description: string;
  distance?: string;
  rating?: number;
  source?: string;
}

/**
 * Interface for a recommended route with attractions
 */
export interface RecommendedRoute {
  id: string;
  name: string;
  description: string;
  startLocation: string;
  endLocation: string;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  difficulty: 'easy' | 'moderate' | 'challenging' | 'expert';
  terrain: string;
  attractions: RouteAttraction[];
  highlights: string[];
  bestTimeToVisit?: string;
  tips?: string[];
  sourceUrls?: string[];
}

/**
 * Interface for the search request
 */
export interface RouteSearchRequest {
  location: MapLocation | null;
  attractionTypes: string[];
  customPrompt?: string;
  maxDistanceKm?: number;
}

/**
 * Interface for the search result
 */
export interface RouteSearchResult {
  success: boolean;
  routes: RecommendedRoute[];
  searchQuery: string;
  searchSummary?: string;
  citations?: string[];
  error?: string;
}

/**
 * Predefined attraction categories for route searching
 */
export const ATTRACTION_CATEGORIES: AttractionCategory[] = [
  {
    id: 'scenic',
    name: 'Scenic Views',
    icon: 'fa-mountain-sun',
    description: 'Breathtaking viewpoints and panoramic vistas',
    keywords: ['scenic', 'viewpoint', 'vista', 'panoramic', 'overlook', 'lookout']
  },
  {
    id: 'nature',
    name: 'Nature & Wildlife',
    icon: 'fa-leaf',
    description: 'Parks, forests, and wildlife viewing areas',
    keywords: ['nature', 'wildlife', 'park', 'forest', 'birds', 'animals', 'botanical']
  },
  {
    id: 'historic',
    name: 'Historic Sites',
    icon: 'fa-landmark',
    description: 'Historical landmarks and heritage sites',
    keywords: ['historic', 'heritage', 'landmark', 'monument', 'museum', 'architectural']
  },
  {
    id: 'waterfront',
    name: 'Waterfront',
    icon: 'fa-water',
    description: 'Lakes, rivers, beaches, and coastal areas',
    keywords: ['waterfront', 'lake', 'river', 'beach', 'coastal', 'bay', 'ocean']
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: 'fa-utensils',
    description: 'Cafes, restaurants, and local eateries along the route',
    keywords: ['cafe', 'restaurant', 'bakery', 'brewery', 'winery', 'food', 'coffee']
  },
  {
    id: 'art',
    name: 'Art & Culture',
    icon: 'fa-palette',
    description: 'Galleries, murals, and cultural attractions',
    keywords: ['art', 'gallery', 'mural', 'sculpture', 'cultural', 'theater']
  },
  {
    id: 'adventure',
    name: 'Adventure',
    icon: 'fa-person-hiking',
    description: 'Challenging trails and adventure activities',
    keywords: ['adventure', 'trail', 'challenging', 'extreme', 'climbing', 'exploration']
  },
  {
    id: 'urban',
    name: 'Urban Exploration',
    icon: 'fa-city',
    description: 'Interesting neighborhoods and urban landmarks',
    keywords: ['urban', 'neighborhood', 'downtown', 'market', 'district', 'architecture']
  }
];

/**
 * Service for finding route recommendations based on user preferences using LLM-powered web search
 */
@Injectable({
  providedIn: 'root'
})
export class RouteRecommendationService {
  private destroy$ = new Subject<void>();

  // Loading state
  private _isSearching$ = new BehaviorSubject<boolean>(false);
  readonly isSearching$ = this._isSearching$.asObservable();

  // Last search result
  private _lastSearchResult$ = new BehaviorSubject<RouteSearchResult | null>(null);
  readonly lastSearchResult$ = this._lastSearchResult$.asObservable();

  // Available attraction categories
  readonly attractionCategories = ATTRACTION_CATEGORIES;

  constructor() {}

  /**
   * Search for routes with interesting attractions based on user preferences.
   * This method uses a simulated LLM response for the frontend demo.
   * In production, this would call the Perplexity Search action via the GraphQL API.
   *
   * @param request - The search request containing location and attraction preferences
   * @returns Observable of the search result
   */
  searchRoutes(request: RouteSearchRequest): Observable<RouteSearchResult> {
    this._isSearching$.next(true);

    return from(this.performSearch(request)).pipe(
      tap(result => {
        this._lastSearchResult$.next(result);
        this._isSearching$.next(false);
      }),
      shareReplay(1)
    );
  }

  /**
   * Performs the actual search using LLM-powered web search.
   * In a production environment, this would call the MemberJunction GraphQL API
   * to execute the Perplexity Search action.
   */
  private async performSearch(request: RouteSearchRequest): Promise<RouteSearchResult> {
    // Build the search query based on user preferences
    const searchQuery = this.buildSearchQuery(request);

    // Simulate network delay for demo purposes
    await this.delay(1500 + Math.random() * 1000);

    // In production, this would be a GraphQL call like:
    // const result = await this.graphQL.mutate({
    //   mutation: RUN_ACTION_MUTATION,
    //   variables: {
    //     ActionName: 'Perplexity Search',
    //     Params: [
    //       { Name: 'Query', Value: searchQuery },
    //       { Name: 'ReturnRelatedQuestions', Value: true }
    //     ]
    //   }
    // });

    // For now, return simulated results based on the location and preferences
    const routes = this.generateSimulatedRoutes(request);

    return {
      success: true,
      routes,
      searchQuery,
      searchSummary: this.generateSearchSummary(request, routes),
      citations: this.generateSimulatedCitations(request)
    };
  }

  /**
   * Build a natural language search query for the LLM
   */
  private buildSearchQuery(request: RouteSearchRequest): string {
    const locationName = request.location?.name || 'San Francisco Bay Area';
    const attractionTypes = request.attractionTypes.length > 0
      ? request.attractionTypes.map(id => {
          const category = ATTRACTION_CATEGORIES.find(c => c.id === id);
          return category?.name || id;
        }).join(', ')
      : 'scenic and interesting';

    let query = `Best cycling routes near ${locationName} with ${attractionTypes} attractions`;

    if (request.maxDistanceKm) {
      query += ` within ${request.maxDistanceKm}km`;
    }

    if (request.customPrompt) {
      query += `. ${request.customPrompt}`;
    }

    query += '. Include specific route details, notable stops, and tips for cyclists.';

    return query;
  }

  /**
   * Generate simulated routes for demo purposes.
   * In production, this would parse the LLM response.
   */
  private generateSimulatedRoutes(request: RouteSearchRequest): RecommendedRoute[] {
    const location = request.location;
    const attractionTypes = request.attractionTypes;

    // Generate routes based on selected attraction types and location
    const routes: RecommendedRoute[] = [];

    // Route 1: Scenic viewpoint route
    if (attractionTypes.includes('scenic') || attractionTypes.length === 0) {
      routes.push({
        id: 'route-scenic-1',
        name: location ? `${location.name} Scenic Loop` : 'Hawk Hill Panorama',
        description: 'A stunning route featuring multiple viewpoints with breathtaking views of the Golden Gate Bridge and San Francisco skyline.',
        startLocation: location?.name || 'Sausalito',
        endLocation: 'Hawk Hill Summit',
        estimatedDistanceKm: 18.5,
        estimatedDurationMinutes: 75,
        difficulty: 'moderate',
        terrain: 'road',
        attractions: [
          { name: 'Golden Gate Vista Point', type: 'Scenic View', description: 'Iconic view of the Golden Gate Bridge from the Marin side', rating: 4.9 },
          { name: 'Hawk Hill Summit', type: 'Scenic View', description: 'Panoramic 360-degree views of the Bay Area at 923ft elevation', rating: 4.8 },
          { name: 'Battery Spencer', type: 'Historic/Scenic', description: 'Historic WWII bunker with amazing bridge views', rating: 4.7 }
        ],
        highlights: ['Golden Gate Bridge views', 'Alcatraz Island sighting', 'SF skyline panorama'],
        bestTimeToVisit: 'Early morning or late afternoon for best lighting',
        tips: ['Bring layers for fog', 'Best on clear days', 'Steep climb to Hawk Hill'],
        sourceUrls: ['https://www.nps.gov/goga/planyourvisit/marin-headlands.htm']
      });
    }

    // Route 2: Nature & Wildlife route
    if (attractionTypes.includes('nature') || attractionTypes.length === 0) {
      routes.push({
        id: 'route-nature-1',
        name: 'Mt. Tamalpais Wildlife Trail',
        description: 'Explore the diverse ecosystems of Mt. Tamalpais, home to redwood groves, wildflowers, and abundant wildlife.',
        startLocation: 'Mill Valley',
        endLocation: 'Mt. Tamalpais East Peak',
        estimatedDistanceKm: 24.0,
        estimatedDurationMinutes: 120,
        difficulty: 'challenging',
        terrain: 'mountain',
        attractions: [
          { name: 'Muir Woods Gateway', type: 'Nature', description: 'Access point near the famous old-growth redwood forest', rating: 4.8 },
          { name: 'Deer Park Trail Junction', type: 'Wildlife', description: 'Common area for deer sightings and bird watching', rating: 4.5 },
          { name: 'East Peak Lookout', type: 'Nature/Scenic', description: 'Summit views with native flora and occasional hawk sightings', rating: 4.9 }
        ],
        highlights: ['Old-growth redwoods', 'Deer and bird watching', 'Wildflower meadows in spring'],
        bestTimeToVisit: 'Spring for wildflowers, Fall for clear skies',
        tips: ['Watch for wildlife on trails', 'Carry water - limited refill spots', 'Check fire conditions in summer'],
        sourceUrls: ['https://www.parks.ca.gov/?page_id=471']
      });
    }

    // Route 3: Historic route
    if (attractionTypes.includes('historic') || attractionTypes.length === 0) {
      routes.push({
        id: 'route-historic-1',
        name: 'SF Historic Waterfront Circuit',
        description: 'A journey through San Francisco\'s rich maritime and cultural history along the waterfront.',
        startLocation: 'Fisherman\'s Wharf',
        endLocation: 'Ferry Building',
        estimatedDistanceKm: 12.0,
        estimatedDurationMinutes: 60,
        difficulty: 'easy',
        terrain: 'urban',
        attractions: [
          { name: 'Ghirardelli Square', type: 'Historic', description: 'Historic chocolate factory turned shopping complex', rating: 4.4 },
          { name: 'Maritime National Historical Park', type: 'Historic', description: 'Fleet of historic ships and maritime museum', rating: 4.6 },
          { name: 'Ferry Building Marketplace', type: 'Historic/Food', description: '1898 ferry terminal now hosting artisan food vendors', rating: 4.7 }
        ],
        highlights: ['Historic ships', 'Cable car heritage', 'Victorian architecture'],
        bestTimeToVisit: 'Weekday mornings for fewer crowds',
        tips: ['Mostly flat terrain', 'Great for beginners', 'Many food stops available'],
        sourceUrls: ['https://www.nps.gov/safr/index.htm']
      });
    }

    // Route 4: Waterfront route
    if (attractionTypes.includes('waterfront') || attractionTypes.length === 0) {
      routes.push({
        id: 'route-waterfront-1',
        name: 'Coastal Bluffs & Beaches',
        description: 'A coastal cycling adventure featuring dramatic ocean views, hidden beaches, and crashing waves.',
        startLocation: 'Pacifica',
        endLocation: 'Half Moon Bay',
        estimatedDistanceKm: 22.0,
        estimatedDurationMinutes: 90,
        difficulty: 'moderate',
        terrain: 'road',
        attractions: [
          { name: 'Devil\'s Slide Trail', type: 'Waterfront', description: 'Dramatic coastal trail with ocean cliffs and sea caves', rating: 4.8 },
          { name: 'Gray Whale Cove Beach', type: 'Waterfront', description: 'Secluded beach perfect for whale watching in season', rating: 4.5 },
          { name: 'Pillar Point Harbor', type: 'Waterfront', description: 'Working harbor with sea lions and Mavericks surf spot views', rating: 4.6 }
        ],
        highlights: ['Ocean views', 'Whale watching (seasonal)', 'Sea caves and cliffs'],
        bestTimeToVisit: 'Winter for whale migration, Summer for clear weather',
        tips: ['Coastal winds can be strong', 'Bring binoculars for marine life', 'Stop at Half Moon Bay for fish tacos'],
        sourceUrls: ['https://www.smcgov.org/parks/devil-s-slide-trail']
      });
    }

    // Route 5: Food & Drink route
    if (attractionTypes.includes('food')) {
      routes.push({
        id: 'route-food-1',
        name: 'Wine Country Tasting Loop',
        description: 'A leisurely ride through Sonoma\'s rolling hills, stopping at world-class wineries and farm-to-table restaurants.',
        startLocation: 'Sonoma Plaza',
        endLocation: 'Glen Ellen',
        estimatedDistanceKm: 16.0,
        estimatedDurationMinutes: 180,
        difficulty: 'easy',
        terrain: 'road',
        attractions: [
          { name: 'Buena Vista Winery', type: 'Food & Drink', description: 'California\'s oldest premium winery with historic caves', rating: 4.6 },
          { name: 'The Girl & The Fig', type: 'Food & Drink', description: 'Farm-to-table French cuisine on Sonoma Plaza', rating: 4.7 },
          { name: 'Benziger Family Winery', type: 'Food & Drink', description: 'Biodynamic winery with tram tours through vineyards', rating: 4.8 }
        ],
        highlights: ['Wine tastings', 'Artisan cheese', 'Olive oil sampling'],
        bestTimeToVisit: 'Fall for harvest season, Spring for mustard blooms',
        tips: ['Pace yourself with tastings', 'Book ahead for popular wineries', 'Bring panniers for purchases'],
        sourceUrls: ['https://www.sonomacounty.com/things-to-do/biking']
      });
    }

    // Route 6: Art & Culture route
    if (attractionTypes.includes('art')) {
      routes.push({
        id: 'route-art-1',
        name: 'Mission District Mural Tour',
        description: 'Explore San Francisco\'s vibrant street art scene through the colorful murals of the Mission District.',
        startLocation: '24th Street BART',
        endLocation: 'Valencia Street',
        estimatedDistanceKm: 8.0,
        estimatedDurationMinutes: 90,
        difficulty: 'easy',
        terrain: 'urban',
        attractions: [
          { name: 'Balmy Alley', type: 'Art & Culture', description: 'Famous alley covered in colorful political and cultural murals', rating: 4.8 },
          { name: 'Clarion Alley', type: 'Art & Culture', description: 'Ever-changing street art gallery in an urban alleyway', rating: 4.7 },
          { name: 'Women\'s Building', type: 'Art & Culture', description: 'Massive mural celebrating women\'s achievements', rating: 4.6 }
        ],
        highlights: ['Street murals', 'Gallery hopping', 'Cultural landmarks'],
        bestTimeToVisit: 'Daytime for best mural viewing',
        tips: ['Walk bikes in alleys', 'Stop for local coffee', 'Join a guided mural tour'],
        sourceUrls: ['https://www.precitaeyes.org/']
      });
    }

    // Route 7: Adventure route
    if (attractionTypes.includes('adventure')) {
      routes.push({
        id: 'route-adventure-1',
        name: 'Tamarancho Flow Challenge',
        description: 'An adrenaline-pumping mountain bike adventure on purpose-built flow trails with jumps and berms.',
        startLocation: 'Tamarancho Camp Taylor',
        endLocation: 'Camp Tamarancho',
        estimatedDistanceKm: 12.0,
        estimatedDurationMinutes: 90,
        difficulty: 'expert',
        terrain: 'singletrack',
        attractions: [
          { name: 'Flow Trail', type: 'Adventure', description: 'Purpose-built trail with rollers, berms, and optional jumps', rating: 4.9 },
          { name: 'Redwood Descent', type: 'Adventure', description: 'Technical singletrack through old-growth redwood grove', rating: 4.7 },
          { name: 'Ridge Trail Overlook', type: 'Adventure/Scenic', description: 'High-elevation viewpoint with Bay views', rating: 4.6 }
        ],
        highlights: ['Flow trail features', 'Technical descents', 'Redwood riding'],
        bestTimeToVisit: 'Spring and Fall for best trail conditions',
        tips: ['Helmet and pads required', 'Check trail conditions', 'Membership required for some trails'],
        sourceUrls: ['https://www.camptamarancho.org/']
      });
    }

    // Ensure at least one route is returned
    if (routes.length === 0) {
      routes.push({
        id: 'route-default-1',
        name: 'Bay Area Discovery Ride',
        description: 'A well-rounded route showcasing the best of the Bay Area\'s diverse cycling terrain and attractions.',
        startLocation: 'Golden Gate Park',
        endLocation: 'Ocean Beach',
        estimatedDistanceKm: 15.0,
        estimatedDurationMinutes: 75,
        difficulty: 'moderate',
        terrain: 'mixed',
        attractions: [
          { name: 'Japanese Tea Garden', type: 'Nature/Culture', description: 'Serene Japanese garden with pagoda and koi ponds', rating: 4.7 },
          { name: 'California Academy of Sciences', type: 'Culture', description: 'World-class natural history museum', rating: 4.8 },
          { name: 'Ocean Beach Sunset', type: 'Scenic', description: 'Wide sandy beach perfect for sunset viewing', rating: 4.6 }
        ],
        highlights: ['Urban park cycling', 'Beach destination', 'Cultural stops'],
        bestTimeToVisit: 'Late afternoon for sunset at Ocean Beach',
        tips: ['Flat, paved paths throughout', 'Beach gets windy in afternoon', 'Great for all skill levels']
      });
    }

    return routes;
  }

  /**
   * Generate a summary of the search results
   */
  private generateSearchSummary(request: RouteSearchRequest, routes: RecommendedRoute[]): string {
    const locationName = request.location?.name || 'the Bay Area';
    const attractionCount = routes.reduce((sum, route) => sum + route.attractions.length, 0);
    const totalDistance = routes.reduce((sum, route) => sum + route.estimatedDistanceKm, 0);

    return `Found ${routes.length} cycling routes near ${locationName} featuring ${attractionCount} attractions ` +
           `across ${Math.round(totalDistance)}km of riding. Routes range from easy urban rides to challenging mountain trails.`;
  }

  /**
   * Generate simulated citation URLs
   */
  private generateSimulatedCitations(request: RouteSearchRequest): string[] {
    return [
      'https://www.nps.gov/goga/planyourvisit/biking.htm',
      'https://www.marinbike.org/routes/',
      'https://www.sfbike.org/resources/maps/',
      'https://www.parksconservancy.org/biking',
      'https://www.strava.com/local/us/san-francisco/cycling/routes'
    ];
  }

  /**
   * Utility function to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the category definition by ID
   */
  getCategoryById(id: string): AttractionCategory | undefined {
    return ATTRACTION_CATEGORIES.find(c => c.id === id);
  }

  /**
   * Clean up subscriptions
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import { Injectable } from '@angular/core';
import type {
  ITourHost,
  TourHostCapabilities,
  TourLocation,
  TourNavigationIntent,
  TourPrincipal,
} from '@memberjunction/tours-runtime';
import { BehaviorSubject, type Observable } from 'rxjs';

/**
 * Minimal non-Explorer `ITourHost` implementation proving `@memberjunction/ng-tours`
 * runs in any Angular application with zero `@memberjunction/ng-explorer*` or `Router` coupling.
 */
@Injectable()
export class DemoAngularTourHost implements ITourHost {
  public readonly Capabilities: TourHostCapabilities = {
    Navigation: 'Url',
    EntityEvents: false,
    MJForms: false,
    Angular: true,
    Agent: 'None',
    Persistence: 'Memory',
  };

  public readonly Principal: TourPrincipal = {
    Kind: 'Anonymous',
  };

  private readonly _location$ = new BehaviorSubject<TourLocation>({
    Url: '/workspace',
    CustomContext: { HostName: 'DemoAngularApp' },
  });

  public get Location$(): Observable<TourLocation> {
    return this._location$.asObservable();
  }

  public GetCurrentLocation(): TourLocation {
    return this._location$.getValue();
  }

  public async Navigate(intent: TourNavigationIntent): Promise<boolean> {
    if (intent.Url) {
      this._location$.next({ Url: intent.Url });
      return true;
    }
    return false;
  }
}

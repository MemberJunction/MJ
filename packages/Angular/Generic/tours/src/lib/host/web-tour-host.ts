/**
 * @fileoverview Default browser `ITourHost` implementation (`WebTourHost`) for plain HTML pages,
 * custom elements, and non-Explorer Angular apps (§4.2).
 * @module @memberjunction/ng-tours
 */

import type {
  ITourHost,
  TourHostCapabilities,
  TourLocation,
  TourNavigationIntent,
  TourPrincipal,
} from '@memberjunction/tours-runtime';
import { BehaviorSubject, type Observable } from 'rxjs';

export interface WebTourHostOptions {
  SurfaceKey?: string;
  VisitorKey?: string;
  Principal?: TourPrincipal;
  OnNavigate?: (intent: TourNavigationIntent) => boolean | void | Promise<boolean | void>;
  Capabilities?: Partial<TourHostCapabilities>;
}

/**
 * Browser-based `ITourHost` tracking `window.location` (`popstate` / `hashchange`)
 * and fulfilling URL navigation intents via `OnNavigate` or `location.assign`.
 */
export class WebTourHost implements ITourHost {
  public readonly Capabilities: TourHostCapabilities;
  public readonly Principal: TourPrincipal;

  private readonly _locationSubject: BehaviorSubject<TourLocation>;
  private readonly _onNavigate?: WebTourHostOptions['OnNavigate'];
  private readonly _onRouteEvent = (): void => this.SyncLocation();
  private _disposed = false;

  constructor(options: WebTourHostOptions = {}) {
    this.Capabilities = {
      Navigation: 'Url',
      EntityEvents: false,
      MJForms: false,
      Angular: true,
      Agent: 'None',
      Persistence: options.SurfaceKey ? 'Guest' : 'Memory',
      ...options.Capabilities,
    };
    this.Principal = options.Principal ?? (
      options.SurfaceKey
        ? {
            Kind: 'Guest',
            VisitorKey: options.VisitorKey ?? `guest-${options.SurfaceKey}`,
            SurfaceKey: options.SurfaceKey,
          }
        : { Kind: 'Anonymous' }
    );
    this._onNavigate = options.OnNavigate;
    this._locationSubject = new BehaviorSubject<TourLocation>(this.readCurrentLocation());

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this._onRouteEvent);
      window.addEventListener('hashchange', this._onRouteEvent);
    }
  }

  public get Location$(): Observable<TourLocation> {
    return this._locationSubject.asObservable();
  }

  public GetCurrentLocation(): TourLocation {
    return this._locationSubject.getValue();
  }

  public SyncLocation(): void {
    if (this._disposed) {
      return;
    }
    this._locationSubject.next(this.readCurrentLocation());
  }

  public async Navigate(intent: TourNavigationIntent): Promise<boolean> {
    if (this._onNavigate) {
      const handled = await this._onNavigate(intent);
      this.SyncLocation();
      return handled !== false;
    }
    if (intent.Url && typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
      window.location.assign(intent.Url);
      return true;
    }
    return false;
  }

  public Dispose(): void {
    this._disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this._onRouteEvent);
      window.removeEventListener('hashchange', this._onRouteEvent);
    }
    this._locationSubject.complete();
  }

  private readCurrentLocation(): TourLocation {
    if (typeof window === 'undefined') {
      return {};
    }
    return {
      Url: window.location.href,
    };
  }
}

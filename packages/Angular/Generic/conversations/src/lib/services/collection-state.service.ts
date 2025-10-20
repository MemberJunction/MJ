import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * State management service for collections
 * Tracks active collection for deep linking support
 */
@Injectable({
  providedIn: 'root'
})
export class CollectionStateService {
  private _activeCollectionId$ = new BehaviorSubject<string | null>(null);

  /**
   * Observable of the active collection ID
   */
  public readonly activeCollectionId$: Observable<string | null> = this._activeCollectionId$.asObservable();

  /**
   * Gets the currently active collection ID (synchronous)
   */
  public get activeCollectionId(): string | null {
    return this._activeCollectionId$.value;
  }

  constructor() {}

  /**
   * Sets the active collection
   * @param id The collection ID to activate (or null to clear)
   */
  setActiveCollection(id: string | null): void {
    console.log('📁 Setting active collection:', id);
    this._activeCollectionId$.next(id);
  }

  /**
   * Clears the active collection
   */
  clearActiveCollection(): void {
    this._activeCollectionId$.next(null);
  }

  /**
   * Gets the currently active collection ID
   */
  getActiveCollectionId(): string | null {
    return this._activeCollectionId$.value;
  }
}

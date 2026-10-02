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
  public readonly ActiveCollectionId$: Observable<string | null> = this._activeCollectionId$.asObservable();

  /** @deprecated Use {@link ActiveCollectionId$}. */
  public get activeCollectionId$(): Observable<string | null> {
    return this.ActiveCollectionId$;
  }

  /**
   * Gets the currently active collection ID (synchronous)
   */
  public get ActiveCollectionId(): string | null {
    return this._activeCollectionId$.value;
  }

  /** @deprecated Use {@link ActiveCollectionId}. */
  public get activeCollectionId(): string | null {
    return this.ActiveCollectionId;
  }

  constructor() {}

  /**
   * Sets the active collection
   * @param id The collection ID to activate (or null to clear)
   */
  SetActiveCollection(id: string | null): void {
    console.log('📁 Setting active collection:', id);
    this._activeCollectionId$.next(id);
  }

  /** @deprecated Use {@link SetActiveCollection}. */
  setActiveCollection(id: string | null): void {
    return this.SetActiveCollection(id);
  }

  /**
   * Clears the active collection
   */
  ClearActiveCollection(): void {
    this._activeCollectionId$.next(null);
  }

  /** @deprecated Use {@link ClearActiveCollection}. */
  clearActiveCollection(): void {
    return this.ClearActiveCollection();
  }

  /**
   * Gets the currently active collection ID
   */
  GetActiveCollectionId(): string | null {
    return this._activeCollectionId$.value;
  }

  /** @deprecated Use {@link GetActiveCollectionId}. */
  getActiveCollectionId(): string | null {
    return this.GetActiveCollectionId();
  }
}

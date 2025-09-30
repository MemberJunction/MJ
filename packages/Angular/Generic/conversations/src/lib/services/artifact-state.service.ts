import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { ArtifactEntity } from '@memberjunction/core-entities';

/**
 * State management for artifacts and the artifact panel
 */
@Injectable({
  providedIn: 'root'
})
export class ArtifactStateService {
  private _activeArtifactId$ = new BehaviorSubject<string | null>(null);
  private _activeVersionNumber$ = new BehaviorSubject<number | null>(null);
  private _artifacts$ = new BehaviorSubject<Map<string, ArtifactEntity>>(new Map());
  private _isPanelOpen$ = new BehaviorSubject<boolean>(false);
  private _panelMode$ = new BehaviorSubject<'view' | 'edit'>('view');

  // Public observable streams
  public readonly activeArtifactId$ = this._activeArtifactId$.asObservable();
  public readonly activeVersionNumber$ = this._activeVersionNumber$.asObservable();
  public readonly isPanelOpen$ = this._isPanelOpen$.asObservable();
  public readonly panelMode$ = this._panelMode$.asObservable();

  // Derived observable for active artifact
  public readonly activeArtifact$: Observable<ArtifactEntity | null> = combineLatest([
    this.activeArtifactId$,
    this._artifacts$
  ]).pipe(
    map(([id, artifacts]) => id ? artifacts.get(id) || null : null),
    shareReplay(1)
  );

  constructor() {}

  /**
   * Opens an artifact in the panel
   * @param id The artifact ID
   * @param versionNumber Optional specific version number
   */
  openArtifact(id: string, versionNumber?: number): void {
    this._activeArtifactId$.next(id);
    this._activeVersionNumber$.next(versionNumber || null);
    this._isPanelOpen$.next(true);
  }

  /**
   * Closes the artifact panel
   */
  closeArtifact(): void {
    this._activeArtifactId$.next(null);
    this._activeVersionNumber$.next(null);
    this._isPanelOpen$.next(false);
    this._panelMode$.next('view');
  }

  /**
   * Toggles the panel open/closed state
   */
  togglePanel(): void {
    this._isPanelOpen$.next(!this._isPanelOpen$.value);
  }

  /**
   * Sets the panel mode
   * @param mode The mode ('view' or 'edit')
   */
  setPanelMode(mode: 'view' | 'edit'): void {
    this._panelMode$.next(mode);
  }

  /**
   * Caches an artifact in memory
   * @param artifact The artifact to cache
   */
  cacheArtifact(artifact: ArtifactEntity): void {
    const current = this._artifacts$.value;
    current.set(artifact.ID, artifact);
    this._artifacts$.next(new Map(current));
  }

  /**
   * Removes an artifact from cache
   * @param id The artifact ID
   */
  removeCachedArtifact(id: string): void {
    const current = this._artifacts$.value;
    current.delete(id);
    this._artifacts$.next(new Map(current));
  }

  /**
   * Clears all cached artifacts
   */
  clearCache(): void {
    this._artifacts$.next(new Map());
  }
}
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Service to manage the state of the keyboard shortcuts help overlay.
 * Provides methods to open, close, and toggle the overlay visibility.
 */
@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutsHelpService {
  private isOpen$ = new BehaviorSubject<boolean>(false);

  /**
   * Opens the keyboard shortcuts help overlay
   */
  Open(): void {
    this.isOpen$.next(true);
  }

  /**
   * Closes the keyboard shortcuts help overlay
   */
  Close(): void {
    this.isOpen$.next(false);
  }

  /**
   * Toggles the keyboard shortcuts help overlay visibility
   */
  Toggle(): void {
    this.isOpen$.next(!this.isOpen$.value);
  }

  /**
   * Observable that emits the current visibility state of the overlay
   */
  IsOpen(): Observable<boolean> {
    return this.isOpen$.asObservable();
  }

  /**
   * Gets the current visibility state synchronously
   */
  get IsCurrentlyOpen(): boolean {
    return this.isOpen$.value;
  }
}

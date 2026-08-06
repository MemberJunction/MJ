import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Opener for the mobile record switcher sheet. The sheet renders inside
 * tab-container (which owns close routing and both golden-layout managers),
 * but open requests come from surfaces that live elsewhere in the shell —
 * the nav drawer's Records pill today. This service is that one-way channel:
 * callers Open(), tab-container listens.
 *
 * (The record bar doesn't need it — it's a child of tab-container and emits
 * directly.)
 */
@Injectable({ providedIn: 'root' })
export class RecordSwitcherService {
  private openRequested = new Subject<void>();

  /** tab-container subscribes; each emission shows the switcher sheet */
  public get OpenRequested(): Observable<void> {
    return this.openRequested.asObservable();
  }

  public Open(): void {
    this.openRequested.next();
  }
}

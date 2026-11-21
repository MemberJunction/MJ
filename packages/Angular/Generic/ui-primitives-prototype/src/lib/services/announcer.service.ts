import { Injectable, inject, OnDestroy } from '@angular/core';
import { LiveAnnouncer, AriaLivePoliteness } from '@angular/cdk/a11y';

/**
 * Shared live-region announcement service backed by @angular/cdk/a11y LiveAnnouncer.
 * Used by MJLayerService, toasts, and interactive rows.
 */
@Injectable({ providedIn: 'root' })
export class MJAnnouncerService implements OnDestroy {
  private readonly liveAnnouncer = inject(LiveAnnouncer);

  /** Announces a message to assistive technology with the requested politeness. */
  public Announce(message: string, politeness: AriaLivePoliteness = 'polite'): Promise<void> {
    if (!message.trim()) {
      return Promise.resolve();
    }
    return this.liveAnnouncer.announce(message, politeness);
  }

  /** Clears any active live-region announcement. */
  public Clear(): void {
    this.liveAnnouncer.clear();
  }

  ngOnDestroy(): void {
    this.liveAnnouncer.clear();
  }
}

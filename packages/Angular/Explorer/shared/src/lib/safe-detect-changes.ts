import { ChangeDetectorRef } from '@angular/core';

/**
 * Synchronous, exception-safe change-detection flush for zoneless Angular.
 *
 * RxJS-driven mutations are invisible until SOMETHING runs CD; detectChanges
 * throws when a pass is already in flight, and an unguarded throw inside a
 * promise or subscription callback silently kills the update (and, for
 * subscriptions, can unsubscribe the stream). markForCheck runs first so even
 * the re-entrant case gets picked up by the in-flight pass.
 */
export function SafeDetectChanges(cdr: ChangeDetectorRef | null | undefined): void {
  if (!cdr) {
    return;
  }
  cdr.markForCheck();
  try {
    cdr.detectChanges();
  } catch {
    // Re-entrant CD — the in-flight pass will apply the marked changes.
  }
}

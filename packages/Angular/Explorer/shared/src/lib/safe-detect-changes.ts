import { ChangeDetectorRef } from '@angular/core';
import { LogError } from '@memberjunction/core';

/**
 * Synchronous, exception-safe change-detection flush for zoneless Angular.
 *
 * RxJS-driven mutations are invisible until SOMETHING runs CD; detectChanges
 * throws when a pass is already in flight, and an unguarded throw inside a
 * promise or subscription callback silently kills the update (and, for
 * subscriptions, can unsubscribe the stream). markForCheck runs first so even
 * the re-entrant case gets picked up by the in-flight pass.
 *
 * Swallow-but-LOG: the catch exists to protect the CALLING stream, never to
 * hide the error. A real template error surfacing through this path (NG0100,
 * a throwing getter) is logged with full detail — the marked view still gets
 * applied by the next pass, and the stream survives, but the failure is
 * visible instead of silent.
 */
export function SafeDetectChanges(cdr: ChangeDetectorRef | null | undefined): void {
  if (!cdr) {
    return;
  }
  cdr.markForCheck();
  try {
    cdr.detectChanges();
  } catch (err) {
    LogError(`SafeDetectChanges: detectChanges threw (view stays marked for the next pass; the calling stream is protected). Underlying error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }
}

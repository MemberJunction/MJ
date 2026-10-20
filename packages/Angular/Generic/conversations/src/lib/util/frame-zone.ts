import { inject, NgZone } from '@angular/core';

/**
 * The slice of NgZone the streamed-render path needs: run a frame outside Angular, re-enter for
 * the few writes that touch template-bound state. A host built without a zone (a bare injector
 * in a spec, a server render) simply runs both inline.
 */
export type FrameZone = Pick<NgZone, 'run' | 'runOutsideAngular'>;

const INLINE_ZONE: FrameZone = {
  run: (fn) => fn(),
  runOutsideAngular: (fn) => fn(),
};

/** Resolves the current injector's NgZone, or the inline zone when there is none. Call during construction. */
export function InjectFrameZone(): FrameZone {
  return inject(NgZone, { optional: true }) ?? INLINE_ZONE;
}

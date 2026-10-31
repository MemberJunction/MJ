/**
 * TEST SUPPORT ONLY: typed DOM queries for the Predictive Studio widget DOM tests (no casts: each result is narrowed
 * with an `instanceof` guard). Nothing outside `*.test.ts` files imports this module; it compiles with the package
 * because the build config only excludes `*.test.ts` files.
 */
import type { ComponentFixture } from '@angular/core/testing';

/** The fixture's host element. */
export function HostElement<T>(fixture: ComponentFixture<T>): HTMLElement {
  const host: Element = fixture.nativeElement;
  if (!(host instanceof HTMLElement)) throw new Error('The fixture has no HTML host element.');
  return host;
}

/** The element `selector` finds under `root`, which must be of `type`. */
export function QueryElement<T extends Element>(root: ParentNode, selector: string, type: { new (): T; prototype: T }): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`${selector} did not find a ${type.name}.`);
  return found;
}

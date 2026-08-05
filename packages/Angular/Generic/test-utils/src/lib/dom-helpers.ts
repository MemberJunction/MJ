import { EventEmitter } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';

/**
 * Thin query/interaction helpers for DOM specs — they remove the repetitive
 * `fixture.nativeElement.querySelector(...) as HTMLX` / `dispatchEvent` / spy-subscribe
 * boilerplate WITHOUT hiding the assertion. Read helpers return a value so the `expect`
 * still lives in the test; interaction helpers fail loudly if nothing matches.
 */

const host = (fixture: ComponentFixture<unknown>): HTMLElement => fixture.nativeElement as HTMLElement;

/** First element matching `selector` in the rendered DOM, or null. */
export function query(fixture: ComponentFixture<unknown>, selector: string): Element | null {
  return host(fixture).querySelector(selector);
}

/** All elements matching `selector`, as an array. */
export function queryAll(fixture: ComponentFixture<unknown>, selector: string): Element[] {
  return Array.from(host(fixture).querySelectorAll(selector));
}

/** Trimmed text content of the first match (empty string if no match). */
export function text(fixture: ComponentFixture<unknown>, selector: string): string {
  return query(fixture, selector)?.textContent?.trim() ?? '';
}

/** An attribute value of the first match (null if no match or attribute absent). */
export function attr(fixture: ComponentFixture<unknown>, selector: string, name: string): string | null {
  return query(fixture, selector)?.getAttribute(name) ?? null;
}

/** Whether the first match carries `className` (false if no match). */
export function hasClass(fixture: ComponentFixture<unknown>, selector: string, className: string): boolean {
  return query(fixture, selector)?.classList.contains(className) ?? false;
}

/** Click the first match. Throws if nothing matches (a silent no-op would hide test mistakes). */
export function click(fixture: ComponentFixture<unknown>, selector: string): void {
  const el = query(fixture, selector);
  if (!el) throw new Error(`click(): no element matched "${selector}"`);
  (el as HTMLElement).click();
}

/** Set the value of the first match (an input) and dispatch an `input` event. Throws if nothing matches. */
export function typeInto(fixture: ComponentFixture<unknown>, selector: string, value: string): void {
  const el = query(fixture, selector);
  if (!el) throw new Error(`typeInto(): no element matched "${selector}"`);
  const input = el as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

/**
 * Record everything an `@Output` (or any subscribable, e.g. an EventEmitter/Observable)
 * emits into an array, for direct assertion. Pass the emitter itself — typed, no string
 * names, no `vi` dependency.
 *
 * @example
 * const clicks = capture(fixture.componentInstance.Clicked);
 * click(fixture, 'button');
 * expect(clicks).toEqual([true]);
 */
export function capture<T>(emitter: EventEmitter<T>): T[] {
  const values: T[] = [];
  emitter.subscribe((value) => values.push(value));
  return values;
}

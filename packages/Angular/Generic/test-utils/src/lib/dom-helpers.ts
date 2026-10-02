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
export function Query(fixture: ComponentFixture<unknown>, selector: string): Element | null {
  return host(fixture).querySelector(selector);
}

/** @deprecated Use {@link Query}. */
export function query(fixture: ComponentFixture<unknown>, selector: string): Element | null {
  return Query(fixture, selector);
}

/** All elements matching `selector`, as an array. */
export function QueryAll(fixture: ComponentFixture<unknown>, selector: string): Element[] {
  return Array.from(host(fixture).querySelectorAll(selector));
}

/** @deprecated Use {@link QueryAll}. */
export function queryAll(fixture: ComponentFixture<unknown>, selector: string): Element[] {
  return QueryAll(fixture, selector);
}

/** Trimmed text content of the first match (empty string if no match). */
export function Text(fixture: ComponentFixture<unknown>, selector: string): string {
  return Query(fixture, selector)?.textContent?.trim() ?? '';
}

/** @deprecated Use {@link Text}. */
export function text(fixture: ComponentFixture<unknown>, selector: string): string {
  return Text(fixture, selector);
}

/** An attribute value of the first match (null if no match or attribute absent). */
export function Attr(fixture: ComponentFixture<unknown>, selector: string, name: string): string | null {
  return Query(fixture, selector)?.getAttribute(name) ?? null;
}

/** @deprecated Use {@link Attr}. */
export function attr(fixture: ComponentFixture<unknown>, selector: string, name: string): string | null {
  return Attr(fixture, selector, name);
}

/** Whether the first match carries `className` (false if no match). */
export function HasClass(fixture: ComponentFixture<unknown>, selector: string, className: string): boolean {
  return Query(fixture, selector)?.classList.contains(className) ?? false;
}

/** @deprecated Use {@link HasClass}. */
export function hasClass(fixture: ComponentFixture<unknown>, selector: string, className: string): boolean {
  return HasClass(fixture, selector, className);
}

/** Click the first match. Throws if nothing matches (a silent no-op would hide test mistakes). */
export function Click(fixture: ComponentFixture<unknown>, selector: string): void {
  const el = Query(fixture, selector);
  if (!el) throw new Error(`click(): no element matched "${selector}"`);
  (el as HTMLElement).click();
}

/** @deprecated Use {@link Click}. */
export function click(fixture: ComponentFixture<unknown>, selector: string): void {
  return Click(fixture, selector);
}

/** Set the value of the first match (an input) and dispatch an `input` event. Throws if nothing matches. */
export function TypeInto(fixture: ComponentFixture<unknown>, selector: string, value: string): void {
  const el = Query(fixture, selector);
  if (!el) throw new Error(`typeInto(): no element matched "${selector}"`);
  const input = el as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

/** @deprecated Use {@link TypeInto}. */
export function typeInto(fixture: ComponentFixture<unknown>, selector: string, value: string): void {
  return TypeInto(fixture, selector, value);
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
export function Capture<T>(emitter: EventEmitter<T>): T[] {
  const values: T[] = [];
  emitter.subscribe((value) => values.push(value));
  return values;
}

/** @deprecated Use {@link Capture}. */
export function capture<T>(emitter: EventEmitter<T>): T[] {
  return Capture(emitter);
}

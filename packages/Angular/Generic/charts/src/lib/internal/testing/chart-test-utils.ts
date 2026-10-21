import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

/*
 * Test-only helpers shared by the chart DOM tests. Not exported from public-api.ts and
 * excluded from the library build (tsconfig.json). Deliberately free of vitest imports.
 */

/** Renders, waits out the frame's ResizeObserver/measure debounce, and re-renders. */
export async function Settle(fixture: ComponentFixture<unknown>): Promise<void> {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 40));
    await fixture.whenStable();
    fixture.detectChanges();
}

/** Creates `component`, applies `defaults` overridden by `inputs` via setInput, and settles. */
export async function RenderChart<T>(
    component: Type<T>,
    defaults: Record<string, unknown>,
    inputs: Record<string, unknown> = {},
): Promise<ComponentFixture<T>> {
    const fixture = TestBed.createComponent(component);
    for (const [name, value] of Object.entries({ ...defaults, ...inputs })) {
        fixture.componentRef.setInput(name, value);
    }
    await Settle(fixture);
    return fixture;
}

/** The chart's pointer-event surface. */
export function ChartSvg(fixture: ComponentFixture<unknown>): SVGSVGElement {
    return fixture.nativeElement.querySelector('svg.mj-chart-svg');
}

/** A pointer-ish MouseEvent reporting `pointerType: 'touch'`; pointerleave does not bubble, like the real event. */
export function CreateTouchEvent(type: string, x: number, y: number): MouseEvent {
    const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: type !== 'pointerleave' });
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    return ev;
}

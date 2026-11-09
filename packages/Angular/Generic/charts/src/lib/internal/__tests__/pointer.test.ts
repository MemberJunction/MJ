import { describe, it, expect } from 'vitest';
import { LocalPoint } from '../pointer';

/** An <svg> laid out at `layout` px but drawn through an ancestor transform as `drawn` (what getBoundingClientRect reports). */
function svgAt(layout: { Width: number; Height: number }, drawn: { Left: number; Top: number; Width: number; Height: number }): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.defineProperty(svg, 'clientWidth', { configurable: true, get: () => layout.Width });
    Object.defineProperty(svg, 'clientHeight', { configurable: true, get: () => layout.Height });
    svg.getBoundingClientRect = () => ({ left: drawn.Left, top: drawn.Top, width: drawn.Width, height: drawn.Height, x: drawn.Left, y: drawn.Top, right: drawn.Left + drawn.Width, bottom: drawn.Top + drawn.Height, toJSON: () => ({}) });
    return svg;
}

function eventOn(target: Element, clientX: number, clientY: number): MouseEvent {
    const ev = new MouseEvent('pointermove', { clientX, clientY });
    Object.defineProperty(ev, 'currentTarget', { value: target });
    return ev;
}

describe('LocalPoint', () => {
    it('is the offset from the element’s top-left when nothing is transformed', () => {
        const svg = svgAt({ Width: 600, Height: 300 }, { Left: 10, Top: 20, Width: 600, Height: 300 });
        expect(LocalPoint(eventOn(svg, 110, 70))).toEqual({ X: 100, Y: 50 });
    });

    it('maps back into layout px under an ancestor scale(0.95) (PR #5368 review)', () => {
        const svg = svgAt({ Width: 600, Height: 300 }, { Left: 10, Top: 20, Width: 570, Height: 285 });
        // The drawn right/bottom edge is the layout's right/bottom edge.
        const p = LocalPoint(eventOn(svg, 10 + 570, 20 + 285));
        expect(p.X).toBeCloseTo(600);
        expect(p.Y).toBeCloseTo(300);
    });

    it('falls back to unscaled offsets when the element has no layout size (jsdom, display:none)', () => {
        const svg = svgAt({ Width: 0, Height: 0 }, { Left: 10, Top: 20, Width: 0, Height: 0 });
        expect(LocalPoint(eventOn(svg, 15, 25))).toEqual({ X: 5, Y: 5 });
    });
});

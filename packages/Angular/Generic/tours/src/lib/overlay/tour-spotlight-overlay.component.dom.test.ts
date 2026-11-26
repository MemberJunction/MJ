import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  BuildSpotlightEvenOddPath,
  TourSpotlightOverlayComponent,
} from './tour-spotlight-overlay.component';

describe('TourSpotlightOverlayComponent', () => {
  it('hides backdrop when Visible is false and renders aria-hidden SVG mask when Visible is true', () => {
    const fixture = TestBed.createComponent(TourSpotlightOverlayComponent);
    fixture.componentRef.setInput('Visible', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.mjt-spotlight-backdrop')).toBeNull();

    fixture.componentRef.setInput('Visible', true);
    fixture.componentRef.setInput('ViewportWidth', 1440);
    fixture.componentRef.setInput('ViewportHeight', 900);
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.mjt-spotlight-backdrop') as HTMLElement;
    const svg = fixture.nativeElement.querySelector('svg.mjt-spotlight-svg') as SVGSVGElement;
    const path = fixture.nativeElement.querySelector('path.mjt-spotlight-path') as SVGPathElement;

    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1440 900');
    expect(path.getAttribute('d')).toBe('M0,0 H1440 V900 H0 Z');
  });

  it('renders rounded cutout rect attributes (x, y, width, height, rx, ry) and updates evenodd d path', () => {
    const fixture = TestBed.createComponent(TourSpotlightOverlayComponent);
    fixture.componentRef.setInput('Visible', true);
    fixture.componentRef.setInput('ViewportWidth', 1280);
    fixture.componentRef.setInput('ViewportHeight', 720);
    fixture.componentRef.setInput('Cutouts', [{ X: 100, Y: 50, Width: 200, Height: 48, Radius: 12 }]);
    fixture.detectChanges();

    const halo = fixture.nativeElement.querySelector('rect.mjt-spotlight-halo') as SVGRectElement;
    const ring = fixture.nativeElement.querySelector('rect.mjt-spotlight-ring') as SVGRectElement;
    const path = fixture.nativeElement.querySelector('path.mjt-spotlight-path') as SVGPathElement;

    expect(halo.getAttribute('x')).toBe('98');
    expect(halo.getAttribute('y')).toBe('48');
    expect(halo.getAttribute('width')).toBe('204');
    expect(halo.getAttribute('height')).toBe('52');
    expect(halo.getAttribute('rx')).toBe('14');
    expect(halo.getAttribute('ry')).toBe('14');

    expect(ring.getAttribute('x')).toBe('100');
    expect(ring.getAttribute('y')).toBe('50');
    expect(ring.getAttribute('width')).toBe('200');
    expect(ring.getAttribute('height')).toBe('48');
    expect(ring.getAttribute('rx')).toBe('12');
    expect(ring.getAttribute('ry')).toBe('12');

    expect(path.getAttribute('d')).toBe(
      BuildSpotlightEvenOddPath(1280, 720, [{ X: 100, Y: 50, Width: 200, Height: 48, Radius: 12 }]),
    );
  });

  it('applies mjt-spotlight-halo--guide and mjt-spotlight-ring--guide when GuideTone is true', () => {
    const fixture = TestBed.createComponent(TourSpotlightOverlayComponent);
    fixture.componentRef.setInput('Visible', true);
    fixture.componentRef.setInput('GuideTone', false);
    fixture.componentRef.setInput('Cutouts', [{ X: 20, Y: 20, Width: 120, Height: 40 }]);
    fixture.detectChanges();

    const halo = fixture.nativeElement.querySelector('rect.mjt-spotlight-halo') as SVGRectElement;
    const ring = fixture.nativeElement.querySelector('rect.mjt-spotlight-ring') as SVGRectElement;
    expect(halo.classList.contains('mjt-spotlight-halo--guide')).toBe(false);
    expect(ring.classList.contains('mjt-spotlight-ring--guide')).toBe(false);

    fixture.componentRef.setInput('GuideTone', true);
    fixture.detectChanges();

    expect(halo.classList.contains('mjt-spotlight-halo--guide')).toBe(true);
    expect(ring.classList.contains('mjt-spotlight-ring--guide')).toBe(true);
  });
});

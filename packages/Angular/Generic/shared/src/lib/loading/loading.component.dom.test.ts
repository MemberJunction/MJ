import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, attr, hasClass } from '@memberjunction/ng-test-utils';
import { LoadingComponent } from './loading.component';

/**
 * <mj-loading> is a module-declared (standalone:false), pure @Input-driven leaf.
 * Its contract lives entirely in the template: @if gating of the gradient <defs>
 * and the text <p>, the [class]/[style] bindings on the logo wrapper, and the SVG
 * gradient attribute bindings. We configure it via `inputs` + `declarations`.
 */
describe('LoadingComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}) {
    return renderComponentFixture(LoadingComponent, {
      imports: [CommonModule],
      declarations: [LoadingComponent],
      inputs,
    });
  }

  it('renders the loading text by default (showText && text)', () => {
    const fixture = render();
    expect(query(fixture, 'p.mj-loading-text')).not.toBeNull();
    expect(text(fixture, 'p.mj-loading-text')).toBe('Loading...');
  });

  it('renders custom text when `text` is set', () => {
    const fixture = render({ text: 'Please wait' });
    expect(text(fixture, 'p.mj-loading-text')).toBe('Please wait');
  });

  it('hides the text element when showText is false', () => {
    const fixture = render({ showText: false });
    expect(query(fixture, 'p.mj-loading-text')).toBeNull();
  });

  it('hides the text element when text is empty', () => {
    const fixture = render({ text: '' });
    expect(query(fixture, 'p.mj-loading-text')).toBeNull();
  });

  it('applies size and animation classes to the logo wrapper', () => {
    const fixture = render({ size: 'small', animation: 'spin' });
    expect(hasClass(fixture, '.mj-loading-logo', 'size-small')).toBe(true);
    expect(hasClass(fixture, '.mj-loading-logo', 'animation-spin')).toBe(true);
  });

  it('applies the animation-duration style to the logo wrapper', () => {
    const fixture = render({ animationDuration: 3 });
    const wrapper = query(fixture, '.mj-loading-logo') as HTMLElement;
    expect(wrapper.style.animationDuration).toBe('3s');
  });

  it('applies the text color style when textColor is set', () => {
    const fixture = render({ textColor: 'rgb(0, 128, 0)' });
    const p = query(fixture, 'p.mj-loading-text') as HTMLElement;
    expect(p.style.color).toBe('rgb(0, 128, 0)');
  });

  it('does NOT render the gradient <defs> when no logoGradient is provided', () => {
    const fixture = render();
    expect(query(fixture, 'defs linearGradient')).toBeNull();
  });

  it('renders the gradient <defs> with bound coordinates and stop-colors when logoGradient is set', () => {
    const fixture = render({
      logoGradient: { startColor: '#228B22', endColor: '#C41E3A', angle: 45 },
    });
    const grad = query(fixture, 'defs linearGradient');
    expect(grad).not.toBeNull();

    // gradientId is bound to the linearGradient id and the two paths' fill url().
    const id = attr(fixture, 'defs linearGradient', 'id');
    expect(id).toMatch(/^mj-logo-gradient-/);

    // At 45deg: x1=15%, y1=85%, x2=85%, y2=15% (per gradientCoords math).
    expect(attr(fixture, 'defs linearGradient', 'x1')).toBe('15%');
    expect(attr(fixture, 'defs linearGradient', 'y1')).toBe('85%');
    expect(attr(fixture, 'defs linearGradient', 'x2')).toBe('85%');
    expect(attr(fixture, 'defs linearGradient', 'y2')).toBe('15%');

    const stops = queryAll(fixture, 'defs linearGradient stop');
    expect(stops.length).toBe(2);
    expect(stops[0].getAttribute('stop-color')).toBe('#228B22');
    expect(stops[1].getAttribute('stop-color')).toBe('#C41E3A');
  });

  it('binds the logo fill to the gradient url when a gradient is present', () => {
    const fixture = render({
      logoGradient: { startColor: '#228B22', endColor: '#C41E3A' },
    });
    const id = attr(fixture, 'defs linearGradient', 'id');
    const path = query(fixture, 'svg path') as SVGPathElement;
    expect(path.style.fill).toBe(`url(#${id})`);
  });
});

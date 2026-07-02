import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJWordCloudComponent } from './word-cloud.component';
import { WordCloudItem, WordCloudItemEvent } from './word-cloud.types';

/**
 * DOM-level tests for <mj-word-cloud>.
 *
 * The component is a pure @Input/@Output standalone leaf that renders an <svg>
 * with one <text> node per laid-out item. It recomputes its layout in
 * ngOnChanges, so we drive inputs via fixture.componentRef.setInput(...) which
 * fires ngOnChanges the zoneless-correct way (see ANGULAR_TESTING_GUIDE §5).
 *
 * Assertions are derived directly from the template: the @for over LayoutItems,
 * [attr.viewBox], the [class.mj-word-cloud-animated]/[class.mj-word-cloud-interactive]
 * gating, the {{ item.Text }} interpolation, the [style.fill] color binding, and
 * the (click)/(mouseenter)/(mouseleave) -> @Output wiring (gated on Interactive).
 */

/** Two well-separated weights so collision detection never drops a word. */
const SAMPLE_ITEMS: WordCloudItem[] = [
  { Text: 'alpha', Weight: 1.0, Category: 'A' },
  { Text: 'beta', Weight: 0.5, Category: 'B' },
];

function renderWordCloud(
  setInputs: (fixture: ComponentFixture<MJWordCloudComponent>) => void = (f) => f.componentRef.setInput('Items', SAMPLE_ITEMS),
): ComponentFixture<MJWordCloudComponent> {
  const fixture = TestBed.createComponent(MJWordCloudComponent);
  setInputs(fixture);
  fixture.detectChanges();
  return fixture;
}

function textNodes(fixture: ComponentFixture<MJWordCloudComponent>): SVGTextElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('text.mj-word-cloud-item')) as SVGTextElement[];
}

describe('MJWordCloudComponent (DOM)', () => {
  describe('rendering the items', () => {
    it('renders one <text> node per item', () => {
      const fixture = renderWordCloud();
      expect(textNodes(fixture)).toHaveLength(2);
    });

    it('renders the item text content', () => {
      const fixture = renderWordCloud();
      const texts = textNodes(fixture).map((t) => t.textContent?.trim());
      expect(texts).toContain('alpha');
      expect(texts).toContain('beta');
    });

    it('renders no <text> nodes for an empty Items array', () => {
      const fixture = renderWordCloud((f) => f.componentRef.setInput('Items', []));
      expect(textNodes(fixture)).toHaveLength(0);
    });

    it('sets the svg viewBox from the computed layout', () => {
      const fixture = renderWordCloud();
      const svg = fixture.nativeElement.querySelector('svg.mj-word-cloud') as SVGSVGElement;
      // default viewBox for non-empty layouts is recomputed away from the placeholder
      expect(svg.getAttribute('viewBox')).toBe(fixture.componentInstance.ViewBox);
      expect(svg.getAttribute('viewBox')).not.toBe('0 0 100 100');
    });

    it('positions each <text> with x/y/font-size attributes', () => {
      const fixture = renderWordCloud();
      for (const node of textNodes(fixture)) {
        expect(node.getAttribute('x')).not.toBeNull();
        expect(node.getAttribute('y')).not.toBeNull();
        expect(node.getAttribute('font-size')).toMatch(/px$/);
      }
    });
  });

  describe('Animate gating', () => {
    it('adds .mj-word-cloud-animated on the svg when Animate is true', () => {
      const fixture = renderWordCloud((f) => {
        f.componentRef.setInput('Items', SAMPLE_ITEMS);
        f.componentRef.setInput('Animate', true);
      });
      const svg = fixture.nativeElement.querySelector('svg.mj-word-cloud') as SVGSVGElement;
      expect(svg.classList.contains('mj-word-cloud-animated')).toBe(true);
    });

    it('omits .mj-word-cloud-animated on the svg when Animate is false', () => {
      const fixture = renderWordCloud((f) => {
        f.componentRef.setInput('Items', SAMPLE_ITEMS);
        f.componentRef.setInput('Animate', false);
      });
      const svg = fixture.nativeElement.querySelector('svg.mj-word-cloud') as SVGSVGElement;
      expect(svg.classList.contains('mj-word-cloud-animated')).toBe(false);
    });
  });

  describe('Interactive gating', () => {
    it('adds .mj-word-cloud-interactive to each <text> when Interactive is true', () => {
      const fixture = renderWordCloud((f) => {
        f.componentRef.setInput('Items', SAMPLE_ITEMS);
        f.componentRef.setInput('Interactive', true);
      });
      for (const node of textNodes(fixture)) {
        expect(node.classList.contains('mj-word-cloud-interactive')).toBe(true);
      }
    });

    it('omits .mj-word-cloud-interactive from each <text> when Interactive is false', () => {
      const fixture = renderWordCloud((f) => {
        f.componentRef.setInput('Items', SAMPLE_ITEMS);
        f.componentRef.setInput('Interactive', false);
      });
      for (const node of textNodes(fixture)) {
        expect(node.classList.contains('mj-word-cloud-interactive')).toBe(false);
      }
    });
  });

  describe('color modes ([style.fill])', () => {
    it('uses the brand token for every word in brand mode', () => {
      const fixture = renderWordCloud((f) => {
        f.componentRef.setInput('Items', SAMPLE_ITEMS);
        f.componentRef.setInput('ColorMode', 'brand');
      });
      for (const node of textNodes(fixture)) {
        expect(node.style.fill).toBe('var(--mj-brand-primary)');
      }
    });

    it('assigns distinct palette colors per category in categorical mode', () => {
      const fixture = renderWordCloud((f) => {
        f.componentRef.setInput('Items', SAMPLE_ITEMS);
        f.componentRef.setInput('ColorMode', 'categorical');
      });
      const fills = textNodes(fixture).map((n) => n.style.fill);
      // two different categories -> two different palette entries
      expect(new Set(fills).size).toBe(2);
    });

    it('uses a color-mix() gradient in weight-gradient mode', () => {
      const fixture = renderWordCloud((f) => {
        f.componentRef.setInput('Items', SAMPLE_ITEMS);
        f.componentRef.setInput('ColorMode', 'weight-gradient');
      });
      for (const node of textNodes(fixture)) {
        expect(node.style.fill).toContain('color-mix');
      }
    });
  });

  describe('@Output emission on DOM events', () => {
    it('emits ItemClick with the clicked item when Interactive', () => {
      const fixture = renderWordCloud();
      const spy = vi.fn();
      fixture.componentInstance.ItemClick.subscribe((e: WordCloudItemEvent) => spy(e));

      textNodes(fixture)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(spy).toHaveBeenCalledTimes(1);
      const payload = spy.mock.calls[0][0] as WordCloudItemEvent;
      expect(payload.Item.Text).toBe(fixture.componentInstance.LayoutItems[0].Text);
      expect(payload.Event).toBeInstanceOf(MouseEvent);
    });

    it('emits ItemHover on mouseenter and ItemLeave on mouseleave', () => {
      const fixture = renderWordCloud();
      const hover = vi.fn();
      const leave = vi.fn();
      fixture.componentInstance.ItemHover.subscribe(hover);
      fixture.componentInstance.ItemLeave.subscribe(leave);

      const node = textNodes(fixture)[0];
      node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      expect(hover).toHaveBeenCalledTimes(1);
      expect(leave).toHaveBeenCalledTimes(1);
    });

    it('does NOT emit ItemClick when Interactive is false', () => {
      const fixture = renderWordCloud((f) => {
        f.componentRef.setInput('Items', SAMPLE_ITEMS);
        f.componentRef.setInput('Interactive', false);
      });
      const spy = vi.fn();
      fixture.componentInstance.ItemClick.subscribe(spy);

      textNodes(fixture)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(spy).not.toHaveBeenCalled();
    });
  });
});

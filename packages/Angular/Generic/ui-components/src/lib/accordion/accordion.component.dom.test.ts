import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJAccordionPanelComponent } from './accordion.component';

/**
 * DOM-level spec for `<mj-accordion-panel>`. Focuses on the WAI-ARIA accordion
 * contract that only exists in the rendered template:
 * - the header is a real `<button>` with `aria-expanded`
 * - the header and the body region are programmatically associated
 *   (`aria-controls` ↔ body `id`, body `aria-labelledby` ↔ header `id`)
 * - the collapsed body is `inert` (removed from tab order + a11y tree)
 * - clicking toggles state and emits
 *
 * Zoneless note: change detection is driven explicitly with
 * `fixture.detectChanges()`; programmatic state is set via `setInput` so the
 * view is marked dirty the zoneless-correct way. See guides/ANGULAR_TESTING_GUIDE.md.
 */
describe('MJAccordionPanelComponent (DOM)', () => {
  function headerOf(fixture: ComponentFixture<MJAccordionPanelComponent>): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button.mj-accordion-header') as HTMLButtonElement;
  }
  function regionOf(fixture: ComponentFixture<MJAccordionPanelComponent>): HTMLElement {
    return fixture.nativeElement.querySelector('.mj-accordion-body[role="region"]') as HTMLElement;
  }
  function bodyOuterOf(fixture: ComponentFixture<MJAccordionPanelComponent>): HTMLElement {
    return fixture.nativeElement.querySelector('.mj-accordion-body-outer') as HTMLElement;
  }

  function render(): ComponentFixture<MJAccordionPanelComponent> {
    const fixture = TestBed.createComponent(MJAccordionPanelComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the header as a button with aria-expanded reflecting Expanded (collapsed by default)', () => {
    const fixture = render();
    const header = headerOf(fixture);
    expect(header).not.toBeNull();
    expect(header.getAttribute('type')).toBe('button');
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('associates the header and body region via aria-controls ↔ id ↔ aria-labelledby', () => {
    const fixture = render();
    const header = headerOf(fixture);
    const region = regionOf(fixture);

    const headerId = header.getAttribute('id');
    const bodyId = region.getAttribute('id');

    expect(headerId).toBeTruthy();
    expect(bodyId).toBeTruthy();
    // header points at the body, body is labelled by the header
    expect(header.getAttribute('aria-controls')).toBe(bodyId);
    expect(region.getAttribute('aria-labelledby')).toBe(headerId);
  });

  it('marks the collapsed body inert, and clears inert when expanded', () => {
    const fixture = render();
    // collapsed by default → inert attribute present (empty string)
    expect(bodyOuterOf(fixture).getAttribute('inert')).toBe('');

    fixture.componentRef.setInput('Expanded', true);
    fixture.detectChanges();
    expect(bodyOuterOf(fixture).getAttribute('inert')).toBeNull();
  });

  it('toggles Expanded, aria-expanded and emits ExpandedChange when the header is clicked', () => {
    const fixture = render();
    const header = headerOf(fixture);
    let emitted: boolean | undefined;
    fixture.componentInstance.ExpandedChange.subscribe((v: boolean) => (emitted = v));

    header.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.Expanded).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(emitted).toBe(true);
  });

  it('does not toggle when Disabled', () => {
    const fixture = TestBed.createComponent(MJAccordionPanelComponent);
    fixture.componentRef.setInput('Disabled', true);
    fixture.detectChanges();
    const header = headerOf(fixture);

    expect(header.disabled).toBe(true);
    header.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.Expanded).toBe(false);
  });

  it('generates unique header/body ids per instance so multiple panels do not collide', () => {
    const a = render();
    const b = render();
    expect(headerOf(a).getAttribute('id')).not.toBe(headerOf(b).getAttribute('id'));
    expect(regionOf(a).getAttribute('id')).not.toBe(regionOf(b).getAttribute('id'));
  });
});

import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJAccordionPanelComponent, MJAccordionActionsDirective } from './accordion.component';

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

  it('applies the density / bare / flush-body modifier classes from inputs', () => {
    const fixture = TestBed.createComponent(MJAccordionPanelComponent);
    fixture.componentRef.setInput('Size', 'sm');
    fixture.componentRef.setInput('Bare', true);
    fixture.componentRef.setInput('FlushBody', true);
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.mj-accordion-panel') as HTMLElement;
    expect(panel.classList.contains('mj-accordion-panel--sm')).toBe(true);
    expect(panel.classList.contains('mj-accordion-panel--bare')).toBe(true);
    expect(panel.classList.contains('mj-accordion-panel--flush-body')).toBe(true);
  });

  it('applies the fill modifier class, and activates the host fill class only while expanded', () => {
    const fixture = TestBed.createComponent(MJAccordionPanelComponent);
    fixture.componentRef.setInput('Fill', true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector('.mj-accordion-panel') as HTMLElement;

    // inner panel always carries the fill modifier when Fill is set
    expect(panel.classList.contains('mj-accordion-panel--fill')).toBe(true);
    // but a COLLAPSED fill panel must NOT claim flex space (no host fill-active class)
    expect(host.classList.contains('mj-accordion-fill-active')).toBe(false);

    fixture.componentRef.setInput('Expanded', true);
    fixture.detectChanges();
    // expanded → host claims the leftover height
    expect(host.classList.contains('mj-accordion-fill-active')).toBe(true);
  });

  it('does not render an actions region when no mjAccordionActions template is projected', () => {
    const fixture = render();
    expect(fixture.nativeElement.querySelector('.mj-accordion-actions')).toBeNull();
  });
});

/**
 * Header-actions slot needs content projection, so it's exercised through a host
 * component. Proves the projected actions render in `.mj-accordion-actions` and —
 * critically for a11y — as a SIBLING of the toggle `<button>`, never inside it.
 */
describe('MJAccordionPanelComponent header actions slot (DOM)', () => {
  it('projects mjAccordionActions beside (not inside) the toggle button', () => {
    @Component({
      standalone: true,
      imports: [MJAccordionPanelComponent, MJAccordionActionsDirective],
      template: `
        <mj-accordion-panel Title="Connection">
          <ng-template mjAccordionActions>
            <button class="host-edit-btn" type="button">edit</button>
          </ng-template>
          <p>body</p>
        </mj-accordion-panel>
      `,
    })
    class HostComponent {}

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const actions = fixture.nativeElement.querySelector('.mj-accordion-actions') as HTMLElement;
    const toggle = fixture.nativeElement.querySelector('button.mj-accordion-header') as HTMLButtonElement;
    const editBtn = fixture.nativeElement.querySelector('.host-edit-btn') as HTMLButtonElement;

    expect(actions).not.toBeNull();
    expect(editBtn).not.toBeNull();
    // the action button is inside .mj-accordion-actions ...
    expect(actions.contains(editBtn)).toBe(true);
    // ... and NOT inside the toggle button (no button-in-button)
    expect(toggle.contains(editBtn)).toBe(false);
  });
});

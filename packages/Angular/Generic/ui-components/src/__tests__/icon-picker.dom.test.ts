import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, click } from '@memberjunction/ng-test-utils';
import { MjIconPickerComponent } from '../lib/icon-picker/icon-picker.component';
import { IconCatalogueService } from '../lib/icon-picker/icon-catalogue.service';
import type { FontAwesomeIcon } from '../lib/icon-picker/font-awesome-icons';

/**
 * A catalogue the test controls, so the assertions do not depend on which Font Awesome
 * the test environment happens to have loaded — in jsdom, none of it.
 */
const ICONS: FontAwesomeIcon[] = [
  { Name: 'chart-column', Style: 'fa-solid' },
  { Name: 'chart-line', Style: 'fa-solid' },
  { Name: 'star', Style: 'fa-regular' },
  { Name: 'github', Style: 'fa-brands' },
];

class StubCatalogue {
  public Icons(): readonly FontAwesomeIcon[] { return ICONS; }
  public IsFallback(): boolean { return false; }
  public Forget(): void { /* nothing memoized */ }
}

/**
 * Typing a Font Awesome class is not something to ask of a user: the name must be recalled
 * exactly, and a name without its style class renders nothing — which looks like a broken
 * panel. These cover the two halves of the answer: browsing, and repairing what is typed.
 */
function render(inputs: Record<string, unknown> = {}) {
  return renderComponentFixture(MjIconPickerComponent, {
    imports: [MjIconPickerComponent],
    providers: [{ provide: IconCatalogueService, useClass: StubCatalogue }],
    inputs,
  });
}

/** The overlay attaches to the body, so it is found there rather than in the fixture. */
function overlay(): HTMLElement | null {
  return document.querySelector('.mj-iconpick-pop');
}

function cells(): HTMLElement[] {
  return Array.from(overlay()?.querySelectorAll('.mj-iconpick-cell') ?? []);
}

describe('MjIconPickerComponent (DOM)', () => {
  it('shows the icon it was given', () => {
    const f = render({ Value: 'fa-solid fa-star' });
    expect(query(f, '.mj-iconpick-preview i')?.classList).toContain('fa-star');
  });

  it('completes a bare name typed into the box', () => {
    const f = render({ Value: '' });
    let emitted = '';
    f.componentInstance.ValueChange.subscribe((v: string) => { emitted = v; });
    f.componentInstance.OnTextChanged('fa-chart-column');
    expect(emitted).toBe('fa-solid fa-chart-column');
  });

  it('previews what the completed value will be while typing', () => {
    const f = render({ Value: '' });
    f.componentInstance.OnTextChanged('chart-column');
    f.detectChanges();
    const preview = query(f, '.mj-iconpick-preview i');
    expect(preview?.classList).toContain('fa-solid');
    expect(preview?.classList).toContain('fa-chart-column');
  });

  it('opens a grid of icons to choose from', () => {
    const f = render({ Value: '' });
    expect(overlay()).toBeNull();
    click(f, '.mj-iconpick-browse');
    f.detectChanges();
    expect(overlay()).not.toBeNull();
    expect(cells().length).toBeGreaterThan(0);
  });

  it('opens outside the field, so it cannot widen the form around it', () => {
    const f = render({ Value: '' });
    click(f, '.mj-iconpick-browse');
    f.detectChanges();
    // In an overlay attached to the body — nothing inside the host element.
    expect(query(f, '.mj-iconpick-pop')).toBeNull();
    expect(overlay()).not.toBeNull();
  });

  it('draws each icon in the style that actually has its glyph', () => {
    const f = render({ Value: '' });
    f.componentInstance.Toggle();
    f.detectChanges();
    const classes = cells().map((b) => b.querySelector('i')?.className);
    expect(classes).toContain('fa-brands fa-github');
    expect(classes).toContain('fa-regular fa-star');
  });

  it('writes the chosen icon in its own style, not the field default, and closes', () => {
    const f = render({ Value: '' });
    let emitted = '';
    f.componentInstance.ValueChange.subscribe((v: string) => { emitted = v; });
    f.componentInstance.Choose({ Name: 'github', Style: 'fa-brands' });
    f.detectChanges();
    expect(emitted).toBe('fa-brands fa-github');
    expect(f.componentInstance.IsOpen).toBe(false);
  });

  it('narrows the grid as the user searches', () => {
    const f = render({ Value: '' });
    f.componentInstance.Toggle();
    f.componentInstance.Search = 'chart';
    f.detectChanges();
    const labels = cells().map((b) => b.getAttribute('aria-label'));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => (l ?? '').includes('chart'))).toBe(true);
  });

  it('says so when nothing matches, rather than showing an empty grid', () => {
    const f = render({ Value: '' });
    f.componentInstance.Toggle();
    f.componentInstance.Search = 'zzzznotanicon';
    f.detectChanges();
    expect(overlay()?.querySelector('.mj-iconpick-empty')).not.toBeNull();
  });

  it('clears the icon, because a panel with none is a normal thing to want', () => {
    const f = render({ Value: 'fa-solid fa-star' });
    let emitted: string | null = null;
    f.componentInstance.ValueChange.subscribe((v: string) => { emitted = v; });
    f.componentInstance.Clear();
    expect(emitted).toBe('');
  });

  it('marks the current icon in the grid', () => {
    const f = render({ Value: 'fa-regular fa-star' });
    f.componentInstance.Toggle();
    f.componentInstance.Search = 'star';
    f.detectChanges();
    const selected = cells().filter((b) => b.classList.contains('is-on'))
      .map((b) => b.getAttribute('aria-label'));
    expect(selected).toContain('star');
  });
});

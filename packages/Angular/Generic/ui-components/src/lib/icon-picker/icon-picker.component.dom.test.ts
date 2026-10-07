import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderComponentFixture, query, click } from '@memberjunction/ng-test-utils';
import { MjIconPickerComponent } from './icon-picker.component';
import { IconCatalogueService } from './icon-catalogue.service';
import { ICON_RESULT_LIMIT, type FontAwesomeIcon } from './font-awesome-icons';

/**
 * A catalogue the test controls, so the assertions do not depend on which Font Awesome
 * the test environment happens to have loaded — in jsdom, none of it.
 */
const ICONS: FontAwesomeIcon[] = [
  { Name: 'chart-column', Style: 'fa-solid' },
  { Name: 'chart-line', Style: 'fa-solid' },
  { Name: 'star', Style: 'fa-regular' },
];

/** What the stub catalogue serves. A test may swap it before rendering. */
let catalogue: FontAwesomeIcon[] = ICONS;

beforeEach(() => { catalogue = ICONS; });

class StubCatalogue {
  public async Load(): Promise<readonly FontAwesomeIcon[]> { return catalogue; }
  public Icons(): readonly FontAwesomeIcon[] { return catalogue; }
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
    // Angular does not guarantee the order of a bound class attribute, so membership.
    const styleOf = (name: string): DOMTokenList | undefined =>
      cells().find((b) => b.getAttribute('aria-label') === name)?.querySelector('i')?.classList;
    expect(styleOf('star')).toContain('fa-regular');
    expect(styleOf('chart-column')).toContain('fa-solid');
  });

  it('writes the chosen icon in its own style, not the field default, and closes', () => {
    const f = render({ Value: '' });
    let emitted = '';
    f.componentInstance.ValueChange.subscribe((v: string) => { emitted = v; });
    f.componentInstance.Choose({ Name: 'star', Style: 'fa-regular' });
    f.detectChanges();
    expect(emitted).toBe('fa-regular fa-star');
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

  it('marks the current icon when it was stored under one of its aliases', () => {
    catalogue = [{ Name: 'house', Style: 'fa-solid', Aliases: ['home'] }];
    const f = render({ Value: 'fa-solid fa-home' });
    f.componentInstance.Toggle();
    f.detectChanges();
    const selected = cells().filter((b) => b.classList.contains('is-on'))
      .map((b) => b.getAttribute('aria-label'));
    expect(selected).toEqual(['house']);
  });
});

/**
 * The grid draws a limited number of icons. Without saying so, a user who scrolls to the end
 * of the grid concludes the icon they want does not exist.
 */
describe('MjIconPickerComponent (DOM) — more matches than the grid draws', () => {
  const many = (count: number): FontAwesomeIcon[] =>
    Array.from({ length: count }, (_, i) => ({ Name: `icon-${i}`, Style: 'fa-solid' }));

  it('says how many icons match and that typing narrows them', () => {
    catalogue = many(ICON_RESULT_LIMIT + 60);
    const f = render({ Value: '' });
    f.componentInstance.Toggle();
    f.detectChanges();
    expect(cells()).toHaveLength(ICON_RESULT_LIMIT);
    const note = overlay()?.querySelector('[role="status"]')?.textContent ?? '';
    expect(note).toContain(`Showing ${ICON_RESULT_LIMIT} of ${ICON_RESULT_LIMIT + 60} icons`);
    expect(note).toContain('Type to narrow');
  });

  it('empties the same status line once the matches fit, rather than removing it', () => {
    catalogue = many(ICON_RESULT_LIMIT + 60);
    const f = render({ Value: '' });
    f.componentInstance.Toggle();
    f.detectChanges();
    const status = overlay()?.querySelector('[role="status"]');
    expect(status?.textContent).toContain('Showing');
    f.componentInstance.Search = 'icon-29';
    f.detectChanges();
    expect(f.componentInstance.IsCapped).toBe(false);
    expect(overlay()?.querySelector('[role="status"]')).toBe(status);
    expect(status?.textContent?.trim()).toBe('');
  });
});

describe('MjIconPickerComponent (DOM) — touched state and focus', () => {
  it('marks the control touched when an icon is chosen from the grid', () => {
    const f = render({ Value: '' });
    const touched = vi.fn();
    f.componentInstance.registerOnTouched(touched);
    f.componentInstance.Toggle();
    f.detectChanges();
    f.componentInstance.Choose({ Name: 'star', Style: 'fa-regular' });
    expect(touched).toHaveBeenCalledTimes(1);
  });

  it('puts focus back on the browse button when an icon is chosen', () => {
    const f = render({ Value: '' });
    click(f, '.mj-iconpick-browse');
    f.detectChanges();
    f.componentInstance.Choose({ Name: 'star', Style: 'fa-regular' });
    expect(document.activeElement).toBe(query(f, '.mj-iconpick-browse'));
  });

  it('puts focus back on the browse button when the grid closes without a choice', () => {
    const f = render({ Value: '' });
    click(f, '.mj-iconpick-browse');
    f.detectChanges();
    (overlay()?.querySelector('.mj-iconpick-search') as HTMLInputElement).focus();
    f.componentInstance.Close();
    expect(document.activeElement).toBe(query(f, '.mj-iconpick-browse'));
  });
});

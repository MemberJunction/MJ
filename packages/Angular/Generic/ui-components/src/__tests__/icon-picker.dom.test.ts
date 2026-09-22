import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, click } from '@memberjunction/ng-test-utils';
import { MjIconPickerComponent } from '../lib/icon-picker/icon-picker.component';

/**
 * Typing a Font Awesome class is not something to ask of a user: the name must be recalled
 * exactly, and a name without its style class renders nothing — which looks like a broken
 * panel. These cover the two halves of the answer: browsing, and repairing what is typed.
 */
function render(inputs: Record<string, unknown> = {}) {
  return renderComponentFixture(MjIconPickerComponent, {
    imports: [MjIconPickerComponent],
    inputs,
  });
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
    expect(query(f, '.mj-iconpick-pop')).toBeNull();
    click(f, '.mj-iconpick-browse');
    f.detectChanges();
    expect(query(f, '.mj-iconpick-pop')).not.toBeNull();
    expect(queryAll(f, '.mj-iconpick-cell').length).toBeGreaterThan(0);
  });

  it('writes a complete class when one is chosen, and closes', () => {
    const f = render({ Value: '' });
    let emitted = '';
    f.componentInstance.ValueChange.subscribe((v: string) => { emitted = v; });
    f.componentInstance.Choose('chart-column');
    f.detectChanges();
    expect(emitted).toBe('fa-solid fa-chart-column');
    expect(f.componentInstance.IsOpen).toBe(false);
  });

  it('narrows the grid as the user searches', () => {
    const f = render({ Value: '' });
    f.componentInstance.Toggle();
    f.componentInstance.Search = 'chart';
    f.detectChanges();
    const labels = queryAll(f, '.mj-iconpick-cell').map((b) => b.getAttribute('aria-label'));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => (l ?? '').includes('chart'))).toBe(true);
  });

  it('says so when nothing matches, rather than showing an empty grid', () => {
    const f = render({ Value: '' });
    f.componentInstance.Toggle();
    f.componentInstance.Search = 'zzzznotanicon';
    f.detectChanges();
    expect(query(f, '.mj-iconpick-empty')).not.toBeNull();
  });

  it('clears the icon, because a panel with none is a normal thing to want', () => {
    const f = render({ Value: 'fa-solid fa-star' });
    let emitted: string | null = null;
    f.componentInstance.ValueChange.subscribe((v: string) => { emitted = v; });
    f.componentInstance.Clear();
    expect(emitted).toBe('');
  });

  it('marks the current icon in the grid', () => {
    const f = render({ Value: 'fa-solid fa-star' });
    f.componentInstance.Toggle();
    f.componentInstance.Search = 'star';
    f.detectChanges();
    const selected = queryAll(f, '.mj-iconpick-cell.is-on').map((b) => b.getAttribute('aria-label'));
    expect(selected).toContain('star');
  });
});

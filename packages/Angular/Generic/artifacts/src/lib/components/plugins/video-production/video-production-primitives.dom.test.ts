import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { FormatVideoTime, FormatVideoTimeRange } from './video-time-format';
import { MJVideoFormatGlyphComponent } from './video-format-glyph.component';
import { MJVideoBeatStripComponent, VideoBeatStripItem } from './video-beat-strip.component';

describe('FormatVideoTime & FormatVideoTimeRange', () => {
  it('formats 0, 5, 45, 60, 90, and 3599 seconds as m:ss', () => {
    expect(FormatVideoTime(0)).toBe('0:00');
    expect(FormatVideoTime(5)).toBe('0:05');
    expect(FormatVideoTime(45)).toBe('0:45');
    expect(FormatVideoTime(60)).toBe('1:00');
    expect(FormatVideoTime(90)).toBe('1:30');
    expect(FormatVideoTime(3599)).toBe('59:59');
  });

  it('formats ranges using m:ss–m:ss', () => {
    expect(FormatVideoTimeRange(30, 90)).toBe('0:30–1:30');
    expect(FormatVideoTimeRange(5, 45)).toBe('0:05–0:45');
  });
});

describe('MJVideoFormatGlyphComponent (DOM)', () => {
  it('computes proportional box dimensions for 16:9, 9:16, 1:1, and 4:5, and shows label only for unparseable formats ("bad")', () => {
    const validCases: { format: string; expectedRatioGreater: 'w' | 'h' | 'equal' }[] = [
      { format: '16:9', expectedRatioGreater: 'w' },
      { format: '9:16', expectedRatioGreater: 'h' },
      { format: '1:1', expectedRatioGreater: 'equal' },
      { format: '4:5', expectedRatioGreater: 'h' },
    ];

    for (const c of validCases) {
      const fixture = renderComponentFixture(MJVideoFormatGlyphComponent, {
        inputs: {
          Format: c.format,
          Size: 'md',
          ShowLabel: true,
        },
      });
      const box = query(fixture, '.vp-format-glyph__box');
      expect(box).not.toBeNull();
      const width = Number.parseFloat(box!.style.width);
      const height = Number.parseFloat(box!.style.height);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);

      if (c.expectedRatioGreater === 'w') {
        expect(width).toBeGreaterThan(height);
      } else if (c.expectedRatioGreater === 'h') {
        expect(height).toBeGreaterThan(width);
      } else {
        expect(width).toBe(height);
      }
      expect(text(fixture, '.vp-format-glyph__label')).toBe(c.format);
    }

    const badFixture = renderComponentFixture(MJVideoFormatGlyphComponent, {
      inputs: {
        Format: 'bad',
        Size: 'sm',
        ShowLabel: false,
      },
    });
    expect(query(badFixture, '.vp-format-glyph__box')).toBeNull();
    expect(text(badFixture, '.vp-format-glyph__label')).toBe('bad');
  });
});

describe('MJVideoBeatStripComponent (DOM)', () => {
  const sampleBeats: VideoBeatStripItem[] = [
    { Key: 'hook', Label: 'Hook', Seconds: 10, Detail: 'Open on the headline metric.' },
    { Key: 'proof', Label: 'Proof', Seconds: 20 },
    { Key: 'cta', Label: 'CTA', Seconds: 10 },
  ];

  it('renders beat list items with widths proportional to seconds, native button elements with accessible aria-label, and emits BeatPicked on click', () => {
    const fixture = renderComponentFixture(MJVideoBeatStripComponent, {
      inputs: {
        Beats: sampleBeats,
        ActiveKey: 'proof',
        ShowLabels: true,
      },
    });

    const items = queryAll(fixture, 'li.vp-beat-strip__item');
    const blocks = queryAll(fixture, 'button.vp-beat-strip__block');
    expect(items.length).toBe(3);
    expect(blocks.length).toBe(3);

    expect(items[0].style.width).toBe('25%');
    expect(items[1].style.width).toBe('50%');
    expect(items[2].style.width).toBe('25%');

    expect(blocks[0].getAttribute('type')).toBe('button');
    expect(blocks[0].getAttribute('aria-label')).toBe(
      'Hook \u00B7 0:00\u20130:10 \u00B7 Open on the headline metric.',
    );
    expect(blocks[1].getAttribute('aria-label')).toBe('Proof \u00B7 0:10\u20130:30');
    expect(blocks[2].getAttribute('aria-label')).toBe('CTA \u00B7 0:30\u20130:40');
    expect(blocks[1].classList.contains('vp-beat-strip__block--active')).toBe(true);
    expect(text(fixture, '[data-testid="beat-strip-total"]')).toBe('0:40');

    const pickedSpy = vi.fn();
    fixture.componentInstance.BeatPicked.subscribe(pickedSpy);

    (blocks[2] as HTMLButtonElement).click();
    expect(pickedSpy).toHaveBeenCalledWith('cta');
  });
});

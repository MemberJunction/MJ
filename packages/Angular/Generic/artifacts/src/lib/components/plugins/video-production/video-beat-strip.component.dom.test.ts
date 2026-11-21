import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MJVideoBeatStripComponent } from './video-beat-strip.component';
import { FormatVideoTime, FormatVideoTimeRange } from './video-time-format';

describe('MJVideoBeatStripComponent (DOM)', () => {
  it('renders proportional beat blocks, active state, aria-label, and tabular total time', () => {
    TestBed.configureTestingModule({ imports: [MJVideoBeatStripComponent] });
    const fixture = TestBed.createComponent(MJVideoBeatStripComponent);
    fixture.componentRef.setInput('Beats', [
      { Key: 'hook', Label: 'Hook', Seconds: 15, Detail: 'Bold claim' },
      { Key: 'proof', Label: 'Proof', Seconds: 30, Detail: 'Metric reveal' },
      { Key: 'cta', Label: 'CTA', Seconds: 15 },
    ]);
    fixture.componentRef.setInput('ShowLabels', true);
    fixture.componentRef.setInput('ActiveKey', 'proof');
    fixture.detectChanges();

    const strip = fixture.nativeElement.querySelector('.vp-beat-strip') as HTMLElement | null;
    expect(strip).toBeTruthy();

    const track = fixture.nativeElement.querySelector('.vp-beat-strip__track') as HTMLElement | null;
    expect(track?.getAttribute('role')).toBe('list');

    const items = fixture.nativeElement.querySelectorAll('.vp-beat-strip__item');
    expect(items.length).toBe(3);

    const blocks = fixture.nativeElement.querySelectorAll('.vp-beat-strip__block');
    expect(blocks.length).toBe(3);

    const hookBtn = blocks[0] as HTMLButtonElement;
    const proofBtn = blocks[1] as HTMLButtonElement;
    expect(hookBtn.getAttribute('aria-label')).toBe('Hook \u00B7 0:00\u20130:15 \u00B7 Bold claim');
    expect(hookBtn.querySelector('.vp-beat-strip__label')?.textContent?.trim()).toBe('Hook');
    expect(proofBtn.classList.contains('vp-beat-strip__block--active')).toBe(true);
    expect(hookBtn.classList.contains('vp-beat-strip__block--active')).toBe(false);

    const total = fixture.nativeElement.querySelector(
      '.vp-beat-strip__total[data-testid="beat-strip-total"]',
    ) as HTMLElement | null;
    expect(total?.textContent?.trim()).toBe('1:00');
  });

  it('emits BeatPicked when a beat block is clicked and hides inner labels when ShowLabels is false', () => {
    TestBed.configureTestingModule({ imports: [MJVideoBeatStripComponent] });
    const fixture = TestBed.createComponent(MJVideoBeatStripComponent);
    fixture.componentRef.setInput('Beats', [
      { Key: 'hook', Label: 'Hook', Seconds: 10 },
      { Key: 'cta', Label: 'CTA', Seconds: 20 },
    ]);
    fixture.componentRef.setInput('ShowLabels', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.vp-beat-strip__label').length).toBe(0);

    const pickedSpy = vi.fn();
    fixture.componentInstance.BeatPicked.subscribe(pickedSpy);

    const blocks = fixture.nativeElement.querySelectorAll('.vp-beat-strip__block');
    (blocks[1] as HTMLButtonElement).click();
    expect(pickedSpy).toHaveBeenCalledWith('cta');
  });

  it('formats tabular video durations and ranges via FormatVideoTime and FormatVideoTimeRange', () => {
    expect(FormatVideoTime(0)).toBe('0:00');
    expect(FormatVideoTime(8)).toBe('0:08');
    expect(FormatVideoTime(45)).toBe('0:45');
    expect(FormatVideoTime(90)).toBe('1:30');
    expect(FormatVideoTime(-5)).toBe('0:00');
    expect(FormatVideoTimeRange(0, 8)).toBe('0:00\u20130:08');
    expect(FormatVideoTimeRange(8, 22)).toBe('0:08\u20130:22');
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MJVideoFormatGlyphComponent } from './video-format-glyph.component';

describe('MJVideoFormatGlyphComponent (DOM)', () => {
  it('renders proportional aspect-ratio boxes for 16:9, 9:16, 1:1, and 4:5 at sm and md sizes', () => {
    TestBed.configureTestingModule({ imports: [MJVideoFormatGlyphComponent] });
    const fixture = TestBed.createComponent(MJVideoFormatGlyphComponent);

    fixture.componentRef.setInput('Format', '16:9');
    fixture.componentRef.setInput('Size', 'sm');
    fixture.componentRef.setInput('ShowLabel', true);
    fixture.detectChanges();

    const root = fixture.nativeElement.querySelector('.vp-format-glyph') as HTMLElement | null;
    expect(root?.getAttribute('data-size')).toBe('sm');
    expect(root?.getAttribute('data-format')).toBe('16:9');

    const box16x9 = fixture.nativeElement.querySelector('.vp-format-glyph__box') as HTMLElement | null;
    expect(box16x9).toBeTruthy();
    expect(box16x9?.style.width).toBe('14px');
    expect(Number.parseFloat(box16x9?.style.height ?? '0')).toBeCloseTo(7.88, 1);
    expect(
      fixture.nativeElement.querySelector('.vp-format-glyph__label')?.textContent?.trim(),
    ).toBe('16:9');

    fixture.componentRef.setInput('Format', '9:16');
    fixture.componentRef.setInput('Size', 'md');
    fixture.detectChanges();
    const box9x16 = fixture.nativeElement.querySelector('.vp-format-glyph__box') as HTMLElement | null;
    expect(box9x16?.style.height).toBe('20px');
    expect(Number.parseFloat(box9x16?.style.width ?? '0')).toBeCloseTo(11.25, 1);

    fixture.componentRef.setInput('Format', '1:1');
    fixture.componentRef.setInput('Size', 'sm');
    fixture.detectChanges();
    const box1x1 = fixture.nativeElement.querySelector('.vp-format-glyph__box') as HTMLElement | null;
    expect(box1x1?.style.width).toBe('14px');
    expect(box1x1?.style.height).toBe('14px');

    fixture.componentRef.setInput('Format', '4:5');
    fixture.detectChanges();
    const box4x5 = fixture.nativeElement.querySelector('.vp-format-glyph__box') as HTMLElement | null;
    expect(box4x5?.style.height).toBe('14px');
    expect(Number.parseFloat(box4x5?.style.width ?? '0')).toBeCloseTo(11.2, 1);
  });

  it('hides the label when ShowLabel is false for a valid aspect ratio', () => {
    TestBed.configureTestingModule({ imports: [MJVideoFormatGlyphComponent] });
    const fixture = TestBed.createComponent(MJVideoFormatGlyphComponent);
    fixture.componentRef.setInput('Format', '16:9');
    fixture.componentRef.setInput('ShowLabel', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.vp-format-glyph__box')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.vp-format-glyph__label')).toBeNull();
  });

  it('falls back to label-only when Format is unparseable', () => {
    TestBed.configureTestingModule({ imports: [MJVideoFormatGlyphComponent] });
    const fixture = TestBed.createComponent(MJVideoFormatGlyphComponent);
    fixture.componentRef.setInput('Format', 'custom-widescreen');
    fixture.componentRef.setInput('ShowLabel', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.vp-format-glyph__box')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.vp-format-glyph__label')?.textContent?.trim(),
    ).toBe('custom-widescreen');
  });
});

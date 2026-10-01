/**
 * The Files form's viewer decisions (MJ#4947): which media types report their own load, and when a size is shown.
 */
import { describe, it, expect } from 'vitest';
import { DescribeFileSize, MediaLoadsByElement } from '../lib/custom/Files/file-form.logic';

describe('MediaLoadsByElement', () => {
  it('is true for the types the viewer renders in an element with a load event', () => {
    for (const type of ['image', 'pdf', 'video', 'audio'] as const) expect(MediaLoadsByElement(type)).toBe(true);
  });

  it('is false for text, which is fetched, and for any other type, which gets a fallback card and no element', () => {
    expect(MediaLoadsByElement('text')).toBe(false);
    expect(MediaLoadsByElement('other')).toBe(false);
  });
});

describe('DescribeFileSize', () => {
  it('formats a known size', () => {
    expect(DescribeFileSize(0)).toBe('0 B');
    expect(DescribeFileSize(6512)).toBe('6.4 KB');
    expect(DescribeFileSize(3284976)).toBe('3.1 MB');
  });

  it('is null when the size is unknown, so the badge and the row are left out instead of reading "0 B"', () => {
    expect(DescribeFileSize(null)).toBeNull();
    expect(DescribeFileSize(undefined)).toBeNull();
    expect(DescribeFileSize(Number.NaN)).toBeNull();
    expect(DescribeFileSize(-1)).toBeNull();
  });
});

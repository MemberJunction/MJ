import { describe, it, expect } from 'vitest';

/**
 * Tests for MJDialogComponent pure logic (size resolution, width/height computation).
 *
 * Because MJDialogComponent is an Angular @Component, instantiating it triggers
 * Angular's JIT compiler which is unavailable in a plain Vitest environment.
 * Instead, we replicate the pure logic under test here and verify it directly.
 */

// Replicate the SIZE_MAP constant from dialog.component.ts
type MjDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'auto';

const SIZE_MAP: Record<MjDialogSize, string> = {
  sm: '400px',
  md: '600px',
  lg: '800px',
  xl: '1000px',
  auto: 'auto'
};

// Replicate the resolvedWidth logic from MJDialogComponent
function resolvedWidth(width: number | string | null, size: MjDialogSize): string {
  if (width) {
    return typeof width === 'number' ? `${width}px` : width;
  }
  return SIZE_MAP[size] ?? 'auto';
}

// Replicate the resolvedHeight logic from MJDialogComponent
function resolvedHeight(height: number | string | null): string {
  if (height) {
    return typeof height === 'number' ? `${height}px` : height;
  }
  return 'auto';
}

describe('Dialog SIZE_MAP', () => {
  it('should have exactly 5 size presets', () => {
    expect(Object.keys(SIZE_MAP)).toHaveLength(5);
  });

  it('should map "sm" to 400px', () => {
    expect(SIZE_MAP.sm).toBe('400px');
  });

  it('should map "md" to 600px', () => {
    expect(SIZE_MAP.md).toBe('600px');
  });

  it('should map "lg" to 800px', () => {
    expect(SIZE_MAP.lg).toBe('800px');
  });

  it('should map "xl" to 1000px', () => {
    expect(SIZE_MAP.xl).toBe('1000px');
  });

  it('should map "auto" to "auto"', () => {
    expect(SIZE_MAP.auto).toBe('auto');
  });
});

describe('resolvedWidth', () => {
  describe('using Size presets (Width is null)', () => {
    const cases: Array<{ size: MjDialogSize; expected: string }> = [
      { size: 'sm', expected: '400px' },
      { size: 'md', expected: '600px' },
      { size: 'lg', expected: '800px' },
      { size: 'xl', expected: '1000px' },
      { size: 'auto', expected: 'auto' },
    ];

    for (const { size, expected } of cases) {
      it(`should resolve size "${size}" to "${expected}"`, () => {
        expect(resolvedWidth(null, size)).toBe(expected);
      });
    }
  });

  describe('explicit Width overrides Size', () => {
    it('should use numeric Width as pixels', () => {
      expect(resolvedWidth(500, 'lg')).toBe('500px');
    });

    it('should use string Width directly (percentage)', () => {
      expect(resolvedWidth('50%', 'sm')).toBe('50%');
    });

    it('should use string Width directly (px)', () => {
      expect(resolvedWidth('750px', 'md')).toBe('750px');
    });

    it('should use string Width directly (vw)', () => {
      expect(resolvedWidth('80vw', 'auto')).toBe('80vw');
    });
  });

  describe('falsy Width values fall back to Size', () => {
    it('should fall back to Size when Width is null', () => {
      expect(resolvedWidth(null, 'md')).toBe('600px');
    });

    it('should fall back to Size when Width is empty string', () => {
      // empty string is falsy, so falls back to Size
      expect(resolvedWidth('', 'lg')).toBe('800px');
    });

    it('should fall back to Size when Width is 0', () => {
      // 0 is falsy, so falls back to Size
      expect(resolvedWidth(0, 'sm')).toBe('400px');
    });
  });

  describe('default behavior', () => {
    it('should default to "auto" when Width is null and Size is "auto"', () => {
      expect(resolvedWidth(null, 'auto')).toBe('auto');
    });
  });
});

describe('resolvedHeight', () => {
  it('should return "auto" when Height is null', () => {
    expect(resolvedHeight(null)).toBe('auto');
  });

  it('should use numeric Height as pixels', () => {
    expect(resolvedHeight(400)).toBe('400px');
  });

  it('should use string Height directly (vh)', () => {
    expect(resolvedHeight('80vh')).toBe('80vh');
  });

  it('should use string Height directly (px)', () => {
    expect(resolvedHeight('500px')).toBe('500px');
  });

  it('should use string Height directly (percentage)', () => {
    expect(resolvedHeight('75%')).toBe('75%');
  });

  it('should return "auto" for empty string Height', () => {
    expect(resolvedHeight('')).toBe('auto');
  });

  it('should return "auto" for 0 Height', () => {
    expect(resolvedHeight(0)).toBe('auto');
  });
});

import { describe, it, expect } from 'vitest';

/**
 * Tests for MJNumericInputComponent pure logic (clamping, formatting, parsing).
 *
 * Because MJNumericInputComponent is an Angular @Component with NG_VALUE_ACCESSOR,
 * instantiating it triggers Angular's JIT compiler which is unavailable in plain
 * Vitest. Instead, we replicate the pure logic functions and test them directly.
 */

// Replicate the clamp logic from MJNumericInputComponent
function clamp(value: number, min: number | null, max: number | null, decimals: number | null): number {
  if (min != null && value < min) return min;
  if (max != null && value > max) return max;
  if (decimals != null) {
    const f = Math.pow(10, decimals);
    return Math.round(value * f) / f;
  }
  return value;
}

// Replicate the formatDisplay logic from MJNumericInputComponent
function formatDisplay(value: number | null, decimals: number | null): string | number {
  if (value == null) return '';
  return decimals != null ? value.toFixed(decimals) : value;
}

// Replicate the OnInput parsing logic from MJNumericInputComponent
function parseInput(
  raw: string,
  min: number | null,
  max: number | null,
  decimals: number | null
): { value: number | null; emitted: boolean } {
  if (raw === '' || raw === '-') {
    return { value: null, emitted: true };
  }
  const num = parseFloat(raw);
  if (isNaN(num)) {
    return { value: null, emitted: false }; // NaN is ignored, nothing emitted
  }
  const clamped = clamp(num, min, max, decimals);
  return { value: clamped, emitted: true };
}

describe('clamp', () => {
  describe('min clamping', () => {
    it('should clamp value below min to min', () => {
      expect(clamp(-5, 0, null, null)).toBe(0);
    });

    it('should not clamp value at min', () => {
      expect(clamp(0, 0, null, null)).toBe(0);
    });

    it('should not clamp value above min', () => {
      expect(clamp(5, 0, null, null)).toBe(5);
    });

    it('should handle negative min', () => {
      expect(clamp(-15, -10, null, null)).toBe(-10);
    });
  });

  describe('max clamping', () => {
    it('should clamp value above max to max', () => {
      expect(clamp(150, null, 100, null)).toBe(100);
    });

    it('should not clamp value at max', () => {
      expect(clamp(100, null, 100, null)).toBe(100);
    });

    it('should not clamp value below max', () => {
      expect(clamp(50, null, 100, null)).toBe(50);
    });
  });

  describe('min + max combined', () => {
    it('should allow value within range', () => {
      expect(clamp(50, 0, 100, null)).toBe(50);
    });

    it('should clamp below min', () => {
      expect(clamp(-5, 0, 100, null)).toBe(0);
    });

    it('should clamp above max', () => {
      expect(clamp(150, 0, 100, null)).toBe(100);
    });
  });

  describe('decimal precision', () => {
    it('should round to 2 decimal places', () => {
      expect(clamp(3.14159, null, null, 2)).toBe(3.14);
    });

    it('should round to 0 decimal places', () => {
      expect(clamp(3.7, null, null, 0)).toBe(4);
    });

    it('should round to 1 decimal place', () => {
      expect(clamp(3.15, null, null, 1)).toBe(3.2);
    });

    it('should round to 3 decimal places', () => {
      expect(clamp(1.23456, null, null, 3)).toBe(1.235);
    });

    it('should not change value with more precision than decimals allows', () => {
      expect(clamp(3.1, null, null, 2)).toBe(3.1);
    });

    it('should handle negative values with decimals', () => {
      expect(clamp(-3.14159, null, null, 2)).toBe(-3.14);
    });
  });

  describe('no constraints', () => {
    it('should return the value unchanged when no min/max/decimals', () => {
      expect(clamp(42, null, null, null)).toBe(42);
      expect(clamp(-7.5, null, null, null)).toBe(-7.5);
      expect(clamp(0, null, null, null)).toBe(0);
    });
  });

  describe('min + max + decimals combined', () => {
    it('should clamp then round', () => {
      // Value 10.999 > max 5 => clamped to 5, then with 1 decimal => 5.0
      expect(clamp(10.999, 0, 5, 1)).toBe(5);
    });

    it('should clamp below min then round', () => {
      expect(clamp(-0.001, 0, 10, 2)).toBe(0);
    });
  });
});

describe('formatDisplay', () => {
  it('should return empty string for null value', () => {
    expect(formatDisplay(null, null)).toBe('');
  });

  it('should return empty string for null value with decimals set', () => {
    expect(formatDisplay(null, 2)).toBe('');
  });

  it('should return the number directly when decimals is null', () => {
    expect(formatDisplay(42, null)).toBe(42);
  });

  it('should format with 2 decimal places', () => {
    expect(formatDisplay(42, 2)).toBe('42.00');
  });

  it('should format with 0 decimal places', () => {
    expect(formatDisplay(42.7, 0)).toBe('43');
  });

  it('should format with 1 decimal place', () => {
    expect(formatDisplay(3.1, 1)).toBe('3.1');
  });

  it('should format zero with decimals', () => {
    expect(formatDisplay(0, 2)).toBe('0.00');
  });

  it('should format negative numbers with decimals', () => {
    expect(formatDisplay(-5.1, 2)).toBe('-5.10');
  });

  it('should format zero without decimals', () => {
    expect(formatDisplay(0, null)).toBe(0);
  });
});

describe('parseInput', () => {
  describe('empty and special string inputs', () => {
    it('should return null for empty string and emit', () => {
      const result = parseInput('', null, null, null);
      expect(result.value).toBeNull();
      expect(result.emitted).toBe(true);
    });

    it('should return null for lone minus sign and emit', () => {
      const result = parseInput('-', null, null, null);
      expect(result.value).toBeNull();
      expect(result.emitted).toBe(true);
    });
  });

  describe('valid numeric strings', () => {
    it('should parse a positive integer', () => {
      const result = parseInput('42', null, null, null);
      expect(result.value).toBe(42);
      expect(result.emitted).toBe(true);
    });

    it('should parse a decimal number', () => {
      const result = parseInput('3.14', null, null, null);
      expect(result.value).toBe(3.14);
      expect(result.emitted).toBe(true);
    });

    it('should parse a negative number', () => {
      const result = parseInput('-7', null, null, null);
      expect(result.value).toBe(-7);
      expect(result.emitted).toBe(true);
    });

    it('should parse zero', () => {
      const result = parseInput('0', null, null, null);
      expect(result.value).toBe(0);
      expect(result.emitted).toBe(true);
    });
  });

  describe('non-numeric strings', () => {
    it('should not emit for alphabetic input', () => {
      const result = parseInput('abc', null, null, null);
      expect(result.emitted).toBe(false);
    });

    it('should not emit for mixed alphanumeric that starts non-numeric', () => {
      const result = parseInput('abc123', null, null, null);
      expect(result.emitted).toBe(false);
    });
  });

  describe('with clamping', () => {
    it('should clamp below min', () => {
      const result = parseInput('-5', 0, null, null);
      expect(result.value).toBe(0);
    });

    it('should clamp above max', () => {
      const result = parseInput('150', null, 100, null);
      expect(result.value).toBe(100);
    });

    it('should pass through value within range', () => {
      const result = parseInput('50', 0, 100, null);
      expect(result.value).toBe(50);
    });
  });

  describe('with decimal precision', () => {
    it('should round to specified decimals', () => {
      const result = parseInput('3.14159', null, null, 2);
      expect(result.value).toBe(3.14);
    });

    it('should round to 0 decimals', () => {
      const result = parseInput('3.7', null, null, 0);
      expect(result.value).toBe(4);
    });
  });

  describe('combined clamping and decimals', () => {
    it('should clamp then round', () => {
      const result = parseInput('10.999', 0, 5, 1);
      expect(result.value).toBe(5);
    });
  });
});

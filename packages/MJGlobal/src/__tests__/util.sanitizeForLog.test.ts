import { describe, it, expect } from 'vitest';
import { SanitizeForLog } from '../util';

describe('SanitizeForLog', () => {
  it('strips CR and LF so a value cannot forge a new log line', () => {
    expect(SanitizeForLog('user=bob\r\n[ERROR] forged entry\nmore')).toBe('user=bob[ERROR] forged entrymore');
  });

  it('caps the length of the value', () => {
    const out = SanitizeForLog('a'.repeat(50), 10);
    expect(out.startsWith('a'.repeat(10))).toBe(true);
    expect(out.length).toBeLessThan(50);
  });
});
